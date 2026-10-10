# SMK-JS 原版还原度补全总计划

> 基于对 sp00nznet/mk 静态重编译项目（SNES 原版 ROM → C）源码与逆向文档的深读，
> 对照本项目（vmbatlle C++ remake 的 JS 移植）的差距分析。
> 三份基础研究报告见 docs/research/：recomp-core.md / shells-flow.md / ppu-mode7.md

---

## 一、mk-main 能给我们什么、不能给什么（先说结论）

| 领域 | mk-main 有无真实实现 | 对我们的价值 |
|---|---|---|
| 全局状态机/序列器（$81:E000） | ✅ 忠实重编译 | ★★★ 转场编排的铁律 |
| 渐变引擎 $80:B181 | ✅ 逐字节验证 | ★★★ 所有切屏的底层 |
| 输入边沿+两级门控 $85:92F9 | ✅ 逐字节验证 | ★★★ 菜单手感 |
| 标题画面（滚动/logo/巡游/demo） | ✅ 96KB shell | ★★ 已部分复刻，参数可精确化 |
| 选人界面完整逻辑（10子调用） | ✅ | ★★ 两段式确认/锁定/双打规则 |
| Mode7 渲染数学 | ⚠️ 硬件由 LakeSnes 整帧解释；DSP-1 未重编译 | ★ 文档级参考（HDMA矩阵/DSP-1角色）|
| **比赛物理层（车速/转向/漂移/AI）** | ❌ **完全不在任何 C 文件里**（靠真ROM解释执行） | 只能从 Yoshifanatic1/jvipond 反汇编仓库或 oracle 对拍获取 |

**重要结论**：mk-main 的比赛玩法是"跑真 ROM"，没有可供翻译的比赛物理 C 代码。
我们现有的比赛物理来自 vmbatlle C++ 重写（社区逆向成果），这部分的"完美还原"
需要另行从两个反汇编仓库提取常量与例程——本计划将其列为独立阶段并给出路径。

---

## 二、差距分析总表（按领域）

### A. 流程与演出层（mk-main 可直接照抄，收益最高）
| # | 差距 | 原版行为 | 现状 | 优先级 |
|---|---|---|---|---|
| A1 | 转场编排器 | 切屏=设挂起状态→渐变到全黑($0160==$8000)→切state+装载资源→自动淡入；步长$0060/帧≈40帧单程 | 各State直接setState硬切 | **P0** |
| A2 | 渐变引擎 | 有符号累加器$48+步长$015E+终值门控；INIDISP仅在变化时写 | 无此系统 | **P0** |
| A3 | 输入门控 | (cur^prev)&cur边沿；fade中/未亮起吞输入；菜单确认键=B|Start(#$9000) | 直接读down/pressed | **P0** |
| A4 | 上电WRAM填0x55 | 未初始化内存语义决定1P/2P默认等行为 | Uint8Array默认0 | **P0(一行)** |
| A5 | 选人界面原版规则 | sel步长2网格(±2列±8行)、不能停在对方格、两段式确认(第1按锁人/第2按定人/X取消)、双人完成+64帧settle才走、Y+A锁定toggle(Battle禁)、1P模式P2自动确认 | 单段确认、无锁定规则 | P1 |
| A6 | 标题细节 | idle≥1602帧进attract demo；输入需淡入完成后~150帧才生效；palette每5帧闪；巡游车速±$0120~$0300/帧；8 slot相位里程碑210~1466帧 | 有滚动+巡游但参数近似 | P1 |
| A7 | 开机节奏 | 黑126f→init40f→黑40f→标题(≈3.4s) | 直接进 | P2 |

### B. 渲染层（ppu-mode7.md D1-D10）
| # | 差距 | 影响 | 优先级 |
|---|---|---|---|
| B1 | 定点仿射核心(int32, >>8, 13位中心, 10-bit wrap/tile0) 替代浮点插值 | 数值级还原+可golden test | P1 |
| B2 | 相机→逐行{A,B,C,D}矩阵表生成器（替换near/far端点插值）；dumpTable/loadTable接口对接 hw_logger 抓真机表 | 还原度客观标尺 | **P1** |
| B3 | 索引色地表+虚拟CGRAM | 解锁调色板动画（岩浆/水流/终点闪）、受击闪白 | P2 |
| B4 | 精灵缩放量化到N档+最近邻软缩放 | 复现原版像素爬行质感 | P2 |
| B5 | authenticLayout开关：路面填满天空带以下全屏，小地图/HUD角落叠加 | 原版构图 vs remake自创梯形小地图 | P2 |
| B6 | 出界露backdrop色(M7SEL=$C0语义)；马赛克逐行近似(旋转/缩小惩罚演出) | 细节 | P3 |

### C. 比赛玩法层（mk-main 无 C 实现，需另行取数）
| # | 目标 | 状态 |
|---|---|---|
| C4 | 8-bit atan2($81:F722) + 64×64 角度表($81:E4B3) | ✅ **已完成**：ai.js 新增 buildAngleTables()/quantizeAngle()，基表以数学等价反正切曲线生成（原表存于ROM不可得），GP/Battle 的 AI 目标角均已走量化路径，复现硬件阶梯转向感 |
| C1a | 排量缩放作用于全部车辆 + 玩家 PCM 加成(1.15/1.09/1.055) | ✅ **已完成**（对照 vmbatlle start.cpp 发现 AI 恒为100cc物理的缺陷并修复） |
| C1 | 真实车速/加速度/转向角表（8角色×3排量×地形） | ⏳ 需外部数据：Yoshifanatic1/Super-Mario-Kart-Disassembly 或 jvipond 反汇编仓库；取得后替换 VEHICLE_TYPES/makeVehicle 拟合值即可 |
| C2 | 漂移/跳跃/碰撞真实判定 | ⏳ 同上（反汇编 collision/drift 例程） |
| C3 | AI 橡皮筋/道具概率表真值 | ⏳ 同上（当前沿用 vmbatlle 社区拟合值，行为已接近） |

### D. 音频（SPC700+BRR，mk-main 不含重编译音频驱动）
现状为 ogg 直放。若追求原版：引入 MrL314/smk-spc700-disassembly 的驱动逆向或直接播放原版BRR转档。优先级 P3。

---

## 三、分阶段实施路线图

### 阶段 0（✅ 已完成）——零风险高收益
1. ~~上电 WRAM 语义~~ → JS 无未初始化内存读取，注记文档化（N/A）
2. ✅ 转场编排器骨架：全局 fade 引擎（Fader，有符号累加模型）+ 菜单切屏改 transitionTo 请求式（22处）；时长 40 帧/程
3. ✅ 输入门控：Fader.gateInput() fade 中吞按键分发（保留 Enter 兼容映射）
4. ✅ RaceLoadingState 错误可视化

### 阶段 1（✅ 已完成）——菜单流原版化
5. ✅ 选人界面两段式确认 + 64帧 settle + 入场卡丁车滑入动画（Y+A 彩蛋因无键位映射保留注释）
6. ✅ 标题画面：滚动无缝回卷、logo 每5帧脉动、idle≥26.7s 进 AttractState 演示赛、提示行闪烁
7. ✅ 选人光标 6 帧拍闪烁、跑马灯 41px/s
8. ✅ 开机节奏 黑126f→INIT40f→黑40f→标题

### 阶段 2（✅ 已完成）——渲染还原度
9. ✅ mode7.js 新增 renderFixed(dst,rowTable)：int32 定点采样核（8.8 定点，>>8）+ dumpTable/loadTable
10. ✅ buildRowTable 相机→逐行参数生成器为默认路径（View.drawCircuit）；float 路径经 M7.useFixed=false 保留
    - 数值验证：同相机下两核采样坐标完全一致；差异仅为定点舍入的边界翻转（与真机定点行为同性质）
    - 附 tools 验证探针 probe_fixed.js 可随时复跑对比统计
11. （协同）用 mk-main 的 hw_logger.lua 抓真机矩阵表 JSON → loadTable 回放 → 与 lakesnes_ref BMP 做 golden diff
12. authenticLayout 开关 + backdrop 色 + 马赛克近似

### 阶段 3（持续）——比赛玩法真值
13. 从 Yoshifanatic1 反汇编仓库定位车速/加速度表地址并导出 JSON
14. 用导出表替换 VEHICLE_TYPES/makeVehicle 的社区拟合值
15. AI 目标采样/道具概率表按反汇编校准
16. atan2 LUT + 角度表移植（mk-main §4.2 已给出生成方式）

### 阶段 4（✅ 核心完成）——P2 清单
17. ⏸ 索引色+CGRAM 动画系统 → 以轻量替代落地：马赛克块采样（雷击/缩小演出）+ logo 脉动 + 终线闪白预留
    （真彩渲染下全量索引色改造收益低，保留为远期项）
18. ✅ attract 演示赛（idle 26.7s 进入，任意键返回）；z-sort 已有（精灵按 z 排序绘制）
19. ✅ 软复位：暂停菜单 R 键重开当前比赛（含对战）
    - B5 authenticLayout 开关已实现（AUTHENTIC_LAYOUT 常量，默认开：路面填满+小地图角标）
    - B7 出界 backdrop 色语义已在定点核内对齐
    - 删档彩蛋：N/A（无存档系统）

---

## 四、验收标准
- 阶段0：任意界面切换均有 0.67s 黑场过渡；fade 中按键无效
- 阶段1：选人流程与原版逐帧节奏一致（对照 shells-flow §6 常量表抽查）
- 阶段2：同一相机参数下 renderFixed 与真机抓表回放的逐行误差 ≤1 texel
- 阶段3：50cc mariocup 起步到首弯的车速曲线与反汇编导出表拟合偏差 <5%

## 五、风险与边界
- mk-main 比赛层无 C 代码 → 阶段3 依赖外部反汇编仓库，存在法律口径差异：
  反汇编数据仍源于任天堂 ROM，开源发布时建议"数据不随库分发、脚本自取"策略
- 定点核心性能：int32 运算在 JS 不慢于 float，512x184 规模无忧
- 保持现有 vmbatlle 物理为默认可玩路径，所有还原度改造以开关叠加，避免破坏现有可玩性
