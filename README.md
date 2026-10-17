# 🐷 Pig Path

A personal, Apple Maps–style navigation PWA with live traffic and an Explorer mode. Built for iPhone 16 Pro.

## Current version: v0.7.2 — Apple Maps iOS 18 Vector Cartography
- **Apple Maps iOS 18 Vector Cartography Engine (`applyAppleCartography` in `js/map.js`)**:
  - Replaces default Mapbox road/land colors with authentic Apple Maps iOS 18 Day & Dark Mode vector styling:
    - **Land & Commercial Zones**: Warm porcelain background (`#f5f4f0`) with warm sand-cream commercial/institutional zones (`#efe6d5`).
    - **Parks & Woodlands**: Signature Apple Maps fresh pastel mint-sage green (`#bae8be` / `#c4ecc8`).
    - **Water & Shorelines**: Pastel sky-azure water (`#92d3f7`) with crisp shoreline outline (`#80c4ec`).
    - **Road Hierarchy**: Cool lavender-slate residential streets (`#cfd7e4`) that smoothly open into crisp white streets (`#ffffff`) with slate casings at close zoom, paired with Apple Maps' signature **steel-slate blue-gray freeways (`#95a4b8`)**, ramps (`#a4b2c5`), and stacked bridge overpasses.
    - **Apple Maps Typography & Green Corridor Labels**: Tracked-out neighborhood labels with thick white halos, plus forest-green corridor/trail labels (`5 SnoCo`, `405 Express`, `520 Bridge`, `Burke-Gilman Trail`) in `#116e30` with crisp white halo.
- **Refined Apple Maps Interstate Shield (`I-405`, `I-5`, `I-90`) & WA State Route Shields (`SR-520`, `SR-522`, `SR-524`)**:
  - Wide rounded-bowl Interstate shield contour with vibrant `#007aff` Apple blue body, `#e3262e` crown, crisp straight horizontal white divider, and top-level collision priority.

## Roadmap
| Version | Features |
|---|---|
| v0.7.2 (Current) | Apple Maps iOS 18 Vector Cartography (steel-slate freeways, pastel mint parks, porcelain land, green corridor labels, wide-bowl Interstate shields) |
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
