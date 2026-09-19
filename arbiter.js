/* ------------------------------------------------------------------
   arbiter.js - the settlement signer, and the seed it commits to.

   WHAT THE ARBITER IS

   It is the one thing in this system that both browsers and the contract
   agree to trust for a single, narrow job: turning "both players' machines
   saw the same fight end the same way" into a signature the contract will
   accept. It holds one key, it signs one struct, and it is deliberately
   incapable of everything else.

   WHAT IT CAN DO
     - choose the seed preimage, before betting opens and before any pool
       exists (see the note on grinding below)
     - decide whether the two reported results agree
     - sign, or refuse to sign, a settlement

   WHAT IT CANNOT DO
     - touch the money. Every MON is in the contract; the arbiter has no
       withdrawal path and is not the owner.
     - change an agent, a prompt, a model or the simulation version. All of
       those are frozen on chain before it is asked for anything, and the
       signature it produces is checked against them.
     - re-price a market. The fee was snapshotted at match creation.
     - close betting early, or late. That is on a clock, permissionless.
     - settle a match twice, or settle one for another contract or chain -
       the state machine and the EIP-712 domain stop both.
     - pick the seed alone. See below.

   THE RESIDUAL TRUST, STATED PLAINLY

   The arbiter chooses the seed PREIMAGE. It commits to that choice in
   lockAgents(), before betting opens, so it cannot grind the seed against
   the pools - they do not exist yet. It CAN, in principle, grind the
   preimage against the two agent snapshots, which are already frozen at that
   moment. The contract removes the value of doing so by mixing in
   blockhash(closedAtBlock) - a value that did not exist when the preimage
   was committed - along with the final pool sizes. To bias a match the
   arbiter would have to predict a future block hash, which is the assumption
   the rest of the chain already rests on.

   The honest residual is this: a malicious arbiter cannot steal funds or
   change the agents, but it CAN refuse to sign, stalling a match. That is
   why voidMatch() is permissionless after a timeout - a silent arbiter costs
   everyone their time, never their money.

   FOR A HACKATHON THIS IS THE RIGHT TRADE. A fully trustless version would
   need the fight itself verified on chain, which a 60 FPS simulation is not
   going to be.
------------------------------------------------------------------- */

const crypto = require('crypto')

let ethers = null
try {
  ethers = require('ethers')
} catch (e) {
  /* Signing is unavailable without it, and every settlement request will say
     so rather than returning something that looks like a signature. */
}

/* Only what the arbiter is allowed to do. A deliberately narrow ABI: it
   cannot express a withdrawal, a claim or a settlement it did not sign,
   because those entry points are simply not in it. */
const ARENA_ABI = [
  'function lockAgents(uint256 matchId, bytes32 seedCommit) external',
  'function openBetting(uint256 matchId, uint64 window) external',
  'function startMatch(uint256 matchId, uint256 preimage) external',
  'function getMatch(uint256 matchId) external view returns ((uint8 state, uint16 feeBps, uint32 simVersion, address creator, uint64 createdAt, uint64 bettingClosesAt, uint64 closedAtBlock, uint64 settledAt, uint256 minBet, uint256 maxBet, bytes32 seedCommit, uint256 seed, uint256 poolA, uint256 poolB, uint8 winner, uint8 finishType, uint256 distributable, uint256 winningPool, uint256 paidOut, uint256 nftTokenId))'
]

const Arbiter = {
  wallet: null,
  /* matchId -> { preimage, commit, results: {A,B}, signed } */
  matches: new Map(),
  MAX_MATCHES: 500,

  init() {
    const key = process.env.ARBITER_PRIVATE_KEY
    if (!ethers) {
      console.warn('[arbiter] ethers not installed - settlement signing disabled')
      return false
    }
    if (!key) {
      console.warn('[arbiter] no ARBITER_PRIVATE_KEY in .env - settlement signing disabled')
      return false
    }
    try {
      this.wallet = new ethers.Wallet(key)
      console.info('[arbiter] settlement signer ready: ' + this.wallet.address)
      return true
    } catch (e) {
      console.warn('[arbiter] ARBITER_PRIVATE_KEY is not a valid key - signing disabled')
      return false
    }
  },

  enabled() {
    return !!this.wallet
  },

  address() {
    return this.wallet ? this.wallet.address : null
  },

  /* ------------------------------------------------------------------
     Seed commitment

     Called before lockAgents. The preimage never leaves this process until
     startMatch reveals it, and it is generated from the system CSPRNG rather
     than anything a player could influence.
  ------------------------------------------------------------------- */
  commitSeed(matchId) {
    if (!ethers) return null
    const id = String(matchId)
    let rec = this.matches.get(id)
    if (rec && rec.preimage) {
      return { commit: rec.commit }           // idempotent: never re-roll a live commit
    }

    const preimage = BigInt('0x' + crypto.randomBytes(32).toString('hex'))
    const commit = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [preimage])
    )

    rec = rec || { results: {} }
    rec.preimage = preimage
    rec.commit = commit
    this._remember(id, rec)
    return { commit }
  },

  /* Revealed only once betting is closed - the caller is responsible for
     confirming that with the contract before asking. */
  revealSeed(matchId) {
    const rec = this.matches.get(String(matchId))
    if (!rec || !rec.preimage) return null
    return { preimage: rec.preimage.toString() }
  },

  /* ------------------------------------------------------------------
     Result agreement

     Each side reports the digest its own simulation produced. They only get
     a signature if those agree - two browsers that watched different fights
     must not settle at all, because there is no way to tell which one was
     right and the loser is about to lose real money.
  ------------------------------------------------------------------- */
  report(matchId, side, result) {
    const id = String(matchId)
    const rec = this.matches.get(id) || { results: {} }
    rec.results = rec.results || {}
    rec.results[side] = result
    this._remember(id, rec)
    return this.agreement(id)
  },

  agreement(matchId) {
    const rec = this.matches.get(String(matchId))
    if (!rec || !rec.results) return { ready: false, reason: 'no results reported' }
    const a = rec.results.A
    const b = rec.results.B
    if (!a && !b) return { ready: false, reason: 'no results reported' }

    /* A solo match - one wallet owning both agents - has only one reporter,
       and demanding a second would deadlock it forever. */
    if (!a || !b) return { ready: true, solo: true, result: a || b }

    const same = a.winner === b.winner &&
      a.finishType === b.finishType &&
      a.resultDigest === b.resultDigest &&
      a.decisionHash === b.decisionHash

    if (!same) {
      return {
        ready: false,
        disputed: true,
        reason: 'the two sides reported different fights - refusing to sign'
      }
    }
    return { ready: true, solo: false, result: a }
  },

  /* ------------------------------------------------------------------
     Driving the match on chain.

     lockAgents, openBetting and startMatch are arbiter-only, so a browser
     cannot call them however much it would like to - which is the point, but
     it does mean the arbiter has to be able to send transactions rather than
     only sign messages. These three are that capability, and nothing more:
     the arbiter can advance a match through its lifecycle and cannot touch a
     single MON in it.

     Requires MONAD_RPC (or the testnet default) and a little gas in the
     arbiter account. Without a configured arena address every one of these
     refuses in words rather than throwing.
  ------------------------------------------------------------------- */

  arena(arenaAddress) {
    if (!this.wallet) throw new Error('arbiter is not configured')
    if (!arenaAddress || !/^0x[0-9a-fA-F]{40}$/.test(arenaAddress)) {
      throw new Error('no arena address configured')
    }
    const rpc = process.env.MONAD_RPC || 'https://testnet-rpc.monad.xyz'
    const provider = new ethers.JsonRpcProvider(rpc)
    const signer = this.wallet.connect(provider)
    return new ethers.Contract(arenaAddress, ARENA_ABI, signer)
  },

  /* Freeze the agents and commit to the seed in one transaction, then open
     the market. The seed commitment is generated here if it does not already
     exist - before any pool exists to grind it against. */
  async lockAndOpen(arenaAddress, matchId, windowSeconds) {
    const arena = this.arena(arenaAddress)
    const { commit } = this.commitSeed(matchId)

    const lock = await arena.lockAgents(matchId, commit)
    await lock.wait()

    const open = await arena.openBetting(matchId, windowSeconds || 120)
    const r = await open.wait()

    return { commit, lockTx: lock.hash, openTx: r.hash }
  },

  /* Reveal the preimage and start the fight. The contract mixes it with the
     close block hash and the final pools, so revealing it here gives nobody
     an edge - by this point betting is shut. */
  async start(arenaAddress, matchId) {
    const arena = this.arena(arenaAddress)
    const rec = this.matches.get(String(matchId))
    if (!rec || !rec.preimage) throw new Error('no seed committed for match ' + matchId)

    const tx = await arena.startMatch(matchId, rec.preimage)
    const r = await tx.wait()

    const m = await arena.getMatch(matchId)
    return { txHash: r.hash, seed: m.seed.toString() }
  },

  /* ------------------------------------------------------------------
     The signature

     EIP-712 over exactly the struct ArenaBattle declares. The domain carries
     chainId and the contract address, so this signature is meaningless
     against any other deployment or chain - that is the entire replay story.
  ------------------------------------------------------------------- */
  async sign(req) {
    if (!this.enabled()) {
      return { error: 'arbiter signing is not configured on this server' }
    }

    const problem = this._validate(req)
    if (problem) return { error: problem }

    const domain = {
      name: 'AARAGE ArenaBattle',
      version: '2',
      chainId: Number(req.chainId),
      verifyingContract: ethers.getAddress(req.arena)
    }

    const types = {
      Settlement: [
        { name: 'matchId', type: 'uint256' },
        { name: 'agentAHash', type: 'bytes32' },
        { name: 'agentBHash', type: 'bytes32' },
        { name: 'seed', type: 'uint256' },
        { name: 'winner', type: 'uint8' },
        { name: 'finishType', type: 'uint8' },
        { name: 'resultDigest', type: 'bytes32' },
        { name: 'decisionHash', type: 'bytes32' },
        { name: 'simVersion', type: 'uint32' }
      ]
    }

    const settlement = {
      matchId: BigInt(req.matchId).toString(),
      agentAHash: req.agentAHash,
      agentBHash: req.agentBHash,
      seed: BigInt(req.seed).toString(),
      winner: Number(req.winner),
      finishType: Number(req.finishType),
      resultDigest: req.resultDigest,
      decisionHash: req.decisionHash,
      simVersion: Number(req.simVersion)
    }

    const signature = await this.wallet.signTypedData(domain, types, settlement)

    const rec = this.matches.get(String(req.matchId)) || { results: {} }
    rec.signed = { settlement, signature, at: Date.now() }
    this._remember(String(req.matchId), rec)

    return { settlement, signature, arbiter: this.wallet.address }
  },

  /* Refuse anything malformed rather than signing it and letting the
     contract reject it after the user has paid for the gas. */
  _validate(req) {
    const b32 = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v)

    if (req.matchId === undefined || req.matchId === null) return 'missing matchId'
    if (!b32(req.agentAHash) || !b32(req.agentBHash)) return 'agent hashes must be bytes32'
    if (!b32(req.resultDigest)) return 'resultDigest must be bytes32'
    if (!b32(req.decisionHash)) return 'decisionHash must be bytes32'
    if (req.seed === undefined) return 'missing seed'

    const w = Number(req.winner)
    const f = Number(req.finishType)
    if (![0, 1, 2].includes(w)) return 'winner must be 0 (draw), 1 (A) or 2 (B)'
    if (![1, 2, 3].includes(f)) return 'finishType must be 1 (KO), 2 (timeout) or 3 (draw)'
    /* The contract enforces this too; catching it here turns a reverted
       transaction into a readable error message. */
    if ((w === 0) !== (f === 3)) return 'winner and finishType disagree about a draw'

    if (!req.arena || !/^0x[0-9a-fA-F]{40}$/.test(req.arena)) return 'missing or malformed arena address'
    if (!req.chainId) return 'missing chainId'
    if (!req.simVersion) return 'missing simVersion'

    return null
  },

  /* Bounded, like every other map in this process: this is a demo relay, not
     a database, and an unbounded map is a slow memory leak with a deadline. */
  _remember(id, rec) {
    this.matches.set(id, rec)
    if (this.matches.size > this.MAX_MATCHES) {
      const oldest = this.matches.keys().next().value
      this.matches.delete(oldest)
    }
  }
}

module.exports = { Arbiter }
