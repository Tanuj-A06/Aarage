/* ------------------------------------------------------------------
   spectate.js - the floor. Every match on this server, and the money.

   Three sources of truth, and keeping them separate is the whole design of
   this file:

     the board    server.js knows which rooms exist, who is in them and what
                  they are doing. It is a noticeboard. It never sees a MON.
     the relay    the same SSE stream the two players are on, joined as side
                  0 - read-only, enforced by the server refusing to carry a
                  post from a spectator. This is what makes the page live
                  rather than polled-and-stale.
     the chain    ArenaBattle holds every pool, every bet and every payout.
                  Anything with a number of MON in it is read from there and
                  nowhere else, so the page cannot disagree with what a claim
                  will actually pay.

   Why both the relay and a poll: the relay is instant but says nothing to a
   tab that opens mid-fight, and the board is complete but arrives on a
   three-second clock. Together they cover each other - the poll is the
   floor, the stream removes the latency from the moments that matter (a
   fighter revealed, a K.O.).

   The prompts are not shown until both players have committed. That is not
   a UI preference: a spectator page that displayed player 1's strategy while
   player 2 was still typing would be a way to read it, and commit-reveal is
   the only reason the round is fair.
------------------------------------------------------------------- */

const Spectate = {
  LIST_MS: 3000,          // the board
  CHAIN_MS: 6000,         // pools, from ArenaBattle
  FEED_MAX: 60,           // lines kept in the room feed

  matches: [],
  code: null,             // the room being watched
  snap: null,             // its board record
  onchain: null,          // its ArenaBattle state, or null
  side: 'p1',             // which fighter the bet form is aimed at
  es: null,
  busy: false,

  /* ---------------- boot ---------------- */

  init() {
    this.paintStatus()
    this.bindStatus()
    this.bindBet()

    this.pollBoard()
    setInterval(() => this.pollBoard(), this.LIST_MS)
    setInterval(() => this.pollChain(), this.CHAIN_MS)

    /* ?code=XXXX - so a player can send "come watch this" as a link rather
       than reading four characters down a phone. */
    const want = new URLSearchParams(location.search).get('code')
    if (want) this._want = String(want).toUpperCase().slice(0, 4)
  },

  /* ---------------- the status bar ---------------- */

  bindStatus() {
    const btn = $('#btn-connect')
    if (!btn) return
    btn.addEventListener('click', async () => {
      btn.disabled = true
      try {
        await Chain.connectWallet()
        this.paintStatus()
        this.paintDetail()
      } catch (err) {
        this.note(err && err.message ? err.message : 'Wallet connection refused')
      }
      btn.disabled = false
    })
  },

  paintStatus() {
    const live = Bets.configured()
    const net = $('#ss-net')
    if (net) {
      net.textContent = live ? MONAD.chainName + ' (' + MONAD.chainIdDec + ')' : 'PAPER MODE'
      net.className = live ? 'ok' : 'warn'
    }
    const arena = $('#ss-arena')
    if (arena) arena.textContent = live ? short(MONAD.arenaAddress) : 'NOT DEPLOYED'

    const w = $('#ss-wallet')
    const btn = $('#btn-connect')
    if (w) w.textContent = Chain.userAddress ? short(Chain.userAddress) : 'NOT CONNECTED'
    if (btn) {
      btn.classList.toggle('hidden', !!Chain.userAddress)
      /* Without an injected wallet there is nothing for the button to do,
         and an enabled button that cannot work is worse than an honest
         label. Paper mode needs no wallet at all. */
      if (!Chain.hasWallet()) {
        btn.disabled = true
        btn.textContent = 'NO WALLET'
      }
    }
  },

  /* ---------------- the board ---------------- */

  async pollBoard() {
    let data = null
    try {
      const r = await fetch('/api/match/list', { cache: 'no-store' })
      data = await r.json()
    } catch (e) {
      this.tick('OFFLINE')
      return
    }
    if (!data || !data.ok) return

    this.matches = data.matches || []
    this.tick(this.matches.length ? this.matches.length + ' ON THE BOARD' : 'QUIET')
    const count = $('#ss-count')
    if (count) count.textContent = this.matches.length

    this.paintList()

    /* Keep the open detail in step with the board without waiting on the
       stream, and notice when the room we are watching disappears. */
    if (this.code) {
      const found = this.matches.filter((m) => m.code === this.code)[0]
      if (found) {
        const wasStatus = this.snap && this.snap.status
        this.snap = found
        this.paintDetail()
        if (wasStatus && wasStatus !== found.status) this.logStatus(found.status)
      }
    }

    /* ?code= on the URL, honoured once the board has actually loaded - the
       room may not have been announced when the page opened. */
    if (this._want) {
      const hit = this.matches.filter((m) => m.code === this._want)[0]
      if (hit) { this._want = null; this.select(hit.code) }
    }
  },

  tick(t) {
    const el = $('#board-tick')
    if (el) el.textContent = t
  },

  paintList() {
    const host = $('#match-list')
    const empty = $('#board-empty')
    if (!host) return
    if (empty) empty.classList.toggle('hidden', this.matches.length > 0)

    /* Rebuilt wholesale on a three-second clock, which is cheap at this size
       and removes every class of "the row updated but the handler still
       points at the old match" bug. */
    host.innerHTML = ''
    for (const m of this.matches) host.appendChild(this.row(m))
  },

  row(m) {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'ml-row s-' + m.status + (m.code === this.code ? ' on' : '')
    el.setAttribute('aria-pressed', m.code === this.code ? 'true' : 'false')

    const a1 = m.p1.archetype || (m.p1.locked ? 'LOCKED IN' : 'WRITING')
    const a2 = m.p2.seated ? (m.p2.archetype || (m.p2.locked ? 'LOCKED IN' : 'WRITING'))
      : 'EMPTY SEAT'

    el.innerHTML =
      '<span class="mr-top">' +
        '<b class="mr-code"></b>' +
        '<i class="mr-mode"></i>' +
        '<i class="mr-status"></i>' +
      '</span>' +
      '<span class="mr-fight">' +
        '<em class="mr-a1"></em><s>vs</s><em class="mr-a2"></em>' +
      '</span>' +
      '<span class="mr-foot">' +
        '<i class="mr-pool"></i><i class="mr-crowd"></i>' +
      '</span>'

    /* textContent throughout: every one of these came off the wire from a
       player-authored prompt box. */
    el.querySelector('.mr-code').textContent = m.code
    el.querySelector('.mr-mode').textContent = MODE_LABEL[m.mode] || m.mode
    el.querySelector('.mr-status').textContent = STATUS_LABEL[m.status] || m.status
    el.querySelector('.mr-a1').textContent = a1
    el.querySelector('.mr-a2').textContent = a2
    el.querySelector('.mr-crowd').textContent =
      m.spectators === 1 ? '1 watching' : m.spectators + ' watching'

    const pool = el.querySelector('.mr-pool')
    if (m.winner) {
      pool.textContent = (m.winner === 'p1' ? 'PLAYER 1' : 'PLAYER 2') + ' WON'
      pool.className = 'mr-pool won'
    } else {
      pool.textContent = m.chain.matchId ? 'match #' + m.chain.matchId : 'stake ' + m.stake + ' MON'
    }

    el.addEventListener('click', () => this.select(m.code))
    return el
  },

  /* ---------------- picking one ---------------- */

  select(code) {
    if (this.code === code) return
    this.code = code
    this.snap = this.matches.filter((m) => m.code === code)[0] || null
    this.onchain = null
    this.side = 'p1'

    $('#detail-empty').classList.add('hidden')
    $('#detail-card').classList.remove('hidden')
    $('#feed-log').innerHTML = ''
    this.log('watching room ' + code, 'ok')

    this.paintList()
    this.paintDetail()
    this.watch(code)
    this.pollChain()
  },

  /* ---------------- the live stream ---------------- */

  /* Side 0 on the players' own relay. We receive both sides' traffic and can
     post none of it back - server.js will not carry a message from side 0,
     which is the entire security model of spectating: a spectator cannot
     commit, reveal a fighter, open a round or report a result. */
  watch(code) {
    this.unwatch()
    if (typeof EventSource !== 'function') return
    try {
      this.es = new EventSource('/api/room/sub?code=' + encodeURIComponent(code) + '&side=0')
    } catch (e) {
      return
    }
    this.es.onmessage = (e) => {
      let m = null
      try { m = JSON.parse(e.data) } catch (err) { return }
      if (!m) return
      this.onRoomMessage(m)
    }
    /* EventSource retries on its own; a dropped stream degrades to the
       three-second poll, which is the whole reason the poll is still here. */
    this.es.onerror = () => {}
  },

  unwatch() {
    if (this.es) { try { this.es.close() } catch (e) {} }
    this.es = null
  },

  onRoomMessage(m) {
    switch (m.t) {
      case 'spectators': {
        const el = $('#d-crowd')
        if (el) el.textContent = m.n === 1 ? '1 watching' : m.n + ' watching'
        break
      }
      case 'commit':
        this.log('player ' + m.from + ' locked in a strategy')
        break
      case 'fighter':
        this.log('player ' + m.from + ' revealed: ' +
          ((m.parsed && m.parsed.archetype) || 'fighter'), 'ok')
        this.refresh()
        break
      case 'newround':
        this.log('round ' + (m.n | 0) + ' opening')
        this.refresh()
        break
      case 'result':
        this.log('a result came in from player ' + m.from, 'ok')
        this.refresh()
        break
      case 'bye':
        this.log('player ' + m.from + ' left the room', 'bad')
        break
      /* ping/pong is the players' heartbeat and says nothing a spectator
         needs; logging it would bury the real events one a second. */
    }
  },

  /* One board read, out of band from the poll clock, for the moments where
     three seconds of staleness is visible - a reveal, a K.O. */
  async refresh() {
    if (!this.code) return
    try {
      const r = await fetch('/api/match/get?code=' + encodeURIComponent(this.code), { cache: 'no-store' })
      const d = await r.json()
      if (d && d.ok) { this.snap = d.match; this.paintDetail() }
    } catch (e) { /* the poll will catch it */ }
  },

  logStatus(status) {
    const said = {
      writing: 'both players are writing',
      ready: 'both strategies are locked - fight is about to start',
      live: 'FIGHT',
      done: 'match over',
      gone: 'the host closed the room'
    }
    if (said[status]) this.log(said[status], status === 'live' || status === 'done' ? 'ok' : '')
    if (status === 'done' || status === 'gone') this.pollChain()
  },

  log(text, cls) {
    const host = $('#feed-log')
    if (!host) return
    const d = document.createElement('div')
    if (cls) d.className = cls
    const t = new Date()
    d.textContent = String(t.getHours()).padStart(2, '0') + ':' +
      String(t.getMinutes()).padStart(2, '0') + ':' +
      String(t.getSeconds()).padStart(2, '0') + '  ' + text
    host.appendChild(d)
    while (host.children.length > this.FEED_MAX) host.removeChild(host.firstChild)
    host.scrollTop = host.scrollHeight
  },

  /* ---------------- the chain ---------------- */

  async pollChain() {
    if (!this.code || !this.snap) return
    if (!Bets.configured() || !this.snap.chain.matchId) { this.onchain = null; this.paintDetail(); return }
    const m = await Bets.readMatch(this.snap.chain.matchId)
    if (!m) { this.onchain = null; this.paintDetail(); return }

    m.mine = { p1: 0n, p2: 0n }
    if (Chain.userAddress) {
      /* Bets are keyed by SIDE now, not by fighter address: the contract
         tracks A and B, and an address was never a safe key once one wallet
         could own both agents. */
      m.mine.p1 = await Bets.myBet(m.matchId, MONAD.SIDE_A)
      m.mine.p2 = await Bets.myBet(m.matchId, MONAD.SIDE_B)
      m.owed = await Bets.expectedPayout(m.matchId)
      m.claimed = await Bets.hasClaimed(m.matchId)
    }
    this.onchain = m
    this.paintDetail()
  },

  /* Which ledger this match's money is actually in. Three answers, and the
     page must never blur them:

       chain    a deployed arena, an on-chain match, and a successful read.
       paper    no arena deployed at all. Local, labelled, not money.
       blind    an arena IS deployed and this match IS on it, but the read
                failed - a dead RPC, a wrong chain, ethers missing.

     `blind` is the one that matters. Falling back to the paper pools there
     would put this browser's private numbers on screen under a heading that
     says ArenaBattle, which is the single most misleading thing this page
     could do. It shows nothing and says why instead. */
  ledger() {
    if (this.onchain) return 'chain'
    if (Bets.configured() && this.snap && this.snap.chain.matchId) return 'blind'
    return 'paper'
  },

  /* Everything downstream - the bar, the odds, the quote, the claim - reads
     this one function, so the two ledgers cannot drift into two different
     sets of arithmetic. */
  pools() {
    const where = this.ledger()
    if (where === 'chain') return { p1: this.onchain.poolA, p2: this.onchain.poolB, live: true }
    if (where === 'blind') return { p1: 0n, p2: 0n, live: true, blind: true }
    const p = PaperBets.pools(this.code || '')
    return { p1: p.p1, p2: p.p2, live: false }
  },

  myPosition() {
    const where = this.ledger()
    if (where === 'chain') return Chain.userAddress ? this.onchain.mine : { p1: 0n, p2: 0n }
    if (where === 'blind') return { p1: 0n, p2: 0n }
    return PaperBets.mine(this.code || '')
  },

  /* Betting is open exactly when the contract says it is. With no contract,
     the board's own status stands in - and it closes on the same event, the
     match finishing. */
  bettingOpen() {
    const where = this.ledger()
    if (where === 'chain') return this.onchain.bettingOpen
    /* Blind: the contract is the authority on whether the window is shut and
       we could not ask it. Offering a bet here is offering a transaction
       that may revert on a settled match. */
    if (where === 'blind') return false
    if (!this.snap) return false
    return this.snap.status !== 'done' && this.snap.status !== 'gone'
  },

  /* ---------------- painting the detail ---------------- */

  paintDetail() {
    const s = this.snap
    if (!s) return

    $('#d-code').textContent = s.code
    const st = $('#d-status')
    st.textContent = (STATUS_LABEL[s.status] || s.status) +
      (s.winner ? ' — ' + (s.winner === 'p1' ? 'PLAYER 1' : 'PLAYER 2') + ' WON' : '')
    st.className = 's-' + s.status

    this.paintFighter(1, s.p1, s.winner === 'p1', s.winner === 'p2')
    this.paintFighter(2, s.p2, s.winner === 'p2', s.winner === 'p1')

    $('#db-name1').textContent = s.p1.archetype || 'PLAYER 1'
    $('#db-name2').textContent = s.p2.archetype || 'PLAYER 2'

    this.paintPool()
    this.paintQuote()
    this.paintMine()
  },

  paintFighter(n, f, won, lost) {
    const el = $('#d-f' + n)
    el.classList.toggle('won', !!won)
    el.classList.toggle('lost', !!lost)

    const revealed = !!f.archetype
    el.querySelector('.d-arch').textContent = revealed ? f.archetype
      : f.locked ? 'LOCKED IN'
      : f.seated ? 'STILL WRITING'
      : 'EMPTY SEAT'

    const q = el.querySelector('.d-prompt')
    /* Hidden, not empty-stringed: an empty <q> still renders its quote marks,
       which reads as a player who wrote nothing rather than one whose prompt
       is properly still sealed. */
    q.textContent = f.prompt || ''
    q.classList.toggle('hidden', !f.prompt)

    el.querySelector('.d-addr').textContent = f.addr ? short(f.addr) : 'no wallet connected'
    el.querySelector('.d-addr').classList.toggle('none', !f.addr)

    const bars = el.querySelector('.d-bars')
    bars.innerHTML = ''
    if (revealed) {
      const rows = [['ATK', f.stats.aggression], ['DEF', f.stats.defense], ['SPD', f.stats.speed]]
      for (const [name, v] of rows) {
        const row = document.createElement('div')
        row.className = 'd-bar'
        row.innerHTML = '<span></span><i><u></u></i><b></b>'
        row.querySelector('span').textContent = name
        row.querySelector('u').style.width = Math.round(v * 100) + '%'
        row.querySelector('b').textContent = String(Math.round(v * 100)).padStart(2, '0')
        bars.appendChild(row)
      }
    }
  },

  paintPool() {
    const p = this.pools()
    const total = p.p1 + p.p2
    $('#dp-total').textContent = p.blind ? 'UNREADABLE'
      : fmtMon(total) + ' MON' + (p.live ? '' : ' (paper)')
    $('#dp-1').textContent = fmtMon(p.p1)
    $('#dp-2').textContent = fmtMon(p.p2)

    /* An empty pool has no split to show, so it sits at 50/50 rather than
       collapsing one side to nothing and implying a landslide. */
    const pct = total > 0n ? Number(p.p1 * 1000n / total) / 10 : 50
    const bar = $('#dp-bar')
    bar.querySelector('.dp-p1').style.width = pct + '%'
    bar.querySelector('.dp-p2').style.width = (100 - pct) + '%'

    /* The standing odds: what one more MON on each side would return at the
       current pools. Quoted per-MON so the two sides are comparable. */
    const one = 10n ** 18n
    const q1 = Bets.quote(one, p.p1, p.p2)
    const q2 = Bets.quote(one, p.p2, p.p1)
    $('#dp-1x').textContent = q1 ? q1.multiple.toFixed(2) + 'x' : '1.00x'
    $('#dp-2x').textContent = q2 ? q2.multiple.toFixed(2) + 'x' : '1.00x'
  },

  /* ---------------- the bet form ---------------- */

  bindBet() {
    for (const b of document.querySelectorAll('.db-side')) {
      b.addEventListener('click', () => {
        this.side = b.getAttribute('data-side')
        for (const o of document.querySelectorAll('.db-side')) {
          o.classList.toggle('on', o === b)
        }
        this.paintQuote()
      })
    }
    for (const c of document.querySelectorAll('.db-chips button')) {
      c.addEventListener('click', () => {
        $('#bet-amt').value = c.getAttribute('data-amt')
        this.paintQuote()
      })
    }
    $('#bet-amt').addEventListener('input', () => this.paintQuote())
    $('#d-bet').addEventListener('submit', (e) => { e.preventDefault(); this.placeBet() })
    $('#btn-claim').addEventListener('click', () => this.claim())
  },

  /* Parsed rather than trusted: this is the number that becomes msg.value.
     Anything that is not a plain positive decimal returns null and the form
     says why, instead of handing NaN to parseEther. */
  amountWei() {
    const raw = String($('#bet-amt').value || '').trim()
    if (!/^\d*\.?\d*$/.test(raw) || raw === '' || raw === '.') return null
    try {
      const wei = typeof ethers !== 'undefined'
        ? ethers.parseEther(raw)
        : BigInt(Math.round(parseFloat(raw) * 1e18))
      return wei > 0n ? wei : null
    } catch (e) {
      return null
    }
  },

  paintQuote() {
    const amt = this.amountWei()
    const p = this.pools()
    const mine = this.side === 'p1' ? p.p1 : p.p2
    const theirs = this.side === 'p1' ? p.p2 : p.p1
    const q = Bets.quote(amt || 0n, mine, theirs)

    $('#q-payout').textContent = q ? fmtMon(q.payout) : '—'
    $('#q-profit').textContent = q ? fmtMon(q.profit) : '—'
    $('#q-mult').textContent = q ? q.multiple.toFixed(2) + 'x' : '—'

    const btn = $('#btn-bet')
    const open = this.bettingOpen()
    btn.disabled = !q || !open || this.busy
    btn.textContent = !open ? 'BETTING CLOSED'
      : this.busy ? 'WORKING…'
      : Bets.configured() ? 'PLACE BET ON MONAD' : 'PLACE PAPER BET'

    /* One line that explains the current mode and any reason the button will
       not do what it says. This is where paper mode is admitted out loud. */
    const note = $('#db-note')
    if (this.ledger() === 'blind') {
      note.textContent = 'Match #' + this.snap.chain.matchId + ' is on ArenaBattle, but ' +
        MONAD.chainName + ' cannot be reached from this page right now — so the pools ' +
        'below are unknown, not zero. Nothing can be staked until the read succeeds.'
      note.className = 'db-note warn'
    } else if (!open) {
      note.textContent = 'This match has finished. Nothing more can be staked on it.'
      note.className = 'db-note warn'
    } else if (!Bets.configured()) {
      note.textContent = 'Paper mode — no ArenaBattle address is configured, so this bet is ' +
        'recorded in this browser only. The odds are the contract’s real formula; the MON is not.'
      note.className = 'db-note warn'
    } else if (!this.snap || !this.snap.chain.matchId) {
      note.textContent = 'These two have not staked on chain yet, so there is no match to bet into. ' +
        'The moment they do, this becomes a real transaction.'
      note.className = 'db-note warn'
    } else if (!this.addrFor(this.side)) {
      note.textContent = 'That player has not connected a wallet, so there is no address to back.'
      note.className = 'db-note warn'
    } else {
      note.textContent = 'Pari-mutuel on ArenaBattle #' + this.snap.chain.matchId +
        '. Your stake returns in full if they win, plus a share of the losing pool after the 5% fee.'
      note.className = 'db-note'
    }
  },

  addrFor(side) {
    if (this.onchain && this.onchain.agents) {
      const a = side === 'p1' ? this.onchain.agents.A : this.onchain.agents.B
      return a ? a.owner : null
    }
    if (!this.snap) return ''
    return (side === 'p1' ? this.snap.p1.addr : this.snap.p2.addr) || ''
  },

  async placeBet() {
    const amt = this.amountWei()
    if (!amt || this.busy) return
    this.busy = true
    this.paintQuote()

    try {
      if (Bets.configured() && this.snap && this.snap.chain.matchId) {
        const fighter = this.addrFor(this.side)
        if (!fighter) throw new Error('That player has no wallet address to bet on')
        await Bets.place(this.snap.chain.matchId, this.side === 'p1' ? MONAD.SIDE_A : MONAD.SIDE_B,
          $('#bet-amt').value.trim(), (l) => this.log(l))
        await this.pollChain()
      } else {
        /* Paper. Same arithmetic, no transaction, and the log says so rather
           than printing a plausible-looking hash. */
        PaperBets.place(this.code, this.side, amt)
        this.log('paper bet: ' + fmtMon(amt) + ' MON on ' +
          (this.side === 'p1' ? 'player 1' : 'player 2') + ' (nothing left this browser)', 'warn')
        this.paintDetail()
      }
    } catch (err) {
      const msg = (err && (err.shortMessage || err.message)) || 'bet failed'
      this.log(msg, 'bad')
      this.note(msg)
    }

    this.busy = false
    this.paintQuote()
  },

  /* ---------------- your position ---------------- */

  paintMine() {
    const mine = this.myPosition()
    const any = mine.p1 > 0n || mine.p2 > 0n
    const box = $('#d-mine')
    box.classList.toggle('hidden', !any)
    if (!any) {
      /* The claim button lives inside the box, but hiding a parent is not the
         same as resetting a child: switching from a paper match with a claim
         showing to one with no position would leave a live CLAIM PAYOUT
         button waiting for the box to be shown again. */
      $('#btn-claim').classList.add('hidden')
      return
    }

    const parts = []
    if (mine.p1 > 0n) parts.push(fmtMon(mine.p1) + ' MON on player 1')
    if (mine.p2 > 0n) parts.push(fmtMon(mine.p2) + ' MON on player 2')
    $('#dm-pos').textContent = parts.join('  ·  ')

    const settled = this.onchain ? this.onchain.status === 3 : !!(this.snap && this.snap.winner)
    const owedRow = $('#dm-owed-row')
    const btn = $('#btn-claim')

    if (!settled) {
      owedRow.classList.add('hidden')
      btn.classList.add('hidden')
      return
    }
    owedRow.classList.remove('hidden')

    if (this.onchain) {
      const claimed = !!this.onchain.claimed
      const owed = this.onchain.owed || 0n
      $('#dm-owed').textContent = claimed ? 'already claimed'
        : owed > 0n ? fmtMon(owed) + ' MON'
        : 'nothing — the other side took the pool'
      btn.classList.toggle('hidden', claimed || owed <= 0n)
      btn.disabled = this.busy
    } else if (this.ledger() === 'blind') {
      $('#dm-owed').textContent = 'unknown — cannot reach ' + MONAD.chainName
      btn.classList.add('hidden')
    } else {
      /* Paper: run the contract's own settlement branch on the local pools
         so the number shown is the number the chain would have produced. */
      const r = PaperBets.settle(this.code, this.snap.winner)
      const claimed = PaperBets.claimed(this.code)
      $('#dm-owed').textContent = claimed ? 'already claimed (paper)'
        : r.payout > 0n ? fmtMon(r.payout) + ' MON' + (r.refund ? ' (refund — nobody backed the winner)' : ' (paper)')
        : 'nothing — you backed the wrong fighter'
      btn.classList.toggle('hidden', claimed || r.payout <= 0n)
      btn.disabled = this.busy
    }
  },

  async claim() {
    if (this.busy) return
    this.busy = true
    $('#btn-claim').disabled = true
    try {
      if (this.onchain) {
        await Bets.claim(this.onchain.matchId, (l) => this.log(l, 'ok'))
        await this.pollChain()
      } else {
        const r = PaperBets.settle(this.code, this.snap.winner)
        PaperBets.markClaimed(this.code)
        this.log('paper payout ' + fmtMon(r.payout) + ' MON — no MON moved', 'warn')
        this.paintMine()
      }
    } catch (err) {
      const msg = (err && (err.shortMessage || err.message)) || 'claim failed'
      this.log(msg, 'bad')
      this.note(msg)
    }
    this.busy = false
    this.paintMine()
  },

  /* A transient line under the status bar. Errors from a wallet are long and
     shouty; this keeps them out of the layout. */
  note(text) {
    let el = $('#spec-note')
    if (!el) {
      el = document.createElement('div')
      el.id = 'spec-note'
      document.body.appendChild(el)
    }
    el.textContent = text
    el.classList.add('on')
    clearTimeout(this._noteTimer)
    this._noteTimer = setTimeout(() => el.classList.remove('on'), 5200)
  }
}

const MODE_LABEL = { fighter: 'AI FIGHTER', pen: 'PEN FIGHT', hexgl: 'HEX RACER' }
const STATUS_LABEL = {
  lobby: 'FILLING',
  writing: 'WRITING',
  ready: 'READY',
  live: 'FIGHTING',
  done: 'FINISHED',
  gone: 'CLOSED'
}

function $(sel) { return document.querySelector(sel) }

Spectate.init()

/* A wallet switched under the page is a different bettor: every position,
   payout and claim state on screen belongs to the old address. */
if (typeof window !== 'undefined' && window.ethereum && window.ethereum.on) {
  window.ethereum.on('accountsChanged', async () => {
    Chain.signer = null
    Chain.userAddress = null
    Bets._ro = null
    try { await Chain.connectWallet() } catch (e) {}
    Spectate.paintStatus()
    Spectate.pollChain()
  })
}
