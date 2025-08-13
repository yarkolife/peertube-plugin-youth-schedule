# PeerTube Plugin: Jugendschutz-Sendezeiten (Youth Schedule)

PeerTube-Plugin zur zeitgesteuerten Freigabe von Videos aus Jugendschutzgründen. Videos können ab einer konfigurierbaren Startzeit (HH:mm) bis zu einer konfigurierbaren Endzeit angezeigt werden.

## Zweck
- **Jugendschutz-Zeitfenster**: Inhalte sind erst ab einer gewählten Startzeit sichtbar, bis zur definierten Endzeit.
- **Einfache Redaktion**: Zusatzfelder beim Video-Upload/-Edit (Checkbox + Zeit-Auswahl).
- **Flexible Admin-Konfiguration**: Zeitquelle (Server/Browser), Startzeit-Slots als CSV (HH:mm), Endzeit (HH:mm).

## Funktionsumfang
- Video-Formular ergänzt um:
  - Checkbox: „Jugendschutz: sensibler Inhalt?“
  - Select: „Sendezeit (Start, HH:mm)“ mit Optionen aus der Admin-Konfiguration
- Auf der Videoseite wird der Player blockiert und ein Hinweis angezeigt, solange die aktuelle Zeit außerhalb des erlaubten Fensters liegt (inkl. Über-Mitternacht-Logik).
- Admin-Einstellungen:
  - Zeitquelle: Serverzeit oder Browserzeit des Nutzers
  - Sendezeit-Slots (CSV HH:mm oder HH): Liste erlaubter Startzeiten
  - Endzeit (HH:mm): Ende des sichtbaren Fensters

## Voraussetzungen
- PeerTube-Version: ≥ 5.2.0 (`engine.peertube`)

## Installation
1. Abhängigkeiten installieren und bauen:
   ```bash
   npm install
   npm run build
   ```
2. Bereitstellung in PeerTube:
   - Plugin-Ordner `peertube-plugin-youth-schedule` in das Plugins-Verzeichnis der Instanz legen, oder
   - ZIP erzeugen und in der PeerTube-Administration unter „Plugins/Themes“ hochladen.
3. In der PeerTube-Administration das Plugin aktivieren.

Hinweis zu npm: Ein `README.md` muss im Paketwurzelverzeichnis liegen, damit es auf der npm-Seite angezeigt wird. Siehe „About package README files“ in der npm-Dokumentation ([docs.npmjs.com](https://docs.npmjs.com/about-package-readme-files)).

## Konfiguration (Administration)
- **Zeitquelle (`timeSource`)**
  - `Server`: Serverzeit bestimmt die Verfügbarkeit.
  - `Browser (Benutzer)`: Zeit aus dem Browser des Nutzers wird zur Prüfung verwendet.
- **Sendezeit-Slots (`timeSlots`)**
  - CSV-Liste gültiger Startzeiten im Format `HH:mm` oder `HH`, z. B. `20:00,22:30,23`.
  - Bestimmt die auswählbaren Optionen im Video-Formular.
- **Endzeit (`endTime`)**
  - Ende des Sichtbarkeitsfensters im Format `HH:mm` (z. B. `06:00`).
  - Wenn Endzeit kleiner als Startzeit ist, gilt das Fenster über Mitternacht (z. B. 22:30 → 05:30).

## Verwendung (Upload/Bearbeitung)
1. Checkbox „Jugendschutz: sensibler Inhalt?“ aktivieren, wenn zutreffend.
2. Unter „Sendezeit (Start, HH:mm)“ die Startzeit wählen.
3. Die Metadaten werden gespeichert; die Freigabe erfolgt automatisch im zulässigen Fenster.

## Verhalten auf der Videoseite
- Logik (Minuten-genau): Verfügbar im Intervall `[Start .. End)`; bei Start > End über Mitternacht: `[Start..24:00) ∪ [00:00..End)`.
- Die „aktuelle Zeit“ kommt je nach Konfiguration von der Serverzeit oder der Browserzeit.
- Blockier-Hinweis zeigt das Intervall „von Start bis End“.

## Technische Details
- Gespeicherte Metadaten pro Video:
  - `youthSensitive: boolean`
  - `youthOpenMinutes: number` (Minuten ab 00:00, rückwärtskompatibel zu `youthOpenHour`)
- API-Endpunkte:
  - `GET /plugins/peertube-plugin-youth-schedule/router/config` → `{ timeSource, slots: string[HH:mm], endTime }`
  - `GET /plugins/peertube-plugin-youth-schedule/router/video/:uuid/youth-allowed?clientMinutes=INT` → `{ allowed, openLabel, endLabel }`
- Client-Bundles: `dist/video-edit-client-plugin.js` (Formular) und `dist/video-watch-client-plugin.js` (Watch-Seite).
- Build: `esbuild` (Skript `npm run build`), `prepare`-Hook baut automatisch.

## Lizenz
- AGPL-3.0

## Support & Issues
- Repository: https://github.com/yarkolife/peertube-plugin-youth-schedule
- Issues: https://github.com/yarkolife/peertube-plugin-youth-schedule/issues
