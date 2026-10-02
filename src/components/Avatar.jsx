import { useEffect, useRef } from 'react'
import { drawAvatar } from '../lib/avatar.js'

export default function Avatar({ mate, isMe = false, className = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) drawAvatar(ref.current, mate, isMe)
  }, [mate, isMe])

  return <canvas ref={ref} width="8" height="8" className={className} />
}
