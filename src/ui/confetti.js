/**
 * Colorful Celebratory Confetti System for 1st Place Victory
 * Lightweight 60fps HTML5 Canvas particle physics
 */

export class ConfettiCannon {
  constructor() {
    this.canvas = document.getElementById('confetti-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.particles = [];
    this.animId = null;
    this.isActive = false;

    this.colors = [
      '#FFD700', '#F59E0B', // Gold
      '#EF4444', '#DC2626', // Crimson
      '#102A43', '#2563EB', // Archival Blue
      '#10B981', '#059669', // Emerald
      '#06B6D4', '#38BDF8', // Cyan
      '#8B5CF6', '#EC4899'  // Purple / Pink
    ];

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  handleResize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  burst(count = 160) {
    if (!this.canvas || !this.ctx) return;
    this.handleResize();
    this.particles = [];
    this.isActive = true;
    this.canvas.style.display = 'block';

    const w = this.canvas.width;
    const h = this.canvas.height;

    for (let i = 0; i < count; i++) {
      const startFromLeft = Math.random() < 0.5;
      const originX = startFromLeft ? w * 0.15 : w * 0.85;
      const originY = h * 0.45;

      const angle = startFromLeft
        ? (Math.random() * 0.6 - 0.2) * Math.PI // Shoot up-right
        : (Math.random() * 0.6 + 0.6) * Math.PI; // Shoot up-left

      const speed = Math.random() * 14.0 + 8.0;

      this.particles.push({
        x: originX + (Math.random() * 80 - 40),
        y: originY + (Math.random() * 60 - 30),
        vx: Math.cos(angle) * speed,
        vy: -Math.abs(Math.sin(angle) * speed) - 3.0,
        sizeW: Math.random() * 9 + 5,
        sizeH: Math.random() * 6 + 4,
        color: this.colors[Math.floor(Math.random() * this.colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.25,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.1 + 0.05,
        opacity: 1.0,
        drag: 0.965,
        gravity: 0.28
      });
    }

    if (this.animId) cancelAnimationFrame(this.animId);
    this.animate();
  }

  animate() {
    if (!this.isActive || !this.ctx) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    let activeCount = 0;
    const h = this.canvas.height;

    this.particles.forEach(p => {
      // Physics update
      p.vx *= p.drag;
      p.vy = (p.vy + p.gravity) * p.drag;
      p.x += p.vx;
      p.y += p.vy;

      p.rotation += p.rotSpeed;
      p.wobble += p.wobbleSpeed;

      // Fluttering scale in 3D
      const scaleX = Math.cos(p.wobble);

      // Fade out near bottom
      if (p.y > h * 0.75) {
        p.opacity = Math.max(0, p.opacity - 0.015);
      }

      if (p.opacity > 0 && p.y < h + 50) {
        activeCount++;

        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(p.rotation);
        this.ctx.scale(scaleX, 1.0);
        this.ctx.globalAlpha = p.opacity;
        this.ctx.fillStyle = p.color;
        this.ctx.fillRect(-p.sizeW / 2, -p.sizeH / 2, p.sizeW, p.sizeH);
        this.ctx.restore();
      }
    });

    if (activeCount > 0) {
      this.animId = requestAnimationFrame(() => this.animate());
    } else {
      this.stop();
    }
  }

  stop() {
    this.isActive = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.canvas.style.display = 'none';
    }
    this.particles = [];
  }
}

