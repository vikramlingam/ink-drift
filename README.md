# INK DRIFT // Real-Time Isometric Arcade Racer

A lightweight, highly optimized, real-time multiplayer isometric arcade racing game crafted with a distinct **"blue ballpoint pen sketch on lined/graph notebook paper"** aesthetic.

Runs smoothly in modern desktop and mobile web browsers at 60fps with zero external asset downloads.

---

## 🏆 Key Features

- **Distinctive Notebook & Blueprint Art Style:**
  - Aged cream notebook paper ground with GPU procedural tooth grain.
  - Fine-ruled cyan/grey graph grid with a single vertical crimson margin guide line.
  - Low-poly minimalist cars and circuits rendered with unlit paper-fill inside faces and crisp inverted-hull ballpoint pen outlines.
  - Synchronized stop-motion flipbook line-boil tremor.
  - Real-time ballpoint pen skidmarks left on the paper during high-slip drifts.
- **5 Flat-Level Circuits (Zero High Slopes):**
  - Notebook Grand Prix (650m), Oval Speedway (520m), Alpine Ink Pass (740m), Infinity Crossover (680m), and Tokyo Blueprint Bay (630m).
- **Day & Night Themes:**
  - Day: Warm cream paper (`#FBF9F4`) with deep ballpoint blue ink.
  - Night: Deep cyanotype blueprint paper (`#0A192F`) with forward headlight projection beams on the road and glowing cyan pen outlines.
- **Translucent GPS Minimap:**
  - Corner HUD displaying the full circuit ribbon, start/finish line tick, player heading arrow, and opponent positions in real time.
- **3 Driving Difficulty Levels:**
  - **EASY (Assisted):** High tire grip (+5%), active auto-stabilization against spin-outs, forgiving drift recovery. AI opponents drive at a relaxed pace with human-like imperfections and yield leads dynamically.
  - **MEDIUM (Balanced Arcade):** Fast steering response with authentic arcade drift initiation and recovery.
  - **HARD (Pro Racer):** Tight grip envelope, raw physics, high top speed, requiring throttle feathering and counter-steering.
- **Interactive 3D Garage Studio:**
  - 4 Car chassis styles: *Wedge GT*, *Monoposto F1*, *Sprint Coupe*, *Cyber Roadster*.
  - 8 Archival ink palettes: *Ballpoint Blue*, *Muted Crimson*, *Dark Sage*, *Mustard Ochre*, *Violet Sepia*, *Burnt Sienna*, *Blueprint Cyan*, *Archival Emerald*.
  - Custom decal numbers with 360° drag-to-spin turntable preview.
- **Victory Celebration:**
  - 1st Place finishes trigger an ink-etched Golden Trophy Cup and full-screen colorful confetti burst.
- **Serverless Multiplayer:**
  - Instant matchmaking via Playroom Kit (`joinPlayroom`, `insertCoin`) with room codes and URL sharing (`?room=XYZ`).
  - 20Hz compressed state packets with Hermite snapshot interpolation and dead reckoning.
  - Ghost/draft soft elastic collisions preventing ping glitches or physics clashing.
- **Procedural Web Audio API:**
  - 100% synthesized sound: pitch-modulating engine oscillator, bandpass paper-friction drift screech, checkpoint chimes, and finish fanfare chords. Master volume control.

---

## 🕹️ Controls

### Desktop Keyboard
- **Accelerate:** `W` or `↑`
- **Brake / Reverse:** `S` or `↓`
- **Steer:** `A` / `D` or `←` / `→`
- **Handbrake Drift:** `SPACEBAR`
- **Reset to Track:** `R`
- *All keyboard bindings can be customized inside the **⚙️ SETTINGS** modal.*

### Mobile Touchscreen
- **Virtual Thumbstick (Bottom-Left):** Smooth analogue steering with auto-centering
- **Gas Pedal (Bottom-Right):** Forward acceleration
- **Brake / Drift Pedal (Bottom-Right):** Quick braking and drift initiation

---

## 🚀 Getting Started

### Installation
```bash
# Install dependencies
npm install
```

### Local Development Server
```bash
npm run dev
# Server ready on http://localhost:5173/
```

### Production Build
```bash
npm run build
# Compiles optimized bundle to /dist in ~250ms
```

### Preview Production Build
```bash
npm run preview
```

---

## ⚙️ Settings & Configuration
Click **⚙️ SETTINGS** in the top bar to configure:
1. **Driving Difficulty:** Easy / Medium / Hard
2. **Invert Steering:** Toggle Normal (Driver View) vs Inverted
3. **Steering Sensitivity:** 50% to 200%
4. **Key Rebinding:** Click any control action and press your desired key
5. **Camera Presets:** Close-Up View, Standard Isometric, Panoramic Far
6. **Visual Theme:** Notebook Paper (Day) or Blueprint Cyanotype (Night)
7. **Master Volume:** 0% to 100% slider
