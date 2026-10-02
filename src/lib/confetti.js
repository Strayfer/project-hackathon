/** Pixel confetti burst, self-contained and safe to call from anywhere. */
export function burstConfetti() {
  const canvas = document.getElementById('confetti')
  if (!canvas) return
  const cx = canvas.getContext('2d')

  const resize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resize()

  const colors = ['#d0212d', '#ff4a4a', '#f7efe9', '#3ecf6e', '#ffb3b3']
  const parts = []
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = 3 + Math.random() * 9
    parts.push({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2 - 40,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 4,
      s: 3 + Math.floor(Math.random() * 4) * 2,
      c: colors[i % colors.length],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1,
    })
  }

  let raf
  const tick = () => {
    cx.clearRect(0, 0, canvas.width, canvas.height)
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      if (p.life <= 0) {
        parts.splice(i, 1)
        continue
      }
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.28
      p.vx *= 0.985
      p.rot += p.vr
      p.life -= 0.012
      cx.save()
      cx.translate(p.x, p.y)
      cx.rotate(p.rot)
      cx.globalAlpha = Math.max(0, p.life)
      cx.fillStyle = p.c
      cx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s)
      cx.restore()
    }
    if (parts.length) {
      raf = requestAnimationFrame(tick)
    } else {
      cx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }
  raf = requestAnimationFrame(tick)

  window.addEventListener(
    'resize',
    () => {
      cancelAnimationFrame(raf)
    },
    { once: true }
  )
}
