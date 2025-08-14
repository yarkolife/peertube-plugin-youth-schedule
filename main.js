async function register({ registerHook, storageManager, getRouter, registerSetting, settingsManager }) {
	// Настройки плагина: источник времени (user/server)
	if (registerSetting) {
		registerSetting({
			name: 'timeSource',
			label: 'Zeitquelle',
			type: 'select',
			default: 'server',
			descriptionHTML: 'Welche Zeit wird verwendet, um Verfügbarkeit zu prüfen?',
			options: [
				{ value: 'server', label: 'Serverzeit' },
				{ value: 'user', label: 'Browserzeit (Benutzer)' }
			]
		})

		// Редактируемые временные слоты, CSV часов/минут, например: 20,22:30,23:15
		registerSetting({
			name: 'timeSlots',
			label: 'Sendezeit-Slots (CSV HH:mm oder HH)',
			type: 'input',
			default: '20,22,23',
			descriptionHTML: 'Zulässige Startzeiten als CSV, z.B. 20,22:30,23:15. Gültig 00:00–23:59.'
		})

		// Конец окна доступности
		registerSetting({
			name: 'endTime',
			label: 'Endzeit (HH:mm)',
			type: 'input',
			default: '06:00',
			descriptionHTML: 'Zeitpunkt, bis wann Inhalte sichtbar sind. Format HH:mm. Kann kleiner als Startzeit sein (über Mitternacht).'
		})
	}

	const router = getRouter()

	// Роут: получить конфиг плагина для клиента
	router.get('/config', async (_req, res) => {
		try {
			const timeSource = (await getSetting(settingsManager, 'timeSource')) || 'server'
			const slotsCsv = (await getSetting(settingsManager, 'timeSlots')) || '20,22,23'
			const endTimeStr = normalizeTimeString((await getSetting(settingsManager, 'endTime')) || '06:00')
			const slotMinutes = parseSlotsToMinutes(slotsCsv)
			const slotLabels = slotMinutes.map(m => minutesToLabel(m))
			res.json({ timeSource, slots: slotLabels, endTime: endTimeStr })
		} catch (err) {
			res.status(500).json({ error: err.message })
		}
	})

	// Роут: проверка доступности видео
	router.get('/video/:uuid/youth-allowed', async (req, res) => {
		try {
			const videoUuid = req.params.uuid
			const meta = await storageManager.getData('youth-schedule-' + videoUuid)
			// Блокируем только если в метаданных включён чекбокс
			if (!meta || !meta.youthSensitive) return res.json({ allowed: true, debug: { reason: 'not-sensitive', youthSensitive: !!(meta && meta.youthSensitive) } })

			const timeSource = (await getSetting(settingsManager, 'timeSource')) || 'server'
			const endTimeStr = normalizeTimeString((await getSetting(settingsManager, 'endTime')) || '06:00')
			const endMinutes = timeStringToMinutes(endTimeStr)

			// Текущее время в минутах суток
			const now = new Date()
			let currentMinutes
			if (timeSource === 'server') {
				currentMinutes = now.getHours() * 60 + now.getMinutes()
			} else {
				const cm = Number(req.query.clientMinutes)
				const ch = Number(req.query.clientHour)
				if (Number.isFinite(cm)) currentMinutes = cm
				else if (Number.isFinite(ch)) currentMinutes = ch * 60
				else currentMinutes = now.getHours() * 60 + now.getMinutes()
			}

			// Время старта из меты (минуты). Поддерживаем старый формат часов
			let openMinutes = 0
			if (meta.youthOpenMinutes) {
				const parsed = Number(meta.youthOpenMinutes)
				openMinutes = Number.isFinite(parsed) ? clampMinutes(parsed) : 0
			} else if (meta.youthOpenHour) {
				const h = parseInt(meta.youthOpenHour, 10)
				openMinutes = Number.isFinite(h) ? clampMinutes(h * 60) : 0
			}

			if (!openMinutes) return res.json({ allowed: true, debug: { reason: 'no-openMinutes', youthSensitive: true } })

			const allowed = isWithinAllowedWindowMinutes(currentMinutes, openMinutes, endMinutes)
			return res.json({
				allowed,
				openLabel: minutesToLabel(openMinutes),
				endLabel: endTimeStr,
				debug: { timeSource, currentMinutes, openMinutes, endMinutes }
			})
		} catch (err) {
			res.status(500).json({ error: err.message })
		}
	})

	// Сохранение и восстановление метаданных при апдейте видео
	registerHook({
		target: 'action:api.video.updated',
		handler: ({ video, body }) => {
			const pluginData = body?.pluginData || {}
			const json = {
				youthSensitive: !!pluginData.youthSensitive,
				youthOpenMinutes: normalizeOpenMinutes(pluginData)
			}
			if (json.youthSensitive || json.youthOpenMinutes) {
				storageManager.storeData('youth-schedule-' + video.uuid, json)
			}
		}
	})

	// При создании тоже сохраняем
	registerHook({
		target: 'action:api.video.uploaded',
		handler: ({ video, body }) => {
			const pluginData = body?.pluginData || {}
			const json = {
				youthSensitive: !!pluginData.youthSensitive,
				youthOpenMinutes: normalizeOpenMinutes(pluginData)
			}
			if (json.youthSensitive || json.youthOpenMinutes) {
				storageManager.storeData('youth-schedule-' + video.uuid, json)
			}
		}
	})

	// Отдаём данные вместе с видео
	registerHook({
		target: 'filter:api.video.get.result',
		handler: async (video) => {
			if (!video) return video
			if (!video.pluginData) video.pluginData = {}
			const result = await storageManager.getData('youth-schedule-' + video.uuid)
			if (result) {
				Object.assign(video.pluginData, result)
				// Совместимость: для старых форм с часами
				if (!video.pluginData.youthOpenMinutes && video.pluginData.youthOpenHour) {
					const h = parseInt(video.pluginData.youthOpenHour, 10)
					if (Number.isFinite(h)) video.pluginData.youthOpenMinutes = h * 60
				}
			}
			return video
		}
	})
}

function isWithinAllowedWindowMinutes(currentMinutes, openMinutes, endMinutes) {
	// Если окно не пересекает полночь
	if (openMinutes < endMinutes) {
		return currentMinutes >= openMinutes && currentMinutes < endMinutes
	}
	// Окно через полночь: [open..24h) U [0..end)
	if (openMinutes > endMinutes) {
		return currentMinutes >= openMinutes || currentMinutes < endMinutes
	}
	// Равенство: трактуем как 24 часа доступности
	return true
}

function parseSlotsToMinutes(csv) {
	return String(csv)
		.split(',')
		.map(s => s.trim())
		.filter(Boolean)
		.map(timeStringToMinutes)
		.filter(n => Number.isFinite(n))
		.map(clampMinutes)
}

function clampMinutes(v) {
	if (!Number.isFinite(v)) return 0
	if (v < 0) return 0
	if (v >= 24 * 60) return 24 * 60 - 1
	return v
}

function minutesToLabel(minutes) {
	const h = Math.floor(minutes / 60)
	const m = minutes % 60
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function normalizeTimeString(str) {
	const m = timeStringToMinutes(str)
	return minutesToLabel(m)
}

function timeStringToMinutes(str) {
	// Поддержка 'H', 'HH', 'H:mm', 'HH:mm'
	const s = String(str).trim()
	if (!s) return 0
	if (/^\d{1,2}$/.test(s)) {
		const h = Math.min(23, Math.max(0, parseInt(s, 10)))
		return h * 60
	}
	const m = s.match(/^(\d{1,2}):(\d{1,2})$/)
	if (m) {
		const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
		const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)))
		return h * 60 + mm
	}
	const n = Number(s)
	if (Number.isFinite(n)) return clampMinutes(n)
	return 0
}

function normalizeOpenMinutes(pluginData) {
	if (!pluginData) return 0
	// Новый формат: минутный
	if (pluginData.youthOpenMinutes != null && pluginData.youthOpenMinutes !== '') {
		const v = Number(pluginData.youthOpenMinutes)
		if (Number.isFinite(v)) return clampMinutes(v)
	}
	// Старый формат: час
	if (pluginData.youthOpenHour != null && pluginData.youthOpenHour !== '') {
		const h = parseInt(pluginData.youthOpenHour, 10)
		if (Number.isFinite(h)) return clampMinutes(h * 60)
	}
	return 0
}

async function getSetting(settingsManager, name) {
	if (!settingsManager || !settingsManager.getSetting) return null
	try {
		return await settingsManager.getSetting(name)
	} catch (_) {
		return null
	}
}

async function unregister() { return }

module.exports = { register, unregister }


