# PPU Mode-7 渲染管线研究：真实硬件 vs smk/js/mode7.js

_作者: ppu (rendering analyst) · 任务 t3_

> **证据分级说明**：本文区分三类内容——
> - ✅ **仓库实证**：来自 mk-main 文档/源码的直接证据（引用处标注文件与行号）。
> - 📖 **公开文档重构**：SNES PPU 硬件行为（Anomie regs.txt / Fullsnes 一类公共文档，
>   以及 snes9x/bsnes/LakeSnes 等模拟器一致实现的算法），属稳定共识，但本次未能
>   直接对照源码（原因见下）。
> - ❓ **待验证推断**：合理但未在本地证实的 SMK 细节，均单独标注并给出验证路径。
>
> **环境限制**：mk-main/ext/snesrecomp/ 是空目录（git submodule 未检出），LakeSnes 的
> snes/ppu.c 不在本机；沙箱无外网（SSL 被拒、web_search 无 API key）。因此 LakeSnes
> 代码只能引用 mode7_track_fix_plan.md:174-181 中已抄录的关键两行（那是从真实 fork
> 抄录的），其余按公开文档重构。

---

## 0. TL;DR

1. 真实 SMK 的 Mode 7 不是"逐像素透视采样器"，而是**逐扫描线的 2D 仿射变换**：PPU 每条线用一组 8.8 定点矩阵参数 A/B/C/D + 静态中心点 M7X/M7Y 做同一次固定公式采样；**透视感完全来自"每行矩阵不同"**，由 CPU(+DSP-1) 每帧构建 WRAM 参数表、再经 HDMA 逐行写入 $211B-$211E 实现。
2. SMK 同时用 HDMA 逐行切换 $2105(BGMODE)、$212C(TM 层开关)、$2126(窗口)——天空/HUD 区段跑普通分层模式，路面区段才切进 Mode 7。（✅ fix plan #5）
3. 我们的 mode7.js 是 vmbatlle/super-mario-kart-master C++ 版 map.cpp::mode7() 的移植：浮点、near/far 插值、RGBA 直采、边缘平铺。**视觉效果等价，数值行为与硬件不同**（无定点抖动、无 wrap/fill 语义、无调色板层）。
4. 最有价值的改进（P0）：把采样核心换成 **PPU-exact 定点仿射 + 逐行参数表**。这不仅提升还原度，还让 JS 渲染器能直接回放 recomp 项目 HDMA logger 抓到的真实矩阵表（tools/mesen/hw_logger.lua 已在记录 $211B-$2120）。

---

## 1. 真实管线

### 1.1 SNES PPU Mode 7 硬件模型 📖

Mode 7 = **单层可旋转/缩放纹理**，无 scroll 寄存器、无 tile 翻转属性、8bpp chunky。

**寄存器**（每帧由游戏写，或被 HDMA 逐行改写）：

| 寄存器 | 名称 | 格式 |
|---|---|---|
| $211A | M7SEL | bit0/1 = 屏幕 H/V 翻转；bit6 = char fill；bit7 = map fill |
| $211B | M7A | int16，**8.8 定点**缩放/旋转系数 |
| $211C | M7B | 同上 |
| $211D | M7C | 同上 |
| $211E | M7D | 同上 |
| $211F | M7X | **13 位有符号**中心点 X |
| $2120 | M7Y | 13 位有符号中心点 Y |

**逐像素公式**（各模拟器一致实现，Anomie 文档定义）：

    h  = x - CX ;  v = y - CY        // 屏幕坐标相对中心点（M7SEL 翻转位在此前对 h/v 取反）
    tx = (A*h + B*v) >> 8            // 有符号 32 位中间积，算术右移 8
    ty = (C*h + D*v) >> 8
    // 落图：
    if (tx,ty 在 0..1023 外):
        M7SEL.bit7=0 -> tx&=0x3FF; ty&=0x3FF      // wrap 回 1024x1024
        M7SEL.bit7=1 -> 整屏视为 "tile 0"
                        |- bit6=0 -> 正常画 tile 0 的字符数据
                        '- bit6=1 -> 透明（露出 backdrop 色）
    mapEntry  = vram[(ty>>3)*128 + (tx>>3)]          // 128x128 tile 表
    colorIdx  = vram[mapEntry低字节*64 + (ty&7)*8 + (tx&7)] 的高字节   // 8bpp chunky
    color     = cgram[colorIdx & 0x7F]               // BG1 只用 CGRAM $00-$7F

✅ 其中采样两行是仓库实证（LakeSnes ppu_getPixelForMode7，fix plan :177-178）：

    uint8_t tile  = ppu->vram[(yPos>>3)*128 + (xPos>>3)] & 0xff;     // map  = LOW byte
    uint8_t pixel = ppu->vram[tile*64 + (yPos&7)*8 + (xPos&7)] >> 8; // char = HIGH byte

要点：
- **VRAM 字布局**：Mode 7 的 map+char 占 VRAM $0000-$3FFF；map 条目用**低字节**（tile 号），字符数据存在每个字的**高字节**（8bpp chunky 图案）。这与 fix plan 里"高半字节错→纹理花、低字节对→透视图正确"的诊断完全吻合。
- **色彩**：颜色索引 & 0x7F -> CGRAM 前 128 项是 Mode 7 BG1 调色板（SMK 赛道 palette 就在这 128 色，garble 事故毁的正是它，fix plan #2/#4）。最高位仅 ExtBG（BG2 叠加，SETINI bit0）下作优先级用——SMK 未用 ExtBG。
- **每行重取参数**：HDMA 在每条可见扫描线渲染**之前**执行（LakeSnes 帧循环里 dma_hdmaRunLine 先于 ppu_runLine；✅ smk_flow_re.md:149-151 记录 snesrecomp end_frame 复刻的就是这个次序），所以逐行改 $211B-$211E 即逐行换矩阵。

### 1.2 SMK 怎么用它：HDMA 表结构 ✅+📖

仓库实证的活动通道目标（fix plan #5，SMK_HDMA_DEBUG 实测）：

| 目标寄存器 | 作用 | 说明 |
|---|---|---|
| $211B-$211E | M7 矩阵 A/B/C/D | **逐行更新**，透视的本体 |
| $2105 | BGMODE | 逐行在普通模式 <-> 7 之间切换（天空带 vs 路面带）|
| $212C | TM 主屏层开关 | 区段间开/关不同层与 OBJ |
| $2126 | W12SEL 窗口左界 | 配合窗口遮罩 |

注意：**$211F/$2120 (M7X/M7Y) 不在活动通道里** ⇒ 整帧内中心点静态，只有 A/B/C/D 逐行变。这大幅简化"重建相机表"的工作。

通道配置格式 📖（Fullsnes/Anomie）：

- $43x0 控制位：bit7 方向(0=A->B)，bit6=间接模式，bit3-4 传输模式。传输模式决定每次单元写到哪几个寄存器：mode1 = 单元 2 字节 -> $43x1,$43x2+1（适合一次写 A+B 或 C+D 两个 16 位寄存器）⇒ 写满 A-D 需要**两条 mode1 通道**分别指向 $211B 和 $211D——与观测到的"$211B-$211E 由 HDMA 提供"吻合。
- 直接模式表项：[重复计数 n][n×数据]…直到计数 0 终止（终止后该行起保持最后值）。
- 间接模式表项：[计数][WRAM 地址 lo,hi]…，数据本体在另一 bank。

✅ 间接模式的现成例子（smk_title.c:826-851，标题/选单画面）：channel1 $4310=$41（bit6 间接 + mode1）、B 目标 $2126/$2127（窗口左右界）、表在 WRAM $0180、间接数据 bank $85，13 字节表 `2C 09 83 60 | 09 83 28 09 83 70 | 09 83 00`。说明 SMK 全系列都在用这套 HDMA 手法；比赛画面的矩阵表同理，只是表体**每帧由游戏重建**而非 ROM 常量。

❓ 相机表的 WRAM 地址与构建例程未在本地定位。验证路径：用 tools/mesen/hw_logger.lua 抓一帧 $211B-$2120 全量日志 + PC；或在 Yoshifanatic1 反汇编中找写 $431x/$420C 的 race 初始化块（init 入口已知：$81:F7F1 -> $FB7E，置 $A4=6 并配好 per-scanline M7 HDMA 指针，✅ smk_boot.c:78 / smk_flow_re.md:130）。

### 1.3 视口 / 天空线 / 分区合成 ✅

- 一帧内的分区不是"多个图层各自画"，而是**同一组扫描线被 BGMODE/TM HDMA 重编程**：顶部区段 BGMODE=普通模式（天空、远山、记分板），路面区段 BGMODE=7 且 TM 打开 BG1(Mode7)+OBJ。这就是为什么 launcher 的 untimed 帧模型会卡在 mode=1 + forcedBlank——它没有真正逐行跑 HDMA（smk_flow_re.md:133-142）。
- 窗口 $2126 逐行变化用于遮罩/局部显示（配合 $212E TMW 等）。
- 亮度淡入淡出走 $2100(INIDISP)，由 NMI 内 fade 例程驱动（smk_80B181 是其忠实移植，smk_flow_re.md:176-179）；淡入不经过 Mode 7 本身。

### 1.4 DSP-1 的角色 ✅+📖

DSP-1 是卡带上的数学协处理器（CLAUDE.md：映射于 $00-1F:$6000-$7FFF），提供 16x16 有符号乘法、32÷16 除法、sin/cos（16 位相位角）、向量/range 等指令；LakeSnes 以 HLE 方式实现（dsp.cc），recomp 项目策略为"协处理器不重编译，保留 LakeSnes 实现"（recomp_frame_model_plan.md §7）。

SMK 用它做两类事 📖（功能级共识，具体调用点未本地核实）：

1. **每帧构建相机矩阵**：kart 角度 θ -> sin/cos -> 与逐行深度系数相乘得到该行 A/B/C/D，写入 WRAM 矩阵表供 HDMA 消费。典型形态（各行统一缩放 s、纯旋转、无剪切）：

       A = cosθ*s ; B = sinθ*s ; C = -sinθ*s ; D = cosθ*s

   逐行 s(y) 随深度近似 1/z 递减 ⇒ 远处压缩成地平线。❓ 行区间与 s(y) 的精确 LUT 形状待抓表验证（见 P0-2 的验证方法）。
2. **物体世界坐标->屏幕投影**：喂相对相机的 dx/dz，取回屏幕 x/y 与距离值，用于 OAM 摆放和尺寸选择。JS 版用解析式复刻了这件事（M7.mapToScreen + M7.spriteScale(z)=1/(3.6·ln(1.02+0.8z))，后者是 C++ remake 拟合的经验曲线，**不是原版公式**）。

### 1.5 精灵(OAM)投影与缩放 ❓

确凿的部分：
- SNES OAM **没有硬件缩放**——任何缩放都是软件手段。
- OAM 影子表在 WRAM $0200（Y=$E0 即移出屏隐藏），高位表 $0400；游戏维护 8 个精灵槽 $1000-$1700（含 X/Y/瓦片字/动画计数字段，✅ smk_title.c:465-468, 866-878）。
- OBSEL 决定精灵瓦片尺寸档（title init 写 $2101=$02，✅ smk_title.c:200/821）。
- 玩家自己的 kart 是**屏幕锚定**精灵（固定底部中央附近，随转向换帧），不走全投影管线——JS 版 showPlayerKart 特例与之对应。

高度存疑但影响认知的部分 ❓：其他 kart/道具的连续缩放从哪来？候选机制：(a) ROM 预渲染多档尺寸、按距离选档；(b) **运行时软件缩放**——CPU 把未缩放精灵重采样后灌进 VRAM 精灵区（多份技术分析倾向此说，也解释了原版远处精灵的像素爬行感）；512KB ROM 装不下 8 角色 × 32 向 × 多档尺寸的原生数据，间接支持 (b)。**验证路径**：race 期间用 hw_logger 监视 $2118/$2119 是否每帧大量落在精灵区；或对照 Yoshifanatic1 反汇编的 sprite-scaler 例程。

---

## 2. 我们 JS 版的现状

smk/js/mode7.js（134 行）+ 调用方 states.js View：

| 维度 | 实现 |
|---|---|
| 数学 | 浮点。每行由 near/far 两端点按 inv=1/sampleDepth（透视）插值出行起点 sx0,sy0 与步进 dx,dy——标准"近远裁剪面插值"构造，与逐行仿射**视觉等价** |
| 采样 | RGBA ImageData 直采，最近邻，坐标 clamp 图内；图外 -> edge 贴图按 8px 平铺或黑 |
| 地表 | 任意尺寸 canvas（1024 逻辑宽约定只用于 edge 缩放），真彩色 |
| 天空 | skySampleX 双层视差条带（front 按 π 周期、back 按 2π），画进顶部 40px（内部 512x448 为 2x 分辨率） |
| 精灵 | mapToScreen 解析投影 + spriteScale 经验曲线，drawImage 连续缩放，另有阴影椭圆/hue-rotate/star 滤镜增强 |
| 构图 | 底部 25%（224px 内部高）整块留给梯形小地图（remake 设计）；HUD 自绘位图字体 |

关键认知：**这不是原版管线的近似实现，而是另一个（remake 的）管线的忠实移植**。它的还原度目标是 vmbatlle C++ 版的观感，不是 SNES PPU 的数值行为。

---

## 3. 差异清单

| # | 类别 | 真实 PPU / SMK | smk/js 现状 | 影响 |
|---|---|---|---|---|
| D1 | 数值域 | 全定点：8.8 矩阵、13 位中心、>>8 截断 | float64 全精度 | 缺原版特有的亚纹素抖动/锯齿爬行；但也更干净 |
| D2 | 采样语义 | 10-bit wrap 或 tile0/透明 fill（M7SEL=$C0 ✅ -> 图外露 backdrop） | clamp + edge 平铺 | 出界表现不同；原版边界其实画在 1024² map 内 |
| D3 | 纹理格式 | 8bpp 索引色 -> CGRAM 128 色（BG1） | RGBA 直采 | 无法做调色板动画（岩浆/水面/终点闪）与整体淡入闪白 |
| D4 | 透视来源 | 逐行矩阵表（CPU+DSP-1 构建、HDMA 下发） | near/far 端点插值 | 观感等价；但无法回放/比对真实抓帧的矩阵 |
| D5 | 逐行特效 | BGMODE/TM/窗口/马赛克均可逐行变 | 固定三段构图 | 无 mid-frame 重编程能力（多数场景不需要） |
| D6 | 精灵缩放 | ❓软件缩放进 VRAM，离散步进、整数位置 | drawImage 连续浮点缩放 | 少了步进感；我们多了阴影/滤镜超纲效果 |
| D7 | 构图 | 路面填满地平线下全部区域，小地图/HUD 以 BG/OBJ 叠角落 | 底部 25% 固定梯形小地图 | 明显非原版布局（remake 自创 UI） |
| D8 | 分辨率 | 256x224 输出 | 内部 512x448（2x） | 更锐利，非原版观感 |
| D9 | 天空 | 顶部区段切普通 BG 模式绘制（图层构成 ❓） | 双层视差 PNG 条带 | 观感接近，机制不同 |
| D10 | 小地图 | 角落小地图 + 点精灵 | 同一渲染器的非透视模式生成梯形图 | 机制完全不同 |

---

## 4.【可提升还原度的 JS 改进项】按优先级

### P0 — 定点仿射核心 + 逐行参数表（一次改动同时解决 D1/D2/D4）

1. **PPU-exact 采样核心**：新增 renderFixed(dst, table)——int32 乘加、>>8 算术移位、13 位中心、10-bit wrap/tile0-fill 三态落图，输入为逐行 {A,B,C,D}(int16) 表 + 常量 {CX,CY,M7SEL}。现有 float 路径保留为兼容模式。成本约 80 行；512x184 规模性能无忧。验收：submodule 检出后与 lakesnes_ref 输出 BMP 同机位对比做 golden test。
2. **相机->矩阵表生成器**：以 cam(pos,angle,height) 按旋转+逐行统一缩放（§1.4 公式）产出每行 {A,B,C,D} 表，替换 near/far 插值为默认路径。附带 dumpTable/loadTable(JSON)——**这是与 mk-main 联动的接口**：hw_logger.lua 已记录 $211B-$2120，抓一帧真实表即可让 JS 渲染器逐字节回放真机视角，作为还原度基准。

### P1 — 调色板化与精灵观感（解决 D3/D6）

3. **索引色地表 + 虚拟 CGRAM**：地表转 128 色索引缓冲（assets/base.png 本就是有限色板风格），渲染输出查虚拟调色板再写 RGBA。立刻解锁 palette-cycle 动画（岩浆/水流/终点线闪烁）、全局淡入淡出/受击闪白（改调色板不改纹理）。
4. **精灵缩放量化**：把 spriteScale 连续值量化到 N 档（N 从抓帧测量，先验猜测 8-16 档），可选最近邻软缩放到离屏瓦片再贴以复现 VRAM 软缩放的像素爬行质感；平滑路径留 flag。

### P2 — 构图与杂项（解决 D5/D7/D9/D10）

5. **authenticLayout 开关**：路面填满天空带以下全屏，小地图/HUD 以叠加层放角落（原版布局）；现行梯形布局降级为 legacy 选项。
6. **马赛克近似**：per-row 像素合并系数（旋转/闪电/缩小惩罚演出启用）——追原版演出时最便宜的一项。
7. **backdrop 色语义**：出界透明改为露 backdrop 色（对齐 M7SEL=$C0）；edge 平铺保留给程序生成赛道。

### 不建议做的

- 逐行 BGMODE/窗口重编程：Web 合成器没有 mid-frame 寄存器概念，收益趋零。
- ExtBG/隔行：SMK 未使用。

---

## 5. 与 mk-main（recomp）项目的协同

- hw_logger.lua（$211A-$2120 全量写日志）-> 导出矩阵表 JSON -> 本文 P0-2 回放接口 = JS 侧还原度的客观标尺。
- tools/lakesnes_ref 的 BMP 输出可作为 P0-1 定点核心的黄金样本（ext/snesrecomp submodule 检出后补一条 CI diff）。
- 若 JS 版需要"真机相机"，直接消费 recomp 抓包的 WRAM 表即可，无需逆向 DSP-1 调用细节。

## 6. 遗留开放问题

| 问题 | 验证路径 |
|---|---|
| 相机矩阵表的 WRAM 地址/构建例程 | hw_logger 抓 PC + Yoshifanatic 反汇编 race init（入口 $81:F7F1->$FB7E 已知） |
| s(y) 深度曲线的精确形状（LUT?） | 抓一帧直线行驶的 A-D 序列拟合 |
| 精灵缩放机制 (a)/(b) 之辨 | race 期间监视 $2118/$2119 写入分布 |
| 顶部天空带的图层构成 | 抓 BGMODE!=7 区段的 TM/BGMAP 设置 |
| 比赛态 M7SEL 是否仍是 title init 的 $C0 | hw_logger 过滤 $211A |