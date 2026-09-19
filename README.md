# AARAGE — AI Agent Battle Arena on Monad

**Build an AI fighter, reveal its strategy, bet on the outcome, watch them fight, and let Monad settle the result on-chain.**

AARAGE is an autonomous, prompt-driven AI combat simulation and decentralized betting arena built for Monad Testnet. Two players define plain-English tactical strategies, which are compiled into balanced combat attributes. Strategies are publicly revealed for pre-match pari-mutuel spectator betting, battles play out deterministically with autonomous utility-AI agents, and results are cryptographically settled on Monad with fair payout distribution and dynamic victory NFT minting.

---

## 🏆 Hackathon & Deployment Links

| Resource | Link / Address |
|---|---|
| **Live Public Application** | [https://gamingnft.onrender.com/](https://gamingnft.onrender.com/) |
| **Arena Battle Contract (`ArenaBattle.sol`)** | [`0x0329D1A516e9F5f8a89B48C4AD0515884f0652a5`](https://testnet.monadvision.com/address/0x0329D1A516e9F5f8a89B48C4AD0515884f0652a5) |
| **Deployer / Arbiter / Fighter Contract** | [`0x1F9326384C92d29915fd4EDD22797C3E664Dc651`](https://testnet.monadvision.com/address/0x1F9326384C92d29915fd4EDD22797C3E664Dc651) |
| **Fighter NFT Contract (`FighterNFT.sol`)** | [`0xD12205ea18E336F2a4995Cc0Ef6226efaC48639F`](https://testnet.monadvision.com/address/0xD12205ea18E336F2a4995Cc0Ef6226efaC48639F) |
| **Network** | Monad Testnet (Chain ID `10143`) |
| **Testnet RPC** | `https://testnet-rpc.monad.xyz` |
| **MonadVision Explorer** | [https://testnet.monadvision.com](https://testnet.monadvision.com) |

---

## ⚡ The Core Product Loop

```text
[ Player Prompts ] ──> [ Strategy Analysis & Stat Normalization ]
                                    │
                                    ▼
[ Pre-Match Betting Window ] ──> [ On-Chain Escrow Pool (ArenaBattle.sol) ]
                                    │
                                    ▼
[ Autonomous 60 Hz Combat ]  ──> [ Deterministic Simulation & Result Digest ]
                                    │
                                    ▼
[ EIP-712 Settlement ]       ──> [ 95% Distributed to Winning Bettors / 5% Fee ]
                                    │
                                    ▼
                             [ Dynamic Winner NFT Minted on Monad ]
```

1. **Strategy Creation**: Two fighters receive plain-English instructions (e.g. *"patient counter-puncher, stay out of reach, punish whiffs"*).
2. **Strategy Reveal**: Both fighter profiles, tactical archetype names, and normalized stats are revealed publicly on the betting board.
3. **Pre-Match Pari-Mutuel Escrow**: Spectators and players place bets in MON directly into the `ArenaBattle` contract before the match starts.
4. **Deterministic Battle**: Once betting closes, a committed seed unseals the fight. Two autonomous agents run at 60 Hz without human intervention.
5. **On-Chain Settlement**: The match arbiter generates an EIP-712 cryptographic settlement signature binding the match ID, seed, agent hashes, and outcome digest.
6. **Payout & NFT Mint**: 95% of the escrow pool is unlocked for proportional withdrawal by winning bettors (5% protocol fee). The winning fighter is minted as an on-chain NFT receipt.

---

## 🔗 Smart Contract Architecture

The contracts run on Monad Testnet and enforce strict economic invariants:

### 1. `ArenaBattle.sol` ([`0x0329D1A516e9F5f8a89B48C4AD0515884f0652a5`](https://testnet.monadvision.com/address/0x0329D1A516e9F5f8a89B48C4AD0515884f0652a5))
- **Strict Pari-Mutuel Escrow**: All bets are locked before fight execution.
- **Commit-Reveal Seed Scheme**: Seeds are committed before pools open, preventing frontrunning of deterministic simulation outcomes.
- **EIP-712 Cryptographic Verification**: Settles matches using typed structured signatures (`settleMatch`). Verifies match parameters, winner, finish type (KO / Timeout / Draw), simulation version, and result digest.
- **Pull-Payment Pattern**: Winnings and refunds are claimed individually (`claim()`) rather than pushed in loops, preventing reentrancy and denial-of-service vulnerabilities.
- **Void & Refund Guarantees**: Unresolved matches or draws automatically unlock 100% principal refunds with zero fee deduction.

### 2. `FighterNFT.sol` ([`0xD12205ea18E336F2a4995Cc0Ef6226efaC48639F`](https://testnet.monadvision.com/address/0xD12205ea18E336F2a4995Cc0Ef6226efaC48639F))
- **On-Chain Victory Receipts**: Minted automatically upon match settlement exclusively via authorized arena calls.
- **Metadata & Dynamic Attributes**: Records fighter archetype, stats (`aggression`, `defense`, `speed`), winning prompt, and match seed.

---

## 🧠 Autonomous AI & Simulation Engine

### Dual-Layer Prompt Compilation
- **Primary / Fallback Engine (`js/prompt-parser.js`)**: A deterministic zero-latency lexicon parser (~220 combat terms). Handles intensifiers (*"very"*, *"always"*), diminishers (*"slightly"*), negation (*"never attack"* lowers aggression), and compounds (*"hit and run"*).
- **Gemini Tactical Advisor (`server.js` + `js/gemini.js`)**: Optional server-side LLM analysis (Gemini 3.6 Flash) extracting fighter personality, archetype names, and tactical traits with graceful fallback to local parsing.
- **Stat Budgeting**: Total stats are strictly normalized to ~1.95 (`aggression + defense + speed`). Players cannot create all-max fighters; every prompt requires strategic trade-offs.

### Three-Tier Agent Decision Loop (`js/ai-controller.js`)
Inspired by agent-driven game architectures (The Sims IAUS / Guild Wars):
- **Plan Tier (~1–2s)**: Selects macro game plan (`RUSH`, `ZONE`, `BAIT`, `HUNT`, `TURTLE`).
- **Utility Tier (every 6–14 frames)**: Continuously scores candidate actions against dynamic considerations (range error, attack cooldowns, opponent recovery state, health differentials).
- **Reflex Tier (every frame)**: Handles hitstop, stun lockouts, commitment windows, and instant punish reflexes.
- **Opponent Modeling**: Exponential moving averages track opponent jump frequency, whiff rates, and aggression tendencies to adapt mid-match.

### Deterministic Arena Physics
- **Fixed 60 Hz Simulation**: Identical match seeds produce 100% reproducible fight trajectories, verifiable headlessly or in-browser.
- **Non-Crossing Arena Geometry**: Prevents sprite orientation desync with a strict 70px mutual separation floor.
- **Pressure Ramp & Sudden Death**: At 7s, global pressure begins ramping; at 20s, sudden death disables retreat and doubles damage, preventing stall matches and guaranteeing decisive finishes within ~24 seconds.

---

## 🛠️ Local Development & Quickstart

The application can run fully local with zero external build step.

### Prerequisites
- Node.js 18+ (for relay server, arbiter, and Gemini proxy)

### Quick Run
```bash
# Clone the repository
git clone https://github.com/Tanuj-A06/Aarage.git
cd Aarage

# Install dependencies (ethers)
npm install

# Start the local server
npm start
# Server listens on http://localhost:8080
```

Open `http://localhost:8080` in your browser. Connect MetaMask to **Monad Testnet** to test betting and on-chain settlements.

---

## 🎮 URL Controls & Debugging

| Parameter | Effect |
|---|---|
| `?p1=...&p2=...` | Pre-fill player prompts |
| `&auto=1` | Skip directly from prompt configuration into the match |
| `?seed=N` | Replay an exact deterministic fight seed |
| `?bench=200` | Headless balance run of 200 matches with matrix metrics |
| `?noai=1` | Force offline local lexicon parser (bypass Gemini) |
| `?hitboxes=1` | Render physical hurtboxes and attack strike boundaries |
| `?human=1` | Manual control of Fighter 1 (`A`/`D` move, `W` jump, `Space` attack) |

---

## 📁 Repository Structure

```
├── index.html              # Public landing page & arcade entry
├── play.html               # Arena UI shell & HUD
├── styles.css              # Arcade cabinet styling & CRT shaders
├── server.js               # Static server, Gemini proxy, rooms relay & arbiter
├── arbiter.js              # EIP-712 settlement signature signer
├── js/
│   ├── config.js           # Balance parameters & Monad contract configuration
│   ├── game.js             # Fixed 60 Hz simulation loop & hit resolution
│   ├── ai-controller.js    # Utility AI, reflex tier & opponent modeling
│   ├── prompt-parser.js    # Lexicon strategy parser & stat normalizer
│   ├── blockchain.js       # Ethers.js Monad provider, contract calls & betting flow
│   ├── classes.js          # Fighter & Sprite simulation classes
│   ├── fx.js               # WebAudio sound synthesizers & visual FX
│   └── ui.js               # Screen flow, wallet connection & settlement display
├── contracts/
│   ├── contracts/
│   │   ├── ArenaBattle.sol # Pari-mutuel betting escrow & EIP-712 settlement
│   │   ├── FighterNFT.sol  # Dynamic victory NFT contract
│   │   └── AgentTypes.sol  # Structs and hashing utilities
│   ├── scripts/deploy.js   # Hardhat deployment script for Monad
│   └── hardhat.config.js   # Monad testnet network configuration
```

---

## 📜 Credits & License

- **Base Sprites**: LuizMelo (Martial Hero 1 & 2)
- **Engine Heritage**: Ali-Cheikh (Fight-ME-Monk)
- **License**: MIT
