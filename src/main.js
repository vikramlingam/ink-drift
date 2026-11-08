import * as THREE from 'three';
import { createPaperGround } from './shaders/paperShader.js';
import { updateSketchTime } from './shaders/inkMaterial.js';
import { buildTrack } from './track/trackBuilder.js';
import { trackCurve, CHECKPOINTS, setTrack, currentTrackIndex, TRACK_CONFIGS } from './track/trackData.js';
import { createCarModel, SkidmarkManager } from './graphics/carModel.js';
import { VehiclePhysics } from './physics/vehiclePhysics.js';
import { IsometricCamera } from './camera/isometricCamera.js';
import { InputHandler } from './input/inputHandler.js';
import { soundSystem } from './audio/soundSystem.js';
import { RaceManager, RACE_STATES } from './game/raceManager.js';
import { AIRacer } from './game/aiRacer.js';
import { NetworkManager } from './network/networkManager.js';
import { settings } from './game/settings.js';
import { SettingsModal } from './ui/settingsModal.js';
import { GarageModal } from './ui/garageModal.js';
import { MinimapHUD } from './ui/minimap.js';
import { ConfettiCannon } from './ui/confetti.js';

class GameApp {
  constructor() {
    this.container = document.getElementById('canvas-container');

    // 1. Scene & Renderer Setup
    this.scene = new THREE.Scene();
    const currentTheme = settings.getTheme();
    this.scene.background = new THREE.Color(currentTheme.bg);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // 2. Camera System
    this.isoCamera = new IsometricCamera(this.renderer);

    // 3. Ground Paper Shader
    const { mesh: groundMesh, setTheme: setGroundTheme } = createPaperGround(2400);
    this.groundMesh = groundMesh;
    this.setGroundTheme = setGroundTheme;
    this.setGroundTheme(currentTheme);
    this.scene.add(groundMesh);

    // 4. Initialize Selected Track
    const initialTrackIdx = settings.get('selectedTrack') || 0;
    setTrack(initialTrackIdx);

    // Build initial track
    this.trackData = buildTrack(this.scene, currentTheme);
    this.boostPads = this.trackData.boostPads;

    // Minimap HUD
    this.minimap = new MinimapHUD();
    this.minimap.setTrack(trackCurve, TRACK_CONFIGS[initialTrackIdx].name);

    // Confetti System for 1st Place Victory
    this.confetti = new ConfettiCannon();

    // 5. Skidmark Manager
    this.skidmarks = new SkidmarkManager(this.scene);
    this.skidmarks.setTheme(currentTheme.isDark);

    // 6. Local Player Car Setup
    this.setupLocalPlayer();

    // 7. Input Handler
    this.inputHandler = new InputHandler();

    // 8. Bot Opponents
    this.botsEnabled = true;
    this.aiRacers = [];
    this.setupBots();

    // 9. Remote Players Map
    this.remoteCars = new Map();

    // 10. Race Manager
    this.raceManager = new RaceManager(
      (state, text) => this.handleRaceStateChange(state, text),
      (leaderboard, rank) => this.handleLeaderboardUpdate(leaderboard, rank)
    );

    // 11. Network Manager
    this.networkManager = new NetworkManager({
      onRoomConnected: (roomCode) => {
        document.getElementById('room-code-display').innerText = roomCode;
        this.showToast(`CONNECTED TO ROOM ${roomCode}`);
      },
      onRemotePlayerJoin: (remoteData) => {
        const colorIdx = (this.remoteCars.size + 1) % 6;
        const bodyStyle = (remoteData.profile?.bodyStyle !== undefined) ? remoteData.profile.bodyStyle : 0;
        const decal = (remoteData.profile?.decal) || `0${colorIdx + 1}`;
        const isNight = settings.get('theme') === 'night';

        const remoteModel = createCarModel(colorIdx, false, bodyStyle, decal, isNight);
        this.scene.add(remoteModel.group);
        this.remoteCars.set(remoteData.id, {
          model: remoteModel,
          data: remoteData,
          colorIdx
        });
        this.showToast(`RACER ${remoteData.id.slice(0, 5)} JOINED`);
      },
      onRemotePlayerLeave: (remoteData) => {
        const item = this.remoteCars.get(remoteData.id);
        if (item) {
          this.scene.remove(item.model.group);
          this.remoteCars.delete(remoteData.id);
          this.showToast(`RACER DISCONNECTED`);
        }
      }
    });

    // 12. Modals (Settings & Garage)
    this.settingsModal = new SettingsModal(() => {
      this.applySettingsChange();
    });

    this.garageModal = new GarageModal(() => {
      this.rebuildLocalCar();
      this.showToast('GARAGE CHANGES APPLIED');
    });

    // 13. UI Initialisation
    this.initUI();

    // Apply initial theme classes
    this.applyTheme(currentTheme);

    // 14. Auto start countdown after 1.2s
    setTimeout(() => {
      this.raceManager.startCountdown();
    }, 1200);

    // 15. Animation Loop
    this.lastTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupLocalPlayer() {
    const isNight = settings.get('theme') === 'night';
    const carConfig = settings.get('car') || { bodyStyle: 0, colorIndex: 0, decalNumber: '01' };

    const startPt = trackCurve.getPointAt(0.988);
    const startTangent = trackCurve.getTangentAt(0.988).normalize();
    const startNormal = new THREE.Vector3(-startTangent.z, 0, startTangent.x).normalize();
    const localStartPos = startPt.clone().addScaledVector(startNormal, 2.2);
    const startHeading = Math.atan2(startTangent.x, startTangent.z);

    if (this.localCarModel) {
      this.scene.remove(this.localCarModel.group);
    }

    this.localCarModel = createCarModel(
      carConfig.colorIndex || 0,
      true,
      carConfig.bodyStyle || 0,
      carConfig.decalNumber || '01',
      isNight
    );
    this.scene.add(this.localCarModel.group);

    if (!this.localPhysics) {
      this.localPhysics = new VehiclePhysics(localStartPos, startHeading, carConfig.bodyStyle || 0);
    } else {
      this.localPhysics.position.copy(localStartPos);
      this.localPhysics.velocity.set(0, 0, 0);
      this.localPhysics.heading = startHeading;
      this.localPhysics.steerAngle = 0;
      this.localPhysics.applyBodyStyle(carConfig.bodyStyle || 0);
    }
  }

  rebuildLocalCar() {
    this.setupLocalPlayer();
  }

  setupBots() {
    this.aiRacers.forEach(bot => bot.dispose(this.scene));
    this.aiRacers = [];

    if (this.botsEnabled) {
      const isNight = settings.get('theme') === 'night';
      const botConfigs = [
        { name: 'CRIMSON (BOT)', colorIndex: 1, offset: -2.2, uDelta: 0.022, style: 1 },
        { name: 'SAGE (BOT)', colorIndex: 2, offset: 2.2, uDelta: 0.035, style: 2 },
        { name: 'OCHRE (BOT)', colorIndex: 3, offset: -2.2, uDelta: 0.048, style: 3 }
      ];

      botConfigs.forEach((cfg, idx) => {
        const bot = new AIRacer(this.scene, idx, cfg.name, cfg.colorIndex, cfg.offset, cfg.uDelta, isNight, cfg.style);
        this.aiRacers.push(bot);
      });
    }
  }

  switchTrack(trackIndex) {
    const config = setTrack(trackIndex);
    settings.set('selectedTrack', trackIndex);

    // Update minimap track shape & name
    if (this.minimap) {
      this.minimap.setTrack(trackCurve, config.name);
    }

    // Rebuild track mesh
    if (this.trackData) {
      this.trackData.dispose();
    }
    const currentTheme = settings.getTheme();
    this.trackData = buildTrack(this.scene, currentTheme);
    this.boostPads = this.trackData.boostPads;

    // Clear skidmarks
    this.skidmarks.clearAll();

    // Reset local player to new start line
    const startPt = trackCurve.getPointAt(0.988);
    const startTangent = trackCurve.getTangentAt(0.988).normalize();
    const startNormal = new THREE.Vector3(-startTangent.z, 0, startTangent.x).normalize();
    const localStartPos = startPt.clone().addScaledVector(startNormal, 2.2);
    const startHeading = Math.atan2(startTangent.x, startTangent.z);

    this.localPhysics.position.copy(localStartPos);
    this.localPhysics.velocity.set(0, 0, 0);
    this.localPhysics.heading = startHeading;
    this.localPhysics.steerAngle = 0;
    this.localPhysics.boostTimer = 0;

    // Reset bots to new track
    this.setupBots();

    // Reset race manager
    this.raceManager.startCountdown();
    this.showToast(`SWITCHED TO ${config.name}`);
  }

  applyTheme(theme) {
    if (theme.isDark) {
      document.body.classList.add('theme-night');
    } else {
      document.body.classList.remove('theme-night');
    }

    this.scene.background.setHex(theme.bg);
    this.setGroundTheme(theme);
    this.skidmarks.setTheme(theme.isDark);

    const btnTheme = document.getElementById('btn-toggle-theme');
    if (btnTheme) {
      btnTheme.innerText = theme.isDark ? '🌙 NIGHT' : '☀️ DAY';
    }
  }

  toggleTheme() {
    const current = settings.get('theme') || 'day';
    const next = current === 'day' ? 'night' : 'day';
    settings.set('theme', next);

    const theme = settings.getTheme();
    this.applyTheme(theme);

    // Rebuild track with new theme colors
    if (this.trackData) {
      this.trackData.dispose();
    }
    this.trackData = buildTrack(this.scene, theme);
    this.boostPads = this.trackData.boostPads;

    // Rebuild local player and bots for headlight/shading
    this.setupLocalPlayer();
    this.setupBots();

    this.showToast(`THEME: ${theme.name}`);
  }

  applySettingsChange(data = {}) {
    const theme = settings.getTheme();
    this.applyTheme(theme);
    if (this.updateDifficultyUI) {
      this.updateDifficultyUI();
    }
    if (data && data.volume !== undefined) {
      soundSystem.setMasterVolume(data.volume);
    }
  }

  initUI() {
    // Top Bar Difficulty Toggle Button
    const btnDifficulty = document.getElementById('btn-toggle-difficulty');
    this.updateDifficultyUI = () => {
      const diff = settings.get('difficulty') || 'easy';
      if (btnDifficulty) {
        btnDifficulty.innerText = `DIFF: ${diff.toUpperCase()}`;
        if (diff === 'easy') {
          btnDifficulty.classList.add('active');
        } else {
          btnDifficulty.classList.remove('active');
        }
      }
      if (this.localPhysics) {
        const carConfig = settings.get('car') || { bodyStyle: 0 };
        this.localPhysics.applyBodyStyle(carConfig.bodyStyle || 0);
      }
    };
    this.updateDifficultyUI();

    if (btnDifficulty) {
      btnDifficulty.addEventListener('click', () => {
        const current = settings.get('difficulty') || 'easy';
        const next = current === 'easy' ? 'medium' : current === 'medium' ? 'hard' : 'easy';
        settings.set('difficulty', next);
        this.updateDifficultyUI();
        this.showToast(`DRIVING DIFFICULTY: ${next.toUpperCase()}`);
      });
    }

    // Top Bar Track Selector
    const trackSelect = document.getElementById('select-track');
    if (trackSelect) {
      trackSelect.value = String(settings.get('selectedTrack') || 0);
      trackSelect.addEventListener('change', (e) => {
        const idx = parseInt(e.target.value, 10);
        this.switchTrack(idx);
      });
    }

    // Top Bar Theme Toggle
    const btnTheme = document.getElementById('btn-toggle-theme');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        this.toggleTheme();
      });
    }

    // Top Bar Garage Button
    const btnGarage = document.getElementById('btn-open-garage');
    if (btnGarage) {
      btnGarage.addEventListener('click', () => {
        this.garageModal.show();
      });
    }

    // Top Bar Settings Button
    const btnSettings = document.getElementById('btn-open-settings');
    if (btnSettings) {
      btnSettings.addEventListener('click', () => {
        this.settingsModal.show();
      });
    }

    // Audio Unlock & Toggle
    const btnAudio = document.getElementById('btn-toggle-audio');
    const updateAudioLabel = () => {
      btnAudio.innerText = `AUDIO: ${soundSystem.isMuted ? 'OFF' : 'ON'}`;
      if (soundSystem.isMuted) {
        btnAudio.classList.remove('active');
      } else {
        btnAudio.classList.add('active');
      }
    };
    updateAudioLabel();

    btnAudio.addEventListener('click', () => {
      soundSystem.ensureAudioRunning();
      soundSystem.toggleMute();
      updateAudioLabel();
    });

    const unlockAudio = () => {
      soundSystem.ensureAudioRunning();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // Bot Toggle
    const btnBots = document.getElementById('btn-toggle-bots');
    btnBots.addEventListener('click', () => {
      this.botsEnabled = !this.botsEnabled;
      btnBots.innerText = `BOTS: ${this.botsEnabled ? 'ON' : 'OFF'}`;
      if (this.botsEnabled) {
        btnBots.classList.add('active');
      } else {
        btnBots.classList.remove('active');
      }
      this.setupBots();
    });

    // Copy Invite Link
    const btnInvite = document.getElementById('btn-copy-invite');
    btnInvite.addEventListener('click', () => {
      const room = this.networkManager.roomCode || 'LOBBY';
      const url = `${window.location.origin}${window.location.pathname}?room=${room}`;
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('INVITE LINK COPIED TO CLIPBOARD');
      }).catch(() => {
        this.showToast(`ROOM CODE: ${room}`);
      });
    });

    // Join Multiplayer
    const btnJoinMultiplayer = document.getElementById('btn-join-multiplayer');
    btnJoinMultiplayer.addEventListener('click', async () => {
      btnJoinMultiplayer.innerText = 'CONNECTING...';
      const success = await this.networkManager.initMultiplayer();
      if (success) {
        btnJoinMultiplayer.innerText = 'MULTIPLAYER ACTIVE';
        btnJoinMultiplayer.classList.add('active');
      } else {
        btnJoinMultiplayer.innerText = 'OFFLINE MODE';
      }
    });

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('room') || urlParams.get('r')) {
      this.networkManager.initMultiplayer(true);
    }

    // Race Again
    const btnAgain = document.getElementById('btn-race-again');
    btnAgain.addEventListener('click', () => {
      document.getElementById('recap-overlay').style.display = 'none';
      if (this.confetti) this.confetti.stop();
      const trophy = document.getElementById('golden-trophy-container');
      if (trophy) trophy.style.display = 'none';
      this.resetRace();
    });

    // Copy Stats
    const btnCopyStats = document.getElementById('btn-copy-stats');
    btnCopyStats.addEventListener('click', () => {
      const statsText = `INK DRIFT // Finish Pos: P${this.raceManager.position} | Total: ${this.raceManager.formatTime(this.raceManager.totalTime)} | Best: ${this.raceManager.formatTime(this.raceManager.bestLapTime)}`;
      navigator.clipboard.writeText(statsText).then(() => {
        this.showToast('STATS COPIED TO CLIPBOARD');
      });
    });
  }

  showToast(msg) {
    const toast = document.getElementById('toast-notice');
    toast.innerText = msg;
    toast.style.opacity = '1';
    setTimeout(() => {
      toast.style.opacity = '0';
    }, 2800);
  }

  handleRaceStateChange(state, text) {
    const stamp = document.getElementById('center-stamp');
    const stampText = document.getElementById('stamp-text');

    if (state === RACE_STATES.COUNTDOWN) {
      stamp.style.display = 'block';
      stamp.style.opacity = '1';
      stampText.innerText = text;
      stampText.style.transform = `scale(${1.2 - (text * 0.05)}) rotate(-2deg)`;
    } else if (state === RACE_STATES.RACING) {
      stampText.innerText = 'GO!';
      stampText.style.transform = 'scale(1.4) rotate(3deg)';
      setTimeout(() => {
        stamp.style.opacity = '0';
        setTimeout(() => { stamp.style.display = 'none'; }, 200);
      }, 700);
    } else if (state === RACE_STATES.FINISHED) {
      stamp.style.display = 'block';
      stamp.style.opacity = '1';
      stampText.innerText = 'FINISHED';
      setTimeout(() => {
        this.showRecapCard();
      }, 1000);
    }
  }

  handleLeaderboardUpdate(scores, rank) {
    document.getElementById('hud-position').innerHTML = `P${rank} <span style="font-size: 14px; color: var(--ink-blue-light);">/ ${scores.length}</span>`;

    const rowsContainer = document.getElementById('leaderboard-rows');
    rowsContainer.innerHTML = '';

    scores.forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = `leaderboard-row ${s.isLocal ? 'is-local' : ''}`;
      row.innerHTML = `
        <span>${idx + 1}. ${s.name}</span>
        <span>${s.finished ? 'FIN' : `L${s.lap}`}</span>
      `;
      rowsContainer.appendChild(row);
    });
  }

  showRecapCard() {
    const recap = document.getElementById('recap-overlay');
    recap.style.display = 'flex';

    const rank = this.raceManager.position;
    const rankSuffix = rank === 1 ? '1ST PLACE' : rank === 2 ? '2ND PLACE' : rank === 3 ? '3RD PLACE' : `${rank}TH PLACE`;
    document.getElementById('recap-position-stamp').innerText = rankSuffix;
    document.getElementById('recap-total-time').innerText = this.raceManager.formatTime(this.raceManager.totalTime);
    document.getElementById('recap-best-lap').innerText = this.raceManager.formatTime(this.raceManager.bestLapTime);

    // 1st Place Golden Trophy Cup & Colorful Confetti Celebration
    const trophy = document.getElementById('golden-trophy-container');
    if (rank === 1) {
      if (trophy) trophy.style.display = 'flex';
      if (this.confetti) this.confetti.burst(180);
    } else {
      if (trophy) trophy.style.display = 'none';
      if (this.confetti) this.confetti.stop();
    }

    const lapList = document.getElementById('recap-lap-list');
    lapList.innerHTML = '';
    this.raceManager.lapTimes.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'recap-lap-row';
      const isBest = t === this.raceManager.bestLapTime;
      row.innerHTML = `
        <span>LAP 0${i + 1}</span>
        <span style="${isBest ? 'color: var(--ink-crimson); font-weight: 700;' : ''}">${this.raceManager.formatTime(t)} ${isBest ? '★ BEST' : ''}</span>
      `;
      lapList.appendChild(row);
    });
  }

  resetRace() {
    if (this.confetti) this.confetti.stop();
    const trophy = document.getElementById('golden-trophy-container');
    if (trophy) trophy.style.display = 'none';

    const startPt = trackCurve.getPointAt(0.988);
    const startTangent = trackCurve.getTangentAt(0.988).normalize();
    const startNormal = new THREE.Vector3(-startTangent.z, 0, startTangent.x).normalize();
    const localStartPos = startPt.clone().addScaledVector(startNormal, 2.2);
    const startHeading = Math.atan2(startTangent.x, startTangent.z);

    this.localPhysics.position.copy(localStartPos);
    this.localPhysics.velocity.set(0, 0, 0);
    this.localPhysics.heading = startHeading;
    this.localPhysics.steerAngle = 0;
    this.localPhysics.boostTimer = 0;
    this.localPhysics.isDrifting = false;

    this.skidmarks.clearAll();
    this.setupBots();
    this.raceManager.startCountdown();
  }

  animate(now) {
    requestAnimationFrame(this.animate);

    const delta = Math.min((now - this.lastTime) * 0.001, 0.05);
    this.lastTime = now;

    // 1. Advance 12fps sketch line-boil uniform
    updateSketchTime(delta);

    // 2. Fetch User Inputs
    const inputs = this.inputHandler.getInputs();

    if (inputs.reset) {
      const cp = CHECKPOINTS[this.raceManager.currentCheckpoint] || CHECKPOINTS[0];
      this.localPhysics.resetToTrack(cp);
    }

    // 3. Update Local Vehicle Physics
    const raceActive = this.raceManager.state === RACE_STATES.RACING;
    const effectiveInputs = raceActive ? inputs : { throttle: 0, brake: 0, steer: inputs.steer, handbrake: false };

    const physResult = this.localPhysics.update(effectiveInputs, delta, this.boostPads);

    // Update Local Car Mesh
    this.localCarModel.group.position.copy(this.localPhysics.position);
    this.localCarModel.group.rotation.y = this.localPhysics.heading;
    this.localCarModel.updateVisuals(this.localPhysics.steerAngle, physResult.speed, delta);

    // 4. Ballpoint Tire Skidmark Generation
    if (physResult.isDrifting) {
      const forward = this.localPhysics._forward;
      const right = this.localPhysics._right;
      const leftRear = this.localPhysics.position.clone()
        .addScaledVector(right, -1.15)
        .addScaledVector(forward, -1.3);
      const rightRear = this.localPhysics.position.clone()
        .addScaledVector(right, 1.15)
        .addScaledVector(forward, -1.3);
      this.skidmarks.addMark(leftRear, rightRear, Math.min(physResult.slipRatio * 0.8, 0.75));
    } else {
      this.skidmarks.reset();
    }
    this.skidmarks.update(delta);

    // 5. Update AI Bots
    const playerInfo = {
      position: this.localPhysics.position,
      speed: physResult.speed,
      lap: this.raceManager.currentLap,
      checkpoint: this.raceManager.currentCheckpoint
    };

    this.aiRacers.forEach(bot => {
      bot.update(delta, raceActive, playerInfo);
      this.localPhysics.resolveSoftCarCollision(bot.position, bot.radius);
    });

    // 6. Update Remote Players
    this.networkManager.updateRemotePlayers(delta, now);
    this.networkManager.remotePlayers.forEach(remote => {
      const car = this.remoteCars.get(remote.id);
      if (car) {
        car.model.group.position.copy(remote.currentPos);
        car.model.group.rotation.y = remote.currentHeading;
        car.model.updateVisuals(0, remote.speed, delta);
        this.localPhysics.resolveSoftCarCollision(remote.currentPos, 1.6);
      }
    });

    // 7. Broadcast Local State
    this.networkManager.broadcastLocalState(this.localPhysics, this.raceManager, now);

    // 8. Update Camera
    this.isoCamera.update(
      this.localPhysics.position,
      this.localPhysics.heading,
      physResult.speed,
      delta
    );

    // 9. Update Sound System
    soundSystem.updateEngine(
      physResult.speed,
      this.localPhysics.maxSpeed,
      physResult.isDrifting,
      physResult.slipRatio
    );

    // 10. Update Race Manager & Leaderboard
    const allOpponents = [];
    this.aiRacers.forEach(b => {
      allOpponents.push({
        id: b.id,
        name: b.name,
        position: b.position,
        lap: b.lap,
        checkpoint: b.checkpoint,
        finished: b.finished,
        finishTime: b.finishTime
      });
    });
    this.networkManager.remotePlayers.forEach(r => {
      allOpponents.push({
        id: r.id,
        name: `RACER_${r.id.slice(0, 4)}`,
        position: r.currentPos,
        lap: r.lap,
        checkpoint: r.checkpoint,
        finished: r.finished,
        finishTime: r.playerState?.getState('finishTime') || 0
      });
    });

    this.raceManager.update(delta, now, this.localPhysics.position, allOpponents);

    // Update Translucent Corner Minimap
    if (this.minimap) {
      this.minimap.update(this.localPhysics.position, this.localPhysics.heading, allOpponents);
    }

    // 11. Update HUD Telemetry
    document.getElementById('hud-speed').innerHTML = `${Math.round(physResult.speed * 2.2)} <span style="font-size: 14px;">KM/H</span>`;
    document.getElementById('hud-lap').innerHTML = `${Math.min(this.raceManager.currentLap, 3)} <span style="font-size: 14px; color: var(--ink-blue-light);">/ 3</span>`;
    document.getElementById('hud-time').innerText = this.raceManager.formatTime(this.raceManager.currentLapTime);

    const driftEl = document.getElementById('hud-drift');
    if (physResult.isDrifting) {
      driftEl.innerText = `DRIFT: ${Math.round(physResult.slipRatio * 100)}%`;
      driftEl.style.color = 'var(--ink-crimson)';
    } else {
      driftEl.innerText = 'GRIP: MAX';
      driftEl.style.color = 'var(--ink-sage)';
    }

    // 12. Render Frame
    this.renderer.render(this.scene, this.isoCamera.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new GameApp();
});
