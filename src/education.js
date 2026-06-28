/**
 * Education section — Three.js scene with a Macintosh 2 model.
 *
 * The model sits on the RIGHT side of the screen, rotated inward (negative Y).
 * The renderer is transparent (alpha: true) so the CSS background shows through.
 * No game, no bloom — plain renderer.render().
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import macintosh2Url      from '../assets/3d/macintosh-2.glb?url';
import mutantDungeonUrl   from '../assets/video/mutant-dungeon-gameplay.mp4?url';

const TARGET_HEIGHT = 0.80;
const REST_ROT_Y    = -0.85; // facing left/inward (mirror of Early Games)

export function initEducation(sectionEl, scrollContainer) {

  const canvas = document.getElementById('education-canvas');

  function sectionSize() {
    return { w: sectionEl.clientWidth  || window.innerWidth,
             h: sectionEl.clientHeight || window.innerHeight };
  }

  const { w, h } = sectionSize();

  // Transparent renderer — CSS section background shows through
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace    = THREE.SRGBColorSpace;
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, w / h, 0.001, 5000);
  camera.position.set(0, 0, 5);

  // ── Lighting ────────────────────────────────────────────────────────
  // Low ambient so the key/rim lights create visible contrast on the Mac body.
  scene.add(new THREE.AmbientLight(0xffffff, 0.30));

  const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.80);
  keyLight.position.set(-2, 3, 2); // key from the left (model is on the right)
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x8090d0, 0.35);
  fillLight.position.set(2, 0, 2);
  scene.add(fillLight);

  // Two animated rim lights from behind — separate the Mac from the dark bg
  const rimCool = new THREE.DirectionalLight(0x4466ff, 0.7);
  rimCool.position.set(1.5, 2, -3);
  scene.add(rimCool);

  const rimWarm = new THREE.DirectionalLight(0xff6622, 0.4);
  rimWarm.position.set(-1.5, 1.5, -3);
  scene.add(rimWarm);

  // ── Video texture (Mutant Dungeon gameplay) ──────────────────────────
  const video          = document.createElement('video');
  video.src            = mutantDungeonUrl;
  video.loop           = true;
  video.muted          = true;
  video.playsInline    = true;
  video.crossOrigin    = 'anonymous';
  video.play().catch(() => {}); // start immediately; retry on section visible

  const videoTexture        = new THREE.VideoTexture(video);
  videoTexture.colorSpace   = THREE.SRGBColorSpace;
  videoTexture.flipY        = false; // model UVs are already top-to-bottom

  // Also retry play when the section scrolls into view
  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) video.play().catch(() => {});
  }, { threshold: 0.1 }).observe(sectionEl);

  // ── State ────────────────────────────────────────────────────────────
  let macGroup   = null;
  let targetRotY = REST_ROT_Y - Math.PI / 3;
  let currentRotY = targetRotY;
  let modelReady  = false;
  let lastTime    = 0;

  // macintosh-2.glb uses EXT_meshopt_compression + KHR_materials_transmission.
  // The transmission extension is handled by overriding materials after load (see below).
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  // ── Load model ────────────────────────────────────────────────────
  loader.load(
    macintosh2Url,
    (gltf) => {
      macGroup = gltf.scene;

      // 1. Scale to TARGET_HEIGHT
      const rawBox = new THREE.Box3().setFromObject(macGroup);
      const rawMax = rawBox.getSize(new THREE.Vector3());
      macGroup.scale.setScalar(TARGET_HEIGHT / Math.max(rawMax.x, rawMax.y, rawMax.z));

      // 2. Centre
      const box    = new THREE.Box3().setFromObject(macGroup);
      const center = box.getCenter(new THREE.Vector3());
      macGroup.position.sub(center);

      // 3. Fit camera
      const size   = box.getSize(new THREE.Vector3());
      const fovRad = camera.fov * (Math.PI / 180);
      const camZ   = (size.y / (2 * Math.tan(fovRad / 2))) * 1.52;
      camera.position.set(0, 0, camZ);
      camera.near  = camZ * 0.001;
      camera.far   = camZ * 20;
      camera.updateProjectionMatrix();

      // Shift the Mac RIGHT and slightly down (mirror of Early Games)
      const halfVisibleW = camZ * Math.tan(fovRad / 2);
      macGroup.position.x += halfVisibleW * 1.05;
      macGroup.position.y -= halfVisibleW * 0.08;

      // 4. Replace screen material ("dark_grey") with the video texture.
      //    The model has TWO meshes with dark_grey:
      //    - "Apple Macintosh"     (2 mats: dark_beige + dark_grey) → the SCREEN
      //    - "Apple Macintosh.004" (4 mats: dark_grey + beiges)     → the disk drive slot
      //    We target only the 2-material mesh (the screen) and leave the rest untouched.
      const screenMat = new THREE.MeshStandardMaterial({
        map:               videoTexture,
        emissiveMap:       videoTexture,
        emissive:          new THREE.Color(1, 1, 1),
        emissiveIntensity: 0.6,
        roughness:         0.05,
        metalness:         0.0,
        toneMapped:        false,
      });

      macGroup.traverse((child) => {
        if (!child.isMesh) return;
        const mats    = Array.isArray(child.material) ? child.material : [child.material];
        const indices = mats.reduce((a, m, i) => m.name === 'dark_grey' ? [...a, i] : a, []);
        if (indices.length === 0) return;
        // Only the screen primitive — named "Apple_Macintosh_2" in Three.js.
        // "Apple_Macintosh004_1" is the disk-drive detail; leave it untouched.
        if (child.name !== 'Apple_Macintosh_2') return;

        child.material = Array.isArray(child.material)
          ? child.material.map((m, i) => indices.includes(i) ? screenMat : m)
          : screenMat;
      });

      // 5. Initial pose
      macGroup.rotation.x = 0.04;
      macGroup.rotation.y = targetRotY;
      currentRotY         = targetRotY;
      onScroll();

      scene.add(macGroup);
      modelReady = true;
    },
    undefined,
    (err) => console.error('GLTFLoader (education) error:', err),
  );

  // ── Scroll → rotation ─────────────────────────────────────────────
  function onScroll() {
    const sectionTop = sectionEl.offsetTop;
    const scrollTop  = scrollContainer.scrollTop;
    const vh         = sectionEl.offsetHeight || 540;
    const norm       = (scrollTop - sectionTop) / vh;
    const clamped    = Math.max(-1, Math.min(1, norm));
    // Mirror of Early Games: subtract instead of add
    targetRotY       = REST_ROT_Y - clamped * (Math.PI / 2.6);
  }

  scrollContainer.addEventListener('scroll', onScroll, { passive: true });

  // ── Resize ────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    const { w, h } = sectionSize();
    camera.aspect  = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  // ── Per-frame update ──────────────────────────────────────────────
  return {
    update(time) {
      lastTime = time;

      // Animate rim lights: slow warm ↔ cool cycle (same as About section)
      const cycle = (Math.sin(time * 0.00035) + 1) / 2;
      rimCool.intensity = 0.40 + cycle * 0.40;
      rimWarm.intensity = 0.10 + (1 - cycle) * 0.40;
      rimCool.color.setHSL(0.62 + cycle * 0.06, 0.85, 0.65);
      rimWarm.color.setHSL(0.07 - cycle * 0.03, 0.90, 0.60);

      if (modelReady && macGroup) {
        currentRotY += (targetRotY - currentRotY) * 0.055;
        macGroup.rotation.y = currentRotY + Math.sin(time * 0.0002) * 0.08;
      }
      renderer.render(scene, camera);
    },
  };
}
