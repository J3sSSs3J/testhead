// ============================================================================
// ametrades — starfield su canvas 2D
// Un solo canvas: il disegno è identico su tutti i browser e non dipende dal
// compositore (la versione precedente usava centinaia di box-shadow su un
// elemento di pochi pixel con will-change: tecnica fragile, che Firefox può
// non rasterizzare). Twinkle a ~14 fps e parallax leggero al mouse.
// ============================================================================
(function () {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'starfield';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');

  let stars = [];
  let w = 0, h = 0;
  let px = 0, py = 0; // offset parallax

  function build() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Densità costante a prescindere dalla dimensione dello schermo.
    const count = Math.round((w * h) / 2400);
    stars = [];
    for (let i = 0; i < count; i++) {
      const depth = Math.random();
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.55 + depth * 1.35,
        base: 0.6 + Math.random() * 0.4,
        gold: Math.random() < 0.09,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.3,
        depth: 4 + depth * 18,
      });
    }
    draw(0);
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const twinkle = reduce ? 1 : 0.74 + 0.26 * Math.sin(t * 0.001 * s.speed + s.phase);
      const alpha = Math.min(1, s.base * twinkle);
      const x = s.x + px * s.depth;
      const y = s.y + py * s.depth;

      ctx.fillStyle = s.gold ? '#e2c489' : '#ffffff';

      // Alone morbido sulle stelle più grandi
      if (s.r > 1.25) {
        ctx.globalAlpha = alpha * 0.16;
        ctx.beginPath();
        ctx.arc(x, y, s.r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let lastFrame = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    if (t - lastFrame < 70) return; // ~14 fps: twinkle fluido, costo trascurabile
    lastFrame = t;
    draw(t);
  }

  function mount() {
    document.body.appendChild(canvas);
    build();
    if (!reduce) requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  if (!reduce && window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('mousemove', (e) => {
      px = e.clientX / window.innerWidth - 0.5;
      py = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 200);
  });
})();
