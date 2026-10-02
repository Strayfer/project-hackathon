import { useEffect, useRef } from 'react'

/** Drifting pixel-star canvas that sits behind the whole app. */
export default function Backdrop() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    let pix = []
    let raf

    const resize = () => {
      canvas.width = Math.ceil(window.innerWidth / 3)
      canvas.height = Math.ceil(window.innerHeight / 3)
      canvas.style.width = '100vw'
      canvas.style.height = '100vh'
      pix = Array.from({ length: Math.min(90, window.innerWidth / 14) }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        s: [2, 2, 3, 4][Math.floor(Math.random() * 4)],
        v: 0.08 + Math.random() * 0.35,
        o: 0.05 + Math.random() * 0.22,
        c: Math.random() < 0.75 ? '208,33,45' : '255,235,230',
        drift: (Math.random() - 0.5) * 0.06,
        ph: Math.random() * 6.28,
      }))
    }

    const tick = (t) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of pix) {
        p.y -= p.v
        p.x += p.drift
        if (p.y < -6) {
          p.y = canvas.height + 6
          p.x = Math.random() * canvas.width
        }
        const tw = p.o * (0.65 + 0.35 * Math.sin(t / 700 + p.ph))
        ctx.fillStyle = `rgba(${p.c},${tw.toFixed(3)})`
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s)
      }
      raf = requestAnimationFrame(tick)
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <>
      <div className="bg-glow" />
      <canvas id="pixelSky" ref={ref} />
      <div className="bg-scan" />
      <div className="bg-vignette" />
    </>
  )
}
