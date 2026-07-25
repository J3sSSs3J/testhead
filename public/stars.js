// ============================================================================
// ametrades — starfield
// Un solo campo stellare, performante: 3 layer, ognuno un singolo nodo DOM che
// disegna centinaia di stelle via box-shadow. Twinkle in CSS, parallax al
// mouse limitato con requestAnimationFrame. Sostituisce i vecchi effetti
// sovrapposti (particelle, esagoni, data-stream, mouse-glow).
// ============================================================================
(function () {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LAYERS = [
    { count: 260, size: 1.2, depth: 6,  dur: '7s',   delay: '0s',  blur: 0 },
    { count: 150, size: 1.8, depth: 12, dur: '5.5s', delay: '-2s', blur: 0.5 },
    { count: 70,  size: 2.6, depth: 22, dur: '4.5s', delay: '-1s', blur: 1 },
  ];

  const container = document.createElement('div');
  container.className = 'starfield';
  container.setAttribute('aria-hidden', 'true');

  const layerEls = [];

  function boxShadows(count, blur) {
    const w = Math.max(window.innerWidth, 1800);
    const h = Math.max(window.innerHeight, 1300);
    const parts = [];
    for (let i = 0; i < count; i++) {
      const x = Math.round(Math.random() * w);
      const y = Math.round(Math.random() * h);
      const golden = Math.random() < 0.09;
      const alpha = (0.5 + Math.random() * 0.5).toFixed(2);
      const color = golden
        ? `rgba(226, 196, 137, ${alpha})`
        : `rgba(255, 255, 255, ${alpha})`;
      parts.push(`${x}px ${y}px ${blur}px 0 ${color}`);
    }
    return parts.join(', ');
  }

  function build() {
    container.innerHTML = '';
    layerEls.length = 0;
    LAYERS.forEach((cfg, i) => {
      const el = document.createElement('div');
      el.className = `star-layer twk-${i}`;
      el.style.width = `${cfg.size}px`;
      el.style.height = `${cfg.size}px`;
      el.style.boxShadow = boxShadows(cfg.count, cfg.blur);
      el.style.animationDuration = cfg.dur;
      el.style.animationDelay = cfg.delay;
      container.appendChild(el);
      layerEls.push(el);
    });
  }

  build();
  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(container);
  });

  // Parallax leggero, limitato con rAF.
  if (!reduce && window.matchMedia('(pointer: fine)').matches) {
    let tx = 0, ty = 0, ticking = false;
    window.addEventListener('mousemove', (e) => {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          LAYERS.forEach((cfg, i) => {
            const el = layerEls[i];
            if (el) el.style.transform = `translate3d(${(-tx * cfg.depth).toFixed(1)}px, ${(-ty * cfg.depth).toFixed(1)}px, 0)`;
          });
          ticking = false;
        });
      }
    }, { passive: true });
  }

  // Rigenera dopo un resize (debounced) così la copertura resta piena.
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(build, 250);
  });
})();
