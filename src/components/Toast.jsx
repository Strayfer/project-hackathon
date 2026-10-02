import { useEffect, useState } from 'react'

/** `toast` is `{ id, node }` — the id restarts the timer even for repeat text. */
export default function Toast({ toast }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!toast) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 3200)
    return () => clearTimeout(t)
  }, [toast])

  if (!toast) return null

  return (
    <div id="toast" className={visible ? 'show' : ''} role="status" aria-live="polite">
      {toast.node}
    </div>
  )
}
