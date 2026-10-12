# 🐷 Pig Path

A personal, Apple Maps–style navigation PWA with live traffic and an Explorer mode. Built for iPhone 16 Pro.

## Current version: v0.7.1 — Authentic Apple Maps WA State Route Shields
- **Pixel-Accurate Washington State Route Shields (`SR-524`, `SR-522`, `SR-520`, `SR-99`)**:
  - Re-engineered to exactly match Apple Maps:
    - 1:1 Square dark charcoal rounded container (`#2c2c2e` with `rx=18%`).
    - Clean borderless badge with **NO outer white stroke**, exactly matching live Apple Maps cartography.
    - Prominent solid white George Washington bust silhouette filling the container with balanced margins.
    - High-contrast bold numerals positioned in the upper-middle of Washington's head in Apple SF Pro font, rendered in matching dark charcoal.
- **Apple Maps Flyover 3D Cinematic Sweeps (from v0.7.0)**:
  - Smooth orbital camera sweeps around destination landmarks at 60fps with authentic 3D terrain and building extrusions (`apple-3d-buildings`).
  - Sinusoidal pitch oscillation (simulating an aircraft banking between 62° and 67°) with locked landmark center tracking.
  - Floating frosted Flyover HUD capsule with landmark title, Dynamic Island clearance, and tactile 1-tap "Stop ✕" button.
- **Multi-Stop Route Reordering (from v0.7.0)**:
  - Reorderable waypoints list with 1-tap ▲ and ▼ buttons, native drag handles (`≡`), and touch dragging for iPhone 16 Pro.
  - Numbered amber stop badges (`1`, `2`, `3`) with category emojis (`⚡`, `☕`, `🍔`, `🅿️`).

## Roadmap
| Version | Features |
|---|---|
| v0.7.1 (Current) | Authentic Apple Maps Washington State Route shields (borderless square badge, white George bust, dark centered numerals) |
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
