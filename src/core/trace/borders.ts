import { type LabelMap, NO_LABEL, type Pt } from '../types'

/** One border between two colours, as the pixel-corner points along it (mm), in order.
 *  `left` / `right`: the labels on each side when walking from the first point to the last
 *  (y points down). A closed loop ends where it starts. */
export type TracedEdge = { left: number; right: number; points: Pt[] }

/**
 * The borders between colours, traced along the cracks between pixels.
 *
 * - A crack is the side between two pixels with different labels. Outside the map counts as
 *   NO_LABEL, so every colour's outline closes, also along the edge of the rug.
 * - A node is a pixel corner where 3 or 4 cracks meet: usually three colours touch there.
 * - An edge is a chain of cracks from node to node, or a closed loop without any node (an
 *   island inside one other colour). Each crack belongs to exactly one edge, so each border
 *   is stored once and both neighbouring areas share it.
 *
 * Points are the pixel corners along each edge, in mm: a staircase that 5.2 smooths.
 */
export function traceBorders(map: LabelMap): { nodes: Pt[]; edges: TracedEdge[] } {
  const { width: w, height: h, labels, mmPerPx } = map
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? NO_LABEL : labels[y * w + x]

  // Cracks. Horizontal crack (x, y): from corner (x, y) to (x + 1, y), between the pixels above
  // and below. Vertical crack (x, y): from corner (x, y) to (x, y + 1), between left and right.
  const H = (h + 1) * w // number of horizontal crack slots
  const hId = (x: number, y: number) => y * w + x
  const vId = (x: number, y: number) => H + y * (w + 1) + x
  const active = new Uint8Array(H + h * (w + 1))
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x < w; x++) if (at(x, y - 1) !== at(x, y)) active[hId(x, y)] = 1
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x <= w; x++) if (at(x - 1, y) !== at(x, y)) active[vId(x, y)] = 1
  }

  /** Active cracks at corner (x, y), each with the corner at its other end. */
  function cracksAt(x: number, y: number): { crack: number; to: [number, number] }[] {
    const out: { crack: number; to: [number, number] }[] = []
    if (x < w && active[hId(x, y)]) out.push({ crack: hId(x, y), to: [x + 1, y] })
    if (x > 0 && active[hId(x - 1, y)]) out.push({ crack: hId(x - 1, y), to: [x - 1, y] })
    if (y < h && active[vId(x, y)]) out.push({ crack: vId(x, y), to: [x, y + 1] })
    if (y > 0 && active[vId(x, y - 1)]) out.push({ crack: vId(x, y - 1), to: [x, y - 1] })
    return out
  }

  const isNode = (x: number, y: number) => cracksAt(x, y).length >= 3
  const used = new Uint8Array(active.length)
  const edges: TracedEdge[] = []
  const pt = (x: number, y: number): Pt => ({ x: x * mmPerPx, y: y * mmPerPx })

  /** Labels left and right of the step from (x, y) to (nx, ny); left of (dx, dy) is (dy, −dx). */
  function sides(x: number, y: number, nx: number, ny: number): [number, number] {
    if (ny === y) {
      const px = Math.min(x, nx) // the step runs along the top of pixel row y
      return nx > x ? [at(px, y - 1), at(px, y)] : [at(px, y), at(px, y - 1)]
    }
    const py = Math.min(y, ny) // the step runs along the left side of pixel column x
    return ny > y ? [at(x, py), at(x - 1, py)] : [at(x - 1, py), at(x, py)]
  }

  /** Walks from corner (x, y) along `crack` until a node, or back to the start. */
  function walk(x: number, y: number, first: { crack: number; to: [number, number] }): void {
    const [left, right] = sides(x, y, first.to[0], first.to[1])
    const points = [pt(x, y)]
    let step = first
    while (true) {
      used[step.crack] = 1
      const [cx, cy] = step.to
      points.push(pt(cx, cy))
      if (isNode(cx, cy)) break
      const next = cracksAt(cx, cy).find((c) => !used[c.crack])
      if (!next) break // back where a closed loop started
      step = next
    }
    edges.push({ left, right, points })
  }

  // Edges from every node, along each of its cracks not yet walked.
  const nodes: Pt[] = []
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      if (!isNode(x, y)) continue
      nodes.push(pt(x, y))
      for (const c of cracksAt(x, y)) if (!used[c.crack]) walk(x, y, c)
    }
  }
  // What is left are closed loops without a node. Start each at its first corner (top-left).
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      for (const c of cracksAt(x, y)) if (!used[c.crack]) walk(x, y, c)
    }
  }
  return { nodes, edges }
}
