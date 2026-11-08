import * as THREE from 'three';
import { trackCurve, TRACK_WIDTH } from '../track/trackData.js';
import { settings, BODY_STYLES, DIFFICULTY_PRESETS } from '../game/settings.js';

export class VehiclePhysics {
  constructor(startPos, startHeading = 0, bodyStyleIdx = 0) {
    this.position = startPos.clone();
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.heading = startHeading;
    this.steerAngle = 0;
    
    // Load specs based on body style
    this.applyBodyStyle(bodyStyleIdx);

    this.braking = 52.0;           // Brake decel
    this.reverseSpeed = 16.0;      // Reverse top speed
    this.drag = 0.985;             // Natural rolling friction
    this.maxSteerAngle = 0.62;     // Wheel turn limit (rad)
    this.steerSpeed = 8.5;         // Snappier wheel turn rate
    this.baseTurnSensitivity = 2.6;

    // Drift Tuning
    this.isDrifting = false;
    this.driftFactor = 0.0;
    this.driftGrip = 0.50;
    
    // Boost State
    this.boostTimer = 0.0;
    this.isOffRoad = false;
    this.radius = 1.6;

    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  applyBodyStyle(bodyStyleIdx) {
    const spec = BODY_STYLES[bodyStyleIdx % BODY_STYLES.length];
    const diffKey = settings.get('difficulty') || 'easy';
    const diff = DIFFICULTY_PRESETS[diffKey] || DIFFICULTY_PRESETS.easy;

    this.maxSpeed = spec.topSpeed * diff.speedMultiplier;
    this.boostMaxSpeed = (spec.topSpeed + 18.0) * diff.speedMultiplier;
    this.acceleration = spec.accel;
    this.normalGrip = Math.min(0.97, spec.grip + diff.gripBoost);
    this.driftGrip = diff.driftGrip;
  }

  update(inputs, dt, boostPads = []) {
    const delta = Math.min(dt, 0.06);

    const diffKey = settings.get('difficulty') || 'easy';
    const diff = DIFFICULTY_PRESETS[diffKey] || DIFFICULTY_PRESETS.easy;

    // 1. Boost Countdown
    if (this.boostTimer > 0) {
      this.boostTimer -= delta;
    }
    const currentMaxSpeed = this.boostTimer > 0 ? this.boostMaxSpeed : this.maxSpeed;

    // 2. Vector Directions
    this._forward.set(Math.sin(this.heading), 0, Math.cos(this.heading)).normalize();
    this._right.set(Math.cos(this.heading), 0, -Math.sin(this.heading)).normalize();

    // 3. Decompose velocity
    const forwardSpeed = this.velocity.dot(this._forward);
    let lateralSpeed = this.velocity.dot(this._right);

    // 4. Handle Steering Input with User Settings (Invert & Sensitivity & Difficulty)
    const isInverted = settings.get('steeringInverted') || false;
    const sensitivity = (settings.get('steeringSensitivity') || 1.0) * this.baseTurnSensitivity * diff.turnSpeedBoost;

    // Steer direction: Left key (-1) steers LEFT; if inverted, flip sign
    const effectiveSteerInput = (isInverted ? -1 : 1) * inputs.steer;
    const targetSteer = effectiveSteerInput * this.maxSteerAngle;
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteer, this.steerSpeed * delta);

    // Responsive low and high speed turn authority
    const speedRatio = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / (this.maxSpeed * 0.65), 0.38, 1.15) * Math.sign(forwardSpeed || 1);
    const yawDelta = -this.steerAngle * sensitivity * speedRatio * delta;
    this.heading += yawDelta;

    // Active auto-stabilization in Easy mode (prevents fishtailing)
    if (diff.stabilityAssist) {
      if (Math.abs(inputs.steer) < 0.1 && Math.abs(lateralSpeed) > 1.0) {
        lateralSpeed *= Math.pow(0.85, delta * 60);
      }
    }

    // 5. Drift Initiation & Grip Calculation
    const driftRequested = inputs.handbrake || (inputs.brake && Math.abs(this.steerAngle) > 0.25 && Math.abs(forwardSpeed) > 18.0);
    if (driftRequested) {
      this.isDrifting = true;
      this.driftFactor = THREE.MathUtils.lerp(this.driftFactor, 1.0, 7.0 * delta);
    } else {
      if (Math.abs(lateralSpeed) < 3.0) {
        this.isDrifting = false;
      }
      this.driftFactor = THREE.MathUtils.lerp(this.driftFactor, 0.0, 5.0 * delta);
    }

    const effectiveNormalGrip = Math.min(0.97, this.normalGrip + diff.gripBoost);
    const currentGrip = THREE.MathUtils.lerp(effectiveNormalGrip, diff.driftGrip, this.driftFactor);

    // 6. Acceleration and Braking
    let targetForwardSpeed = forwardSpeed;

    if (inputs.throttle > 0) {
      const accelForce = this.acceleration * (this.boostTimer > 0 ? 1.5 : 1.0);
      targetForwardSpeed += accelForce * inputs.throttle * delta;
      if (targetForwardSpeed > currentMaxSpeed) {
        targetForwardSpeed = currentMaxSpeed;
      }
    } else if (inputs.brake > 0) {
      if (targetForwardSpeed > 0.5) {
        targetForwardSpeed -= this.braking * inputs.brake * delta;
        if (targetForwardSpeed < 0) targetForwardSpeed = 0;
      } else {
        targetForwardSpeed -= this.acceleration * 0.75 * inputs.brake * delta;
        if (targetForwardSpeed < -this.reverseSpeed) {
          targetForwardSpeed = -this.reverseSpeed;
        }
      }
    } else {
      targetForwardSpeed *= Math.pow(this.drag, delta * 60);
      if (Math.abs(targetForwardSpeed) < 0.1) targetForwardSpeed = 0;
    }

    // 7. Lateral slip dampening
    lateralSpeed *= Math.pow(1.0 - currentGrip, delta * 60);

    // 8. Reconstruct velocity
    this.velocity.copy(this._forward).multiplyScalar(targetForwardSpeed)
      .addScaledVector(this._right, lateralSpeed);

    // 9. Off-road Check (paper margin slow down)
    this.checkTrackProximity();
    if (this.isOffRoad) {
      this.velocity.multiplyScalar(0.965);
    }

    // 10. Position Integration (Strictly maintain flat ground plane)
    this.position.addScaledVector(this.velocity, delta);
    this.position.y = 0.0;

    // 11. Check Boost Pads
    this.checkBoostPads(boostPads);

    return {
      speed: this.velocity.length(),
      forwardSpeed,
      lateralSpeed: Math.abs(lateralSpeed),
      isDrifting: this.isDrifting || Math.abs(lateralSpeed) > 4.5,
      slipRatio: this.driftFactor
    };
  }

  triggerBoost(duration = 1.5) {
    this.boostTimer = duration;
    this.velocity.addScaledVector(this._forward, 15.0);
  }

  checkBoostPads(boostPads) {
    for (const pad of boostPads) {
      const dist = this.position.distanceTo(pad.position);
      if (dist < pad.radius) {
        if (this.boostTimer < 0.3) {
          this.triggerBoost(1.6);
          return true;
        }
      }
    }
    return false;
  }

  checkTrackProximity() {
    const nearest = findNearestTrackPoint(this.position);
    this.isOffRoad = nearest.distance > (TRACK_WIDTH / 2 + 1.5);
  }

  resetToTrack(checkpoint) {
    this.position.copy(checkpoint.point);
    this.position.y = 0.0;
    this.velocity.set(0, 0, 0);
    this.heading = Math.atan2(checkpoint.tangent.x, checkpoint.tangent.z);
    this.steerAngle = 0;
    this.boostTimer = 0;
    this.isDrifting = false;
  }

  resolveSoftCarCollision(otherPos, otherRadius = 1.6) {
    const minDistance = this.radius + otherRadius;
    const diff = new THREE.Vector3().subVectors(this.position, otherPos);
    diff.y = 0;
    const dist = diff.length();

    if (dist < minDistance && dist > 0.001) {
      const normal = diff.clone().divideScalar(dist);
      const overlap = minDistance - dist;

      this.position.addScaledVector(normal, overlap * 0.5);
      this.velocity.addScaledVector(normal, 8.0);
      return true;
    }
    return false;
  }
}

function findNearestTrackPoint(pos) {
  let minDist = Infinity;
  let bestPt = null;
  for (let i = 0; i <= 80; i++) {
    const pt = trackCurve.getPointAt(i / 80);
    const d = pos.distanceTo(pt);
    if (d < minDist) {
      minDist = d;
      bestPt = pt;
    }
  }
  return { distance: minDist, point: bestPt };
}
