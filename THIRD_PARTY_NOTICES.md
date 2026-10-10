# Third-party notices and rights statement

## Primary upstream project

Super Mario Kart JS is a JavaScript/HTML reimplementation inspired by and partially ported from:

- Project: [vmbatlle/super-mario-kart](https://github.com/vmbatlle/super-mario-kart)
- Description: a C++/SFML recreation of Super Mario Kart
- Authors named by the upstream project: Diego Royo, Víctor Martínez (`vmbatlle`), and Javier Giménez
- License published by the upstream repository: GNU General Public License v3.0

We gratefully acknowledge the upstream authors and contributors. Their code and project structure provided the primary implementation reference for course rendering, course data handling, driving physics, AI, items, menus, audio behavior, and game-state flow.

## Bundled resources

The files under `assets/`, together with generated embedded forms in `js/circuit_img.js` and `js/circuit_txt.js`, were copied or derived from material distributed in the upstream GPL-3.0 repository. They are included here to preserve offline operation and are redistributed under the same GPL-3.0 terms to the extent the upstream contributors hold the necessary rights.

The program does not include a `.sfc`, `.smc`, ROM image, save state, or other commercial game dump. Some courses are generated locally by `js/trackgen.js`; the five asset-backed course data sets originate from the upstream project.

## Other research references

The documents under `docs/research/` cite public reverse-engineering and static-recompilation research, including [sp00nznet/mk](https://github.com/sp00nznet/mk). Those projects are research references; this repository does not vendor their source trees or any game ROM.

## Nintendo and third-party rights

This is an unofficial, non-commercial fan and educational project. It is not affiliated with, endorsed by, or sponsored by Nintendo.

Nintendo, Super Mario Kart, Mario, and related names, characters, audiovisual works, and trademarks are the property of Nintendo and/or their respective owners. The GPL-3.0 license in this repository covers only copyright interests that the licensors and contributors are legally able to license. It does not grant permission to use third-party trademarks or copyrighted material.

The upstream repository's GPL-3.0 license is evidence of its authors' intent to permit reuse of their contributions, but it cannot by itself resolve rights held by Nintendo or other third parties. Anyone making this repository public or redistributing release packages should perform their own legal and platform-policy review.

## No warranty

All material is provided without warranty, as further described in the GNU General Public License v3.0.

