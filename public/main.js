// ============================================================================
// ametrades — scena 3D + navigazione
// Vanilla JS + Three.js via CDN. La scena è il centro visivo: il modello si
// riposiziona a ogni sezione mentre gli overlay di contenuto entrano in dissolvenza.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Stato diagnostico ispezionabile dalla console: scrivi "ametradesDiag".
// Se risulta "undefined", il modulo non è partito (import di Three.js fallito).
window.ametradesDiag = { three: 'caricato', webgl: 'in verifica', modello: 'in attesa' };

// ==================== EASING ====================
const Easing = {
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

// Le pose delle sezioni sono calibrate su questo aspect (desktop 16:9).
const DESIGN_ASPECT = 16 / 9;

// ==================== STATO ANIMAZIONE MODELLO ====================
class AnimationStateManager {
  constructor() {
    this.current = { position: new THREE.Vector3(0, 1.26, 0), rotation: 0, cameraZ: 3 };
    this.start   = { position: new THREE.Vector3(0, 1.26, 0), rotation: 0, cameraZ: 3 };
    this.target  = { position: new THREE.Vector3(0, 1.26, 0), rotation: 0, cameraZ: 3 };
    this.transition = { isAnimating: false, duration: 2.0, startTime: 0, easing: Easing.easeInOutCubic, rotationDelta: 0 };
    this.currentSection = null;

    // Una posa dedicata per ogni sezione navigabile. Nel Portfolio la testa si
    // sposta sul bordo destro, fuori dalla colonna dei dati, girata verso di essi.
    this.sections = {
      home:      { position: new THREE.Vector3(0, 1.26, 0),   rotation: 0,     cameraZ: 3.0 },
      about:     { position: new THREE.Vector3(1.7, 1.2, 0),  rotation: -0.95, cameraZ: 3.1 },
      projects:  { position: new THREE.Vector3(-1.7, 1.2, 0), rotation: 0.95,  cameraZ: 3.1 },
      portfolio: { position: new THREE.Vector3(2.6, 1.25, 0), rotation: -0.7,  cameraZ: 4.2 },
    };
  }

  // Adatta la posa al viewport: sotto il 16:9 di progetto la camera arretra
  // (sqrt: compromesso tra inquadratura orizzontale e verticale) e l'offset X
  // si riscala, così la testa mantiene la stessa posizione RELATIVA nel quadro
  // su qualsiasi schermo. A 16:9 entrambi i fattori valgono 1: desktop invariato.
  resolvePose(cfg) {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const zoomOut = Math.sqrt(Math.max(1, DESIGN_ASPECT / aspect));
    const cameraZ = cfg.cameraZ * zoomOut;
    const xScale = (cameraZ * aspect) / (cfg.cameraZ * DESIGN_ASPECT);
    const position = cfg.position.clone();
    position.x *= xScale;
    return { position, cameraZ };
  }

  transitionTo(section) {
    const cfg = this.sections[section];
    if (!cfg) return;
    this.currentSection = section;
    const pose = this.resolvePose(cfg);
    // Fotografa la posa attuale: anche interrompendo una transizione a metà,
    // la nuova riparte fluida da dove si trova il modello.
    this.start.position.copy(this.current.position);
    this.start.rotation = this.current.rotation;
    this.start.cameraZ = this.current.cameraZ;
    this.target.position.copy(pose.position);
    this.target.rotation = cfg.rotation;
    this.target.cameraZ = pose.cameraZ;
    this.transition.rotationDelta = this.shortestDelta(this.start.rotation, this.target.rotation);
    this.transition.isAnimating = true;
    this.transition.startTime = performance.now();
  }

  // Ricalcola la posa della sezione corrente per il nuovo viewport (resize,
  // rotazione dello schermo) raggiungendola con la transizione standard.
  refreshViewport() {
    if (this.currentSection) this.transitionTo(this.currentSection);
  }

  update() {
    if (!this.transition.isAnimating) return;
    const elapsed = (performance.now() - this.transition.startTime) / 1000;
    const t = Math.min(elapsed / this.transition.duration, 1);
    const k = this.transition.easing(t);

    this.current.position.lerpVectors(this.start.position, this.target.position, k);
    this.current.rotation = this.start.rotation + this.transition.rotationDelta * k;
    this.current.cameraZ = THREE.MathUtils.lerp(this.start.cameraZ, this.target.cameraZ, k);

    if (t >= 1) {
      this.transition.isAnimating = false;
      this.current.rotation = this.target.rotation;
    }
  }

  // Differenza angolare per la via più corta (evita giri completi inutili).
  shortestDelta(from, to) {
    let diff = to - from;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
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
            child.material.color.set(0x2b2823);
            child.material.metalness = 0.5;
            child.material.roughness = 0.55;
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
  // Oscillazione da fermo (±~3.5°, periodo ~10s): la testa resta viva nella posa
  // della sezione senza girare su sé stessa. Disattivata con reduced-motion.
  const SWAY = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.06; // rad

  function animate() {
    requestAnimationFrame(animate);
    state.update();
    if (model) {
      model.position.copy(state.current.position);
      model.rotation.y = state.current.rotation + SWAY * Math.sin(performance.now() * 0.0006);
    }
    camera.position.z = state.current.cameraZ;
    renderer.render(scene, camera);
  }
  animate();
}

// ==================== NAVIGAZIONE ====================
const SECTION_ORDER = ['home', 'about', 'projects', 'portfolio'];

function setupNavigation(state) {
  const navLinks = Array.from(document.querySelectorAll('.nav-links a[data-section]'));
  const panels = Array.from(document.querySelectorAll('.panel'));
  const hero = document.getElementById('home');
  let current = 'home';

  function activate(section) {
    if (!state.sections[section]) return;
    current = section;
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

  return { activate, getCurrent: () => current };
}

// ==================== NAVIGAZIONE A SCROLL ====================
// Un gesto di rotella/swipe/tastiera = una sezione. Se sotto il cursore c'è
// contenuto che può ancora scorrere (pannello o lista interna), il gesto scorre
// quello; il cambio sezione scatta solo a inizio/fine contenuto.
function setupScrollNavigation(activate, getCurrent) {
  const COOLDOWN = 900;       // ms: assorbe l'inerzia del trackpad
  const WHEEL_THRESHOLD = 12; // delta minimo per un gesto intenzionale
  const SWIPE_THRESHOLD = 50; // px di swipe verticale su touch
  let lastSwitch = 0;

  // Risale da `start` cercando un elemento scrollabile non ancora arrivato
  // al bordo nella direzione del gesto (dir: 1 = giù, -1 = su).
  function canScrollContent(start, dir) {
    let el = start instanceof Element ? start : null;
    while (el && el !== document.body) {
      if (el.scrollHeight > el.clientHeight + 1) {
        const oy = getComputedStyle(el).overflowY;
        if (oy === 'auto' || oy === 'scroll') {
          const notAtEnd = dir > 0
            ? el.scrollTop + el.clientHeight < el.scrollHeight - 1
            : el.scrollTop > 0;
          if (notAtEnd) return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  }

  function step(dir) {
    const next = SECTION_ORDER[SECTION_ORDER.indexOf(getCurrent()) + dir];
    if (!next) return;
    lastSwitch = performance.now();
    activate(next);
  }

  window.addEventListener('wheel', (e) => {
    if (!e.deltaY) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    // Durante il cooldown si blocca anche lo scroll nativo, così l'inerzia
    // residua non fa scorrere il pannello appena aperto.
    if (performance.now() - lastSwitch < COOLDOWN) {
      e.preventDefault();
      return;
    }
    if (canScrollContent(e.target, dir)) return; // scroll nativo del contenuto
    e.preventDefault();
    if (Math.abs(e.deltaY) >= WHEEL_THRESHOLD) step(dir);
  }, { passive: false });

  let touchStartY = null;
  window.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (touchStartY === null) return;
    const delta = touchStartY - e.changedTouches[0].clientY; // >0 = dito verso l'alto
    touchStartY = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    const dir = delta > 0 ? 1 : -1;
    if (performance.now() - lastSwitch < COOLDOWN) return;
    if (canScrollContent(e.target, dir)) return;
    step(dir);
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
    let dir = 0;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') dir = 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') dir = -1;
    if (!dir) return;
    e.preventDefault();
    const panel = document.querySelector('.panel.is-open');
    if (panel && canScrollContent(panel.querySelector('.panel-inner') || panel, dir)) {
      panel.scrollBy({ top: dir * 90, behavior: 'smooth' });
      return;
    }
    if (performance.now() - lastSwitch < COOLDOWN) return;
    step(dir);
  });
}

function onWindowResize(camera, renderer, state) {
  let poseTimer;
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Riadatta la posa al nuovo aspect (debounce: durante un drag o una
    // rotazione arrivano molti resize consecutivi).
    clearTimeout(poseTimer);
    poseTimer = setTimeout(() => state.refreshViewport(), 150);
  });
}

// ==================== INIT ====================
async function init() {
  // La navigazione parte prima della scena: il sito resta navigabile
  // (click e scroll) anche se WebGL non è disponibile.
  const state = new AnimationStateManager();
  const { activate, getCurrent } = setupNavigation(state);
  setupScrollNavigation(activate, getCurrent);
  activate('home');

  let renderer;
  try {
    renderer = createRenderer();
    window.ametradesDiag.webgl = 'OK';
  } catch (error) {
    // WebGL non disponibile (accelerazione hardware disattivata, blocklist del
    // driver, privacy.resistFingerprinting…): il sito resta usabile senza scena.
    window.ametradesDiag.webgl = 'NON DISPONIBILE: ' + error.message;
    console.error('[ametrades] WebGL non disponibile: la scena 3D non verrà mostrata.', error);
    return;
  }

  const scene = createScene();
  const camera = createCamera();
  setupLighting(scene);

  let model = null;
  try {
    model = await loadModel(scene);
    window.ametradesDiag.modello = 'caricato';
  } catch (error) {
    window.ametradesDiag.modello = 'ERRORE: ' + (error && error.message ? error.message : error);
    console.error('[ametrades] Modello 3D non caricato:', error);
  }

  setupAnimationLoop(renderer, scene, camera, model, state);
  onWindowResize(camera, renderer, state);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
