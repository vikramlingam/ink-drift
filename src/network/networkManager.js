import * as THREE from 'three';
import { insertCoin, myPlayer, onPlayerJoin, onDisconnect, getRoomCode, isHost } from 'playroomkit';

export class NetworkManager {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.isMultiplayer = false;
    this.roomCode = null;
    this.localPlayerState = null;
    this.remotePlayers = new Map(); // id -> { playerState, model, interpBuffer, lastPacketTime }
    this.sendRate = 20; // 20Hz update packets
    this.lastSendTime = 0;
    this.isConnected = false;
  }

  async initMultiplayer(skipLobby = false) {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('room') || urlParams.get('r');

      await insertCoin({
        skipLobby: skipLobby || Boolean(roomParam),
        maxPlayersPerRoom: 6,
        allowGamepads: false,
        roomCode: roomParam || undefined
      });

      this.roomCode = getRoomCode();
      this.isMultiplayer = true;
      this.isConnected = true;
      this.localPlayerState = myPlayer();

      if (this.callbacks.onRoomConnected) {
        this.callbacks.onRoomConnected(this.roomCode, isHost());
      }

      // Handle players joining
      onPlayerJoin((playerState) => {
        const id = playerState.id;
        if (playerState === this.localPlayerState) {
          // Local player
          return;
        }

        // New remote player connected
        const remoteData = {
          id,
          playerState,
          profile: playerState.getProfile(),
          interpBuffer: [],
          lastPacketTime: performance.now(),
          currentPos: new THREE.Vector3(),
          targetPos: new THREE.Vector3(),
          currentHeading: 0,
          targetHeading: 0,
          speed: 0,
          isDrifting: false,
          lap: 1,
          checkpoint: 0,
          finished: false
        };

        this.remotePlayers.set(id, remoteData);

        if (this.callbacks.onRemotePlayerJoin) {
          this.callbacks.onRemotePlayerJoin(remoteData);
        }

        // Listen for player disconnect
        playerState.onQuit(() => {
          this.handlePlayerLeave(id);
        });
      });

      onDisconnect((playerState) => {
        if (playerState) {
          this.handlePlayerLeave(playerState.id);
        }
      });

      return true;
    } catch (err) {
      console.warn('Playroom multiplayer init skipped or offline:', err);
      this.isMultiplayer = false;
      this.isConnected = false;
      return false;
    }
  }

  handlePlayerLeave(id) {
    const remote = this.remotePlayers.get(id);
    if (remote) {
      if (this.callbacks.onRemotePlayerLeave) {
        this.callbacks.onRemotePlayerLeave(remote);
      }
      this.remotePlayers.delete(id);
    }
  }

  broadcastLocalState(physicsState, raceState, now) {
    if (!this.isMultiplayer || !this.localPlayerState) return;

    if (now - this.lastSendTime < (1000 / this.sendRate)) return;
    this.lastSendTime = now;

    // Compact packet: [x, z, yaw, vx, vz, drift, lap, cp, finished, totalTime]
    const packet = {
      x: Number(physicsState.position.x.toFixed(2)),
      z: Number(physicsState.position.z.toFixed(2)),
      y: Number(physicsState.heading.toFixed(3)),
      vx: Number(physicsState.velocity.x.toFixed(2)),
      vz: Number(physicsState.velocity.z.toFixed(2)),
      d: physicsState.isDrifting ? 1 : 0,
      l: raceState.currentLap,
      c: raceState.currentCheckpoint,
      f: raceState.finished ? 1 : 0,
      t: Number(raceState.totalTime.toFixed(2))
    };

    this.localPlayerState.setState('pos', packet);
  }

  updateRemotePlayers(delta, now) {
    if (!this.isMultiplayer) return;

    this.remotePlayers.forEach((remote) => {
      const state = remote.playerState.getState('pos');
      if (!state) return;

      // Add to snapshot interpolation buffer
      if (remote.lastPacket !== state) {
        remote.lastPacket = state;
        remote.lastPacketTime = now;
        remote.targetPos.set(state.x, 0, state.z);
        remote.targetHeading = state.y;
        remote.speed = Math.hypot(state.vx, state.vz);
        remote.isDrifting = Boolean(state.d);
        remote.lap = state.l;
        remote.checkpoint = state.c;
        remote.finished = Boolean(state.f);
      }

      // Smooth Hermite / Lerp interpolation towards targetPos
      // Extrapolate with dead reckoning if delay > 60ms
      const timeSincePacket = (now - remote.lastPacketTime) * 0.001;
      let extrapPos = remote.targetPos.clone();
      if (timeSincePacket > 0.05 && timeSincePacket < 0.3) {
        if (state.vx !== undefined && state.vz !== undefined) {
          extrapPos.x += state.vx * timeSincePacket;
          extrapPos.z += state.vz * timeSincePacket;
        }
      }

      remote.currentPos.lerp(extrapPos, Math.min(14.0 * delta, 1.0));

      // Handle angular wrap around (-PI to PI)
      let headingDiff = remote.targetHeading - remote.currentHeading;
      while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
      while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
      remote.currentHeading += headingDiff * Math.min(12.0 * delta, 1.0);
    });
  }
}

