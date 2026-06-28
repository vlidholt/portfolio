/**
 * Early Games section — Three.js scene with an old Macintosh model.
 *
 * Postprocessing pipeline (EffectComposer):
 *   RenderPass → UnrealBloomPass → OutputPass
 *
 * The Mac screen uses a high emissiveIntensity + blue emissive so it alone
 * exceeds the bloom threshold.  The glow spreads over the 3-D scene (Mac
 * body, background photo) — not just the flat screen rectangle.
 *
 * Background photo is loaded directly into Three.js (scene.background) with
 * CSS-cover behaviour via texture offset / repeat so the EffectComposer has a
 * fully opaque framebuffer to work with.
 */

import * as THREE from 'three';
import { GLTFLoader }     from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass }     from 'three/examples/jsm/postprocessing/OutputPass.js';

import macintoshUrl from '../assets/3d/macintosh.glb?url';
import kiddoUrl     from '../assets/background/kiddo.webp';
import { MissileCommand, GAME_W, GAME_H } from './missileCommand.js';

const TARGET_HEIGHT = 0.80;
const REST_ROT_Y    =  0.85; // resting Y-angle when fully in view — more toward centre

// ── Bloom settings ────────────────────────────────────────────────────
const BLOOM_STRENGTH        = 0.25;
const BLOOM_RADIUS          = 0.00;
const BLOOM_THRESHOLD       = 1.00;
const SCREEN_EMISSIVE_TARGET = 1.50;

export function initEarlyGames(sectionEl, scrollContainer) {

  // ── Off-screen game canvas ────────────────────────────────────────
  const gameCanvas  = document.createElement('canvas');
  gameCanvas.width  = GAME_W;
  gameCanvas.height = GAME_H;
  const game        = new MissileCommand(gameCanvas);

  // ── Screen texture wrapper — adds a slim black CRT bezel ──────────
  // The game canvas is composited into a same-size canvas with a black
  // border. This keeps missileCommand.js untouched while giving the 3-D
  // model a realistic inner bezel around the phosphor area.
  const SCREEN_BORDER  = 10;                        // px each side
  const screenCanvas   = document.createElement('canvas');
  screenCanvas.width   = GAME_W;
  screenCanvas.height  = GAME_H;
  const screenCtx      = screenCanvas.getContext('2d');

  // ── Renderer ──────────────────────────────────────────────────────
  const canvas = document.getElementById('early-games-canvas');

  function sectionSize() {
    return { w: sectionEl.clientWidth  || window.innerWidth,
             h: sectionEl.clientHeight || window.innerHeight };
  }

  const { w, h } = sectionSize();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  // Three.js sets touch-action:none on every canvas, which blocks the scroll
  // container from receiving vertical swipes. Override to pan-y so the browser
  // still handles scroll gestures while touch events fire normally for the game.
  canvas.style.touchAction = 'pan-y';
  renderer.outputColorSpace    = THREE.SRGBColorSpace;
  // Tone-mapping is applied once by OutputPass; disable per-material
  // tonemapping by choosing NoToneMapping here and leaving it to OutputPass.
  // (OutputPass reads renderer.toneMapping, so we set what we want there.)
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // ── Scene & camera ────────────────────────────────────────────────
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, w / h, 0.001, 5000);
  camera.position.set(0, 0, 5);

  // ── Background photo (CSS-cover behaviour) ────────────────────────
  const bgTexture = new THREE.TextureLoader().load(kiddoUrl, () => {
    bgTexture.colorSpace = THREE.SRGBColorSpace;
    _coverBg();
    scene.background = bgTexture;
  });

  function _coverBg() {
    if (!bgTexture.image) return;
    const imgA  = bgTexture.image.width / bgTexture.image.height;
    const { w: sw, h: sh } = sectionSize();
    const scrA  = sw / sh;
    if (scrA > imgA) {
      const s = imgA / scrA;
      bgTexture.repeat.set(1, s);
      bgTexture.offset.set(0, (1 - s) / 2);
    } else {
      const s = scrA / imgA;
      bgTexture.repeat.set(s, 1);
      bgTexture.offset.set((1 - s) / 2, 0);
    }
  }

  // ── Lighting ──────────────────────────────────────────────────────
  // Lights can be generous now that bloom threshold is 1.0 — the Mac body
  // tops out around luminance 0.85 with these values, safely below.
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));

  const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.10);
  keyLight.position.set(2, 3, 2);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x8090d0, 0.40);
  fillLight.position.set(-2, 0, 2);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.20);
  rimLight.position.set(0, -2, -2);
  scene.add(rimLight);

  // ── Screen canvas texture (source = wrapper with bezel) ──────────
  const screenTexture      = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;

  // ── EffectComposer ────────────────────────────────────────────────
  const composer  = new EffectComposer(renderer);
  const renderPas = new RenderPass(scene, camera);
  composer.addPass(renderPas);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // ── State ─────────────────────────────────────────────────────────
  let macGroup       = null;
  let screenMesh     = null;
  let screenMat      = null;  // reference kept for emissive fade-in
  let screenUvBounds = null;
  let targetRotY     = REST_ROT_Y + Math.PI / 3;
  let currentRotY    = targetRotY;
  let modelReady     = false;
  let lastTime       = 0;
  let emissiveCurrent = 0;    // starts at 0, lerps toward SCREEN_EMISSIVE_TARGET

  // ── KHR_materials_pbrSpecularGlossiness plugin ────────────────────
  // GLB has no embedded images — all colour comes from diffuseFactor
  const loader = new GLTFLoader();

  loader.register((parser) => ({
    name: 'KHR_materials_pbrSpecularGlossiness',

    getMaterialType(materialIndex) {
      const matDef = parser.json.materials?.[materialIndex];
      if (!matDef?.extensions?.KHR_materials_pbrSpecularGlossiness) return null;
      return THREE.MeshStandardMaterial;
    },

    extendMaterialParams(materialIndex, materialParams) {
      const matDef = parser.json.materials?.[materialIndex];
      const ext    = matDef?.extensions?.KHR_materials_pbrSpecularGlossiness;
      if (!ext) return Promise.resolve();
      if (ext.diffuseFactor) {
        const [r, g, b, a] = ext.diffuseFactor;
        materialParams.color = new THREE.Color().setRGB(r, g, b);
        if (a !== undefined && a < 1) materialParams.opacity = a;
      }
      materialParams.roughness = ext.glossinessFactor !== undefined
        ? 1 - ext.glossinessFactor : 0.6;
      materialParams.metalness = 0;
      return Promise.resolve();
    },
  }));

  // ── Load model ────────────────────────────────────────────────────
  loader.load(
    macintoshUrl,
    (gltf) => {
      macGroup = gltf.scene;

      // 1. Scale to TARGET_HEIGHT
      const rawBox = new THREE.Box3().setFromObject(macGroup);
      const rawMax = rawBox.getSize(new THREE.Vector3());
      macGroup.scale.setScalar(TARGET_HEIGHT / Math.max(rawMax.x, rawMax.y, rawMax.z));

      // 2. Centre, then shift the Mac into the left quarter of the frame
      const box    = new THREE.Box3().setFromObject(macGroup);
      const center = box.getCenter(new THREE.Vector3());
      macGroup.position.sub(center);

      // 3. Fit camera (camera stays on-axis)
      const size   = box.getSize(new THREE.Vector3());
      const fovRad = camera.fov * (Math.PI / 180);
      // Smaller multiplier = camera closer = Mac appears larger on screen.
      const camZ   = (size.y / (2 * Math.tan(fovRad / 2))) * 1.52;
      camera.position.set(0, 0, camZ);
      camera.near  = camZ * 0.001;
      camera.far   = camZ * 20;
      camera.updateProjectionMatrix();

      // Shift the Mac left and slightly down.
      const halfVisibleW = camZ * Math.tan(fovRad / 2); // half-height of view in world units
      macGroup.position.x -= halfVisibleW * 0.865;
      macGroup.position.y -= halfVisibleW * 0.08; // push toward the bottom

      // 4. Disable per-material tone-mapping so OutputPass applies it once
      macGroup.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => { m.toneMapped = false; });
      });

      // 5. Replace screen material ("Black.4") — blue tinted, HDR emissive
      macGroup.traverse((child) => {
        if (!child.isMesh) return;
        const mats    = Array.isArray(child.material) ? child.material : [child.material];
        const indices = mats.reduce((a, m, i) => m.name === 'Black.4' ? [...a, i] : a, []);
        if (indices.length === 0) return;

        screenMesh = child;

        // ── Rebuild screen geometry with many subdivisions ────────────
        // The original mesh is a 2-triangle quad over a slightly curved
        // CRT surface.  The single diagonal seam causes visible UV fold.
        // Strategy:
        //   1. Find the 4 UV-corner vertices in the original geometry.
        //   2. Build a 24×16 subdivided PlaneGeometry whose vertex XYZ
        //      positions are bilinearly interpolated from those 4 corners.
        //   3. Remap UVs to [0,1] directly — no offset/repeat needed.
        {
          const posAttr = child.geometry.attributes.position;
          const uvAttr  = child.geometry.attributes.uv;

          // UV extent of this mesh within the shared atlas
          let minU =  Infinity, maxU = -Infinity;
          let minV =  Infinity, maxV = -Infinity;
          for (let i = 0; i < uvAttr.count; i++) {
            const u = uvAttr.getX(i), v = uvAttr.getY(i);
            if (u < minU) minU = u; if (u > maxU) maxU = u;
            if (v < minV) minV = v; if (v > maxV) maxV = v;
          }
          const rangeU = maxU - minU, rangeV = maxV - minV;
          // Store for raycasting (UVs are now 0-1 so range = 1, offset = 0)
          screenUvBounds = { minU: 0, minV: 0, rangeU: 1, rangeV: 1 };

          // Find the vertex closest to each of the 4 UV corners
          function cornerVert(tu, tv) {
            let best = Infinity, bx = 0, by = 0, bz = 0;
            for (let i = 0; i < uvAttr.count; i++) {
              const du = uvAttr.getX(i) - tu, dv = uvAttr.getY(i) - tv;
              const d2 = du * du + dv * dv;
              if (d2 < best) {
                best = d2;
                bx = posAttr.getX(i);
                by = posAttr.getY(i);
                bz = posAttr.getZ(i);
              }
            }
            return { x: bx, y: by, z: bz };
          }
          const c00 = cornerVert(minU, minV); // UV (0,0) → bottom-left in atlas
          const c10 = cornerVert(maxU, minV); // UV (1,0) → bottom-right
          const c01 = cornerVert(minU, maxV); // UV (0,1) → top-left
          const c11 = cornerVert(maxU, maxV); // UV (1,1) → top-right

          // Subdivided plane: 24 × 16 segments = 24×16 quads = 768 triangles
          const SEGS_X = 24, SEGS_Y = 16;
          const subGeo = new THREE.PlaneGeometry(1, 1, SEGS_X, SEGS_Y);
          const subPos = subGeo.attributes.position;
          const subUV  = subGeo.attributes.uv;

          for (let i = 0; i < subPos.count; i++) {
            const u = subUV.getX(i); // 0 → 1
            const v = subUV.getY(i); // 0 → 1
            // Bilinear interpolation across the 4 3-D corners
            const x = c00.x*(1-u)*(1-v) + c10.x*u*(1-v) + c01.x*(1-u)*v + c11.x*u*v;
            const y = c00.y*(1-u)*(1-v) + c10.y*u*(1-v) + c01.y*(1-u)*v + c11.y*u*v;
            const z = c00.z*(1-u)*(1-v) + c10.z*u*(1-v) + c01.z*(1-u)*v + c11.z*u*v;
            subPos.setXYZ(i, x, y, z);
          }
          subPos.needsUpdate = true;
          subGeo.computeVertexNormals();

          child.geometry = subGeo;

          // UVs are already [0,1] — no texture transform required
          screenTexture.offset.set(0, 0);
          screenTexture.repeat.set(1, 1);
        }

          screenMat = new THREE.MeshStandardMaterial({
            map:               screenTexture,
            // Blue-grey phosphor tint on diffuse.  Black pixels in the texture
            // multiply to zero no matter what this colour is, so the bezel border
            // (black pixels in screenCanvas) stays black under all lighting.
            // The diffuse contribution from white game pixels adds to the emissive
            // and is needed to push luminance above the bloom threshold.
            color:             new THREE.Color(0.75, 0.78, 0.86),
            emissiveMap:       screenTexture,
            emissive:          new THREE.Color(0.45, 0.65, 1.0),
            emissiveIntensity: 0,   // starts at 0; fades in via update loop
            roughness:         0.05,
            metalness:         0.0,
            toneMapped:        false,
          });

        if (Array.isArray(child.material)) {
          child.material = child.material.map((m, i) => indices.includes(i) ? screenMat : m);
        } else {
          child.material = screenMat;
        }
      });

      // 6. Initial pose
      macGroup.rotation.x = 0.04;
      macGroup.rotation.y = targetRotY;
      currentRotY         = targetRotY;
      onScroll();

      scene.add(macGroup);
      modelReady = true;
      game.start();
    },
    undefined,
    (err) => console.error('GLTFLoader error:', err),
  );

  // ── Scroll → rotation ─────────────────────────────────────────────
  function onScroll() {
    const sectionTop = sectionEl.offsetTop;
    const scrollTop  = scrollContainer.scrollTop;
    // Use the section's CSS layout height (540px), not window.innerHeight
    // (which is the visual viewport height and doesn't match after zoom).
    const vh         = sectionEl.offsetHeight || 540;
    const norm       = (scrollTop - sectionTop) / vh;
    const clamped    = Math.max(-1, Math.min(1, norm));
    targetRotY       = REST_ROT_Y + clamped * (Math.PI / 2.6);
  }

  scrollContainer.addEventListener('scroll', onScroll, { passive: true });

  // ── Pointer → explosion ───────────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const mouse     = new THREE.Vector2();

  function fireAtNorm(nx, ny) {
    // nx, ny already normalised to [0,1] within the canvas.
    if (!screenMesh || !screenUvBounds) return;
    mouse.x =  nx * 2 - 1;
    mouse.y = -(ny * 2 - 1);

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(screenMesh, false);
    if (hits.length === 0 || !hits[0].uv) return;

    const { uv } = hits[0];
    const { minU, minV, rangeU, rangeV } = screenUvBounds;
    game.addExplosion((uv.x - minU) / rangeU * GAME_W,
                      (1 - (uv.y - minV) / rangeV) * GAME_H);
  }

  canvas.addEventListener('click', (e) => {
    // offsetX/Y are in visual (post-zoom) pixels relative to the canvas.
    // canvas.offsetWidth/Height are in layout (pre-zoom) CSS pixels.
    // Multiplying layout dims by zoom gives visual dims → matching units.
    const zoom = parseFloat(document.documentElement.style.zoom) || 1;
    const vw   = canvas.offsetWidth  * zoom;
    const vh   = canvas.offsetHeight * zoom;
    fireAtNorm(e.offsetX / vw, e.offsetY / vh);
  });
  // Touch: passive touchstart just records the start position so we can
  // distinguish a tap (fire) from a swipe (navigate to next section).
  // NOT calling preventDefault() here lets the scroll-container receive
  // the touch and handle vertical swipes normally.
  let _touchStartX = 0, _touchStartY = 0;

  canvas.addEventListener('touchstart', (e) => {
    _touchStartX = e.touches[0].clientX;
    _touchStartY = e.touches[0].clientY;
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    const t  = e.changedTouches[0];
    // Ignore if the finger moved more than 20px — it was a swipe, not a tap
    if (Math.abs(t.clientX - _touchStartX) > 20 ||
        Math.abs(t.clientY - _touchStartY) > 20) return;

    const zoom = parseFloat(document.documentElement.style.zoom) || 1;
    const rect = canvas.getBoundingClientRect();
    const vw   = rect.width  * zoom;
    const vh   = rect.height * zoom;
    fireAtNorm((t.clientX - rect.left * zoom) / vw,
               (t.clientY - rect.top  * zoom) / vh);
  }, { passive: true });

  // ── Resize ────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    const { w, h } = sectionSize();
    camera.aspect  = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
    _coverBg();
  });

  // ── Per-frame update ──────────────────────────────────────────────
  return {
    update(time) {
      const dt = lastTime ? Math.min(time - lastTime, 100) : 0;
      lastTime = time;

      if (modelReady && macGroup) {
        currentRotY += (targetRotY - currentRotY) * 0.055;
        // Idle sway — always active, same frequency/amplitude as the About model
        macGroup.rotation.y = currentRotY + Math.sin(time * 0.0002) * 0.08;

        // Fade emissive in slowly so bloom eases in rather than popping
        if (screenMat && emissiveCurrent < SCREEN_EMISSIVE_TARGET) {
          emissiveCurrent += (SCREEN_EMISSIVE_TARGET - emissiveCurrent) * 0.04;
          screenMat.emissiveIntensity = emissiveCurrent;
        }
      }

      game.update(dt);
      game.render();

      // Composite game canvas into screen wrapper: black bezel + inner content
      screenCtx.fillStyle = '#000000';
      screenCtx.fillRect(0, 0, GAME_W, GAME_H);
      screenCtx.drawImage(
        gameCanvas,
        SCREEN_BORDER, SCREEN_BORDER,
        GAME_W - SCREEN_BORDER * 2, GAME_H - SCREEN_BORDER * 2,
      );

      screenTexture.needsUpdate = true;
      composer.render();          // ← EffectComposer instead of renderer.render
    },
  };
}
