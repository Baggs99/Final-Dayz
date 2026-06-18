export function distanceSquared(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  return dx * dx + dy * dy
}

export function normalize(dx: number, dy: number) {
  const length = Math.hypot(dx, dy)

  if (length === 0) {
    return { x: 0, y: 0 }
  }

  return { x: dx / length, y: dy / length }
}

export function toNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
