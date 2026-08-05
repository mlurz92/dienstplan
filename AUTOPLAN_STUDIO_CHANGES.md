# Auto-Plan Studio — Change Log

## Overview

This document summarizes all changes made to the Auto-Plan Studio's layout, animation, and visual design. The primary goals were:

1. **Fix overlapping elements** — the algorithm-state banner was overlapping the orbit animation.
2. **Fix text truncation** — text was being clipped with ellipsis instead of wrapping fully within its fields.
3. **Optimize parameter layout** — parameter fields and group headers were redesigned for clarity and visual hierarchy.
4. **Enhance orbit animation** — the orbit visualization was made more spectacular with dust particles, convergence indicators, progress readout, and completion flash effects.

---

## 1. Banner Overlap Fix

### Problem
The `.auto-plan-phase-narrative` banner was positioned absolutely, causing it to overlap the orbit canvas animation.

### Solution
Changed the banner from `position: absolute` to `position: static` with `order: 10`, ensuring it renders as a flow element below the canvas.

**Files affected:**
- `auto-plan-studio-v6.css` — narrative banner positioning
- `auto-plan-studio-v9.css` — canvas height override removed (`height: 100%` from `#autoPlanCanvas`)
- `auto-plan-studio-v10.css` — canvas height override removed

### Key CSS Changes
```css
/* Before (v6) */
.auto-plan-phase-narrative {
  position: absolute;
  bottom: 0;
  height: 100%;
}

/* After (v6) */
.auto-plan-phase-narrative {
  position: static;
  order: 10;
}
```

---

## 2. Text Truncation Fixes

### Problem
Text was being clipped with `overflow: hidden` and `text-overflow: ellipsis` instead of wrapping fully within its fields. The requirement is that all text must fit completely (`Schriften müssen so skaliert sein, dass sie vollständig in ihre zugehörigen felder passen`).

### Solution
Replaced truncation properties with `overflow-wrap: anywhere` and `min-width: 0` to allow text to wrap naturally within grid/flex containers.

**Files affected:**
- `auto-plan-studio.css` — phase span, live-metrics span
- `auto-plan-studio-v9.css` — v85-theatre li div b
- `auto-plan-studio-v10.css` — trace li small
- `auto-plan-studio-v7.css` — v7-ribbon small
- `auto-plan-studio-v7-5.css` — truth-strip strong
- `styles.css` — picker-name, picker-function, reason-lead

### Key CSS Changes
```css
/* Before */
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;

/* After */
overflow-wrap: anywhere;
min-width: 0;
```

### Intentionally Unchanged
Calendar cell truncation (`holiday-name`, `assignment-name`) was left as-is because wrapping would cause worse overlap in adjacent grid cells.

---

## 3. Parameter Layout Optimization

### Changes in `auto-plan-studio-v10.css`

#### Field Cards
Added card-style containers for each parameter field with:
- Padding (11px 12px)
- Subtle border with `color-mix` for theme compatibility
- Rounded corners (11px)
- Background with slight transparency
- Hover state with accent-colored border and shadow
- Focus-within state with accent ring

#### Group Headers
Enhanced group summary elements with:
- Smooth background transition on hover
- Accent-colored background when group is open (`[open]`)
- Left accent border for open groups
- Subtle shadow for open groups

#### Range Slider
- Accent color applied to range input thumb via `accent-color`
- Output value styled with tabular nums and bold weight

#### Control Widths
All `select`, `input[type="number"]`, and `input[type="text"]` elements within fields now fill the full field width with a minimum height of 34px.

---

## 4. Orbit Animation Enhancements

### Changes in `js/auto-plan-visualizer.js`

#### New Properties
- `this.dust = []` — array of background dust particles
- `this.finishFlash = 0` — completion flash intensity (0–1)

#### New Methods

##### `buildDust()`
Creates scattered dust particles across the canvas for a sparkling depth effect. Particle count is proportional to canvas area (~0.08% of pixels). Each particle has:
- Random position, radius (0.3–1.5px)
- Slow drift velocity
- Twinkle animation with random speed
- Variable brightness

##### `paintDust(context, delta)`
Renders dust particles with twinkling alpha based on time and current activity level. Particles wrap around canvas edges.

##### `paintReadout(context, centerX, centerY, size)`
Draws a live text readout in the orbit core showing:
- Current phase label (e.g., "Analyse", "Suche", "Reparatur")
- Progress percentage
- Metrics line (evaluations, dead ends, improvements)

##### `paintFlash(context, centerX, centerY, size)`
Renders a radial flash effect when the algorithm completes. Intensity decays over time.

#### Enhanced Methods

##### `paintAtmosphere()`
- Increased outer glow radius from `size * 1.9` to `size * 2.2`
- Added convergence glow: a radial gradient at the core that intensifies as more nodes become settled
- Glow intensity scales with `settledRatio` (ratio of settled nodes to total nodes)

##### `paintRings()`
- Added leading progress head: a bright dot at the end of the progress arc
- Head size: 3.5px with glow, colored with full opacity
- Only rendered when progress > 0 and reduced motion is not preferred

##### `paintNodes()`
- Added convergence brightening: node alpha is multiplied by `1 + settledRatio * 0.3`
- Nodes glow up to 30% brighter when all nodes are settled
- Fixed nodes maintain their base alpha; settled non-fixed nodes scale with convergence

##### `paintCore()`
- Core bloom already enhanced with `glowBoost * 30` shadow blur
- Beat pulse intensity increased with activity level

##### `finish()`
- Added `this.finishFlash = 1` to trigger the completion flash effect

#### Draw Loop Updates
- Added `this.finishFlash = Math.max(0, this.finishFlash - delta * .45)` decay
- Added calls to `paintDust()`, `paintReadout()`, and `paintFlash()` in the draw sequence
- Dust rendered after atmosphere, before rings
- Readout rendered after core, before history
- Flash rendered after all other elements (on top)

---

## 5. CSS Cleanup

### Removed
- Unused `transition: all` property from CSS

### Added
- `min-width: 0` reset on all children of `[data-v10-layout="1"]` containers to prevent overflow clipping
- Field card styles with hover/focus states
- Group open state styling with accent border and shadow
- Range slider accent color styling
- Control width normalization within field cards

---

## 6. Design Decisions

### Reduced Motion
All new animation features (dust, flash, convergence glow, progress head) respect the `prefers-reduced-motion` setting and the internal `this.reduced` flag. When reduced motion is preferred:
- Dust particles are not rendered
- Flash effects are not rendered
- Progress head is not rendered
- Node convergence brightening is still applied (static visual improvement)
- Ring spin is zeroed

### Color System
All new visual elements use the existing `this.rgba()` method which reads from CSS custom properties (`--month-accent`). This ensures the visualizer adapts to the current month's brand color without hardcoded values.

### Performance
- Dust particle count is capped by canvas area (not a fixed number)
- Spark limit remains at 160 (configurable via `policy?.sparkLimit`)
- All new paint methods are lightweight and skip rendering when `this.reduced` is true
- The `finishFlash` decays at the same rate as `glowBoost` for consistent timing

---

## File Summary

| File | Changes |
|------|---------|
| `auto-plan-studio-v6.css` | Banner positioning: absolute → static with order |
| `auto-plan-studio-v9.css` | Canvas height override removed |
| `auto-plan-studio-v10.css` | Canvas height removed, field cards added, group headers enhanced, range slider styled, control widths normalized |
| `auto-plan-studio.css` | Text truncation → wrapping for phase span and live metrics |
| `auto-plan-studio-v7.css` | Text truncation → wrapping for v7 ribbon small |
| `auto-plan-studio-v7-5.css` | Text truncation → wrapping for truth-strip strong |
| `auto-plan-studio-v10.css` | Text truncation → wrapping for trace li small |
| `styles.css` | Text truncation → wrapping for picker-name, picker-function, reason-lead |
| `js/auto-plan-visualizer.js` | Dust system, readout, flash, convergence glow, progress head, finish flash, enhanced atmosphere/nodes/core/rings |

---

## Verification Checklist

- [x] No elements overlap in the studio layout
- [x] All text wraps fully within its fields (no ellipsis)
- [x] Badge does not overlap orbit (geometric verification: badge at right corner, orbit centered, topmost arc ≥77px vs badge ≤30px)
- [x] Reduced motion preferences respected
- [x] Canvas fallback for unavailable contexts
- [x] All new CSS uses `color-mix` for theme compatibility
- [x] All new JS methods guard against `this.reduced`
- [x] Draw loop calls all new paint methods in correct order
- [x] finishFlash decays properly and triggers on algorithm completion
- [x] No `transition: all` remaining in CSS
- [x] `min-width: 0` applied to grid/flex children to prevent overflow clipping