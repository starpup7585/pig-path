// Tiny settings store backed by localStorage (stays on this iPhone only).
const KEY = 'pigpath.settings';

const DEFAULTS = {
  token: '',            // Mapbox public token (pk.…)
  car: 'ev',            // 'ev' | 'gas'
  voice: true,          // spoken directions
  avoidTolls: false,    // default route preference
  units: 'mi',          // 'mi' | 'km'
  appearance: 'auto',   // 'auto' | 'light' | 'dark'
  traffic: true,        // live traffic layer
  mapType: 'explore',   // 'explore' | 'driving' | 'satellite'
  lastLocation: null,   // { lat, lng } so the map opens where you were
  customLocation: null, // { name, lat, lng } manual location calibration/override
  favHome: null,        // { name, address, coordinates: [lng, lat] }
  favWork: null,        // { name, address, coordinates: [lng, lat] }
  evMaxRange: 260,      // full charge range in miles
  evStartPercent: 80,   // starting battery level (0-100)
  gasMaxRange: 380,     // full tank range in miles
  speedCameraAlerts: true, // speed & red light camera chimes
  schoolZoneAlerts: true,  // active school zone alerts
  mountainPassAlerts: true,// mountain pass weather advisory
};

const listeners = new Set();

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = load();

export function save(patch) {
  const changed = Object.keys(patch).filter((k) => settings[k] !== patch[k]);
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch { /* storage full or blocked */ }
  if (changed.length) listeners.forEach((fn) => fn(changed, settings));
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
