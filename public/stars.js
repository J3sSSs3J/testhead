// ==================== ENHANCED STARFIELD EFFECT ====================
class StarField {
  constructor() {
    this.stars = [];
    this.shootingStars = [];
    this.init();
  }

  init() {
    this.createStarField();
    this.animateStars();
  }

  createStarField() {
    const starContainer = document.createElement('div');
    starContainer.className = 'starfield-container';
    starContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2;
    `;

    // Create multiple layers of stars for depth
    for (let layer = 0; layer < 3; layer++) {
      const layerDiv = document.createElement('div');
      layerDiv.className = `star-layer star-layer-${layer}`;
      layerDiv.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
      `;

      const starCount = 100 - (layer * 20); // Fewer stars in background layers
      
      for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        
        const size = Math.random() * (3 - layer * 0.5) + 0.5;
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const duration = Math.random() * 3 + 2;
        const delay = Math.random() * 5;
        
        star.style.cssText = `
          position: absolute;
          width: ${size}px;
          height: ${size}px;
          background: white;
          border-radius: 50%;
          left: ${x}%;
          top: ${y}%;
          opacity: ${0.2 + (layer * 0.3)};
          animation: twinkle ${duration}s ease-in-out infinite;
          animation-delay: ${delay}s;
          box-shadow: 0 0 ${size * 3}px rgba(255, 255, 255, 0.9);
        `;

        layerDiv.appendChild(star);
        this.stars.push(star);
      }

      starContainer.appendChild(layerDiv);
    }

    document.body.appendChild(starContainer);

    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes twinkle {
        0%, 100% { 
          opacity: 0.2;
          transform: scale(0.7);
        }
        25% {
          opacity: 0.5;
          transform: scale(1.0);
        }
        50% { 
          opacity: 1;
          transform: scale(1.4);
        }
        75% {
          opacity: 0.8;
          transform: scale(1.2);
        }
      }
      
      // Rimosso - non più shooting stars
      // @keyframes shooting-star {
      //   0% {
      //     transform: translateX(0) translateY(0) rotate(-45deg);
      //     opacity: 0;
      //   }
      //   10% {
      //     opacity: 1;
      //   }
      //   90% {
      //     opacity: 1;
      //   }
      //   100% {
      //     transform: translateX(400px) translateY(400px) rotate(-45deg);
      //     opacity: 0;
      //   }
      // }
    `;
    document.head.appendChild(style);
  }

  // Rimosso - non più meteoriti cadenti
  // createShootingStars() {
  //   setInterval(() => {
  //     if (Math.random() > 0.5) {
  //       this.createShootingStar();
  //     }
  //   }, 2000);
  // }

  // Rimosso - non più meteoriti cadenti
  // createShootingStar() {
  //   const shootingStar = document.createElement('div');
  //   shootingStar.className = 'shooting-star';
  //   
  //   const startX = Math.random() * window.innerWidth;
  //   const startY = Math.random() * window.innerHeight * 0.5;
  //   const length = Math.random() * 150 + 100;
  //   const duration = Math.random() * 1.5 + 0.8;
  //   
  //   shootingStar.style.cssText = `
  //     position: fixed;
  //     width: ${length}px;
  //     height: 3px;
  //     background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.8), white, rgba(255, 255, 255, 0.3), transparent);
  //     left: ${startX}px;
  //     top: ${startY}px;
  //     transform: rotate(-45deg);
  //     animation: shooting-star ${duration}s linear;
  //     pointer-events: none;
  //     z-index: 3;
  //     box-shadow: 
  //       0 0 15px rgba(255, 255, 255, 0.8),
  //       0 0 30px rgba(255, 255, 255, 0.4);
  //   `;

  //   document.body.appendChild(shootingStar);

  //   setTimeout(() => {
  //     shootingStar.remove();
  //   }, duration * 1000);
  // }

  animateStars() {
    // Add parallax effect on mouse move
    document.addEventListener('mousemove', (e) => {
      const mouseX = e.clientX / window.innerWidth - 0.5;
      const mouseY = e.clientY / window.innerHeight - 0.5;

      this.stars.forEach((star, index) => {
        const layer = Math.floor(index / 80);
        const speed = 1.5 + layer * 0.8;
        const x = mouseX * speed * 15;
        const y = mouseY * speed * 15;
        
        star.style.transform = `translate(${x}px, ${y}px)`;
      });
    });

    // Rimosso - non più drift animation
    // this.addDriftAnimation();
  }

  // Rimosso - non più drift animation
  // addDriftAnimation() {
  //   const starLayers = document.querySelectorAll('.star-layer');
  //   
  //   starLayers.forEach((layer, index) => {
  //     const speed = 0.5 + index * 0.2;
  //     layer.style.animation = `drift ${100 / speed}s linear infinite`;
  //   });

  //   const driftStyle = document.createElement('style');
  //   driftStyle.textContent = `
  //     @keyframes drift {
  //       0% { transform: translate(0, 0); }
  //       25% { transform: translate(10px, -5px); }
  //       50% { transform: translate(-5px, 10px); }
  //       75% { transform: translate(-10px, -10px); }
  //       100% { transform: translate(0, 0); }
  //     }
  //   `;
  //   document.head.appendChild(driftStyle);
  // }
}

// Initialize starfield when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.starField = new StarField();
});
