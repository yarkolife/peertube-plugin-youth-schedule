let __youthScheduleDecision = { decided: false, allowed: true, open: null, end: null }

async function register({ registerHook }) {
  const config = await fetch('/plugins/youth-schedule/router/config')
    .then(r => r.json())
    .catch(() => ({ timeSource: 'server', endTime: '06:00' }))

  const getNowMinutes = () => {
    const n = new Date()
    return n.getHours() * 60 + n.getMinutes()
  }

  async function checkAllowed(videoUuid) {
    try {
      const params = new URLSearchParams()
      if (config.timeSource === 'user') params.set('clientMinutes', String(getNowMinutes()))
      const url = `/plugins/youth-schedule/router/video/${videoUuid}/youth-allowed?${params}`
      const res = await fetch(url)
      if (!res.ok) return { allowed: true }
      const data = await res.json()
      return data
    } catch (_) {
      return { allowed: true }
    }
  }

  function getPlayerRoot() {
    // Приоритет: специальные контейнеры PeerTube и обёртки Video.js
    const candidates = [
      '#plugin-selector-player-container',
      '#videojs-wrapper',
      '#video-wrapper',
      '#player'
    ]

    for (const sel of candidates) {
      const el = document.querySelector(sel)
      if (el) {
        console.log('[YouthSchedule] player root via selector:', sel)
        return el
      }
    }

    // Пробуем сам контейнер Video.js
    const vjsContainer = document.querySelector('.video-js.vjs-peertube-skin') || document.querySelector('[id^="vjs_video_"]')
    if (vjsContainer) {
      console.log('[YouthSchedule] player root via videojs container')
      // Если есть родитель-обёртка — используем её, иначе сам контейнер
      const wrapper = vjsContainer.closest('#videojs-wrapper, #video-wrapper')
      return wrapper || vjsContainer
    }

    // Пробуем найти <video> и подняться к обёртке
    const vid = document.querySelector('video.vjs-tech') || document.querySelector('video')
    if (vid) {
      const outer = vid.closest('#videojs-wrapper, #video-wrapper, .video-js') || vid.parentElement
      if (outer) {
        console.log('[YouthSchedule] player root via video parent')
        return outer
      }
    }

    console.warn('[YouthSchedule] player root not found; please share DOM around <video>.')
    return null
  }

  // CSS стили
  if (!document.getElementById('youth-schedule-style')) {
    const style = document.createElement('style')
    style.id = 'youth-schedule-style'
    style.textContent = `
      .youth-schedule-init-hidden { visibility: hidden !important; }
      .youth-schedule-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 2147483647; padding: 16px; text-align: center; }
      .youth-schedule-overlay .msg { max-width: 720px; color: #fff; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, 'Helvetica Neue', Arial, sans-serif; }
      .youth-schedule-overlay .msg .title { font-size: 1.1rem; margin-bottom: 8px; }
      .youth-schedule-overlay .msg .subtitle { font-size: .95rem; opacity: .9; }
      .youth-schedule-block-video video, .youth-schedule-block-video .video-js { pointer-events: none !important; }
    `
    document.head.appendChild(style)
  }

  function applyOverlay(playerRoot, open, end) {
    if (!playerRoot) return
    const prevPos = getComputedStyle(playerRoot).position
    if (prevPos === 'static' || !prevPos) playerRoot.style.position = 'relative'
    playerRoot.classList.add('youth-schedule-block-video')

    let overlay = playerRoot.querySelector('.youth-schedule-overlay')
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.className = 'youth-schedule-overlay'
      overlay.innerHTML = `
        <div class="msg">
          <div class="title">Dieses Video ist aus Jugendschutzgründen derzeit nicht verfügbar.</div>
          <div class="subtitle">Freigabe von ${open || '—'} bis ${end}.</div>
        </div>
      `
      playerRoot.appendChild(overlay)
    }
  }

  // Важно: не деструктурируем параметры — некоторые версии PeerTube вызывают init без аргумента
  registerHook({
    target: 'action:video-watch.init',
    handler: async (ctx) => {
      try {
        const playerRoot = getPlayerRoot()
        if (playerRoot) playerRoot.classList.add('youth-schedule-init-hidden')

        const videoUuid = ctx && ctx.video && ctx.video.uuid
        if (!videoUuid) {
          // Нет UUID на ранней стадии — просто покажем контейнер, проверим позже в player.loaded
          if (playerRoot) playerRoot.classList.remove('youth-schedule-init-hidden')
          return
        }

        const data = await checkAllowed(videoUuid)
        __youthScheduleDecision = { decided: true, allowed: !!data.allowed, open: data.openLabel || null, end: data.endLabel || config.endTime || '06:00' }
        console.log('[YouthSchedule:init] decision', __youthScheduleDecision)

        if (playerRoot) playerRoot.classList.remove('youth-schedule-init-hidden')
        if (!__youthScheduleDecision.allowed) {
          applyOverlay(playerRoot, __youthScheduleDecision.open, __youthScheduleDecision.end)
          const htmlVideo = playerRoot?.querySelector('video')
          try { htmlVideo && htmlVideo.pause && htmlVideo.pause() } catch (_) {}
        }
      } catch (e) {
        console.warn('[YouthSchedule:init] error', e)
      }
    }
  })

  // Подстраховка: отключаем контролы при сборке опций плеера, если уже известно, что блокируем
  registerHook({
    target: 'filter:internal.video-watch.player.build-options.result',
    handler: (options) => {
      try {
        if (__youthScheduleDecision.decided && __youthScheduleDecision.allowed === false) {
          options.controls = false
          options.responsive = false
          options.fluid = false
          options.autoplay = false
          if (!options.userActions) options.userActions = {}
          options.userActions.hotkeys = false
        }
      } catch (_) {}
      return options
    }
  })

  // Основная логика: дублирующая проверка и оверлей на загруженном плеере
  registerHook({
    target: 'action:video-watch.player.loaded',
    handler: async ({ video }) => {
      try {
        if (!__youthScheduleDecision.decided) {
          const data = await checkAllowed(video.uuid)
          __youthScheduleDecision = { decided: true, allowed: !!data.allowed, open: data.openLabel || null, end: data.endLabel || config.endTime || '06:00' }
          console.log('[YouthSchedule:loaded] decision', __youthScheduleDecision)
        }
        if (__youthScheduleDecision.allowed) return

        const playerRoot = getPlayerRoot()
        if (!playerRoot) return

        const htmlVideo = playerRoot.querySelector('video')
        try { htmlVideo && htmlVideo.pause && htmlVideo.pause() } catch (_) {}
        applyOverlay(playerRoot, __youthScheduleDecision.open, __youthScheduleDecision.end)
      } catch (_) {
        // игнорируем
      }
    }
  })
}

export { register }


