import * as THREE from 'three';
import { settings } from '../game/settings.js';

export class IsometricCamera {
  constructor(renderer) {
    this.renderer = renderer;

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(36, aspect, 0.1, 1000);

    this.baseDistance = 46.0;
    this.elevation = 38.0;

    this.currentLookAt = new THREE.Vector3();
    this.targetLookAt = new THREE.Vector3();

    this.setupResizeListener();
  }

  setupResizeListener() {
    window.addEventListener('resize', () => {
      this.handleResize();
    });
    this.handleResize();
  }

  handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;

    this.camera.aspect = aspect;

    if (aspect < 1.0) {
      this.camera.fov = 48;
    } else if (aspect < 1.4) {
      this.camera.fov = 40;
    } else {
      this.camera.fov = 34;
    }

    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  update(targetPos, targetHeading, speed, delta) {
    // Read user camera preset
    const preset = settings.get('cameraPreset') || 'standard';
    let targetBaseDist = 46.0;
    let targetElev = 38.0;

    if (preset === 'close') {
      targetBaseDist = 34.0;
      targetElev = 26.0;
    } else if (preset === 'far') {
      targetBaseDist = 60.0;
      targetElev = 48.0;
    }

    this.baseDistance = THREE.MathUtils.lerp(this.baseDistance, targetBaseDist, 4.0 * delta);
    this.elevation = THREE.MathUtils.lerp(this.elevation, targetElev, 4.0 * delta);

    // Dynamic speed zoom
    const speedRatio = Math.min(speed / 45.0, 1.0);
    const dynamicDist = this.baseDistance + speedRatio * 8.0;
    const dynamicElevation = this.elevation + speedRatio * 5.0;

    const isoAngle = Math.PI * 0.25;
    const isoX = Math.sin(isoAngle) * dynamicDist;
    const isoZ = Math.cos(isoAngle) * dynamicDist;

    const leadDistance = speed * 0.28;
    this.targetLookAt.set(
      targetPos.x + Math.sin(targetHeading) * leadDistance,
      0.5,
      targetPos.z + Math.cos(targetHeading) * leadDistance
    );

    this.currentLookAt.lerp(this.targetLookAt, 8.0 * delta);

    const desiredCamPos = new THREE.Vector3(
      this.currentLookAt.x - isoX,
      dynamicElevation,
      this.currentLookAt.z + isoZ
    );

    this.camera.position.lerp(desiredCamPos, 7.5 * delta);
    this.camera.lookAt(this.currentLookAt);
  }
}
