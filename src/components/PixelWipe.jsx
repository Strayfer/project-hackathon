const CELLS = 48
const STAGGER = 7

/**
 * Presentational pixel wipe. `covered` + `runId` restart the stagger so the
 * same cells can replay on every tab change without manual DOM fiddling.
 */
export default function PixelWipe({ covered, runId }) {
  return (
    <div id="wipe" className={covered ? 'cover' : ''} key={runId} aria-hidden="true">
      {Array.from({ length: CELLS }, (_, i) => (
        <i key={i} style={{ animationDelay: `${i * STAGGER}ms` }} />
      ))}
    </div>
  )
}

export const WIPE_SWAP_MS = CELLS * STAGGER + 120
export const WIPE_TOTAL_MS = WIPE_SWAP_MS + 420
