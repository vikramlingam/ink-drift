import * as THREE from 'three';

export function createPaperGround(size = 2400) {
  const vertexShader = `
    varying vec2 vWorldPos;
    varying vec2 vUv;
    varying float vDist;
    
    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPosition.xz;
      vDist = length(worldPosition.xz);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  const fragmentShader = `
    varying vec2 vWorldPos;
    varying vec2 vUv;
    varying float vDist;
    
    uniform vec3 uPaperColor;
    uniform vec3 uGridColor;
    uniform vec3 uMarginColor;
    uniform vec3 uInkDark;
    uniform float uIsNight;
    uniform float uTime;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    void main() {
      vec3 color = uPaperColor;

      // Distance falloff to prevent high-frequency moire shimmering in dark mode
      float distFade = clamp(1.0 - (vDist - 60.0) / 380.0, 0.0, 1.0);

      // Paper fiber texture (softened in dark mode to stop noise flicker)
      float grain = noise(vWorldPos * 6.0) * 0.02;
      if (uIsNight > 0.5) {
        color += vec3(grain * 0.25 * distFade);
      } else {
        color -= vec3(grain * distFade);
      }

      // Smooth, Anti-Aliased grid lines (no sub-pixel flickering)
      vec2 gridPos = vWorldPos / 4.0;
      vec2 fw = max(fwidth(gridPos), vec2(0.002));
      vec2 gridDist = abs(fract(gridPos - 0.5) - 0.5);
      vec2 gridLine = smoothstep(fw * 1.5, vec2(0.0), gridDist);
      float gridIntensity = max(gridLine.x, gridLine.y) * distFade;

      // Ruled horizontal lines every 8.0 units
      float rFw = max(fwidth(vWorldPos.y / 8.0), 0.002);
      float rDist = abs(fract(vWorldPos.y / 8.0 - 0.5) - 0.5);
      float ruledIntensity = smoothstep(rFw * 1.5, 0.0, rDist) * distFade;

      // Mix grid lines cleanly
      color = mix(color, uGridColor, gridIntensity * (uIsNight > 0.5 ? 0.40 : 0.45));
      color = mix(color, uGridColor * 0.9, ruledIntensity * 0.30);

      // Single vertical crimson margin guide line
      float marginX = mod(vWorldPos.x + 120.0, 240.0) - 120.0;
      float mFw = max(fwidth(marginX), 0.002);
      float marginIntensity = smoothstep(mFw * 2.0, 0.0, abs(marginX)) * 0.65;
      color = mix(color, uMarginColor, marginIntensity);

      // Coordinate tick marks every 20 units
      vec2 cFw = max(fwidth(vWorldPos / 20.0), vec2(0.002));
      vec2 cDist = abs(fract(vWorldPos / 20.0 - 0.5) - 0.5);
      vec2 majorLine = smoothstep(cFw * 2.0, vec2(0.0), cDist);
      float majorTick = max(majorLine.x, majorLine.y) * distFade;
      color = mix(color, uGridColor * 0.8, majorTick * 0.25);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const uniforms = {
    uPaperColor: { value: new THREE.Color(0xFBF9F4) },
    uGridColor: { value: new THREE.Color(0xCAD5DE) },
    uMarginColor: { value: new THREE.Color(0xE26D68) },
    uInkDark: { value: new THREE.Color(0x102A43) },
    uIsNight: { value: 0.0 },
    uTime: { value: 0.0 }
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    depthWrite: false, // Ground plane does not need to write depth, completely eliminates z-fighting!
    depthTest: true
  });

  const geometry = new THREE.PlaneGeometry(size, size);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -0.02;
  mesh.renderOrder = -1; // Render before all road objects

  const setTheme = (theme) => {
    uniforms.uPaperColor.value.setHex(theme.bg);
    uniforms.uGridColor.value.setHex(theme.grid);
    uniforms.uMarginColor.value.setHex(theme.margin);
    uniforms.uInkDark.value.setHex(theme.ink);
    uniforms.uIsNight.value = theme.isDark ? 1.0 : 0.0;
  };

  return { mesh, material, setTheme };
}
