/* ------------------------------------------------------------------
   site.js - AARAGE landing page.

   No build step and no dependencies, but it is not decoration-only: the
   parser panel, the roster and the movelist are all rendered from the
   game's own js/utils.js + js/config.js + js/prompt-parser.js, which
   index.html loads first. If those are missing the page still works, it
   just hides the three sections that would otherwise lie.
------------------------------------------------------------------- */

(function () {
  'use strict'

  const $  = (s, r) => (r || document).querySelector(s)
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s))

  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /* The game's code, if it loaded. Everything below checks before using it. */
  const hasParser = typeof parsePrompt === 'function' &&
                    typeof ARCHETYPES !== 'undefined' &&
                    typeof CONFIG !== 'undefined'

  /* ---------------- reveal on scroll ---------------- */

  const reveals = $$('.reveal')

  if (calm || !('IntersectionObserver' in window)) {
    // No observer, no staging - show everything rather than an empty page.
    reveals.forEach((el) => el.classList.add('in'))
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        e.target.classList.add('in')
        io.unobserve(e.target)        // reveal once; re-animating on scroll-up is noise
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })

    reveals.forEach((el) => io.observe(el))

    /* Safety net. If the observer never fires - a browser quirk, a bfcache
       restore, a zero-height layout - the copy must still be there. */
    setTimeout(() => reveals.forEach((el) => el.classList.add('in')), 3000)

    /* Siblings in a grid stagger, so a row arrives as separate beats rather
       than one block. Set on the element so the CSS stays free of nth-child
       bookkeeping. */
    $$('.cab, .sys').forEach((grid) => {
      $$('.reveal', grid).forEach((child, i) => {
        child.style.transitionDelay = (i * 90) + 'ms'
      })
    })
  }

  /* ---------------- the character ---------------- */

  const girl = $('#hero-girl')

  if (girl) {
    /* Faded in rather than shown: the poster frame pops before the video has
       a first frame, and a hard cut to it looks like a broken image. */
    const show = () => girl.classList.add('in')
    if (girl.readyState >= 2) show()
    else girl.addEventListener('loadeddata', show, { once: true })
    // Belt and braces - if the video never loads, the poster still fades up.
    setTimeout(show, 1200)
  }

  /* Autoplay is a request, not a guarantee. Safari on low power and most
     browsers with data-saver on will reject it; the poster then has to carry
     the frame, so make sure nothing is left mid-load looking broken. */
  $$('video').forEach((v) => {
    const p = v.play()
    if (p && typeof p.catch === 'function') {
      p.catch(() => { v.removeAttribute('autoplay') })
    }
  })

  /* ---------------- pointer parallax ---------------- */

  /* The hero is one word on a plate, so it gets a few pixels of travel to
     keep it from reading as a flat screenshot. Mouse only: on a touch screen
     there is no hover to track and the effect would just fight the scroll. */
  if (window.matchMedia('(pointer: fine)').matches && !calm) {
    const root = document.documentElement
    let queued = false
    let px = 0
    let py = 0

    window.addEventListener('pointermove', (e) => {
      px = (e.clientX / window.innerWidth) * 2 - 1     // -1 .. 1
      py = (e.clientY / window.innerHeight) * 2 - 1
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        root.style.setProperty('--par-x', px.toFixed(3))
        root.style.setProperty('--par-y', py.toFixed(3))
        queued = false
      })
    }, { passive: true })
  }

  /* ---------------- mobile drawer ---------------- */

  const burger = $('#nav-burger')
  const menu = $('#nav-menu')

  if (burger && menu) {
    const setMenu = (open) => {
      burger.setAttribute('aria-expanded', String(open))
      document.body.style.overflow = open ? 'hidden' : ''

      if (open) {
        menu.hidden = false
        // One frame between display and opacity, or the transition never runs.
        requestAnimationFrame(() => menu.classList.add('open'))
      } else {
        menu.classList.remove('open')
        setTimeout(() => { menu.hidden = true }, 220)
      }
    }

    burger.addEventListener('click', () => {
      setMenu(burger.getAttribute('aria-expanded') !== 'true')
    })

    // Every link in the drawer is a jump on this page, so close behind it.
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) setMenu(false)
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setMenu(false)
        burger.focus()
      }
    })

    // Rotating the phone to landscape can put the links back in the bar.
    window.addEventListener('resize', () => {
      if (window.innerWidth > 760 && burger.getAttribute('aria-expanded') === 'true') {
        setMenu(false)
      }
    })
  }

  /* ---------------- nav, progress, current section ---------------- */

  const nav = $('#nav')
  const bar = $('#progress-bar')
  const navLinks = $$('.nav-links a')
  const sections = navLinks
    .map((a) => ({ a, el: $(a.getAttribute('href')) }))
    .filter((s) => s.el)
  let ticking = false

  function onScroll() {
    const y = window.scrollY || document.documentElement.scrollTop

    if (nav) nav.classList.toggle('stuck', y > 40)

    /* The bands below the hero are opaque and cover the backdrop on their
       own; fading her out just stops her edge flickering at the seam. */
    if (girl) girl.classList.toggle('out', y > window.innerHeight * 0.55)

    if (bar) {
      const h = document.documentElement.scrollHeight - window.innerHeight
      bar.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%'
    }

    /* Which section owns the screen right now. Measured a third of the way
       down the viewport rather than at the top edge, which is where a reader
       is actually looking. */
    const mark = y + window.innerHeight * 0.34
    let live = null
    for (const s of sections) {
      if (s.el.offsetTop <= mark) live = s.a
    }
    navLinks.forEach((a) => a.classList.toggle('on', a === live))

    ticking = false
  }

  window.addEventListener('scroll', () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(onScroll)
  }, { passive: true })

  onScroll()

  /* ---------------- the live floor ----------------

     A read of /api/match/list, which is the same endpoint spectate.html
     runs on. It is placed ABOVE the parser bail-out below on purpose: the
     board needs no game code at all, and a page served without js/ should
     still be able to show what is happening right now.

     Three things this deliberately does not do: it does not invent matches
     to look busy, it does not report a single MON (pools live on chain and
     are read there, by the page that can actually spend), and it does not
     retry forever - a static host has no /api at all, and the band folds
     down to its empty state rather than polling a 404 all afternoon. */

  const sbList = $('#sb-list')

  if (sbList) {
    const sbTick = $('#sb-tick')
    const sbEmpty = $('#sb-empty')
    const SB_MAX = 4               // the band is a taste of the floor, not the floor
    const SB_MS = 6000
    let sbFails = 0

    const SB_STATUS = {
      lobby: 'filling', writing: 'writing', ready: 'ready',
      live: 'fighting', done: 'finished', gone: 'closed'
    }
    const SB_MODE = { fighter: 'AI FIGHTER', pen: 'PEN FIGHT', hexgl: 'HEX RACER' }

    const sbRow = (m) => {
      const a = document.createElement('a')
      a.className = 'sb-row s-' + m.status
      a.href = 'spectate.html?code=' + encodeURIComponent(m.code)

      a.innerHTML =
        '<span class="sb-code"></span>' +
        '<span class="sb-vs"><em class="sb-1"></em><s>vs</s><em class="sb-2"></em></span>' +
        '<span class="sb-meta"><i class="sb-mode"></i><i class="sb-state"></i></span>'

      /* textContent, every one: these strings came off a player's prompt box
         and travelled through a relay this page does not control. */
      a.querySelector('.sb-code').textContent = m.code
      a.querySelector('.sb-1').textContent = m.p1.archetype || (m.p1.locked ? 'LOCKED IN' : 'WRITING')
      a.querySelector('.sb-2').textContent = m.p2.seated
        ? (m.p2.archetype || (m.p2.locked ? 'LOCKED IN' : 'WRITING'))
        : 'EMPTY SEAT'
      a.querySelector('.sb-mode').textContent = SB_MODE[m.mode] || m.mode
      a.querySelector('.sb-state').textContent = m.winner
        ? (m.winner === 'p1' ? 'player 1 won' : 'player 2 won')
        : (SB_STATUS[m.status] || m.status)
      return a
    }

    const sbPoll = () => {
      fetch('/api/match/list', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (!d || !d.ok) throw new Error('bad board')
          sbFails = 0
          const all = d.matches || []
          sbList.innerHTML = ''
          all.slice(0, SB_MAX).forEach((m) => sbList.appendChild(sbRow(m)))
          if (sbEmpty) sbEmpty.classList.toggle('hidden', all.length > 0)
          if (sbTick) {
            sbTick.textContent = !all.length ? 'quiet'
              : all.length === 1 ? '1 match'
              : all.length + ' matches' + (all.length > SB_MAX ? ' — ' + SB_MAX + ' shown' : '')
          }
        })
        .catch(() => {
          sbFails++
          if (sbTick) sbTick.textContent = 'relay offline'
          if (sbEmpty) sbEmpty.classList.remove('hidden')
          /* No /api here - a static host, most likely. Stop asking. */
          if (sbFails >= 3 && sbTimer) { clearInterval(sbTimer); sbTimer = null }
        })
    }

    let sbTimer = setInterval(sbPoll, SB_MS)
    sbPoll()

    /* A band scrolled past is a band nobody is reading; there is no reason to
       keep a timer and a request alive for it. */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (sbTimer) { clearInterval(sbTimer); sbTimer = null }
      } else if (!sbTimer && sbFails < 3) {
        sbTimer = setInterval(sbPoll, SB_MS)
        sbPoll()
      }
    })
  }

  /* ==================================================================
     Everything below needs the game's parser. Bail out cleanly if the
     scripts did not load rather than leaving three empty sections.
     ================================================================== */

  if (!hasParser) {
    ['#parser', '#roster', '#system'].forEach((sel) => {
      const el = $(sel)
      if (el) el.remove()
    })
    $$('.nav-links a, .nav-menu a').forEach((a) => {
      const h = a.getAttribute('href') || ''
      if (h === '#parser' || h === '#roster' || h === '#system') a.remove()
    })
    return
  }

  const pct = (v) => Math.round(v * 100)

  /* ---------------- roster marquee ---------------- */

  const marquee = $('#marquee-run')

  if (marquee) {
    /* Two identical halves, and the keyframe translates by exactly -50%, so
       the loop point lands on a duplicate and never on a gap. */
    const half = ARCHETYPES
      .map((a) => '<em>' + a.name + '</em>')
      .join('<b></b>')
    const run = '<span>' + half + '<b></b></span>'
    marquee.innerHTML = run + run
  }

  /* ---------------- 01 - the parser panel ---------------- */

  /* Conditions are written out longhand because the real ones are predicate
     functions in js/prompt-parser.js and stringifying those reads terribly.
     Sample prompts are checked against the live parser at the bottom of this
     block, so if the lexicon changes and a sample stops landing on its own
     archetype, the console says so instead of the page quietly lying. */
  const ROSTER = {
    'GLASS CANNON': {
      cond: 'AGG >= 65  and  DEF <= 35',
      sample: 'glass cannon, all out attack, no defense whatsoever'
    },
    'BERSERKER': {
      cond: 'AGG >= 65  and  SPD >= 60',
      sample: 'relentless rushdown, blitz them fast, dash in and keep swinging, guard only when you must'
    },
    'JUGGERNAUT': {
      cond: 'DEF >= 65  and  SPD <= 40',
      sample: 'immovable brick wall, slow and heavy, absorb everything'
    },
    'TURTLE': {
      cond: 'DEF >= 60  and  AGG <= 40',
      sample: 'patient counter-puncher, stay out of range, quick on your feet, punish mistakes'
    },
    'ASSASSIN': {
      cond: 'SPD >= 65',
      sample: 'hit and run, dodge everything, lightning quick, slippery'
    },
    'BRAWLER': {
      cond: 'AGG >= 60',
      sample: 'aggressive, happy to trade hits all day, mostly guard'
    },
    'TACTICIAN': {
      cond: 'DEF >= 50  and  AGG >= 45',
      sample: 'mostly patient, slightly aggressive when the moment is right'
    },
    'JOURNEYMAN': {
      cond: 'anything left over',
      sample: 'fight normally and see what happens'
    }
  }

  const pdText  = $('#pd-text')
  const pdCount = $('#pd-count')
  const pdSrc   = $('#pd-src')
  const pdArch  = $('#pd-arch')
  const pdTag   = $('#pd-tag')
  const pdBars  = $('#pd-bars')
  const pdHits  = $('#pd-hits')
  const pdDer   = $('#pd-derived')
  const pdOut   = pdText && pdText.closest('.pd').querySelector('.pd-out')

  const STATS = [
    { key: 'aggression', label: 'AGG', c: 'var(--p1)' },
    { key: 'defense',    label: 'DEF', c: 'var(--p2)' },
    { key: 'speed',      label: 'SPD', c: 'var(--gold)' }
  ]

  if (pdBars) {
    pdBars.innerHTML = STATS.map((s) =>
      '<div class="pd-bar" data-k="' + s.key + '">' +
        '<span>' + s.label + '</span>' +
        '<i style="--c:' + s.c + '"></i>' +
        '<b>0</b>' +
      '</div>'
    ).join('')
  }

  /* The four presets are the shapes worth showing off: one of each corner of
     the stat triangle, plus the nonsense case. */
  const PRESETS = [
    { label: 'Berserker',   text: ROSTER['BERSERKER'].sample },
    { label: 'Turtle',      text: ROSTER['TURTLE'].sample },
    { label: 'Assassin',    text: ROSTER['ASSASSIN'].sample },
    { label: 'Glass cannon', text: ROSTER['GLASS CANNON'].sample },
    { label: 'Nonsense',    text: 'banana pancakes' }
  ]

  const presetHost = $('#pd-presets')
  if (presetHost) {
    presetHost.innerHTML = PRESETS
      .map((p, i) => '<button type="button" data-i="' + i + '">' + p.label + '</button>')
      .join('')
    presetHost.addEventListener('click', (e) => {
      const b = e.target.closest('button')
      if (!b) return
      stopAttract()
      type(PRESETS[+b.dataset.i].text)
    })
  }

  function render(raw) {
    const words = raw.trim() ? raw.trim().split(/\s+/).length : 0
    if (pdCount) pdCount.textContent = words + ' / 200 words'

    if (!raw.trim()) {
      if (pdOut) pdOut.classList.remove('improv')
      if (pdSrc) pdSrc.textContent = 'standby'
      if (pdArch) pdArch.textContent = '—'
      if (pdTag) pdTag.textContent = 'Waiting for a sentence.'
      $$('.pd-bar', pdBars).forEach((el) => {
        el.querySelector('i').style.setProperty('--v', 0)
        el.querySelector('b').textContent = '0'
      })
      if (pdHits) pdHits.innerHTML = ''
      if (pdDer) $$('dd b', pdDer).forEach((b) => { b.textContent = '—' })
      return
    }

    const r = parsePrompt(raw)

    if (pdOut) pdOut.classList.toggle('improv', r.improvised)
    if (pdSrc) pdSrc.textContent = r.improvised ? 'improvised from hash' : 'lexicon match'
    if (pdArch) pdArch.textContent = r.archetype
    if (pdTag) pdTag.textContent = r.tagline

    $$('.pd-bar', pdBars).forEach((el) => {
      const v = pct(r.stats[el.dataset.k])
      el.querySelector('i').style.setProperty('--v', v)
      el.querySelector('b').textContent = v
    })

    /* Which words actually moved a number, and which way. Compounds are
       tagged separately because one of them moves all three at once. */
    if (pdHits) {
      const seen = new Set()
      pdHits.innerHTML = r.matched.slice(0, 14).map((m) => {
        if (seen.has(m.label)) return ''
        seen.add(m.label)
        const cls = m.compound ? 'comp' : (m.delta >= 0 ? 'up' : 'down')
        const sign = m.compound ? m.compound : (m.delta >= 0 ? '+' : '−')
        return '<span class="' + cls + '">' + m.label + ' ' + sign + '</span>'
      }).join('')
      if (!r.matched.length) {
        pdHits.innerHTML = '<span>no keywords recognised</span>'
      }
    }

    /* The interesting part: the same numbers the simulation reads. */
    if (pdDer) {
      const vals = [
        CONFIG.moveSpeed(r.stats).toFixed(1),
        String(Math.round(CONFIG.bandTarget(r.stats))),
        String(pct(CONFIG.pBlock(r.stats))),
        String(CONFIG.decisionPeriod(r.stats))
      ]
      $$('dd b', pdDer).forEach((b, i) => { b.textContent = vals[i] })
    }
  }

  /* ---- typing it in, character by character ----
     A preset that appears all at once looks like a page swap. Typed in, it
     looks like the parser is keeping up, which is the thing being shown.

     The two numbers are paired and have to stay that way. TYPE_MS sets how
     long the longest preset takes to land (89 characters, so ~1.0s), and
     CYCLE_MS has to leave a readable pause on top of that or the next
     preset starts typing over one still being typed - which does not read
     as fast, it reads as broken. The gap at these values is ~1.8s after the
     longest line and ~2.2s after the shortest, against a 0.32s bar
     transition, so the numbers always finish moving before they change. */
  const TYPE_MS = 11
  const CYCLE_MS = 2800

  let typer = null

  function type(text) {
    if (!pdText) return
    clearInterval(typer)

    if (calm) {
      pdText.value = text
      render(text)
      return
    }

    pdText.value = ''
    let i = 0
    typer = setInterval(() => {
      pdText.value = text.slice(0, ++i)
      render(pdText.value)
      if (i >= text.length) clearInterval(typer)
    }, TYPE_MS)
  }

  /* ---- attract mode ----
     A cabinet with nobody at it demonstrates itself. This cycles the presets
     until the first real interaction, and then must never run again: `taken`
     is one-way. Without it, anything that re-fires the observer below (a
     smooth scroll back up, a resize, a bfcache restore) re-arms the demo and
     it starts typing over whatever the visitor is in the middle of writing. */
  let attract = null
  let attractOn = false
  let taken = false

  function stopAttract() {
    taken = true
    attractOn = false
    clearInterval(attract)
    clearInterval(typer)
  }

  function startAttract() {
    if (taken || attractOn || calm || !pdText || pdText.value) return
    attractOn = true
    let n = 0
    const step = () => {
      if (!attractOn) return
      type(PRESETS[n % (PRESETS.length - 1)].text)   // skip the nonsense one
      n++
    }
    step()
    attract = setInterval(step, CYCLE_MS)
  }

  if (pdText) {
    pdText.addEventListener('input', () => {
      stopAttract()
      clearInterval(typer)
      render(pdText.value)
    })
    pdText.addEventListener('focus', stopAttract)

    // Only run while the panel is on screen - a demo typing to itself out of
    // frame is wasted work. Once `taken` is set the observer stops mattering.
    if ('IntersectionObserver' in window) {
      const pio = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { startAttract(); return }
          if (taken) return
          clearInterval(attract)
          clearInterval(typer)
          attractOn = false
        })
      }, { threshold: 0.4 })
      pio.observe($('#parser'))
    } else {
      startAttract()
    }

    render('')
  }

  /* ---------------- 02 - the roster ---------------- */

  const grid = $('#rost-grid')

  /* Stats to draw on each tile. Derived by running the archetype's own
     sample prompt, so the silhouette on a tile is a real fighter and not a
     number picked to look good. */
  const rosterRows = ARCHETYPES.map((a, i) => {
    const meta = ROSTER[a.name] || { cond: '—', sample: '' }
    const parsed = meta.sample ? parsePrompt(meta.sample) : null
    return {
      i: i,
      name: a.name,
      tag: a.tag,
      cond: meta.cond,
      sample: meta.sample,
      stats: parsed ? parsed.stats : { aggression: 0, defense: 0, speed: 0 },
      ok: parsed ? parsed.archetype === a.name : false
    }
  })

  /* If a sample stops matching its archetype the tile would show the wrong
     silhouette. Say so in the console rather than shipping it silently. */
  rosterRows.filter((r) => r.sample && !r.ok).forEach((r) => {
    console.warn('[roster] sample prompt no longer lands on ' + r.name)
  })

  if (grid) {
    grid.innerHTML = rosterRows.map((r) =>
      '<li><button class="rost-tile" type="button" data-i="' + r.i + '" aria-pressed="false">' +
        '<span class="rt-n">' + String(r.i + 1).padStart(2, '0') + '</span>' +
        '<span>' +
          '<span class="rt-name">' + r.name + '</span>' +
          '<span class="rt-bars">' +
            STATS.map((s) =>
              '<i style="--c:' + s.c + ';--v:' + pct(r.stats[s.key]) + '"></i>'
            ).join('') +
          '</span>' +
        '</span>' +
      '</button></li>'
    ).join('')

    const rdIndex  = $('#rd-index')
    const rdName   = $('#rd-name')
    const rdTag    = $('#rd-tag')
    const rdCond   = $('#rd-cond')
    const rdSample = $('#rd-sample')
    const rdRun    = $('#rd-run')

    let picked = 0

    function select(i) {
      picked = i
      const r = rosterRows[i]
      $$('.rost-tile', grid).forEach((b) => {
        b.setAttribute('aria-pressed', String(+b.dataset.i === i))
      })
      if (rdIndex)  rdIndex.textContent = String(i + 1).padStart(2, '0') + ' / 08'
      if (rdName)   rdName.textContent = r.name
      if (rdTag)    rdTag.textContent = r.tag
      if (rdCond)   rdCond.textContent = r.cond
      if (rdSample) rdSample.textContent = r.sample
    }

    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.rost-tile')
      if (b) select(+b.dataset.i)
    })

    /* Arrow keys walk the roster the way a select screen does. Only while a
       tile has focus, so it never steals the page's own arrow scrolling. */
    grid.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 2, ArrowLeft: -1, ArrowUp: -2 }[e.key]
      if (!step) return
      e.preventDefault()
      const n = (picked + step + rosterRows.length) % rosterRows.length
      select(n)
      $('.rost-tile[data-i="' + n + '"]', grid).focus()
    })

    if (rdRun) {
      rdRun.addEventListener('click', () => {
        stopAttract()
        const target = $('#parser')
        if (target) target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
        // Let the scroll settle before the typing starts, or it runs off-screen.
        setTimeout(() => type(rosterRows[picked].sample), calm ? 0 : 420)
      })
    }

    select(0)
  }

  /* ---------------- 03 - the movelist ---------------- */

  const moveRows = $('#move-rows')

  if (moveRows) {
    /* Damage and cooldown are multipliers on `normal`, which is why that row
       reads 100% across the middle - it is the baseline, not a coincidence. */
    const accent = { jab: 'var(--p2)', normal: 'var(--dim)', heavy: 'var(--p1)' }

    moveRows.innerHTML = Object.keys(CONFIG.MOVES).map((k) => {
      const m = CONFIG.MOVES[k]
      return '<tr>' +
        '<td style="--row:' + (accent[k] || 'var(--dim2)') + '">' + k + '</td>' +
        '<td><b>' + m.startup + '</b>f</td>' +
        '<td><b>' + Math.round(m.dmg * 100) + '</b>%</td>' +
        '<td><b>' + Math.round(m.cdMult * 100) + '</b>%</td>' +
        '<td class="risk"><b>' + m.recovery + '</b>f</td>' +
      '</tr>'
    }).join('')
  }
})()
