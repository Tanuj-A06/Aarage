# AARAGE — Monad AI Agent Battle Arena
## Implementation Prompt for Coding Agent

You are the primary implementation agent for this repository.

Build the project described below by modifying the existing AARAGE codebase rather than creating an unrelated application from scratch.

Before making substantial changes, inspect the current repository and understand the existing implementation. A repository summary is available at `summary.md` and should be treated as the current source-of-truth for the existing architecture and limitations.

---

# 1. Product vision

Transform AARAGE from a multi-game browser arcade into a focused **AI Agent Battle Arena on Monad**.

The core product loop is:

1. Two players create/configure autonomous AI fighters.
2. Each player's strategy is made publicly visible.
3. Spectators inspect both strategies before betting.
4. Betting is strictly **pre-match**.
5. Players are also allowed to bet on their own match.
6. Betting funds are held by a **Monad smart contract pool/escrow**, not by a normal backend-controlled wallet.
7. The match runs using autonomous agents.
8. **JEV is used as the strategy/tactical advisor**, not as a frame-by-frame physics engine.
9. The actual combat simulation remains deterministic.
10. The winner is settled on Monad.
11. 5% of the settled pool is the platform fee.
12. The remaining 95% is distributed fairly/proportionally among bettors on the winning side.
13. The winner receives an NFT minted on Monad as an on-chain victory receipt.

The product should feel like:

> Build an AI fighter → reveal its strategy → bet on AI fighters → watch them fight → Monad settles the result → winner NFT is minted.

Do NOT retain Pen Fight 3D or HexGL as product modes.

---

# 2. Remove / simplify

Remove the following from the user-facing product:

- Pen Fight 3D
- Hex Racer / HexGL
- Any navigation/cards/UI that presents these as available games
- Any betting logic specific to these removed modes
- Any minting logic that is tied specifically to those removed modes

You may leave legacy source files temporarily if doing so avoids unnecessary breakage, but they must not remain part of the active product flow unless there is a clear technical reason.

The main product should become the AI fighter arena.

---

# 3. Existing repository context

The current repository already has:

- deterministic AI Fighter combat
- prompt parsing
- optional Gemini analysis
- autonomous keyboard-like fighter control
- deterministic seeded simulation
- online rooms with prompt commit/reveal
- result digests
- an existing Monad browser adapter
- `FighterNFT.sol`
- `ArenaBattle.sol`
- player stakes
- spectator betting
- payout/claim logic
- winner NFT minting
- Hardhat contract project

The current repository summary reports important limitations:

- Monad live mode is currently disabled by default.
- Frontend Monad addresses are currently zero-address placeholders.
- The current browser settlement path uses a placeholder signature/hardcoded loser address.
- Contract tests have not been successfully executed in the current environment.
- The current room relay is in-memory and not suitable for horizontal scaling.
- A `.env` file is tracked and represents a security risk.

Do not assume the existing Web3 implementation is production-ready. Audit it and repair it as part of this work.

---

# 4. Core architecture

Use this conceptual architecture:

```text
                    AARAGE
                       |
             +---------+---------+
             |                   |
         Agent A             Agent B
             |                   |
      Agent Snapshot A    Agent Snapshot B
             |                   |
             +---------+---------+
                       |
              Strategies PUBLIC
                       |
                 BETTING OPEN
                       |
                 BETTING CLOSE
                       |
                MATCH LOCKED
                       |
                 Match Seed
                       |
                 JEV ADVISOR
                       |
            Deterministic Controller
                       |
              60 FPS Game Engine
                       |
                  RESULT DIGEST
                       |
              Monad Settlement
                /           \
               /             \
        5% platform fee    95% payout pool
                                 |
                        Winning Bettors
                                 |
                         Winner NFT Mint
```

The design principle is:

> Once betting opens, nothing controlled by either player may alter the economic identity of the agent or the rules of the match.

---

# 5. Agent Snapshot

Create a first-class concept of an immutable **Agent Snapshot**.

A spectator is betting on a specific agent snapshot, not simply on a wallet address or player name.

An Agent Snapshot should conceptually include:

- agent ID
- owner/player address
- prompt
- model identifier
- model version
- JEV configuration/version information
- strategy/configuration hash
- game/simulation version
- parsed stats/archetype if those are still part of the combat model
- any other field that materially changes how the agent behaves

Example:

```text
Agent #A102
Owner: 0x...
Prompt:
"Play defensively and punish overextension."

Model: JEV
Model Version: ...
JEV Config Hash: 0x...
Simulation Version: ...
Strategy Hash: 0x...
```

Once an Agent Snapshot is locked for a match:

- the prompt cannot change
- the model cannot change
- the JEV configuration cannot change
- the strategy/configuration cannot change
- the simulation version/rules for that match cannot change

The UI should make it obvious that bettors are betting on the immutable snapshot.

---

# 6. Public strategy requirement

The strategies must be visible **before betting starts**.

Desired match lifecycle:

```text
CREATE MATCH
    |
    v
SUBMIT AGENT A
SUBMIT AGENT B
    |
    v
LOCK AGENT SNAPSHOTS
    |
    v
DISPLAY STRATEGIES
    |
    v
BETTING OPENS
    |
    v
BETTING CLOSES
    |
    v
MATCH STARTS
```

Do not hide the strategies using a commit/reveal flow if that conflicts with this product requirement.

A commitment/hash may still be recorded to prove that the public strategy/configuration was not changed after betting opened.

---

# 7. Betting model

Betting MUST be pre-match.

There is NO in-play betting in this version.

Players are allowed to bet.

Spectators are allowed to bet.

The betting pool must be held by a smart contract / contract escrow on Monad.

Do NOT depend on a backend-controlled EOA wallet to custody user funds.

Desired conceptual flow:

```text
User wallet
    |
    | deposit native MON
    v
Monad Arena Contract
    |
    +--> Match Pool
          |
          +--> A side
          +--> B side
          |
          +--> 5% platform fee
          |
          +--> 95% distributable pool
```

The contract must own custody of the funds during the match.

---

# 8. Betting economics

Use a pari-mutuel pool model.

Let:

```text
totalPool = total amount bet on A + total amount bet on B
fee = totalPool * 5%
distributablePool = totalPool - fee
```

If A wins:

```text
payout_i = distributablePool * (bettor_i_stake / totalAmountBetOnA)
```

If B wins:

```text
payout_i = distributablePool * (bettor_i_stake / totalAmountBetOnB)
```

The payout must be proportional to each bettor's contribution to the winning side.

Example:

```text
A bets = 60 MON
B bets = 40 MON
Total = 100 MON

5% fee = 5 MON
Distributable = 95 MON

If A wins:

Alice bet 20 MON on A
Bob   bet 30 MON on A
Carol bet 10 MON on A

Alice receives 95 * (20 / 60)
Bob   receives 95 * (30 / 60)
Carol receives 95 * (10 / 60)
```

Use integer-safe Solidity arithmetic and explicitly account for rounding dust.

The implementation must define where unavoidable rounding remainder goes. Prefer a deterministic rule that cannot be exploited.

---

# 9. No winning bettors

Handle the edge case explicitly.

Example:

```text
A side = 100 MON
B side = 0 MON
B wins
```

There are no winning-side bettors.

Recommended behavior:

- void the betting distribution for that match
- refund eligible bets
- do not charge the 5% platform fee on a voided/refunded market

Implement this deterministically in the contract and document it in the UI.

If the existing contract already has a refund behavior, audit it rather than blindly replacing it.

---

# 10. Fee locking

The platform fee must be snapshotted per match.

When the match is created:

```text
match.feeBps = currentFeeBps
```

After that, the fee for that match must not change.

Do not allow an admin/owner to change the economics of a live betting market after users have deposited funds.

Use a basis-point representation in the contract.

Default:

```text
500 bps = 5%
```

---

# 11. Betting lifecycle and state machine

Use an explicit match state machine.

At minimum:

```text
CREATED
AGENTS_LOCKED
BETTING_OPEN
BETTING_CLOSED
LIVE
SETTLED
CANCELLED
VOIDED
```

Only valid state transitions should be possible.

Example:

```text
CREATED
  -> AGENTS_LOCKED
  -> BETTING_OPEN
  -> BETTING_CLOSED
  -> LIVE
  -> SETTLED
```

Possible failure paths:

```text
CREATED -> CANCELLED
BETTING_OPEN -> CANCELLED
BETTING_CLOSED -> VOIDED
LIVE -> VOIDED
```

Design the exact transitions based on the existing contract architecture.

Every state-changing action must have appropriate authorization and reentrancy protection.

---

# 12. Player betting

Players may bet on themselves or the opponent.

Do NOT block betting solely because the bettor owns one of the participating addresses.

Because strategies are public before betting, self-betting is an explicit product decision.

However, enforce the following:

- betting must end before the match starts
- the agent snapshot cannot change after betting begins
- the match seed cannot be selected after betting closes by a player who can manipulate the result
- all meaningful match configuration must be locked before betting closes

---

# 13. Randomness / seed fairness

Do not allow a player to choose a favorable seed after seeing the betting pool.

Use an explicit fair-seed mechanism.

You may adapt the existing deterministic room mechanism, but for real-money/value-bearing matches the seed generation must not be under unilateral control of one player.

The seed should be generated only after betting is closed.

The design should provide a clear anti-grinding story.

Do NOT use:

```text
player chooses seed
```

or:

```text
player can repeatedly try seeds until favorable
```

If an off-chain arbiter is used for the hackathon, document exactly what the arbiter can and cannot control.

---

# 14. JEV integration

JEV is the **strategy/tactical advisor**.

Do NOT call JEV every 60 FPS frame.

Instead:

```text
Game state
    |
    v
JEV tactical decision
    |
    v
RUSH / ZONE / BAIT / DEFEND / RETREAT / etc.
    |
    v
Deterministic controller
    |
    v
60 FPS simulation
```

JEV should operate at a much lower decision cadence than the physics/combat loop.

The deterministic game engine remains responsible for:

- movement
- attacks
- collision
- hit detection
- health
- timing
- knockback
- KO
- timeout
- rendering state

JEV should influence tactical intent, not replace the game engine.

---

# 15. JEV reproducibility / auditability

A live external model introduces nondeterminism.

Handle this explicitly.

For each JEV decision, record enough information to audit the decision sequence.

Conceptually:

```text
matchId
agentId
model
modelVersion
agentConfigHash
decisionSequenceNumber
stateSummary / state hash
decision
decision metadata if applicable
```

Generate a match-level decision hash:

```text
decisionHash = H(all recorded JEV decisions)
```

Generate a final result digest that commits to the relevant match inputs:

```text
matchId
agent hashes
seed
game/simulation version
decision hash
winner
finish type
final state/result
```

The exact digest construction may be adapted to the current repository, but it must be deterministic and documented.

Important:

- Do not put enormous raw decision logs on-chain.
- Store hashes/commitments on-chain.
- Keep detailed logs off-chain for replay/audit where appropriate.

---

# 16. Model/configuration locking

Anything that can materially change the agent's behavior must be part of the locked snapshot.

At minimum think about:

```text
prompt
model name
model version
JEV version
JEV configuration
system/instruction configuration
available actions
simulation/game version
stats/archetype generation rules
```

Do not allow:

```text
Visible prompt = same
Hidden model configuration = changed after betting
```

That would let a player change the actual agent while appearing not to change its strategy.

---

# 17. Smart contract design

Audit and refactor `ArenaBattle.sol` as needed.

The contract should:

- create a match
- store immutable/snapshotted match economics
- associate the two Agent Snapshots
- accept native MON betting
- track side-A and side-B betting totals
- prevent betting after the betting deadline/state transition
- prevent invalid deposits
- settle exactly once
- calculate the 5% fee
- calculate proportional winner payouts
- support safe claiming
- handle void/refund cases
- handle cancellation/timeout
- prevent reentrancy
- prevent double claims
- prevent unauthorized settlement
- emit useful events

Events should be sufficient for a frontend/indexer to reconstruct match state.

---

# 18. Settlement trust model

The current code uses an arbiter-signed settlement architecture.

You may keep an arbiter approach for the hackathon, but make it technically robust.

Use typed structured signing such as EIP-712 if compatible with the chosen implementation.

The signed settlement should bind as much of the following as practical:

```text
chainId
contract address
matchId
agentA
agentB
agent snapshot hashes
prompt/config hashes
seed
winner
finish type
result digest
decision hash
simulation version
```

Prevent signature replay across:

- different matches
- different contracts
- different chains
- different deployments

Do not leave placeholder signatures or hardcoded loser addresses in the production path.

Make all participant addresses explicit in settlement data.

---

# 19. NFT

The winner NFT is central to the product.

Mint it only after successful match settlement.

The NFT should represent:

> An on-chain victory receipt for a specific autonomous agent match on Monad.

Use the existing `FighterNFT.sol` as a starting point.

Prefer storing hashes/concise metadata rather than permanently storing arbitrary sensitive raw prompts on-chain.

Potential NFT metadata:

```text
Match ID
Winner Agent ID
Winner address
Opponent Agent ID
Result
Finish type
Seed
Agent Snapshot hash
Decision hash
Game/simulation version
Timestamp
```

The NFT may continue to use an on-chain SVG if that is already part of the design.

A draw should not mint a winner NFT.

---

# 20. Monad

Monad is a core requirement, not an optional decorative integration.

The final working flow should demonstrate actual Monad usage:

```text
Connect wallet
    ↓
Create / join match
    ↓
Fund bet
    ↓
Fight
    ↓
Settle on Monad
    ↓
Claim payout
    ↓
Winner NFT minted on Monad
```

Use the existing Monad testnet configuration in the repository where appropriate, including the existing chain ID configuration.

Do not present simulated minting as if it were real on-chain minting.

If there is a demo mode, label it clearly as demo/simulation.

---

# 21. Frontend UX

The game should feel like one cohesive betting arena.

Recommended screens:

## Match Lobby

Show:

```text
MATCH #123

AGENT A
Name
Owner
Prompt
Model
Strategy summary

VS

AGENT B
Name
Owner
Prompt
Model
Strategy summary
```

Then:

```text
BETTING OPEN
```

## Betting panel

Show:

```text
Pool: 90 MON
A: 63 MON
B: 27 MON

Platform fee: 5%
Estimated distributable pool: 85.5 MON
```

Allow the user to choose:

```text
BET ON A
BET ON B
```

and enter amount.

Clearly show that these numbers can change while betting remains open.

## Betting closed

Show:

```text
BETTING LOCKED
```

No additional deposits.

## Match

Show:

- both fighters
- strategies
- live health
- JEV/tactical decisions where useful
- timer
- spectators
- pool information without implying betting is still possible

## Winner

Show:

```text
WINNER
Agent A

Match settled on Monad
TX: 0x...

NFT minted
Token ID: ...

Winner payout / claim status
```

---

# 22. Economics must be visible

Do not hide the payout mechanics.

The UI should explain:

```text
Total pool
5% platform fee
95% winner payout pool
Current side A pool
Current side B pool
Estimated payout
Final payout after settlement
```

Use wording that makes clear that pre-match estimates can change until betting closes.

After betting closes:

```text
POOL LOCKED
FINAL PAYOUT RATIOS
```

After settlement:

```text
FINAL PAYOUT
```

---

# 23. Important economic edge cases

Implement and test at least:

1. Bet of zero.
2. Bet below/above allowed minimum or maximum.
3. Betting after close.
4. Betting during live match.
5. Betting on invalid match.
6. Duplicate claims.
7. Double settlement.
8. Draw.
9. Timeout.
10. Match cancellation.
11. No winning bettors.
12. Player betting.
13. Multiple bettors on same side.
14. Only one side has bets.
15. Rounding dust.
16. Contract paused/failure behavior if applicable.
17. Settlement attempted by unauthorized signer.
18. Replay of an old settlement signature.
19. Incorrect match ID in settlement.
20. Incorrect winner address in settlement.
21. Agent configuration mismatch.
22. Seed mismatch.
23. Decision hash mismatch if used for verification.

---

# 24. Security / adversarial review

Treat this as a protocol with hostile users.

Before calling the implementation complete, explicitly audit for:

- reentrancy
- authorization bugs
- signature replay
- stale signatures
- malformed settlement data
- front-running of useful transactions
- changing strategy after betting starts
- changing model/configuration after betting starts
- seed manipulation
- seed grinding
- duplicate match IDs
- duplicate NFT minting
- duplicate claims
- incorrect fee accounting
- integer overflow/underflow
- rounding exploits
- stuck funds
- refund exploits
- cancellation exploits
- timestamp/deadline edge cases
- dishonest frontend assumptions
- backend-controlled custody
- stale client state
- mismatched frontend vs contract economics

Do not assume a UI restriction is sufficient. Enforce important rules in the contract.

---

# 25. Current repository security issue

Inspect the tracked `.env`.

Do not expose secrets.

If real credentials exist:

- remove secret values from tracked files
- update ignore rules
- document that exposed credentials should be rotated
- ensure frontend bundles never contain private keys/API secrets

Do not print or commit secret values while working.

---

# 26. Legacy room architecture

You may reuse the current room protocol if helpful, but do not let the in-memory Node relay become the source of truth for economically settled outcomes.

For the hackathon, it is acceptable to have:

```text
off-chain game execution
        ↓
auditable result digest
        ↓
Monad settlement
```

provided the trust model is explicit and the settlement path is robust.

The current room relay is memory-only, so do not represent it as persistent infrastructure.

---

# 27. Testing requirements

Write/update tests before considering the work complete.

## Game tests

Preserve and extend:

- deterministic same-seed behavior
- deterministic same-agent behavior
- different seed divergence
- JEV decision integration
- decision logging
- result digest consistency

## Contract tests

Test:

- match creation
- snapshot locking
- betting
- player betting
- spectator betting
- betting close
- settlement
- 5% fee
- proportional payout
- rounding
- no winning bettors
- refunds
- cancellation
- timeout
- duplicate claim prevention
- replay protection
- unauthorized settlement
- NFT mint
- no NFT on draw
- impossible state transitions

## Integration test

Create one end-to-end happy-path test:

```text
Create two agents
→ lock snapshots
→ open betting
→ place bets
→ close betting
→ run deterministic match
→ create settlement
→ settle on Monad test environment
→ claim payout
→ mint winner NFT
```

---

# 28. Definition of done

Do not consider this complete merely because the UI looks correct.

The minimum viable successful implementation is:

### Game

- one polished AI-vs-AI fighter mode
- deterministic simulation
- JEV acting as tactical/strategy advisor
- decision logging/hash where practical

### Betting

- pre-match only
- strategies visible before betting
- players may bet
- spectators may bet
- betting held by smart contract
- 5% fee
- 95% proportional payout
- explicit refund/void handling
- clear economics in UI

### Monad

- actual Monad testnet contract path
- real transaction for betting/settlement/claim/mint as appropriate
- no fake claim that a simulated transaction is on-chain
- winner NFT minted on Monad

### Security

- agent snapshot locked
- configuration locked
- fee locked
- betting locked before match
- seed cannot be player-selected after betting
- settlement replay protection
- authorization and reentrancy checks
- funds cannot be arbitrarily withdrawn by frontend/backend

### UX

- clear strategies
- clear pool values
- clear 5% economics
- clear betting lock
- clear winner + payout + NFT receipt
- removed Pen Fight 3D and HexGL from main product

---

# 29. Clarifying questions policy

Before implementation:

1. Inspect the repository and this specification.
2. Identify only questions that are genuinely blocking or materially ambiguous.
3. Ask those questions before implementing the affected portion.
4. Do NOT ask questions whose answer can be reasonably inferred from this specification or the existing repository.
5. If a question is non-blocking, make the safest engineering assumption, document it, and proceed.
6. Do not repeatedly stop for confirmation.

When asking questions, keep them grouped into one concise message and label each question with the design decision it affects.

Example:

```text
I need two blocking decisions before I implement settlement:

1. Settlement model:
   A) Existing arbiter signature architecture, hardened with EIP-712
   B) Different trust model

2. Betting asset:
   A) Native MON
   B) ERC-20 token

Everything else is sufficiently specified, so I will proceed after these are answered.
```

---

# 30. Implementation style

Prioritize:

- working end-to-end functionality
- minimal unnecessary dependencies
- clean separation between game state, betting, settlement, and UI
- security over convenience
- deterministic behavior where possible
- clear test coverage
- readable code
- explicit protocol state transitions
- no fake or misleading Web3 behavior

Do not rebuild the entire application framework unless necessary.

Use the current repository's architecture where it is sound.

---

# 31. Final deliverables

When finished, provide:

1. Summary of architecture changes.
2. Files changed.
3. Smart contract changes.
4. Frontend changes.
5. JEV integration details.
6. Betting formula and edge-case behavior.
7. Monad deployment/configuration steps.
8. Test results.
9. Any remaining known limitations.
10. Exact commands to run the project locally and against Monad testnet.

Most importantly, verify that one complete match can be demonstrated from:

```text
strategy creation
→ public strategy
→ betting
→ betting lock
→ JEV-assisted autonomous fight
→ settlement
→ payout
→ winner NFT on Monad
```

Do not stop at mocked UI flows where a real contract transaction is required.
