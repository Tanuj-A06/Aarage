/* ------------------------------------------------------------------
   ui.js - screen flow, live prompt parsing, HUD, winner, mint.
------------------------------------------------------------------- */

const PRESETS = [
  { name: 'BERSERKER',    text: 'relentless berserker, attack without mercy, never back down' },
  { name: 'TURTLE',       text: 'patient and careful, block everything, wait for an opening' },
  { name: 'ASSASSIN',     text: 'extremely fast, dodge everything, hit and run' },
  { name: 'COWARD',       text: 'be a total coward, run away and avoid all damage' },
  { name: 'GLASS CANNON', text: 'all out attack, no defense at all, do or die' },
  { name: 'JUGGERNAUT',   text: 'slow and immovable, stand your ground, absorb everything' }
]

/* Pen Fight reads the SAME three stats out of the SAME parser - these are
   only phrased in the language of a desk, so a player writing for this mode
   is not fighting the lexicon. "Relentless" scores identically whether you
   are swinging a katana or a Reynolds 045. */
const PEN_PRESETS = [
  { name: 'SMASHER',   text: 'relentless, smash their pen off the desk, full power every flick' },
  { name: 'SNIPER',    text: 'patient and careful, line up the shot, never rush a flick' },
  { name: 'FLICKER',   text: 'extremely fast, quick light taps, spin away and reset' },
  { name: 'SURVIVOR',  text: 'stay in the middle, avoid the edge, let them overreach' },
  { name: 'ALL OR NOTHING', text: 'all out attack, no caution at all, do or die on every flick' },
  { name: 'ANCHOR',    text: 'slow and immovable, hold the centre, absorb everything they throw' }
]

/* The two games. Everything above the simulation is shared, so a mode is
   nothing more than which one gets handed the parsed prompts. */
const MODES = {
  fighter: {
    name: 'AI FIGHTER',
    presets: PRESETS,
    ph1: 'e.g. relentless berserker, attack without mercy, never back down',
    ph2: 'e.g. patient counter-puncher, stay out of range, punish mistakes'
  }
}

const DEFAULT_HINT = 'No controllers. Nobody touches a key once the bell rings.'

const $ = (s) => document.querySelector(s)
const $$ = (s) => Array.from(document.querySelectorAll(s))

const UI = {
  mode: 'fighter',
  parsed: { 1: null, 2: null },
  locked: { 1: false, 2: false },
  clock: null,
  clockLeft: CONFIG.PROMPT_SECONDS,
  pendingMint: null,
  pendingSettlement: null,
  lastSeed: 1,

  /* ---------------- boot ---------------- */

  init() {
    this.scale()
    window.addEventListener('resize', () => this.scale())

    $('#btn-begin').addEventListener('click', () => {
      FX.unlock(); FX.click()
      this.startPromptPhase()
    })

    this.setMode(this.mode)

    for (const side of [1, 2]) {
      $(`#in-${side}`).addEventListener('input', () => {
        FX.type()
        this.enforceWordLimit(side)
        this.liveParse(side)
      })
    }

    $$('[data-lock]').forEach((btn) => {
      btn.addEventListener('click', () => this.lockIn(parseInt(btn.dataset.lock, 10)))
    })

    /* 3D mode. Everything about the fight is unchanged - this only swaps
       which renderer draws it, so the button can be hit at any time and the
       simulation never notices. The model is ~450KB and loads on demand, so
       the button reports progress rather than appearing to hang. */
    const btn3d = $('#btn-3d')
    if (btn3d) {
      if (typeof Render3D === 'undefined' || !Render3D.available()) {
        btn3d.classList.add('hidden')       // no WebGL: never offer it
      } else {
        btn3d.addEventListener('click', () => {
          FX.click()
          if (Render3D.enabled) {
            Render3D.disable()
            btn3d.textContent = 'VIEW IN 3D'
            return
          }
          if (Render3D.ready) {
            Render3D.enable()
            btn3d.textContent = 'BACK TO 2D'
            return
          }
          btn3d.disabled = true
          btn3d.textContent = 'LOADING 3D...'
          Render3D.enable((ok, why) => {
            btn3d.disabled = false
            btn3d.textContent = ok ? 'BACK TO 2D' : '3D UNAVAILABLE'
            if (!ok) console.warn('[3d]', why)
          })
        })
      }
    }

    $('#btn-mint').addEventListener('click', () => this.runMint())
    $('#btn-again').addEventListener('click', () => {
      FX.click()
      this.beginFight(this.parsed[1], this.parsed[2], (this.lastSeed + 7919) >>> 0)
    })
    $('#btn-new').addEventListener('click', () => { FX.click(); this.startPromptPhase() })
    $('#btn-mint-back').addEventListener('click', () => { FX.click(); this.screen('screen-winner') })

    /* The in-page betting widget that used to live here is gone. It credited
       a local counter, sent bets to two hardcoded fighter addresses
       (0x...0001 and 0x...0002) that belong to nobody, and defaulted the
       match id to 1 - so every bet in the building landed on the same
       nonexistent match and the pool on screen was a number this file had
       made up. Betting now happens in arena.js against a real match id, and
       every figure on screen is read back from ArenaBattle. */

    $('#mute').addEventListener('click', () => this.toggleMute())
    window.addEventListener('keydown', (e) => {
      // Not while someone is typing their strategy - "m" is a common letter.
      const t = e.target && e.target.tagName
      if (t === 'TEXTAREA' || t === 'INPUT') return
      if (e.key === 'm' || e.key === 'M') this.toggleMute()
    })

    game.onEnd = (who, how) => this.showWinner(who, how)

    // ?bench=200 -> headless balance run, no UI
    if (QP.bench > 0) {
      console.log('running bench, ' + QP.bench + ' fights per matchup...')
      setTimeout(() => runBench(QP.bench), 300)
      return
    }

    if (QP.mode) this.setMode(QP.mode)

    // ?p1=&p2=&seed=&auto=1 -> skip straight in. Typing prompts live on a
    // projector while nervous is a known way to lose two minutes.
    if (QP.p1 || QP.p2) {
      $('#in-1').value = QP.p1 || PRESETS[0].text
      $('#in-2').value = QP.p2 || PRESETS[1].text
      this.liveParse(1); this.liveParse(2)
      if (QP.auto) {
        FX.unlock()
        this.parsed[1] = parsePrompt($('#in-1').value)
        this.parsed[2] = parsePrompt($('#in-2').value)
        this.screen('screen-analyze')
        this.runAnalyze()
        return
      }
      this.startPromptPhase()
    }
  },

  scale() {
    const s = Math.min(window.innerWidth / 1060, window.innerHeight / 620)
    $('#stage').style.transform = `scale(${Math.max(0.3, s)})`
  },

  /* ---------------- game select ---------------- */

  setMode(mode) {
    if (!MODES[mode]) return
    this.mode = mode
    const m = MODES[mode]

    /* The title screen has to stop promising a hands-off fight when the
       selected game is one you drive, and the coin slot has to say what it
       actually does next. */
    const begin = $('#btn-begin')
    if (begin) begin.textContent = 'INSERT COIN'
    const hint = $('.title-stack .hint')
    if (hint) hint.textContent = m.hint || DEFAULT_HINT
    /* VIEW IN 3D drives the fight renderer. Only touched when 3D was on offer
       use. Only touched when 3D was on offer at all - init hides it for good
       when there is no WebGL, and that decision stands. */
    const btn3d = $('#btn-3d')
    if (btn3d && typeof Render3D !== 'undefined' && Render3D.available()) {
      btn3d.classList.remove('hidden')
    }

    $('#in-1').placeholder = m.ph1
    $('#in-2').placeholder = m.ph2
    const tag = $('#mode-tag')
    if (tag) tag.textContent = m.name
    this.buildPresets()
  },

  buildPresets() {
    const list = MODES[this.mode].presets
    for (const side of [1, 2]) {
      const host = $(`.presets[data-for="${side}"]`)
      host.innerHTML = ''
      list.forEach((p) => {
        const b = document.createElement('button')
        b.className = 'preset'
        b.textContent = p.name
        b.addEventListener('click', () => {
          if (this.locked[side]) return
          FX.click()
          $(`#in-${side}`).value = p.text
          this.enforceWordLimit(side)
          this.liveParse(side)
        })
        host.appendChild(b)
      })
    }
  },

  screen(id) {
    $$('.screen').forEach((el) => el.classList.toggle('active', el.id === id))
    $('#hud').classList.toggle('hidden', id !== null && id !== '')
  },

  showFightHud() {
    $$('.screen').forEach((el) => el.classList.remove('active'))
    $('#hud').classList.remove('hidden')
  },

  toggleMute() {
    FX.setMuted(!FX.muted)
    $('#mute').classList.toggle('off', FX.muted)
  },

  /* ---------------- prompt phase ---------------- */

  startPromptPhase() {
    document.body.classList.remove('sudden-death')
    FX.vignette = 0
    this.locked = { 1: false, 2: false }
    this.parsed = { 1: null, 2: null }
    this.clockLeft = CONFIG.PROMPT_SECONDS
    for (const side of [1, 2]) {
      $(`.pbox.p${side}`).classList.remove('locked')
      const b = $(`[data-lock="${side}"]`)
      b.classList.remove('done'); b.disabled = false; b.textContent = 'LOCK IN'
      $(`#in-${side}`).disabled = false
      this.enforceWordLimit(side)
      this.liveParse(side)
    }
    this.screen('screen-prompt')
    $('#hud').classList.add('hidden')
    $('#in-1').focus()

    if (this.clock) clearInterval(this.clock)
    this.updateClock()
    this.clock = setInterval(() => {
      this.clockLeft--
      this.updateClock()
      if (this.clockLeft <= 10 && this.clockLeft > 0) FX.beep()
      if (this.clockLeft <= 0) { clearInterval(this.clock); this.clock = null; this.submitAll() }
    }, 1000)
  },

  updateClock() {
    const el = $('#prompt-clock')
    $('#clock-val').textContent = Math.max(0, this.clockLeft)
    el.classList.toggle('warn', this.clockLeft <= 20 && this.clockLeft > 10)
    el.classList.toggle('crit', this.clockLeft <= 10)
  },

  /* Hard 200-word cap, enforced as you type rather than silently truncating
     at submit - a strategy that got cut in half would lose its keywords and
     produce a fighter the player never asked for. */
  enforceWordLimit(side) {
    const el = $(`#in-${side}`)
    const words = promptWords(el.value)
    if (words.length > CONFIG.MAX_PROMPT_WORDS) {
      el.value = words.slice(0, CONFIG.MAX_PROMPT_WORDS).join(' ')
    }
    const n = promptWords(el.value).length
    const wc = $(`#wc-${side}`)
    wc.textContent = n + ' / ' + CONFIG.MAX_PROMPT_WORDS + ' WORDS'
    wc.classList.toggle('warn', n > CONFIG.MAX_PROMPT_WORDS * 0.8 && n < CONFIG.MAX_PROMPT_WORDS)
    wc.classList.toggle('full', n >= CONFIG.MAX_PROMPT_WORDS)
  },

  liveParse(side) {
    const text = $(`#in-${side}`).value
    const res = parsePrompt(text)
    this.parsed[side] = res

    $(`#arch-${side}`).textContent = text.trim() ? res.archetype : '—'
    this.renderBars($(`#bars-${side}`), res.stats)

    const chips = $(`#chips-${side}`)
    chips.innerHTML = ''
    if (!text.trim()) return
    if (res.improvised) {
      chips.innerHTML = '<span class="chip improv">no keywords — improvising</span>'
      return
    }
    const seen = new Set()
    res.matched.forEach((m) => {
      if (seen.has(m.label)) return
      seen.add(m.label)
      const el = document.createElement('span')
      const cls = m.compound ? 'compound' : m.stat
      el.className = 'chip ' + cls
      el.textContent = m.compound ? m.compound : (m.delta < 0 ? '−' : '+') + m.label
      chips.appendChild(el)
    })
  },

  renderBars(el, stats, wide) {
    const rows = [['ATK', 'aggression', 'atk'], ['DEF', 'defense', 'def'], ['SPD', 'speed', 'spd']]
    el.className = 'bars' + (wide ? ' wide' : '')
    el.innerHTML = rows.map(([label, key, cls]) => {
      const v = stats[key]
      const on = Math.round(v * 10)
      let segs = ''
      for (let i = 0; i < 10; i++) segs += `<i class="seg${i < on ? ' on' : ''}"></i>`
      return `<div class="bar-row ${cls}"><label>${label}</label><div class="bar-track">${segs}</div><b>${Math.round(v * 100)}</b></div>`
    }).join('')
  },

  lockIn(side) {
    if (this.locked[side]) return
    FX.click()
    // An empty box would hash to the same "improvised" fighter on both
    // sides, so auto-draft one instead - and it is more fun anyway.
    if (!$(`#in-${side}`).value.trim()) {
      const p = PRESETS[Math.floor(Math.random() * PRESETS.length)]
      $(`#in-${side}`).value = p.text
      this.enforceWordLimit(side)
      this.liveParse(side)
    }
    this.locked[side] = true
    $(`.pbox.p${side}`).classList.add('locked')
    $(`#in-${side}`).disabled = true
    const b = $(`[data-lock="${side}"]`)
    b.classList.add('done'); b.disabled = true; b.textContent = 'LOCKED'
    if (this.locked[1] && this.locked[2]) {
      if (this.clock) { clearInterval(this.clock); this.clock = null }
      this.submitAll()
    }
  },

  submitAll() {
    for (const side of [1, 2]) {
      if (!$(`#in-${side}`).value.trim()) {
        const p = PRESETS[Math.floor(Math.random() * PRESETS.length)]
        $(`#in-${side}`).value = p.text
      }
      this.parsed[side] = parsePrompt($(`#in-${side}`).value)
    }
    this.screen('screen-analyze')
    this.runAnalyze()
  },

  /* ---------------- analysis ---------------- */

  /* Ask Gemini to read both prompts, in parallel, on two of the eight keys.

     Only the two head-to-head games come through here: Hex Racer has a
     prompt too, but only one of them, asked for at START RUN (hexgl.js).
     Resolves to [{side, res}] where res is a parsePrompt-shaped
     object or null, and never rejects - a dead server, an empty key pool or
     a timeout all arrive here as null, which means "keep the local parse". */
  requestAI() {
    if (typeof AI === 'undefined' || !AI.enabled()) return null
    if (AI.available === false) return null
    const mode = this.mode
    return Promise.all([1, 2].map((side) => {
      const text = (this.parsed[side] && this.parsed[side].prompt) || $(`#in-${side}`).value
      return AI.analyze(text, mode)
        .then((res) => ({ side, res }))
        .catch(() => ({ side, res: null }))
    }))
  },

  runAnalyze() {
    const log = $('#analyze-log')
    log.innerHTML = ''
    this.analyzeDone = false

    const say = (text, cls) => {
      const d = document.createElement('div')
      if (cls) d.className = cls
      d.textContent = text
      log.appendChild(d)
      log.scrollTop = log.scrollHeight
      FX.type()
    }

    /* Fired before the first line is drawn, so the ~2s round trip runs
       underneath the scripted log instead of after it. By the time the last
       scripted line lands the verdict is usually already in. */
    const job = this.requestAI()

    const m1 = this.parsed[1].matched.map((m) => m.compound || m.label)
    const m2 = this.parsed[2].matched.map((m) => m.compound || m.label)
    const lines = [
      '> tokenizing both strategy prompts...',
      job ? '> gemini stat engine online' + (AI.keys ? ' (' + AI.keys + ' keys)' : '') + ' — sending both prompts...'
        : '> scanning strategy lexicon (218 terms)...',
      '> p1 matched: ' + (m1.length ? m1.slice(0, 6).join(', ') : 'none — improvising'),
      '> p2 matched: ' + (m2.length ? m2.slice(0, 6).join(', ') : 'none — improvising'),
      '> applying intensifiers and negations...',
      '> normalizing stat budget...',
      '> compiling fight behaviour trees...'
    ]
    const per = CONFIG.ANALYZE_MS / (lines.length + 1)
    lines.forEach((t, i) => setTimeout(() => say(t), per * i))

    const finish = () => {
      if (this.analyzeDone) return
      this.analyzeDone = true
      say('>> FIGHTERS READY', 'ok')
      setTimeout(() => this.showReveal(), 400)
    }

    // No AI in play: the screen behaves exactly as it always did.
    if (!job) {
      setTimeout(finish, CONFIG.ANALYZE_MS)
      return
    }

    const started = Date.now()
    let settled = false
    const pct = (v) => String(Math.round(v * 100)).padStart(2, ' ')

    job.then((results) => {
      if (settled) return
      settled = true
      let used = 0
      results.forEach(({ side, res }) => {
        if (!res) return
        used++
        /* The whole point: the local parse on screen is replaced by what
           Gemini read in the sentence, and every consumer downstream - the
           reveal card, the fight sim, the NFT mint - simply reads
           this.parsed and never learns the difference. */
        this.parsed[side] = res
        say('> gemini p' + side + ': ' + res.archetype +
          '  atk ' + pct(res.stats.aggression) +
          '  def ' + pct(res.stats.defense) +
          '  spd ' + pct(res.stats.speed))
      })
      if (!used) say('> gemini unreachable — local lexicon parse stands')
      /* Never cut the scripted log short just because the answer was fast. */
      setTimeout(finish, Math.max(0, CONFIG.ANALYZE_MS - (Date.now() - started)))
    })

    /* The backstop that makes this safe to run on stage. Whatever Google is
       doing, the fight starts. */
    setTimeout(() => {
      if (settled) return
      settled = true
      say('> gemini slow to answer — local lexicon parse stands')
      finish()
    }, CONFIG.AI_MAX_WAIT_MS)
  },

  /* ---------------- reveal ---------------- */

  showReveal() {
    this.screen('screen-reveal')
    for (const side of [1, 2]) {
      const p = this.parsed[side]
      const card = $(`#card-${side}`)
      card.innerHTML = `
        <h3>PLAYER ${side}</h3>
        <div class="big-arch">${p.archetype}</div>
        <div class="tag">${p.tagline}</div>
        <blockquote>${this.esc(shortPrompt(p.prompt, 260))}</blockquote>
        <div class="bars" id="rb-${side}"></div>`
      this.renderBars($(`#rb-${side}`), p.stats)
    }
    $('#reveal-go').classList.remove('go')
    FX.beepHigh()
    setTimeout(() => { $('#reveal-go').classList.add('go'); FX.bell() }, CONFIG.REVEAL_MS - 900)
    setTimeout(() => this.beginFight(this.parsed[1], this.parsed[2]), CONFIG.REVEAL_MS)
  },

  esc(s) {
    return String(s).replace(/[&<>"]/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
  },

  /* ---------------- fight ---------------- */

  beginFight(p1, p2, seed) {
    /* Fresh seed per fight.
       This used to be hashString(p1.prompt + '|' + p2.prompt), so the same
       pair of prompts replayed the identical fight forever - if that one
       seed happened to favour P2, P2 won every single run. Deterministic
       *stats* from the prompt is the property we want (and that lives in
       parsePrompt); a deterministic *battle* is not.
       ?seed=N still pins an exact fight for replay, and the seed in use is
       shown bottom-right on the HUD. */
    const s = seed !== undefined ? seed
      : (QP.seed !== null ? QP.seed
        : (Math.random() * 0xffffffff) >>> 0)
    this.lastSeed = s

    /* Whatever the last round left behind. Both modes set the sudden-death
       body class and only their own reset clears it, so a rematch across
       modes would otherwise start already red. */
    document.body.classList.remove('sudden-death')
    FX.vignette = 0
    FX.timeScale = FX.timeScaleTarget = 1
    console.log('[fight] seed=' + s + '  ' + p1.archetype + ' vs ' + p2.archetype)

    $('#hud-name-1').textContent = 'PLAYER 1'
    $('#hud-name-2').textContent = 'PLAYER 2'
    $('#hud-arch-1').textContent = p1.archetype
    $('#hud-arch-2').textContent = p2.archetype
    $('#hud-prompt-1').textContent = shortPrompt(p1.prompt)
    $('#hud-prompt-2').textContent = shortPrompt(p2.prompt)
    $('#seed-val').textContent = s
    for (const id of ['#playerHealth', '#enemyHealth', '#playerChip', '#enemyChip']) {
      if (window.gsap) gsap.killTweensOf(id)
      $(id).style.width = '100%'
    }
    $$('.hp-track').forEach((t) => t.classList.remove('low'))
    $('#timer').textContent = CONFIG.FIGHT_SECONDS
    $('#hud-timer').classList.remove('crit')

    // Reset spectator betting pools
    const sp1 = $('#spec-pool-1')
    const sp2 = $('#spec-pool-2')
    if (sp1) sp1.textContent = '0.00 MON'
    if (sp2) sp2.textContent = '0.00 MON'

    this.showFightHud()

    /* One game now. The arena is the product. */
    {
    }
    startFight(p1, p2, s)
    this.announce('FIGHT!')
  },

  updateHealth() { this.setHealth(player.health, enemy.health) },

  /* The HUD is shared by both games, so it takes numbers rather than
     reaching into the fighting game's globals. Pen Fight calls this with the
     two pens' condition and gets the trailing ghost bar, the danger state and
     the low-health styling for nothing. */
  setHealth(h1, h2) {
    const pairs = [['#playerHealth', '#playerChip', h1],
                   ['#enemyHealth', '#enemyChip', h2]]
    for (const [fill, chip, hp] of pairs) {
      if (window.gsap) {
        gsap.to(fill, { width: hp + '%', duration: 0.18, ease: 'power2.out' })
        // the ghost bar trails, which is what makes a big hit read as big
        gsap.to(chip, { width: hp + '%', duration: 0.75, delay: 0.32, ease: 'power2.inOut' })
      } else {
        $(fill).style.width = hp + '%'
        $(chip).style.width = hp + '%'
      }
    }
    $$('.hp-side')[0].querySelector('.hp-track').classList.toggle('low', h1 <= CONFIG.DANGER_HP)
    $$('.hp-side')[1].querySelector('.hp-track').classList.toggle('low', h2 <= CONFIG.DANGER_HP)
  },

  updateFightHud() {
    this.setTimer(Math.max(0, Math.ceil((game.totalFrames - game.frame) / 60)))
  },

  setTimer(left) {
    const el = $('#timer')
    if (el.textContent !== String(left)) {
      el.textContent = left
      if (left <= 10) FX.beep()
    }
    $('#hud-timer').classList.toggle('crit', left <= 10)
  },

  announce(text) {
    const el = $('#announce')
    el.textContent = text
    el.classList.remove('show')
    void el.offsetWidth          // restart the animation
    el.classList.add('show')
  },

  /* ---------------- winner ---------------- */

  /* `info` carries the simulation's own view of the result. Omitted (the
     fighting game's own call) it falls back to player/enemy/game. */
  showWinner(who, how, info) {
    const i = info || {}
    const hp1 = i.hp1 !== undefined ? i.hp1 : player.health
    const hp2 = i.hp2 !== undefined ? i.hp2 : enemy.health
    const win = who === 'p1' ? this.parsed[1] : who === 'p2' ? this.parsed[2] : null
    $('#win-how').textContent = i.label === 'RING OUT' ? 'OFF THE DESK'
      : how === 'KO' ? 'K.O.' : 'TIME UP'

    if (!win) {
      $('#win-title').textContent = 'DRAW'
      $('#win-arch').textContent = 'NOBODY WINS'
      $('#win-prompt').textContent = 'Both fighters standing. A draw voids the market - every bet is refunded, no fee is taken, and no NFT is minted.'
      $('#win-bars').innerHTML = ''
      $('#btn-mint').disabled = true
      this.pendingMint = null
    } else {
      $('#win-title').textContent = (who === 'p1' ? 'PLAYER 1' : 'PLAYER 2') + ' WINS'
      $('#win-arch').textContent = 'THE ' + win.archetype
      $('#win-prompt').textContent = '"' + sanitizePrompt(win.prompt) + '"'
      this.renderBars($('#win-bars'), win.stats, true)
      $('#btn-mint').disabled = false

      /* Everything the deferred chain pass needs, captured here and nowhere
         else. */
      this.pendingMint = {
        prompt: sanitizePrompt(win.prompt),
        stats: win.stats,
        archetype: win.archetype,
        won: true,
        hpRemaining: who === 'p1' ? hp1 : hp2,
        durationMs: i.durationMs !== undefined ? i.durationMs : Math.round(game.frame / 60 * 1000),
        seed: i.seed !== undefined ? i.seed : this.lastSeed,
        // Which game this fighter won. The two modes mint into the same
        // collection, and a token that cannot say which desk it came from is
        // a token missing half its provenance.
        game: i.mode || 'AI FIGHTER',
        finish: i.label || how,
        timestamp: Math.floor(Date.now() / 1000)
      }
    }

    /* The settlement payload is built for a DRAW too - a draw is a real
       result the contract has to be told about, because it is what voids the
       market and releases everybody's refund. Skipping it would leave the
       pools sitting in the contract until someone called voidMatch by hand. */
    this.pendingSettlement = (typeof Arena !== 'undefined')
      ? Arena.resultFrom(who, how, Object.assign({
          hp1: hp1, hp2: hp2, frame: (typeof game !== 'undefined' ? game.frame : 0),
          seed: this.lastSeed
        }, i))
      : null

    /* What the button does depends on whether there is a match to settle.
       Naming it MINT when nothing can be minted is how the old build ended up
       showing people fake token ids. */
    const mint = $('#btn-mint')
    if (mint) {
      const settleable = typeof Arena !== 'undefined' && Arena.matchId && Arena.live()
      mint.textContent = settleable
        ? (win ? 'SETTLE ON MONAD & MINT' : 'SETTLE DRAW ON MONAD')
        : 'NO ON-CHAIN MATCH'
      mint.disabled = !settleable
    }

    this.screen('screen-winner')
  },

  /* ---------------- settlement ---------------- */

  /* The old version of this called Chain.mint(), which fell back to a
     "simulated" mint that produced a random token id and a fabricated
     transaction hash. Nothing here invents either. Either Monad settled the
     match and the receipt says so, or the screen says it did not. */
  async runMint() {
    if (typeof Arena === 'undefined' || !Arena.matchId || !Arena.live()) {
      this.screen('screen-mint')
      const log = $('#mint-log')
      log.innerHTML = ''
      const d = document.createElement('div')
      d.textContent = '! ' + (typeof Chain !== 'undefined' ? Chain.whyNotLive() : 'no chain')
      log.appendChild(d)
      const d2 = document.createElement('div')
      d2.textContent = '  this fight was local. Nothing was settled and nothing was minted.'
      log.appendChild(d2)
      return
    }

    FX.click()
    this.screen('screen-mint')
    const log = $('#mint-log')
    log.innerHTML = ''
    $('#mint-result').classList.add('hidden')

    const say = (line) => {
      const d = document.createElement('div')
      d.textContent = line
      log.appendChild(d)
      log.scrollTop = log.scrollHeight
      FX.type()
    }

    /* The decision log is the audit trail for how JEV advised this fight.
       Its hash is about to go into the settlement signature, so it is worth
       saying out loud what is being committed to. */
    if (typeof JEV !== 'undefined') {
      const man = JEV.manifest()
      say('> JEV ' + man.jevVersion + '  model ' + man.model)
      say('  ' + man.decisions + ' tactical decisions, ' + man.advised + ' from the advisor')
      say('  decision hash ' + man.decisionHash.slice(0, 18) + '...')
    }

    Arena.say = say
    const res = await Arena.settle(this.pendingSettlement)

    if (!res || !res.settled) {
      say('! settlement did not complete. Nothing was minted.')
      return
    }

    if (res.voided) {
      say('> the market VOIDED: ' + res.reason)
      say('  every bet is refundable in full, and no fee was taken.')
      $('#mint-tx').textContent = res.txHash
      $('#mint-token').textContent = 'none (voided)'
      $('#sim-chip').classList.add('hidden')
      $('#mint-result').classList.remove('hidden')
      return
    }

    $('#mint-tx').textContent = res.txHash
    $('#mint-token').textContent = res.tokenId ? '#' + res.tokenId : 'none'
    $('#sim-chip').classList.add('hidden')   // this path is never simulated
    $('#mint-result').classList.remove('hidden')
    FX.cheer()
  }

}

UI.init()
