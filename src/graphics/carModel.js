import * as THREE from 'three';
import { createSketchFillMaterial, attachOutline } from '../shaders/inkMaterial.js';
import { INK_PALETTES } from '../game/settings.js';

export function createCarModel(colorIndex = 0, isLocal = false, bodyStyle = 0, decalNumber = '01', isNight = false) {
  const palette = INK_PALETTES[colorIndex % INK_PALETTES.length];
  const carGroup = new THREE.Group();
  carGroup.name = `Car_${colorIndex}_Style_${bodyStyle}`;

  const bodyMat = createSketchFillMaterial({ color: isNight ? 0x142B47 : palette.fill, jitter: 0.02 });
  const accentMat = createSketchFillMaterial({ color: palette.accent, jitter: 0.02 });
  const wheelMat = createSketchFillMaterial({ color: isNight ? 0x0F172A : 0xF2EFE9, jitter: 0.02 });
  const glassMat = createSketchFillMaterial({ color: isNight ? 0x1E3A5F : 0xDFE7ED, jitter: 0.015 });

  const outlineOpts = {
    color: isNight ? 0xBAE6FD : palette.ink,
    thickness: 0.055,
    jitter: 0.025
  };

  const wheels = [];

  // BUILD BODY BASED ON BODY STYLE
  switch (bodyStyle) {
    case 1: // MONOPOSTO F1
      buildFormulaModel(carGroup, bodyMat, accentMat, glassMat, wheelMat, outlineOpts, wheels, palette);
      break;
    case 2: // SPRINT COUPE
      buildCoupeModel(carGroup, bodyMat, accentMat, glassMat, wheelMat, outlineOpts, wheels, palette);
      break;
    case 3: // CYBER ROADSTER
      buildCyberModel(carGroup, bodyMat, accentMat, glassMat, wheelMat, outlineOpts, wheels, palette);
      break;
    case 0: // WEDGE GT (DEFAULT)
    default:
      buildWedgeModel(carGroup, bodyMat, accentMat, glassMat, wheelMat, outlineOpts, wheels, palette);
      break;
  }

  // Overhead Player Tag / Number Pill
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = isNight ? '#0A192F' : '#FAF8F3';
  ctx.strokeStyle = `#${(isNight ? 0xBAE6FD : palette.ink).toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 44);
  ctx.fillRect(4, 4, 120, 40);

  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = isLocal ? `#${decalNumber}` : `P${colorIndex + 1}`;
  ctx.fillText(label, 64, 24);

  const tagTexture = new THREE.CanvasTexture(canvas);
  tagTexture.minFilter = THREE.LinearFilter;
  const tagMat = new THREE.SpriteMaterial({ map: tagTexture, depthTest: false });
  const tagSprite = new THREE.Sprite(tagMat);
  tagSprite.scale.set(1.8, 0.7, 1);
  tagSprite.position.set(0, 2.3, 0);
  carGroup.add(tagSprite);

  // Night Mode Headlight Projectors
  const headlights = createHeadlightBeams(carGroup);
  headlights.visible = !!isNight;

  return {
    group: carGroup,
    wheels,
    tagSprite,
    palette,
    bodyStyle,
    headlights,
    setHeadlights(visible) {
      if (headlights) headlights.visible = !!visible;
    },
    updateVisuals(steerAngle, speed, delta) {
      wheels.forEach(w => {
        if (w.isFront) {
          w.anchor.rotation.y = steerAngle;
        }
        w.mesh.rotation.x += speed * delta * 2.5;
      });
    }
  };
}

// 1. WEDGE GT
function buildWedgeModel(group, bodyMat, accentMat, glassMat, wheelMat, outlineOpts, wheels) {
  // Main chassis
  const chassisGeo = new THREE.BoxGeometry(2.1, 0.55, 4.4);
  const chassisMesh = new THREE.Mesh(chassisGeo, bodyMat);
  chassisMesh.position.y = 0.45;
  attachOutline(chassisMesh, outlineOpts);
  group.add(chassisMesh);

  // Sloping hood
  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(-1.0, 0);
  hoodShape.lineTo(1.0, 0);
  hoodShape.lineTo(0.85, 1.4);
  hoodShape.lineTo(-0.85, 1.4);
  hoodShape.closePath();
  const hoodGeo = new THREE.ExtrudeGeometry(hoodShape, { depth: 0.2, bevelEnabled: false });
  hoodGeo.rotateX(-Math.PI / 2);
  const hoodMesh = new THREE.Mesh(hoodGeo, accentMat);
  hoodMesh.position.set(0, 0.72, 0.7);
  attachOutline(hoodMesh, outlineOpts);
  group.add(hoodMesh);

  // Canopy
  const cabinGeo = new THREE.BoxGeometry(1.4, 0.5, 1.8);
  const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
  cabinMesh.position.set(0, 0.88, -0.2);
  attachOutline(cabinMesh, outlineOpts);
  group.add(cabinMesh);

  // Rear wing
  const wingGeo = new THREE.BoxGeometry(2.3, 0.08, 0.5);
  const wingMesh = new THREE.Mesh(wingGeo, accentMat);
  wingMesh.position.set(0, 1.15, -1.9);
  attachOutline(wingMesh, outlineOpts);
  group.add(wingMesh);

  [-0.6, 0.6].forEach(x => {
    const strutGeo = new THREE.BoxGeometry(0.08, 0.45, 0.2);
    const strutMesh = new THREE.Mesh(strutGeo, bodyMat);
    strutMesh.position.set(x, 0.9, -1.85);
    attachOutline(strutMesh, outlineOpts);
    group.add(strutMesh);
  });

  addStandardWheels(group, wheelMat, outlineOpts, wheels);
}

// 2. MONOPOSTO F1
function buildFormulaModel(group, bodyMat, accentMat, glassMat, wheelMat, outlineOpts, wheels) {
  // Narrow needle nosecone & cockpit
  const noseGeo = new THREE.ConeGeometry(0.55, 3.2, 5);
  noseGeo.rotateX(Math.PI / 2);
  const noseMesh = new THREE.Mesh(noseGeo, accentMat);
  noseMesh.position.set(0, 0.42, 0.8);
  attachOutline(noseMesh, outlineOpts);
  group.add(noseMesh);

  // Main fuselage cockpit
  const fuseGeo = new THREE.BoxGeometry(1.2, 0.5, 2.6);
  const fuseMesh = new THREE.Mesh(fuseGeo, bodyMat);
  fuseMesh.position.set(0, 0.45, -0.6);
  attachOutline(fuseMesh, outlineOpts);
  group.add(fuseMesh);

  // Overhead airbox intake
  const airboxGeo = new THREE.BoxGeometry(0.45, 0.55, 0.9);
  const airboxMesh = new THREE.Mesh(airboxGeo, accentMat);
  airboxMesh.position.set(0, 0.95, -0.5);
  attachOutline(airboxMesh, outlineOpts);
  group.add(airboxMesh);

  // Front aerofoil wing
  const fWingGeo = new THREE.BoxGeometry(2.5, 0.06, 0.6);
  const fWingMesh = new THREE.Mesh(fWingGeo, accentMat);
  fWingMesh.position.set(0, 0.22, 2.2);
  attachOutline(fWingMesh, outlineOpts);
  group.add(fWingMesh);

  // Large rear wing
  const rWingGeo = new THREE.BoxGeometry(2.4, 0.08, 0.7);
  const rWingMesh = new THREE.Mesh(rWingGeo, accentMat);
  rWingMesh.position.set(0, 1.25, -2.1);
  attachOutline(rWingMesh, outlineOpts);
  group.add(rWingMesh);

  // Wing endplates
  [-1.2, 1.2].forEach(x => {
    const epGeo = new THREE.BoxGeometry(0.04, 0.55, 0.75);
    const epMesh = new THREE.Mesh(epGeo, bodyMat);
    epMesh.position.set(x, 1.25, -2.1);
    attachOutline(epMesh, outlineOpts);
    group.add(epMesh);
  });

  addStandardWheels(group, wheelMat, outlineOpts, wheels, 1.28);
}

// 3. SPRINT COUPE
function buildCoupeModel(group, bodyMat, accentMat, glassMat, wheelMat, outlineOpts, wheels) {
  // Wide muscle body
  const bodyGeo = new THREE.BoxGeometry(2.2, 0.6, 4.3);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 0.48;
  attachOutline(bodyMesh, outlineOpts);
  group.add(bodyMesh);

  // Curved fastback roof
  const roofGeo = new THREE.BoxGeometry(1.5, 0.6, 2.3);
  const roofMesh = new THREE.Mesh(roofGeo, glassMat);
  roofMesh.position.set(0, 0.98, -0.3);
  attachOutline(roofMesh, outlineOpts);
  group.add(roofMesh);

  // Hood scoop stripe
  const scoopGeo = new THREE.BoxGeometry(0.7, 0.15, 1.6);
  const scoopMesh = new THREE.Mesh(scoopGeo, accentMat);
  scoopMesh.position.set(0, 0.8, 0.8);
  attachOutline(scoopMesh, outlineOpts);
  group.add(scoopMesh);

  // Ducktail rear spoiler
  const duckGeo = new THREE.BoxGeometry(2.2, 0.22, 0.25);
  const duckMesh = new THREE.Mesh(duckGeo, accentMat);
  duckMesh.position.set(0, 0.88, -2.05);
  attachOutline(duckMesh, outlineOpts);
  group.add(duckMesh);

  addStandardWheels(group, wheelMat, outlineOpts, wheels);
}

// 4. CYBER ROADSTER
function buildCyberModel(group, bodyMat, accentMat, glassMat, wheelMat, outlineOpts, wheels) {
  // Angular geometric body
  const bodyGeo = new THREE.BoxGeometry(2.3, 0.5, 4.4);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 0.45;
  attachOutline(bodyMesh, outlineOpts);
  group.add(bodyMesh);

  // Low profile speedster windshield
  const shieldGeo = new THREE.BoxGeometry(1.6, 0.35, 0.9);
  const shieldMesh = new THREE.Mesh(shieldGeo, glassMat);
  shieldMesh.position.set(0, 0.8, 0.2);
  attachOutline(shieldMesh, outlineOpts);
  group.add(shieldMesh);

  // Twin speedster headrest pods
  [-0.5, 0.5].forEach(x => {
    const podGeo = new THREE.ConeGeometry(0.28, 1.2, 5);
    podGeo.rotateX(-Math.PI / 2);
    const podMesh = new THREE.Mesh(podGeo, accentMat);
    podMesh.position.set(x, 0.85, -0.8);
    attachOutline(podMesh, outlineOpts);
    group.add(podMesh);
  });

  // Twin rear vertical fins
  [-0.95, 0.95].forEach(x => {
    const finGeo = new THREE.BoxGeometry(0.08, 0.65, 1.4);
    const finMesh = new THREE.Mesh(finGeo, accentMat);
    finMesh.position.set(x, 0.95, -1.4);
    attachOutline(finMesh, outlineOpts);
    group.add(finMesh);
  });

  addStandardWheels(group, wheelMat, outlineOpts, wheels, 1.22);
}

function addStandardWheels(group, wheelMat, outlineOpts, wheels, xOffset = 1.15) {
  const wheelPositions = [
    { x: -xOffset, y: 0.35, z: 1.3, isFront: true },
    { x: xOffset, y: 0.35, z: 1.3, isFront: true },
    { x: -xOffset, y: 0.38, z: -1.3, isFront: false },
    { x: xOffset, y: 0.38, z: -1.3, isFront: false }
  ];

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.35, 10);
  wheelGeo.rotateZ(Math.PI / 2);

  wheelPositions.forEach((pos) => {
    const wheelAnchor = new THREE.Group();
    wheelAnchor.position.set(pos.x, pos.y, pos.z);

    const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
    attachOutline(wheelMesh, outlineOpts);
    wheelAnchor.add(wheelMesh);

    group.add(wheelAnchor);
    wheels.push({
      anchor: wheelAnchor,
      mesh: wheelMesh,
      isFront: pos.isFront
    });
  });
}

function createHeadlightBeams(group) {
  const beamGroup = new THREE.Group();

  // 1. Two glowing round projector lenses on the front of the car
  const lensGeo = new THREE.CircleGeometry(0.22, 16);
  const lensMat = new THREE.MeshBasicMaterial({
    color: 0xE0F2FE,
    side: THREE.DoubleSide
  });

  [-0.65, 0.65].forEach(x => {
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(x, 0.45, 2.22);
    beamGroup.add(lens);
  });

  // 2. Projected trapezoid light beams on the road plane (+Z direction ahead of car)
  // Road surface is at Y = 0.02, beams at Y = 0.045
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x38BDF8,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });

  const rayMat = new THREE.LineBasicMaterial({
    color: 0x7DD3FC,
    transparent: true,
    opacity: 0.70
  });

  // Each headlight projects a forward beam starting at Z = 2.1 and fanning out to Z = 22.0
  [-0.65, 0.65].forEach(xCenter => {
    const beamShape = new THREE.Shape();
    // In 2D shape coords:
    // Y goes from 0.0 to -20.0; when rotateX(-PI/2), Z = -Y => Z goes from 0.0 to +20.0 (FORWARD!)
    beamShape.moveTo(-0.25, 0.0);
    beamShape.lineTo(0.25, 0.0);
    beamShape.lineTo(2.4, -20.0);
    beamShape.lineTo(-2.4, -20.0);
    beamShape.closePath();

    const beamGeo = new THREE.ShapeGeometry(beamShape);
    beamGeo.rotateX(-Math.PI / 2); // Places on floor with normal pointing UP
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.set(xCenter, 0.045, 2.1);
    beamGroup.add(beamMesh);

    // Architectural pen rays along outer beam edges
    const rayPts1 = [
      new THREE.Vector3(xCenter - 0.25, 0.048, 2.1),
      new THREE.Vector3(xCenter - 2.4, 0.048, 22.1)
    ];
    const rayPts2 = [
      new THREE.Vector3(xCenter + 0.25, 0.048, 2.1),
      new THREE.Vector3(xCenter + 2.4, 0.048, 22.1)
    ];
    beamGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rayPts1), rayMat));
    beamGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rayPts2), rayMat));
  });

  group.add(beamGroup);
  return beamGroup;
}

/**
 * Procedural Ballpoint / Blueprint Skidmark Generator
 */
export class SkidmarkManager {
  constructor(scene, maxMarks = 300) {
    this.scene = scene;
    this.maxMarks = maxMarks;
    this.marks = [];
    this.color = 0x102A43;

    this.mat = new THREE.LineBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.65,
      linewidth: 2.0
    });
  }

  setTheme(isNight) {
    this.color = isNight ? 0x38BDF8 : 0x102A43;
    this.mat.color.setHex(this.color);
  }

  addMark(leftRearPos, rightRearPos, alpha = 0.6) {
    if (this.lastLeft && this.lastRight) {
      const pts = [
        this.lastLeft.clone(), leftRearPos.clone(),
        this.lastRight.clone(), rightRearPos.clone()
      ];
      pts.forEach(p => p.y = 0.035);

      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.LineSegments(geo, this.mat.clone());
      line.material.opacity = alpha;
      this.scene.add(line);
      this.marks.push({ mesh: line, life: 1.0 });

      if (this.marks.length > this.maxMarks) {
        const oldest = this.marks.shift();
        this.scene.remove(oldest.mesh);
        oldest.mesh.geometry.dispose();
        oldest.mesh.material.dispose();
      }
    }

    this.lastLeft = leftRearPos.clone();
    this.lastRight = rightRearPos.clone();
  }

  reset() {
    this.lastLeft = null;
    this.lastRight = null;
  }

  clearAll() {
    this.marks.forEach(m => {
      this.scene.remove(m.mesh);
      m.mesh.geometry.dispose();
      m.mesh.material.dispose();
    });
    this.marks = [];
    this.reset();
  }

  update(delta) {
    for (let i = this.marks.length - 1; i >= 0; i--) {
      this.marks[i].life -= delta * 0.04;
      if (this.marks[i].life <= 0.05) {
        this.scene.remove(this.marks[i].mesh);
        this.marks[i].mesh.geometry.dispose();
        this.marks[i].mesh.material.dispose();
        this.marks.splice(i, 1);
      }
    }
  }
}
