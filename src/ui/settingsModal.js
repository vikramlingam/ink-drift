import { settings, THEMES } from '../game/settings.js';

export class SettingsModal {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.modalEl = document.getElementById('settings-modal');
    this.rebindTarget = null;

    this.initElements();
    this.bindEvents();
    this.render();
  }

  initElements() {
    this.btnClose = document.getElementById('btn-close-settings');
    this.btnSave = document.getElementById('btn-save-settings');
    this.btnReset = document.getElementById('btn-reset-settings');

    this.btnInvertSteer = document.getElementById('setting-invert-steer');
    this.difficultySelect = document.getElementById('setting-difficulty');
    this.steerSensSlider = document.getElementById('setting-steer-sens');
    this.steerSensVal = document.getElementById('setting-steer-sens-val');

    this.cameraSelect = document.getElementById('setting-camera-preset');
    this.themeSelect = document.getElementById('setting-theme');
    this.volumeSlider = document.getElementById('setting-master-volume');
    this.volumeVal = document.getElementById('setting-volume-val');

    this.btnRebinds = {
      throttle: document.getElementById('bind-throttle'),
      brake: document.getElementById('bind-brake'),
      steerLeft: document.getElementById('bind-steer-left'),
      steerRight: document.getElementById('bind-steer-right'),
      handbrake: document.getElementById('bind-handbrake'),
      reset: document.getElementById('bind-reset')
    };

    this.rebindPrompt = document.getElementById('rebind-prompt');
  }

  bindEvents() {
    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.hide());
    }
    if (this.btnSave) {
      this.btnSave.addEventListener('click', () => this.hide());
    }
    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => {
        settings.resetToDefaults();
        this.render();
        if (this.onUpdate) this.onUpdate();
      });
    }

    // Invert Steering Toggle
    if (this.btnInvertSteer) {
      this.btnInvertSteer.addEventListener('click', () => {
        const current = settings.get('steeringInverted') || false;
        settings.set('steeringInverted', !current);
        this.updateInvertButton(!current);
        if (this.onUpdate) this.onUpdate();
      });
    }

    // Difficulty Select
    if (this.difficultySelect) {
      this.difficultySelect.addEventListener('change', (e) => {
        settings.set('difficulty', e.target.value);
        if (this.onUpdate) this.onUpdate();
      });
    }

    // Steering Sensitivity Slider
    if (this.steerSensSlider) {
      this.steerSensSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        settings.set('steeringSensitivity', val);
        if (this.steerSensVal) this.steerSensVal.innerText = `${Math.round(val * 100)}%`;
        if (this.onUpdate) this.onUpdate();
      });
    }

    // Camera Preset
    if (this.cameraSelect) {
      this.cameraSelect.addEventListener('change', (e) => {
        settings.set('cameraPreset', e.target.value);
        if (this.onUpdate) this.onUpdate();
      });
    }

    // Theme Select
    if (this.themeSelect) {
      this.themeSelect.addEventListener('change', (e) => {
        settings.set('theme', e.target.value);
        if (this.onUpdate) this.onUpdate();
      });
    }

    // Volume Slider
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.volumeVal) this.volumeVal.innerText = `${Math.round(val * 100)}%`;
        if (this.onUpdate) this.onUpdate({ volume: val });
      });
    }

    // Key Rebinding Buttons
    Object.entries(this.btnRebinds).forEach(([action, btn]) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        this.startRebinding(action, btn);
      });
    });

    // Global Key Listener for Rebinding
    window.addEventListener('keydown', (e) => {
      if (!this.rebindTarget) return;
      e.preventDefault();
      e.stopPropagation();

      const newKey = e.code;
      const kb = settings.get('keybindings') || {};
      kb[this.rebindTarget] = newKey;
      settings.set('keybindings', kb);

      this.stopRebinding();
      this.render();
      if (this.onUpdate) this.onUpdate();
    }, true);
  }

  startRebinding(action, btn) {
    this.rebindTarget = action;
    btn.innerText = 'PRESS ANY KEY...';
    btn.classList.add('rebinding');
    if (this.rebindPrompt) {
      this.rebindPrompt.style.display = 'block';
      this.rebindPrompt.innerText = `Press any keyboard key for: ${action.toUpperCase()}`;
    }
  }

  stopRebinding() {
    this.rebindTarget = null;
    if (this.rebindPrompt) {
      this.rebindPrompt.style.display = 'none';
    }
    Object.values(this.btnRebinds).forEach(btn => btn?.classList.remove('rebinding'));
  }

  updateInvertButton(isInverted) {
    if (!this.btnInvertSteer) return;
    if (isInverted) {
      this.btnInvertSteer.innerText = 'INVERTED (REVERSED)';
      this.btnInvertSteer.classList.add('active');
    } else {
      this.btnInvertSteer.innerText = 'NORMAL (DRIVER VIEW)';
      this.btnInvertSteer.classList.remove('active');
    }
  }

  render() {
    const s = settings.data;

    this.updateInvertButton(s.steeringInverted);

    if (this.difficultySelect) {
      this.difficultySelect.value = s.difficulty || 'easy';
    }

    if (this.steerSensSlider) {
      this.steerSensSlider.value = s.steeringSensitivity || 1.0;
      if (this.steerSensVal) this.steerSensVal.innerText = `${Math.round((s.steeringSensitivity || 1.0) * 100)}%`;
    }

    if (this.cameraSelect) {
      this.cameraSelect.value = s.cameraPreset || 'standard';
    }

    if (this.themeSelect) {
      this.themeSelect.value = s.theme || 'day';
    }

    if (this.volumeSlider) {
      const vol = s.audio?.masterVolume !== undefined ? s.audio.masterVolume : 0.8;
      this.volumeSlider.value = vol;
      if (this.volumeVal) this.volumeVal.innerText = `${Math.round(vol * 100)}%`;
    }

    const kb = s.keybindings || {};
    const formatKey = (k) => k.replace('Key', '').replace('Arrow', '↑↓←→ ');
    if (this.btnRebinds.throttle) this.btnRebinds.throttle.innerText = formatKey(kb.throttle || 'KeyW');
    if (this.btnRebinds.brake) this.btnRebinds.brake.innerText = formatKey(kb.brake || 'KeyS');
    if (this.btnRebinds.steerLeft) this.btnRebinds.steerLeft.innerText = formatKey(kb.steerLeft || 'KeyA');
    if (this.btnRebinds.steerRight) this.btnRebinds.steerRight.innerText = formatKey(kb.steerRight || 'KeyD');
    if (this.btnRebinds.handbrake) this.btnRebinds.handbrake.innerText = kb.handbrake || 'Space';
    if (this.btnRebinds.reset) this.btnRebinds.reset.innerText = formatKey(kb.reset || 'KeyR');
  }

  show() {
    this.render();
    if (this.modalEl) this.modalEl.style.display = 'flex';
  }

  hide() {
    this.stopRebinding();
    if (this.modalEl) this.modalEl.style.display = 'none';
  }
}

