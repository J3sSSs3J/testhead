// ============================================================================
// ametrades — scena 3D + navigazione
// Vanilla JS + Three.js via CDN. La scena è il centro visivo: il modello si
// riposiziona a ogni sezione mentre gli overlay di contenuto entrano in dissolvenza.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==================== EASING ====================
const Easing = {
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

// ==================== STATO ANIMAZIONE MODELLO ====================
class AnimationStateManager {
  constructor() {
    this.current = { position: new THREE.Vector3(0, 1.26, 0), rotation: 0, cameraZ: 3 };
    this.target = { position: new THREE.Vector3(0, 1.26, 0), rotation: 0, cameraZ: 3 };
    this.transition = { isAnimating: false, progress: 0, duration: 1.2, startTime: 0, easing: Easing.easeInOutCubic };

    // Una posa dedicata per ogni sezione navigabile.
    this.sections = {
      home:      { position: new THREE.Vector3(0, 1.26, 0),  rotation: 0,     cameraZ: 3.0 },
      about:     { position: new THREE.Vector3(1.7, 1.2, 0),  rotation: -0.95, cameraZ: 3.1 },
      projects:  { position: new THREE.Vector3(-1.7, 1.2, 0), rotation: 0.95,  cameraZ: 3.1 },
      portfolio: { position: new THREE.Vector3(0, 1.5, 0),    rotation: 0,     cameraZ: 4.4 },
    };
  }

  transitionTo(section) {
    const cfg = this.sections[section];
    if (!cfg) return;
    this.target.position.copy(cfg.position);
    this.target.rotation = cfg.rotation;
    this.target.cameraZ = cfg.cameraZ;
    this.transition.isAnimating = true;
    this.transition.progress = 0;
    this.transition.startTime = performance.now();
  }

  update() {
    if (!this.transition.isAnimating) return;
    const elapsed = (performance.now() - this.transition.startTime) / 1000;
    this.transition.progress = Math.min(elapsed / this.transition.duration, 1);

    const smooth = 0.08;
    this.current.position.lerp(this.target.position, smooth);
    this.current.rotation = this.lerpAngle(this.current.rotation, this.target.rotation, smooth);
    this.current.cameraZ = THREE.MathUtils.lerp(this.current.cameraZ, this.target.cameraZ, smooth);

    const close =
      this.current.position.distanceTo(this.target.position) < 0.01 &&
      Math.abs(this.current.rotation - this.target.rotation) < 0.01 &&
      Math.abs(this.current.cameraZ - this.target.cameraZ) < 0.01;

    if (this.transition.progress >= 0.98 || close) {
      this.transition.isAnimating = false;
      this.current.position.copy(this.target.position);
      this.current.rotation = this.target.rotation;
      this.current.cameraZ = this.target.cameraZ;
    }
  }

  lerpAngle(from, to, t) {
    let diff = to - from;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return from + diff * t;
  }
}

// ==================== SCENA / CAMERA / RENDERER ====================
function createScene() {
  const scene = new THREE.Scene();
  scene.background = null;
  return scene;
}

function createCamera() {
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.5, 3);
  return camera;
}

function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);
  document.body.insertBefore(renderer.domElement, document.body.firstChild);
  return renderer;
}

function setupLighting(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 1.8));

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(5, 5, 5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xdfe6f2, 1.1);
  fill.position.set(-8, 3, 2);
  scene.add(fill);

  // Rim light color ottone: firma cromatica del brand sui bordi del modello.
  const rim = new THREE.DirectionalLight(0xc9a25e, 1.4);
  rim.position.set(6, 2, -6);
  scene.add(rim);
}

function loadModel(scene) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      '/models/prometheus.glb',
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        model.scale.multiplyScalar(2.38 / maxDim);
        model.position.y = 0;

        model.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.color.set(0x1b1a17);
            child.material.metalness = 0.45;
            child.material.roughness = 0.6;
          }
        });

        scene.add(model);
        resolve(model);
      },
      undefined,
      (error) => reject(error)
    );
  });
}

// ==================== LOOP DI RENDERING ====================
function setupAnimationLoop(renderer, scene, camera, model, state) {
  // Rotazione idle continua ("il corpo che gira"), disattivata con reduced-motion.
  const SPIN = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.2; // rad/s
  let last = performance.now();
  let idle = 0;

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    idle += SPIN * dt;

    state.update();
    if (model) {
      model.position.copy(state.current.position);
      model.rotation.y = state.current.rotation + idle;
    }
    camera.position.z += (state.current.cameraZ - camera.position.z) * 0.06;
    renderer.render(scene, camera);
  }
  animate();
}

// ==================== NAVIGAZIONE ====================
function setupNavigation(state) {
  const navLinks = Array.from(document.querySelectorAll('.nav-links a[data-section]'));
  const panels = Array.from(document.querySelectorAll('.panel'));
  const hero = document.getElementById('home');

  function activate(section) {
    if (!state.sections[section]) return;
    state.transitionTo(section);

    navLinks.forEach((a) => a.classList.toggle('is-active', a.dataset.section === section));
    panels.forEach((p) => p.classList.toggle('is-open', p.id === `content-${section}`));
    if (hero) hero.classList.toggle('is-hidden', section !== 'home');
  }

  // Navigazione delegata: intercetta ogni elemento con data-section (nav, brand,
  // CTA della hero) — funziona anche per elementi mostrati/aggiornati dopo l'avvio.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-section]');
    if (!el) return;
    e.preventDefault();
    activate(el.dataset.section);
  });

  return activate;
}

function onWindowResize(camera, renderer) {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });
}

// ==================== INIT ====================
async function init() {
  const scene = createScene();
  const camera = createCamera();
  const renderer = createRenderer();
  setupLighting(scene);

  let model = null;
  try {
    model = await loadModel(scene);
  } catch (error) {
    console.error('Modello 3D non caricato:', error);
  }

  const state = new AnimationStateManager();
  setupAnimationLoop(renderer, scene, camera, model, state);
  onWindowResize(camera, renderer);

  const activate = setupNavigation(state);
  activate('home');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
