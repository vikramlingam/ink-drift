import { settings } from '../game/settings.js';

/**
 * Cross-platform Input Handler
 * Supports Keyboard with configurable keybindings, Space, and Mobile Multi-Touch Virtual Controls
 */

export class InputHandler {
  constructor() {
    this.inputs = {
      throttle: 0,
      brake: 0,
      steer: 0,
      handbrake: false,
      reset: false
    };

    this.keys = {};
    this.isTouchDevice = false;

    // Mobile Virtual Touch Controls State
    this.joystick = {
      active: false,
      touchId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      maxRadius: 48
    };

    this.gasPressed = false;
    this.brakePressed = false;

    this.setupKeyboardListeners();
    this.setupTouchListeners();
  }

  setupKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('blur', () => {
      this.keys = {};
      this.gasPressed = false;
      this.brakePressed = false;
      this.joystick.active = false;
    });
  }

  setupTouchListeners() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    this.isTouchDevice = isTouch;

    const mobileControlsContainer = document.getElementById('mobile-controls');
    if (mobileControlsContainer && isTouch) {
      mobileControlsContainer.style.display = 'block';
    }

    const stickZone = document.getElementById('stick-zone');
    const stickNub = document.getElementById('stick-nub');
    const btnGas = document.getElementById('btn-gas');
    const btnBrake = document.getElementById('btn-brake');

    if (!stickZone) return;

    stickZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const rect = stickZone.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      this.joystick.active = true;
      this.joystick.touchId = touch.identifier;
      this.joystick.startX = centerX;
      this.joystick.startY = centerY;
      this.updateJoystickPosition(touch.clientX, touch.clientY, stickNub);
    }, { passive: false });

    stickZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.joystick.touchId) {
          this.updateJoystickPosition(touch.clientX, touch.clientY, stickNub);
          break;
        }
      }
    }, { passive: false });

    const endStick = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joystick.touchId) {
          this.joystick.active = false;
          this.joystick.touchId = null;
          this.inputs.steer = 0;
          if (stickNub) {
            stickNub.style.transform = `translate(0px, 0px)`;
          }
          break;
        }
      }
    };

    stickZone.addEventListener('touchend', endStick);
    stickZone.addEventListener('touchcancel', endStick);

    if (btnGas) {
      btnGas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.gasPressed = true;
      }, { passive: false });
      btnGas.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.gasPressed = false;
      });
      btnGas.addEventListener('touchcancel', (e) => {
        this.gasPressed = false;
      });
    }

    if (btnBrake) {
      btnBrake.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.brakePressed = true;
      }, { passive: false });
      btnBrake.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.brakePressed = false;
      });
      btnBrake.addEventListener('touchcancel', (e) => {
        this.brakePressed = false;
      });
    }
  }

  updateJoystickPosition(clientX, clientY, stickNub) {
    const dx = clientX - this.joystick.startX;
    const dy = clientY - this.joystick.startY;
    const dist = Math.hypot(dx, dy);
    const radius = this.joystick.maxRadius;

    let clampedX = dx;
    let clampedY = dy;
    if (dist > radius) {
      clampedX = (dx / dist) * radius;
      clampedY = (dy / dist) * radius;
    }

    if (stickNub) {
      stickNub.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
    }

    this.inputs.steer = THREE_clamp(clampedX / radius, -1, 1);
  }

  getInputs() {
    const kb = settings.get('keybindings') || {};
    const keyThrottle = kb.throttle || 'KeyW';
    const keyBrake = kb.brake || 'KeyS';
    const keyLeft = kb.steerLeft || 'KeyA';
    const keyRight = kb.steerRight || 'KeyD';
    const keyHandbrake = kb.handbrake || 'Space';
    const keyReset = kb.reset || 'KeyR';

    // Support both custom configured key and standard Arrow keys
    const isUp = this.keys[keyThrottle] || this.keys['ArrowUp'];
    const isDown = this.keys[keyBrake] || this.keys['ArrowDown'];
    const isLeft = this.keys[keyLeft] || this.keys['ArrowLeft'];
    const isRight = this.keys[keyRight] || this.keys['ArrowRight'];
    const isSpace = this.keys[keyHandbrake] || this.keys['Space'];
    const isReset = this.keys[keyReset] || this.keys['KeyR'];

    let steerVal = 0;
    if (isLeft) steerVal -= 1;
    if (isRight) steerVal += 1;

    if (this.joystick.active) {
      steerVal = this.inputs.steer;
    }

    const throttleVal = (isUp || this.gasPressed) ? 1.0 : 0.0;
    const brakeVal = (isDown || this.brakePressed) ? 1.0 : 0.0;
    const handbrakeVal = Boolean(isSpace || (this.brakePressed && this.gasPressed));

    return {
      throttle: throttleVal,
      brake: brakeVal,
      steer: steerVal,
      handbrake: handbrakeVal,
      reset: Boolean(isReset)
    };
  }
}

function THREE_clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
