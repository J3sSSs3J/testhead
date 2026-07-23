// ==================== FUTURISTIC VISUAL EFFECTS ====================
class FuturisticEffects {
  constructor() {
    this.init();
  }

  init() {
    this.createFloatingHexagons();
    this.createEnergyField();
    this.createDataStreams();
    this.createHolographicGlitch();
    this.createCyberGrid();
  }

  // Floating Hexagons Background
  createFloatingHexagons() {
    const container = document.createElement('div');
    container.className = 'hexagon-field';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
      opacity: 0.3;
    `;

    for (let i = 0; i < 15; i++) {
      const hexagon = document.createElement('div');
      hexagon.className = 'floating-hexagon';
      
      const size = Math.random() * 40 + 20;
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const duration = Math.random() * 20 + 10;
      const delay = Math.random() * 5;
      
      hexagon.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size * 0.866}px;
        left: ${x}%;
        top: ${y}%;
        background: linear-gradient(45deg, rgba(138, 43, 226, 0.1), rgba(147, 112, 219, 0.1));
        clip-path: polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%);
        border: 1px solid rgba(138, 43, 226, 0.3);
        animation: float-hexagon ${duration}s ease-in-out infinite;
        animation-delay: ${delay}s;
        filter: drop-shadow(0 0 10px rgba(138, 43, 226, 0.2));
      `;

      container.appendChild(hexagon);
    }

    document.body.appendChild(container);

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes float-hexagon {
        0%, 100% {
          transform: translateY(0) rotate(0deg);
          opacity: 0.1;
        }
        25% {
          transform: translateY(-30px) rotate(90deg);
          opacity: 0.3;
        }
        50% {
          transform: translateY(-60px) rotate(180deg);
          opacity: 0.2;
        }
        75% {
          transform: translateY(-30px) rotate(270deg);
          opacity: 0.4;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Energy Field Effect
  createEnergyField() {
    const field = document.createElement('div');
    field.className = 'energy-field';
    field.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2;
      background: 
        radial-gradient(circle at 20% 50%, rgba(138, 43, 226, 0.05) 0%, transparent 50%),
        radial-gradient(circle at 80% 50%, rgba(147, 112, 219, 0.03) 0%, transparent 50%),
        radial-gradient(circle at 50% 100%, rgba(138, 43, 226, 0.02) 0%, transparent 50%);
      animation: energy-pulse 8s ease-in-out infinite;
    `;

    document.body.appendChild(field);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes energy-pulse {
        0%, 100% {
          opacity: 0.3;
          transform: scale(1);
        }
        50% {
          opacity: 0.8;
          transform: scale(1.1);
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Data Streams Animation
  createDataStreams() {
    const container = document.createElement('div');
    container.className = 'data-streams';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 3;
      overflow: hidden;
    `;

    for (let i = 0; i < 8; i++) {
      const stream = document.createElement('div');
      stream.className = 'data-stream';
      
      const x = Math.random() * 100;
      const duration = Math.random() * 3 + 2;
      const delay = Math.random() * 5;
      const width = Math.random() * 2 + 1;
      
      stream.style.cssText = `
        position: absolute;
        width: ${width}px;
        height: 100px;
        left: ${x}%;
        top: -100px;
        background: linear-gradient(to bottom, transparent, rgba(138, 43, 226, 0.6), transparent);
        animation: data-stream-fall ${duration}s linear infinite;
        animation-delay: ${delay}s;
        box-shadow: 0 0 10px rgba(138, 43, 226, 0.4);
      `;

      container.appendChild(stream);
    }

    document.body.appendChild(container);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes data-stream-fall {
        0% {
          transform: translateY(0) scaleY(0);
          opacity: 0;
        }
        10% {
          opacity: 1;
          transform: translateY(50px) scaleY(1);
        }
        90% {
          opacity: 1;
          transform: translateY(calc(100vh + 50px)) scaleY(1);
        }
        100% {
          opacity: 0;
          transform: translateY(calc(100vh + 100px)) scaleY(0);
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Holographic Glitch Effect
  createHolographicGlitch() {
    const glitch = document.createElement('div');
    glitch.className = 'holographic-glitch';
    glitch.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 6;
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(138, 43, 226, 0.03) 10%,
        rgba(147, 112, 219, 0.05) 20%,
        transparent 30%,
        transparent 70%,
        rgba(138, 43, 226, 0.03) 80%,
        rgba(147, 112, 219, 0.05) 90%,
        transparent 100%
      );
      animation: holographic-scan 4s linear infinite;
    `;

    document.body.appendChild(glitch);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes holographic-scan {
        0% {
          transform: translateY(-100%);
          opacity: 0;
        }
        10% {
          opacity: 0.3;
        }
        50% {
          opacity: 0.1;
        }
        90% {
          opacity: 0.3;
        }
        100% {
          transform: translateY(100vh);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Cyber Grid Background
  createCyberGrid() {
    const grid = document.createElement('div');
    grid.className = 'cyber-grid';
    grid.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
      background-image: 
        linear-gradient(rgba(138, 43, 226, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(138, 43, 226, 0.05) 1px, transparent 1px);
      background-size: 50px 50px;
      animation: grid-move 20s linear infinite;
      opacity: 0.2;
    `;

    document.body.appendChild(grid);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes grid-move {
        0% {
          transform: translate(0, 0);
        }
        100% {
          transform: translate(50px, 50px);
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize futuristic effects when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.futuristicEffects = new FuturisticEffects();
});
