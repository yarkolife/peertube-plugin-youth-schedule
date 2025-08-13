async function register({ registerHook }) {
  const config = await fetch('/plugins/youth-schedule/router/config')
    .then(r => r.json())
    .catch(() => ({ timeSource: 'server', endTime: '06:00' }))
  // На странице просмотра скрываем видео, если текущее время вне окна
  registerHook({
    target: 'action:video-watch.player.loaded',
    handler: async ({ video }) => {
      try {
        const params = new URLSearchParams()
        if (config.timeSource === 'user') {
          const now = new Date()
          params.set('clientMinutes', String(now.getHours() * 60 + now.getMinutes()))
        }
        const res = await fetch(`/plugins/youth-schedule/router/video/${video.uuid}/youth-allowed?${params}`)
        if (!res.ok) return
        const data = await res.json()
        if (!data.allowed) {
          const playerRoot = document.querySelector('#player')
            || document.querySelector('.video-js')?.closest('#player, .video-wrapper, .video-container')
            || null
          if (!playerRoot) return

          // Добавляем стили для оверлея (однократно)
          if (!document.getElementById('youth-schedule-overlay-style')) {
            const style = document.createElement('style')
            style.id = 'youth-schedule-overlay-style'
            style.textContent = `
              .youth-schedule-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 10; padding: 16px; text-align: center; }
              .youth-schedule-overlay .msg { max-width: 720px; color: #fff; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, 'Helvetica Neue', Arial, sans-serif; }
              .youth-schedule-overlay .msg .title { font-size: 1.1rem; margin-bottom: 8px; }
              .youth-schedule-overlay .msg .subtitle { font-size: .95rem; opacity: .9; }
            `
            document.head.appendChild(style)
          }

          // Оборачиваем контейнер абсолютным позиционированием
          const prevPos = getComputedStyle(playerRoot).position
          if (prevPos === 'static' || !prevPos) playerRoot.style.position = 'relative'

          // Пауза воспроизведения, если вдруг началось
          const htmlVideo = playerRoot.querySelector('video')
          try { htmlVideo && htmlVideo.pause && htmlVideo.pause() } catch (_) {}

          // Добавляем оверлей
          const open = data.openLabel || '—'
          const end = data.endLabel || config.endTime || '06:00'
          let overlay = playerRoot.querySelector('.youth-schedule-overlay')
          if (!overlay) {
            overlay = document.createElement('div')
            overlay.className = 'youth-schedule-overlay'
            overlay.innerHTML = `
              <div class="msg">
                <div class="title">Dieses Video ist aus Jugendschutzgründen derzeit nicht verfügbar.</div>
                <div class="subtitle">Freigabe von ${open} bis ${end}.</div>
              </div>
            `
            playerRoot.appendChild(overlay)
          }
        }
      } catch (_) {
        // игнорируем
      }
    }
  })
}

export { register }


