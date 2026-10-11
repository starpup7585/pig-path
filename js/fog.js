// Pig Path — Fog of War Washington Tracker
// Records roads driven and generates glowing map coverage layers.

const FOG_KEY = 'pigpath.fog_of_war_v1';

// Seed sample scenic drive in Seattle if completely empty so the user can immediately preview the feature
const SEED_TRAILS = [
  // Pike Place to Seattle Waterfront to Magnolia Bluff
  [
    [-122.3421, 47.6097],
    [-122.3456, 47.6115],
    [-122.3523, 47.6162],
    [-122.3615, 47.6251],
    [-122.3785, 47.6364],
    [-122.4042, 47.6441],
    [-122.4112, 47.6521],
  ],
  // Lake Washington Blvd to Seward Park
  [
    [-122.2854, 47.5812],
    [-122.2782, 47.5714],
    [-122.2691, 47.5582],
    [-122.2574, 47.5511],
    [-122.2512, 47.5495],
  ],
];

function loadFogStore() {
  try {
    const raw = localStorage.getItem(FOG_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.trails) && data.trails.length > 0) return data;
    }
  } catch (err) {
    console.warn('[fog] load error', err);
  }
  return {
    trails: SEED_TRAILS,
    totalMiles: 14.8,
    lastSaved: Date.now(),
  };
}

let fogData = loadFogStore();
let currentActiveTrail = [];
let lastRecordedCoord = null;
let saveDebounceTimer = null;

function toRad(d) {
  return (d * Math.PI) / 180;
}

function distMiles(p1, p2) {
  const [lng1, lat1] = p1;
  const [lng2, lat2] = p2;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function saveFogStore() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        FOG_KEY,
        JSON.stringify({
          trails: fogData.trails,
          totalMiles: Number(fogData.totalMiles.toFixed(2)),
          lastSaved: Date.now(),
        }),
      );
    } catch { /* storage full */ }
  }, 1500);
}

/**
 * Feeds a live coordinate into the Fog of War tracker.
 * @param {[number, number]} coord - [lng, lat]
 */
export function recordFogCoordinate(coord) {
  if (!coord || !Array.isArray(coord) || coord.length < 2) return;
  const lng = Number(coord[0].toFixed(5));
  const lat = Number(coord[1].toFixed(5));
  const cur = [lng, lat];

  if (!lastRecordedCoord) {
    lastRecordedCoord = cur;
    currentActiveTrail = [cur];
    fogData.trails.push(currentActiveTrail);
    return;
  }

  const d = distMiles(lastRecordedCoord, cur);

  // If user jumped more than 3 miles (e.g. app reopened across town), start a new trail
  if (d > 3.0) {
    currentActiveTrail = [cur];
    fogData.trails.push(currentActiveTrail);
    lastRecordedCoord = cur;
    return;
  }

  // Record point if moved at least 25 meters (~0.015 miles)
  if (d >= 0.015) {
    fogData.totalMiles += d;
    currentActiveTrail.push(cur);
    lastRecordedCoord = cur;
    saveFogStore();
  }
}

/**
 * Returns GeoJSON for the Mapbox Fog of War line layers.
 */
export function getFogGeoJson() {
  const validTrails = fogData.trails.filter((t) => Array.isArray(t) && t.length >= 2);
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'MultiLineString',
          coordinates: validTrails,
        },
      },
    ],
  };
}

/**
 * Returns summary metrics for the Fog of War modal.
 */
export function getFogStats() {
  const miles = Math.round(fogData.totalMiles || 0);
  // Benchmark: ~4,200 primary arterial & highway miles in greater Seattle/King County
  const pctSeattle = Math.min(100, Math.max(0.4, Number(((miles / 4200) * 100).toFixed(1))));
  const totalPoints = fogData.trails.reduce((sum, t) => sum + (t?.length || 0), 0);

  let rank = 'Neighborhood Piglet';
  let badgeIcon = '🐷';
  if (miles >= 500) {
    rank = 'Cascadia Legend';
    badgeIcon = '👑';
  } else if (miles >= 200) {
    rank = 'Washington Road Warrior';
    badgeIcon = '🏎️';
  } else if (miles >= 80) {
    rank = 'Puget Sound Explorer';
    badgeIcon = '🌊';
  } else if (miles >= 25) {
    rank = 'Emerald City Rover';
    badgeIcon = '🌲';
  }

  return {
    miles,
    pctSeattle,
    totalPoints,
    trailsCount: fogData.trails.length,
    rank,
    badgeIcon,
  };
}

/**
 * Clears all Fog of War history.
 */
export function clearFogHistory() {
  fogData = {
    trails: [],
    totalMiles: 0,
    lastSaved: Date.now(),
  };
  currentActiveTrail = [];
  lastRecordedCoord = null;
  localStorage.removeItem(FOG_KEY);
}
