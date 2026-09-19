# Third-party games

## HexGL — `games/hexgl/`

A futuristic racing game by **Thibaut "BKcore" Despoulain** — <http://bkcore.com>
Upstream: <https://github.com/BKcore/HexGL>

Shipped here as the **Hex Racer** practice mode. Vendored unmodified; the
only file we added is `practice.html`, which auto-starts the track, applies a
lap count and a target time, and posts the result back to the hub. No HexGL
source file is patched — every hook is an instance-level override, so the
folder can be replaced wholesale with a newer upstream.

### Licensing — read before shipping commercially

HexGL's licensing is **split**, and the README is easy to misread:

> Unless specified in the file, HexGL's code and resources are now licensed
> under the *MIT License*.

The root `LICENSE` is MIT (Copyright © 2015 Thibaut Despoulain). But nine
files **do** specify in-file, and they are the ones that are actually the
game:

    bkcore/hexgl/HexGL.js
    bkcore/hexgl/Gameplay.js
    bkcore/hexgl/ShipControls.js
    bkcore/hexgl/ShipEffects.js
    bkcore/hexgl/CameraChase.js
    bkcore/hexgl/HUD.js
    bkcore/hexgl/RaceData.js
    bkcore/hexgl/Ladder.js
    bkcore/hexgl/tracks/Cityscape.js

Each carries:

    @license This work is licensed under the Creative Commons
             Attribution-NonCommercial 3.0 Unported License.

So the game logic and the Cityscape track are **CC BY-NC 3.0 —
NonCommercial**. That is fine for a hackathon demo and for anything
non-commercial, which is what this project is. It is **not** fine if this
ever ships as a paid or revenue-generating product.

If that changes, `games/hexgl/` is the only thing that has to go: it is
mounted in an iframe and reached through one `postMessage` channel
(`js/hexgl.js`), so a replacement racer drops in without touching the hub.

### What we removed

Nothing. `textures.full/` looks droppable at 5.3 MB but is the quality-3
texture tier referenced by `tracks/Cityscape.js` — deleting it breaks the
default quality setting.

`practice.html` does **not** load HexGL's Google Analytics snippet or its
remote favicon, both of which `games/hexgl/index.html` still pulls from
`hexgl.bkcore.com`. The hub never opens that file.

### Audio

`games/hexgl/audio/` carries its own `LICENSE`. The five sound files are
public domain or **CC BY 3.0** (attribution, but commercially usable — a
looser licence than the game code above):

| File | Author | Licence |
|---|---|---|
| `bg.ogg` | mu6k (adjusted by Licson) | Public domain |
| `crash.ogg` | qubodup | Public domain |
| `boost.ogg` | IFartInUrGeneralDirection | CC BY 3.0 |
| `wind.ogg` | kangaroovindaloo (adjusted by Licson) | CC BY 3.0 |
| `destroyed.ogg` | beman87 (adjusted by Licson) | CC BY 3.0 |

Converted to OGG Vorbis by baleboy.
