import * as THREE from 'three';
import { settings, BODY_STYLES, INK_PALETTES } from '../game/settings.js';
import { createCarModel } from '../graphics/carModel.js';

export class GarageModal {
  constructor(onSave) {
    this.onSave = onSave;
    this.modalEl = document.getElementById('garage-modal');
    this.previewContainer = document.getElementById('garage-preview-canvas');

    this.currentBodyStyle = settings.data.car?.bodyStyle || 0;
    this.currentColorIndex = settings.data.car?.colorIndex || 0;
    this.currentDecal = settings.data.car?.decalNumber || '01';

    this.initElements();
    this.init3DPreview();
    this.bindEvents();
  }

  initElements() {
    this.btnClose = document.getElementById('btn-close-garage');
    this.btnSave = document.getElementById('btn-save-garage');
    this.styleButtonsContainer = document.getElementById('garage-style-buttons');
    this.colorSwatchesContainer = document.getElementById('garage-color-swatches');
    this.decalInput = document.getElementById('garage-decal-input');

    this.specSpeed = document.getElementById('spec-speed');
    this.specAccel = document.getElementById('spec-accel');
    this.specGrip = document.getElementById('spec-grip');
  }

  init3DPreview() {
    if (!this.previewContainer) return;

    this.previewScene = new THREE.Scene();
    this.previewScene.background = new THREE.Color(0xFBF9F4);

    const aspect = this.previewContainer.clientWidth / (this.previewContainer.clientHeight || 220);
    this.previewCamera = new THREE.PerspectiveCamera(35, aspect, 0.1, 100);
    this.previewCamera.position.set(4.5, 3.2, 5.5);
    this.previewCamera.lookAt(0, 0.5, 0);

    this.previewRenderer = new THREE.WebGLRenderer({ antialias: true });
    this.previewRenderer.setSize(this.previewContainer.clientWidth, this.previewContainer.clientHeight || 220);
    this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.previewContainer.appendChild(this.previewRenderer.domElement);

    // Decorative ground drafting grid
    const gridGeo = new THREE.PlaneGeometry(16, 16);
    gridGeo.rotateX(-Math.PI / 2);
    const gridMat = new THREE.MeshBasicMaterial({ color: 0xF3EFE6 });
    const gridMesh = new THREE.Mesh(gridGeo, gridMat);
    gridMesh.position.y = -0.02;
    this.previewScene.add(gridMesh);

    // Subtle line grid
    const lineMat = new THREE.LineBasicMaterial({ color: 0xCAD5DE });
    const pts = [];
    for (let i = -8; i <= 8; i += 2) {
      pts.push(new THREE.Vector3(-8, 0.01, i), new THREE.Vector3(8, 0.01, i));
      pts.push(new THREE.Vector3(i, 0.01, -8), new THREE.Vector3(i, 0.01, 8));
    }
    const linesGeo = new THREE.BufferGeometry().setFromPoints(pts);
    this.previewScene.add(new THREE.LineSegments(linesGeo, lineMat));

    // Turntable interaction
    this.isDragging = false;
    this.prevMouseX = 0;
    this.carRotationY = Math.PI * 0.25;

    this.previewContainer.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.prevMouseX = e.clientX;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevMouseX;
      this.prevMouseX = e.clientX;
      this.carRotationY += dx * 0.012;
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    // Start render loop
    this.previewCarMesh = null;
    this.updatePreviewCar();
    this.animatePreview();
  }

  updatePreviewCar() {
    if (!this.previewScene) return;

    if (this.previewCarMesh) {
      this.previewScene.remove(this.previewCarMesh);
    }

    const isNight = settings.get('theme') === 'night';
    this.previewScene.background.setHex(isNight ? 0x0A192F : 0xFBF9F4);

    const carData = createCarModel(
      this.currentColorIndex,
      true,
      this.currentBodyStyle,
      this.currentDecal,
      isNight
    );

    this.previewCarMesh = carData.group;
    this.previewScene.add(this.previewCarMesh);
  }

  animatePreview() {
    requestAnimationFrame(() => this.animatePreview());

    if (this.previewCarMesh) {
      if (!this.isDragging) {
        this.carRotationY += 0.008; // Gentle auto-turntable spin
      }
      this.previewCarMesh.rotation.y = this.carRotationY;
    }

    if (this.previewRenderer && this.previewScene && this.previewCamera) {
      this.previewRenderer.render(this.previewScene, this.previewCamera);
    }
  }

  bindEvents() {
    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.hide());
    }

    if (this.btnSave) {
      this.btnSave.addEventListener('click', () => {
        settings.update({
          car: {
            bodyStyle: this.currentBodyStyle,
            colorIndex: this.currentColorIndex,
            decalNumber: this.currentDecal
          }
        });
        if (this.onSave) this.onSave();
        this.hide();
      });
    }

    if (this.decalInput) {
      this.decalInput.addEventListener('input', (e) => {
        const val = e.target.value.slice(0, 3).toUpperCase();
        this.currentDecal = val || '01';
        this.updatePreviewCar();
      });
    }
  }

  renderUI() {
    // 1. Render Body Style Buttons
    if (this.styleButtonsContainer) {
      this.styleButtonsContainer.innerHTML = '';
      BODY_STYLES.forEach((spec, idx) => {
        const btn = document.createElement('button');
        btn.className = `garage-style-card ${idx === this.currentBodyStyle ? 'selected' : ''}`;
        btn.innerHTML = `
          <div class="style-name">${spec.name}</div>
          <div class="style-desc">${spec.desc}</div>
        `;
        btn.addEventListener('click', () => {
          this.currentBodyStyle = idx;
          this.renderUI();
          this.updatePreviewCar();
        });
        this.styleButtonsContainer.appendChild(btn);
      });
    }

    // 2. Render Color Swatches
    if (this.colorSwatchesContainer) {
      this.colorSwatchesContainer.innerHTML = '';
      INK_PALETTES.forEach((p, idx) => {
        const swatch = document.createElement('div');
        swatch.className = `color-swatch-item ${idx === this.currentColorIndex ? 'selected' : ''}`;
        swatch.title = p.name;
        swatch.innerHTML = `
          <div class="swatch-circle" style="background-color: ${p.css};"></div>
          <span class="swatch-label">${p.name}</span>
        `;
        swatch.addEventListener('click', () => {
          this.currentColorIndex = idx;
          this.renderUI();
          this.updatePreviewCar();
        });
        this.colorSwatchesContainer.appendChild(swatch);
      });
    }

    // 3. Update Specs Bars
    const activeSpec = BODY_STYLES[this.currentBodyStyle];
    if (this.specSpeed) this.specSpeed.style.width = `${(activeSpec.topSpeed / 42) * 100}%`;
    if (this.specAccel) this.specAccel.style.width = `${(activeSpec.accel / 42) * 100}%`;
    if (this.specGrip) this.specGrip.style.width = `${(activeSpec.grip / 1.0) * 100}%`;

    if (this.decalInput) {
      this.decalInput.value = this.currentDecal;
    }
  }

  show() {
    this.currentBodyStyle = settings.data.car?.bodyStyle || 0;
    this.currentColorIndex = settings.data.car?.colorIndex || 0;
    this.currentDecal = settings.data.car?.decalNumber || '01';

    this.renderUI();
    this.updatePreviewCar();

    if (this.modalEl) {
      this.modalEl.style.display = 'flex';
      setTimeout(() => {
        if (this.previewRenderer && this.previewContainer) {
          const w = this.previewContainer.clientWidth;
          const h = this.previewContainer.clientHeight || 220;
          this.previewCamera.aspect = w / h;
          this.previewCamera.updateProjectionMatrix();
          this.previewRenderer.setSize(w, h);
        }
      }, 50);
    }
  }

  hide() {
    if (this.modalEl) this.modalEl.style.display = 'none';
  }
}

