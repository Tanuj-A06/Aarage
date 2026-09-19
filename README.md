# Train Your AI Fighter

**Train your AI fighter in 60 seconds, then fight someone else's.**

Two players each type a plain-English strategy. The prompt is parsed into
`{aggression, defense, speed}`, and two AI-controlled fighters battle it out
automatically — no human input once the bell rings. The winner is minted as an
NFT on Monad.



## Run it

There is **no build step**. No npm install, no bundler, no framework.

```bash
python -m http.server 8080
# then open http://localhost:8080
```

Use a local server rather than opening `index.html` directly — `file://` breaks
MetaMask injection, which the chain pass will need.

Everything runs **fully offline**. No CDN scripts, no webfonts, no audio files,
no API calls. gsap is vendored into `js/vendor/`; all sound is synthesised with
WebAudio at runtime.

---

## How it works

### The "AI" is keyword matching, not an LLM

Prompts are capped at a hard **200 words**, enforced live as you type (with a
word counter) rather than truncated at submit — a strategy cut in half would
lose its keywords and produce a fighter the player never asked for.

`js/prompt-parser.js` scans the prompt against a lexicon of ~220 terms and maps
them onto three stats. It handles intensifiers (`very`, `always`), diminishers
(`slightly`, `sometimes`), negation (`never attack` *reduces* aggression), and
multi-word compounds (`hit and run`, `run away`, `all out`).

This is deliberate. A real LLM call would add latency, a network dependency and
an API key to the one path that must never fail on stage. The parser runs
synchronously in well under a millisecond, so **the bars react live as you
type** — which is also the most fun part of the UI. The 3-second "ANALYZING
STRATEGY" screen is pure theatre.

Two details worth knowing:

- **Stat budget.** Stats are normalised to a total of ~1.95. Without this, a
  prompt that stacks every keyword just produces a strictly better fighter and
  prompts stop mattering. The budget forces every prompt to be a trade-off.
- **No degenerate fighters.** A prompt with no recognised keywords ("banana
  pancakes") is hashed into a distinct, playable stat line rather than a puddle
  of averages — and the UI says it is improvising.

### The fighters run a three-tier agent loop

`js/ai-controller.js` is modelled on how agent-driven games actually work:

| tier | rate | job |
|---|---|---|
| **PLAN** | every ~1–2s, or on a big event | pick a game plan: RUSH / ZONE / BAIT / HUNT / TURTLE |
| **UTILITY** | every 6–14 frames | *score* every candidate action, pick weighted-randomly among the positives |
| **REFLEX** | every frame | stun lockout, attack commitment, dodge the opponent's windup, punish |

The slow-plan / fast-execute split is the same shape LLM-agent games (Voyager,
Generative Agents) use — we just derive the plan from stats and an opponent
model instead of from a language model, so it costs microseconds and never
stalls a frame.

The **UTILITY** tier is the thing that keeps fights from looking like a loop.
Instead of a cascade of `if (rand < p)` thresholds, each action is scored
against considerations — range error, cooldown readiness, opponent stunned /
recovering / airborne, health, plan bias — and the scores slide continuously.
This is Utility AI (IAUS), the approach The Sims and Guild Wars 2 use.

Each AI also keeps an **opponent model**: exponential moving averages of how
often the other fighter jumps, attacks and whiffs. Jump into someone who
attacks a lot and you get hit out of the air, so the score for jumping drops;
face someone who whiffs a lot and the HUNT (whiff-punish) plan gets weighted up.
That is what makes the fighters look like they are reading each other.

It is still a **virtual keyboard** — it writes into the same `keys` object the
human controls used. That keeps upstream's movement and sprite logic on the
path it was written for, in particular `handleMovement()`'s unconditional
`switchSprite('run'/'idle')` every frame, which is the only thing that releases
a fighter from a finished attack animation. It also means `?human=1` still
works, so you can play one side to tell an AI bug from a geometry bug.

`HOLD` never means standing still — it runs footsies, shuffling in and out
around a preferred distance, which doubles as whiff bait.

### Arena geometry (the thing that constrains everything)

Neither sprite sheet has a mirrored variant, so **the fighters must never cross
over** — if they did, both attack boxes would point away from the opponent and
no hit could ever land again. `resolveSeparation()` enforces a hard 70px floor.

With `d = enemy.x - player.x`, both fighters can land a hit in `d ∈ [70, 220]`.
The AI targets ~140–195 depending on its stats; turtles hover a body-length
further out than berserkers, which is the clearest visual tell of a defensive
prompt.

### Nobody gets a boring fight

From 7 seconds, a global `pressure` term ramps to 1.0 at 18s: retreat decays,
aggression climbs, cooldowns shorten, the comfortable distance shrinks and
damage scales up. At 20s it becomes **SUDDEN DEATH** — retreat is disabled and
damage doubles.

This is why two cowardly prompts still produce a finish (~22s average) instead
of a 30-second standoff, and the last few seconds are the most exciting part of
the fight. It is a feature the audience can see, not a hidden fudge.

### What's animated

The eight sprite animations that ship with the artwork (idle, run, jump, fall,
attack1, attack2, takeHit, death) are all wired — upstream never used Attack2,
so combos alternate between the two swings. Everything else is procedural, in
`js/fx.js`, `js/scene3d.js` and `Fighter.render()` / `Fighter.drawFX()`.

**The characters.** Every effect on a fighter is a flat-coloured silhouette of
the exact frame being drawn, so it can never desync from the animation. Sheets
are baked once into tinted copies (`silhouetteOf`) with a `source-in`
composite and reused — no `ctx.filter`, which is slow and was a silent no-op in
Safari for years.

- **Rim glow** in each fighter's colour, eight offset silhouettes. Swells on
  the wind-up and burns red with rage, and separates the sprites from a busy
  backdrop at projector distance
- **Anticipation** — a crouch before every swing, timed to stretch out exactly
  on the damage frame
- **Knockback slide** — the sim teleports the defender `KNOCKBACK` px; the
  sprite starts where it stood and catches up over ~8 frames, so weight
  visibly transfers instead of both bodies snapping to new coordinates
- **Hit flash** — a white stamp on contact. Only the Samurai sheet ships a
  silhouette take-hit frame, so without this the same hit read softer on P2
- **Motion smear**, **idle breathing**, **squash & stretch**, **ground
  shadows** that stretch with a sprint and stay planted during a slide
- **Speed afterimages** as neon ghosts, and a **rage flare** that beats faster
  the closer to death a fighter gets — rage drives damage, cooldown and speed,
  and had no tell before

> The body itself is always drawn at full opacity. Ghost layers sit strictly
> behind it and stay tight — an early pass had a scaled-up white wind-up ghost
> and a trail sample at the fighter's own position, and the fighters stopped
> reading as solid. If you can pick a smear out as a shape, it's too strong.

**The hit.** Hitstop (4–6 frames of frozen physics), camera punch and a held
KO push, screen shake, white flash, a directional **shockwave**, a **contact
starburst**, streaked **sparks**, dust scuffs, and **damage numbers** that pop
before they drift, sized by damage.

**The arena.** A crowd that comes off its seats and throws its arms up when the
fight heats up, sweeping coloured **spotlights** across the deck, camera dolly
and roll, background parallax, KO slow-motion, and a sudden-death vignette with
the cabinet bezel pulsing red.

**The UI** (`styles.css`): screen entrances, staggered stacks, a rolling CRT
band and flicker, attract-mode pulse on INSERT COIN, health bars with energy
flowing through them, an announce that overshoots and throws a shockwave, and
per-line log entrances. Honours `prefers-reduced-motion`; the canvas layer does
not yet.

All of it is render-layer only. Verified: across 150 fights, the same seed
replays to an identical outcome, and a fight driven through the full render
path lands on the same result as the same fight run headlessly.

---

## URL parameters

| param | effect |
|---|---|
| `?p1=...&p2=...` | pre-fill both prompts |
| `&auto=1` | skip straight past prompt entry into the fight |
| `?seed=N` | replay an exact fight — fights are fully deterministic |
| `?bench=200` | headless balance run, results via `console.table` |
| `?human=1` | drive P1 yourself (`a`/`d` move, `w` jump, space attack) |
| `?hitboxes=1` | draw body and attack boxes |

**Demo tip:** bookmark a `?p1=...&p2=...&seed=...&auto=1` URL. Typing prompts
live on a projector while nervous is a known way to lose two minutes. When
rehearsal throws a great fight, the seed is shown bottom-right on the HUD —
write it down.

---

## Balance

`?bench=200` runs every archetype matchup headlessly and prints win rates,
average duration and KO rate. Current state:

- Mirror matches sit between 44/56 and 54/46 — essentially even.
- The matrix is antisymmetric (berserker-vs-turtle 93/7 mirrors
  turtle-vs-berserker 8/93), which is what proves results depend on the
  archetype and not on which side you were given.
- Durations run 7.6s (berserker mirror) to 22.4s (coward mirror).
- No archetype dominates: assassin beats berserker, berserker beats turtle,
  turtle beats coward, balanced beats turtle. Aggression is strong but not a
  free win.

### Six side-biases the bench caught

P1 originally lost almost every fight. All six were invisible without
thousands of simulated rounds:

| bug | effect |
|---|---|
| Double KO was always awarded to P2 | biggest single cause; aggressive mirrors trade most |
| Damage timing keyed off sprite frames — P1 telegraphed 12 frames, P2 only 10 | P1 whiffed ~7% more |
| Samurai's attack animation ran 30 frames vs the Monk's 20 | P1 locked helpless 50% longer per swing |
| Hits resolved sequentially, so P1's hit cancelled P2's on the same frame | P1 won every simultaneous trade (the *opposite* bias) |
| `hitMin` 50 vs 0 damped P1's close-range attack score | P2 got ~5% more attacks |
| Start positions gave P2 54px more retreat room | P1 cornered first |

Two more that were not side-biases but broke the game: the AI attacked while
airborne (geometrically impossible to connect), and `MAX_KITE` was *below* the
220 strike ceiling, so retreating could never take a fighter out of reach —
nobody ever whiffed, so whiff-punishing never fired and defensive prompts had
no way to win.

The main balance dials are `CONFIG.cooldown`, `CONFIG.baseDamage` and
`CONFIG.ATTACK_STARTUP` in `js/config.js`. Re-run the bench after touching any
of them.

---

## Project layout

```
index.html              markup for every screen
styles.css              arcade cabinet: solid fills, hard borders, no glass
js/config.js            every tunable number + the arena geometry note
js/utils.js             math, seeded PRNG, collision
js/classes.js           Sprite / Fighter
js/prompt-parser.js     prompt -> stats (pure, no DOM)
js/ai-controller.js     the fighter brains
js/fx.js                WebAudio SFX + the whole effects layer
js/game.js              arena, loop, hit resolution, ?bench
js/ui.js                screen flow, live parsing, HUD, winner
js/blockchain.js        SIMULATED mint (see below)
js/vendor/gsap.min.js   vendored, not CDN
assets/img/             sprites from the upstream repo
```

---

## Blockchain: not wired yet

`js/blockchain.js` currently runs a **simulated** mint — the full sequence and
success screen, with no wallet and no network. The success screen is labelled
`SIMULATED` on purpose: a placeholder tx hash shown to judges as a real
on-chain mint is the kind of thing that sinks a submission the moment somebody
opens the explorer.

Everything the real path needs is captured at fight end in a single
`UI.pendingMint` object — `{ prompt, stats, archetype, won, hpRemaining,
durationMs, seed, timestamp }`. That is the whole interface.

Decisions already made for that pass:

- **Monad Testnet**, chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`,
  explorer `https://testnet.monadexplorer.com`, faucet `https://faucet.monad.xyz`
- **Fully on-chain metadata** — the contract stores the prompt and stats and
  builds `tokenURI` as Base64 JSON with a generated SVG. No IPFS, no pinning
  service, no API key, nothing to fail live.
- **Deploy via Remix**, no Hardhat and no private key on disk.

`MONAD` in `js/config.js` already holds the network config and a
`USE_REAL_CHAIN` flag.

---

## Demo script (2 minutes)

1. *"Two prompts. No controllers. Nobody touches a key after this."*
   P1: `relentless berserker, attack without mercy, never back down`
   P2: `patient counter-puncher, stay out of range, punish mistakes`
2. Keyword chips fly into the stat bars as you type. Lock in.
3. ANALYZING → character-select reveal: **BERSERKER** vs **TACTICIAN**.
4. ~11 second fight. The berserker rushes and hugs close with a red aura; the
   tactician holds a longer distance, dodge-jumps, and punishes the stun for
   multi-hit chains. K.O. with hitstop, screen shake and a crowd cheer.
5. Winner screen shows the winning prompt → **MINT ON MONAD**.

---

## Credits

- Game base: [Ali-Cheikh/Fight-ME-Monk](https://github.com/Ali-Cheikh/Fight-ME-Monk) (MIT), Chris Courses lineage
- Sprites: LuizMelo (Martial Hero 1 & 2)
- gsap 3.9.1, vendored locally
