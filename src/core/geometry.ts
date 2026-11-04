import type { Pt } from './types'

/**
 * Signed area of a polygon (shoelace formula): the sum of x[i]·y[i+1] − x[i+1]·y[i] over all
 * corners, halved. The sign tells the direction the corners go round; the size is the area.
 * Fewer than 3 points enclose nothing: 0.
 */
export function signedArea(p: Pt[]): number {
  if (p.length < 3) return 0
  let sum = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/** Area of a polygon, whichever direction its corners go round. */
export function polygonArea(p: Pt[]): number {
  return Math.abs(signedArea(p))
}
