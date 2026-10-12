# 🐷 Pig Path

A personal, Apple Maps–style navigation PWA with live traffic and an Explorer mode. Built for iPhone 16 Pro.

## Current version: v0.6.1 — Apple Maps iOS 18 Cartography & UI Polish
- **Authentic Apple Maps POI Icons & Category Badges**:
  - High-DPI circular badge POI icons with crisp white borders and soft drop shadows across Washington.
  - Category-matched typography: Parks in vibrant leaf green (`#1b8a3e` with `#34c759` tree badges), Shopping in warm amber (`#b45309` with shopping cart badges), Dining in warm orange (`#c2410c`), Coffee in roast brown (`#78350f`), Gas in electric blue (`#0369a1`), Transit in blue, and Medical in coral red.
  - Automatic day/night halo adjustments for crystal-clear readability in light and dark modes.
- **Pixel-Accurate Highway Shields**:
  - **Interstate Shield (I-405, I-5, I-90)**: Red crown header with natural curved boundary, Apple Interstate Blue body, crisp white outer border with soft drop shadow, and bold white SF Pro Display numerals.
  - **Washington State Route Shield (SR-520, SR-99, SR-522)**: Dark charcoal rounded rectangle with solid white outer border, cleanly centered George Washington bust silhouette, and bold centered numerals.
  - **US Highway Shield (US-2, US-101)**: Classic white highway shield badge with black border and bold numerals.
- **Apple Maps iOS 18 Vertical Floating Capsule**:
  - Unified vertical frosted glass capsule (`44px` width) housing Map Layers (diamond stack), 3D toggle, and Location crosshair.
  - Authentic circular 44px compass disc with two-tone red & gray North/South needle.
- **HUD Turn Guidance & Driving Dock**:
  - Deep forest navigation gradient (`#18863a` to `#0d5c25`) with large 26px SF Pro maneuver distances and MUTCD highway exit badges.
  - Floating frosted driving dock with 48px circular red End button and bold 30px green ETA readout.
- **Fog of War, Speedometer & Co-Pilot Personalities** (from v0.6.0).

## Roadmap
| Version | Features |
|---|---|
| v0.6.1 (Current) | Apple Maps iOS 18 POI badges, pixel-accurate Interstate & WA State Route shields, vertical glass capsule, HUD polish |
| v0.7.0 | Live Weather radar & precipitation overlay, Mascot switcher (Pig 🐷 / Pitty 🐶) |
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
