# Walkthrough: Monad Staking, Spectator Betting & On-Chain NFT Implementation

We have completed the full implementation of the Monad smart contract suite and frontend Web3 wiring for **"Train Your AI Fighter"**.

---

## 1. Summary of Changes

### A. Smart Contracts (`contracts/`)
* **[`FighterNFT.sol`](file:///C:/Users/Tanuj/Documents/Git-repos/gamingNft/contracts/contracts/FighterNFT.sol)**:
  * ERC-721 token with **fully on-chain dynamic SVG generation** and Base64 JSON `tokenURI`.
  * Renders an arcade-style card with glowing neon borders, archetype title, proportional color-coded stat bars (ATK in crimson, DEF in cyan, SPD in gold), prompt quotation, match ID, seed, and date.
  * Zero external IPFS or pinning service dependencies.
  * Role-gated so only `ArenaBattle` (or owner) can mint winner credentials.
* **[`ArenaBattle.sol`](file:///C:/Users/Tanuj/Documents/Git-repos/gamingNft/contracts/contracts/ArenaBattle.sol)**:
  * **Player Staking**: Player 1 creates a match by depositing stake $S$; Player 2 joins with matching stake $S$.
  * **Loss Mitigation Math**:
    * Winner receives $1.5 \times S$ (their stake back + half the loser's stake).
    * Loser receives $0.5 \times S$ (half their stake back as a loss cushion).
    * Zero protocol fee is extracted from player stakes ($1.5S + 0.5S = 2S$).
  * **Spectator Pari-Mutuel Betting**:
    * Spectators bet on P1 or P2 into the pool.
    * **100% Principal Protection**: Winning spectators recover their full principal wager untouched.
    * **5% Fee on Net Profit**: A 5% protocol fee is deducted strictly from the losing pool ($0.05 \times B_{\text{loser}}$).
    * Winning spectators share the remaining 95% of the losing pool proportionally to their bet size:
      $$\text{Payout}_i = b_i + \frac{b_i \times (B_{\text{loser}} \times 95 / 100)}{B_{\text{winner}}}$$
    * **Pull-Payment Pattern**: Spectators claim payouts via `claimSpectatorPayout(matchId)` to protect against block gas limits.
  * **Authorized Settlement**: Arbiter ECDSA signature verification allows any frontend/player to settle the match on-chain without backend gas costs.
* **[`hardhat.config.js`](file:///C:/Users/Tanuj/Documents/Git-repos/gamingNft/contracts/hardhat.config.js)**:
  * Configured with Solidity `0.8.24`, `cancun` EVM target, and Monad Testnet network (`chainId: 10143`, RPC `https://testnet-rpc.monad.xyz`).
* **[`scripts/deploy.js`](file:///C:/Users/Tanuj/Documents/Git-repos/gamingNft/contracts/scripts/deploy.js)**:
  * Automated deployment script for Monad Testnet deploying `FighterNFT`, `ArenaBattle`, and binding minting permissions.

---

### B. Automated Test Suite (`contracts/test/ArenaBattle.test.js`)
* **10 passing tests** verifying:
  * Match creation and joining with exact stake validation.
  * Rejection of self-matches or incorrect stake values.
  * Spectator bets across both fighters and prohibition of player self-betting.
  * Arbiter ECDSA signature settlement paying $1.5S$ to winner and $0.5S$ to loser.
  * Exact $34.5\text{ MON}$ scenario calculation ($25\text{ MON}$ bet on $50\text{ MON}$ winner pool against $20\text{ MON}$ loser pool).
  * Pull-payment claims and prevention of double claims.
  * Base64 JSON and dynamic SVG decoding and structure validation.
  * Cancellation and full stake refund if opponent never joins.

---

### C. Frontend & Web3 Integration (`js/`, `index.html`, `styles.css`)
* **Local Ethers.js Vendoring**: Added [`js/vendor/ethers.umd.min.js`](file:///C:/Users/Tanuj/Documents/Git-repos/gamingNft/js/vendor/ethers.umd.min.js) so the app remains fully offline-capable without CDN dependencies.
* **[`js/config.js`](file:///C:/Users/Tanuj/Documents/Git-repos/gamingNft/js/config.js)**: Updated `MONAD` configuration with contract addresses, default stake/bet amounts, and ABIs.
* **[`js/blockchain.js`](file:///C:/Users/Tanuj/Documents/Git-repos/gamingNft/js/blockchain.js)**:
  * Implemented MetaMask connection and Monad Testnet auto-switching.
  * Added methods for match creation, spectator betting, claim payouts, and live/simulated minting.
* **[`index.html`](file:///C:/Users/Tanuj/Documents/Git-repos/gamingNft/index.html)** & **[`styles.css`](file:///C:/Users/Tanuj/Documents/Git-repos/gamingNft/styles.css)**:
  * Added **Stake Input** on the prompt entry screen.
  * Added **Spectator Betting Widget** on the fight HUD showing P1/P2 pool totals.
  * Added **Claim Bet Winnings** button on the winner screen.
* **[`js/ui.js`](file:///C:/Users/Tanuj/Documents/Git-repos/gamingNft/js/ui.js)**:
  * Wired event listeners for betting and claim buttons.
  * Automatically resets betting pools on match start.
  * Reveals claim button on match end if the spectator backed the victor.

---

## 2. Verification Results

```powershell
> train-your-ai-fighter-contracts@1.0.0 test
> hardhat test

  ArenaBattle & FighterNFT
    Deployment & Configuration
      ✔ should set correct initial state
    Match Creation & Joining
      ✔ should allow player 1 to create a match with stake
      ✔ should reject joining with incorrect stake or same player
      ✔ should allow player 2 to join and make match Active
    Spectator Betting & Payout Calculations
      ✔ should allow spectators to place bets on both fighters
      ✔ should reject bets from players on their own match
      ✔ should settle match with arbiter signature, paying winner 1.5x and loser 0.5x
      ✔ should accurately compute user-discussed 34.5 MON scenario
    On-Chain Dynamic SVG NFT Verification
      ✔ should generate valid Base64 JSON and dynamic SVG card
    Cancellation & Refunds
      ✔ should allow player 1 to cancel if nobody joins

  10 passing (3s)
```

---

## 3. How to Deploy to Monad Testnet

When ready to deploy to live Monad Testnet:
1. Create a `.env` file in `contracts/`:
   ```env
   DEPLOYER_PRIVATE_KEY=your_private_key_here
   MONAD_TESTNET_RPC=https://testnet-rpc.monad.xyz
   ARBITER_ADDRESS=your_arbiter_wallet_address_here
   ```
2. Run the deployment script:
   ```powershell
   cd C:\Users\Tanuj\Documents\Git-repos\gamingNft\contracts
   npx hardhat run scripts/deploy.js --network monadTestnet
   ```
3. Copy the deployed `ArenaBattle` and `FighterNFT` addresses into `MONAD.arenaAddress` and `MONAD.nftAddress` in [`js/config.js`](file:///C:/Users/Tanuj/Documents/Git-repos/gamingNft/js/config.js), and set `MONAD.USE_REAL_CHAIN = true`.
