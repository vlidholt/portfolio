# Portfolio — Agent Context

Viktor Lidholt's interactive portfolio. Built with **Vite + Three.js**; no framework.

IMPORTANT: If relevant, update this AGENTS.md file so that it is always up to date after making changes.

---

## Tech stack

| Tool | Version | Role |
|------|---------|------|
| Vite | ^6.0.0 | Dev server & bundler |
| Three.js | ^0.175.0 | 3-D rendering |
| Vanilla JS (ES modules) | — | Everything else |
| Google Fonts | Space Grotesk, Inter | Typography |

---

## File map

```
index.html          Main HTML — all sections live here
src/
  main.js           Entry point: nav wiring, IntersectionObserver, animation loop
  style.css         All styles (reset → nav → per-section)
  aboutSection.js   Three.js scene for the "Viktor" (About) section
  earlyGames.js     Three.js scene for the "Early Games" section
  education.js      Three.js scene for the "Education" section
  missileCommand.js Missile Command game logic & rendering (standalone class)
assets/
  3d/macintosh.glb         Old Macintosh 3-D model (Early Games)
  3d/macintosh-2.glb       Macintosh 2 model (Education)
  3d/viktor.glb            Full-figure Viktor model (About)
  background/kiddo.webp    Background photo for the Early Games section
  missile/background.png   Mac screen chrome (menu bar + rounded corners) for the game
vite.config.js      Adds *.glb to assetsInclude
```

---

## Page structure

Single-page vertical scroll inside `#scroll-container` with `scroll-snap-type: y mandatory`. Each section is exactly 540px (fixed 16:9 design canvas, scaled via JS `zoom`).

| Order | `id` | CSS class(es) | Notes |
|-------|------|---------------|-------|
| 1 | `about` | `section-about` | Three.js canvas (viktor.glb + orbiting objects); text left |
| 2 | `early-games` | `section-early-games` | Three.js canvas (macintosh.glb + Missile Command game); text right |
| 3 | `education` | `section-education` | Three.js canvas (macintosh-2.glb); text left |
| 4 | `casual-games` | `section-placeholder section-casual` | Placeholder |
| 5 | `dev-tools` | `section-placeholder section-tools` | Placeholder |
| 6 | `flutter` | `section-placeholder section-google` | Placeholder |
| 7 | `serverpod` | `section-placeholder section-serverpod` | Placeholder |

---

## Navigation

One nav, `position: fixed; z-index: 200`:

- **`#top-nav`** — horizontal bar with pill-style items, links carry `data-section="<id>"`. Active item is filled white with dark text. Side nav was removed.

Active state is driven by an `IntersectionObserver` (threshold 0.5) in `main.js`. Adding a new section requires:
1. A new `<section id="…">` in `index.html`.
2. A matching `<a data-section="…">` in `#top-nav`.
3. No JS changes — the observer picks it up automatically.

Reveal animations (`.visible` class) are applied by the same observer at threshold 0.1.

---

## Animation loop

`main.js` runs a single `requestAnimationFrame` loop that calls `.update(time)` on every active scene module:

```js
function animate(time) {
  requestAnimationFrame(animate);
  about.update(time);
  earlyGames.update(time);
  education.update(time);
}
```

New section modules should export `{ update(time) }` and be initialised + called here.

---

## Early Games section (Three.js)

`earlyGames.js` owns the full WebGL pipeline for section 2:

- **Renderer**: `WebGLRenderer` on `#early-games-canvas`, `ACESFilmicToneMapping`.
- **Post-processing**: `EffectComposer` → `RenderPass` → `UnrealBloomPass` → `OutputPass`. Call `composer.render()`, not `renderer.render()`.
- **Background**: `kiddo.webp` loaded as `scene.background` (CSS-cover maths applied manually). Must be inside Three.js — not CSS — so the EffectComposer has an opaque framebuffer.
- **Model**: `macintosh.glb` loaded via `GLTFLoader` with a custom `KHR_materials_pbrSpecularGlossiness` plugin (the GLB has no textures; all colour comes from `diffuseFactor`).
- **Screen texture**: The Missile Command game renders into an off-screen `gameCanvas`, which is composited (with a slim black bezel) into a `screenCanvas`. `screenCanvas` backs a `THREE.CanvasTexture` applied to the Mac's screen mesh.
- **Screen mesh**: The original low-poly screen quad was replaced with a 24×16 subdivided `PlaneGeometry` whose vertex positions are bilinearly interpolated from the original four corners — this eliminates the diagonal UV fold visible on the curved CRT surface.
- **Bloom**: Screen material uses `emissiveMap` + `emissive: (0.45, 0.65, 1.0)` + `emissiveIntensity: 1.5` (fades in on load). Bloom threshold is 1.0, strength 0.25. The Mac body stays just below 1.0 luminance. Do not raise scene light intensities without re-checking the threshold.
- **Scroll → rotation**: `scrollContainer` scroll events drive `targetRotY`; a lerp in `update()` smooths it.

---

## Shared section text card style

Sections with a 3-D model use a consistent frosted text card overlay. Use these CSS classes — do **not** reinvent the styles:

| Class | Role |
|-------|------|
| `.eg-card` | Frosted pill container — `background: rgba(5,10,30,0.45)`, `backdrop-filter: blur(14px)`, `border: 1px solid rgba(0,0,0,0.55)`, `border-radius: 20px` |
| `.eg-title` | Section title — Space Grotesk, 800 weight, `clamp(1.3rem, 2.1vw, 1.9rem)` |
| `.eg-bio` | Body copy — Inter, `0.84rem`, `rgba(255,255,255,0.65)` |

The overlay wrapper differs per section:
- `.eg-overlay` (Early Games) — sits on the **right**, `width: calc(46% + 100px)`, `align-items: flex-start`, `padding: 5.5rem 4rem 4rem 2rem`
- `.ed-overlay` (Education) — sits on the **left**, same width/padding mirrored

---

## CSS conventions

- **No `backdrop-filter` over the WebGL canvas.** The browser must re-sample a live 60 fps canvas for every blur composite — this causes visible flickering. Use a more opaque solid `background` instead (current nav uses `rgba(5, 10, 24, 0.82)`).
- Section reveal: add `.visible` via JS (IntersectionObserver). Animate with `opacity` + `transform` transitions gated on `.section-id.visible .child`.
- Do **not** add `will-change: transform` to elements that also have `backdrop-filter` — it creates a stacking-context conflict that worsens compositing.

---

## Adding a new section

1. Add `<section id="my-section" class="section section-my-section">` in `index.html`.
2. Add a nav entry in `#top-nav` with `data-section="my-section"`.
3. Add background / reveal styles in `style.css`.
4. If it needs a live canvas or Three.js scene, create `src/mySection.js` exporting `initMySection(sectionEl, scrollContainer)` → `{ update(time) }`, then wire it in `main.js`.
5. For text card overlays, reuse `.eg-card`, `.eg-title`, `.eg-bio` — only create a new wrapper div with section-specific positioning.
