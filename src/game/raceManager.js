import * as THREE from 'three';
import { CHECKPOINTS, TOTAL_LAPS } from '../track/trackData.js';
import { soundSystem } from '../audio/soundSystem.js';

export const RACE_STATES = {
  LOBBY: 'LOBBY',
  COUNTDOWN: 'COUNTDOWN',
  RACING: 'RACING',
  FINISHED: 'FINISHED'
};

export class RaceManager {
  constructor(onStateChange, onLeaderboardUpdate) {
    this.state = RACE_STATES.LOBBY;
    this.totalLaps = TOTAL_LAPS;

    this.currentLap = 1;
    this.currentCheckpoint = 0;
    this.targetCheckpoint = 0; // Next checkpoint to cross
    this.hasCrossedStart = false;

    this.lapStartTime = 0;
    this.raceStartTime = 0;
    this.currentLapTime = 0;
    this.bestLapTime = Infinity;
    this.lapTimes = [];
    this.totalTime = 0;
    this.finishTime = 0;
    this.finished = false;
    this.position = 1;

    this.countdownTimer = 3;
    this.countdownElapsed = 0;

    this.onStateChange = onStateChange;
    this.onLeaderboardUpdate = onLeaderboardUpdate;

    this.lastLeaderboardCheck = 0;
  }

  startCountdown() {
    this.state = RACE_STATES.COUNTDOWN;
    this.countdownTimer = 3;
    this.countdownElapsed = 0;
    soundSystem.playCountdown(false);
    if (this.onStateChange) this.onStateChange(this.state, this.countdownTimer);
  }

  startRace() {
    this.state = RACE_STATES.RACING;
    this.currentLap = 1;
    this.currentCheckpoint = 0;
    this.targetCheckpoint = 0; // First goal is crossing start/finish gate CP 0
    this.hasCrossedStart = false;

    this.raceStartTime = performance.now();
    this.lapStartTime = this.raceStartTime;
    this.lapTimes = [];
    this.finished = false;
    this.finishTime = 0;

    soundSystem.playCountdown(true);
    if (this.onStateChange) this.onStateChange(this.state, 'GO!');
  }

  update(delta, now, playerPos, allRacers = []) {
    if (this.state === RACE_STATES.COUNTDOWN) {
      this.countdownElapsed += delta;
      const currentSecond = 3 - Math.floor(this.countdownElapsed);
      if (currentSecond !== this.countdownTimer && currentSecond > 0) {
        this.countdownTimer = currentSecond;
        soundSystem.playCountdown(false);
        if (this.onStateChange) this.onStateChange(this.state, this.countdownTimer);
      } else if (this.countdownElapsed >= 3.0) {
        this.startRace();
      }
      return;
    }

    if (this.state === RACE_STATES.RACING && !this.finished) {
      this.totalTime = (now - this.raceStartTime) * 0.001;
      this.currentLapTime = (now - this.lapStartTime) * 0.001;

      this.checkCheckpoints(playerPos, now);
    }

    // Update real-time leaderboard positions every 80ms
    if (now - this.lastLeaderboardCheck > 80) {
      this.lastLeaderboardCheck = now;
      this.computeLeaderboard(playerPos, allRacers);
    }
  }

  checkCheckpoints(playerPos, now) {
    if (!CHECKPOINTS || CHECKPOINTS.length === 0) return;

    const targetCp = CHECKPOINTS[this.targetCheckpoint];
    const dist = playerPos.distanceTo(targetCp.point);

    if (dist < targetCp.radius * 1.1) {
      // Reached target checkpoint
      this.currentCheckpoint = this.targetCheckpoint;

      if (this.currentCheckpoint === 0) {
        if (!this.hasCrossedStart) {
          // Green flag crossing start line for Lap 1
          this.hasCrossedStart = true;
          this.lapStartTime = now;
          this.targetCheckpoint = 1;
        } else {
          // Completed a full lap
          const completedLapTime = (now - this.lapStartTime) * 0.001;
          this.lapTimes.push(completedLapTime);
          if (completedLapTime < this.bestLapTime) {
            this.bestLapTime = completedLapTime;
          }

          if (this.currentLap >= this.totalLaps) {
            // Officially finished race!
            this.finished = true;
            this.finishTime = this.totalTime;
            this.state = RACE_STATES.FINISHED;
            soundSystem.playFinishFanfare();
            if (this.onStateChange) this.onStateChange(this.state, 'FINISHED');
          } else {
            this.currentLap++;
            this.lapStartTime = now;
            this.targetCheckpoint = 1;
            soundSystem.playCheckpointChime();
          }
        }
      } else {
        // Advance to next checkpoint gate
        this.targetCheckpoint = (this.currentCheckpoint + 1) % CHECKPOINTS.length;
        soundSystem.playCheckpointChime();
      }
    }
  }

  computeLeaderboard(playerPos, allRacers) {
    if (!CHECKPOINTS || CHECKPOINTS.length === 0) return;

    // Accurate progress along track path
    const computeScore = (lap, cpIdx, pos, isFinished, finishTime) => {
      if (isFinished) {
        return 10000000.0 - (finishTime || 999.0);
      }

      const cp = CHECKPOINTS[cpIdx % CHECKPOINTS.length];
      const nextCp = CHECKPOINTS[(cpIdx + 1) % CHECKPOINTS.length];

      const segVec = new THREE.Vector3().subVectors(nextCp.point, cp.point);
      segVec.y = 0;
      const segLenSq = segVec.lengthSq() || 1;

      const toPos = new THREE.Vector3().subVectors(pos, cp.point);
      toPos.y = 0;

      const proj = THREE.MathUtils.clamp(toPos.dot(segVec) / segLenSq, 0.0, 1.0);
      return (lap * 100000.0) + (cpIdx * 1000.0) + (proj * 1000.0);
    };

    const localScore = computeScore(
      this.currentLap,
      this.currentCheckpoint,
      playerPos,
      this.finished,
      this.finishTime
    );

    const scores = [
      {
        id: 'local',
        name: 'YOU',
        score: localScore,
        lap: this.currentLap,
        finished: this.finished,
        isLocal: true
      }
    ];

    allRacers.forEach(racer => {
      const score = computeScore(
        racer.lap || 1,
        racer.checkpoint || 0,
        racer.position,
        racer.finished || false,
        racer.finishTime || 0
      );
      scores.push({
        id: racer.id,
        name: racer.name || racer.id,
        score,
        lap: racer.lap || 1,
        finished: racer.finished || false,
        isLocal: false
      });
    });

    // Sort descending by score
    scores.sort((a, b) => b.score - a.score);

    this.position = scores.findIndex(s => s.isLocal) + 1;

    if (this.onLeaderboardUpdate) {
      this.onLeaderboardUpdate(scores, this.position);
    }
  }

  formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '--:--.--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
}
