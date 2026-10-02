/**
 * Single source of truth for Room 216 seed data.
 *
 * Imported by BOTH the SQLite server (server/db.js) and the browser-local
 * fallback (src/lib/localStore.js) so the two paths cannot drift apart.
 * Plain data only — no Node or browser APIs in here.
 */

/** Weeks of duty rotation materialised per duty. */
export const WEEKS = 16

export const DUTIES = [
  'Water Tank',
  'Room Cleaning',
  'Bathroom',
  'Rice Restock',
  'Electricity Token',
]

export const MATES = [
  { name: 'Kelana', role: 'the book-keeper', hair: 2, skin: 0, streak: 6 },
  { name: 'Bima', role: 'night-owl coder', hair: 0, skin: 1, streak: 3 },
  { name: 'Salsa', role: 'snack treasurer', hair: 3, skin: 2, streak: 5 },
  { name: 'Raka', role: 'token runner', hair: 1, skin: 0, streak: 2 },
]

/** Seeded expenses, plus each roommate's paid flag in `mates` order. */
export const SEED_EXPENSES = [
  {
    desc: 'Electricity token',
    amount: 50000,
    createdBy: 'Bima',
    createdAt: '2026-10-07 21:04:00',
    paid: [true, false, true, false],
  },
  {
    desc: 'Galion refill x2',
    amount: 44000,
    createdBy: 'Salsa',
    createdAt: '2026-10-06 19:40:00',
    paid: [true, true, false, false],
  },
]

export const SEED_ACTIVITY = [
  {
    createdAt: '2026-10-07 21:04:00',
    who: 'Bima',
    msg: 'logged **Electricity Token** — Rp 50.000 split 4 ways',
  },
  {
    createdAt: '2026-10-07 07:30:00',
    who: 'Salsa',
    msg: 'marked **Rice Restock** as done. legend.',
  },
  {
    createdAt: '2026-10-06 19:12:00',
    who: 'Kelana',
    msg: 'marked **Room Cleaning** as done',
  },
]

/**
 * Staggered rotation: duty `d` starts with mate `d % mates.length`, so no two
 * duties begin on the same person. Mirrors the rule server/db.js seeds with.
 */
export function buildRotation(mateIds, dutyCount = DUTIES.length, weeks = WEEKS) {
  const rows = []
  for (let d = 0; d < dutyCount; d++) {
    for (let w = 0; w < weeks; w++) {
      rows.push({ dutyId: d + 1, week: w, mateId: mateIds[(d + w) % mateIds.length] })
    }
  }
  return rows
}