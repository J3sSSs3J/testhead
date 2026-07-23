// ==================== ADVANCED VISUAL EFFECTS ====================
class VisualEffects {
  constructor() {
    this.particles = [];
    this.mouseX = 0;
    this.mouseY = 0;
    this.init();
  }

  init() {
    this.createFloatingParticles();
    this.setupMouseTracking();
    this.createGridBackground();
    this.addScrollEffects();
  }

  createFloatingParticles() {
    const container = document.createElement('div');
    container.className = 'particles-container';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    `;

    for (let i = 0; i < 50; i++) {
      const particle = document.createElement('div');
      particle.className = 'floating-particle';
      const size = Math.random() * 3 + 1;
      const duration = Math.random() * 20 + 10;
      const delay = Math.random() * 5;
      
      particle.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        background: radial-gradient(circle, rgba(138, 43, 226, 0.8), transparent);
        border-radius: 50%;
        left: ${Math.random() * 100}%;
        top: ${Math.random() * 100}%;
        animation: float-particle ${duration}s linear infinite;
        animation-delay: ${delay}s;
        box-shadow: 0 0 10px rgba(138, 43, 226, 0.5);
      `;

      container.appendChild(particle);
    }

    document.body.appendChild(container);

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes float-particle {
        0% {
          transform: translateY(100vh) translateX(0) scale(0);
          opacity: 0;
        }
        10% {
          opacity: 1;
          transform: translateY(90vh) translateX(10px) scale(1);
        }
        90% {
          opacity: 1;
          transform: translateY(10vh) translateX(-10px) scale(1);
        }
        100% {
          transform: translateY(0) translateX(0) scale(0);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  setupMouseTracking() {
    document.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX / window.innerWidth;
      this.mouseY = e.clientY / window.innerHeight;
      
      // Parallax effect for background
      const bgGradient = document.querySelector('body::before');
      if (bgGradient) {
        document.body.style.setProperty('--mouse-x', this.mouseX);
        document.body.style.setProperty('--mouse-y', this.mouseY);
      }

      // Mouse glow effect
      this.createMouseGlow(e.clientX, e.clientY);
    });
  }

  createMouseGlow(x, y) {
    const existingGlow = document.querySelector('.mouse-glow');
    if (existingGlow) {
      existingGlow.remove();
    }

    const glow = document.createElement('div');
    glow.className = 'mouse-glow';
    glow.style.cssText = `
      position: fixed;
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, rgba(138, 43, 226, 0.1), transparent 70%);
      border-radius: 50%;
      pointer-events: none;
      left: ${x - 150}px;
      top: ${y - 150}px;
      z-index: 0;
      transition: opacity 0.3s ease;
      animation: glow-pulse 2s ease-in-out infinite;
    `;

    document.body.appendChild(glow);

    setTimeout(() => {
      glow.style.opacity = '0';
      setTimeout(() => glow.remove(), 300);
    }, 100);
  }

  createGridBackground() {
    const grid = document.createElement('div');
    grid.className = 'grid-background';
    grid.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: 
        linear-gradient(rgba(138, 43, 226, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(138, 43, 226, 0.03) 1px, transparent 1px);
      background-size: 50px 50px;
      pointer-events: none;
      z-index: 0;
      animation: grid-move 20s linear infinite;
    `;

    document.body.appendChild(grid);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes grid-move {
        0% { transform: translate(0, 0); }
        100% { transform: translate(50px, 50px); }
      }
      @keyframes glow-pulse {
        0%, 100% { transform: scale(1); opacity: 0.5; }
        50% { transform: scale(1.2); opacity: 0.8; }
      }
    `;
    document.head.appendChild(style);
  }

  addScrollEffects() {
    let lastScrollY = window.scrollY;
    
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      const delta = scrollY - lastScrollY;
      
      // Parallax for sections
      document.querySelectorAll('.section-content').forEach((section, index) => {
        const speed = 0.5 + (index * 0.1);
        section.style.transform = `translateY(${scrollY * speed}px)`;
      });

      lastScrollY = scrollY;
    });
  }

  addTypingEffect(element, text, speed = 100) {
    element.textContent = '';
    let i = 0;
    
    const type = () => {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
        setTimeout(type, speed);
      }
    };
    
    type();
  }

  createGlitchEffect(element) {
    const originalText = element.textContent;
    const glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    const glitch = () => {
      let glitchedText = '';
      for (let i = 0; i < originalText.length; i++) {
        if (Math.random() > 0.8) {
          glitchedText += glitchChars[Math.floor(Math.random() * glitchChars.length)];
        } else {
          glitchedText += originalText[i];
        }
      }
      element.textContent = glitchedText;
    };

    const restore = () => {
      element.textContent = originalText;
    };

    // Random glitch effect
    setInterval(() => {
      if (Math.random() > 0.7) {
        glitch();
        setTimeout(restore, 100);
      }
    }, 3000);
  }
}

// Initialize effects when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.visualEffects = new VisualEffects();
  
  // Add glitch effect to title
  const title = document.querySelector('.hero-title');
  if (title) {
    window.visualEffects.createGlitchEffect(title);
  }
});
