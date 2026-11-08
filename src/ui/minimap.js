import { settings } from '../game/settings.js';

/**
 * Translucent Notebook / Blueprint Minimap HUD
 * Displays full circuit layout, real-time player and opponent positions, and start/finish gate.
 */
export class MinimapHUD {
  constructor() {
    this.container = document.getElementById('minimap-hud');
    this.canvas = document.getElementById('minimap-canvas');
    this.trackNameLabel = document.getElementById('minimap-track-name');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.points = [];
    this.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    this.padding = 18;
  }

  setTrack(curve, trackName = 'CIRCUIT') {
    if (!curve || !this.ctx) return;

    if (this.trackNameLabel) {
      this.trackNameLabel.innerText = trackName;
    }

    // Sample 120 points around track curve
    const pts = curve.getPoints(120);
    this.points = pts.map(p => ({ x: p.x, z: p.z }));

    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    this.points.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });

    this.bounds = { minX, maxX, minZ, maxZ };
  }

  worldToCanvas(worldX, worldZ) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const pad = this.padding;

    const spanX = (this.bounds.maxX - this.bounds.minX) || 1;
    const spanZ = (this.bounds.maxZ - this.bounds.minZ) || 1;

    // Preserve aspect ratio
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);

    const midX = (this.bounds.minX + this.bounds.maxX) / 2;
    const midZ = (this.bounds.minZ + this.bounds.maxZ) / 2;

    const cx = w / 2 + (worldX - midX) * scale;
    // Map world +Z (down) to canvas Y
    const cy = h / 2 + (worldZ - midZ) * scale;

    return { x: cx, y: cy };
  }

  update(localPos, localHeading, opponents = []) {
    if (!this.ctx || this.points.length === 0) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const isNight = settings.get('theme') === 'night';

    this.ctx.clearRect(0, 0, w, h);

    // 1. Draw Track Circuit Ribbon
    this.ctx.beginPath();
    this.points.forEach((p, i) => {
      const c = this.worldToCanvas(p.x, p.z);
      if (i === 0) this.ctx.moveTo(c.x, c.y);
      else this.ctx.lineTo(c.x, c.y);
    });
    this.ctx.closePath();

    // Road fill
    this.ctx.fillStyle = isNight ? 'rgba(15, 37, 63, 0.45)' : 'rgba(253, 251, 247, 0.65)';
    this.ctx.fill();

    // Road stroke
    this.ctx.lineWidth = 3.5;
    this.ctx.strokeStyle = isNight ? '#38BDF8' : '#102A43';
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.stroke();

    // 2. Start / Finish Line Tick
    if (this.points.length > 0) {
      const startPt = this.worldToCanvas(this.points[0].x, this.points[0].z);
      this.ctx.fillStyle = '#E26D68';
      this.ctx.beginPath();
      this.ctx.arc(startPt.x, startPt.y, 3.5, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // 3. Draw Opponent Markers
    opponents.forEach(op => {
      if (!op.position) return;
      const c = this.worldToCanvas(op.position.x, op.position.z);
      this.ctx.beginPath();
      this.ctx.arc(c.x, c.y, 3.0, 0, Math.PI * 2);
      this.ctx.fillStyle = isNight ? '#F87171' : '#8B2635';
      this.ctx.fill();
      this.ctx.lineWidth = 1;
      this.ctx.strokeStyle = isNight ? '#0A192F' : '#FAF8F3';
      this.ctx.stroke();
    });

    // 4. Draw Local Player Marker (Pulsing Dot + Forward Pointer)
    if (localPos) {
      const lp = this.worldToCanvas(localPos.x, localPos.z);

      // Forward direction arrow
      const arrowLength = 7.0;
      const forwardX = Math.sin(localHeading) * arrowLength;
      const forwardY = Math.cos(localHeading) * arrowLength;

      this.ctx.beginPath();
      this.ctx.moveTo(lp.x, lp.y);
      this.ctx.lineTo(lp.x + forwardX, lp.y + forwardY);
      this.ctx.strokeStyle = isNight ? '#BAE6FD' : '#102A43';
      this.ctx.lineWidth = 2.0;
      this.ctx.stroke();

      // Local player circle
      this.ctx.beginPath();
      this.ctx.arc(lp.x, lp.y, 4.5, 0, Math.PI * 2);
      this.ctx.fillStyle = isNight ? '#38BDF8' : '#2A5298';
      this.ctx.fill();
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeStyle = isNight ? '#FFFFFF' : '#FAF8F3';
      this.ctx.stroke();
    }
  }
}

