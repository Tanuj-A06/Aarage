# gamingNft / AARAGE — complete repository summary

This document describes the repository as it exists now, from the source code rather than from the older marketing or deployment claims. Snapshot date: **2026-09-19**. The current Git branch is `main`, at commit `57d10e2` (`added new files`), with **284 tracked files**.

## 1. What this repository is

The project is a static-first browser arcade called **AARAGE**. Its main experience lets people write natural-language fighter strategies, converts those strategies into bounded combat statistics, and lets two autonomous fighters battle in a deterministic 2D/2.5D arena. It also contains:

- **Pen Fight 3D**: a second deterministic simulation where two physical pens flick, collide, lose health, and can fall off a shrinking desk.
- **Hex Racer**: a separately vendored HexGL futuristic racing game embedded through an iframe.
- **Rooms**: same-browser or server-relayed prompt rooms with commit/reveal, deterministic round seeds, rematches, heartbeats, and desync detection.
- **Optional Gemini analysis**: a server-side proxy can ask Gemini to turn a prompt into stats; the local parser remains the default fallback.
- **Optional Monad Web3**: contracts and a browser adapter exist, but live chain use is disabled by default and the checked-in frontend addresses are zero addresses.
- **A marketing landing page**: `index.html` presents the AARAGE brand and routes users into the arcade at `play.html`.

The repository has no frontend framework, bundler, or root runtime dependency. The browser loads ordinary JavaScript files in a deliberate order. Most dependencies are vendored under `js/vendor` or inside the HexGL game.

## 2. User-facing products and entry points

### `index.html` — AARAGE landing page

This is the public product shell. It contains the AARAGE wordmark, hero section, local full-screen video backgrounds, the Write → Parse → Fight explanation, game cards, the on-chain receipt section, footer links, and calls to action.

The three game links are:

- `play.html?mode=fighter` — AI Fighter.
- `play.html?mode=pen` — Pen Fight 3D.
- `play.html?mode=hexgl` — Hex Racer.

It references the local favicon and local video/poster assets. It also preconnects to Google Fonts and loads Archivo Black, Inter, and JetBrains Mono from Google Fonts when online.

### `play.html` — arcade application

This is the actual game shell. It contains:

- The main 2D arena canvas, `#arena`.
- An alternate AI Fighter WebGL canvas, `#arena3d`.
- The Pen Fight WebGL canvas, `#pen3d`.
- Title, room, lobby, prompt, analyzing, reveal, winner, mint, and Hex Racer setup screens.
- Prompt controls, fighter/pen preset buttons, mode selection, timers, health bars, announcements, mute controls, spectator betting controls, and mint controls.
- The HexGL iframe host and error/exit UI.

The scripts are loaded in this order because several modules rely on globals created by earlier files:

1. `js/vendor/gsap.min.js`
2. `js/utils.js`
3. `js/config.js`
4. `js/classes.js`
5. `js/prompt-parser.js`
6. `js/gemini.js`
7. `js/ai-controller.js`
8. `js/fx.js`
9. `js/scene3d.js`
10. `js/game.js`
11. `js/blockchain.js`
12. Three.js and its loader/post-processing files
13. `js/render3d.js`
14. `js/penfight.js`
15. `js/penfight3d.js`
16. `js/hexgl.js`
17. `js/ui.js`
18. `js/net.js`
19. `js/rooms.js`

The `?v=15` query strings on script URLs are cache-busters. `rooms.js` is intentionally last because it wraps UI behavior after the UI has been initialized.

### URL controls

`js/utils.js` reads these query parameters:

| Parameter | Meaning |
|---|---|
| `p1`, `p2` | Override the two fighter prompts. |
| `seed` | Force a deterministic simulation seed. |
| `auto` | Enable attract/automatic behavior. |
| `bench=N` | Run the fighter benchmark matrix for `N` repetitions. |
| `penbench=N` | Run the Pen Fight benchmark matrix. |
| `mode=fighter\|pen\|hexgl` | Select the initial product mode. |
| `human=1` / `debugHuman` | Enable human-debug behavior. |
| `hitboxes=1` | Show collision/debug hitboxes. |
| `flat=1` | Bypass the 2.5D perspective renderer. |
| `noai=1` | Disable the Gemini path and use local parsing. |
| `room=CODE` | Ask the rooms UI to resume/join a room. |

## 3. End-to-end data flow

### Local fighter flow

1. The user enters a prompt or selects a preset.
2. `js/prompt-parser.js` sanitizes, truncates, tokenizes, and maps language to `aggression`, `defense`, and `speed`.
3. `js/gemini.js` may call `/api/analyze` if the server is available and AI is enabled. A bad, slow, missing, or malformed response never prevents local play.
4. `js/ui.js` shows the analysis/reveal sequence and starts the simulation.
5. `js/ai-controller.js` produces virtual keyboard inputs for both fighters.
6. `js/game.js` advances the fixed 60 Hz fight simulation.
7. `js/classes.js`, `js/fx.js`, `js/scene3d.js`, and optionally `js/render3d.js` draw the result and effects.
8. The winner screen prepares a `pendingMint` record. `js/blockchain.js` either performs a simulated mint or, only when explicitly enabled and configured, attempts a real transaction.

### Online room flow

1. `js/rooms.js` creates or joins a four-character room.
2. `js/net.js` prefers the Node relay through SSE and POST; if unavailable, it uses `BroadcastChannel` for same-browser tabs.
3. Each side commits a hash of its prompt before the other prompt is revealed.
4. Both sides publish their parsed fighter only after both commits exist.
5. The host supplies a round nonce. Both peers derive the same seed from room code, both commits, and that nonce.
6. Each peer simulates locally. A result digest is compared to detect divergence.
7. Heartbeats run every second; a peer is considered timed out after five seconds. Session storage supports refresh/resume.

### Pen Fight flow

`js/penfight.js` maps prompt stats into physical behavior. Two capsule-shaped pen bodies use SI-like values for mass, radius, friction, restitution, center-of-mass offset, angular inertia, flick impulse, torque, and English/spin. The pens collide using closest-segment geometry and normal/Coulomb impulses. The desk begins shrinking after eight seconds, ring-outs are possible, and the result is decided by KO, falling off the desk, or time.

### HexGL flow

`js/hexgl.js` stops the hub simulation, opens `games/hexgl/practice.html` in an iframe, passes the selected lap target and quality, listens for `postMessage` events from the practice page, and returns the user to the hub after finish/error/exit. HexGL is a race and never creates a mint record.

## 4. Root files

| File | Purpose |
|---|---|
| `.claude/settings.json` | Claude-specific permission settings for a small allowlist of web/download actions. It is development tooling configuration and is not loaded by the AARAGE runtime. |
| `.env` | Tracked local environment file containing eight `GEMINI_API_KEY_1` through `GEMINI_API_KEY_8` variable names. Secret values are intentionally not reproduced here. Keeping secrets in a tracked file is a repository risk. |
| `.gitignore` | Ignores Node modules, Hardhat artifacts/cache, environment files, OS files, and logs. The tracked root `.env` is an exception in practice because already-tracked files are not removed by an ignore rule. |
| `README.md` | Human-oriented project overview: premise, local lexical AI, arena rules, effects, URL parameters, demo flow, layout, credits, and a placeholder/on-chain overview. It is useful context but is less authoritative than the current code for runtime defaults. |
| `deploy.md` | Contract deployment instructions for Monad testnet: configure contract environment variables, deploy with Hardhat, copy addresses to `js/config.js`, and enable real chain mode. Its claim that frontend Web3 wiring is fully live is ahead of the checked-in defaults and placeholder settlement signature. |
| `index.html` | AARAGE marketing/landing page. |
| `package.json` | Root package metadata. It is private, requires Node `>=18`, has `start: node server.js` and `test: node tests/run.js`, and has no root dependencies. |
| `play.html` | Arcade/game HTML shell described above. |
| `render.yaml` | Render deployment definition for one Node web service, free plan, Oregon region, `node server.js`, `/api/health`, and eight unsynchronized Gemini environment variables. |
| `server.js` | Optional static server, Gemini proxy, and in-memory room relay. |
| `site.css` | AARAGE landing-page design system and responsive layout. |
| `site.js` | Landing-page interactions: reveals, video fallback, parallax, mobile navigation, sticky state, hero fade, progress bar, and reduced-motion handling. |
| `styles.css` | Arcade cabinet styling for `play.html`: fixed 1024×576 stage, pixel/mono visual language, screen overlays, HUD, prompt/lobby/winner/mint screens, health bars, room panels, responsive scaling, and accessibility/reduced-motion rules. |
| `summary.md` | This complete repository summary. |

## 5. Shared browser configuration and utilities

### `js/utils.js`

Defines global numeric helpers (`clamp`, `clamp01`, `lerp`, `round2`), a seeded `mulberry32` random generator, an FNV-like string hash, rectangular attack/body collision, and query-parameter parsing. The deterministic random and hash helpers are used by combat, benchmarks, prompt improvisation, rooms, and result digests.

### `js/config.js`

Defines the main `CONFIG`, `MONAD`, and `PEN` objects.

`CONFIG` contains:

- Prompt limits: 200 words, 1,600 characters, and a shorter HUD display limit.
- Fight timing: 25-second rounds, 60-second prompt entry, 3-second analysis, and 5.6-second reveal.
- Optional AI endpoint `/api/analyze`, seven-second request timeout, and 6.5-second maximum AI wait.
- Arena start positions, floor, jump velocity, separation gaps, kite limits, pressure timing, and sudden-death timing.
- Jab, normal, and heavy move startup/damage/cooldown/recovery values.
- Block chip damage, block cooldown, stun, pushback, guard-break damage, and block probability.
- Rage, last-stand, danger, hit-stop, shake, and knockback tuning.
- Stat-to-speed, decision-period, target-band, cooldown, damage, defense, pressure, sudden-death, and behavior-probability formulas.

`MONAD` contains:

- `USE_REAL_CHAIN: false`.
- Monad testnet chain ID `10143` / `0x279f`.
- RPC and explorer URLs.
- Native currency name `MON`.
- Zero-address `arenaAddress` and `nftAddress` defaults.
- Default player stake/spectator bet amounts.
- Browser-side ABIs for the arena and NFT contracts.

`PEN` contains the desk dimensions, shrink schedule, pen dimensions/mass, center-of-mass offset, friction and spin coefficients, restitution, maximum impulse, settle speed, turn rate, English, aim spread, move timings, and balance constants used by the pen simulator.

### `js/prompt-parser.js`

This is the offline source of truth for prompt-to-fighter conversion. It defines:

- Aggression, defense, speed, negative, intensifier, diminisher, negation, and compound-word lexicons.
- Compound strategies such as coward, hit-and-run, all-out, and immovable.
- Eight archetypes: GLASS CANNON, BERSERKER, JUGGERNAUT, TURTLE, ASSASSIN, BRAWLER, TACTICIAN, and JOURNEYMAN.

`parsePrompt` cleans and limits input, applies compounds and word modifiers, budgets the three stats to the allowed range, chooses an archetype/tagline, and returns matched terms. A prompt with no recognized terms receives a deterministic hash-based improvised build so nonsense remains playable. The return object is tagged with `source: 'lexicon'`.

### `js/gemini.js`

This is an optional client adapter. It probes `/api/health`, calls `/api/analyze` with an `AbortController`, clamps/re-budgets server output, validates the archetype and tagline, converts returned traits into chips, and returns `null` on all failure paths. `CONFIG.AI_ENABLED` and `?noai=1` disable it. Local parsing remains available in all cases.

### `js/classes.js`

Contains the sprite and fighter model. `Sprite` handles frame playback, drawing, and updating. `Fighter` adds position/velocity, body and attack boxes, fixed player-facing directions, stats, block/stun/recovery/combo state, hit effects, aura/trail state, squash, rage/last stand, and death. It gates attacks, uses explicit configured move startup values, applies hits, and supports named sprite subranges.

## 6. Fighter simulation and presentation

### `js/ai-controller.js`

Implements autonomous keyboard-like control. Each side has an independent seeded random stream and an opponent model made from moving averages of jumps, attacks, and whiffs.

The controller has three layers:

- A slow plan layer that selects RUSH, ZONE, BAIT, HUNT, or TURTLE for roughly 60–130 frames.
- A utility layer that scores attack, advance, retreat, hold/footsies, dash, and jump candidates.
- A frame-level reflex layer for attack commitment, observing opponent attacks, block/dodge, punish windows, stun, and recovery.

The fighter stats alter plan weights, aggression, spacing, decision period, and jitter. The controller writes the same virtual-key object consumed by a human/debug path.

### `js/game.js`

Owns the fixed 60 Hz AI Fighter simulation. It:

- Creates Samurai and Kenji from the local sprite sheets.
- Initializes stats, positions, attack ranges, virtual keys, and deterministic RNG streams.
- Handles movement, jumping, attack startup, block, separation, pressure, sudden death, simultaneous hit snapshots, knockback, whiff recovery, combo state, rage, last stand, and KO.
- Selects between flat 2D, 2.5D perspective, alternate WebGL, and Pen Fight rendering.
- Supports attract mode and a fatal-loop guard after repeated errors.
- Exposes `runBench(n)` for a 5×5 archetype matrix through `?bench=N`.

Fight results distinguish double KO/draw, timeout result, and ordinary KO. The simulation is designed so the same prompts and seed produce the same trace across contexts.

### `js/fx.js`

Provides all fight feedback without audio files. It synthesizes WebAudio tones/noise for clicks, typing, beeps, bells, whooshes, hits, guards, guard breaks, KO, cheering, alarms, and pen sounds. It also manages particles, floaters, dust, slashes, rings, hit-stop, camera shake, flash, zoom, slow motion, vignette, draw order, and reset state. Optional four-note music is generated in code.

### `js/scene3d.js`

Draws the fighter arena as a 2.5D stage around the sprite plane. It handles perspective projection, vanishing horizon, parallax/haze, crowd, stage deck and thickness, grid, light pool, reflection, camera tracking, dolly/roll, and KO focus. `?flat=1` bypasses this layer.

### `js/render3d.js`

Provides the optional alternate WebGL fighter renderer. It loads `assets/models/Soldier.glb` on demand through `GLTFLoader`, creates the arena, environment, lights, crowd, instanced sparks/rings, flashes, shadows, and bloom, and applies procedural bone poses for jab/normal/heavy/block/hit/death. It also creates a procedural katana and shield. It reads the existing simulation and never changes simulation state.

### `js/ui.js`

Owns the game screens and user interactions. It defines six fighter presets and six pen presets, handles mode selection and WebGL availability, prompt entry/word limits, live parsing, analysis logs, concurrent AI requests, reveal timing, random/forced/online seeds, health/timer announcements, winner/mint screens, betting buttons, claim buttons, mute, and query-driven boot.

The prepared `pendingMint` record contains the prompt, stats, archetype, win flag, remaining HP, duration, seed, game name, finish type, and timestamp. Draws disable minting. GSAP is used for health-bar animation.

## 7. Pen Fight 3D

### `js/penfight.js`

Runs a separate deterministic 60 Hz physical simulation. Each pen is a capsule with position, angle, angular velocity, center-of-mass offset, health, and motion state. The engine calculates closest points between segments, resolves normal and Coulomb-friction impulses, applies torque and off-center flicks, computes damage from closing velocity, maps fighter stats to approach/tap/setup/attack behavior, and adds pressure as the desk shrinks.

The configured moves are tap, drive, and smash. The desk begins shrinking after eight seconds; pens can teeter and fall over the edge. Outcomes include KO, ring-out, and time result. `runPenBench` is available through `?penbench=N`.

### `js/penfight3d.js`

Renders the pen simulation using Three.js. It builds procedural wood albedo/roughness/normal textures, desk/lip/legs/floor/lamp geometry, colored pens with clips and glow, aim lines, sparks, motes, bloom, and a camera framed around the midpoint or fallen pen. It only mirrors simulation state.

## 8. Networking and rooms

### `js/net.js`

Defines the room transport and protocol:

- Four-character room codes from a restricted alphabet.
- Protocol version 1.
- Dual FNV-style prompt commits.
- Relay driver using `EventSource`/SSE for subscription and POST for sending.
- Local driver using `BroadcastChannel`.
- Relay-first connection with local fallback.
- Handshake, status, commit/reveal, parsed-fighter publication, host round nonce, deterministic seed derivation, result digest, rematch/new-round, heartbeat, timeout, leave, and unload behavior.

The parsed fighter is not published until both prompt commits are present. The host owns the round nonce, which prevents each peer from silently choosing a different seed.

### `js/rooms.js`

Integrates the protocol into the UI by wrapping existing UI methods. It supplies room create/join/local screens, optional `?room=CODE` resume, lobby/start/request controls, opponent-prompt hiding, commit and parsed-fighter publication, online fight start, local-side winner/mint gating, result-hash comparison, session-storage refresh recovery, leave behavior, and diagnostic notes.

## 9. Blockchain integration

### `js/blockchain.js`

Defines the `Chain` browser adapter. It can:

- Detect an injected wallet and connect MetaMask.
- Switch to or add Monad testnet.
- Create a match and place spectator bets.
- Track local match/bet state when contract addresses are zero.
- Claim spectator payout only through a real configured contract.
- Simulate minting when live chain mode is disabled, including a demo token ID and transaction hash.
- Attempt real NFT minting when `MONAD.USE_REAL_CHAIN` is enabled and a wallet/address is configured.

Important current limitation: live mode defaults to `false`, the checked-in addresses are zero addresses, and settlement currently uses a placeholder signature (`0x00`) and a hardcoded loser address. The adapter is therefore a demo/integration scaffold, not a production-ready trustless settlement path.

## 10. Server

`server.js` is dependency-free Node code using `http`, `https`, `fs`, `path`, `url`, and `os`. It has three jobs.

### Static server

It serves the repository files for GET/HEAD requests, maps common MIME types, blocks path traversal and dot-segment access, and refuses to serve `node_modules`, Hardhat artifacts, and Hardhat cache directories. It also prints localhost and LAN URLs on startup.

Running a generic `python -m http.server` from the repository is fine for parser-only local play, but it does not provide Gemini or rooms and may expose dotfiles such as `.env`. `server.js` is safer for normal local development because it blocks dotfiles.

### Gemini proxy

The server loads `.env` without a dependency, accepts `GEMINI_API_KEY` or numbered keys through `_64`, and keeps secrets server-side. The current checked-in environment names are `_1` through `_8`.

It tries models in this order:

1. `gemini-3.6-flash`
2. `gemini-3.5-flash-lite`
3. `gemini-3.1-flash-lite`

The system prompt asks for bounded stats, an archetype, tagline, traits, and an improvised flag. The server shapes and budgets responses, keeps a maximum-400 normalized prompt/mode cache, retries and hedges across keys, gives each attempt about five seconds, caps total analysis around twelve seconds, and applies a cooldown after rate limiting. The first successful response wins.

Endpoints:

- `GET /api/health` — reports key count, models, cache size, relay status, room count, and per-key counters without exposing key values.
- `POST /api/analyze` — accepts a bounded JSON prompt and `fighter`/`pen` mode; returns a shaped result, `503` when no key exists, or `502` when providers fail.

### Room relay

The relay keeps rooms in an in-memory map. `GET /api/room/sub?code=XXXX&side=1|2` opens an SSE stream, and `POST /api/room/send` broadcasts a bounded message. It limits rooms to 500, messages to 32 KiB, removes idle rooms after about 30 minutes, and sends keepalives.

Because rooms are memory-only, the deployment must use exactly one long-lived server instance. Multiple instances or serverless deployment would require shared storage such as Redis, which is not present in this repository.

## 11. Smart contracts

The contracts are an independent Hardhat project under `contracts/`.

### `contracts/contracts/FighterNFT.sol`

An OpenZeppelin ERC-721 owned by the deployer. A `FighterData` record stores prompt, three uint8 stats, archetype, seed, match ID, and timestamp. Token IDs begin at one. The owner authorizes the arena contract, and only the arena or owner can mint a winner.

The token URI is generated on-chain as Base64 JSON containing a fully generated SVG. The SVG shows the fighter metadata and stat bars. The contract includes prompt truncation and quote escaping helpers, `getFighter`, and `totalMinted`.

### `contracts/contracts/ArenaBattle.sol`

Ownable, reentrancy-protected match and betting contract using ECDSA arbiter signatures. It supports:

- Match creation with a nonzero player stake.
- Exact-stake joining by a different second player.
- Spectator bets on either player; players cannot bet.
- Active/settled/cancelled match states.
- Arbiter-signed settlement with match ID, addresses, prompt, stats, archetype, and seed.
- Winner/loser player payouts, with the configured fee.
- A losing-side spectator pool, a fee, and profit distribution to winning bettors.
- Pull-based payout claiming with double-claim protection.
- Refund behavior when no winning spectator pool exists.
- Cancellation and timeout refunds.
- Owner fee withdrawal.

Direct native-coin transfers are rejected. The initial configuration includes a five-percent fee, two-hour match timeout, and incrementing match IDs.

### Contract project files

- `contracts/package.json` — Hardhat toolbox 5, OpenZeppelin 5.0.2, dotenv, Hardhat 2.22.5, and scripts for test/compile/deploy.
- `contracts/package-lock.json` — locked npm dependency tree.
- `contracts/hardhat.config.js` — Solidity 0.8.24, Cancun EVM target, optimizer 200 with `viaIR`, Hardhat chain 31337, Monad testnet 10143, RPC settings, and deployer-key fallback.
- `contracts/scripts/deploy.js` — deploys NFT, deploys arena with NFT/arbiter/owner addresses, authorizes the arena in the NFT contract, and prints addresses.
- `contracts/test/ArenaBattle.test.js` — tests configuration, creation/joining, stake validation, betting restrictions, signed settlement, payouts, NFT token URI/SVG, cancellation, and refunds. The source contains more than the older README's “10 tests” description suggests.

## 12. Vendored HexGL game

`games/hexgl/` is a large, mostly independent upstream HTML5 Three.js racer. The AARAGE hub reaches it through `practice.html`; the original menu at `index.html` is not the hub entry point.

### Integration files

- `games/hexgl/practice.html` is the project integration page. It loads the old HexGL stack, reads `laps`, `target`, and `quality`, skips the original menu, displays target delta, sends `started`, `finish`, and `error` messages to the parent, and provides run-again/back/Escape controls.
- `games/hexgl/index.html` is the original HexGL menu, loading, credits, and game page. It includes original Google Analytics and a remote favicon; the hub does not use this page.
- `games/hexgl/launch.js` and `games/hexgl/launch.coffee` are original menu/bootstrap code for controls, quality, HUD, credits, and loading.
- `games/hexgl/replays/cityscape-casual/bkcore.replay.json` is a stored Cityscape casual replay.
- `games/hexgl/README.md` is the upstream game README.
- `games/hexgl/LICENSE`, `games/hexgl/audio/LICENSE`, `.gitignore`, `.htaccess`, `cache.appcache`, `manifest.webapp`, `package.webapp`, and `package.zip` are upstream licensing, web-app packaging, cache, MIME, and distribution files.

### HexGL runtime source

The following files make up the old HexGL engine:

- `games/hexgl/bkcore/hexgl/HexGL.js` — main Three.js assembly, resource loading, scene setup, and lifecycle.
- `games/hexgl/bkcore/hexgl/Gameplay.js` — race state, timer, laps, checkpoints, finishing, and time attack.
- `games/hexgl/bkcore/hexgl/ShipControls.js` — keyboard, touch, orientation, gamepad, and Leap controls; thrust, steering, braking, boost, collision, shield, height, and fall physics.
- `games/hexgl/bkcore/hexgl/ShipEffects.js` — ship, collision, and boost visuals.
- `games/hexgl/bkcore/hexgl/CameraChase.js` — chase-camera behavior.
- `games/hexgl/bkcore/hexgl/HUD.js` — speed, shield, lap, and time display.
- `games/hexgl/bkcore/hexgl/RaceData.js` — checkpoints and lap data.
- `games/hexgl/bkcore/hexgl/Ladder.js` — standings/lap ladder.
- `games/hexgl/bkcore/hexgl/tracks/Cityscape.js` — Cityscape track geometry, collision, heights, and texture references.
- `games/hexgl/bkcore/Audio.js` — background, boost, crash, destroyed, and wind sound manager.
- `games/hexgl/bkcore/threejs/Loader.js` — asset/image/geometry loaders.
- `games/hexgl/bkcore/threejs/Preloader.js` — loading progress.
- `games/hexgl/bkcore/threejs/RenderManager.js` — renderer/camera/scene frame management.
- `games/hexgl/bkcore/threejs/Shaders.js` — shader definitions.
- `games/hexgl/bkcore/threejs/Particles.js` — particle system.
- `games/hexgl/bkcore.coffee/ImageData.js` and `ImageData.coffee` — image/pixel sampling utilities and CoffeeScript source.
- `games/hexgl/bkcore.coffee/Timer.js` and `Timer.coffee` — time helpers and source.
- `games/hexgl/bkcore.coffee/Utils.js` and `Utils.coffee` — math/helper utilities and source.
- `games/hexgl/bkcore.coffee/controllers/GamepadController.js` and `.coffee` — gamepad input.
- `games/hexgl/bkcore.coffee/controllers/OrientationController.js` and `.coffee` — device-orientation input.
- `games/hexgl/bkcore.coffee/controllers/TouchController.js` and `.coffee` — touch input.
- `games/hexgl/bkcore.coffee/threejs/Particles.js` and `.coffee` — CoffeeScript particle implementation and compiled browser output.
- `games/hexgl/bkcore.coffee/tests.html` — small utility test page.

### HexGL geometry and libraries

Geometry data is stored in:

- `games/hexgl/geometries/bonus/base/base.js`
- `games/hexgl/geometries/booster/booster.js`
- `games/hexgl/geometries/ships/feisar/feisar.js`
- `games/hexgl/geometries/tracks/cityscape/bonus/speed.js`
- `games/hexgl/geometries/tracks/cityscape/scrapers1.js`
- `games/hexgl/geometries/tracks/cityscape/scrapers2.js`
- `games/hexgl/geometries/tracks/cityscape/start.js`
- `games/hexgl/geometries/tracks/cityscape/startbanner.js`
- `games/hexgl/geometries/tracks/cityscape/track.js`
- `games/hexgl/geometries/tracks/edge/track.js`

The original libraries are:

- `games/hexgl/libs/Three.dev.js` and `games/hexgl/libs/Three.r53.js` — old Three.js builds.
- `games/hexgl/libs/ShaderExtras.js` — shader collection.
- `games/hexgl/libs/Detector.js` — WebGL capability detection.
- `games/hexgl/libs/Stats.js` — performance panel.
- `games/hexgl/libs/DAT.GUI.min.js` — development controls.
- `games/hexgl/libs/leap-0.4.1.min.js` — Leap Motion input library.
- `games/hexgl/libs/postprocessing/BloomPass.js`, `DotScreenPass.js`, `EffectComposer.js`, `FilmPass.js`, `MaskPass.js`, `RenderPass.js`, `SavePass.js`, `ShaderPass.js`, and `TexturePass.js` — original post-processing pipeline.

The bundled editor tooling is not used by the AARAGE hub. It consists of `games/hexgl/libs/Editor.html` plus `games/hexgl/libs/Editor_files/App.js`, `CanvasRenderer.js`, `Diagram.js`, `Iterator.js`, `Links.js`, `ModuleList.js`, `Node.js`, `Parser.js`, `Project.js`, `Timer.js`, `ace.js`, `class.js`, `editor.css`, `font.css`, `gamecore.js`, `hashlist.js`, `jhashtable.js`, `jquery-1.8.js`, `kinetic.js`, `main.css`, `mode-json.js`, `pooled.js`, and `theme-monokai.js`. These provide the old editor UI, parser, node/diagram model, Ace editor, utility libraries, and editor styling.

### HexGL visual assets

The game has two texture quality trees with the same logical asset set. The full-quality tree is required when the practice page requests quality 3. Under both `games/hexgl/textures/` and `games/hexgl/textures.full/` are:

- `bonus/base/diffuse.jpg`, `bonus/base/normal.jpg`, `bonus/base/specular.jpg`
- `checker.png`
- `hud/hex.jpg`, `hud/hud-bg.png`, `hud/hud-fg-shield.png`, `hud/hud-fg-speed.png`
- `particles/cloud - Copie.png`, `particles/cloud.png`, `particles/damage.png`, `particles/spark - Copie.png`, `particles/spark.png`
- `ships/feisar/booster/booster.png`, `ships/feisar/booster/boostersprite.jpg`, `ships/feisar/diffuse.jpg`, `ships/feisar/normal.jpg`, `ships/feisar/specular.jpg`
- `skybox/dawnclouds/nx.jpg`, `ny.jpg`, `nz.jpg`, `px.jpg`, `py.jpg`, `pz.jpg`
- `tracks/cityscape/collision.png`, `diffuse.jpg`, `height.png`, `normal.jpg`, `specular.jpg`
- `tracks/cityscape/scrapers1/diffuse.jpg`, `normal.jpg`, `specular.jpg`
- `tracks/cityscape/scrapers2/diffuse.jpg`, `normal.jpg`, `specular.jpg`
- `tracks/cityscape/start/diffuse.jpg`, `normal.jpg`, `specular.jpg`, `start.jpg`

Other HexGL assets are:

- Audio: `games/hexgl/audio/bg.ogg`, `boost.ogg`, `crash.ogg`, `destroyed.ogg`, `wind.ogg`.
- Fonts: `games/hexgl/css/BebasNeue-webfont.eot`, `.svg`, `.ttf`, `.woff`.
- UI CSS/images: `games/hexgl/css/bg.jpg`, `help-0.png`, `help-1.png`, `help-2.png`, `help-3.png`, `mobile-controls-1.jpg`, `mobile-controls-2.jpg`, `mobile-over.jpg`, `mobile.jpg`, `title.png`, plus `fonts.css`, `multi.css`, and `touchcontroller.css`.
- App icons: `games/hexgl/favicon.png`, `icon_32.png`, `icon_64.png`, `icon_128.png`, `icon_256.png`.

### HexGL licensing note

`games/CREDITS.md` identifies HexGL as the BKcore/Thibaut Despoulain project and records its mixed licensing. The main game code includes CC BY-NC 3.0 material, other code is mostly MIT, and audio files have separate public-domain or Creative Commons terms. The document specifically warns that commercial shipping requires reviewing those licenses. The AARAGE integration adds `practice.html`; it does not replace the upstream game engine.

## 13. Root AARAGE assets

### Fighter and arena art

- `assets/favicon.svg` — landing-page favicon.
- `assets/img/background.png` — fighter arena background.
- `assets/img/preview-bg.png` — preview/background art.
- `assets/img/shop.png` — shop/related art.
- `assets/img/samuraiMack/Attack1.png`, `Attack2.png`, `Death.png`, `Fall.png`, `Idle.png`, `Jump.png`, `Run.png`, `Take Hit.png`, and `Take Hit - white silhouette.png` — P1 Samurai sprite sheets and hit silhouette.
- `assets/img/kenji/Attack1.png`, `Attack2.png`, `Death.png`, `Fall.png`, `Idle.png`, `Jump.png`, `Run.png`, and `Take hit.png` — P2 Kenji sprite sheets.

### 3D fighter model

- `assets/models/Soldier.glb` — Mixamo Soldier/Vanguard-style model loaded by `js/render3d.js`.
- `assets/models/CREDITS.md` — attribution and restrictions. Combat animation is procedural in code; the katana, arena, crowd, and VFX are generated by the renderer.

### Landing videos

- `assets/video/courtyard.mp4` and `courtyard-poster.jpg` — Japanese courtyard background.
- `assets/video/girl.mp4` and `girl-poster.jpg` — foreground character video.
- `assets/video/source/Female_samurai_holding_katana_1080p_20260918003004.mp4` — source video.
- `assets/video/source/Moonlit_Japanese_temple_courtyar…_1080p_20260918003450.mp4` — source video whose filename contains a Unicode ellipsis in the repository.

The two files in `assets/video/source/` are raw source media and are not the files referenced by the landing page.

## 14. Browser vendor files

The active hub vendors these files in `js/vendor`:

- `gsap.min.js` — GSAP used for health-bar/UI tweening.
- `three.min.js` — current Three.js runtime for the alternate fighter and pen renderers.
- `GLTFLoader.js` — loads `Soldier.glb`.
- `CopyShader.js`, `LuminosityHighPassShader.js`, `EffectComposer.js`, `ShaderPass.js`, `MaskPass.js`, `RenderPass.js`, and `UnrealBloomPass.js` — current Three.js post-processing/bloom dependencies.
- `ethers.umd.min.js` — browser Ethers v6 build for optional Web3 integration.

## 15. Tests and verification

### Test files

- `tests/run.js` — root runner that executes fight determinism, room protocol, room rounds, and room relay suites sequentially.
- `tests/fight-determinism.test.js` — loads browser modules into separate VM contexts with DOM stubs and runs 48 cross-context same-input/seed traces, checking identical frame/HP/position results and different-seed divergence.
- `tests/gemini-fallback.test.js` — standalone Gemini adapter checks: happy path, provider failures, malformed data, clamping/budgeting, disabled AI, local parser fallback, and nonsense prompts. It is not included in `tests/run.js`.
- `tests/rooms-protocol.test.js` — local BroadcastChannel handshake, no-room behavior, commit gating, same seed/result hash, tampering, room-code folding, leave, and heartbeat.
- `tests/rooms-rounds.test.js` — host nonce and round lifecycle, rematches, refresh/resume, new fighters, and new seeds.
- `tests/rooms-relay.test.js` — starts `server.js` on port 8431 and checks health, missing rooms, host join, full round, tampering, leave, and cleanup through SSE.

### Last verification snapshot

- `node tests/gemini-fallback.test.js`: **24 passed, 0 failed**.
- `node tests/run.js`: fight determinism, room protocol, and room rounds passed. The relay suite could not spawn `server.js` in the managed Windows environment and failed with `Error: spawn EPERM`; this is a process-permission/environment failure rather than a reported assertion failure.
- `npm test` from `contracts/`: Hardhat stopped with `HH505: A native version of solc failed to run` before contract assertions ran. Contract tests therefore remain present but are not verified in this environment.

## 16. How to run it

### Simple static play

From the repository root:

```text
python -m http.server 8080
```

Then open `http://localhost:8080/` for the landing page or `http://localhost:8080/play.html` for the arcade. This provides local parsing and the game, but not Gemini proxying or cross-machine rooms.

### Full local server

With Node 18 or newer:

```text
npm start
```

This runs `node server.js`, serving the site, `/api/health`, `/api/analyze`, and the in-memory room relay. Add Gemini key values to environment variables or the local `.env` file if live analysis is wanted. Do not expose a real `.env` file publicly.

### Root tests

```text
npm test
```

This runs `node tests/run.js`. The standalone Gemini test must be run separately with `node tests/gemini-fallback.test.js`.

### Contract development

From `contracts/`:

```text
npm install
npx hardhat compile
npm test
npx hardhat run scripts/deploy.js --network monadTestnet
```

The deployment script expects a deployer private key, Monad testnet RPC, and arbiter address in the contract environment. After deployment, addresses would need to be copied into `js/config.js` and `MONAD.USE_REAL_CHAIN` would need to be enabled. The browser settlement path still needs real signature generation and address handling before it should be treated as production-ready.

## 17. Deployment configuration

`render.yaml` defines a Node web service named `ai-fighter-arena`:

- Free plan, Oregon region.
- Build command `npm install`.
- Start command `node server.js`.
- Health check `/api/health`.
- Eight `GEMINI_API_KEY_1` through `GEMINI_API_KEY_8` environment variables marked `sync: false`.

The server's room map is process-local. Deployment must remain one long-lived instance for rooms to work. Horizontal scaling, serverless execution, or restart-persistent rooms are not implemented.

## 18. Documentation and attribution

- `README.md` documents the intended game story, local parser, combat geometry, visual effects, URL options, demo flow, and original inspirations.
- `deploy.md` documents the intended Monad contract deployment flow.
- `assets/models/CREDITS.md` covers the Soldier model and procedural replacement/generated content.
- `games/CREDITS.md` covers HexGL, code licenses, audio licenses, and commercial-shipping cautions.
- `games/hexgl/README.md` and `games/hexgl/LICENSE` are upstream HexGL documentation/license files.
- The root README credits the Fight-ME-Monk base, LuizMelo sprites, and GSAP; the current implementation adds substantial local game, renderer, room, server, and contract code.

## 19. Generated, ignored, and untracked content

The tracked source inventory is 284 files. The following local content is intentionally not part of that source inventory:

- `contracts/node_modules/` — installed contract dependencies.
- `contracts/artifacts/` — generated Hardhat contract artifacts.
- `contracts/cache/` — generated Hardhat compiler/cache data.
- `node_modules/` — ignored Node dependencies if installed at the root.
- `summary` — an existing untracked file without an extension; it was not modified by this documentation update.

The generated Hardhat directories are not application source and should not be described as hand-written contract files. The untracked `summary` file is also separate from this tracked `summary.md`.

## 20. Important current caveats

1. **Gemini is optional.** The local lexical parser is the reliable baseline; live Gemini depends on a configured key and the Node server.
2. **Rooms are in memory.** A server restart loses rooms, and more than one server instance will not share them.
3. **Monad is disabled by default.** Zero addresses and `USE_REAL_CHAIN: false` make the normal mint flow simulated.
4. **Real settlement is incomplete.** The current browser adapter uses a placeholder signature and hardcoded loser address in the real path.
5. **The HexGL subtree is legacy/vendor code.** It uses an old Three.js stack and mixed licenses; it is embedded for the racing mode rather than part of the new fighter engine.
6. **Contract verification is environment-sensitive.** The checked environment could not run the native Solidity compiler, so the contract test suite needs to be rerun in a working Hardhat/solc environment.
7. **The repository contains a tracked `.env`.** Secret values were not copied into this document, but the file should be untracked/rotated if it contains real credentials.

In short: the repository is a working local-first arcade with three game modes, deterministic simulations, an optional AI proxy, a two-transport room protocol, and a partially integrated Monad contract layer. The code paths needed for local play are present and tested more thoroughly than the production Web3/deployment path.