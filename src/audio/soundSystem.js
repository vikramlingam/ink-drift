import { settings } from '../game/settings.js';

/**
 * Procedural Web Audio System for Pen-and-Ink Arcade Racer
 * Zero audio assets to download, instant zero-latency playback.
 */

class SoundSystem {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isInitialized = false;

    // Persistent nodes
    this.masterGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.driftGain = null;

    // Load volume and mute preference from settings
    const audioCfg = settings.get('audio') || {};
    this.isMuted = Boolean(audioCfg.muted);
    this.masterVolume = audioCfg.masterVolume !== undefined ? audioCfg.masterVolume : 0.8;
  }

  init() {
    if (this.isInitialized) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.ctx = new AudioContext();

    // 1. Master Output Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0.0 : this.masterVolume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // 2. Continuous engine oscillator
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.setValueAtTime(45, this.ctx.currentTime);

    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.setValueAtTime(450, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);
    this.engineOsc.start();

    // 3. Continuous drift noise (pen scratch on notebook paper)
    this.setupDriftScratchNode();

    this.isInitialized = true;
  }

  setupDriftScratchNode() {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const scratchFilter = this.ctx.createBiquadFilter();
    scratchFilter.type = 'bandpass';
    scratchFilter.frequency.setValueAtTime(1400, this.ctx.currentTime);
    scratchFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    this.driftGain = this.ctx.createGain();
    this.driftGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    whiteNoise.connect(scratchFilter);
    scratchFilter.connect(this.driftGain);
    this.driftGain.connect(this.masterGain);
    whiteNoise.start();
  }

  ensureAudioRunning() {
    if (!this.isInitialized) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMasterVolume(val) {
    this.masterVolume = Math.max(0.0, Math.min(1.0, val));
    if (this.ctx && this.masterGain && !this.isMuted) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.05);
    }
    settings.update({ audio: { muted: this.isMuted, masterVolume: this.masterVolume } });
  }

  updateEngine(speed, maxSpeed, isDrifting, slipRatio) {
    if (!this.isInitialized || !this.ctx || this.isMuted) {
      if (this.engineGain) this.engineGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
      if (this.driftGain) this.driftGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
      return;
    }

    const now = this.ctx.currentTime;
    const ratio = Math.min(Math.max(speed / maxSpeed, 0), 1.6);

    const targetFreq = 55 + ratio * 225;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.05);

    const targetEngineVol = 0.04 + ratio * 0.12;
    this.engineGain.gain.setTargetAtTime(targetEngineVol, now, 0.05);

    const driftVol = isDrifting ? Math.min(slipRatio * 0.22, 0.22) : 0.0;
    this.driftGain.gain.setTargetAtTime(driftVol, now, 0.04);
  }

  playBoost() {
    if (!this.isInitialized || !this.ctx || this.isMuted || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.35);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  playCheckpointChime() {
    if (!this.isInitialized || !this.ctx || this.isMuted || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  playCountdown(isFinal = false) {
    if (!this.isInitialized || !this.ctx || this.isMuted || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isFinal ? 880 : 440, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal ? 0.45 : 0.2));

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (isFinal ? 0.5 : 0.25));
  }

  playFinishFanfare() {
    if (!this.isInitialized || !this.ctx || this.isMuted || !this.masterGain) return;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const now = this.ctx.currentTime + idx * 0.1;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.5);
    });
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0.0 : this.masterVolume, this.ctx.currentTime);
    }
    settings.update({ audio: { muted: this.isMuted, masterVolume: this.masterVolume } });
    return this.isMuted;
  }
}

export const soundSystem = new SoundSystem();
