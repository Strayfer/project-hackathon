import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'room216.db')

export const DUTIES = [
  'Water Tank',
  'Room Cleaning',
  'Bathroom',
  'Rice Restock',
  'Electricity Token',
]

const MATES = [
  { name: 'Kelana', role: 'the book-keeper', hair: 2, skin: 0, streak: 6 },
  { name: 'Bima', role: 'night-owl coder', hair: 0, skin: 1, streak: 3 },
  { name: 'Salsa', role: 'snack treasurer', hair: 3, skin: 2, streak: 5 },
  { name: 'Raka', role: 'token runner', hair: 1, skin: 0, streak: 2 },
]

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mates (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL UNIQUE,
  role   TEXT NOT NULL,
  hair   INTEGER NOT NULL DEFAULT 0,
  skin   INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  sort   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS duties (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
);

-- Materialised rotation table: one row per (duty, week) -> who is on call.
CREATE TABLE IF NOT EXISTS rotation (
  duty_id INTEGER NOT NULL REFERENCES duties(id) ON DELETE CASCADE,
  week    INTEGER NOT NULL,
  mate_id INTEGER NOT NULL REFERENCES mates(id) ON DELETE CASCADE,
  PRIMARY KEY (duty_id, week)
);

-- Singleton-ish room settings. current_week is the schedule pointer that
-- "MARK AS DONE" rolls forward; current_user is the logged-in roommate.
CREATE TABLE IF NOT EXISTS room_state (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  current_week INTEGER NOT NULL DEFAULT 0,
  current_user TEXT,
  sound_on     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  desc       TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expense_payments (
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  mate_id    INTEGER NOT NULL REFERENCES mates(id) ON DELETE CASCADE,
  paid       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (expense_id, mate_id)
);

CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  who        TEXT NOT NULL,
  msg        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rotation_duty ON rotation(duty_id, week);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(id DESC);
`

let db

function seed(db) {
  const mateCount = db.prepare('SELECT COUNT(*) AS n FROM mates').get().n
  if (mateCount > 0) return

  const tx = db.transaction(() => {
    const insMate = db.prepare(
      'INSERT INTO mates (name, role, hair, skin, streak, sort) VALUES (?, ?, ?, ?, ?, ?)'
    )
    MATES.forEach((m, i) => insMate.run(m.name, m.role, m.hair, m.skin, m.streak, i))

    const insDuty = db.prepare('INSERT INTO duties (name, sort) VALUES (?, ?)')
    DUTIES.forEach((d, i) => insDuty.run(d, i))

    // Staggered start, same rule the prototype used: duty i starts with mate i % 4.
    const insRot = db.prepare('INSERT INTO rotation (duty_id, week, mate_id) VALUES (?, ?, ?)')
    const insPay = db.prepare(
      'INSERT INTO expense_payments (expense_id, mate_id, paid) VALUES (?, ?, ?)'
    )
    const mates = db.prepare('SELECT id FROM mates ORDER BY sort').all()
    const duties = db.prepare('SELECT id, name FROM duties ORDER BY sort').all()
    for (let d = 0; d < duties.length; d++) {
      for (let w = 0; w < 16; w++) {
        insRot.run(duties[d].id, w, mates[(d + w) % mates.length].id)
      }
    }

    const insExp = db.prepare(
      'INSERT INTO expenses (desc, amount, created_by, created_at) VALUES (?, ?, ?, ?)'
    )
    const electricity = insExp.run('Electricity token', 50000, 'Bima', '2026-10-07 21:04:00').lastInsertRowid
    const galion = insExp.run('Galion refill x2', 44000, 'Salsa', '2026-10-06 19:40:00').lastInsertRowid
    // Legacy demo rows kept so the ledger is not empty on first boot.
    ;[true, false, true, false].forEach((paid, i) => insPay.run(electricity, mates[i].id, paid ? 1 : 0))
    ;[true, true, false, false].forEach((paid, i) => insPay.run(galion, mates[i].id, paid ? 1 : 0))

    const insAct = db.prepare('INSERT INTO activity (created_at, who, msg) VALUES (?, ?, ?)')
    insAct.run('2026-10-07 21:04:00', 'Bima', 'logged **Electricity Token** — Rp 50.000 split 4 ways')
    insAct.run('2026-10-07 07:30:00', 'Salsa', 'marked **Rice Restock** as done. legend.')
    insAct.run('2026-10-06 19:12:00', 'Kelana', 'marked **Room Cleaning** as done')

    db.prepare(
      "INSERT INTO room_state (id, current_week, current_user, sound_on) VALUES (1, 0, NULL, 1)"
    ).run()
  })
  tx()
}

export function getDb() {
  if (db) return db
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  seed(db)
  return db
}

export function closeDb() {
  if (db) {
    db.close()
    db = undefined
  }
}

export { DB_PATH, MATES }
