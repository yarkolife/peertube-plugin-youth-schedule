async function register({ registerVideoField, registerHook }) {
  const config = await fetch('/plugins/youth-schedule/router/config')
    .then(r => r.json())
    .catch(() => ({ slots: ['20:00','22:00','23:00'] }))

  buildFormInputs(registerVideoField, config)

  // Добавляем CSS для стилизации неактивных полей
  const style = document.createElement('style')
  style.textContent = `
    /* Стили для неактивного селекта */
    select[name="youthOpenMinutes"]:disabled {
      opacity: 0.5 !important;
      cursor: not-allowed !important;
      background-color: #f5f5f5 !important;
    }
  `
  document.head.appendChild(style)

  function findControlByLabelText(textIncludes) {
    const labels = Array.from(document.querySelectorAll('label'))
    for (const label of labels) {
      const text = (label.textContent || '').trim()
      if (!text) continue
      if (text.includes(textIncludes)) {
        const root = label.closest('peertube-form-group, .form-group, fieldset') || label.parentElement
        if (!root) continue
        const control = root.querySelector('input, select, textarea')
        if (control) return control
      }
    }
    return null
  }

  // Инициализируем логику после загрузки формы
  registerHook({
    target: 'action:video-edit.init',
    handler: () => {
      const setupLogic = () => {
        let checkbox = document.querySelector('[name="youthSensitive"]')
        let selectField = document.querySelector('[name="youthOpenMinutes"]')
        if (!checkbox) checkbox = findControlByLabelText('Jugendschutz')
        if (!selectField) selectField = findControlByLabelText('Sendezeit')
        if (checkbox && selectField) {
          const apply = () => { selectField.disabled = !checkbox.checked }
          apply()
          checkbox.addEventListener('change', apply)
          return true
        }
        return false
      }
      let attempts = 0
      const maxAttempts = 30
      const trySetup = () => { attempts++; if (setupLogic()) return; if (attempts < maxAttempts) setTimeout(trySetup, 150) }
      setTimeout(trySetup, 200)
    }
  })
}

function buildFormInputs(registerVideoField, config) {
  for (const type of ['upload', 'update']) {
    const mainTabOptions = { type, tab: 'main' }

    registerVideoField({
      name: 'youthSensitive',
      label: 'Jugendschutz: sensibler Inhalt?',
      descriptionHTML: 'Falls ja, wird das Zeitfeld angezeigt.',
      type: 'input-checkbox',
      default: false
    }, mainTabOptions)

    // Селект со временем (HH:mm)
    const options = [{ value: '', label: '— Keine Beschränkung —' }]
    const slots = Array.isArray(config.slots) && config.slots.length ? config.slots : ['20:00','22:00','23:00']
    slots.forEach(t => { options.push({ value: String(timeStringToMinutes(t)), label: t }) })

    registerVideoField({
      name: 'youthOpenMinutes',
      label: 'Sendezeit (Start, HH:mm)',
      descriptionHTML: 'Wählen Sie die Startzeit. Liste und Endzeit sind in den Plugin-Einstellungen konfigurierbar.',
      type: 'select',
      options
    }, mainTabOptions)
  }
}

function timeStringToMinutes(str) {
  const s = String(str).trim()
  if (/^\d{1,2}$/.test(s)) return Math.min(23, Math.max(0, parseInt(s, 10))) * 60
  const m = s.match(/^(\d{1,2}):(\d{1,2})$/)
  if (m) {
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
    const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)))
    return h * 60 + mm
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

export { register }


