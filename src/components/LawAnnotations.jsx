import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Hamm's UX-law callouts. Elements opt in with a `data-law="Name|Why"` attribute;
 * this scans the mounted tree, positions a chip under each one, and keeps the
 * positions in sync with scroll/resize.
 */
export default function LawAnnotations({ enabled }) {
  const [items, setItems] = useState([])
  const [positions, setPositions] = useState({})

  useEffect(() => {
    if (!enabled) {
      setItems([])
      return
    }
    const nodes = [...document.querySelectorAll('[data-law]')].map((el, i) => {
      const [name, desc] = (el.dataset.law || '').split('|')
      return { id: i, name, desc, el }
    })
    setItems(nodes)
  }, [enabled])

  useEffect(() => {
    if (!enabled || !items.length) return

    const place = () => {
      const next = {}
      for (const { id, el } of items) {
        const r = el.getBoundingClientRect()
        next[id] = {
          left: Math.min(r.left + 8, window.innerWidth - 250),
          top: r.bottom + 10,
          hidden: r.bottom < -40 || r.top > window.innerHeight + 40,
        }
      }
      setPositions(next)
    }

    place()
    const t = setTimeout(place, 60)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [enabled, items])

  if (!enabled) return null

  return createPortal(
    <>
      {items.map(({ id, name, desc }) => (
        <div
          key={id}
          className="law-chip"
          style={{
            left: positions[id]?.left ?? -9999,
            top: positions[id]?.top ?? -9999,
            visibility: positions[id]?.hidden ? 'hidden' : 'visible',
          }}
        >
          <b>◆ {name}</b>
          {desc}
        </div>
      ))}
    </>,
    document.body
  )
}
