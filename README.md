# 🐷 Pig Path

A personal, Apple Maps–style navigation PWA with live traffic and an Explorer mode. Built for iPhone 16 Pro.

## Current version: v0.5.3 — Safety Alerts, Adventure Loop & CarPlay Mode
- **Speed Camera & Active School Zone Alerts**:
  - Washington speed & red light camera detector with synthesized Apple two-tone Web Audio chimes (`587Hz` & `880Hz`).
  - Active School Zone monitoring (20 MPH limits during school hours Mon–Fri 7:30 AM–4:30 PM) with HUD banner alert and dynamic speed limit update.
  - Mountain Pass Advisories on route start for Snoqualmie Pass, Stevens Pass, Blewett Pass, and Chinook Pass.
- **1-Tap Incident & Hazard Reporting**:
  - Apple Maps incident reporting drawer (`#btnReportHazard` on driving dock) to report Speed Trap (`🚓`), Hazard (`⚠️`), Crash (`🛑`), or Road Work (`🚧`).
  - Dropped hazard markers pulse dynamically on the map and persist across driver sessions.
- **CarPlay Horizontal Dashboard Mode**:
  - Dedicated landscape dashboard layout (`body.carplay-active`) designed for horizontal iPhone car mounts and CarPlay-style vehicle displays.
  - Two-column widescreen view: left 360px turn HUD & driving dock, right 60%+ 3D map navigation.
- **Adventure Loop Generator**:
  - Scenic round-trip drive planner (`#btnOpenAdventureLoop` in Explorer).
  - Time budgets (30m, 45m, 1h, 1.5h, 2h) and scenery styles (Waterfront & Views, Forest & Lakes, Foothills & Curves).
  - Generates multi-waypoint scenic loops returning to starting location.
- **Authentic Apple Maps iOS 18 Design & 3D Extrusions**:
  - Floating Navigation Guidance Banner with safe clearance for the iPhone 16 Pro Dynamic Island.
  - Floating Driving Dock with prominent red circular End button and ETA telemetry.
  - 3D Building Extrusions with warm stone shading and ambient occlusion lighting.
  - Natural Siri Turn Guidance prompts with Apple Siri voice selection.
  - Apple Maps Transport Mode Tabs (Drive, Walk, Transit, Cycle), Mic Dictation, and squircle category pills.
- **Classic Pig Accents**:
  - Blue location puck with cute pink pig snout (`.puck-snout`) and heading cone.
  - Emerald green calibrated ring (`.puck.is-calibrated`) when using pinned location.
  - Glossy pink pig avatar in the search bar and pig toasts (`🐷 Oink! Maps are ready`).
- **Precise GPS with Zero-Cache Bypass** & Calibration Suite (Home, Work, Map Center, Address Geocoding).
- **"Add a Stop" Along Route** (EV Fast Chargers, Gas, Coffee, Food, Parking with `+X min detour`).
- **"Leave By" Target Arrival Alarm** with Web Audio departure chimes.
- **EV Battery Arrival % Estimator** with customizable battery / gas range.

## Roadmap
| Version | Features |
|---|---|
| v0.5.3 (Current) | Safety Alerts, Adventure Loop & CarPlay Mode (Speed cameras, school zones, 1-tap hazard reporting, scenic loops, CarPlay horizontal layout) |
| v0.6.0 | Fog of War coverage tracker (light up every road driven across Washington) |
| v1.0.0 | Offline tile packs, multi-stop optimization & haptic feedback |

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
