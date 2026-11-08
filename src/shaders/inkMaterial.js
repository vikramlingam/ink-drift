import * as THREE from 'three';

// Shared time uniform for global synchronized 12fps line boil
export const globalSketchUniforms = {
  uTime: { value: 0.0 }
};

export function updateSketchTime(delta) {
  globalSketchUniforms.uTime.value += delta;
}

/**
 * Creates an unlit paper-fill material with refined sketch tremor.
 */
export function createSketchFillMaterial(options = {}) {
  const color = new THREE.Color(options.color !== undefined ? options.color : 0xFBF9F4);
  const jitter = options.jitter !== undefined ? options.jitter : 0.008; // Refined subtle jitter (no strobe)
  const opacity = options.opacity !== undefined ? options.opacity : 1.0;

  const vertexShader = `
    uniform float uTime;
    uniform float uJitter;
    varying vec3 vNormal;
    varying vec3 vWorldPos;

    float hash(vec3 p) {
      return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    }

    void main() {
      vNormal = normalize(normalMatrix * normal);
      float boil = floor(uTime * 12.0) / 12.0;
      vec3 jitter = vec3(
        hash(position.xyz + vec3(boil, 1.23, 4.56)) - 0.5,
        hash(position.xyz + vec3(2.34, boil, 5.67)) - 0.5,
        hash(position.xyz + vec3(3.45, 6.78, boil)) - 0.5
      ) * uJitter;

      vec3 newPos = position + jitter;
      vec4 worldPos = modelMatrix * vec4(newPos, 1.0);
      vWorldPos = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying vec3 vNormal;
    varying vec3 vWorldPos;

    void main() {
      float light = clamp(dot(vNormal, normalize(vec3(0.4, 0.9, 0.3))), 0.0, 1.0);
      vec3 col = mix(uColor * 0.93, uColor, 0.4 + 0.6 * light);
      gl_FragColor = vec4(col, uOpacity);
    }
  `;

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: globalSketchUniforms.uTime,
      uColor: { value: color },
      uJitter: { value: jitter },
      uOpacity: { value: opacity }
    },
    transparent: opacity < 1.0,
    side: THREE.FrontSide
  });
}

/**
 * Creates an inverted hull pen outline material with synchronized line boil.
 */
export function createSketchOutlineMaterial(options = {}) {
  const inkColor = new THREE.Color(options.color !== undefined ? options.color : 0x102A43);
  const thickness = options.thickness !== undefined ? options.thickness : 0.055;
  const jitter = options.jitter !== undefined ? options.jitter : 0.008;

  const vertexShader = `
    uniform float uTime;
    uniform float uThickness;
    uniform float uJitter;

    float hash(vec3 p) {
      return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    }

    void main() {
      float boil = floor(uTime * 12.0) / 12.0;
      vec3 jitter = vec3(
        hash(position.xyz + vec3(boil, 1.23, 4.56)) - 0.5,
        hash(position.xyz + vec3(2.34, boil, 5.67)) - 0.5,
        hash(position.xyz + vec3(3.45, 6.78, boil)) - 0.5
      ) * uJitter;

      vec3 displacedPos = position + normal * uThickness + jitter;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPos, 1.0);
    }
  `;

  const fragmentShader = `
    uniform vec3 uInkColor;

    void main() {
      gl_FragColor = vec4(uInkColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: globalSketchUniforms.uTime,
      uInkColor: { value: inkColor },
      uThickness: { value: thickness },
      uJitter: { value: jitter }
    },
    side: THREE.BackSide,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: 1.0,
    polygonOffsetUnits: 1.0
  });
}

/**
 * Creates an outline mesh helper for any geometry
 */
export function attachOutline(mesh, options = {}) {
  const outlineMat = createSketchOutlineMaterial(options);
  const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMat);
  mesh.add(outlineMesh);
  return outlineMesh;
}
