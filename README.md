# 🐷 Pig Path

A personal, Apple Maps–style navigation PWA with live traffic and an Explorer mode. Built for iPhone 16 Pro.

## Current version: v0.6.0 — Fog of War, Speedometer & Co-Pilot Personalities
- **Fog of War Washington Coverage Tracker**:
  - Automatically records every street, highway, and backroad you drive.
  - Glowing neon cyan & emerald trail overlay (`#00f5d4` & `#34c759`) lights up uncovered territory on your map.
  - Explorer modal tracks total miles driven, Puget Sound % uncovered, and driver exploration rank.
- **HUD Speedometer & Over-Speed Warnings**:
  - Live digital speedometer badge in the navigation HUD alongside posted US MUTCD speed limit signs.
  - Over-speed warning threshold (+5 or +10 MPH) with pulsing amber/red indicator and gentle descending reminder chimes.
- **Visual Lane Guidance & Secondary "THEN" Maneuver**:
  - Multi-lane guidance board highlighting recommended active lanes vs prohibited turn lanes.
  - Secondary maneuver strip (Apple Maps "THEN" preview) prepares you for rapid follow-up turns and highway merges.
- **Twisty Backroad "Fun Meter"**:
  - Route curvature engine scoring routes from 0 to 100 based on curve density and bearing variance.
  - Displays dynamic badges (`🏎️ 78/100 Twisty · 32 curves`) on route previews and Adventure Loops.
- **Custom Co-Pilot Voice Personalities**:
  - Choose your navigator tone in Settings:
    - **Siri**: Authentic calm Apple turn guidance.
    - **Roadtrip 🏎️**: Energetic, spirited road-trip companion ("Alright driver, let's roll!").
    - **Snarky 😼**: Witty, sarcastic navigation banter ("Listen close, try not to miss this turn.").
- **CarPlay Standalone Audio & iPhone Haptics**:
  - Integrates `navigator.mediaSession` to broadcast real-time maneuver titles to CarPlay and iOS lock screens.
  - Taptic engine pulses on iPhone 16 Pro as you approach turns and highway exits.

## Roadmap
| Version | Features |
|---|---|
| v0.6.0 (Current) | Fog of War coverage tracker, HUD Speedometer, Twisty Backroad Fun Meter, Lane Guidance, Co-Pilot Personalities |
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
