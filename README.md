# Noted BuJo

A digital bullet journal and school planner for students. Plan your school year, weeks, and days, track habits, manage your timetable, and export everything as a print-ready PDF — in classic BuJo paper style.

Noted BuJo is available for **Windows** (this repository) and **Android**.

---

## Features

### Planning
- **Dashboard** – Today's focus tasks at a glance, upcoming appointments, daily habits, and a global search across all tasks, dates, and topics.
- **Jahresplan (Year plan)** – Create a school year with an automatic week grid. Manage holidays, days off school, exams, and deadlines.
- **Monatsplan (Month plan)** – Monthly calendar overview with task indicators, plus monthly goals and reflection.
- **Wochenplan (Week plan)** – Input phases, self-study phases, module topics with day assignment, private appointments, weekly reflection, and one-click migration of open tasks to the next week.
- **Tagesplan (Day plan)** – Focus tasks ("big" tasks) and quick tasks (< 2 min) with classic Bullet Journal status symbols: `○` open, `●` done, `▶` migrated, `◆` discarded.

### Organization
- **Stundenplan (Timetable)** – 8 × 5 grid; tap any cell to set subject, room, and teacher.
- **Subjects & modules** – Manage subjects with colors, teachers, and module/topic lists.
- **Habit tracker** – Daily habits with custom colors and optional time windows, tracked on a weekly grid.
- **Index** – Automatic table of contents with page numbers for every month, week, and day.

### PDF export
Export your entire school year as a landscape A4 PDF:
- Cover page with your profile
- Table of contents with page numbers
- Timetable
- School-year overview (week × day grid with tasks, exams, deadlines, and holidays)
- Week plans with module checkboxes and to-dos
- Monthly habit-tracking grids

The PDF layout (colors, title, sections) is configurable in the settings, and a preview with sample data is available.

### Appearance
- Light theme (BuJo paper look), dark theme, or follow the system setting.

---

## Getting started

### Download
Grab the latest installer (`Noted BuJo Setup x.x.x.exe`) from the [Releases](../../releases) page, install, and start journaling.

> On first start the app asks for a license key. Contact your administrator if you don't have one.

### Build from source

Requirements: [Node.js](https://nodejs.org) ≥ 18 and npm.

```bash
git clone <this-repository>
cd noted
npm install

# Run in development
npm start

# Build the Windows installer (NSIS)
npm run build
```

The installer is written to `dist/`.

---

## Usage guide

See [docs/USAGE.md](docs/USAGE.md) for a walkthrough of every screen, PDF settings, and tips (e.g., how topic-to-day assignment works).

---

## Data storage

All data is stored locally on your machine (SQLite database + preferences in your Windows user data folder). Nothing is synced or sent anywhere.

---

## Tech stack

| Layer      | Technology                     |
|------------|--------------------------------|
| Shell      | Electron 33                    |
| UI         | Vanilla HTML/CSS/JS, Material Design 3 styling |
| Database   | sql.js (SQLite via WebAssembly) |
| PDF        | jsPDF                          |

```
noted/
├── main.js            # Electron main process: DB, IPC, prefs, license gate
├── preload.js         # Context bridge API exposed to the renderer
├── pdf-generator.js   # PDF layout engine (cover, TOC, plans, habit grids)
└── src/
    ├── index.html     # Screens & dialogs
    ├── app.js         # Renderer logic / navigation / state
    ├── styles.css     # Material 3 dark + light themes
    └── license.js     # License key check (see note below)
```

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

---

## License

[MIT](LICENSE)
