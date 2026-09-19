/* ------------------------------------------------------------------
   wire-config.js - point js/config.js at a deployment.

   Run:  node scripts/wire-config.js            (after deploying)
         node scripts/wire-config.js --off       (back to demo mode)

   Reads contracts/deployments.<chainId>.json and rewrites three lines in
   js/config.js: USE_REAL_CHAIN, arenaAddress, nftAddress.

   WHY THIS IS A SCRIPT AND NOT A NOTE IN THE README

   Hand-copying two 42-character hex strings between a terminal and a config
   file is a step that fails silently. A transposed character in arenaAddress
   does not throw - ethers happily builds a contract object for an address
   with no code at it, every read returns empty, the pools render as a
   confident 0.000 MON, and the first bet reverts with something unhelpful.
   The addresses are already in a JSON file the deployer wrote; there is no
   reason for a human to retype them.

   It also checks the arbiter, which is the one mismatch that produces a
   working-looking deployment that can never settle anything.
------------------------------------------------------------------- */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const CONFIG = path.join(ROOT, 'js', 'config.js')
const SPLIT_LINES = new RegExp('\\r?\\n')

const ZERO = '0x0000000000000000000000000000000000000000'

function fail(msg) {
  console.error('\n  ' + msg + '\n')
  process.exit(1)
}

/* Replace `key: <value>` inside the MONAD block only. Anchored on the key
   name at the start of an indented line so it cannot wander into the PEN or
   CONFIG blocks, which have their own settings. */
function setField(src, key, value) {
  const re = new RegExp('^(\\s*' + key + ':\\s*).*?(,\\s*(?://.*)?)$', 'm')
  if (!re.test(src)) fail('could not find `' + key + '` in js/config.js')
  return src.replace(re, '$1' + value + '$2')
}

function currentArbiterAddress() {
  try {
    const { ethers } = require('ethers')
    const envPath = path.join(ROOT, '.env')
    if (!fs.existsSync(envPath)) return null
    const line = fs.readFileSync(envPath, 'utf8')
      .split(SPLIT_LINES)
      .find((l) => l.trim().startsWith('ARBITER_PRIVATE_KEY='))
    if (!line) return null
    return new ethers.Wallet(line.slice(line.indexOf('=') + 1).trim()).address
  } catch (e) {
    return null
  }
}

const off = process.argv.includes('--off')
let src = fs.readFileSync(CONFIG, 'utf8')

if (off) {
  src = setField(src, 'USE_REAL_CHAIN', 'false')
  src = setField(src, 'arenaAddress', "'" + ZERO + "'")
  src = setField(src, 'nftAddress', "'" + ZERO + "'")
  fs.writeFileSync(CONFIG, src)
  console.log('\n  js/config.js -> DEMO MODE. Nothing will touch the chain.\n')
  process.exit(0)
}

/* Find whatever the deployer last wrote. Usually one file; if someone has
   also deployed to a local hardhat node, prefer the real testnet. */
const dir = path.join(ROOT, 'contracts')
const files = fs.readdirSync(dir).filter((f) => /^deployments\.\d+\.json$/.test(f))
if (!files.length) {
  fail('No contracts/deployments.<chainId>.json found.\n' +
       '  Deploy first:\n' +
       '      cd contracts && npx hardhat run scripts/deploy.js --network monadTestnet')
}

const preferred = files.find((f) => f === 'deployments.10143.json') || files[0]
const d = JSON.parse(fs.readFileSync(path.join(dir, preferred), 'utf8'))

console.log('\n  Reading contracts/' + preferred)
console.log('    chainId : ' + d.chainId)
console.log('    arena   : ' + d.arenaAddress)
console.log('    nft     : ' + d.nftAddress)
console.log('    arbiter : ' + d.arbiter)

if (d.chainId !== 10143) {
  console.log('\n  ! This is chain ' + d.chainId + ', not Monad testnet (10143).')
  console.log('    Wiring the frontend to a local hardhat deployment will only work')
  console.log('    while that node is running.')
}

/* The mismatch worth catching: a contract whose `arbiter` is not the key
   server.js signs with will accept bets and then reject every settlement,
   which looks like a working deployment right up until the first fight ends. */
const signer = currentArbiterAddress()
if (signer && signer.toLowerCase() !== String(d.arbiter).toLowerCase()) {
  fail('ARBITER MISMATCH.\n' +
       '  The contract will only accept settlements from ' + d.arbiter + '\n' +
       '  but server.js signs with                        ' + signer + '\n\n' +
       '  Every settlement would revert with "bad arbiter signature".\n' +
       '  Either redeploy with the current key, or have the contract owner call\n' +
       '  setArbiter(' + signer + ').')
}
if (signer) console.log('    signer  : ' + signer + '  (matches)')

src = setField(src, 'USE_REAL_CHAIN', 'true')
src = setField(src, 'arenaAddress', "'" + d.arenaAddress + "'")
src = setField(src, 'nftAddress', "'" + d.nftAddress + "'")
fs.writeFileSync(CONFIG, src)

console.log('\n  js/config.js is now LIVE against Monad testnet.')
console.log('  Restart the server and hard-reload the page.\n')
