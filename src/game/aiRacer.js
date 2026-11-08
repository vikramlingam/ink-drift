import * as THREE from 'three';
import { trackCurve, CHECKPOINTS, BOOST_PAD_PARAMS } from '../track/trackData.js';
import { createCarModel } from '../graphics/carModel.js';
import { settings } from './settings.js';

export class AIRacer {
  constructor(scene, index, name, colorIndex, lateralOffset = 0, uDelta = null, isNight = false, bodyStyle = null) {
    this.index = index;
    this.id = `bot_${index}`;
    this.name = name;
    this.colorIndex = colorIndex;
    this.lateralOffset = lateralOffset;

    const chosenStyle = bodyStyle !== null ? bodyStyle : ((index + 1) % 4);
    this.carData = createCarModel(colorIndex, false, chosenStyle, `0${index + 2}`, isNight);
    this.mesh = this.carData.group;
    scene.add(this.mesh);

    // AI Kinematics
    const startOffset = uDelta !== null ? uDelta : ((index + 1) * 0.015);
    this.u = (1.0 - startOffset) % 1.0;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.heading = 0;
    this.steerAngle = 0;
    this.speed = 0;
    this.boostTimer = 0;

    // Imperfect human driving noise & wobbles
    this.wobblePhase = Math.random() * Math.PI * 2;
    this.mistakeTimer = Math.random() * 5.0;
    this.isMakingMistake = false;

    // Race Tracking
    this.lap = 1;
    this.checkpoint = 0;
    this.targetCheckpoint = 0;
    this.hasCrossedStart = false;
    this.finished = false;
    this.finishTime = 0;
    this.radius = 1.6;

    this.updatePositionFromU();
  }

  updatePositionFromU() {
    if (!trackCurve) return;
    const pt = trackCurve.getPointAt(this.u);
    const tangent = trackCurve.getTangentAt(this.u).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    this.position.copy(pt).addScaledVector(normal, this.lateralOffset);
    this.position.y = 0;
    this.mesh.position.copy(this.position);

    this.heading = Math.atan2(tangent.x, tangent.z);
    this.mesh.rotation.y = this.heading;
  }

  update(delta, raceStarted, playerInfo = null) {
    if (!raceStarted || !trackCurve) return;

    const difficulty = settings.get('difficulty') || 'easy';

    // 1. Boost Countdown
    if (this.boostTimer > 0) {
      this.boostTimer -= delta;
    }

    // 2. Curvature modulation
    const aheadU = (this.u + 0.04) % 1.0;
    const tanNow = trackCurve.getTangentAt(this.u).normalize();
    const tanAhead = trackCurve.getTangentAt(aheadU).normalize();
    const curveSharpness = 1.0 - tanNow.dot(tanAhead);

    // 3. Difficulty-Based Target Speed & Human-like Imperfection
    let baseSpeed = 34.0 + (this.index % 3) * 2.0;

    if (difficulty === 'easy') {
      // In Easy Mode: Bots drive at a much slower, leisurely pace (20-25 km/h)
      // Player cruises at 36-54 km/h and easily wins!
      baseSpeed = 22.0 + (this.index * 1.5);

      // Human-like mistakes timer (wobble or brake too early on curves)
      this.mistakeTimer -= delta;
      if (this.mistakeTimer <= 0) {
        this.isMakingMistake = !this.isMakingMistake;
        this.mistakeTimer = this.isMakingMistake ? 1.5 : 4.0 + Math.random() * 3.0;
      }

      // Dynamic Rubber-banding: If the bot is ahead of the user, it slows down to let user pass
      if (playerInfo && playerInfo.position) {
        const botScore = (this.lap * 1000) + this.checkpoint;
        const playerScore = ((playerInfo.lap || 1) * 1000) + (playerInfo.checkpoint || 0);

        if (botScore > playerScore) {
          // Bot is ahead of user: slow down and yield lead!
          baseSpeed *= 0.68;
        } else if (botScore === playerScore) {
          // In same checkpoint: check distance
          const distToPlayer = this.position.distanceTo(playerInfo.position);
          if (distToPlayer < 20.0) {
            // Keep modest pace so player comfortably stays in 1st place
            baseSpeed = Math.min(baseSpeed, (playerInfo.speed || 30.0) * 0.85);
          }
        }
      }

      if (this.isMakingMistake) {
        // Slow down slightly on mistake
        baseSpeed *= 0.80;
      }
    } else if (difficulty === 'hard') {
      baseSpeed = 38.0 + (this.index % 3) * 3.0;
    }

    let desiredSpeed = baseSpeed;
    if (this.boostTimer > 0) {
      desiredSpeed += 14.0;
    } else if (curveSharpness > 0.12) {
      // Slow down into turns (more pronounced in easy mode)
      const brakeFactor = difficulty === 'easy' ? 0.50 : 0.68;
      desiredSpeed *= brakeFactor;
    }

    this.speed = THREE.MathUtils.lerp(this.speed, desiredSpeed, (this.speed < desiredSpeed ? 2.0 : 4.5) * delta);

    // 4. Advance along track curve
    const curveLength = 650.0;
    const deltaU = (this.speed * delta) / curveLength;
    this.u = (this.u + deltaU) % 1.0;

    // 5. Update Position & Heading
    const pt = trackCurve.getPointAt(this.u);
    const tangent = trackCurve.getTangentAt(this.u).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    // Human-like line variation (imperfect driving)
    this.wobblePhase += delta * 2.5;
    const wobble = (difficulty === 'easy' && this.isMakingMistake) ? Math.sin(this.wobblePhase) * 1.5 : 0;
    const currentOffset = this.lateralOffset + Math.sin(this.u * Math.PI * 8.0) * 0.8 + wobble;

    this.position.copy(pt).addScaledVector(normal, currentOffset);
    this.position.y = 0;
    this.mesh.position.copy(this.position);

    const targetHeading = Math.atan2(tangent.x, tangent.z);
    let headingDiff = targetHeading - this.heading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    this.heading += headingDiff * Math.min(10.0 * delta, 1.0);
    this.mesh.rotation.y = this.heading;

    this.steerAngle = THREE.MathUtils.clamp(headingDiff * 2.0, -0.5, 0.5);
    this.carData.updateVisuals(this.steerAngle, this.speed, delta);

    // 6. Checkpoints & Laps
    this.checkCheckpoints();

    // 7. Check Boost Pads (In easy mode bots occasionally miss them)
    if (difficulty !== 'easy' || Math.random() > 0.25) {
      BOOST_PAD_PARAMS.forEach(padU => {
        if (Math.abs(this.u - padU) < 0.015 && this.boostTimer <= 0) {
          this.boostTimer = 1.4;
        }
      });
    }
  }

  checkCheckpoints() {
    if (!CHECKPOINTS || CHECKPOINTS.length === 0 || this.finished) return;
    const targetCp = CHECKPOINTS[this.targetCheckpoint];
    const dist = this.position.distanceTo(targetCp.point);

    if (dist < targetCp.radius * 1.3) {
      this.checkpoint = this.targetCheckpoint;
      if (this.checkpoint === 0) {
        if (!this.hasCrossedStart) {
          this.hasCrossedStart = true;
          this.targetCheckpoint = 1;
        } else {
          this.lap++;
          if (this.lap > 3) {
            this.finished = true;
            this.finishTime = performance.now() * 0.001;
          } else {
            this.targetCheckpoint = 1;
          }
        }
      } else {
        this.targetCheckpoint = (this.checkpoint + 1) % CHECKPOINTS.length;
      }
    }
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }
}
