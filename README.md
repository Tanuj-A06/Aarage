# AARAGE

**Write a sentence. It becomes a fighter. Watch it fight. Bet on someone else's.**

A plain-English strategy is turned into three numbers, those numbers drive a
deterministic 60 FPS fight, and the crowd backs a side with real MON on Monad.
No controllers — nobody touches a key once the bell rings.

Live on **Monad Testnet** (chain `10143`):

|  |  |
| --- | --- |
| `ArenaBattle` | [`0x0329D1A516e9F5f8a89B48C4AD0515884f0652a5`](https://testnet.monadexplorer.com/address/0x0329D1A516e9F5f8a89B48C4AD0515884f0652a5) |
| `FighterNFT` | [`0xD12205ea18E336F2a4995Cc0Ef6226efaC48639F`](https://testnet.monadexplorer.com/address/0xD12205ea18E336F2a4995Cc0Ef6226efaC48639F) |
| Arbiter | `0x1F9326384C92d29915fd4EDD22797C3E664Dc651` |
| Protocol fee | 5% of the total pool |

---

## Run it

```bash
npm install          # one dependency: ethers
npm start            # http://localhost:8080
```

That is the whole setup. No build step, no bundler, no framework — the front
end is three HTML files and plain scripts, and one Node process serves them
alongside every API.

| Page | What it is |
| --- | --- |
| `/play.html` | The cabinet. Write two strategies, watch them fight. |
| `/spectate.html` | The floor. Every live match, the pools, and the bet. |
| `/api/health` | Is this deployment actually wired up. Answers without touching the network. |

Without a `.env` it still runs: the stat engine falls back to a local lexicon
and the markets run on paper, clearly labelled. Nothing pretends to be on
chain when it isn't.

### Environment

```bash
GEMINI_API_KEY_1=...        # the stat engine. _2.._8 optional, for headroom
ARBITER_PRIVATE_KEY=0x...   # 64 hex chars. Signs settlements, sends the
                            # arbiter-only calls. NOT the owner key.
MONAD_RPC=https://testnet-rpc.monad.xyz   # optional, this is the default
HOUSE_CHAIN_TABLES=2        # house tables that settle on chain (0 = spend nothing)
HOUSE_FLOOR=on              # the house floor itself
```

The arbiter address must equal what `ArenaBattle` holds as `arbiter`, or every
settlement is rejected. Check with `node scripts/set-arbiter.js`.

---

## How a match works

```text
prompt ──▶ stats ──▶ agent snapshot on chain ──▶ market ──▶ seed ──▶ fight ──▶ settle ──▶ claim
```

1. **Prompt → stats.** Gemini reads intent, not keywords: *"I'd rather run than
   trade hits"* is low aggression and high speed without the word "fast". The
   three stats share a **budget** (1.30–1.95 total), so every strategy gives
   something up. A lexicon in `js/prompt-parser.js` is the offline fallback.
2. **Both strategies go on chain**, hashed, before any money moves. You are
   betting on a specific prompt, model, model version, advisor config and
   simulation version — change any one and it is a different fighter.
3. **The market opens.** The arbiter commits to a seed *here*, while no pool
   exists to grind it against.
4. **The crowd backs a side.** The fight does not start until **someone has
   backed each fighter** — a pari-mutuel with one side empty pays nobody.
5. **The contract makes the seed** from the committed preimage, the close
   blockhash and the final pools. Nobody controls all three.
6. **The fight runs** — deterministically, from that seed. Every screen
   computes the same result independently.
7. **Settle and claim.** Payouts are pull-based: `claim()` covers winnings,
   refunds and voided markets in one call.

### The money

```text
total         = poolA + poolB
fee           = total × 5%
distributable = total − fee
payout(i)     = distributable × stake(i) / winningPool
```

A straight pari-mutuel: there are no player stakes, so the betting pool is the
only money in a match, and you are buying a proportional share of everything on
the table after the house cut.

**The fee comes off the total, which includes your own stake — so backing the
winner does not guarantee your stake back.** When the losing pool is smaller
than about 5.26% of the winning pool, there is less to share than the winners
put in:

| your stake | winning pool | losing pool | payout |
|  ---  |  ---  |  ---  |  ---  |
| 50 | 50 | 0 | 48 |
| 50 | 50 | 2 | 50 |
| 50 | 50 | 50 | 95 |
| 10 | 10 | 90 | 95 |

That is the honest shape of a rake on the total handle, and it is how real
parimutuel pools work. Two cases pay nothing and charge nothing — a draw, or
nobody backing the winner — and both void the market and refund everyone in
full.

---

## The parts that are interesting

**The fight is a pure function.** `(statsA, statsB, seed, playbooks)` → the same
knockout on every machine, forever. Every roll comes from a seeded `mulberry32`;
`Math.random()` appears in the engine exactly once, in the title-screen
flourish. This is what makes betting on it honest, and it is asserted rather
than assumed — `tests/fight-determinism.test.js` runs the engine in two
independent contexts and compares them frame by frame.

**JEV plans once, before the bell.** The tactical advisor returns a *playbook*
(RUSH / ZONE / BAIT / HUNT / TURTLE per phase), cached server-side by
`(matchId, side)`, then consulted synchronously during the fight. Calling a
model mid-fight would put network timing inside the simulation and let two
browsers crown different winners. Every tier-1 decision is logged and folded
into a `decisionHash` that goes into the settlement signature.

**The server runs the browser's engine.** For matches it settles, the server
must know the winner it signs — so `house/sim.js` loads `js/classes.js`,
`js/ai-controller.js` and `js/game.js` **unmodified** in a `vm` with the browser
stubbed out. Not a reimplementation: two implementations would agree on
ninety-nine fights and settle the hundredth against what the spectator watched.

**Spectators re-derive the fight.** The fight payload deliberately carries **no
winner** — the page runs the engine and reaches its own verdict. A desync
becomes visible instead of being papered over.

**The house floor.** A server with nobody on it is a dead demo, so it seats its
own tables from 16 hand-tuned prompts (`house/fixtures.js`). They use the same
contract, arbiter, relay and market rules as a human match, are labelled
`HOUSE` everywhere, and open **no market at all** unless someone is actually
watching — an idle deployment costs nothing.

---

## Layout

```text
server.js            one process: static files, stat engine, JEV cache,
                     rooms relay, match board, arbiter API
arbiter.js           EIP-712 settlement signer + the seed commitment
house/               matches this server runs
  market.js            one match, open → backers → seed → settle
  sim.js               the browser engine, headless
  director.js          the house floor
  rooms-chain.js       markets for rooms two humans opened
  fixtures.js          16 prompts, balance-tuned
js/                  the front end (no build step)
  prompt-parser.js     plain English → stats, offline
  game.js classes.js ai-controller.js   the deterministic engine
  jev.js               the tactical advisor
  spectate.js spectate-fight.js  the floor, and the fight on it
contracts/           ArenaBattle + FighterNFT (Hardhat, Solidity 0.8.24)
```

---

## Tests

```bash
npm test             # 8 suites, no dependencies
```

The ones worth knowing about:

- **fight-determinism** — two contexts, same seed, identical frame by frame.
  If this fails, betting is broken however well the networking works.
- **house-market** — no fight starts without a backer on each side; a market
  that lapses refunds whoever did bet. Run against a fake chain, because every
  branch costs gas on the real one.
- **house-balance** — no house pair is a foregone conclusion. The first draft
  had one at 93/7; all seven now sit inside 47–58%.
- **spectate-page** — the page's real script list, executed in order. Catches
  the global collisions that take a whole page down at parse time.

---

## What this does not claim

- **The arbiter can stall a match, not steal from one.** It has no withdrawal
  path and cannot change an agent or a result the contract will accept. If it
  goes silent, `voidMatch()` is permissionless after a timeout and everyone is
  refunded. A malicious arbiter costs you time, never your money.
- **The arbiter picks the seed preimage.** It commits before any pool exists,
  and the contract mixes in a blockhash that did not exist at commit time. To
  bias a match it would have to predict a future block.
- **A house match has one reporter.** A human match settles only when both
  browsers independently agree. The house has no players, so the server
  reports — which is why every house match says so on the board.
- **The fight is not verified on chain.** A 60 FPS simulation is not going to
  be. It is deterministic, reproducible from public inputs, and hashed into the
  settlement — which is the honest version of the trade.

Built for the Monad hackathon.
