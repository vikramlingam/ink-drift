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

    // Sync desktop & mobile track selectors
    const selDesktop = document.getElementById('select-track');
    const selMobile = document.getElementById('mobile-select-track');
    if (selDesktop) selDesktop.value = String(trackIndex);
    if (selMobile) selMobile.value = String(trackIndex);

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

    if (this.localCarModel && this.localCarModel.setHeadlights) {
      this.localCarModel.setHeadlights(theme.isDark);
    }
    this.aiRacers.forEach(bot => {
      if (bot.carModel && bot.carModel.setHeadlights) {
        bot.carModel.setHeadlights(theme.isDark);
      }
    });

    const btnTheme = document.getElementById('btn-toggle-theme');
    const btnMobTheme = document.getElementById('btn-mobile-theme');
    const themeLabel = theme.isDark ? '🌙 NIGHT' : '☀️ DAY';
    if (btnTheme) {
      btnTheme.innerText = themeLabel;
    }
    if (btnMobTheme) {
      btnMobTheme.innerText = themeLabel;
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
    const isDark = theme.isDark;
    if (this.currentThemeIsDark !== isDark) {
      this.currentThemeIsDark = isDark;
      this.applyTheme(theme);
      if (this.trackData) {
        this.trackData.dispose();
      }
      this.trackData = buildTrack(this.scene, theme);
      this.boostPads = this.trackData.boostPads;
      this.setupLocalPlayer();
      this.setupBots();
    } else {
      this.applyTheme(theme);
    }
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
    const btnMobDifficulty = document.getElementById('btn-mobile-difficulty');
    this.updateDifficultyUI = () => {
      const diff = settings.get('difficulty') || 'easy';
      const label = `DIFF: ${diff.toUpperCase()}`;
      [btnDifficulty, btnMobDifficulty].forEach(btn => {
        if (!btn) return;
        btn.innerText = label;
        if (diff === 'easy') {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      if (this.localPhysics) {
        const carConfig = settings.get('car') || { bodyStyle: 0 };
        this.localPhysics.applyBodyStyle(carConfig.bodyStyle || 0);
      }
    };
    this.updateDifficultyUI();

    const handleDifficultyToggle = () => {
      const current = settings.get('difficulty') || 'easy';
      const next = current === 'easy' ? 'medium' : current === 'medium' ? 'hard' : 'easy';
      settings.set('difficulty', next);
      this.updateDifficultyUI();
      this.showToast(`DRIVING DIFFICULTY: ${next.toUpperCase()}`);
    };
    if (btnDifficulty) btnDifficulty.addEventListener('click', handleDifficultyToggle);
    if (btnMobDifficulty) btnMobDifficulty.addEventListener('click', handleDifficultyToggle);

    // Top Bar Track Selector (Desktop & Mobile)
    const trackSelect = document.getElementById('select-track');
    const mobileTrackSelect = document.getElementById('mobile-select-track');
    const handleTrackChange = (e) => {
      const idx = parseInt(e.target.value, 10);
      this.switchTrack(idx);
    };
    if (trackSelect) {
      trackSelect.value = String(settings.get('selectedTrack') || 0);
      trackSelect.addEventListener('change', handleTrackChange);
    }
    if (mobileTrackSelect) {
      mobileTrackSelect.value = String(settings.get('selectedTrack') || 0);
      mobileTrackSelect.addEventListener('change', (e) => {
        handleTrackChange(e);
        closeMobileDrawer();
      });
    }

    // Top Bar Theme Toggle (Desktop & Mobile)
    const btnTheme = document.getElementById('btn-toggle-theme');
    const btnMobTheme = document.getElementById('btn-mobile-theme');
    if (btnTheme) btnTheme.addEventListener('click', () => this.toggleTheme());
    if (btnMobTheme) btnMobTheme.addEventListener('click', () => this.toggleTheme());

    // Top Bar Garage Button (Desktop & Mobile)
    const btnGarage = document.getElementById('btn-open-garage');
    const btnMobGarage = document.getElementById('btn-mobile-garage');
    if (btnGarage) btnGarage.addEventListener('click', () => this.garageModal.show());
    if (btnMobGarage) btnMobGarage.addEventListener('click', () => {
      closeMobileDrawer();
      this.garageModal.show();
    });

    // Top Bar Settings Button (Desktop & Mobile)
    const btnSettings = document.getElementById('btn-open-settings');
    const btnMobSettings = document.getElementById('btn-mobile-settings');
    if (btnSettings) btnSettings.addEventListener('click', () => this.settingsModal.show());
    if (btnMobSettings) btnMobSettings.addEventListener('click', () => {
      closeMobileDrawer();
      this.settingsModal.show();
    });

    // Audio Unlock & Toggle
    const btnAudio = document.getElementById('btn-toggle-audio');
    const btnMobAudio = document.getElementById('btn-mobile-audio');
    const updateAudioLabel = () => {
      const label = `AUDIO: ${soundSystem.isMuted ? 'OFF' : 'ON'}`;
      [btnAudio, btnMobAudio].forEach(btn => {
        if (!btn) return;
        btn.innerText = label;
        if (soundSystem.isMuted) {
          btn.classList.remove('active');
        } else {
          btn.classList.add('active');
        }
      });
    };
    updateAudioLabel();

    const handleAudioToggle = () => {
      soundSystem.ensureAudioRunning();
      soundSystem.toggleMute();
      updateAudioLabel();
    };
    if (btnAudio) btnAudio.addEventListener('click', handleAudioToggle);
    if (btnMobAudio) btnMobAudio.addEventListener('click', handleAudioToggle);

    const unlockAudio = () => {
      soundSystem.ensureAudioRunning();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // Bot Toggle (Desktop & Mobile)
    const btnBots = document.getElementById('btn-toggle-bots');
    const btnMobBots = document.getElementById('btn-mobile-bots');
    const handleBotsToggle = () => {
      this.botsEnabled = !this.botsEnabled;
      const label = `BOTS: ${this.botsEnabled ? 'ON' : 'OFF'}`;
      [btnBots, btnMobBots].forEach(btn => {
        if (!btn) return;
        btn.innerText = label;
        if (this.botsEnabled) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      this.setupBots();
    };
    if (btnBots) btnBots.addEventListener('click', handleBotsToggle);
    if (btnMobBots) btnMobBots.addEventListener('click', handleBotsToggle);

    // Mobile Hamburger Menu Drawer Listeners
    const mobileDrawer = document.getElementById('mobile-nav-drawer');
    const mobileOverlay = document.getElementById('mobile-drawer-overlay');
    const btnOpenMobileMenu = document.getElementById('btn-mobile-menu');
    const btnCloseMobileMenu = document.getElementById('btn-close-mobile-menu');

    const openMobileDrawer = () => {
      if (mobileDrawer) mobileDrawer.classList.add('open');
      if (mobileOverlay) mobileOverlay.classList.add('open');
    };

    const closeMobileDrawer = () => {
      if (mobileDrawer) mobileDrawer.classList.remove('open');
      if (mobileOverlay) mobileOverlay.classList.remove('open');
    };

    if (btnOpenMobileMenu) btnOpenMobileMenu.addEventListener('click', openMobileDrawer);
    if (btnCloseMobileMenu) btnCloseMobileMenu.addEventListener('click', closeMobileDrawer);
    if (mobileOverlay) mobileOverlay.addEventListener('click', closeMobileDrawer);

    // Multiplayer Modal & Connections
    const mpModal = document.getElementById('multiplayer-modal');
    const btnCloseMp = document.getElementById('btn-close-multiplayer');
    const mpActiveSection = document.getElementById('mp-active-section');
    const mpRoomText = document.getElementById('mp-current-room-text');
    const mpInputCode = document.getElementById('mp-input-code');
    const btnMpCreate = document.getElementById('btn-mp-create-new');
    const btnMpJoin = document.getElementById('btn-mp-join-code');
    const btnMpCopy = document.getElementById('btn-mp-copy-link');
    const btnJoinMultiplayer = document.getElementById('btn-join-multiplayer');
    const btnMobJoinMp = document.getElementById('btn-mobile-join-mp');
    const btnMobCopyInvite = document.getElementById('btn-mobile-copy-invite');
    const btnInvite = document.getElementById('btn-copy-invite');
    const mobRoomPill = document.getElementById('mobile-room-code-display');

    const updateMpUI = () => {
      if (this.networkManager.isConnected && this.networkManager.roomCode) {
        const text = `● ONLINE: ${this.networkManager.roomCode}`;
        btnJoinMultiplayer.innerText = text;
        btnJoinMultiplayer.classList.add('active');
        if (btnMobJoinMp) {
          btnMobJoinMp.innerText = text;
          btnMobJoinMp.classList.add('active');
        }
        if (mobRoomPill) mobRoomPill.textContent = this.networkManager.roomCode;
        if (mpActiveSection) mpActiveSection.style.display = 'block';
        if (mpRoomText) mpRoomText.textContent = this.networkManager.roomCode;
      } else {
        btnJoinMultiplayer.innerText = 'JOIN MULTIPLAYER';
        btnJoinMultiplayer.classList.remove('active');
        if (btnMobJoinMp) {
          btnMobJoinMp.innerText = 'JOIN MULTIPLAYER';
          btnMobJoinMp.classList.remove('active');
        }
        if (mobRoomPill) mobRoomPill.textContent = 'SOLO';
        if (mpActiveSection) mpActiveSection.style.display = 'none';
      }
    };

    const copyRoomInvite = (room) => {
      const url = `${window.location.origin}${window.location.pathname}?room=${room}`;
      navigator.clipboard.writeText(url).then(() => {
        this.showToast(`INVITE LINK COPIED (ROOM: ${room})`);
      }).catch(() => {
        prompt('Copy this multiplayer invite link to share:', url);
      });
    };

    if (btnCloseMp) {
      btnCloseMp.addEventListener('click', () => {
        if (mpModal) mpModal.style.display = 'none';
      });
    }

    if (btnJoinMultiplayer) {
      btnJoinMultiplayer.addEventListener('click', () => {
        updateMpUI();
        if (mpModal) mpModal.style.display = 'flex';
      });
    }

    if (btnMpCreate) {
      btnMpCreate.addEventListener('click', async () => {
        btnMpCreate.innerText = 'CREATING ROOM...';
        const success = await this.networkManager.initMultiplayer();
        btnMpCreate.innerText = '🏎️ CREATE NEW MULTIPLAYER ROOM';
        if (success) {
          updateMpUI();
          copyRoomInvite(this.networkManager.roomCode);
        } else {
          this.showToast('FAILED TO CREATE MULTIPLAYER ROOM');
        }
      });
    }

    if (btnMpJoin) {
      btnMpJoin.addEventListener('click', async () => {
        const code = (mpInputCode.value || '').trim().toUpperCase();
        if (!code) {
          this.showToast('PLEASE ENTER A VALID ROOM CODE');
          return;
        }
        btnMpJoin.innerText = 'JOINING...';
        const success = await this.networkManager.initMultiplayer(code);
        btnMpJoin.innerText = 'JOIN ROOM';
        if (success) {
          updateMpUI();
          if (mpModal) mpModal.style.display = 'none';
          this.showToast(`JOINED ROOM ${code}`);
        } else {
          this.showToast(`FAILED TO JOIN ROOM ${code}`);
        }
      });
    }

    if (btnMpCopy) {
      btnMpCopy.addEventListener('click', () => {
        if (this.networkManager.roomCode) {
          copyRoomInvite(this.networkManager.roomCode);
        }
      });
    }

    // Top Bar "COPY INVITE" button
    if (btnInvite) {
      btnInvite.addEventListener('click', async () => {
        if (!this.networkManager.isConnected) {
          btnInvite.innerText = 'CREATING...';
          const success = await this.networkManager.initMultiplayer();
          btnInvite.innerText = 'COPY INVITE';
          if (!success) {
            this.showToast('OFFLINE: COULD NOT CONNECT');
            return;
          }
          updateMpUI();
        }
        copyRoomInvite(this.networkManager.roomCode);
      });
    }

    // Mobile Drawer Multiplayer Buttons
    if (btnMobJoinMp) {
      btnMobJoinMp.addEventListener('click', () => {
        closeMobileDrawer();
        if (btnJoinMultiplayer) btnJoinMultiplayer.click();
      });
    }
    if (btnMobCopyInvite) {
      btnMobCopyInvite.addEventListener('click', () => {
        closeMobileDrawer();
        if (btnInvite) btnInvite.click();
      });
    }

    // Auto-join if URL has ?room=... or ?r=...
    const urlParams = new URLSearchParams(window.location.search);
    const initialRoom = urlParams.get('room') || urlParams.get('r');
    if (initialRoom) {
      btnJoinMultiplayer.innerText = 'CONNECTING...';
      this.networkManager.initMultiplayer(initialRoom).then(success => {
        if (success) {
          updateMpUI();
          this.showToast(`JOINED MULTIPLAYER ROOM ${initialRoom.toUpperCase()}`);
        }
      });
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
    const speedKmh = Math.round(physResult.speed * 2.2);
    const speedRatio = Math.min(Math.abs(speedKmh) / 180, 1.0);

    // Update F1 Analog Speedometer needle (-135deg at 0 km/h to +135deg at 200 km/h)
    const needleDeg = -135 + Math.min(Math.max(speedKmh, 0) / 200, 1.1) * 270;
    const needleEl = document.getElementById('dial-needle-group');
    if (needleEl) {
      needleEl.style.transform = `rotate(${needleDeg}deg)`;
    }

    // Digital speed readout
    const digitalSpeedEl = document.getElementById('dial-speed-value');
    if (digitalSpeedEl) {
      digitalSpeedEl.textContent = `${speedKmh}`;
    }

    const legacySpeed = document.getElementById('hud-speed');
    if (legacySpeed) {
      legacySpeed.innerHTML = `${speedKmh} <span style="font-size: 14px;">KM/H</span>`;
    }

    // Dynamic F1 Gear Determination
    const gearEl = document.getElementById('dial-gear-label');
    if (gearEl) {
      if (physResult.speed < -0.5) {
        gearEl.textContent = 'G R';
      } else if (speedKmh < 24) {
        gearEl.textContent = 'G 1';
      } else if (speedKmh < 52) {
        gearEl.textContent = 'G 2';
      } else if (speedKmh < 85) {
        gearEl.textContent = 'G 3';
      } else if (speedKmh < 125) {
        gearEl.textContent = 'G 4';
      } else {
        gearEl.textContent = 'G 5';
      }
    }

    // F1 Steering Wheel Rev / Shift LED lights (7 LEDs)
    const ledThresholds = [0.12, 0.28, 0.44, 0.60, 0.74, 0.86, 0.95];
    const ledClasses = ['lit-green', 'lit-green', 'lit-yellow', 'lit-yellow', 'lit-red', 'lit-red', 'lit-purple'];
    for (let i = 0; i < 7; i++) {
      const led = document.querySelector(`.rev-led[data-led="${i}"]`);
      if (led) {
        if (speedRatio >= ledThresholds[i]) {
          led.classList.add(ledClasses[i]);
        } else {
          led.classList.remove(ledClasses[i]);
        }
      }
    }

    // Current Lap & Lap Time
    const lapEl = document.getElementById('hud-lap');
    if (lapEl) {
      lapEl.innerHTML = `${Math.min(this.raceManager.currentLap, 3)} <span style="font-size: 14px; color: var(--ink-blue-light);">/ 3</span>`;
    }
    const timeEl = document.getElementById('hud-time');
    if (timeEl) {
      timeEl.innerText = this.raceManager.formatTime(this.raceManager.currentLapTime);
    }

    // Drift / Grip Indicator Status
    const driftEl = document.getElementById('hud-drift');
    if (driftEl) {
      if (physResult.isDrifting) {
        driftEl.textContent = `DRIFT: ${Math.round(physResult.slipRatio * 100)}%`;
        driftEl.style.fill = 'var(--ink-crimson)';
      } else {
        driftEl.textContent = 'GRIP: MAX';
        driftEl.style.fill = 'var(--ink-sage)';
      }
    }

    // 11b. Update Mobile Text-Only Floating Corner Telemetry HUD
    const mobPos = document.getElementById('mob-hud-pos');
    if (mobPos) {
      mobPos.innerHTML = `P${this.raceManager.position} <span class="mob-hud-total">/ ${allOpponents.length + 1}</span>`;
    }
    const mobLap = document.getElementById('mob-hud-lap');
    if (mobLap) {
      mobLap.textContent = `${Math.min(this.raceManager.currentLap, 3)}/3`;
    }
    const mobTime = document.getElementById('mob-hud-time');
    if (mobTime) {
      mobTime.textContent = this.raceManager.formatTime(this.raceManager.currentLapTime);
    }
    const mobSpeed = document.getElementById('mob-hud-speed');
    if (mobSpeed) {
      mobSpeed.innerHTML = `${speedKmh} <span class="mob-hud-unit">KM/H</span>`;
    }
    const mobGear = document.getElementById('mob-hud-gear');
    if (mobGear && gearEl) {
      mobGear.textContent = gearEl.textContent || 'G1';
    }
    const mobDrift = document.getElementById('mob-hud-drift');
    if (mobDrift) {
      if (physResult.isDrifting) {
        mobDrift.textContent = `DRIFT ${Math.round(physResult.slipRatio * 100)}%`;
        mobDrift.style.color = 'var(--ink-crimson)';
      } else {
        mobDrift.textContent = 'GRIP: MAX';
        mobDrift.style.color = 'var(--ink-sage)';
      }
    }

    // 12. Render Frame
    this.renderer.render(this.scene, this.isoCamera.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new GameApp();
});
