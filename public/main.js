// === AUTH & UI LOGIC ===
const API_URL = '/api';
let chart;

function showSection(section) {
  document.getElementById('stats').style.display = 'none';
  document.getElementById('chart-container').style.display = 'none';
  document.getElementById('content-plan').style.display = 'none';
  document.getElementById('content-login').style.display = 'none';
  if (section === 'stats') {
    document.getElementById('stats').style.display = '';
    document.getElementById('chart-container').style.display = '';
  } else if (section === 'plan') {
    document.getElementById('content-plan').style.display = '';
  } else if (section === 'login') {
    document.getElementById('content-login').style.display = '';
  }
}

function saveToken(token) {
  localStorage.setItem('jwt_token', token);
}
function getToken() {
  return localStorage.getItem('jwt_token');
}
function clearToken() {
  localStorage.removeItem('jwt_token');
}

async function fetchMe() {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  return await res.json();
}

async function fetchAccount(accountId) {
  const token = getToken();
  const res = await fetch(`${API_URL}/account/${accountId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Errore fetch account');
  return await res.json();
}

async function fetchPerformance(accountId) {
  const token = getToken();
  const res = await fetch(`${API_URL}/performance/${accountId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Errore fetch performance');
  return await res.json();
}

function updateStats(data) {
  document.getElementById('equity').textContent = data?.equity?.toFixed(2) ?? '-';
  document.getElementById('balance').textContent = data?.balance?.toFixed(2) ?? '-';
  // Performance: da calcolare lato backend o qui se servono
  document.getElementById('perf-total').textContent = data?.perfTotal?.toFixed(2) ?? '-';
  document.getElementById('perf-day').textContent = data?.perfDay?.toFixed(2) ?? '-';
  document.getElementById('perf-week').textContent = data?.perfWeek?.toFixed(2) ?? '-';
}

function updateChart(snapshots) {
  const ctx = document.getElementById('equityChart').getContext('2d');
  const labels = snapshots.map(s => new Date(s.timestamp).toLocaleString()).reverse();
  const equityData = snapshots.map(s => Number(s.equity)).reverse();
  if (!chart) {
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Equity',
          data: equityData,
          borderColor: 'blue',
          fill: false,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { display: true }, y: { display: true } }
      }
    });
  } else {
    chart.data.labels = labels;
    chart.data.datasets[0].data = equityData;
    chart.update();
  }
}

async function loadUserDashboard() {
  const user = await fetchMe();
  // Navbar dinamica
  const loginBtn = document.getElementById('login-nav-btn');
  const logoutBtn = document.getElementById('logout-nav-btn');
  if (!user) {
    showSection('login');
    if (loginBtn) loginBtn.style.display = '';
    if (logoutBtn) logoutBtn.style.display = 'none';
    return;
  }
  if (loginBtn) loginBtn.style.display = 'none';
  if (logoutBtn) logoutBtn.style.display = '';
  if (!user.account_id) {
    showSection('plan');
    return;
  }
  // Mostra stats e grafico
  showSection('stats');
  try {
    const account = await fetchAccount(user.account_id);
    updateStats(account);
    const perf = await fetchPerformance(user.account_id);
    updateChart(perf);
  } catch (e) {
    document.getElementById('equity').textContent = '-';
    document.getElementById('balance').textContent = '-';
    document.getElementById('perf-total').textContent = '-';
    document.getElementById('perf-day').textContent = '-';
    document.getElementById('perf-week').textContent = '-';
  }
}

// === LOGIN/REGISTER FORM LOGIC + NAVBAR/3D INIT ===
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

async function mainInit() {
  // --- Three.js & modello sempre visibile ---
  const scene = createScene();
  const camera = createCamera();
  const renderer = createRenderer();
  setupLighting(scene);
  let model = null;
  try {
    model = await loadModel(scene);
  } catch (e) {
    // Mostra errore ma non blocca il resto
    console.error('Errore caricamento modello 3D:', e);
  }
  const animationState = new AnimationStateManager();
  setupAnimationLoop(renderer, scene, camera, model, animationState);
  onWindowResize(camera, renderer);
  setupNavbarInteraction(animationState);

  // --- Login/Register toggle ---
  document.getElementById('show-register').onclick = (e) => {
    e.preventDefault();
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = '';
    document.getElementById('login-title').textContent = 'REGISTRATI';
  };
  document.getElementById('show-login').onclick = (e) => {
    e.preventDefault();
    document.getElementById('login-form').style.display = '';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-title').textContent = 'ACCEDI';
  };

  // Login
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    document.getElementById('login-error').textContent = '';
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore login');
      saveToken(data.token);
      await loadUserDashboard();
    } catch (err) {
      document.getElementById('login-error').textContent = err.message;
    }
  };

  // Register
  document.getElementById('register-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    document.getElementById('register-error').textContent = '';
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (data.errors && data.errors[0]?.msg) || 'Errore registrazione');
      // Dopo la registrazione, passa subito al login
      document.getElementById('login-form').style.display = '';
      document.getElementById('register-form').style.display = 'none';
      document.getElementById('login-title').textContent = 'ACCEDI';
      document.getElementById('login-error').textContent = 'Registrazione avvenuta! Ora puoi accedere.';
    } catch (err) {
      document.getElementById('register-error').textContent = err.message;
    }
  };

  // Logout
  window.logout = function() {
    clearToken();
    const loginBtn = document.getElementById('login-nav-btn');
    const logoutBtn = document.getElementById('logout-nav-btn');
    if (loginBtn) loginBtn.style.display = '';
    if (logoutBtn) logoutBtn.style.display = 'none';
    showSection('login');
  };

  // Carica dashboard all'avvio
  loadUserDashboard();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mainInit);
} else {
  mainInit();
}

// ==================== EASING FUNCTIONS ====================
const Easing = {
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInCubic: (t) => t * t * t,
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInOutExpo: (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2
};

// ==================== ANIMATION STATE MANAGER ====================
class AnimationStateManager {
  constructor() {
    this.current = {
      position: new THREE.Vector3(0, 1.4, 0),
      rotation: 0,
      cameraZ: 3
    };

    this.target = {
      position: new THREE.Vector3(0, 1.4, 0),
      rotation: 0,
      cameraZ: 3
    };

    this.transition = {
      isAnimating: false,
      progress: 0,
      duration: 1.2,
      startTime: 0,
      easing: Easing.easeInOutCubic
    };

    this.sections = {
      home: { position: new THREE.Vector3(0, 1.26, 0), rotation: 0, cameraZ: 3 },
      about: { position: new THREE.Vector3(1.8, 1.26, 0), rotation: -1.222, cameraZ: 3 },
      portfolio: { position: new THREE.Vector3(-1.8, 1.16, 0), rotation: 1.222, cameraZ: 3 },
      login: { position: new THREE.Vector3(0, 0.99, 0), rotation: 0, cameraZ: 1.5 }
    };
  }

  transitionTo(section) {
    if (!this.sections[section]) return;

    // Forza l'inizio di una nuova transizione anche se una è in corso
    const targetConfig = this.sections[section];
    this.target.position.copy(targetConfig.position);
    this.target.rotation = targetConfig.rotation;
    this.target.cameraZ = targetConfig.cameraZ;

    this.transition.isAnimating = true;
    this.transition.progress = 0;
    this.transition.startTime = Date.now();

    console.log(`🎬 Transitioning to ${section}`);
  }

  update(deltaTime) {
    if (!this.transition.isAnimating) return;

    const elapsed = (Date.now() - this.transition.startTime) / 1000;
    this.transition.progress = Math.min(elapsed / this.transition.duration, 1);
    const easedProgress = this.transition.easing(this.transition.progress);

    // Usa lerp corretto con smoothed factor per movimenti più fluidi
    const smoothFactor = 0.08; // fattore di smoothing per movimenti naturali
    this.current.position.lerp(this.target.position, smoothFactor);
    this.current.rotation = this.lerpAngle(this.current.rotation, this.target.rotation, smoothFactor);
    this.current.cameraZ = THREE.MathUtils.lerp(this.current.cameraZ, this.target.cameraZ, smoothFactor);

    // Completa la transizione quando abbastanza vicino al target
    const positionThreshold = 0.01;
    const rotationThreshold = 0.01;
    const cameraThreshold = 0.01;
    
    const positionClose = this.current.position.distanceTo(this.target.position) < positionThreshold;
    const rotationClose = Math.abs(this.current.rotation - this.target.rotation) < rotationThreshold;
    const cameraClose = Math.abs(this.current.cameraZ - this.target.cameraZ) < cameraThreshold;

    if (this.transition.progress >= 0.95 || (positionClose && rotationClose && cameraClose)) {
      this.transition.isAnimating = false;
      this.current.position.copy(this.target.position);
      this.current.rotation = this.target.rotation;
      this.current.cameraZ = this.target.cameraZ;
      console.log('✅ Transizione completata');
    }
  }

  lerpAngle(from, to, t) {
    let diff = to - from;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return from + diff * t;
  }
}

// ==================== SCENE SETUP ====================
function createScene() {
  const scene = new THREE.Scene();
  scene.background = null; // Rende lo sfondo trasparente
  return scene;
}

// ==================== CAMERA SETUP ====================
function createCamera() {
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.5, 3);
  return camera;
}

// ==================== RENDERER SETUP ====================
function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // Abilita trasparenza
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0); // Sfondo completamente trasparente

  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  return renderer;
}

// ==================== LIGHTING SETUP ====================
function setupLighting(scene) {
  const ambientLight = new THREE.AmbientLight(0xffffff, 2);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
  mainLight.position.set(5, 5, 5);
  scene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
  fillLight.position.set(-8, 3, 2);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 1);
  rimLight.position.set(8, 3, -5);
  scene.add(rimLight);
}

// ==================== MODEL LOADING ====================
async function loadModel(scene) {
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      '/models/prometheus.glb',
      (gltf) => {
        const model = gltf.scene;

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2.38 / maxDim;

        model.scale.multiplyScalar(scale);
        model.position.y = 0;
        model.rotation.y = 0;

        model.traverse((child) => {
          if (child.isMesh) {
            child.material.color.set(0x1a1a1a);
            child.material.metalness = 0.3;
            child.material.roughness = 0.7;
          }
        });

        console.log('✅ Modello caricato correttamente');
        scene.add(model);
        resolve(model);
      },
      (progress) => {
        const percent = ((progress.loaded / progress.total) * 100).toFixed(0);
        console.log(`📦 Caricamento: ${percent}%`);
      },
      (error) => {
        console.error('❌ Errore caricamento modello:', error);
        reject(error);
      }
    );
  });
}

// ==================== ANIMATION LOOP ====================
function setupAnimationLoop(renderer, scene, camera, model, animationState) {
  let lastTime = Date.now();

  function animate() {
    requestAnimationFrame(animate);

    const now = Date.now();
    const deltaTime = (now - lastTime) / 1000;
    lastTime = now;

    if (model) {
      animationState.update(deltaTime);
      model.position.copy(animationState.current.position);
      model.rotation.y = animationState.current.rotation;
    }

    const targetZ = animationState.current.cameraZ;
    camera.position.z += (targetZ - camera.position.z) * 0.06;

    renderer.render(scene, camera);
  }

  animate();
}

// ==================== NAVBAR INTERACTION ====================
function setupNavbarInteraction(animationState) {
  const navLinks = document.querySelectorAll('.nav-links a');
  const logoHome = document.getElementById('logo-home');

  // Logo click handler - go to home
  if (logoHome) {
    logoHome.addEventListener('click', (e) => {
      e.preventDefault();
      const homeLink = document.querySelector('a[href="#home"]');
      if (homeLink) {
        homeLink.click();
      }
    });
  }

  navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();

      const href = link.getAttribute('href');
      const sectionMap = {
        '#home': 'home',
        '#about': 'about',
        '#portfolio': 'portfolio'
      };

      const section = sectionMap[href];
      if (section) {
        animationState.transitionTo(section);

        document.querySelectorAll('.section-content').forEach(el => {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
        });

        const activeContent = document.getElementById(`content-${section}`);
        if (activeContent) {
          activeContent.style.opacity = '1';
          activeContent.style.pointerEvents = 'auto';
        }

        console.log(`📍 Sezione attiva: ${section}`);
      }
    });
  });
}

// ==================== WINDOW RESIZE HANDLER ====================
function onWindowResize(camera, renderer) {
  window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });
}

// ==================== MAIN INITIALIZATION ====================
async function init() {
  try {
    const scene = createScene();
    const camera = createCamera();
    const renderer = createRenderer();

    setupLighting(scene);
    const model = await loadModel(scene);
    const animationState = new AnimationStateManager();

    setupAnimationLoop(renderer, scene, camera, model, animationState);
    setupNavbarInteraction(animationState);
    onWindowResize(camera, renderer);

    const homeLink = document.querySelector('a[href="#home"]');
    if (homeLink) {
      homeLink.click();
    }

    console.log('✨ ametrades - Sistema caricato perfettamente');
  } catch (error) {
    console.error('❌ Errore critico:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
