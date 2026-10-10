# Super Mario Kart JS

An unofficial, browser-based JavaScript reimplementation inspired by
[vmbatlle/super-mario-kart](https://github.com/vmbatlle/super-mario-kart), the GPL-3.0 C++ recreation by
Diego Royo, Víctor Martínez (`vmbatlle`), and Javier Giménez.

This project would not exist without their work. Their C++ implementation provided the primary reference for gameplay architecture, vehicle physics, Mode-7-style rendering, AI, menus, course loading, and the bundled audiovisual resources. Thank you to all upstream authors and contributors.

> This is an independent, non-commercial fan and educational project. It is not affiliated with, endorsed by, or sponsored by Nintendo. Nintendo, Super Mario Kart, Mario, and related names, characters, music, and marks are the property of their respective owners.

## 中文简介

这是一个可直接在浏览器运行的《超级马里奥赛车》JavaScript/HTML 重写项目，主要灵感与实现参考来自
[vmbatlle/super-mario-kart](https://github.com/vmbatlle/super-mario-kart) 的 GPL-3.0 C++ 项目。
特别感谢 Diego Royo、Víctor Martínez（`vmbatlle`）、Javier Giménez 以及所有上游贡献者。

本项目为非官方、非商业的学习项目，与任天堂无关。公开分发前请阅读
[第三方与权利声明](THIRD_PARTY_NOTICES.md)。

## Status

`v0.1.0` is the first packaged development release. The game is playable, but this is still an early reimplementation rather than a byte-accurate emulator or a finished commercial-quality game.

## Highlights

- Plain JavaScript, HTML, and Canvas; no build step or runtime dependencies.
- Double-click `index.html` to play offline, or serve the directory with any static HTTP server.
- 20 Grand Prix tracks across four cups and four Balloon Battle courses.
- Eight drivers, 50/100/150cc classes, five-lap races, items, coins, drifting, jumps, hazards, rankings, and race results.
- Mode-7-style perspective renderer with a full lower-screen course map.
- Gradient/BFS racing AI and dedicated opponent-chasing Battle AI.
- WebAudio support with an `HTMLAudio` fallback for `file://` play.

## Play

### Offline

Download or extract the repository and open `index.html` in a modern desktop browser.

Your browser may require one click or key press before audio can start.

### Local server (optional)

```bash
python -m http.server 8080
```

Then open `http://127.0.0.1:8080/`.

## Controls

| Key | Action |
| --- | --- |
| Left / Right or A / D | Steer |
| X / W / Up | Accelerate; menu up |
| Z / S / Down | Brake; menu down |
| C / Shift / Space | Jump / drift |
| E | Use item forward |
| Q | Place or throw item backward |
| Enter | Confirm / skip intro |
| Escape | Pause / back |

## Tests

Node.js is only required for the test suite, not for playing.

```bash
node test.js
node render_test.js
node strict_test.js
node acceptance_check.js
```

- `test.js`: gameplay, physics, item, AI, Battle, and Mode-7 math regression tests.
- `render_test.js`: full rendering smoke test across all 24 courses.
- `strict_test.js`: extended canvas and simulation stress test.
- `acceptance_check.js`: offline/self-contained distribution checks.

## Project layout

```text
.
├── index.html
├── assets/                 Bundled upstream-derived graphics and audio
├── js/
│   ├── main.js             Boot and frame loop
│   ├── states.js           Menus, race flow, Battle, and rendering pipeline
│   ├── mode7.js            Perspective course renderer
│   ├── map.js              Course loading, objects, starts, and minimap
│   ├── driver.js           Vehicle physics and driver state
│   ├── ai.js               Race gradient AI and angle quantization
│   ├── items.js            Items and collisions
│   ├── trackgen.js         Generated race and Battle courses
│   ├── audio.js            WebAudio and offline audio fallback
│   └── gui.js              HUD and bitmap text
├── docs/                   Restoration and implementation research notes
└── *_test.js / *_body.js   Headless regression test harnesses
```

## Upstream credit and third-party material

The implementation and bundled assets are derived from or inspired by the GPL-3.0 upstream project:

- [vmbatlle/super-mario-kart](https://github.com/vmbatlle/super-mario-kart)
- Authors: Diego Royo, Víctor Martínez, and Javier Giménez
- License: GNU General Public License v3.0

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the detailed provenance and rights notice.

Some research notes also reference
[sp00nznet/mk](https://github.com/sp00nznet/mk), a separate static recompilation research project. No ROM is included in this repository.

## License

The project is distributed under the [GNU General Public License v3.0](LICENSE), consistent with the upstream C++ project.

The GPL grant applies only to rights held by the relevant contributors. It does not grant rights to Nintendo trademarks or other third-party intellectual property. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Contributing

Bug reports and focused pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

