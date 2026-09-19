/* ------------------------------------------------------------------
   set-arbiter.js - point a deployed ArenaBattle at the key server.js signs
   with, and give that key enough gas to do its job.

   Run:  node scripts/set-arbiter.js              (show what would change)
         node scripts/set-arbiter.js --apply      (actually send it)
         node scripts/set-arbiter.js --apply --gas 2    (also fund the arbiter)

   WHY THIS EXISTS

   A deployment where `arena.arbiter` is not the address derived from
   ARBITER_PRIVATE_KEY looks completely healthy. Matches get created, agents
   get submitted, bets land, the pools update. Then the first fight ends and
   nothing can settle, because settleMatch recovers a different signer than
   the one it is holding - and lockAgents/openBetting/startMatch were already
   reverting with "not arbiter" before that.

   Deploying with the owner as arbiter is the usual way to end up here, and
   it is worth undoing rather than living with: the arbiter key sits in a
   server process and sends transactions on a schedule, while the owner key
   can call withdrawFees, pause and setParams. Those should not be the same
   key, and separating them costs one transaction.

   The owner key is read from contracts/.env. That is the wallet that
   deployed; if you deployed from MetaMask with a different account, put THAT
   account's key there, or call setArbiter from MetaMask directly.
------------------------------------------------------------------- */

const fs = require('fs')
const path = require('path')
const { ethers } = require('ethers')

const ROOT = path.join(__dirname, '..')
const SPLIT_LINES = new RegExp('\\r?\\n')
const RPC = process.env.MONAD_RPC || 'https://testnet-rpc.monad.xyz'

const ARENA_ABI = [
  'function arbiter() view returns (address)',
  'function owner() view returns (address)',
  'function setArbiter(address a) external'
]

function keyFrom(file, name) {
  const p = path.join(ROOT, file)
  if (!fs.existsSync(p)) return null
  const line = fs.readFileSync(p, 'utf8')
    .split(SPLIT_LINES)
    .find((l) => l.trim().startsWith(name + '='))
  if (!line) return null
  const v = line.slice(line.indexOf('=') + 1).trim()
  return v || null
}

function fail(msg) {
  console.error('\n  ' + msg + '\n')
  process.exit(1)
}

async function main() {
  const dep = path.join(ROOT, 'contracts', 'deployments.10143.json')
  if (!fs.existsSync(dep)) fail('No contracts/deployments.10143.json - deploy first.')
  const d = JSON.parse(fs.readFileSync(dep, 'utf8'))

  const arbKey = keyFrom('.env', 'ARBITER_PRIVATE_KEY')
  if (!arbKey) fail('No ARBITER_PRIVATE_KEY in .env - run node scripts/make-keys.js')
  const wantArbiter = new ethers.Wallet(arbKey).address

  const ownerKey = keyFrom('contracts/.env', 'DEPLOYER_PRIVATE_KEY')
  const provider = new ethers.JsonRpcProvider(RPC)
  const arena = new ethers.Contract(d.arenaAddress, ARENA_ABI, provider)

  const [onChainArbiter, onChainOwner] = await Promise.all([arena.arbiter(), arena.owner()])
  const arbBal = await provider.getBalance(wantArbiter)

  console.log('')
  console.log('  arena            ' + d.arenaAddress)
  console.log('  arena.owner      ' + onChainOwner)
  console.log('  arena.arbiter    ' + onChainArbiter)
  console.log('  server.js signs  ' + wantArbiter + '   (' + ethers.formatEther(arbBal) + ' MON)')
  console.log('')

  const needsSet = onChainArbiter.toLowerCase() !== wantArbiter.toLowerCase()
  const gasArg = process.argv.indexOf('--gas')
  const gasAmount = gasArg > -1 ? process.argv[gasArg + 1] : null
  const apply = process.argv.includes('--apply')

  if (!needsSet) {
    console.log('  Arbiter already matches. Nothing to change.')
  } else {
    console.log('  MISMATCH: settlements would revert with "bad arbiter signature",')
    console.log('  and lockAgents/openBetting/startMatch with "not arbiter".')
    console.log('')
    console.log('  Fix: setArbiter(' + wantArbiter + ')')
  }

  if (arbBal === 0n && !gasAmount) {
    console.log('')
    console.log('  The arbiter has no gas. It sends 3 transactions per match')
    console.log('  (lockAgents, openBetting, startMatch), so it needs some.')
    console.log('  Add --gas 2 to send it 2 MON from the owner wallet.')
  }

  if (!apply) {
    console.log('')
    console.log('  Dry run. Re-run with --apply to send it.')
    console.log('')
    return
  }

  if (!needsSet && !gasAmount) return

  if (!ownerKey) {
    fail('No DEPLOYER_PRIVATE_KEY in contracts/.env.\n' +
         '  setArbiter is onlyOwner, so this needs the key for ' + onChainOwner + '.\n\n' +
         '  Either put that key in contracts/.env, or call setArbiter from MetaMask:\n' +
         '      contract ' + d.arenaAddress + '\n' +
         '      setArbiter(' + wantArbiter + ')')
  }

  const signer = new ethers.Wallet(ownerKey, provider)
  if (signer.address.toLowerCase() !== onChainOwner.toLowerCase()) {
    fail('WRONG KEY.\n' +
         '  contracts/.env holds ' + signer.address + '\n' +
         '  but the contract owner is ' + onChainOwner + '\n\n' +
         '  setArbiter is onlyOwner. Put the owner\'s key in contracts/.env,\n' +
         '  or call setArbiter(' + wantArbiter + ') from MetaMask.')
  }

  if (needsSet) {
    console.log('')
    console.log('  sending setArbiter...')
    const tx = await arena.connect(signer).setArbiter(wantArbiter)
    console.log('    tx ' + tx.hash)
    await tx.wait()
    console.log('    confirmed. arena.arbiter = ' + (await arena.arbiter()))
  }

  if (gasAmount) {
    console.log('')
    console.log('  sending ' + gasAmount + ' MON to the arbiter...')
    const tx = await signer.sendTransaction({
      to: wantArbiter,
      value: ethers.parseEther(String(gasAmount))
    })
    console.log('    tx ' + tx.hash)
    await tx.wait()
    console.log('    arbiter balance: ' + ethers.formatEther(await provider.getBalance(wantArbiter)) + ' MON')
  }

  console.log('')
  console.log('  Done. Next: node scripts/wire-config.js')
  console.log('')
}

main().catch((e) => fail(e.shortMessage || e.message))
