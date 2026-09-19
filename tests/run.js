#!/usr/bin/env node
/* ------------------------------------------------------------------
   tests/run.js - every room test, no dependencies.

       node tests/run.js

   Three suites, in the order they matter:

     fight-determinism   the claim rooms rest on. Two independent JS
                         contexts stand in for two browsers, run the same
                         fighters and seed, and must agree frame for frame.
                         If this ever fails, rooms are broken no matter how
                         well the networking works - and the likeliest cause
                         is a Math.random() that crept into the simulation
                         instead of a seeded mulberry32 stream.
     rooms-protocol      host/join, commit-reveal ordering, tampering,
                         presence, code folding.
     rooms-rounds        the round lifecycle: the host-owned nonce,
                         rematches, and both sides refreshing.
     rooms-relay         the same protocol across a real server.js process,
                         with no BroadcastChannel available - so the relay
                         is the only transport under test. Starts and stops
                         the server itself on port 8431.
------------------------------------------------------------------- */

'use strict'

const { spawnSync } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SUITES = [
  ['fight-determinism', 'fight-determinism.test.js'],
  ['jev-advisor', 'jev-advisor.test.js'],
  ['rooms-protocol', 'rooms-protocol.test.js'],
  ['rooms-rounds', 'rooms-rounds.test.js'],
  ['rooms-relay', 'rooms-relay.test.js']
]

let failed = 0

for (const [name, file] of SUITES) {
  process.stdout.write('\n========== ' + name + ' ==========\n')
  const r = spawnSync(process.execPath, [path.join(__dirname, file), ROOT], {
    stdio: 'inherit',
    cwd: ROOT
  })
  if (r.status !== 0) failed++
}

process.stdout.write('\n' + (failed
  ? failed + ' of ' + SUITES.length + ' suites FAILED\n\n'
  : SUITES.length + ' suites passed\n\n'))
process.exit(failed ? 1 : 0)
