# 🐷 Pig Path

A personal, Apple Maps–style navigation PWA with live traffic and an Explorer mode. Built for iPhone 16 Pro.

## Current version: v0.7.3 — High-Precision L1+L5 GNSS & Kalman Location Engine
- **Multi-Sample L1+L5 GNSS Convergence Burst (`startHighPrecisionBurst` in `js/map.js`)**:
  - Samples iPhone 16 Pro's dual-frequency L1+L5 GNSS receiver for up to 6 seconds on startup/refresh until accuracy locks within `≤10m` (`±33 ft`).
- **2D Accuracy-Weighted Kalman Filter & Outlier Gatekeeper (`filterPosition` & `shouldAcceptPosition` in `js/map.js`)**:
  - Rejects degraded Wi-Fi/cellular fallback jumps (`>50m`) when a satellite fix (`<35m`) was acquired within the last 20 seconds, and eliminates stationary multipath jitter (`speed < 0.6 m/s`).
- **Active Route Centerline Map-Matching (`snapToActiveRoute` in `js/map.js`)**:
  - Gently snaps the location puck onto the active route polyline when within `24m`, preventing parallel side-street drift during navigation.
- **iOS PWA Foreground Wake Recovery & 1-Tap Map Pinning (`js/map.js`, `js/app.js`, `js/search.js`)**:
  - Automatically restarts GNSS tracking on iOS screen unlock (`visibilitychange` / `pageshow`), and adds **Tap Map to Pin Exact Spot** with Mapbox Reverse Geocoding.

## Roadmap
| Version | Features |
|---|---|
| v0.7.3 (Current) | High-Precision L1+L5 GNSS & Kalman Location Engine (6s satellite convergence burst, Wi-Fi fallback rejection, route centerline snap, 1-tap map pinning) |
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
