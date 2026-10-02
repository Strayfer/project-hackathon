const SKINS = ['#f2c19a', '#d99e6b', '#b97a4e']
const HAIRS = ['#2b1c14', '#4a2c17', '#141414', '#5c3a21']

/** Paints an 8x8 pixel face onto a canvas. `isMe` tints the body row. */
export function drawAvatar(canvas, mate, isMe = false) {
  if (!canvas || !mate) return
  const c = canvas.getContext('2d')
  c.clearRect(0, 0, 8, 8)
  const px = (x, y, col) => {
    c.fillStyle = col
    c.fillRect(x, y, 1, 1)
  }
  const skin = SKINS[mate.skin % SKINS.length]
  const hair = HAIRS[mate.hair % HAIRS.length]

  for (let x = 1; x < 7; x++) px(x, 0, hair)
  px(0, 1, hair)
  px(7, 1, hair)
  px(1, 1, hair)
  px(6, 1, hair)
  if (mate.hair % 2) {
    px(2, 1, hair)
    px(5, 1, hair)
  }

  for (let y = 1; y < 7; y++) {
    for (let x = 1; x < 7; x++) {
      if (!(y === 1 && (x === 1 || x === 6))) px(x, y, skin)
    }
  }
  px(0, 2, skin)
  px(7, 2, skin)

  px(2, 3, '#1c1113')
  px(5, 3, '#1c1113')
  px(1, 4, 'rgba(208,33,45,.45)')
  px(6, 4, 'rgba(208,33,45,.45)')
  px(3, 5, '#7a3b2e')
  px(4, 5, '#7a3b2e')

  for (let x = 1; x < 7; x++) px(x, 7, isMe ? '#d0212d' : '#463233')
}
