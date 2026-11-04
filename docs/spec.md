# Color Tuft – Design Spec

Nov 4, 2026 · @Tobias

What Color Tuft does and why. Changes here are deliberate design decisions; progress is tracked in [`docs/plan.md`](plan.md).

## Overview

A free, open-source web app that turns flat artwork into a tuftable rug pattern: reduced to N yarn colours (or only the yarns you own), cleaned up for tufting, previewed in yarn, with yarn amounts, and projected at true size onto the tufting cloth.

- **Who it's for:** Tobias first (own rugs and commissions); later anyone who tufts, published free as open source.
- **Input:** mainly flat art (logos, game icons, character and cartoon art). Gradients inside the art are simplified into a few solid bands. Photos are not a v1 goal.
- **Rug shapes:** shaped rugs (cut along the artwork) are the default; rectangular rugs fill the remaining space with a background yarn of choice.
- **Transfer to cloth:** by projector, the method most tufters use.
- **Runs:** in the browser, as a website on GitHub Pages, installable as an offline app. No accounts, no server, images never leave the device.
- **Colour never stands alone:** every colour in the app carries a number and a name, so the pattern can be followed without telling similar shades apart.

**Done means:** a piece of flat art (e.g. the Triforce) goes from image to a projected, true-size outline with a yarn list in under 15 minutes.

## User flow

One project runs through six steps; any step can be revisited, and later steps update automatically.

1. **Setup:** upload an image, enter the real rug size in cm, choose shaped (default) or rectangle, and choose "N colours" or "my yarns only".
2. **Colours:** the reduced result beside the original, plus a numbered palette (number, name, colour code).
   - Change the colour count; swap a colour for a yarn; merge two colours; lock a colour.
   - **Add one colour:** the app adds the colour that improves the match most, keeps the others in place, and shows which one it added.
   - **See where a colour sits:** hovering a palette colour highlights its areas in the image and the pattern; hovering the image shows which colour that spot belongs to.
   - Set the minimum detail size in cm.
   - Optional separation outlines (off by default; see Image pipeline).
   - Touch up with a brush and a fill bucket.
3. **Outline** (shaped rugs only): automatic cut line, border offset, smoothing.
4. **Preview:** yarn-textured render of the finished rug, mirrored or not; export as an image.
5. **Yarn:** amount per colour including waste, and a shopping list against stock.
6. **Projector:** calibration, then the pattern layers, one colour at a time.

Assumptions: editing happens on a laptop that also drives the projector; the phone is for looking at the pattern or the shopping list. The interface is in English.

## Image pipeline

The pipeline runs in a Web Worker so the page stays responsive. Each step is a separate, testable function.

1. **Two resolutions:** colours are found on a coarse sample (fast); every pixel is then assigned its colour at a fine resolution of about 0.5 to 1 mm (cheap). All size thresholds work in real mm, so the result does not depend on the image's pixel size.
2. **Edge-preserving denoise:** remove JPEG noise and anti-aliased fringes while keeping edges sharp.
3. **Perceptual colour space:** all colour maths in OKLab, where distance matches how different colours look.
4. **Find the colours:** detect the dominant colour peaks of the flat art, then refine with k-means.
   - Small but clearly distinct colours (eyes, highlights) are kept instead of being absorbed by large areas.
   - The app suggests a colour count ("this art has 6 colours") as a starting point.
   - Each extra colour beyond that is the one that reduces the difference between art and pattern the most, so raising the count by one adds one sensible colour and never reshuffles the rest.
   - Locked colours never move.
5. **Stock mode:** map colours to yarns (see the yarn section).
6. **No dithering:** gradients become solid bands, never speckle patterns.
7. **Separation outlines (optional, off by default):** lines of one yarn, usually black, between areas, as in comic and character rugs. Many designs don't want them, so they are never added automatically.
   - Settings: width in cm, yarn colour (default: the darkest palette colour), and where: all borders, the outer edge only, or chosen colour pairs.
   - Lines are centred on the border and have the full width everywhere; they become a normal palette colour, so yarn amounts and the projector include them.
   - They run before cleanup, so areas an outline squeezes below the minimum detail size are merged or flagged like any other.
   - When the art already has dark outlines (a dark colour that mostly forms thin lines), the app suggests turning this on; thickening those existing lines (step 8) is the other option.
8. **Cleanup:** islands smaller than the minimum detail size merge into the neighbour they share the most border with.
   - Lines thinner than tuftable are flagged with a warning and a "thicken to minimum" option, never deleted. Outlines often carry flat art.
9. **Smooth tracing, never pixel steps:** the pixel grid only decides colours; it is never drawn as lines.
   - Borders are traced along the cracks between pixels, then fitted at a tolerance larger than one pixel, so a diagonal comes out as a diagonal, not a staircase.
   - Curve fitting with corner detection (like Potrace) turns borders into straight lines and smooth curves while keeping real corners sharp: the Triforce stays three crisp triangles, a circle stays round.
   - Each border between two colours is traced and smoothed once as a shared edge, so neighbouring areas fit with no gaps or overlaps after smoothing.
   - The outline, preview and projector view all use these vectors.

**Touch-ups** (brush, fill, merge, swap) edit the colour map directly; only steps 7 to 9 re-run for the affected area, so edits feel instant.

## Outline and rug shape

Shaped rugs get an automatic cut line; rectangular rugs get a background yarn instead.

- **Auto outline:** a transparent PNG background gives the outline directly. Otherwise the colour touching the image edges is treated as background and removed, like a magic wand.
- **Manual correction:** click to add or remove areas when the detection guesses wrong.
- **Border offset:** a slider grows the cut line a few cm beyond the artwork, so the edge can be glued and finished without cutting into the design.
- **Smoothing:** rounds off jags and sharp inner corners that are hard to cut and finish.
- **Rectangle mode:** the empty space becomes a background area with a yarn of choice and is counted in the yarn amounts.
- The cut line appears as a dashed line in the projector view and as the rug edge in the preview.

## Yarn stock, catalogue and amounts

Yarns live in two lists, stock mode suggests matches by default, and amounts come from a one-time calibration.

| List | What it holds | Fields |
| --- | --- | --- |
| Stock | Yarns you own | Name, number, colour code (hex), optional photo, grams on hand |
| Catalogue | Yarns you could buy, e.g. a shop's colour range | Name, number, colour code (hex), optional photo, shop or brand |

**Adding yarns (v1):**

- Colour picker plus name and colour code.
- Photo mode: photograph a cone, the app samples its colour, you name it.
- Swatch screenshot import: screenshot a shop's colour chart, click each swatch, type its name. Works with any shop; screen colours are approximate.
- Import and export of stock and catalogues as files.

**Stock mode:**

- By default the app suggests which owned yarns fit each colour of the art.
- A colour with no good match is marked in words ("no close match").
- **Find matching colours** shows the closest few yarns from stock and catalogue, each rated very close, close or noticeable difference. A catalogue pick goes on the shopping list.
- The app warns when two clearly different art colours would map to the same yarn.

**Yarn amounts:**

1. Tuft a test square (e.g. 10 × 10 cm) once and weigh the cone before and after.
2. The app stores this as grams per m² for that setup. Several calibrations can be saved (e.g. "cut pile 15 mm", "loop pile") and one is picked per project.
3. Amount per yarn:

```latex
\text{grams} = \text{area}_{m^2} \times \text{grams per } m^2 \times (1 + \text{waste})
```

4. **Waste** covers testing, colour changes, shearing, carving, tails and redone sections. The default is 25%, the middle of the 10 to 40% that is normal for early projects ([Tufty](https://www.tufty.eu/blog/how-much-does-tufting-cost-diy-guide)); it can be changed by hand at any time.
5. **Learning from finished rugs:** after a rug, enter the weight of the cones left over. The app compares actual use with its estimate and updates the waste %, so after a few rugs the value reflects your own work.
6. Compared with grams on hand, the result is a shopping list, e.g. "Yarn #3: need about 180 g, have 100 g, buy 1 cone" (cone weight entered per yarn).

## Preview render

The preview is a convincing mockup, not a photorealistic simulation, and is labelled "approximate preview". It is also the mockup sent to commission clients.

It fakes the three things that shape a rug's look most:

1. **Yarn texture:** a generated fuzzy pile texture per colour with slight colour variation; cut pile and loop pile variants.
2. **Carving:** an internal height map puts each area at pile height and cuts a groove along colour borders. A simple light source shades it, producing the dark line and soft bevel of carved rugs. Controlled by one slider: none, light, deep.
3. **Outer edge and setting:** a rounded bevel along the cut line, a soft shadow, and a floor background (wood, concrete, carpet).

Export as PNG, mirrored or not.

## Projector view

The projector view opens in its own window on the projector, while a control panel on the laptop drives it live. A single-window mode with keyboard shortcuts covers one-screen setups.

**Calibration screen (shown first):**

- The rug's bounding frame with corner crosshairs, a 10 cm scale bar and a 10 × 10 cm square, placed outside the rug area.
- Measure the bar on the cloth. If it reads 9.6 cm, type 9.6 and the app rescales. Arrow keys nudge the position.
- The square shows tilt: if its top and bottom edges measure differently, the projector is angled (keystone).

**Pattern layers (each can be switched on or off):**

- Outline: white lines on black, adjustable thickness.
- Numbers in each area, placed at the point deepest inside it. Areas too small for a number get a short pointer line from outside.
- Cut line: dashed (shaped rugs).
- Mirror, for tufting from the back.
- Optional cm grid.

**One colour at a time:** the current yarn's areas light up and everything else dims to faint outlines. Arrow keys step to the next yarn. The yarn's name and number show on the laptop panel, or optionally in a corner outside the rug.

**Practical:** the screen is kept awake while projecting (Screen Wake Lock), and the view works offline.

## Architecture, data and storage

A browser-only app: Vite, React and TypeScript, Zustand for state, Canvas for drawing, image work in Web Workers. Installable as an offline app (PWA), MIT licence, deployed to GitHub Pages.

**Modules** (`core` is plain TypeScript with no browser dependencies, so it is unit-testable):

| Module | Job |
| --- | --- |
| `core/color` | OKLab conversion, colour distance, very close / close / noticeable ratings |
| `core/quantize` | Finding colours, locks, suggested colour count |
| `core/cleanup` | Islands, minimum detail size, thin-line detection and thickening, optional separation outlines |
| `core/trace` | Colour map to shared vector borders, curve fitting with corners |
| `core/outline` | Background detection, border offset, cut-line smoothing |
| `core/yarn` | Amounts, waste and waste learning, shopping list |
| `render/preview` | Yarn texture, carving height map, lighting, PNG export |
| `render/projector` | Layers, number placement, calibration, two-window sync |
| `ui/` | The six steps |
| `storage/` | Browser storage, project files, folder link |

**Data:**

- **Project:** source image, rug size, shape, palette (pointing to yarns), colour map, edits, outline and carving settings.
- **Yarn:** name, number, colour code, optional photo, grams on hand, cone weight, stock or catalogue.
- **Calibration:** name, grams per m², waste % and its history.

**Storage (hybrid):**

1. **Browser storage (IndexedDB)** is the working copy: autosave and undo. The app asks the browser for persistent storage so it is not cleared automatically. It is per browser and per device, and "clear browsing data" wipes it.
2. **Save and open `.tuft` files** in every browser: one file holding the image and all settings, for backups, other devices and sharing.
3. **Linked folder (Chrome and Edge only):** every project also autosaves as a file in a chosen folder. Put that folder in OneDrive or Dropbox for free sync and backup without a server.
4. Yarn stock and catalogues work the same way: browser storage plus import and export as files.

## Error handling and testing

**Error handling:**

- Autosave plus undo and redo.
- Very large images are scaled down, with a notice.
- If a worker crashes, the last good result is kept and the error is shown.
- A clear warning when browser storage is nearly full, with a prompt to save a `.tuft` file.
- Unsupported image formats get a plain message listing the supported ones.

**Testing:**

- **Unit tests (Vitest)** on the `core` modules, using small test images: a Triforce, a circle, a gradient circle, and art with thin black outlines. They check, for example:
  - no island is below the minimum size;
  - neighbouring borders have no gaps or overlaps;
  - the Triforce comes out with straight edges and three sharp tips;
  - the circle has no stair steps and stays within about 1 mm of a true circle at rug scale;
  - the yarn maths and the waste learning add up.
- **One end-to-end test (Playwright)** that walks the whole flow from upload to projector view.
- **Visual check by eye** for the preview render.

**Delivery:** a GitHub Actions pipeline runs lint, type checks and tests, then builds and deploys to GitHub Pages on every push to main.

## Later ideas

Everything below came up while brainstorming and is deliberately out of v1.

| Idea | Area | Why not in v1 |
| --- | --- | --- |
| Full drawing editor (draw and edit the design freely, like a small paint app) | Editing | A project in itself; brush and fill cover v1 |
| Photo mode with heavy simplification | Image pipeline | Flat art is the main use; photos need different handling |
| Bookmarklet that reads colour names and swatches from a shop page | Yarn catalogue | Needs adapting per shop |
| Shared brand catalogues in the repo, contributed via GitHub | Yarn catalogue | Needs users first; a good open-source hook |
| Different pile heights per area (sculpted rugs) | Preview | Global carving covers most rugs |
| Carving set per border instead of globally | Preview | Extra controls; global slider first |
| Room scenes for commission mockups | Preview | Floor backgrounds are enough to start |
| Digital keystone correction (drag four corners) | Projector | Most projectors have keystone built in |
| Splitting rugs bigger than the projector's reach into sections | Projector | Only needed for large rugs |
| Suggested tufting order | Projector | Nice to have |
| Cloud sync between devices | Storage | Needs a server; the linked folder plus OneDrive covers it |

## Decision log and open questions

All decisions were made in the brainstorming session on Nov 4, 2026, unless marked otherwise.

| Decision | Why |
| --- | --- |
| Working name: Color Tuft; repo `color-tuft`; prototype stage | Name can change before going public |
| Waste default 25%, learned from leftover weight after each rug | Guess to start, own value after a few rugs |
| Colours decided on a pixel grid, lines drawn as smooth vectors with corner detection | No blocky stair steps; real corners stay sharp |
| Two resolutions: coarse for finding colours, about 0.5 to 1 mm for assigning them | Fast and detailed; replaces the 2 to 3 mm working-resolution question |
| Personal tool first, free open source later | No accounts, payments or backend needed |
| Flat art first; gradients become a few bands | It's what tufting is mostly used for |
| Projector is the transfer method | What most tufters use |
| Shaped rugs by default, rectangles with a background yarn | Covers both common rug types |
| Brush and fill touch-up; full editor later | Auto results always need a few fixes; a paint app is a project in itself |
| Add one colour picks the colour that improves the match most; hovering shows where each colour sits (added Nov 4, 2026) | Raising the count should add a sensible colour, not reshuffle everything; seeing where a colour sits makes the palette understandable |
| A design pass before the release (added Nov 4, 2026) | Function first; one consistent look once all six steps exist |
| Separation outlines as an option, off by default (added Nov 4, 2026) | Common in comic and character rugs, but unwanted in many designs; the app knows the true size, so widths are real cm |
| Yarn input: picker with name and code, photo sampling, swatch screenshot import | Works with any shop, no scraping |
| Stock mode suggests matches by default, plus "Find matching colours" | Fast default, manual help where matches are poor |
| Yarn amounts from a calibration square, plus adjustable waste % | Generic formulas are too far off per gun and yarn |
| Scale bar and square for projector calibration | Checks true size and tilt by measuring |
| Preview as a labelled mockup (texture, carving, edge) | Photorealism is not reachable; a mockup is enough for clients |
| Browser-only: React, TypeScript, Vite, own image pipeline | Free hosting, offline, no uploads, good learning value |
| Hybrid storage: browser plus `.tuft` files plus optional linked folder | Zero setup, but you own your files |

**Open questions:**

- [x] App name and repo name: Color Tuft (working name, subject to change), repo `color-tuft`, prototype stage. Check the name is free before going public.
- [ ] Default minimum detail size in cm (depends on the gun; set after first tests).
- [x] Starting waste percentage: 25% as a base guess, then calibrated from leftover yarn after each rug.
- [x] Working resolution: replaced by two resolutions and smooth vector tracing (see Image pipeline).
