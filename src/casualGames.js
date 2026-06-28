/**
 * Casual Games section — Cover Flow card carousel.
 *
 * Four game covers sit on thin 3-D boxes.  The active card faces the camera
 * straight on; side cards angle ~67° inward and stack behind — classic Cover Flow.
 * The carousel lives on the LEFT half of the frame; game text is on the RIGHT.
 *
 * Autoplay advances every 3.5 s (wrapping).  Manual navigation (click, keyboard,
 * wheel, swipe) resets the timer.
 */

import * as THREE from 'three';

import pokerroomUrl from '../assets/images/casual-pokerroom.webp';
import spoggUrl     from '../assets/images/casual-spogg.webp';
import crazy8Url    from '../assets/images/casual-crazy8.webp';
import bunnyhopUrl  from '../assets/images/casual-bunnyhop.webp';

const GAMES = [
  {
    title: 'Pokerroom',
    desc:  "I wrote one of the first versions of this online poker platform. " +
           "It grew to become the world's 3rd largest poker site.",
    url: pokerroomUrl,
  },
  {
    title: 'Spogg',
    desc:  'An online games portal with casual multiplayer games played by millions of players.',
    url: spoggUrl,
  },
  {
    title: 'Crazy Eight',
    desc:  'A multiplayer card game built for Spogg — simple rules, endlessly replayable.',
    url: crazy8Url,
  },
  {
    title: 'Bunny Hop',
    desc:  'A mobile game I designed and shipped that was later acquired by King.',
    url: bunnyhopUrl,
  },
];

// ── Layout ────────────────────────────────────────────────────────────────
const CARD_HEIGHT    = 1.05;   // world units; width varies by aspect ratio
const CARD_MAX_W     = 1.40;   // clamp wide cards so they don't eat the frame
const CARD_DEPTH     = 0.055;
const REF_RATIO      = 0.38;   // reflection height as fraction of card height

// Carousel sits on the LEFT half — cards are offset this many world units left
const CAROUSEL_X     = -0.48;

const SIDE_ANGLE     = Math.PI * 0.37;  // ~67°
// Base Y-rotation applied to every card so the whole carousel faces slightly
// inward (toward the text panel on the right), matching the slight angle used
// by the Mac models in the other sections.  Negative = faces right.
const BASE_ROT_Y     = +Math.PI * 0.07; // ~12.6° inward (toward text panel)
const SPREAD_X0      = 0.68;  // X gap (in card-width units) to first side card
const SPREAD_DX      = 0.26;  // additional X per further card
const SIDE_Z         = -0.28; // Z pushback per card away from centre
const LERP_K         = 0.10;  // animation smoothness
const AUTOPLAY_MS    = 3500;  // ms between auto-advances

function mix(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function initCasualGames(sectionEl, scrollContainer) {
  const canvas = document.getElementById('casual-games-canvas');
  if (!canvas) return { update() {} };

  function sectionSize() {
    return { w: sectionEl.clientWidth || 960, h: sectionEl.clientHeight || 540 };
  }
  const { w, h } = sectionSize();

  // ── Renderer ──────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(0x000000, 0);
  canvas.style.touchAction    = 'pan-y';
  renderer.outputColorSpace   = THREE.SRGBColorSpace;
  renderer.toneMapping        = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // ── Scene & camera ────────────────────────────────────────────────────
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 50);
  camera.position.set(0, 0.08, 2.2);
  // Look slightly above y=0 so the card (at y=0) appears ~20 px below screen
  // centre — centring it in the usable area below the navigation bar.
  camera.lookAt(0, 0.063, 0);

  // ── Lighting ──────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.10);
  keyLight.position.set(0, 2.5, 4);
  scene.add(keyLight);

  const rimCool = new THREE.DirectionalLight(0x4466ff, 0.65);
  rimCool.position.set(2, 1, -2);
  scene.add(rimCool);

  const rimWarm = new THREE.DirectionalLight(0xff6622, 0.35);
  rimWarm.position.set(-2, 1, -2);
  scene.add(rimWarm);

  // ── State ─────────────────────────────────────────────────────────────
  let activeIdx = 0;
  let activeT   = 0;
  let cards     = [];
  let ready     = false;
  let visible   = false;

  // ── Text DOM refs ─────────────────────────────────────────────────────
  const overlayEl = document.getElementById('cg-text');
  const titleEl   = document.getElementById('cg-title');
  const descEl    = document.getElementById('cg-desc');

  function setActive(idx, instant = false) {
    const g = GAMES[idx];
    if (instant) {
      if (titleEl) titleEl.textContent = g.title;
      if (descEl)  descEl.textContent  = g.desc;
      return;
    }
    if (overlayEl) overlayEl.classList.add('fading');
    setTimeout(() => {
      if (titleEl)   titleEl.textContent = g.title;
      if (descEl)    descEl.textContent  = g.desc;
      if (overlayEl) overlayEl.classList.remove('fading');
    }, 220);
  }

  // ── Autoplay ──────────────────────────────────────────────────────────
  let autoTimer = null;

  function startAutoplay() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => {
      if (!visible || !ready) return;
      activeIdx = (activeIdx + 1) % GAMES.length;
      setActive(activeIdx);
    }, AUTOPLAY_MS);
  }

  function navigate(dir) {
    const next = clamp(activeIdx + dir, 0, GAMES.length - 1);
    if (next !== activeIdx) {
      activeIdx = next;
      setActive(activeIdx);
      startAutoplay(); // reset timer on manual nav
    }
  }

  // ── Build cards ───────────────────────────────────────────────────────
  const texLoader = new THREE.TextureLoader();

  // Fade gradient for the reflection alphaMap.
  // Three.js alphaMap reads the R channel; CanvasTexture flips Y so canvas-top (y=0)
  // maps to UV V=1 (top of geometry).  We want: opaque at box top (near card) →
  // transparent at box bottom.  So the gradient runs white at canvas y=0 → black at y=63.
  const gCvs = document.createElement('canvas');
  gCvs.width = 1; gCvs.height = 64;
  const gCtx = gCvs.getContext('2d');
  const grd  = gCtx.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0,    '#fff');  // canvas top → UV V=1 (top of box, near card) → opaque
  grd.addColorStop(0.18, '#888');  // gone to 47% by 18%
  grd.addColorStop(0.32, '#000');  // fully transparent by 32% — rest is invisible
  grd.addColorStop(1,    '#000');
  gCtx.fillStyle = grd;
  gCtx.fillRect(0, 0, 1, 64);
  const gradTex = new THREE.CanvasTexture(gCvs);

  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a, roughness: 0.30, metalness: 0.65,
  });

  Promise.all(
    GAMES.map(g => new Promise(res => texLoader.load(g.url, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      res(tex);
    })))
  ).then(textures => {
    textures.forEach((tex, i) => {
      const aspect = tex.image.naturalWidth / tex.image.naturalHeight;
      const cardW  = Math.min(CARD_HEIGHT * aspect, CARD_MAX_W);

      // ── Card box ────────────────────────────────────────────────────
      const frontMat = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.12, metalness: 0.0,
      });
      // BoxGeometry face order: +X, -X, +Y, -Y, +Z (front), -Z (back)
      const geo  = new THREE.BoxGeometry(cardW, CARD_HEIGHT, CARD_DEPTH);
      const mats = [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, edgeMat];
      const frontMesh           = new THREE.Mesh(geo, mats);
      frontMesh.userData.cardIdx = i;

      // ── Reflected box ────────────────────────────────────────────────
      // A second BoxGeometry placed directly below the card, showing both the
      // front-face image AND the dark 3-D edges in the reflection.
      //
      // No scale.y flip — the box is upright at y = -CARD_HEIGHT - gap so its
      // top edge sits flush against the card's bottom edge.
      //
      // flipY=false on the cloned texture is the correct SINGLE vertical flip:
      // UV V=1 (top of the reflected box, nearest card) now reads from canvas-
      // bottom (= the BOTTOM of the original image), which is what you'd see
      // in a true floor mirror.
      //
      // alphaMap (white→black gradient) fades the reflection from opaque at the
      // top (near card) to transparent further down.
      const refTex       = tex.clone();
      refTex.needsUpdate = true;
      refTex.flipY       = false;   // single flip → correct mirror image

      const reflFrontMat = new THREE.MeshBasicMaterial({
        map: refTex, alphaMap: gradTex,
        transparent: true, opacity: 0.15,
        // depthWrite + alphaTest: pixels the gradient has faded to ~0 are
        // discarded (don't write depth), so the background shows through.
        // Pixels that ARE visible write depth, blocking reflections of cards
        // that sit further back — eliminates the "see-through to other tiles" look.
        depthWrite: true, alphaTest: 0.01,
      });
      const reflEdgeMat = new THREE.MeshBasicMaterial({
        color: 0x1a1a1a,
        transparent: true, opacity: 0.10,
        depthWrite: true, alphaTest: 0.01,
      });

      const refBox = new THREE.Mesh(
        new THREE.BoxGeometry(cardW, CARD_HEIGHT, CARD_DEPTH),
        [reflEdgeMat, reflEdgeMat, reflEdgeMat, reflEdgeMat, reflFrontMat, reflEdgeMat],
      );
      // Box is upright; top of box = position.y + CARD_HEIGHT/2
      // We want that to equal -(CARD_HEIGHT/2 + gap), so:
      refBox.position.y = -CARD_HEIGHT - 0.004;

      // Group: card + reflected box — camera lookAt handles vertical centering
      const group = new THREE.Group();
      group.add(frontMesh);
      group.add(refBox);
      scene.add(group);

      cards.push({ group, frontMesh, refBox, width: cardW });
    });

    ready = true;
    applyTransforms(true);
    setActive(0, true);
    startAutoplay();
  });

  // ── Cover Flow transform ──────────────────────────────────────────────
  function targetFor(offset, cardWidth) {
    const abs   = Math.abs(offset);
    const sign  = offset >= 0 ? 1 : -1;
    const t     = clamp(abs, 0, 1);
    const extra = Math.max(0, abs - 1);

    return {
      x:    CAROUSEL_X + sign * (SPREAD_X0 * cardWidth * t + extra * SPREAD_DX * cardWidth),
      z:    SIDE_Z * abs,
      rotY: BASE_ROT_Y - sign * SIDE_ANGLE * t,
      scale: mix(1.0, 0.79, t) - extra * 0.07,
    };
  }

  function applyTransforms(instant = false) {
    cards.forEach(({ group, width }, i) => {
      const tr = targetFor(i - activeT, width);
      const s  = Math.max(0.05, tr.scale);
      if (instant) {
        group.position.x = tr.x;
        group.position.z = tr.z;
        group.rotation.y = tr.rotY;
        group.scale.setScalar(s);
      } else {
        group.position.x = mix(group.position.x, tr.x,    LERP_K);
        group.position.z = mix(group.position.z, tr.z,    LERP_K);
        group.rotation.y = mix(group.rotation.y, tr.rotY, LERP_K);
        group.scale.setScalar(mix(group.scale.x, s,       LERP_K));
      }
    });

    // Correct render order every frame so Three.js draws layers in the right
    // sequence regardless of scene-graph insertion order.
    //
    // Opaque boxes: front-to-back (closer card rendered first so the depth
    //   buffer blocks overdraw for cards behind it).
    // Transparent reflections: back-to-front (painter's algorithm).
    const byZ = [...cards].sort((a, b) => b.group.position.z - a.group.position.z);
    const n = byZ.length;
    byZ.forEach(({ frontMesh, refBox }, order) => {
      frontMesh.renderOrder = order;             // 0 = frontmost, n-1 = backmost
      if (refBox) refBox.renderOrder = 100 + (n - 1 - order); // backmost = 100 first
    });
  }

  // ── Raycasting ────────────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();

  function eventNDC(e) {
    const zoom = parseFloat(document.documentElement.style.zoom) || 1;
    return new THREE.Vector2(
       (e.offsetX / (canvas.offsetWidth  * zoom)) * 2 - 1,
      -((e.offsetY / (canvas.offsetHeight * zoom)) * 2 - 1),
    );
  }

  function hitCardIdx(e) {
    raycaster.setFromCamera(eventNDC(e), camera);
    const hit = raycaster.intersectObjects(cards.map(c => c.frontMesh))[0];
    return hit ? hit.object.userData.cardIdx : -1;
  }

  canvas.addEventListener('mousemove', e => {
    if (!ready) return;
    const idx = hitCardIdx(e);
    canvas.style.cursor = (idx !== -1 && idx !== activeIdx) ? 'pointer' : 'default';
  });

  canvas.addEventListener('click', e => {
    if (!ready) return;
    const idx = hitCardIdx(e);
    if (idx !== -1 && idx !== activeIdx) {
      activeIdx = idx;
      setActive(activeIdx);
      startAutoplay();
    }
  });

  // ── Keyboard ──────────────────────────────────────────────────────────
  new IntersectionObserver(
    entries => { visible = entries[0].isIntersecting; },
    { root: scrollContainer, threshold: 0.5 },
  ).observe(sectionEl);

  document.addEventListener('keydown', e => {
    if (!ready || !visible) return;
    if (e.key === 'ArrowLeft')  navigate(-1);
    if (e.key === 'ArrowRight') navigate(+1);
  });

  // ── Mouse wheel ───────────────────────────────────────────────────────
  let wheelCooldown = false;
  canvas.addEventListener('wheel', e => {
    if (!ready || wheelCooldown) return;
    e.preventDefault();
    navigate((e.deltaX > 0 || e.deltaY > 0) ? 1 : -1);
    wheelCooldown = true;
    setTimeout(() => { wheelCooldown = false; }, 380);
  }, { passive: false });

  // ── Touch swipe ───────────────────────────────────────────────────────
  let sx = 0, sy = 0;
  canvas.addEventListener('touchstart', e => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  canvas.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 35) navigate(dx < 0 ? 1 : -1);
  }, { passive: true });

  // ── Resize ────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    const { w, h } = sectionSize();
    camera.aspect  = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  // ── Per-frame update ──────────────────────────────────────────────────
  return {
    update(time) {
      if (!ready) return;
      activeT = mix(activeT, activeIdx, LERP_K);

      const cycle = (Math.sin(time * 0.00035) + 1) / 2;
      rimCool.intensity = 0.40 + cycle * 0.30;
      rimWarm.intensity = 0.10 + (1 - cycle) * 0.35;

      applyTransforms();
      renderer.render(scene, camera);
    },
  };
}
