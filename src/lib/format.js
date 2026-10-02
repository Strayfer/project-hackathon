export const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`

export const PEOPLE_COUNT = 4

export const perPerson = (amount) => Math.round(amount / PEOPLE_COUNT)

/** Rotation lookup: rotation rows are pre-materialised per (dutyId, week). */
export function turnOf(rotation, dutyId, week) {
  return rotation.find((r) => r.dutyId === dutyId && r.week === week)?.name ?? '—'
}

export function rotationAhead(rotation, dutyId, fromWeek, count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    week: fromWeek + i,
    name: turnOf(rotation, dutyId, fromWeek + i),
  }))
}

/**
 * Tiny inline formatter: `**bold**` -> <b>. Messages are stored as plain text in
 * SQLite, so nothing user-supplied is ever injected as HTML.
 */
export function formatMessage(msg) {
  return String(msg)
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((chunk, i) =>
      chunk.startsWith('**') && chunk.endsWith('**')
        ? { b: chunk.slice(2, -2), key: i }
        : { t: chunk, key: i }
    )
}
