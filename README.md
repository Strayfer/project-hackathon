# United 216

Room 216 duty tracker for Telkom University Dormitory. React + Vite frontend, Express +
better-sqlite3 backend. The old single-file `index.html` prototype is now a real project
with a persistent database.

Runs **with or without a backend**: locally it uses the shared SQLite API, and on a static
host like Vercel it transparently falls back to a `localStorage` ledger. See
[Two backends](#two-backends).

## Run it locally

```bash
npm install
npm run dev
```

That starts both processes and opens the app in your browser:

| Service     | URL                     |
| ----------- | ----------------------- |
| Vite app   | http://localhost:5173   |
| API        | http://localhost:3001   |
| SQLite file| `data/room216.db`       |

Vite proxies `/api/*` to the API, so there is no CORS setup and no environment variables
to configure.

## Scripts

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | API + Vite together (`concurrently`)                        |
| `npm run dev:web`   | Vite only                                                  |
| `npm run dev:api`   | Express + SQLite only                                      |
| `npm run build`     | Production bundle into `dist/`                             |
| `npm run db:reset`  | Deletes the database file; the next API start re-seeds it  |
| `npm test`          | API smoke test against a running dev API (16 checks)       |
| `npm run test:ui`   | Headless Edge run through the whole UI flow (24 checks)    |
| `npm run test:contract` | API vs browser-local parity check (30 checks)          |
| `npm run test:static` | Builds `dist/` and drives it with **no** API at all (14 checks) |

Stop the API before `npm run db:reset` — Windows will not delete a file that is open.

## Two backends

The app has two interchangeable backends behind one identical interface.

| Mode | When it is used | Where data lives |
| ---- | --------------- | ---------------- |
| `api` | `GET /api/health` returns `{ok:true}` | SQLite at `data/room216.db`, shared by everyone |
| `local` | No API answers | `localStorage` key `united216:v1`, per browser |

On boot `src/api.js` probes `/api/health` **once**. If it does not answer with
`{ok:true}`, the client switches to `src/lib/localStore.js` for the rest of the page load and
the topbar shows a `LOCAL LEDGER` badge.

This exists because a static host serves only the built bundle. On Vercel, `/api/bootstrap`
returns the host's HTML 404 page rather than JSON — which used to blow up with
`Unexpected token 'T', "The page c"... is not valid JSON` and the
**CANNOT REACH THE ROOM LEDGER** screen. `src/api.js` now parses defensively: a non-JSON body
becomes a clean "API unavailable" signal that triggers the fallback.

### The tradeoff

**In `local` mode the ledger is per-browser.** Two people opening the Vercel URL get two
independent rooms. The shared SQLite ledger only exists when the API is running. For a real
multi-device deployment you would move the API to a hosted database — SQLite cannot run on
Vercel, whose filesystem is read-only and ephemeral.

### Keeping the two in sync

`shared/seed.js` is the single source of truth for roommates, duties, and the rotation rule.
Both `server/db.js` and `src/lib/localStore.js` import it, so the two backends cannot drift
on seed data.

`npm run test:contract` enforces parity on *behaviour*: it boots a throwaway API and a
`localStorage` store side by side and diffs every response field, including error cases. It
caught two real mismatches during development — `latestActivity` returned `created_at` from
the API but `createdAt` locally, and `markDone` resolved rotation names incorrectly in
local mode.

`npm run test:static` is the Vercel regression test: it serves `dist/` over HTTP with no
backend, confirms unknown `/api/*` paths return HTML (reproducing the original failure),
then asserts the app boots, mutates data, and survives a reload.

## Project layout

```
index.html            Vite entry (mounts #root, loads fonts)
vite.config.js        React plugin + /api proxy to :3001
shared/
  seed.js              roommates, duties, rotation rule — shared by BOTH backends
server/
  db.js               SQLite connection, schema, seed data
  index.js            Express routes
  reset.js            db:reset helper
src/
  main.jsx            React root
  App.jsx             app state, API orchestration, tab shell
  api.js              fetch wrapper + backend probe/fallback
  components/         LoginGate, TopBar area, MateGrid, Patungan,
                      ActivityFeed, SchedulePanel, PixelWipe,
                      LawAnnotations, Backdrop, Toast, Avatar
  lib/
    localStore.js     browser-localStorage backend (mirrors server/index.js)
    sound.js          Web Audio synth SFX
    avatar.js         pixel avatar painter
    confetti.js       canvas confetti burst
    format.js         rupiah + rotation helpers
  styles/index.css    the prototype's stylesheet, ported verbatim
scripts/
  smoke.js            API-level test
  browser-check.js    CDP-driven UI test (needs dev servers running)
  contract-check.js   API vs localStore parity
  static-check.js     dist/ with no backend — the Vercel regression test
```

## Database

`data/room216.db` is created and seeded on first API start.

| Table              | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `mates`            | The 4 roommates, with pixel-avatar traits and streak        |
| `duties`           | The 5 rotating chores                                      |
| `rotation`         | Materialised schedule: one row per (duty, week) -> owner   |
| `room_state`       | Singleton row: logged-in user, current week, sound setting |
| `expenses`         | Patungan purchases                                        |
| `expense_payments` | Per-expense, per-roommate paid flag                        |
| `activity`         | Append-only feed of everything the room did                |

Two things changed from the prototype, both because state now lives in the database:

- **The rotation is a table, not a formula.** The prototype computed
  `(offset + week) % 4` in the browser. `rotation` holds the same staggered start as
  materialised rows (16 weeks per duty), so the schedule is queryable and the API can
  report who is next without the client re-deriving it.
- **`current_week` is server-owned.** "MARK AS DONE" is a `POST` that increments it inside
  a transaction and writes the activity row, so two people in the room cannot double-advance
  the schedule.

## API

| Method | Path                        | Purpose                                    |
| ------ | --------------------------- | ------------------------------------------ |
| GET    | `/api/bootstrap`            | Full room state in one request              |
| POST   | `/api/login`                | `{ name }` -> sets `room_state.current_user` |
| POST   | `/api/logout`               | Clears the logged-in user                   |
| PUT    | `/api/settings/sound`       | `{ soundOn }`                               |
| POST   | `/api/schedule/done`        | `{ dutyId }` -> advances the week, logs it  |
| POST   | `/api/expenses`             | `{ desc, amount }` -> splits 4 ways          |
| POST   | `/api/expenses/:id/toggle`  | `{ mateId }` -> flips a paid flag           |

Every mutating route returns the full updated state, so the client never has to guess what
changed.

## Notes

- Activity messages are stored as plain text with `**bold**` markers and rendered by a tiny
  formatter, so nothing user-supplied is ever injected as HTML.
- The login gate stays mounted during its 380ms exit transition, then unmounts.
- Requires Node.js 20+ (developed on 24.19 LTS).
