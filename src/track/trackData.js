import * as THREE from 'three';

export const TRACK_WIDTH = 14.0;
export const TOTAL_LAPS = 3;

// 5 DISTINCT CIRCUITS (All strictly flat, no steep slopes)
export const TRACK_CONFIGS = [
  {
    id: 'grand_prix',
    name: '01 // NOTEBOOK GRAND PRIX',
    desc: 'Balanced circuit featuring sweeping hairpins and infield chicanes',
    lengthDesc: '650m • Technical',
    waypoints: [
      new THREE.Vector3(-140, 0, 0),
      new THREE.Vector3(-80, 0, 0),
      new THREE.Vector3(-20, 0, 0),
      new THREE.Vector3(40, 0, 10),
      new THREE.Vector3(80, 0, 40),
      new THREE.Vector3(100, 0, 90),
      new THREE.Vector3(80, 0, 140),
      new THREE.Vector3(40, 0, 160),
      new THREE.Vector3(20, 0, 190),
      new THREE.Vector3(40, 0, 230),
      new THREE.Vector3(80, 0, 260),
      new THREE.Vector3(110, 0, 300),
      new THREE.Vector3(90, 0, 340),
      new THREE.Vector3(40, 0, 350),
      new THREE.Vector3(-20, 0, 320),
      new THREE.Vector3(-70, 0, 270),
      new THREE.Vector3(-100, 0, 210),
      new THREE.Vector3(-130, 0, 150),
      new THREE.Vector3(-160, 0, 120),
      new THREE.Vector3(-170, 0, 70),
      new THREE.Vector3(-160, 0, 20)
    ],
    boostParams: [0.08, 0.38, 0.58, 0.84],
    numCheckpoints: 24
  },
  {
    id: 'oval_speedway',
    name: '02 // OVAL SPEEDWAY',
    desc: 'High-speed tri-oval built for flat-out drafting and wide drift angles',
    lengthDesc: '520m • High Speed',
    waypoints: [
      new THREE.Vector3(-160, 0, 0),
      new THREE.Vector3(-60, 0, 0),
      new THREE.Vector3(60, 0, 0),
      new THREE.Vector3(140, 0, 30),
      new THREE.Vector3(170, 0, 90),
      new THREE.Vector3(140, 0, 150),
      new THREE.Vector3(40, 0, 180),
      new THREE.Vector3(-40, 0, 180),
      new THREE.Vector3(-140, 0, 150),
      new THREE.Vector3(-170, 0, 90),
      new THREE.Vector3(-160, 0, 30)
    ],
    boostParams: [0.10, 0.45, 0.75],
    numCheckpoints: 20
  },
  {
    id: 'alpine_pass',
    name: '03 // ALPINE INK PASS',
    desc: 'Demanding serpentine layout with consecutive hairpin switchbacks',
    lengthDesc: '740m • Extreme Cornering',
    waypoints: [
      new THREE.Vector3(-140, 0, 0),
      new THREE.Vector3(-60, 0, 0),
      new THREE.Vector3(20, 0, 20),
      new THREE.Vector3(80, 0, 70),
      new THREE.Vector3(60, 0, 120),
      new THREE.Vector3(-10, 0, 110),
      new THREE.Vector3(-60, 0, 140),
      new THREE.Vector3(-40, 0, 190),
      new THREE.Vector3(30, 0, 210),
      new THREE.Vector3(90, 0, 240),
      new THREE.Vector3(70, 0, 290),
      new THREE.Vector3(0, 0, 300),
      new THREE.Vector3(-80, 0, 290),
      new THREE.Vector3(-130, 0, 240),
      new THREE.Vector3(-150, 0, 170),
      new THREE.Vector3(-120, 0, 100),
      new THREE.Vector3(-160, 0, 50)
    ],
    boostParams: [0.06, 0.32, 0.65, 0.88],
    numCheckpoints: 28
  },
  {
    id: 'infinity_crossover',
    name: '04 // INFINITY CROSSOVER',
    desc: 'Symmetrical figure-8 layout featuring interlocking high-G loops',
    lengthDesc: '680m • Technical Flow',
    waypoints: [
      new THREE.Vector3(-150, 0, 0),
      new THREE.Vector3(-70, 0, 0),
      new THREE.Vector3(0, 0, 20),
      new THREE.Vector3(70, 0, 70),
      new THREE.Vector3(120, 0, 140),
      new THREE.Vector3(110, 0, 210),
      new THREE.Vector3(50, 0, 240),
      new THREE.Vector3(-10, 0, 200),
      new THREE.Vector3(-60, 0, 130),
      new THREE.Vector3(-120, 0, 140),
      new THREE.Vector3(-150, 0, 200),
      new THREE.Vector3(-140, 0, 270),
      new THREE.Vector3(-80, 0, 300),
      new THREE.Vector3(-20, 0, 270),
      new THREE.Vector3(30, 0, 180),
      new THREE.Vector3(0, 0, 100),
      new THREE.Vector3(-60, 0, 40)
    ],
    boostParams: [0.12, 0.42, 0.72, 0.92],
    numCheckpoints: 26
  },
  {
    id: 'tokyo_bay',
    name: '05 // TOKYO BLUEPRINT BAY',
    desc: 'Drafting grid street circuit with 90-degree square corners and dock straights',
    lengthDesc: '630m • Street Grid',
    waypoints: [
      new THREE.Vector3(-150, 0, 0),
      new THREE.Vector3(-40, 0, 0),
      new THREE.Vector3(40, 0, 0),
      new THREE.Vector3(80, 0, 0),
      new THREE.Vector3(80, 0, 80),
      new THREE.Vector3(30, 0, 80),
      new THREE.Vector3(30, 0, 160),
      new THREE.Vector3(100, 0, 160),
      new THREE.Vector3(100, 0, 260),
      new THREE.Vector3(20, 0, 260),
      new THREE.Vector3(-50, 0, 260),
      new THREE.Vector3(-50, 0, 180),
      new THREE.Vector3(-120, 0, 180),
      new THREE.Vector3(-120, 0, 90),
      new THREE.Vector3(-160, 0, 90)
    ],
    boostParams: [0.08, 0.35, 0.62, 0.85],
    numCheckpoints: 24
  }
];

// Active Track State
export let currentTrackIndex = 0;
export let trackCurve = null;
export let trackSamples = [];
export let CHECKPOINTS = [];
export let BOOST_PAD_PARAMS = [];

export function setTrack(index) {
  currentTrackIndex = Math.max(0, Math.min(TRACK_CONFIGS.length - 1, index));
  const config = TRACK_CONFIGS[currentTrackIndex];

  // Create closed CatmullRom curve
  trackCurve = new THREE.CatmullRomCurve3(config.waypoints, true, 'centripetal');

  // Precalculate samples for fast distance and tangent queries
  const NUM_SAMPLES = 500;
  trackSamples = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const u = i / NUM_SAMPLES;
    const point = trackCurve.getPointAt(u);
    const tangent = trackCurve.getTangentAt(u).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    trackSamples.push({ u, point, tangent, normal });
  }

  // Generate checkpoints
  CHECKPOINTS = [];
  const numCp = config.numCheckpoints;
  for (let i = 0; i < numCp; i++) {
    const u = i / numCp;
    const point = trackCurve.getPointAt(u);
    const tangent = trackCurve.getTangentAt(u).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    CHECKPOINTS.push({
      index: i,
      u,
      point,
      tangent,
      normal,
      radius: TRACK_WIDTH * 0.95
    });
  }

  BOOST_PAD_PARAMS = [...config.boostParams];
  return config;
}

// Initialize with first track by default
setTrack(0);
