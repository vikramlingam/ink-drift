# INK DRIFT // Codebase Architecture & Developer Notes

This document provides a comprehensive technical breakdown of every source file, architecture subsystem, mathematical model, and rendering pipeline in **INK DRIFT**.

---

## 📁 File Structure & Component Summary

```
cargame/
├── index.html                 # Main HTML5 entry point & UI overlay templates
├── package.json               # Dependencies (three, playroomkit, vite)
├── vite.config.js             # Bundler configuration & vendor code-splitting
├── README.md                  # Player guide & quickstart documentation
├── CODEBASE_OVERVIEW.md       # Technical architecture & developer notes (this file)
└── src/
    ├── main.js                # Central application coordinator & game loop
    ├── style.css              # Swiss editorial typography & responsive styling
    ├── audio/
    │   └── soundSystem.js     # 100% procedural Web Audio synthesizer
    ├── camera/
    │   └── isometricCamera.js # Isometric tracking camera with speed-zoom & adaptive FOV
    ├── game/
    │   ├── aiRacer.js         # Intelligent AI bots with human-like driving & rubber-banding
    │   ├── raceManager.js     # 3-lap race state machine, checkpoint logic & leaderboard
    │   └── settings.js        # Centralized settings store with localStorage persistence
    ├── graphics/
    │   └── carModel.js        # 4 low-poly car geometries, skidmarks & forward headlights
    ├── input/
    │   └── inputHandler.js    # Keyboard remapping & mobile virtual touch controls
    ├── network/
    │   └── networkManager.js  # Playroom Kit peer sync, dead reckoning & interpolation
    ├── shaders/
    │   ├── inkMaterial.js     # Inverted-hull pen outlines with 12fps line-boil tremor
    │   └── paperShader.js     # Procedural paper ground with smoothstep anti-aliasing
    ├── track/
    │   ├── trackBuilder.js    # Procedural mesh generation for road, curbs, barriers & pads
    │   └── trackData.js       # Waypoints & curves for 5 distinct circuits
    └── ui/
        ├── confetti.js        # 2D canvas particle physics for 1st place celebration
        ├── garageModal.js     # Interactive 3D turntable studio for car customization
        ├── minimap.js         # Translucent HUD minimap with real-time GPS dots
        └── settingsModal.js   # Controls, difficulty, camera, and theme configuration
```

---

## 🔍 Detailed File-by-File Breakdown

### 1. `src/main.js` (Core Application Coordinator)
- **Role:** Initializes Three.js WebGLRenderer, Scene, Camera, Shaders, Physics, Input, Sound, Minimap, and Modals.
- **Game Loop (`animate`):**
  - Advances global 12fps line-boil sketch time.
  - Fetches sanitized user inputs from `InputHandler`.
  - Steps deterministic `VehiclePhysics` at up to 60Hz.
  - Updates local car mesh transforms, front wheel steering angles, and wheel rolling.
  - Generates ballpoint tire skidmark ribbons when drifting.
  - Updates AI bot racers with player position telemetry for dynamic rubber-banding.
  - Interpolates remote multiplayer players via `NetworkManager`.
  - Broadcasts local state at 20Hz across Playroom peer network.
  - Updates smooth isometric camera tracking with forward lead distance.
  - Updates procedural Web Audio engine pitch and drift scribble noise.
  - Recalculates leaderboard rankings and telemetry HUD readouts.
  - Updates corner translucent minimap and renders scene.

---

### 2. `src/shaders/paperShader.js` (Infinite Paper Ground Plane)
- **Role:** Renders an infinite flat drafting ground plane (`size = 2400`).
- **Shader Features:**
  - **Procedural Grain:** Two-octave noise function simulating the fiber tooth of high-grade drafting paper.
  - **Smoothstep Anti-Aliased Grid:** Evaluates fine-ruled grid lines (every 4.0 units) and major ruled lines (every 8.0 units) using clamped `fwidth` derivative smoothstepping to completely eradicate pixel shimmering and moiré artifacts.
  - **Single Vertical Crimson Margin:** Reproduces the classic notebook red margin line at $X = -48.0$ with seamless 240-unit periodicity.
  - **Distance Falloff:** Blends distant high-frequency grid lines smoothly into base paper color.
  - **Anti-Z-Fighting:** Configured with `depthWrite: false` and `renderOrder: -1` so road meshes above it never compete for depth buffer precision.
  - **Dynamic Theme Switcher:** `setTheme(theme)` updates uniforms in real-time between warm aged cream (`#FBF9F4`) and deep cyanotype blueprint (`#0A192F`).

---

### 3. `src/shaders/inkMaterial.js` (Pen-and-Ink Geometry Shading)
- **Role:** Provides paper-fill and inverted-hull outline materials for cars, curbs, barriers, and environment doodles.
- **Shader Features:**
  - **Synchronized 12fps Line-Boil:** Uses `floor(uTime * 12.0) / 12.0` to quantize time steps, applying subtle vertex displacement (`jitter = 0.008`) along normals to simulate hand-drawn flipbook stop-motion animation without harsh strobing.
  - **Inverted Hull Outlines:** `createSketchOutlineMaterial()` pushes vertices outward along normals (`thickness = 0.055`) with `side: THREE.BackSide`.
  - **Polygon Offset:** Configured with `polygonOffset: true, polygonOffsetFactor: 1.0` so backface ink outlines never z-fight with front faces on any GPU.

---

### 4. `src/physics/vehiclePhysics.js` (Arcade Kinematics & Drift Dynamics)
- **Role:** Deterministic 60fps arcade vehicle physics with zero dependencies.
- **Mathematical Model:**
  - **Orientation Vectors:**
    $$\mathbf{f} = (\sin\theta, 0, \cos\theta) \quad (\text{forward})$$
    $$\mathbf{r} = (\cos\theta, 0, -\sin\theta) \quad (\text{right})$$
  - **Velocity Decomposition:**
    $$v_\text{forward} = \mathbf{v} \cdot \mathbf{f}, \quad v_\text{lateral} = \mathbf{v} \cdot \mathbf{r}$$
  - **Steering Kinematics:** Wheel turn angle $\delta$ lerps toward input with speed-sensitive yaw rate:
    $$\Delta\theta = -\delta \cdot \text{sensitivity} \cdot \text{clamp}\left(\frac{|v_\text{forward}|}{v_\text{max} \cdot 0.65}, 0.38, 1.15\right) \cdot \text{sgn}(v_\text{forward}) \cdot \Delta t$$
  - **Drift Slip Dynamics:**
    When braking during hard turns or using handbrake, `driftFactor` increases from 0.0 to 1.0. Lateral grip drops from `normalGrip` to `driftGrip`, allowing the rear of the car to swing out while retaining forward propulsion.
  - **Auto-Stabilization (Easy Mode):**
    When steering input is zero, lateral slip velocity is damped rapidly ($v_\text{lateral} \leftarrow v_\text{lateral} \cdot 0.85^{\Delta t \cdot 60}$), instantly arresting fishtails and oversteer.
  - **Soft Car-to-Car Collisions:**
    $$\text{repulsion} = \frac{\mathbf{p}_A - \mathbf{p}_B}{\|\mathbf{p}_A - \mathbf{p}_B\|} \cdot (r_A + r_B - d) \cdot 0.5$$
    Prevents rigid-body physics explosions across latency while enabling physical bumping and drafting.

---

### 5. `src/track/trackData.js` (5 Level Circuits)
- **Role:** Circuit definitions and Catmull-Rom spline calculations.
- **5 Included Circuits:**
  1. `grand_prix`: 650m balanced circuit with chicane and 180° hairpin.
  2. `oval_speedway`: 520m high-speed tri-oval for drafting and wide drifts.
  3. `alpine_pass`: 740m serpentine pass with technical switchback hairpins.
  4. `infinity_crossover`: 680m figure-8 symmetrical circuit.
  5. `tokyo_bay`: 630m urban street grid with 90° squared corners.
- **Constraint Compliance:** Strictly maintains $Y = 0.0$ flat ground plane, eliminating steep slopes, vehicle tumbling, or camera clipping.
- **Checkpoints:** Generates 20 to 28 sequential checkpoint gates along the spline.

---

### 6. `src/track/trackBuilder.js` (Procedural Circuit Construction)
- **Role:** Generates 3D procedural geometries for the active circuit and theme.
- **Components Built:**
  - **Road Ribbon:** 450-segment triangulated strip ($W = 14.0$) with paper-fill shader.
  - **Border Lines:** Continuous ballpoint ink contour lines.
  - **Dashed Center Line:** Archival cyan dashed line.
  - **Cross-Hatched Curbs:** Alternating blue/white or cyan/slate box curbs on corner apexes.
  - **Outer Barriers:** Minimalist ink posts with outlines on high-speed sweepers.
  - **Forward Chevron Boost Pads:** Three forward-pointing chevrons (`rotateX(Math.PI / 2)`) providing forward speed surges when crossed.
  - **Start/Finish Gantry:** Checkered starting line, architectural overhead arch with blueprint canvas banner, and 4 starting grid boxes.
  - **Environment Doodles:** Architectural pen trees and compass rose.

---

### 7. `src/graphics/carModel.js` (4 Chassis Geometries & Skidmarks)
- **Role:** Constructs low-poly car models, wheel groups, tag sprites, and forward headlights.
- **4 Chassis Styles:**
  1. **Wedge GT:** Chiseled wedge chassis, hood slope, canopy, and rear wing.
  2. **Monoposto F1:** Open-wheel formula needle nosecone, front aerofoil, overhead airbox, and large rear wing with endplates.
  3. **Sprint Coupe:** Widebody muscle coupe with domed roof, hood scoop, and ducktail spoiler.
  4. **Cyber Roadster:** Angular speedster with twin headrest pods and twin vertical fin spoilers.
- **Anti-Flicker Forward Headlights:** Flat 2D ground projection shapes oriented along $+Z$ with additive blending at $Y = 0.038$, completely avoiding z-fighting with the road plane.
- **SkidmarkManager:** Manages real-time ribbon lines laid down at the rear wheels during drift slips that dry and fade like ink.

---

### 8. `src/camera/isometricCamera.js` (Isometric Camera Controller)
- **Role:** Low-FOV (34°–48°) perspective camera positioned at a 45° isometric azimuth.
- **Features:**
  - **Dynamic Speed Zoom:** Base distance (46m) smoothly expands up to 54m as velocity increases, widening visibility for upcoming braking zones.
  - **Forward Lead:** Tracks lookAt target slightly ahead of the car heading.
  - **Adaptive Viewport FOV:** Widens to 48° on mobile portrait screens to prevent track cropping.
  - **Camera Presets:** Close-Up (34m), Standard (46m), and Panoramic Far (60m).

---

### 9. `src/input/inputHandler.js` (Cross-Platform Controls)
- **Role:** Handles desktop keyboard inputs with custom keybinding support, and mobile multi-touch virtual controls.
- **Features:**
  - Full keyboard mapping for Throttle, Brake/Rev, Steer Left, Steer Right, Handbrake, and Reset.
  - Standard Arrow keys remain active as secondary controls.
  - Mobile virtual joystick on the bottom-left with analogue radius clamping.
  - Mobile touch gas and brake/drift pedals on the bottom-right.
  - Ignores driving touch inputs while settings or garage modals are open.

---

### 10. `src/audio/soundSystem.js` (Procedural Web Audio API)
- **Role:** Zero-download synthesized sound effects.
- **Audio Synthesizers:**
  - **Engine:** Low-pass filtered sawtooth oscillator modulated continuously from 55Hz (idle) to 280Hz (top speed).
  - **Drift Screech:** Bandpass-filtered (1400Hz, $Q = 3.0$) white noise buffer simulating ballpoint pen nib scraping on coarse paper.
  - **Boost:** Triangle wave sweep rising from 180Hz to 750Hz.
  - **Checkpoint Chime:** Sine wave bell at 880Hz (A5).
  - **Countdown:** 440Hz / 880Hz beeps.
  - **Victory Fanfare:** Multi-note C Major triangle chord.
  - **Master Gain:** Global volume slider (0% to 100%) and mute toggle.

---

### 11. `src/game/raceManager.js` (Race Loop & Deterministic Leaderboard)
- **Role:** 3-lap state machine (`LOBBY` $\to$ `COUNTDOWN` $\to$ `RACING` $\to$ `FINISHED`).
- **Checkpoint & Lap Architecture:**
  - Tracks next gate sequentially (`targetCheckpoint`).
  - At race start, targets CP 0 (Start/Finish line) at green flag.
  - Crossing CP 0 on Lap 3 triggers race finish, records `finishTime`, and plays victory fanfare.
- **Monotonic Leaderboard Scoring:**
  - **Finished Racers:** $\text{score} = 10,000,000 - \text{finishTime}$. Finished racers strictly outrank active racers and never drop behind.
  - **Active Racers:**
    $$\text{score} = (\text{lap} \times 100,000) + (\text{cpIdx} \times 1,000) + (\text{proj} \times 1,000)$$
    Where $\text{proj}$ is the fractional projection along the road vector connecting CP $i$ to CP $i+1$. Never cuts across hairpins or jumps unexpectedly.

---

### 12. `src/game/aiRacer.js` (Human-Like AI Opponents)
- **Role:** Intelligent bot racers that provide immediate 4-car competition.
- **Difficulty Modes:**
  - **Easy Mode:**
    - Low base speed (22–25 km/h) allowing the player (36–54 km/h) to easily win.
    - Dynamic rubber-banding: If ahead of the user, the bot automatically slows down ($\times 0.68$) and yields the lead.
    - Simulates human errors: occasional steering wobble, early braking, and missed boost pads.
  - **Medium Mode:** Balanced 34–38 km/h racing lines.
  - **Hard Mode:** Fast 38–44 km/h apex lines with late braking.

---

### 13. `src/game/settings.js` (Centralized Settings Storage)
- **Role:** Centralized configuration store with `localStorage` persistence.
- **Managed States:** Difficulty (`easy`/`medium`/`hard`), Inverted Steering (`true`/`false`), Steering Sensitivity (`0.5`–`2.0`), Keybindings, Camera Presets, Theme (`day`/`night`), Selected Track (`0`–`4`), Car Customization (Body Style, Palette, Decal Number), and Audio Volume.

---

### 14. `src/ui/minimap.js` (Translucent GPS Minimap HUD)
- **Role:** Top-left translucent corner HUD.
- **Features:**
  - Samples active circuit curve and computes bounding box to scale track ribbon with uniform aspect ratio.
  - Draws track path, Start/Finish gate tick (`#E26D68`), player dot with heading directional pointer, and opponent dots in their archival ink colors.

---

### 15. `src/ui/confetti.js` (Victory Celebration System)
- **Role:** 2D canvas confetti cannon triggered on 1st place finishes.
- **Features:**
  - 160+ festive fluttering rectangular particles in Gold, Crimson, Archival Blue, Emerald, Cyan, and Magenta.
  - Simulates gravity, air drag, 3D scale flutter, and rotation.
  - Clears cleanly when restarting or dismissing the recap card.

---

### 16. `src/ui/settingsModal.js` & `src/ui/garageModal.js` (Modals)
- **Settings Modal:** Interactive UI for rebinding keys, toggling steering inversion, adjusting sensitivity, camera distance, theme, and master volume.
- **Garage Modal:** Interactive 3D turntable canvas allowing 360° mouse/touch inspection of all 4 car shapes, 8 ink palettes, and custom decal numbers.

---

## 🛠️ Performance Budgets & Optimization Highlights

1. **Zero External 3D/Audio Assets:** 100% of textures, meshes, and audio sounds are procedurally synthesized on the fly.
2. **Sub-250ms Production Build:** Bundled with Vite and Rolldown in ~240ms with three-way code splitting:
   - `three.js`: Vendor chunk (cached)
   - `playroomkit`: Multiplayer vendor chunk (cached)
   - `index.js`: Application core (~22 kB gzipped)
3. **Rock-Solid 60 FPS:** Low-poly geometry with shared material instances and anti-aliased shaders ensures smooth 60fps performance on any modern phone, tablet, or laptop.

