/**
 * INK DRIFT Settings and Customization State
 * Persists in localStorage and coordinates player preferences.
 */

const STORAGE_KEY = 'ink_drift_config_v2';

export const BODY_STYLES = [
  { id: 'wedge', name: 'WEDGE GT', desc: 'Balanced top speed & angular downforce', topSpeed: 38, accel: 36, grip: 0.92 },
  { id: 'formula', name: 'MONOPOSTO F1', desc: 'Ultra-responsive steering & quick acceleration', topSpeed: 37, accel: 40, grip: 0.95 },
  { id: 'coupe', name: 'SPRINT COUPE', desc: 'Heavy drift chassis with high slide angle', topSpeed: 39, accel: 34, grip: 0.88 },
  { id: 'cyber', name: 'CYBER ROADSTER', desc: 'Twin aerofoil concept with boost efficiency', topSpeed: 40, accel: 35, grip: 0.90 }
];

export const INK_PALETTES = [
  { id: 'ballpoint', name: 'Ballpoint Blue', ink: 0x102A43, fill: 0xFAF8F3, accent: 0x2A5298, css: '#102A43' },
  { id: 'crimson', name: 'Muted Crimson', ink: 0x8B2635, fill: 0xFAF8F3, accent: 0xC44558, css: '#8B2635' },
  { id: 'sage', name: 'Dark Sage', ink: 0x2D5A43, fill: 0xFAF8F3, accent: 0x4E8768, css: '#2D5A43' },
  { id: 'ochre', name: 'Mustard Ochre', ink: 0xC08226, fill: 0xFAF8F3, accent: 0xE8B052, css: '#C08226' },
  { id: 'violet', name: 'Violet Sepia', ink: 0x542E5E, fill: 0xFAF8F3, accent: 0x8A4F99, css: '#542E5E' },
  { id: 'sienna', name: 'Burnt Sienna', ink: 0xA24936, fill: 0xFAF8F3, accent: 0xD66E58, css: '#A24936' },
  { id: 'cyan', name: 'Blueprint Cyan', ink: 0x005F73, fill: 0xFAF8F3, accent: 0x0A9396, css: '#005F73' },
  { id: 'emerald', name: 'Archival Emerald', ink: 0x1B4332, fill: 0xFAF8F3, accent: 0x2D6A4F, css: '#1B4332' }
];

export const THEMES = {
  DAY: {
    id: 'day',
    name: 'NOTEBOOK DAY',
    bg: 0xFBF9F4,
    grid: 0xCAD5DE,
    margin: 0xE26D68,
    ink: 0x102A43,
    road: 0xFDFBF7,
    curb1: 0x1B3B6F,
    curb2: 0xF5F0E6,
    isDark: false
  },
  NIGHT: {
    id: 'night',
    name: 'BLUEPRINT NIGHT',
    bg: 0x0A192F,
    grid: 0x172E4C,
    margin: 0xE26D68,
    ink: 0xBAE6FD,
    road: 0x0F243E,
    curb1: 0x38BDF8,
    curb2: 0x1E293B,
    isDark: true
  }
};

export const DIFFICULTY_PRESETS = {
  easy: {
    id: 'easy',
    name: 'EASY (ASSISTED)',
    desc: 'High tire grip, auto-stabilization, effortless cornering',
    gripBoost: 0.05,
    driftGrip: 0.65,
    turnSpeedBoost: 1.3,
    speedMultiplier: 0.92,
    stabilityAssist: true
  },
  medium: {
    id: 'medium',
    name: 'MEDIUM (BALANCED)',
    desc: 'Snappy steering, authentic arcade drift dynamics',
    gripBoost: 0.0,
    driftGrip: 0.50,
    turnSpeedBoost: 1.0,
    speedMultiplier: 1.0,
    stabilityAssist: false
  },
  hard: {
    id: 'hard',
    name: 'HARD (PRO RACER)',
    desc: 'Lower grip, high top speed, requires counter-steering',
    gripBoost: -0.04,
    driftGrip: 0.38,
    turnSpeedBoost: 0.95,
    speedMultiplier: 1.08,
    stabilityAssist: false
  }
};

const DEFAULT_SETTINGS = {
  difficulty: 'easy',       // 'easy', 'medium', 'hard' (Default easy for accessible maneuvering)
  steeringInverted: false, // User can toggle
  steeringSensitivity: 1.0, // Multiplier
  keybindings: {
    throttle: 'KeyW',
    brake: 'KeyS',
    steerLeft: 'KeyA',
    steerRight: 'KeyD',
    handbrake: 'Space',
    reset: 'KeyR'
  },
  cameraPreset: 'standard', // 'close', 'standard', 'far'
  theme: 'day',             // 'day', 'night'
  selectedTrack: 0,         // 0 to 4
  car: {
    bodyStyle: 0,           // index into BODY_STYLES
    colorIndex: 0,          // index into INK_PALETTES
    decalNumber: '01'
  },
  audio: {
    muted: false,
    masterVolume: 0.8
  }
};

class SettingsManager {
  constructor() {
    this.data = this.load();
    this.listeners = new Set();
  }

  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
    this.notify();
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  update(patch) {
    Object.assign(this.data, patch);
    this.save();
  }

  resetToDefaults() {
    this.data = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.save();
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    this.listeners.forEach(cb => cb(this.data));
  }

  getTheme() {
    return this.data.theme === 'night' ? THEMES.NIGHT : THEMES.DAY;
  }
}

export const settings = new SettingsManager();

