# Color Tuft – Build Plan

Nov 4, 2026 · @Tobias

This file is the source of truth for progress: tick a task (`- [ ]` → `- [x]`) in the same commit that finishes it. Design spec: [`docs/spec.md`](spec.md).

## How we work together

This is a learning project: you review and understand every line before it is committed. One session is one task (1 to 3 hours), and every task runs the same loop.

1. **Pick:** tell me the task number (e.g. "let's do 3.2").
2. **Concept (about 10 minutes):** I explain what we build, why, where it sits in the pipeline, and the idea behind the algorithm (e.g. why OKLab, how border tracing and curve fitting work). You ask until it makes sense.
3. **Test first:** I write the test, you read it before any code exists. The test is the task's spec in code. You run it and watch it fail.
4. **Code in small pieces, with a walkthrough:** one file at a time. For each file I explain:
   - what the file is responsible for and what it depends on;
   - what each type, function or class does and why it exists;
   - the tricky lines, and the alternatives I didn't pick.
5. **Your review:** you read the diff in VS Code (`git diff`) and go through the review checklist below. Anything unclear, you ask; anything you'd do differently, we discuss and change.
6. **Green and commit:** you run the tests, see them pass, tick the task in `docs/plan.md`, and commit both together with a short message.
7. **Teach-back (2 minutes):** you explain in two or three sentences what the task added and how it works. I correct anything that's off. This is the fastest way to find gaps.

**Review checklist (every task):**

- I can explain what every function does without reading its body.
- I understand every line, including the maths.
- Names say what things are; nothing is misleadingly named.
- The tests check the behaviour the task promised, including the edge cases.
- Nothing in `src/core` touches the browser (`window`, `document`, React).
- I know what would break if this code were wrong.

**You write tasks:** tasks marked **(you write)** are small, well-defined pieces you implement yourself, with my tests and my review. They are spread across the plan so you build up from easy to harder.

**Rules:** we test with generated test images, never real artwork in the repo. When something breaks, paste the full error. After each session I update the progress log in the Project (`claude/progress.md`).

## Overview

**Goal:** build Color Tuft v0.1, a browser app that turns flat art into a true-size, projectable tufting pattern with yarn amounts.

**Architecture:** a pure TypeScript image pipeline (`src/core`) runs in a Web Worker; React UI (`src/ui`) and canvas renderers (`src/render`) sit on top; data lives in IndexedDB and `.tuft` files (`src/storage`). The core is built and tested first, so the UI only displays things that already work.

**Stack:** Vite, React, TypeScript (strict), Zustand, Comlink, Vitest, Playwright, oxlint, Prettier, fflate, idb, vite-plugin-pwa, GitHub Actions, GitHub Pages.

**Spec:** [`docs/spec.md`](spec.md). For agentic workers: implement with superpowers:executing-plans, one task at a time, following the loop above.

**Global constraints (apply to every task):**

- `src/core` has no browser or React imports; enforced by a lint rule.
- All lengths in `core` are millimetres; areas mm² (converted to m² only in yarn maths).
- All colour maths happens in OKLab.
- No dithering anywhere.
- Every colour shown in the UI carries its number and name.
- No network requests besides loading the app; images never leave the device.
- Deterministic output: any randomness uses a seeded generator.
- English UI, AGPL-3.0 licence (changed from MIT after 7.2); the app links to its source code.

**Phases and milestones** (rough effort in 1–3 h sessions):

| Phase | What works at the end | Sessions |
| --- | --- | --- |
| 0 Setup | Repo, tests, CI, live site on GitHub Pages | 2–3 |
| 1 Colour maths | OKLab, colour distance, generated test images | 3 |
| 2 Image prep | Load, fit to rug size, denoise | 3 |
| 3 Colour reduction | Palette, suggested count, colour map | 4 |
| 4 Cleanup | Islands removed, thin lines flagged and thickened | 3 |
| 5 Smooth tracing | Clean vector pattern; full pipeline in tests | 5–6 |
| 6 First app slice | **Milestone A:** see your art as a numbered pattern in the browser | 6 |
| 7 Outline | Cut line, border offset, rectangle mode | 4 |
| 8 Projector | **Milestone B:** project and tuft the Triforce | 5 |
| 9 Yarn | Stock, matching, amounts, waste learning | 6 |
| 10 Touch-ups | Brush, recolour, undo, thicken one line, simplify an area, show removed details | 7 |
| 11 Storage | Autosave, `.tuft` files, linked folder | 4 |
| 12 Preview | Yarn mockup for clients | 4 |
| 13 Release | **Milestone C:** v0.1 public, offline, designed, tested | 4 |

## Shared types

These live in `src/core/types.ts` (created in task 1.1) and every task uses these exact names.

```ts
export type RGB = { r: number; g: number; b: number };          // 0–255
export type OKLab = { L: number; a: number; b: number };
export type Pt = { x: number; y: number };                       // mm

export type ImageGrid = { width: number; height: number; data: Uint8ClampedArray }; // RGBA
export type RugSize = { widthMm: number; heightMm: number };

export const NO_LABEL = 255;                                      // outside the rug
export type LabelMap = { width: number; height: number; mmPerPx: number; labels: Uint8Array };

export type PaletteEntry = {
  number: number; name: string; lab: OKLab; hex: string; locked: boolean; yarnId?: string;
};

export type PathSeg = { kind: 'line'; to: Pt } | { kind: 'cubic'; c1: Pt; c2: Pt; to: Pt };
export type Edge = { id: number; left: number; right: number; start: Pt; segs: PathSeg[] };
export type RingRef = { edgeId: number; reversed: boolean }[];
export type Region = { id: number; label: number; rings: RingRef[] };
export type VectorPattern = { rug: RugSize; edges: Edge[]; regions: Region[] };

export type Yarn = {
  id: string; list: 'stock' | 'catalogue'; name: string; number: string; hex: string;
  photo?: Blob; gramsOnHand?: number; coneWeightG?: number; shop?: string;
};
export type Calibration = {
  id: string; name: string; gramsPerM2: number; waste: number; wasteHistory: number[];
};
```

`Edge.left` and `Edge.right` are the labels on each side, so each border exists exactly once and two neighbouring regions point at the same edge.

`Project`, the saved form of the project store (source image, rug, shape, colour count, minimum detail, offset and smoothing, palette, label map, calibration id), is defined in task 11.1.

## Review focus

The spec doesn't spell these out, but they're the inputs most likely to break the app for a real user. Each one has a test in the task named.

| Input or condition | Expected behaviour | Tested in |
| --- | --- | --- |
| PNG with soft, semi-transparent edges | Pixels under 50% alpha count as outside; no fuzzy halo colour in the palette | 3.4, 7.1 |
| More colours asked for than the art has (7 for a 2-colour Triforce) | Returns only the real colours, never near-duplicates | 3.2 |
| Rug aspect ratio differs from the image | Art fits inside the rug, centred, never stretched | 2.2 |
| Huge photos (e.g. 8000 × 6000 px) | Scaled down on load with a notice; no freeze or memory crash | 2.1 |
| A `.tuft` file from another app version, or a corrupt file | Older versions migrate; newer or broken files show a clear message | 11.1 |

## Phase 0: Setup

**Done when:** the repo builds, tests run, and every push to `main` deploys a page to GitHub Pages.

- [X] **0.1 Create the project.**
  - Builds: public GitHub repo `color-tuft`, Vite React TypeScript template, `strict: true`, folders `src/core`, `src/render`, `src/ui`, `src/storage`, `src/worker`, `test/fixtures`, `docs/`. Spec and this plan copied to `docs/spec.md` and `docs/plan.md`. `LICENSE` (MIT; changed to AGPL-3.0 after 7.2), short `README.md`.
  - Check: `npm run dev` opens the starter page.
  - Walkthrough: Vite's project layout, what each `tsconfig` strict option catches.
  - Commit: `chore: scaffold Vite React TS project`
- [X] **0.2 Tooling.**
  - Builds: Vitest (Node environment for `test/core/**`), oxlint (instead of ESLint: faster, same rules), Prettier (not run on `docs/`); scripts `test`, `lint`, `typecheck`, `format`, `build`. oxlint rule for `src/core/**` and `test/core/**`: `no-restricted-globals` (`window`, `document`, `navigator`, `self`) and `no-restricted-imports` (`react`, anything from `src/ui`, `src/render`).
  - Test: `test/core/smoke.test.ts` asserts `1 + 1 === 2`. Check: a throwaway `document.title` line in `src/core` fails `npm run lint`.
  - Walkthrough: why the core stays browser-free (runs in the worker and in Node tests).
  - Commit: `chore: add Vitest, oxlint, Prettier`
- [X] **0.3 CI/CD pipeline. (you write, with review)**
  - Builds: `.github/workflows/ci.yml`. On push and pull request: `npm ci`, lint, typecheck, test, build. On `main` only: upload `dist/` with `actions/upload-pages-artifact` and deploy with `actions/deploy-pages`. Vite `base: '/color-tuft/'`.
  - Check: the live URL shows the page; a deliberately failing test turns the run red and nothing deploys.
  - Walkthrough: jobs vs steps, `needs`, `permissions` for Pages, caching `node_modules`. A good DevOps exercise.
  - Commit: `ci: test and deploy to GitHub Pages`

## Phase 1: Colour maths and test images

**Done when:** colours convert to and from OKLab, distances come with word ratings, and generated test images exist for every later test.

- [X] **1.1 Types and colour conversion.**
  - Files: `src/core/types.ts` (shared types above), `src/core/color/convert.ts`, `test/core/color/convert.test.ts`.
  - Builds: `hexToRgb(hex: string): RGB`, `rgbToHex(c: RGB): string` **(you write these two)**, `srgbToOklab(c: RGB): OKLab`, `oklabToSrgb(c: OKLab): RGB` (clamped to 0–255).
  - Tests: `'#FFD700'` ↔ `{r:255,g:215,b:0}`; white gives L ≈ 1, a and b ≈ 0 (±1e-3); black gives L = 0; 1,000 seeded random colours round-trip within 1 per channel.
  - Walkthrough: sRGB gamma and linear light, why RGB distance lies about how different colours look, what OKLab's L, a and b mean.
  - Commit: `feat(core): OKLab colour conversion`
- [X] **1.2 Colour distance and match ratings.**
  - Files: `src/core/color/distance.ts`, `test/core/color/distance.test.ts`.
  - Builds: `deltaE(a: OKLab, b: OKLab): number` (Euclidean distance × 100), `matchRating(d: number): 'very-close' | 'close' | 'noticeable'` with thresholds `VERY_CLOSE = 3`, `CLOSE = 8` exported as constants (tuned later).
  - Tests: identical colours give 0 and `'very-close'`; black vs white gives `'noticeable'`; `deltaE(a, b) === deltaE(b, a)`.
  - Commit: `feat(core): colour distance and ratings`
- [X] **1.3 Generated test images.**
  - Files: `test/fixtures/images.ts`, `test/fixtures/random.ts`, `test/fixtures/images.test.ts`.
  - Builds: `seededRandom(seed: number): () => number`; image makers returning `ImageGrid`: `triforce(sizePx)`, `circle(sizePx)`, `gradientCircle(sizePx, steps)`, `thinOutline(sizePx, lineWidthPx)`, `smallEye(sizePx, eyeShare)` (large face with a tiny distinct dot), `sixColours(sizePx)`; modifiers `withJpegNoise(img, amplitude, seed)`, `withSoftAlpha(img, featherPx)`.
  - Tests: `triforce` has exactly 2 distinct colours; `circle(1000)` coloured area within 1% of πr²; `withSoftAlpha` produces alpha values strictly between 0 and 255 at the edge.
  - Walkthrough: why generated images beat real ones for tests (exact known answer, no files in the repo).
  - Commit: `test: generated fixture images`

## Phase 2: Image loading and preparation

**Done when:** any PNG, JPEG or WebP becomes a clean, rug-scaled `ImageGrid`.

- [X] **2.1 Load images safely.**
  - Files: `src/core/image/capSize.ts`, `src/render/loadImage.ts`, `test/core/image/capSize.test.ts`.
  - Builds: `capSize(w: number, h: number, maxSide = 4096): { width: number; height: number; downscaled: boolean }` (pure); `loadImageFile(file: File): Promise<{ grid: ImageGrid; downscaled: boolean }>` via `createImageBitmap` and `OffscreenCanvas`. Unsupported types reject with `Unsupported image type. Use PNG, JPEG or WebP.`
  - Tests: `capSize(8000, 6000)` gives 4096 × 3072 and `downscaled: true`; `capSize(800, 600)` unchanged. Check: loading a large phone photo in the browser shows the notice and doesn't freeze.
  - Commit: `feat: load and cap images`
- [X] **2.2 Fit the image to the rug.**
  - Files: `src/core/image/fitToRug.ts`, `test/core/image/fitToRug.test.ts`.
  - Builds: `fitToRug(img: ImageGrid, rug: RugSize, mmPerPx: number): ImageGrid`. The output is `rug / mmPerPx` pixels; the art fits inside, keeps its aspect ratio and is centred; the rest is transparent. Area averaging when shrinking, bilinear when enlarging, alpha included.
  - Tests: a 200 × 100 image into 800 × 600 mm at 1 mm/px gives an 800 × 600 grid, art 800 × 400 centred, top and bottom 100 rows fully transparent.
  - Walkthrough: why mm, not pixels, is the unit from here on.
  - Commit: `feat(core): fit image to rug size`
- [X] **2.3 Edge-preserving denoise.**
  - Files: `src/core/image/denoise.ts`, `test/core/image/denoise.test.ts`.
  - Builds: `denoise(img: ImageGrid, opts: { radiusPx: number; rangeDeltaE: number }): ImageGrid`, a bilateral filter weighted by distance in OKLab; alpha untouched.
  - Tests: `withJpegNoise(triforce)` after denoise has at least 99% of pixels within deltaE 3 of the true colour; pixels 2 px from an edge stay on their own side.
  - Walkthrough: why a normal blur smears edges and a bilateral filter doesn't.
  - Commit: `feat(core): edge-preserving denoise`

## Phase 3: Colour reduction

**Done when:** the app finds the art's real colours, suggests a count, respects locks, and produces a fine colour map.

- [X] **3.1 Sample and find colour peaks.**
  - Files: `src/core/quantize/sample.ts`, `src/core/quantize/peaks.ts`, tests beside them in `test/core/quantize/`.
  - Builds: `samplePixels(img: ImageGrid, maxSamples: number, seed: number): OKLab[]` (skips alpha < 128); `findPeaks(samples: OKLab[], binSize = 0.02): { lab: OKLab; share: number; distinct: boolean }[]` from a 3D histogram, local maxima sorted by share. `distinct` (added in 3.2, revised after 6.6): peaks joined without a valley in the histogram form a group (saddle ≥ 30% of the lower peak, found like a mountain's prominence); the largest peak of each group that is deltaE ≥ 10 from every larger peak is distinct. A gradient counts once; two tones with a soft transition (cel shading, e.g. Rayquaza's mint and green) count twice; noise specks not at all. `samplePixels` also skips edge blends (added in 3.2): pixels whose colour is a mix of two clearly different opposite neighbours, as along anti-aliased or resized edges; mix maths in `src/core/color/mix.ts`. `seededRandom` moved to `src/core/random.ts`.
  - Tests: `triforce` gives 2 peaks; shares sum to 1 (±1e-9); a `withSoftAlpha` image adds no halo peak.
  - Commit: `feat(core): colour peaks`
- [X] **3.2 Find the palette.**
  - Files: `src/core/quantize/palette.ts`, `test/core/quantize/palette.test.ts`.
  - Builds: `findPalette(samples: OKLab[], opts: { count: number; locked: OKLab[]; seed: number }): OKLab[]`, lightest first. Locked colours first; then every `distinct` peak with share ≥ 0.2% and deltaE ≥ 10 from all chosen colours, before large areas are split (k-means++ style, stopping when nothing is ≥ deltaE 5 away); refine with k-means; locked colours never move.
  - Tests: `triforce` with count 7 returns exactly 2 colours, also with blended edges (shrunk or enlarged); a smooth thin outline gives its 3 colours, not its grey rims; `smallEye` with 0.5% eye and count 3 keeps the eye, also next to a gradient; a locked colour comes back identical; `gradientCircle` with count 4 gives 4 colours ordered by lightness; same seed, same result.
  - Walkthrough: k-means step by step, and why plain k-means swallows small details.
  - Commit: `feat(core): palette with locks and small-colour protection`
- [X] **3.3 Suggest a colour count. (you write)**
  - Files: `src/core/quantize/suggest.ts`, `test/core/quantize/suggest.test.ts`.
  - Builds: `suggestCount(peaks: Peak[]): number`: the `distinct` peaks (see 3.1) with share ≥ 0.2%, clamped to 2..16. Same colours `findPalette` picks first, so the suggested count returns exactly the art's colours; a gradient counts once.
  - Tests: `triforce` gives 2; `sixColours` gives 6.
  - Commit: `feat(core): suggested colour count`
- [X] **3.4 Assign the fine colour map.**
  - Files: `src/core/quantize/assign.ts`, `test/core/quantize/assign.test.ts`.
  - Builds: `assignLabels(img: ImageGrid, palette: OKLab[], mmPerPx: number): LabelMap`: nearest palette colour per pixel; alpha < 128 becomes `NO_LABEL`. Two resolutions: colours are found on a random sample of 20,000 pixels (`samplePixels`, fast), assignment runs on every pixel of the fine grid (`FINE_MM_PER_PX = 1`). No coarse shrunken grid: shrinking would blend edges into extra colours (see 3.2).
  - Tests: `triforce` contains only labels 0, 1 and `NO_LABEL`; a `withSoftAlpha` edge pixel with alpha 100 is `NO_LABEL`, alpha 200 gets a colour.
  - Commit: `feat(core): colour map assignment`

## Phase 4: Cleanup

**Done when:** specks are gone, nothing below the minimum detail size remains, and thin lines are flagged and can be thickened instead of vanishing.

- [X] **4.1 Find connected regions. (you write)**
  - Files: `src/core/cleanup/regions.ts`, `test/core/cleanup/regions.test.ts`.
  - Builds: `connectedRegions(map: LabelMap): { ids: Int32Array; regions: { id: number; label: number; areaPx: number; bbox: [number, number, number, number] }[] }`, 4-connected flood fill with an explicit stack (no recursion).
  - Tests: `triforce` gives 3 gold regions and 1 background region (the fixture has small gaps between the triangles, so the middle hole joins the outside; see 1.3); `NO_LABEL` pixels form no region.
  - Walkthrough: 4- vs 8-connectivity and why recursion overflows on big rugs.
  - Commit: `feat(core): connected regions`
- [X] **4.2 Merge small islands.**
  - Files: `src/core/cleanup/islands.ts`, `test/core/cleanup/islands.test.ts`.
  - Builds: `mergeSmallIslands(map: LabelMap, minAreaMm2: number): LabelMap`. Each island below the threshold takes the label of the larger neighbour it shares the longest border with (only larger, so it always ends); repeat until nothing changes. First `bridgeDiagonals(map)` (`src/core/cleanup/diagonals.ts`) closes corner-only contacts in favour of the smaller patch, so a thin diagonal or curved line is one patch, not many specks; `connectedRegions` gained an optional `connectivity: 4 | 8` for it. Also (added after 7.1): tiny see-through holes enclosed by the art (transparent specks in a PNG) smaller than the threshold are filled with the colour around them; bigger holes and transparency touching the edge stay outside.
  - Tests: 1 px noise dots disappear; a region exactly at the threshold stays; on `withJpegNoise(sixColours)` no region below the threshold survives; a long thin line in `thinOutline` is kept (large area).
  - Commit: `feat(core): merge small islands`
- [X] **4.3 Flag and thicken thin lines.**
  - Files: `src/core/cleanup/distance.ts`, `src/core/cleanup/thin.ts`, tests in `test/core/cleanup/`.
  - Builds: `distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array` (exact Euclidean, two-pass); `findThinParts(map: LabelMap, minWidthMm: number): { label: number; at: Pt; widthMm: number }[]`; `thickenLabel(map: LabelMap, label: number, minWidthMm: number): LabelMap`.
  - Tests: `thinOutline` with 1 mm lines and 3 mm minimum gives a warning for the line's label; after `thickenLabel` the line is at least 3 mm wide everywhere; areas away from the line keep their labels.
  - Walkthrough: what a distance transform is and why it answers "how wide is this part?".
  - Commit: `feat(core): thin line detection and thickening`
- [X] **4.4 Optional separation outlines.**
  - Files: `src/core/cleanup/outlines.ts`, `test/core/cleanup/outlines.test.ts`.
  - Builds: `addOutlines(map: LabelMap, opts: { widthMm: number; label: number; where: 'all' | 'outer' | { pairs: [number, number][] } }): LabelMap`: every pixel within `widthMm / 2` of a chosen border gets `label` (the outline yarn; a new palette entry if it isn't in the palette yet), using `distanceTransform` from 4.3. `suggestOutlines(map: LabelMap, palette: OKLab[]): number | null`: the label of a dark colour that mostly forms thin lines (existing outlines), or null. Off by default: the pipeline only calls `addOutlines` when the user turns it on. Lines between colours are centred on the border; along the outer edge (next to `NO_LABEL` or the map edge, i.e. a rectangular rug's edge) they lie fully inside, so the rug's shape never changes; `'all'` = every colour border plus the outer edge. `suggestOutlines`: dark (L ≤ 0.35), ≥ 1% of the rug, mean line width (2 × area / border length) ≤ 15 mm.
  - Tests: with outlines off the map is unchanged; `sixColours` with 10 mm outlines on `'all'` has outline pixels on every border, at least 10 mm wide everywhere, and none further than 5 mm from a border; `'outer'` touches only borders next to `NO_LABEL`; a chosen pair outlines only that border; `thinOutline` suggests its black label, `triforce` suggests none; the input map is unchanged.
  - Walkthrough: why outlines run before island cleanup (they can squeeze small areas).
  - Commit: `feat(core): optional separation outlines`

## Phase 5: Smooth tracing and the full pipeline

**Done when:** the colour map becomes a vector pattern with smooth lines, sharp real corners, shared borders and no gaps, and one function runs the whole pipeline.

Approach: borders are first traced along the cracks between pixels (a staircase), then fitted with straight lines and Bézier curves at a tolerance larger than one pixel. The fitting removes the staircase while corner detection keeps real corners, the same idea Potrace uses.

- [X] **5.1 Trace shared borders.**
  - Files: `src/core/trace/borders.ts`, `test/core/trace/borders.test.ts`.
  - Builds: `traceBorders(map: LabelMap): { nodes: Pt[]; edges: { left: number; right: number; points: Pt[] }[] }`. Walks pixel cracks between different labels; a node is any corner where 3 or more labels meet; each border between two labels is one edge, stored once; points in mm.
  - Tests: a map split in half gives one straight edge; `triforce` edges close into rings around every region; no two edges share the same left/right pair and points.
  - Commit: `feat(core): trace shared borders`
- [X] **5.2 Fit curves with corner detection.**
  - Files: `src/core/trace/corners.ts`, `src/core/trace/fit.ts`, tests in `test/core/trace/`.
  - Builds: `findCorners(points: Pt[], opts: { cornerAngleDeg: number }): number[]`; `fitEdge(points: Pt[], opts: { toleranceMm: number; cornerAngleDeg: number }): { start: Pt; segs: PathSeg[] }` (returns `start` because a closed loop is restarted at its first corner, so no side is cut where the loop happened to begin): split at corners and ends, fit each piece through the midpoints of its pixel sides (pixel corners stick out up to ~1.1 px; midpoints lie within ~0.5 px of the true line), keeping edge ends exact; a piece within tolerance of its least-squares line is a line, and a corner between two lines moves to where they cross (as Potrace does, at most 2 × tolerance), so tips are sharp; other pieces get cubic Béziers (Schneider's algorithm) until within tolerance, with a shared direction at every split so curves join without kinks. Defaults `toleranceMm = 1.0`, `cornerAngleDeg = 60`, corners measured over `windowPoints = 3` pixel steps. Direction windows never reach more than half way round a loop, so tiny loops (4 points round one pixel) can't read past their end (a crash found with a real PNG).
  - Tests: each Triforce side becomes one `line` segment and each tip stays a corner; a 45° pixel staircase becomes one straight line; `circle` with 100 mm radius stays within 1 mm of the true circle and the turn between neighbouring segments at non-corners is under 15° (no stair steps).
  - Walkthrough: least-squares fitting, Bézier control points, why tolerance and corner angle are the two knobs.
  - Commit: `feat(core): curve fitting with corners`
- [X] **5.3 Build the vector pattern.**
  - Files: `src/core/trace/pattern.ts`, `src/core/geometry.ts`, tests.
  - Builds: `buildPattern(map: LabelMap, rug: RugSize): VectorPattern` (trace, fit each edge once, assemble rings with the region always on the left, so outer rings and holes go round in opposite directions); `ringToPolygon(pattern, ring, stepsPerCurve): Pt[]`; `polygonArea(p: Pt[]): number` and `signedArea(p: Pt[]): number` (shoelace).
  - Tests: at rug scale (shapes several hundred pixels across) each region's vector area is within 1% of its pixel area; at any size no border moves by more than 0.5 mm on average (area difference ÷ border length); every edge is used by exactly two regions, or one region and the outside; every ring closes.
  - Commit: `feat(core): vector pattern`
- [X] **5.4 Run the whole pipeline.**
  - Files: `src/core/pipeline.ts`, `test/core/pipeline.test.ts`.
  - Builds: `runPipeline(input: { image: ImageGrid; rug: RugSize; count: number; locked: OKLab[]; minDetailMm: number; outlines: { widthMm: number; colour: OKLab; where: 'all' | 'outer' | { pairs: [number, number][] } } | null; seed: number }): { palette: OKLab[]; suggestedCount: number; map: LabelMap; pattern: VectorPattern; thin: ReturnType<typeof findThinParts> }`, chaining fit, denoise, sample, palette, fine assignment, outlines (only if not null), cleanup and tracing. Output also gains `outlineSuggestion: number | null` from `suggestOutlines`.
  - Also: `buildPattern(map, rug, { sourcePxMm })`: for an image enlarged onto the rug, the corner window (3 source pixels) and the tolerance (one source pixel) scale with the size of one source pixel on the rug, so enlarged pixel steps don't read as corners. Minimum detail: areas under `minDetailMm²` merge, lines thinner than `minDetailMm` are flagged. An outline colour within deltaE 3 of a palette colour reuses it, otherwise it is appended.
  - Tests: `triforce` on an 800 × 800 mm rug returns 2 colours, 3 gold regions, straight sides; best of three runs (after a warm-up) under 1 second in Node; noisy JPEG, soft-edged PNG, small eye, locks, outlines on/off, outline suggestion, thin-line warnings, determinism.
  - Commit: `feat(core): end-to-end pipeline`

## Phase 6: First app slice (Milestone A)

**Done when:** you upload your Triforce image in the browser and see a clean, numbered pattern next to the original.

- [X] **6.1 Pipeline worker.**
  - Files: `src/worker/pipeline.worker.ts`, `src/ui/pipelineRunner.ts`, `src/ui/hooks/usePipeline.ts`, `test/ui/pipelineRunner.test.ts`.
  - Builds: the worker exposes `runPipeline` through Comlink, passing image buffers as transferables (the UI transfers a copy and keeps its original). `createPipelineRunner(api)` holds the logic in plain TypeScript (testable in Node): a failed run keeps the last good `result` and sets `error`; only the newest run counts. `usePipeline()` is a thin `useSyncExternalStore` wrapper returning `{ result, running, error, run(input) }`, one shared worker for the app; a crashed worker fails the pending run and is restarted. Added after 6.6: `runPipeline` is split into `prepareImage` (fit, denoise, sample, suggestion) and `finishPipeline`; the worker keeps the prepared image (`createCachedPipeline`, keyed by upload and rug size), so merges, locks and colour changes skip the image work; `usePipelineSync` waits 300 ms only after typing or dragging, clicks run at once (merge/lock: about 1.1 s → 0.37 s on a real 1 m rug).
  - Tests: with a fake worker that throws, `result` is unchanged and `error` is set; a slower older run never overwrites a newer one; the next good run clears the error.
  - Walkthrough: what a Web Worker is, why transferables avoid copying, how Comlink hides `postMessage`.
  - Commit: `feat: pipeline in a web worker`
- [X] **6.2 App shell and state.**
  - Files: `src/ui/store/projectStore.ts`, `src/ui/store/useProject.ts`, `src/ui/App.tsx`, `src/ui/Stepper.tsx`, `src/ui/stepLabels.ts`, `src/ui/app.css`, `test/ui/projectStore.test.ts`, `test/ui/Stepper.test.tsx`.
  - Builds: Zustand store (vanilla, testable in Node) `{ source, rug, shape: 'shaped' | 'rectangle', count (null = suggested), minDetailMm (default 10), palette: PaletteEntry[], result, step }` with actions `setSource`, `setRug`, `setShape`, `setCount` (1–16), `setMinDetail`, `setResult` (numbered palette "Colour n"; names and locks carry over to colours within deltaE 3), `setStep`, `toggleLock`, `renameColour`; `availableSteps` (Colours needs an image, the rest a result, Outline only for shaped rugs; an unavailable current step falls back to the nearest earlier one). Six steps in the stepper, later steps disabled until data exists. Template demo files removed.
  - Tests: `setCount` stores the value; changing the source resets the palette; names and locks survive a new result; step availability; the stepper rendered to HTML (React's server renderer, no browser) shows six numbered steps with the right ones disabled.
  - Commit: `feat(ui): app shell and project store`
- [ ] **6.3 Setup step.**
  - Files: `src/ui/steps/SetupStep.tsx`, `src/ui/ImageCanvas.tsx`, `src/ui/validation.ts`, `src/ui/pipelineInput.ts`, `src/ui/hooks/usePipelineSync.ts`, tests `test/ui/validation.test.ts`, `test/ui/pipelineInput.test.ts`.
  - Builds: drag-and-drop or file picker, rug width and height in cm (decimal comma accepted, "match image proportions"), shaped or rectangle, colour count (empty = the suggested count: `runPipeline` takes `count: null`); downscale notice from 2.1. `usePipelineSync` re-runs the pipeline in the worker 300 ms after the image or a setting changes and stores the result; the header shows "Working…" and errors (the last good result is kept).
  - Check: invalid sizes (0, negative, over 500 cm) show an inline message.
  - Commit: `feat(ui): setup step`
- [X] **6.4 Colours step and pattern canvas.**
  - Files: `src/ui/steps/ColoursStep.tsx`, `src/render/patternCanvas.ts`, `src/core/labelPoint.ts`, `src/core/labelMap.ts`, `test/core/labelPoint.test.ts`; store and pipeline input extended.
  - Builds: `poleOfInaccessibility(rings: Pt[][], precisionMm: number): Pt` (outer ring plus holes; the point deepest inside a shape, for numbers; polylabel); `labelAt(map, pt)` in `src/core/labelMap.ts`; `runPipeline` input gains `thicken: OKLab[]` (colours to thicken, by colour since labels change between runs); the store gains `outlines` (off, and back to off for every new image; colour null = the darkest palette colour) and `thicken`; `drawPattern(ctx, pattern, palette, opts: { numbers: boolean; outlines: boolean })`; side-by-side original and pattern; palette list showing number, name (default "Colour 1"), hex code and swatch, plus a lock toggle; count slider with the suggested count marked; minimum detail input; thin-line warnings with a Thicken button; hovering a palette colour highlights its areas in the original and the pattern, hovering the image or pattern highlights that spot's colour in the palette; an "Outlines" section, off by default, with width in cm, yarn colour and where, and a hint when `outlineSuggestion` finds existing outlines.
  - Tests: a square's label point is its centre; an L-shape's label point lies inside it; `labelAt(map, pt)` gives the colour under a point (for hovering).
  - Check (Milestone A): the Triforce shows 3 regions numbered 1 and the background numbered 2, with straight sides.
  - Commit: `feat(ui): colours step`
- [X] **6.5 Merge two colours.**
  - Files: `src/core/quantize/merge.ts`, `test/core/quantize/merge.test.ts`, pipeline, store, pipeline input and `src/ui/steps/ColoursStep.tsx` (extend).
  - Builds: `applyMerges(map: LabelMap, palette: OKLab[], merges: { from: OKLab; into: OKLab }[]): { map; palette }`: each merge finds its two palette colours (nearest within deltaE 10, by colour since labels change between runs), relabels every `from` pixel to `into` and drops `from` from the palette; chains resolve, a merge that would form a loop is skipped. The pipeline applies merges right after assigning the colour map (before outlines and cleanup) and reports `mergedAway`. The count stays "colours found", so merging means one colour fewer and nothing else reshuffles. UI: "Merge into…" per palette row, a list of merges with undo; merges reset for every new image. Also: "No lines thinner than N cm" when there is nothing to flag.
  - Tests: merging one of three colours leaves two, with every pixel of the merged colour now the other; a slightly shifted colour still finds its match; an unknown colour changes nothing; A into B into C ends as C; a loop is skipped; the pipeline drops the merged colour from line art and keeps every other colour unchanged.
  - Commit: `feat: merge two colours`
- [X] **6.6 Add the next best colour, or pick one from the image.**
  - Files: `src/core/quantize/palette.ts` (change), `src/core/color/sample.ts` (moved forward from 9.2), tests in `test/core/quantize/` and `test/core/color/sample.test.ts`, `src/ui/steps/ColoursStep.tsx` (extend).
  - Builds: the splitting stage of `findPalette` stops picking at random: `bestNextColour(samples, palette)` adds the candidate that reduces the total squared deltaE between samples and their nearest palette colour the most; candidates are the average colours of well-filled histogram cubes (`cubeMeans` in peaks.ts), at least deltaE 5 from the palette. k-means refinement is dropped, so `count + 1` returns exactly the `count` palette plus one colour and nothing moves (the spec: never reshuffle); no randomness is left. UI: "Add a colour", "Remove a colour" and "Pick a colour from the image" beside the palette; the added colour is briefly highlighted with a note (`describeAddedColour`: "a darker shade of Colour 2 (Yellow)", "a variation of …", "a new colour"); if nothing is worth adding, the note says so and the count goes back. Eyedropper: `sampleColour(img, at, radiusPx)` (per-channel median in OKLab, skipping transparent pixels); a click on the original undoes the fit-and-centre of `fitToRug`, and the colour is stored in `picked` (locked until unlocked, passed to the pipeline as locked, raises the count by one); a colour already in the palette is just locked.
  - Tests: a gradient asked for n + 1 colours contains the n colours within deltaE 2; the added colour is the one with the biggest error reduction (checked against brute force on a small set); a 2-colour Triforce asked for one more adds nothing; same input, same result (no randomness left); `sampleColour` on a noisy patch with 10% white highlights returns within deltaE 2 of the true colour; a picked colour comes back exactly in the palette.
  - Commit: `feat: add the next best colour`

- [ ] **6.7 Rework "Pick a colour from the image".** (to be defined)
  - Noted by Tobias after trying 6.6: the eyedropper works, but how it behaves doesn't make sense yet. Before building: go through it together (what should a click do, what should the palette show, what about colours already in the palette), then write the Builds and Tests lines here.

## Phase 7: Outline and rug shape

**Done when:** shaped rugs get a smooth cut line with an adjustable border, and rectangular rugs get a background yarn area.

- [X] **7.1 Detect the background.**
  - Files: `src/core/outline/background.ts`, `test/core/outline/background.test.ts`.
  - Builds: `detectBackground(img: ImageGrid): { mask: Uint8Array; method: 'alpha' | 'edge-colour' | 'none' }`, run on the original image before fitting (fitting adds transparent padding that would look like transparency). Alpha < 128 is background if the image has transparency; otherwise flood fill from the border through colours within deltaE 6 of the dominant border colour, used only if that colour covers at least 60% of the border pixels; a "background" covering over 95% of the image counts as none. Decisions are remembered per RGB colour (about 0.4 s for a 4096 px image).
  - Tests: `withSoftAlpha(triforce)` mask matches the shape within 2 px (soft edges round sharp tips by a pixel or two); `thinOutline` on a white background keeps white art enclosed by the outline; a busy image with no dominant border colour gives `'none'`.
  - Commit: `feat(core): background detection`
- [ ] **7.2 Cut line with offset and smoothing.**
  - Files: `src/core/outline/cutLine.ts`, `test/core/outline/cutLine.test.ts`; `ringToPath` in `src/core/trace/pattern.ts`.
  - Builds: `cutLine(art: Uint8Array, w: number, h: number, mmPerPx: number, opts: { offsetMm: number; smoothMm: number }): CutLoop[]` (`CutLoop = { start: Pt; segs: PathSeg[] }`; several loops, since a rug can have separate pieces and holes; the rug is on the left, so outer loops and holes go opposite ways): grow by `offsetMm` (distance transform from 4.3), close notches narrower than `2 × smoothMm` and round inner corners (grow by `smoothMm`, shrink back by the same), then trace and fit with 5.1–5.3. The grid is padded internally, so growth past its edge is never cut off. `ringToPath(pattern, ring)` turns a ring into one continuous path (reversed edges swap their control points).
  - Tests: a 200 mm square with 20 mm offset gives an area within 2% of the expected rounded square; a 10 mm notch disappears at 8 mm smoothing but not at 4 mm; smoothing alone doesn't make a square bigger; growth reaches beyond the grid; one loop per separate piece, pieces closer than twice the offset merge; a ring-shaped piece of art keeps its hole as a loop going the other way; about 0.5 s for a 2 × 1.5 m rug.
  - Commit: `feat(core): cut line`
- [X] **7.3 Shape modes in the pipeline.**
  - Files: `src/core/pipeline.ts` (extend), `src/core/outline/backgroundEdits.ts`, `cutRug` in `cutLine.ts`, tests extended; store, pipeline input, image key and the Colours views extended.
  - Builds: `runPipeline` input gains `shape`, `offsetMm`, `smoothMm`, `backgroundEdits` (`{ at, background }` clicks: a magic-wand area becomes background, or a background patch becomes art), `borderColour` and `backgroundColour` (null = automatic). The entered rug size is the artwork's size; a shaped rug's border grows beyond it. Shaped: background detected on the original image (7.1) and made transparent (part of the cached image stage, so shape and background clicks are in the image key); after cleanup the map is padded by the border, the cut line built with `cutRug` (loops plus a mask), and the band between art and cut line filled with the border yarn (default: the colour the art's outer edge mostly has, reused if it is an art colour). Rectangle: no detection; only empty space (transparency, padding) becomes the background yarn (default white). Output gains `cut: CutLoop[] | null`, `roles` and `rolesAdded` (border, background; only colours added for a role are named "Border"/"Background"), `background` (detection method) and `artOriginMm` (where the art area sits in the padded map).
  - Tests: shaped: the map grows by the border, the band is the border colour and beyond the cut is outside, the border reuses the edge colour, a chosen border yarn gets its own entry, a plain backdrop is removed, background clicks work both ways (a big background hole is cut out until clicked back); rectangle: empty space becomes white background with nothing outside, a JPEG's white backdrop stays an art colour.
  - Commit: `feat(core): shaped and rectangular rugs`
- [X] **7.4 Outline step.**
  - Files: `src/ui/steps/OutlineStep.tsx`, `src/ui/YarnColourField.tsx`, `src/ui/views.tsx` and `src/ui/viewGeometry.ts` (the pattern view and its helpers, shared with the Colours step), `drawCut` in `src/render/patternCanvas.ts`, `cutSize` in `cutLine.ts` (tested); Setup gains the background yarn for rectangles.
  - Builds: the pattern with the cut line drawn dashed (white under dark, visible on any yarn); border slider (0–10 cm) and corner-rounding slider (0–5 cm); border yarn: automatic (the art's edge colour), any palette colour, or any other colour; finished size (`cutSize`: bounding box of the cut loops); click an area to remove it as background, click a cut-out area to bring it back, edits listed with undo; detection method in words ("Used the transparency of the image", "Used the colour along the edges", "No background found").
  - Check: the Triforce gets a cut line 2 cm outside its edge, with rounded inner corners; on a real character PNG the border and yarn update live and the finished size follows.
  - Commit: `feat(ui): outline step`

## Phase 8: Projector view (Milestone B)

**Done when:** you calibrate the projector with a ruler, project the mirrored Triforce outline onto the cloth and step through it yarn by yarn. Then you can tuft your first rug with the app.

- [X] **8.1 Projector maths.**
  - Files: `src/render/projector/transform.ts`, `test/render/transform.test.ts`.
  - Builds: `projectorTransform(opts: { rug: RugSize; viewport: { w: number; h: number }; pxPerMm: number; calibrationFactor: number; offsetPx: Pt; mirror: boolean }): { toScreen(p: Pt): Pt }` (pure); `calibrationFactor(expectedMm: number, measuredMm: number): number` **(you write)**.
  - Tests: measured 96 mm for an expected 100 mm gives a factor of 100/96; mirror maps the rug's left edge to the right edge; offset moves every point by exactly the offset.
  - Commit: `feat(render): projector transform`
- [X] **8.2 Calibration screen.**
  - Files: `src/render/projector/calibration.ts` (`calibrationLayout`, tested; `drawCalibration`), `src/ui/projector/CalibrationView.tsx`, `test/render/calibration.test.ts`; the store gains `projector: { pxPerMm, factor, offsetPx, mirror }`.
  - Builds: rug bounding frame with corner crosshairs, a 10 cm bar and a 10 × 10 cm square outside the rug area (below it if there is room, else above, right or left, else in a corner); input "I measured __ cm" (each measurement corrects on top of the last: factor × 100 / measured); Reset; arrow keys nudge 1 px, Shift + arrow 10 px; mirror on by default (tufting from the back); the starting scale is set once, to fit the whole rug, so a calibration stays valid; a Fullscreen button for the projector; in fullscreen a faint "Adjust" button in the corner opens the same controls (Hide folds them away). After applying a measurement the field lets go of the keyboard, so the arrow keys work at once.
  - Check: on your monitor, set the measured value from a ruler; the bar then measures 10.0 cm.
  - Commit: `feat: projector calibration`
- [ ] **8.3 Pattern layers.**
  - Files: `src/render/projector/layers.ts`, `src/render/projector/labels.ts`, `test/render/labels.test.ts`.
  - Builds: white lines on black with adjustable thickness; numbers at each region's label point; regions too small for the number at the current font size get the number outside with a short pointer line; dashed cut line; cm grid; mirror. Each layer can be switched on and off.
  - Tests: `placeLabels(regions, fontMm)` puts no two labels on top of each other; a 5 mm region gets an outside label with a pointer.
  - Commit: `feat(render): projector layers`
- [ ] **8.4 One colour at a time.**
  - Files: `src/render/projector/focus.ts`, `src/ui/projector/ControlPanel.tsx`.
  - Builds: the current label's regions drawn bright, everything else faint outlines; Left and Right arrows step through labels; the panel shows the yarn's number and name in large text.
  - Check: stepping through the Triforce lights up exactly the regions with number 1, then number 2.
  - Commit: `feat: one-colour-at-a-time mode`
- [ ] **8.5 Two windows and wake lock.**
  - Files: `src/ui/projector/sync.ts`, `src/ui/projector/ProjectorWindow.tsx`, `test/ui/sync.test.ts`.
  - Builds: `window.open` for the projector window; `BroadcastChannel('color-tuft-projector')` carrying `{ type: 'state', state: ProjectorState }`; a pure reducer `applyMessage(state, msg)`; single-window fullscreen fallback with keyboard shortcuts; Screen Wake Lock, re-acquired when the tab becomes visible again.
  - Tests: `applyMessage` ignores unknown message types and applies state updates.
  - Check (Milestone B): two windows stay in sync; the screen doesn't sleep during a 15-minute session.
  - Commit: `feat: projector window with live sync`

## Phase 9: Yarn stock, matching and amounts

**Done when:** you can enter your yarns, run a pattern on owned yarns only, and get grams per colour, a shopping list and a waste value that learns from finished rugs. Yarns stay in memory until Phase 11 adds saving.

- [ ] **9.1 Yarn lists.**
  - Files: `src/ui/store/yarnStore.ts`, `src/ui/yarn/YarnList.tsx`, `src/ui/yarn/YarnForm.tsx`, `test/ui/yarnStore.test.ts`.
  - Builds: store with `addYarn`, `updateYarn`, `removeYarn`, `moveToStock(id)`; form with colour picker, name, number, hex code, grams on hand, cone weight, shop; tabs Stock and Catalogue.
  - Tests: adding then removing leaves the list unchanged; `moveToStock` changes only `list`.
  - Commit: `feat(ui): yarn stock and catalogue`
- [ ] **9.2 Sample colour from a photo.**
  - Files: `src/ui/yarn/PhotoSampler.tsx` (`sampleColour` and its test already exist from 6.6).
  - Builds: `sampleColour(img: ImageGrid, at: { x: number; y: number }, radiusPx: number): OKLab`, the per-channel median in OKLab, so highlights and shadows on the cone don't skew it. UI: upload a photo, click the cone, name the yarn.
  - Tests: a noisy patch with 10% white highlight pixels returns within deltaE 2 of the true colour.
  - Commit: `feat: yarn colour from photo`
- [ ] **9.3 Swatch screenshot import.**
  - Files: `src/ui/yarn/SwatchImport.tsx`.
  - Builds: upload a shop's colour chart, click swatches one after another (each uses `sampleColour`), type a name and number for each, save all to Catalogue with the shop name.
  - Check: importing 5 swatches creates 5 catalogue yarns with distinct numbers.
  - Commit: `feat: import catalogue from swatch screenshot`
- [ ] **9.4 Match art colours to yarns.**
  - Files: `src/core/yarn/match.ts`, `test/core/yarn/match.test.ts`.
  - Builds: `findMatches(lab: OKLab, yarns: Yarn[], n = 5): { yarn: Yarn; deltaE: number; rating: 'very-close' | 'close' | 'noticeable' }[]` sorted by distance; `suggestYarns(palette: OKLab[], stock: Yarn[]): { yarnId: string | null; deltaE: number; collision: boolean }[]`, where `null` means no close match and `collision` marks two palette colours more than deltaE 10 apart landing on the same yarn. "My yarns only" passes the chosen yarns' colours as locked palette entries to `runPipeline`.
  - Tests: an exact stock colour matches with deltaE 0; a palette colour with no yarn under deltaE 8 gets `null`; two very different colours mapped to one yarn set `collision`.
  - Commit: `feat(core): yarn matching`
- [ ] **9.5 Yarn amounts and waste learning. (you write: `gramsNeeded`, `shoppingList`)**
  - Files: `src/core/yarn/amounts.ts`, `test/core/yarn/amounts.test.ts`.
  - Builds: `areasMm2(map: LabelMap): Map<number, number>`; `gramsNeeded(areaMm2: number, gramsPerM2: number, waste: number): number`; `shoppingList(needs: { label: number; yarn: Yarn; grams: number }[]): { yarn: Yarn; missingG: number; cones: number }[]`; `learnWaste(cal: Calibration, estimatedNetG: number, actualUsedG: number): Calibration` (new value is the average of the last three rugs, clamped to 0..1). `DEFAULT_WASTE = 0.25`.
  - Tests: 500,000 mm² at 2,000 g/m² with 25% waste gives 1,250 g; needing 180 g with 100 g on hand and 400 g cones gives 80 g missing and 1 cone; estimate 1,000 g net and 1,300 g actually used gives waste 0.30.
  - Commit: `feat(core): yarn amounts and waste learning`
- [ ] **9.6 Yarn step.**
  - Files: `src/ui/steps/YarnStep.tsx`, `src/ui/yarn/CalibrationDialog.tsx`, `src/ui/yarn/FinishedRugDialog.tsx`.
  - Builds: calibration list (name, square size, grams before and after, giving g/m²); per-colour table (number, name, area in cm², grams, on hand, to buy); Find matching colours dialog with ratings in words; Finished rug dialog for leftover weights, which updates the waste.
  - Check: the Triforce shows two rows with grams and a shopping list.
  - Commit: `feat(ui): yarn step`

## Phase 10: Touch-ups

**Done when:** you can fix spots the algorithm got wrong with the brush, recolour single shapes, thicken single lines and simplify busy areas, the edits survive every re-run, and you can undo any of it.

- [ ] **10.1 Edit operations as replayable steps.**
  - Files: `src/core/edit/ops.ts`, `src/core/edit/replay.ts`, tests in `test/core/edit/`.
  - Builds: `paintBrush(map, stroke: Pt[], radiusMm, label)`; `recolourShape(map, at: Pt, label)` (the one connected shape under `at` takes `label`). Edits are data: `{ kind: 'brush'; stroke; radiusMm; colour }` and `{ kind: 'recolour'; at; from: OKLab; colour: OKLab }`. `replayEdits(map, palette, edits)` applies them in order, finding labels by colour (nearest palette colour within deltaE 10, as merges do) and a recoloured shape by its point and old colour (the nearest pixel of that colour within 3 mm); an edit whose colour or shape is gone is skipped. All return new maps; inputs never change.
  - Tests: the brush changes only pixels within the radius of the stroke; recolouring changes exactly one connected shape and no other area of the same colour; a recolour still finds its shape after a re-run with a slightly different palette, and is skipped if the shape's colour is gone; edits replay in order; inputs are unchanged.
  - Commit: `feat(core): edit operations`
- [ ] **10.2 Edits in the pipeline.**
  - Files: `src/core/pipeline.ts` (extend), store and pipeline input (extend), `test/core/pipeline.test.ts`.
  - Builds: `PipelineInput` gains `edits`; `finishPipeline` replays them after cleanup, before thin-line warnings and tracing, so they survive any re-run (the worker cache keeps it quick). Measure on a 2 × 1.5 m rug with 50 edits; only if replaying takes more than 200 ms do we optimise.
  - Tests: an edit survives a change of the colour count; recolouring one of the three Triforce triangles leaves the other two gold.
  - Walkthrough: measure before optimising.
  - Commit: `feat(core): edits in the pipeline`
- [ ] **10.3 Undo and redo.**
  - Files: `src/ui/store/history.ts`, `test/ui/history.test.ts`.
  - Builds: `createHistory<T>(limit = 50)` with `push`, `undo`, `redo`, `canUndo`, `canRedo`; it keeps the list of edits (and merges, locks, thickened lines), not colour-map snapshots, so it stays small.
  - Tests: push 3, undo 2, redo 1 gives state 2; pushing after an undo clears the redo stack; the 51st push drops the oldest.
  - Commit: `feat(ui): undo and redo`
- [ ] **10.4 Touch-up tools.**
  - Files: `src/ui/steps/ColoursStep.tsx` (extend), `src/ui/tools/Toolbar.tsx`.
  - Builds: a brush with size in cm; "Recolour a shape": click a shape (it is highlighted), pick its new colour from the numbered palette; swap two colours; Ctrl+Z and Ctrl+Shift+Z; a list of edits with undo.
  - Check: painting a missing eye back in and undoing it both work; recolouring one triangle of the Triforce leaves the others gold, also after changing the colour count.
  - Commit: `feat(ui): touch-up tools`
- [ ] **10.5 Thicken one line.**
  - Files: `src/core/edit/thickenLine.ts`, `test/core/edit/thickenLine.test.ts`, `src/ui/tools/Toolbar.tsx` (extend), store and pipeline input (extend).
  - Builds: `selectLine(map: LabelMap, at: Pt): Uint8Array | null`: the connected patch (corner contact counts, as lines are staircases) of the colour under or nearest to `at` (within 3 mm); `thickenLine(map: LabelMap, line: Uint8Array, widthMm: number): LabelMap`: pixels within `widthMm / 2` of the selected line's thin parts take its colour, nothing else changes, never `NO_LABEL`. With a brushed mask instead of a click, only the line's pixels inside the mask count as selected. Stored as edits `{ at, colour, widthMm }` or `{ mask, colour, widthMm }`, applied in the pipeline after cleanup, so they survive re-runs. UI: a "Line" tool: click to select (highlighted), or brush a section; "Thicken this line to [width] cm"; edits listed with undo.
  - Tests: in `thinOutline` with two separate black rings, thickening one leaves the other unchanged pixel for pixel; a brushed section of a joined line network thickens only inside the mask (plus the growth); the selected line is at least the chosen width afterwards; a click a few mm off the line still finds it; after a re-run with a slightly different palette the edit still finds its line by colour.
  - Commit: `feat: thicken one line`
- [ ] **10.6 Simplify an area.**
  - Files: `src/core/edit/simplify.ts`, `test/core/edit/simplify.test.ts`, `src/ui/tools/Toolbar.tsx` (extend), store and pipeline input (extend).
  - Builds: `simplifyArea(map: LabelMap, mask: Uint8Array, detailMm: number): LabelMap`: inside the painted mask only, islands smaller than `detailMm²` merge (as in 4.2) and borders are smoothed with a majority filter of radius `detailMm / 2` (each pixel takes the most common label around it), repeated until stable; pixels outside the mask never change. Simplified areas are stored as `{ mask, detailMm }` edits and applied in the pipeline after cleanup, so they survive re-runs. UI: a "Simplify" brush with a detail size in cm.
  - Tests: a speckled background painted over loses every patch below the detail size while the art outside the mask is unchanged pixel for pixel; a jagged border inside the mask becomes smoother (shorter traced border); an empty mask changes nothing.
  - Commit: `feat: simplify an area`
- [ ] **10.7 Show what cleanup removed.**
  - Files: `src/core/cleanup/lostDetails.ts`, `test/core/cleanup/lostDetails.test.ts`, pipeline, store and `src/ui/steps/ColoursStep.tsx` (extend).
  - Builds: `lostDetails(before: LabelMap, after: LabelMap, palette: OKLab[]): { at: Pt; label: number; areaMm2: number }[]`: patches of the colour map before cleanup that are gone after it and stand out from what replaced them (deltaE ≥ 20, e.g. a yellow ring in black), largest first. The pipeline reports them; the Colours step lists "N small details were merged away", highlights them on both pictures, explains why (rug size, minimum detail) and offers "keep this detail": an edit `{ kind: 'keep'; at; colour }` replayed before cleanup that exempts that patch from merging.
  - Tests: a 2 mm ring of yellow in black at 10 mm minimum detail is reported and a same-coloured speck of noise is not; after "keep this detail" the ring survives a re-run; nothing is reported when nothing was removed.
  - Commit: `feat: show what cleanup removed`

## Phase 11: Storage

**Done when:** projects and yarns survive a reload, can be saved and opened as `.tuft` files in any browser, and autosave into a linked folder in Chrome and Edge.

- [ ] **11.1 The `.tuft` file format.**
  - Files: `src/storage/tuftFile.ts`, `test/storage/tuftFile.test.ts`.
  - Builds: a zip (fflate) holding `project.json` (`formatVersion: 1`, settings, palette, edits), `source.png` and `labels.bin`. `serializeProject(p): Promise<Uint8Array>`, `deserializeProject(bytes): Promise<Project>`, `migrate(json)` for older versions.
  - Tests: a round trip gives an equal project; `formatVersion: 2` is rejected with `This file was made with a newer version of Color Tuft.`; random bytes are rejected with `This isn't a valid .tuft file.`; a hand-written version 0 file migrates.
  - Commit: `feat(storage): .tuft file format`
- [ ] **11.2 Browser storage and autosave.**
  - Files: `src/storage/db.ts`, `src/storage/autosave.ts`, `test/storage/autosave.test.ts`.
  - Builds: IndexedDB through `idb` with stores `projects`, `yarns`, `calibrations`; autosave debounced to 1 s after the last change; `navigator.storage.persist()` requested on the first save; `navigator.storage.estimate()` checked after each save, warning above 80% with a prompt to save a `.tuft` file.
  - Tests (with `fake-indexeddb`): 5 changes within 1 s cause one write; a saved project loads back equal.
  - Commit: `feat(storage): autosave in IndexedDB`
- [ ] **11.3 Save and open files; yarn import and export.**
  - Files: `src/ui/files/FileMenu.tsx`, `src/storage/yarnFile.ts`, `test/storage/yarnFile.test.ts`.
  - Builds: Save downloads `<project name>.tuft`; Open uses a file input; yarn lists export and import as JSON with `formatVersion`. Importing skips yarns with an id that already exists and reports how many were added.
  - Tests: export then import into an empty list gives the same yarns; importing twice adds nothing the second time.
  - Commit: `feat: save, open and yarn import/export`
- [ ] **11.4 Linked folder (Chrome and Edge).**
  - Files: `src/storage/folderLink.ts`.
  - Builds: `showDirectoryPicker`; the folder handle is stored in IndexedDB; autosave also writes `<name>.tuft` there; permission is asked again after a reload; the option is hidden where the API doesn't exist.
  - Check: in Chrome, a project edit shows up as an updated file in the folder within a few seconds; in Firefox the option isn't shown.
  - Commit: `feat(storage): linked folder autosave`

## Phase 12: Preview render

**Done when:** you can export a PNG mockup of the rug, with yarn texture, carving and a floor, to send to a commission client.

- [ ] **12.1 Carving height map.**
  - Files: `src/core/preview/heightMap.ts`, `test/core/preview/heightMap.test.ts`.
  - Builds: `heightMap(map: LabelMap, opts: { carve: 'none' | 'light' | 'deep' }): Float32Array`, with pile height 1 and carving near borders `h = 1 − depth · max(0, 1 − d / width)` from the distance transform. Presets: light = depth 0.25, width 3 mm; deep = depth 0.5, width 5 mm.
  - Tests: `none` gives all 1; with `deep`, a border pixel is 0.5 and a pixel 10 mm inside is 1.
  - Walkthrough: height maps and how lighting turns them into shading.
  - Commit: `feat(core): carving height map`
- [ ] **12.2 Yarn texture.**
  - Files: `src/core/preview/texture.ts`, `test/core/preview/texture.test.ts`.
  - Builds: `pileTexture(w: number, h: number, kind: 'cut' | 'loop', seed: number): Float32Array`, brightness multipliers from seeded value noise (cut pile: fine fuzz; loop pile: a small repeating loop pattern) within 0.94–1.06.
  - Tests: all values within 0.94–1.06; the same seed gives the same texture; cut and loop differ.
  - Commit: `feat(core): pile texture`
- [ ] **12.3 Lighting, edge, floor and export.**
  - Files: `src/render/preview/renderPreview.ts`, `src/ui/steps/PreviewStep.tsx`.
  - Builds: normals from the height map, one directional light (Lambert shading), a rounded bevel along the cut line, a soft drop shadow, a generated floor (wood, concrete or carpet), the label "Approximate preview" in a corner, mirror toggle, PNG export.
  - Check by eye: carved borders show a visible groove; the rug's edge looks rounded; the exported PNG opens on your phone.
  - Commit: `feat: preview render and export`

## Phase 13: Release v0.1 (Milestone C)

**Done when:** Color Tuft v0.1 is public on GitHub Pages, works offline, and the whole flow is covered by an automated test.

- [ ] **13.1 Offline app (PWA).**
  - Files: `vite.config.ts`, `public/icons/`.
  - Builds: vite-plugin-pwa with a manifest (name "Color Tuft", icons, standalone display) and precaching of the app files.
  - Check: in Chrome DevTools, switch to offline and reload; the app still opens and a saved project still loads.
  - Commit: `feat: installable offline app`
- [ ] **13.2 End-to-end test.**
  - Files: `e2e/flow.spec.ts`, `playwright.config.ts`, `.github/workflows/ci.yml` (add the job).
  - Builds: a test that uploads a generated Triforce PNG, gets 2 colours, sees a cut line in the outline step, sees two rows in the yarn table, and opens the projector window. Runs in CI before deploy.
  - Check: the CI run is green with the e2e job.
  - Commit: `test: end-to-end flow`
- [ ] **13.3 Error-handling pass.**
  - Files: whichever the checks touch.
  - Builds: go through the spec's error list: unsupported format message, large-image notice, worker crash keeps the last result, storage-full warning, `.tuft` version errors. Add any missing test.
  - Check: each case shows the right plain-language message in the browser.
  - Commit: `fix: error handling pass`
- [ ] **13.4 Design pass.**
  - Files: `src/ui/**` styles and layout.
  - Builds: one consistent look across all six steps: type scale, spacing, colours of the interface itself (never confused with yarn colours), focus and hover states, empty and loading states, layout on a laptop and on a phone (pattern and shopping list), keyboard use. Function stays unchanged; the e2e test still passes.
  - Check: every step looked at on a laptop and a phone; nothing overlaps, every control is reachable by keyboard.
  - Commit: `style: design pass`
- [ ] **13.5 Release.**
  - Files: `README.md`, `CHANGELOG.md`.
  - Builds: README with what it does, screenshots, how to use it with a projector, how to calibrate yarn, how to contribute; check that the name "Color Tuft" isn't taken; tag `v0.1.0` and publish a GitHub release.
  - Check: a friend opens the link, makes a pattern from their own image and projects it without help from you.
  - Commit: `docs: README and v0.1.0`
