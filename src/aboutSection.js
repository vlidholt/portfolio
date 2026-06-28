/**
 * About section — Three.js scene rendering a full-figure 3-D model of Viktor.
 *
 * The canvas is transparent (alpha: true) so the section's CSS gradient
 * background shows through wherever the model isn't.  No EffectComposer /
 * bloom — plain renderer.render() is enough here.
 *
 * Layout: model fills the left column; text content lives in the right column
 * as plain HTML, so this module only concerns itself with the canvas.
 */

import * as THREE from 'three';
import { GLTFLoader }     from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import viktorUrl          from '../assets/3d/viktor.glb?url';
import mugRedUrl          from '../assets/3d/mug-red.glb?url';
import coinUrl            from '../assets/3d/coin.glb?url';
import dashUrl            from '../assets/3d/dash.glb?url';
import spaceshipPinkUrl   from '../assets/3d/spaceship-pink.glb?url';
import spaceshipYellowUrl from '../assets/3d/spaceship-yellow.glb?url';
import houseplantUrl      from '../assets/3d/houseplant.glb?url';
import flowerPotUrl       from '../assets/3d/flower-pot-licence.glb?url';
import gameboyUrl         from '../assets/3d/gameboy-license.glb?url';
import crystalUrl         from '../assets/3d/crystal.glb?url';
import rubikUrl           from '../assets/3d/rubik-license.glb?url';
import diceUrl            from '../assets/3d/dice-license.glb?url';

const ORBIT_SIZE = 0.26; // target bounding-box max dimension (world units)

// Unique models to preload
const ORBIT_URLS = [mugRedUrl, coinUrl, dashUrl, spaceshipPinkUrl, spaceshipYellowUrl, houseplantUrl, diceUrl, flowerPotUrl, gameboyUrl, crystalUrl, rubikUrl];

// Two concentric rings.  models array = one slot per orbit instance in that ring.
const RING1 = {
  models:    [mugRedUrl, coinUrl, dashUrl, spaceshipPinkUrl, rubikUrl, coinUrl, houseplantUrl, diceUrl, gameboyUrl],
  radius:    1.05,   // tight inner ring
  tilt:      0.42,   // steeper tilt — more vertical arc
  baseSpeed: 0.00044, // rad/ms  ≈ 14.3 s / orbit
};
const RING2 = {
  // dash, coin, dice doubled; interleaved so no two same models are adjacent
  models:    [coinUrl, dashUrl, diceUrl, coinUrl, mugRedUrl, dashUrl, spaceshipYellowUrl, coinUrl, diceUrl, rubikUrl, crystalUrl, coinUrl, flowerPotUrl],
  radius:    1.82,   // outer ring — crosses into the text column
  tilt:      0.22,   // shallower tilt — more horizontal sweep
  baseSpeed: 0.00022, // rad/ms  ≈ 28.6 s / orbit (slower, feels more stately)
};

// Negative Y = faces left (inward, toward the text column on the left)
const REST_ROT_Y = -0.68;

export function initAbout(sectionEl, scrollContainer) {
  const canvas = sectionEl.querySelector('#about-canvas');
  if (!canvas) return { update() {} };

  // ── Size helpers ──────────────────────────────────────────────────
  // Canvas now spans the full section (100vw × 100vh), so we measure
  // the section element.  Falls back to window dimensions before CSS layout.
  function sectionSize() {
    const w = sectionEl.clientWidth  || window.innerWidth;
    const h = sectionEl.clientHeight || window.innerHeight;
    return { w, h };
  }

  const { w, h } = sectionSize();
  let sized = w > 0;

  // ── Renderer ──────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  canvas.style.touchAction = 'pan-y'; // allow vertical swipe-scroll; Three.js sets none
  renderer.outputColorSpace    = THREE.SRGBColorSpace;
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // ── Scene & camera ────────────────────────────────────────────────
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 1000);
  camera.position.set(0, 0, 5);

  // ── Lighting ──────────────────────────────────────────────────────
  // Warm key from upper-right front; blue-grey fill from left; cool rim
  // from upper-back to separate the figure from the dark background.
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));

  const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.6);
  keyLight.position.set(2, 3, 3);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x8090d0, 0.5);
  fillLight.position.set(-3, 0, 1);
  scene.add(fillLight);

  // Two back-rim lights that cycle between warm and cool — one per shoulder.
  const rimCool = new THREE.DirectionalLight(0x4466ff, 0.6);
  rimCool.position.set(-1.5, 2, -3);
  scene.add(rimCool);

  const rimWarm = new THREE.DirectionalLight(0xff6622, 0.4);
  rimWarm.position.set(1.5, 1.5, -3);
  scene.add(rimWarm);

  // ── Blob shadow — radial gradient texture on a flat plane ─────────
  // Much softer than shadow maps; fully art-directable via the gradient stops.
  const blobCanvas = document.createElement('canvas');
  blobCanvas.width = blobCanvas.height = 256;
  const blobCtx = blobCanvas.getContext('2d');
  const grad = blobCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0,    'rgba(0,0,0,0.55)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.20)');
  grad.addColorStop(1,    'rgba(0,0,0,0)');
  blobCtx.fillStyle = grad;
  blobCtx.fillRect(0, 0, 256, 256);

  const blobTex = new THREE.CanvasTexture(blobCanvas);
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  // Scale to an ellipse: wide in X (left/right), narrow in Z (depth)
  shadowPlane.scale.set(1.4, 1, 0.45);
  scene.add(shadowPlane);

  // ── State ─────────────────────────────────────────────────────────
  let viktorGroup  = null;
  let modelReady   = false;
  let targetRotY   = REST_ROT_Y;
  let currentRotY  = REST_ROT_Y;
  let lastTime     = 0;

  // Orbit center tracks Viktor's world position (set once model + camera are fitted)
  const orbitCenter = new THREE.Vector3(0, 0, 0);

  // Each entry: { group, angle, speed, radius, tilt, spinSpeed }
  const orbitObjects = [];

  // ── KHR_materials_pbrSpecularGlossiness plugin ────────────────────
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

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
    viktorUrl,
    (gltf) => {
      viktorGroup = gltf.scene;

      // Force matrix update before measuring (needed for skinned meshes)
      viktorGroup.updateMatrixWorld(true);

      const rawBox  = new THREE.Box3().setFromObject(viktorGroup);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      if (rawSize.y === 0) {
        console.warn('[about] bounding box height is 0 — model may have no geometry');
      }

      const TARGET_HEIGHT = 2.81;   // 2.16 × 1.3 — 30% larger
      const scale = rawSize.y > 0 ? TARGET_HEIGHT / rawSize.y : 1;
      viktorGroup.scale.setScalar(scale);
      viktorGroup.updateMatrixWorld(true);

      // Centre on origin
      const box    = new THREE.Box3().setFromObject(viktorGroup);
      const center = box.getCenter(new THREE.Vector3());
      viktorGroup.position.sub(center);

      // Fit camera so the full figure + padding is visible.
      // Smaller multiplier = camera closer = model appears larger on screen.
      // (Apparent height ∝ 1/multiplier; TARGET_HEIGHT alone has no effect.)
      const size   = box.getSize(new THREE.Vector3());
      const fovRad = camera.fov * (Math.PI / 180);
      const fitZ   = (size.y / (2 * Math.tan(fovRad / 2))) * 1.28;
      camera.position.set(0, 0, fitZ);
      camera.near  = fitZ * 0.001;
      camera.far   = fitZ * 20;
      // Use full-section aspect ratio now that canvas spans the whole section
      const { w: curW, h: curH } = sectionSize();
      camera.aspect = curW / curH;
      camera.updateProjectionMatrix();
      // Shift Viktor: slightly right of centre, feet near the bottom.
      // halfVisW = half the total visible width at z=0.
      const halfVisW = Math.tan(fovRad / 2) * fitZ * camera.aspect;
      const halfVisH = Math.tan(fovRad / 2) * fitZ;
      const xOffset  = halfVisW * 0.40; // a bit right of centre
      // Feet rest ~10 % of the visible height above the bottom edge
      const yOffset  = size.y / 2 - halfVisH * 0.90;
      viktorGroup.position.x += xOffset;
      viktorGroup.position.y += yOffset;
      shadowPlane.position.x  = xOffset;
      // Position blob shadow just at the model's feet
      shadowPlane.position.y  = yOffset - size.y / 2 + 0.01;
      // Orbit objects circle around Viktor's horizontal position, vertical centre
      orbitCenter.set(xOffset, 0, 0);

      viktorGroup.rotation.y = REST_ROT_Y;
      currentRotY = REST_ROT_Y;
      onScroll();
      scene.add(viktorGroup);
      modelReady = true;
    },
    undefined,
    (err) => console.error('[about] GLTFLoader error:', err),
  );

  // ── Orbit props ───────────────────────────────────────────────────
  const orbitLoader = new GLTFLoader();
  orbitLoader.setMeshoptDecoder(MeshoptDecoder);

  /** World position on the tilted orbit ellipse, centred on Viktor. */
  function orbitPosAt(angle, radius, tilt) {
    return new THREE.Vector3(
      orbitCenter.x + Math.cos(angle) * radius,
      orbitCenter.y - Math.sin(angle) * Math.sin(tilt) * radius,
      orbitCenter.z + Math.sin(angle) * Math.cos(tilt) * radius,
    );
  }

  /** Deterministic hash → float in [0, 1). No Math.random() needed. */
  function fhash(i, salt) {
    return ((i * 2654435761 + salt * 2246822519) >>> 0) / 4294967296;
  }

  // Cache of normalised pivot groups, keyed by URL.
  const modelCache  = new Map();
  let   loadsPending = ORBIT_URLS.length;

  /**
   * Called once every unique model has loaded.
   * Clones from the cache to populate both rings.
   */
  function buildRings() {
    let diceCount = 0; // separate counter so each die gets unique spin axes

    [RING1, RING2].forEach((ring, ringIdx) => {
      const n = ring.models.length;
      ring.models.forEach((url, slotIdx) => {
        const inst  = modelCache.get(url).clone(true);
        const gi    = ringIdx * 100 + slotIdx; // unique key per slot

        const isDice = url === diceUrl || url === rubikUrl;

        // Per-model size overrides
        if (isDice)                    inst.scale.setScalar(0.68);
        if (url === coinUrl)           inst.scale.setScalar(0.50);
        if (url === spaceshipPinkUrl)   inst.scale.setScalar(2.00);
        if (url === spaceshipYellowUrl) inst.scale.setScalar(1.50);
        if (url === houseplantUrl)     inst.scale.setScalar(2.25);
        if (url === flowerPotUrl)      inst.scale.setScalar(2.00);
        if (url === rubikUrl)          inst.scale.setScalar(0.50);

        // Evenly spread initial angles within each ring
        const angle = (slotIdx / n) * Math.PI * 2;

        // All slots in a ring share the same speed
        const speed = ring.baseSpeed;

        // Subtle radius variation: ±8 %
        const radius = ring.radius * (0.92 + fhash(gi, 2) * 0.16);

        // Subtle tilt variation: ±0.10 rad
        const tilt = ring.tilt + (fhash(gi, 3) - 0.5) * 0.20;

        // Self-spin axes.  Default: Y only.  Dice: full tumble.  Pink spaceship: gentle tilt.
        let spinX = 0, spinY = 0.0004 + fhash(gi, 4) * 0.0008, spinZ = 0;
        if (url === coinUrl) {
          spinY = (0.0008 + fhash(gi, 4) * 0.0016); // 2× the default range
        } else if (isDice) {
          const dc  = diceCount++;
          const sign = (s) => fhash(dc, s) > 0.5 ? 1 : -1;
          spinX = (0.0007 + fhash(dc, 20) * 0.0009) * sign(21);
          spinY = (0.0006 + fhash(dc, 22) * 0.0010) * sign(23);
          spinZ = (0.0005 + fhash(dc, 24) * 0.0008) * sign(25);
        } else if (url === spaceshipPinkUrl) {
          // Slow banking roll — tilted axis gives a drifting, flying feel
          spinX =  0.00018;
          spinZ = -0.00012;
        }

        // Initial rotation phase — only randomise axes the item actually spins on;
        // items that only spin on Y start upright on X and Z to avoid flipping.
        const initX = spinX !== 0 ? fhash(gi, 30) * Math.PI * 2 : 0;
        const initY = fhash(gi, 31) * Math.PI * 2;
        const initZ = spinZ !== 0 ? fhash(gi, 32) * Math.PI * 2 : 0;

        // Sway — gentle sin oscillation on X and Z so items drift organically
        const swayAmpX  = 0.04 + fhash(gi, 40) * 0.07; // 0.04 – 0.11 rad
        const swayAmpZ  = 0.04 + fhash(gi, 42) * 0.07;
        const swayFreq  = 0.00035 + fhash(gi, 44) * 0.00045; // slow, ~7 – 18 s period
        const swayPhsX  = fhash(gi, 45) * Math.PI * 2;
        const swayPhsZ  = fhash(gi, 46) * Math.PI * 2;

        inst.rotation.set(initX, initY, initZ);
        inst.position.copy(orbitPosAt(angle, radius, tilt));
        orbitObjects.push({
          group: inst, angle, speed, radius, tilt,
          spinX, spinY, spinZ,
          rotX: initX, rotY: initY, rotZ: initZ, // accumulated spin (separate from sway)
          swayAmpX, swayAmpZ, swayFreq, swayPhsX, swayPhsZ,
        });
        scene.add(inst);
      });
    });
  }

  // Preload each unique model; kick off buildRings when all are ready.
  ORBIT_URLS.forEach((url) => {
    orbitLoader.load(
      url,
      (gltf) => {
        const raw = gltf.scene;

        // Leaf/petal meshes in plant models are single-sided by default — fix that.
        if (url === houseplantUrl) {
          raw.traverse((node) => {
            if (node.isMesh) {
              const mats = Array.isArray(node.material) ? node.material : [node.material];
              mats.forEach((m) => { if (m) m.side = THREE.DoubleSide; });
            }
          });
        }

        // Normalise size to ORBIT_SIZE
        raw.updateMatrixWorld(true);
        const rawBox  = new THREE.Box3().setFromObject(raw);
        const rawSize = rawBox.getSize(new THREE.Vector3());
        const maxDim  = Math.max(rawSize.x, rawSize.y, rawSize.z);
        if (maxDim > 0) raw.scale.setScalar(ORBIT_SIZE / maxDim);
        raw.updateMatrixWorld(true);

        // Wrap in a pivot so the group's origin = geometry centre
        const centreBox = new THREE.Box3().setFromObject(raw);
        const centre    = centreBox.getCenter(new THREE.Vector3());
        raw.position.sub(centre);
        const pivot = new THREE.Group();
        pivot.add(raw);

        modelCache.set(url, pivot);
        loadsPending--;
        if (loadsPending === 0) buildRings();
      },
      undefined,
      (err) => console.warn('[about] orbit asset failed:', url, err),
    );
  });

  // ── Scroll → rotation (mirrors earlyGames.js behaviour) ──────────
  function onScroll() {
    // Subtract scrollContainer.offsetTop so sectionTop is relative to the
    // scroll container, not the body.  In portrait mode the flex-centered body
    // pushes the scroll container down ~769 px, which would otherwise make
    // sectionTop non-zero even when the section is at scroll position 0.
    const sectionTop = sectionEl.offsetTop - scrollContainer.offsetTop;
    const scrollTop  = scrollContainer.scrollTop;
    const vh         = sectionEl.offsetHeight || 540;
    const norm       = (scrollTop - sectionTop) / vh;
    const clamped    = Math.max(-1, Math.min(1, norm));
    targetRotY       = REST_ROT_Y - clamped * (Math.PI / 2.6);
  }

  scrollContainer.addEventListener('scroll', onScroll, { passive: true });

  // ── Resize ────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    const { w, h } = sectionSize();
    camera.aspect  = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    // Re-evaluate rotation after orientation change — sectionEl.offsetTop
    // (and scrollContainer.offsetTop) change when the flex layout reflows.
    onScroll();
  });

  // ── Per-frame update ──────────────────────────────────────────────
  return {
    update(time) {
      const dt = lastTime ? Math.min(time - lastTime, 100) : 16;
      lastTime = time;

      // On the first few frames the CSS has laid out — re-size once.
      if (!sized) {
        const { w: fw, h: fh } = sectionSize();
        if (fw > 0) {
          renderer.setSize(fw, fh, false);
          camera.aspect = fw / fh;
          camera.updateProjectionMatrix();
          sized = true;
        }
      }

      // Animate rim lights: slow warm ↔ cool cycle
      const cycle = (Math.sin(time * 0.00035) + 1) / 2; // 0 → 1
      rimCool.intensity = 0.35 + cycle * 0.35;
      rimWarm.intensity = 0.15 + (1 - cycle) * 0.35;
      rimCool.color.setHSL(0.62 + cycle * 0.06, 0.85, 0.65);
      rimWarm.color.setHSL(0.07 - cycle * 0.03, 0.90, 0.60);

      if (modelReady && viktorGroup) {
        currentRotY += (targetRotY - currentRotY) * 0.055;
        viktorGroup.rotation.y = currentRotY + Math.sin(time * 0.0008) * 0.08;
      }

      // Orbit animation — advance angle, reposition, spin + sway
      for (const obj of orbitObjects) {
        obj.angle  += obj.speed  * dt;
        obj.rotX   += obj.spinX  * dt;
        obj.rotY   += obj.spinY  * dt;
        obj.rotZ   += obj.spinZ  * dt;

        // Additive sin sway on X and Z — gives a gentle organic drift
        const sX = obj.swayAmpX * Math.sin(time * obj.swayFreq          + obj.swayPhsX);
        const sZ = obj.swayAmpZ * Math.sin(time * obj.swayFreq * 1.37   + obj.swayPhsZ);

        obj.group.position.copy(orbitPosAt(obj.angle, obj.radius, obj.tilt));
        obj.group.rotation.x = obj.rotX + sX;
        obj.group.rotation.y = obj.rotY;
        obj.group.rotation.z = obj.rotZ + sZ;
      }

      renderer.render(scene, camera);
    },
  };
}
