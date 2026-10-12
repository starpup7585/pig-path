# 🐷 Pig Path

A personal, Apple Maps–style navigation PWA with live traffic and an Explorer mode. Built for iPhone 16 Pro.

## Current version: v0.7.0 — Flyover 3D Sweeps & Multi-Stop Route Reordering
- **Apple Maps Flyover 3D Cinematic Sweeps**:
  - Smooth orbital camera sweeps around destination landmarks at 60fps with authentic 3D terrain and building extrusions (`apple-3d-buildings`).
  - Sinusoidal pitch oscillation (simulating an aircraft banking between 62° and 67°) with locked landmark center tracking.
  - Floating frosted Flyover HUD capsule with landmark title, Dynamic Island clearance, and tactile 1-tap "Stop ✕" button.
  - Automatic bottom sheet snap to peek for full-screen cinematic vista on iPhone 16 Pro.
  - Seamless manual override: touching, dragging, or panning the map immediately stops flyover.
- **Multi-Stop Route Reordering**:
  - Support for multiple stops along the route with dynamic cumulative detour calculation.
  - Apple Maps–style reorderable waypoints list:
    - 1-tap ▲ and ▼ buttons for fast, fail-safe reordering on touch screens.
    - Native drag handles (`≡`) supporting both desktop drag and mobile touch dragging on iPhone 16 Pro.
    - Amber teardrop map pins with high-contrast numbered stop badges (`1`, `2`, `3`) and category emojis (`⚡`, `☕`, `🍔`, `🅿️`).
  - Automatic route recalculation, ETA updates, and turn-by-turn multi-leg stop arrival tracking in navigation.
- **Apple Maps iOS 18 Cartography & Shields (from v0.6.1)**:
  - Pixel-accurate Interstate, Washington State Route, and US Highway shields.
  - Category POI circular badges with dynamic dark/light mode halos.
  - Vertical floating capsule controls and compass disc.

## Roadmap
| Version | Features |
|---|---|
| v0.7.0 (Current) | Apple Maps Flyover 3D cinematic camera sweeps & Multi-stop route reordering with touch/drag handles |
| v0.8.0 | Live Weather radar & precipitation overlay, Mascot switcher (Pig 🐷 / Pitty 🐶) |
| v1.0.0 | Offline map tile packs, multi-stop route optimization & haptic refinement |


## Bumping the version
Edit `APP_VERSION` in [`js/version.js`](js/version.js). Settings › About and the offline cache update automatically.

## Run locally (on a computer)
```
npx serve .
```
Then open http://localhost:3000. (Location only works on `localhost` or HTTPS.)

## Install on iPhone
1. Host on GitHub Pages (HTTPS).
2. Open the URL in **Safari** → Share → **Add to Home Screen**.
3. Open Pig Path from the Home Screen and paste your Mapbox token.
