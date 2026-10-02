import fs from 'node:fs'
import { DB_PATH } from './db.js'

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const file = `${DB_PATH}${suffix}`
  if (fs.existsSync(file)) {
    fs.rmSync(file)
    console.log(`[db] removed ${file}`)
  }
}
console.log('[db] reset complete — the next API start will re-seed room 216')
