# United 216

**Room harmony engine for Telkom University Dormitory Room 216.**

A pixel-art roommate duty tracker that answers the question every dorm has:
*"wait, whose turn was it?"*

Duty rotations, shared expenses (*patungan*), and an activity feed — all in one small app, backed by a local SQLite database.

---

## Features

### Login gate
Pick your face from the four roommates. No passwords — this is a dorm, not a bank. The app remembers who is signed in during the session.

### Duty rotation
The **Schedule** tab shows whose turn it is for the selected duty, this week and the next four. Hit **MARK AS DONE** and one press:

- advances the schedule pointer to the next week,
- writes a receipt into the activity feed,
- tells you whose turn is next.

The rotation is pre-materialised in the database as one row per `(duty, week)`, so lookups are a simple read — no computation, no arguing.

Duties tracked: Water Tank, Room Cleaning, Bathroom, Rice Restock, Electricity Token.

### Patungan (shared expenses)
Log a purchase and a total; it is split four ways. Each roommate gets a `PAID ✓` / `OWES` pill you can tap to toggle. Amounts are formatted as Indonesian rupiah (`Rp 50.000`) with `id-ID` locale grouping.

### Activity feed
Every action leaves a receipt: who did what and when. Messages are stored as plain text with `**bold**` markers and rendered through a tiny inline formatter — nothing user-supplied is ever injected as HTML.

### Sound
Optional Web Audio blips synthesised in the browser (no audio assets). Toggle from the top bar; the preference persists to the database.

### UX law annotations
A hackathon flourish: flip the **UX LAWS** toggle and red badges appear next to elements annotated with a `data-law="Name|Reason"` attribute — Hick's Law, Fitts's Law, Miller's Law, Jakob's Law, Aesthetic-Usability, Peak-End Rule. Hover them to read the rationale.

### Pixel aesthetic
Avatars are drawn at runtime as 8×8 pixel faces on a `<canvas>` (`src/lib/avatar.js`) — no image assets. Tab switches play a 48-cell staggered pixel wipe.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, Vite 7, `@vitejs/plugin-react` |
| Backend | Express 4 (Node ESM) |
| Database | SQLite via `better-sqlite3` |
| Styling | Hand-written CSS, no framework (`src/styles/index.css`) |
| Fonts | Press Start 2P + Nunito (Google Fonts) |
| Dev orchestration | `concurrently` |

No TypeScript, no CSS framework, no state-management library. The whole client is a single `useState` blob in `App.jsx` replaced by server responses.

---

## Getting started

### Requirements

- **Node.js 18+** (Node 20+ recommended — `better-sqlite3` ships prebuilt binaries)
- **npm 10+**
- Git, if you plan to clone

### Install

```bash
npm install
```

### Run in development

```bash
npm run dev
```

This starts both processes via `concurrently`:

- **API** — Express on `http://localhost:3001`
- **Web** — Vite on `http://localhost:5173` (opens automatically)

Vite proxies `/api/*` to the Express server, so the browser only ever talks to port 5173.

The SQLite database is created and seeded automatically at `data/room216.db` on first API start. Nothing to set up.

### All scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | API + web dev servers together |
| `npm run dev:web` | Vite dev server only (port 5173) |
| `npm run dev:api` | Express API only (port 3001) |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run db:reset` | Delete the SQLite file; the next API start re-seeds Room 216 |
| `npm run smoke` | End-to-end API smoke test — see below |

### Smoke test

`scripts/smoke.js` exercises the full API against a running dev server: bootstrap shape, rotation advance, login validation, mark-as-done, the 4-way expense split, payment toggles, and input limits.

```bash
npm run dev     # terminal 1
npm run smoke   # terminal 2
```

It prints a PASS/FAIL line per check and exits non-zero on any failure. All 16 checks pass against a freshly seeded database.

Note that the smoke test **mutates** the database — it rolls the schedule forward, logs a "Smoke test rice" expense, and toggles sound off. Run `npm run db:reset` afterwards to return to a clean seed.

---

## Configuration

All optional — the app runs with zero configuration.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Express listen port |
| `DB_PATH` | `data/room216.db` | SQLite file location |
| `API_LOG` | on (any value) | Request logging; set to `off` to silence it |

Example — run the API on another port with a separate database:

```bash
PORT=4000 DB_PATH=data/scratch.db npm run dev:api
```

---

## Project structure

```
.
├── index.html                     Vite entry, font preconnects
├── vite.config.js                 React plugin, port 5173, /api proxy to 3001
├── package.json
├── data/                          SQLite file lives here (gitignored)
├── scripts/
│   └── smoke.js                   End-to-end API smoke test (16 checks)
├── server/
│   ├── index.js                   Express app + all API routes
│   ├── db.js                      Schema, migrations-on-boot, seed data
│   └── reset.js                   Deletes the DB file
└── src/
    ├── main.jsx                   React root
    ├── App.jsx                    All state, tabs, toast orchestration
    ├── api.js                     Thin fetch wrapper around /api
    ├── components/
    │   ├── ActivityFeed.jsx       Receipt list with **bold** parsing
    │   ├── Avatar.jsx             Canvas-backed pixel face
    │   ├── Backdrop.jsx           Animated room background
    │   ├── LawAnnotations.jsx     Portal-based UX-law chips
    │   ├── LoginGate.jsx          Roommate picker overlay
    │   ├── MateGrid.jsx           The Room panel
    │   ├── Patungan.jsx           Expense form + payment ledger
    │   ├── PixelWipe.jsx          Staggered 48-cell wipe transition
    │   ├── SchedulePanel.jsx      Rotation hero + ahead table
    │   └── Toast.jsx              Ephemeral notification
    ├── lib/
    │   ├── avatar.js              8×8 face painter
    │   ├── confetti.js            Canvas confetti burst
    │   ├── format.js              Rupiah + rotation helpers
    │   └── sound.js               Web Audio synth SFX
    └── styles/index.css           Entire stylesheet
```

---

## Data model

Seven tables, created idempotently on boot (`CREATE TABLE IF NOT EXISTS`) with WAL journaling and foreign keys enabled.

| Table | Purpose |
| --- | --- |
| `mates` | The four roommates — name, role, hair/skin indices for the avatar, streak |
| `duties` | The five tracked duties, display-ordered |
| `rotation` | Materialised schedule: one row per `(duty_id, week)` → `mate_id`. Primary key `(duty_id, week)`. |
| `room_state` | Singleton row (`id = 1`): `current_week` pointer, `current_user`, `sound_on` |
| `expenses` | One row per shared purchase — description, amount in rupiah, creator |
| `expense_payments` | Join table: one row per `(expense_id, mate_id)` → `paid` flag |
| `activity` | Append-only feed of receipts |

Seed data is applied only when `mates` is empty, so restarting the server never overwrites your data. Mate and duty definitions live in `server/db.js` (`MATES`, `DUTIES`) — edit those and run `npm run db:reset` to reseed.

The 16-week rotation is generated with a staggered start (`mates[(duty + week) % 4]`), so no two duties start on the same person.

---

## API

All responses return the complete room state, so the client never has to merge partial updates.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness check; reports the DB path |
| `GET` | `/api/bootstrap` | Full state — mates, duties, rotation, expenses, activity, session |
| `POST` | `/api/login` | `{ name }` → sets the current user. 400 if unknown |
| `POST` | `/api/logout` | Clears the current user |
| `PUT` | `/api/settings/sound` | `{ soundOn: boolean }` |
| `POST` | `/api/schedule/done` | `{ dutyId }` → rolls `current_week` forward, logs activity, returns who/nextWho |
| `POST` | `/api/expenses` | `{ desc, amount }` → splits 4 ways. 400 if desc empty or amount < 1000 |
| `POST` | `/api/expenses/:id/toggle` | `{ mateId }` → flips that roommate's paid flag |

Expense creation, schedule advancement, and activity logging each run inside a `better-sqlite3` transaction, so a half-written schedule cannot survive a crash.

---

## Notes on the build

- `data/*.db`, `-wal`, `-shm`, and `-journal` are gitignored — the database is local state, not source.
- `node_modules` and `dist` are gitignored.
- The split is hardcoded to 4 people via `PEOPLE_COUNT` in `src/lib/format.js` and `entries.length` on the server. Both read from the same assumption; changing one without the other will misreport per-person amounts.
- No authentication, no rate limiting, no input length limits beyond a `maxLength` on the description field. This is a single-dorm LAN tool, not a public service.

---

Built by Room 216, for every room. · hackathon edition