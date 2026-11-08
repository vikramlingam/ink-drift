import * as THREE from 'three';
import { trackCurve, TRACK_WIDTH, BOOST_PAD_PARAMS, CHECKPOINTS } from './trackData.js';
import { createSketchFillMaterial, attachOutline } from '../shaders/inkMaterial.js';

export function buildTrack(scene, theme = null) {
  const isNight = theme && theme.isDark;
  const trackGroup = new THREE.Group();
  trackGroup.name = 'TrackGroup';

  const segments = 450;
  const halfWidth = TRACK_WIDTH / 2;

  // Road geometry construction
  const roadPositions = [];
  const roadNormals = [];
  const roadUvs = [];
  const roadIndices = [];

  const leftEdgePositions = [];
  const rightEdgePositions = [];
  const centerLinePositions = [];

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const pt = trackCurve.getPointAt(u % 1.0);
    const tangent = trackCurve.getTangentAt(u % 1.0).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    const leftPt = pt.clone().addScaledVector(normal, halfWidth);
    const rightPt = pt.clone().addScaledVector(normal, -halfWidth);

    roadPositions.push(leftPt.x, 0.02, leftPt.z);
    roadPositions.push(rightPt.x, 0.02, rightPt.z);

    roadNormals.push(0, 1, 0);
    roadNormals.push(0, 1, 0);

    roadUvs.push(0, u * 40.0);
    roadUvs.push(1, u * 40.0);

    leftEdgePositions.push(leftPt.x, 0.03, leftPt.z);
    rightEdgePositions.push(rightPt.x, 0.03, rightPt.z);
    centerLinePositions.push(pt.x, 0.03, pt.z);

    if (i < segments) {
      const idx = i * 2;
      roadIndices.push(idx, idx + 2, idx + 1);
      roadIndices.push(idx + 1, idx + 2, idx + 3);
    }
  }

  // 1. Road surface mesh
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
  roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roadNormals, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIndices);

  const roadMaterial = createSketchFillMaterial({
    color: isNight ? 0x0F253F : 0xFDFBF7,
    jitter: 0.015
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMaterial);
  trackGroup.add(roadMesh);

  // 2. Crisp pen border lines
  const borderMat = new THREE.LineBasicMaterial({
    color: isNight ? 0xBAE6FD : 0x102A43,
    linewidth: 2.5
  });

  const leftLineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(leftEdgePositions, 3));
  const leftLine = new THREE.Line(leftLineGeo, borderMat);
  trackGroup.add(leftLine);

  const rightLineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rightEdgePositions, 3));
  const rightLine = new THREE.Line(rightLineGeo, borderMat);
  trackGroup.add(rightLine);

  // 3. Dashed center line
  const centerLineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(centerLinePositions, 3));
  const centerLineMat = new THREE.LineDashedMaterial({
    color: isNight ? 0x38BDF8 : 0x2A5298,
    dashSize: 3.0,
    gapSize: 2.5,
    linewidth: 1.5
  });
  const centerLine = new THREE.Line(centerLineGeo, centerLineMat);
  centerLine.computeLineDistances();
  trackGroup.add(centerLine);

  // 4. Curbs
  buildCurbs(trackGroup, segments, halfWidth, isNight);

  // 5. Track barriers
  buildBarriers(trackGroup, segments, halfWidth, isNight);

  // 6. Boost Pads
  const boostPads = buildBoostPads(trackGroup, isNight);

  // 7. Start / Finish Line & Gantry Banner
  buildStartFinish(trackGroup, isNight);

  // 8. Architectural Scenery (Trees, Compass, Grid)
  buildDoodlesAndScenery(trackGroup, isNight);

  scene.add(trackGroup);

  return {
    trackGroup,
    boostPads,
    checkpoints: CHECKPOINTS,
    dispose() {
      scene.remove(trackGroup);
      trackGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }
  };
}

function buildCurbs(trackGroup, segments, halfWidth, isNight) {
  const curbMat1 = createSketchFillMaterial({ color: isNight ? 0x0284C7 : 0x1B3B6F, jitter: 0.015 });
  const curbMat2 = createSketchFillMaterial({ color: isNight ? 0x1E293B : 0xF5F0E6, jitter: 0.015 });
  const outlineColor = isNight ? 0xBAE6FD : 0x102A43;

  for (let i = 0; i < segments; i += 3) {
    const u = i / segments;
    const isCorner = (u > 0.12 && u < 0.28) || (u > 0.45 && u < 0.65) || (u > 0.75 && u < 0.95);
    if (!isCorner) continue;

    const pt = trackCurve.getPointAt(u);
    const tangent = trackCurve.getTangentAt(u).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    [-1, 1].forEach((side) => {
      const curbPt = pt.clone().addScaledVector(normal, side * (halfWidth + 0.6));
      const curbGeo = new THREE.BoxGeometry(2.0, 0.12, 1.2);
      const curbMesh = new THREE.Mesh(curbGeo, (Math.floor(i / 3) % 2 === 0) ? curbMat1 : curbMat2);
      curbMesh.position.copy(curbPt);
      curbMesh.position.y = 0.06;
      curbMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      attachOutline(curbMesh, { color: outlineColor, thickness: 0.04 });
      trackGroup.add(curbMesh);
    });
  }
}

function buildBarriers(trackGroup, segments, halfWidth, isNight) {
  const barrierMat = createSketchFillMaterial({ color: isNight ? 0x142A45 : 0xF0ECE1, jitter: 0.02 });
  const outlineColor = isNight ? 0xBAE6FD : 0x102A43;

  for (let i = 0; i < segments; i += 8) {
    const u = i / segments;
    const isHighSpeedCurve = (u > 0.15 && u < 0.32) || (u > 0.48 && u < 0.68) || (u > 0.72 && u < 0.92);
    if (!isHighSpeedCurve) continue;

    const pt = trackCurve.getPointAt(u);
    const tangent = trackCurve.getTangentAt(u).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    [-1, 1].forEach(side => {
      const postPt = pt.clone().addScaledVector(normal, side * (halfWidth + 2.0));
      const postGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.0, 6);
      const postMesh = new THREE.Mesh(postGeo, barrierMat);
      postMesh.position.copy(postPt);
      postMesh.position.y = 0.5;
      attachOutline(postMesh, { color: outlineColor, thickness: 0.04 });
      trackGroup.add(postMesh);
    });
  }
}

function buildBoostPads(trackGroup, isNight) {
  const boostPads = [];
  const boostChevronMat = createSketchFillMaterial({ color: isNight ? 0x38BDF8 : 0x1A365D, jitter: 0.02 });
  const boostBaseMat = createSketchFillMaterial({ color: isNight ? 0x1E3A5F : 0xFAEDCD, jitter: 0.015 });
  const outlineColor = isNight ? 0xBAE6FD : 0x102A43;

  BOOST_PAD_PARAMS.forEach((u, index) => {
    const pt = trackCurve.getPointAt(u);
    const tangent = trackCurve.getTangentAt(u).normalize();

    const padGroup = new THREE.Group();
    padGroup.position.copy(pt);
    padGroup.position.y = 0.04;
    padGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

    const baseGeo = new THREE.PlaneGeometry(TRACK_WIDTH * 0.75, 4.5);
    baseGeo.rotateX(-Math.PI / 2);
    const baseMesh = new THREE.Mesh(baseGeo, boostBaseMat);
    attachOutline(baseMesh, { color: outlineColor, thickness: 0.03 });
    padGroup.add(baseMesh);

    for (let c = -1; c <= 1; c++) {
      const chevronShape = new THREE.Shape();
      chevronShape.moveTo(-3.0, -0.6);
      chevronShape.lineTo(0, 0.6);
      chevronShape.lineTo(3.0, -0.6);
      chevronShape.lineTo(2.2, -0.6);
      chevronShape.lineTo(0, 0.2);
      chevronShape.lineTo(-2.2, -0.6);
      chevronShape.closePath();

      const chevronGeo = new THREE.ShapeGeometry(chevronShape);
      // rotateX(+PI/2) points chevron forward along +Z (tangent direction of track travel)
      chevronGeo.rotateX(Math.PI / 2);
      const chevronMesh = new THREE.Mesh(chevronGeo, boostChevronMat);
      chevronMesh.position.set(0, 0.01, c * 1.2);
      attachOutline(chevronMesh, { color: outlineColor, thickness: 0.02 });
      padGroup.add(chevronMesh);
    }

    trackGroup.add(padGroup);

    boostPads.push({
      index,
      u,
      position: pt.clone(),
      direction: tangent.clone(),
      radius: TRACK_WIDTH * 0.45
    });
  });

  return boostPads;
}

function buildStartFinish(trackGroup, isNight) {
  const u = 0.0;
  const pt = trackCurve.getPointAt(u);
  const tangent = trackCurve.getTangentAt(u).normalize();

  const gantryGroup = new THREE.Group();
  gantryGroup.position.copy(pt);
  gantryGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

  // Checkered finish line
  const cols = 14;
  const rows = 2;
  const squareW = TRACK_WIDTH / cols;
  const squareH = 1.0;
  const darkColor = isNight ? 0x0A192F : 0x102A43;
  const lightColor = isNight ? 0xBAE6FD : 0xFBF9F4;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBlack = (r + c) % 2 === 0;
      const sqMat = createSketchFillMaterial({
        color: isBlack ? darkColor : lightColor,
        jitter: 0.015
      });
      const sqGeo = new THREE.PlaneGeometry(squareW, squareH);
      sqGeo.rotateX(-Math.PI / 2);
      const sqMesh = new THREE.Mesh(sqGeo, sqMat);
      sqMesh.position.set(-TRACK_WIDTH / 2 + (c + 0.5) * squareW, 0.03, (r - 0.5) * squareH);
      gantryGroup.add(sqMesh);
    }
  }

  // Overhead gantry arch
  const archMat = createSketchFillMaterial({ color: isNight ? 0x162B46 : 0xF4F0E6, jitter: 0.02 });
  const outlineColor = isNight ? 0xBAE6FD : 0x102A43;

  const postGeo = new THREE.BoxGeometry(0.6, 6.0, 0.6);
  const leftPillar = new THREE.Mesh(postGeo, archMat);
  leftPillar.position.set(-TRACK_WIDTH / 2 - 0.8, 3.0, 0);
  attachOutline(leftPillar, { color: outlineColor, thickness: 0.05 });
  gantryGroup.add(leftPillar);

  const rightPillar = new THREE.Mesh(postGeo, archMat);
  rightPillar.position.set(TRACK_WIDTH / 2 + 0.8, 3.0, 0);
  attachOutline(rightPillar, { color: outlineColor, thickness: 0.05 });
  gantryGroup.add(rightPillar);

  // Crossbar banner with ballpoint / blueprint text
  const crossGeo = new THREE.BoxGeometry(TRACK_WIDTH + 2.5, 1.2, 0.4);
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 512;
  bannerCanvas.height = 128;
  const bCtx = bannerCanvas.getContext('2d');
  bCtx.fillStyle = isNight ? '#0B1E36' : '#FAF8F3';
  bCtx.fillRect(0, 0, 512, 128);
  bCtx.strokeStyle = isNight ? '#BAE6FD' : '#102A43';
  bCtx.lineWidth = 6;
  bCtx.strokeRect(6, 6, 500, 116);
  bCtx.fillStyle = isNight ? '#BAE6FD' : '#102A43';
  bCtx.font = 'bold 36px monospace';
  bCtx.textAlign = 'center';
  bCtx.textBaseline = 'middle';
  bCtx.fillText('START / FINISH // 3 LAPS', 256, 64);
  const bannerTex = new THREE.CanvasTexture(bannerCanvas);
  bannerTex.minFilter = THREE.LinearFilter;
  const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex });
  const crossMesh = new THREE.Mesh(crossGeo, bannerMat);
  crossMesh.position.set(0, 5.8, 0);
  attachOutline(crossMesh, { color: outlineColor, thickness: 0.05 });
  gantryGroup.add(crossMesh);

  // Starting Grid Markings (Grid Boxes 1, 2, 3, 4)
  const gridMat = new THREE.LineBasicMaterial({ color: outlineColor, linewidth: 2 });
  const gridOffsets = [
    { z: -8.0, x: 2.2 },
    { z: -14.0, x: -2.2 },
    { z: -20.0, x: 2.2 },
    { z: -26.0, x: -2.2 }
  ];

  gridOffsets.forEach((slot) => {
    const boxPts = [
      new THREE.Vector3(slot.x - 1.8, 0.035, slot.z - 2.5),
      new THREE.Vector3(slot.x + 1.8, 0.035, slot.z - 2.5),
      new THREE.Vector3(slot.x + 1.8, 0.035, slot.z + 2.5),
      new THREE.Vector3(slot.x - 1.8, 0.035, slot.z + 2.5),
      new THREE.Vector3(slot.x - 1.8, 0.035, slot.z - 2.5)
    ];
    const boxGeo = new THREE.BufferGeometry().setFromPoints(boxPts);
    const boxLine = new THREE.Line(boxGeo, gridMat);
    gantryGroup.add(boxLine);
  });

  trackGroup.add(gantryGroup);
}

function buildDoodlesAndScenery(trackGroup, isNight) {
  const treePositions = [
    new THREE.Vector3(-40, 0, 40),
    new THREE.Vector3(-60, 0, 60),
    new THREE.Vector3(20, 0, 60),
    new THREE.Vector3(60, 0, 110),
    new THREE.Vector3(0, 0, 140),
    new THREE.Vector3(60, 0, 200),
    new THREE.Vector3(120, 0, 220),
    new THREE.Vector3(140, 0, 280),
    new THREE.Vector3(60, 0, 310),
    new THREE.Vector3(-10, 0, 260),
    new THREE.Vector3(-50, 0, 210),
    new THREE.Vector3(-100, 0, 100),
    new THREE.Vector3(-120, 0, 40),
    new THREE.Vector3(-180, 0, -20)
  ];

  const trunkMat = createSketchFillMaterial({ color: isNight ? 0x142B47 : 0xEAE4D8, jitter: 0.02 });
  const foliageMat = createSketchFillMaterial({ color: isNight ? 0x0E2644 : 0xFCFAF4, jitter: 0.025 });
  const outlineColor = isNight ? 0x38BDF8 : 0x2D5A43;

  treePositions.forEach(pos => {
    const treeGroup = new THREE.Group();
    treeGroup.position.copy(pos);

    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 2.5, 6);
    const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
    trunkMesh.position.y = 1.25;
    attachOutline(trunkMesh, { color: isNight ? 0xBAE6FD : 0x102A43, thickness: 0.04 });
    treeGroup.add(trunkMesh);

    const crown1 = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.8, 7), foliageMat);
    crown1.position.y = 3.2;
    attachOutline(crown1, { color: outlineColor, thickness: 0.05 });
    treeGroup.add(crown1);

    const crown2 = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.2, 7), foliageMat);
    crown2.position.y = 4.4;
    attachOutline(crown2, { color: outlineColor, thickness: 0.045 });
    treeGroup.add(crown2);

    trackGroup.add(treeGroup);
  });

  buildCompassRose(trackGroup, new THREE.Vector3(-40, 0.02, 120), isNight);
}

function buildCompassRose(trackGroup, position, isNight) {
  const compassGroup = new THREE.Group();
  compassGroup.position.copy(position);

  const ringMat = new THREE.LineBasicMaterial({ color: isNight ? 0x1E3F66 : 0xCAD5DE, linewidth: 2 });
  for (let r of [8.0, 14.0]) {
    const circlePoints = [];
    for (let a = 0; a <= 36; a++) {
      const theta = (a / 36) * Math.PI * 2;
      circlePoints.push(new THREE.Vector3(Math.cos(theta) * r, 0.01, Math.sin(theta) * r));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(circlePoints);
    compassGroup.add(new THREE.Line(ringGeo, ringMat));
  }

  const crossMat = new THREE.LineBasicMaterial({ color: isNight ? 0xBAE6FD : 0x102A43, linewidth: 2 });
  const crossPts = [
    new THREE.Vector3(-16, 0.01, 0), new THREE.Vector3(16, 0.01, 0),
    new THREE.Vector3(0, 0.01, -16), new THREE.Vector3(0, 0.01, 16)
  ];
  const crossGeo = new THREE.BufferGeometry().setFromPoints(crossPts);
  const crossLines = new THREE.LineSegments(crossGeo, crossMat);
  compassGroup.add(crossLines);

  trackGroup.add(compassGroup);
}
