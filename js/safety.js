// Pig Path — Road Safety & Alert Engine:
// Speed Camera Chimes, Active School Zone Warnings, Hazard Reporting & Mountain Pass Advisories.

import { calculateDistanceMiles } from './search.js';
import { settings } from './store.js';

// Prominent speed & red light safety cameras in Washington State
export const KNOWN_CAMERAS = [
  { id: 'cam-aurora-n', name: 'Aurora Ave N & N 85th St', type: 'speed', limit: 30, coordinates: [-122.3445, 47.6908] },
  { id: 'cam-aurora-mid', name: 'Aurora Ave N & N 130th St', type: 'speed', limit: 35, coordinates: [-122.3452, 47.7238] },
  { id: 'cam-rainier-s', name: 'Rainier Ave S & S Henderson St', type: 'speed', limit: 25, coordinates: [-122.2694, 47.5218] },
  { id: 'cam-lake-city', name: 'Lake City Way NE & NE 125th St', type: 'speed', limit: 30, coordinates: [-122.2963, 47.7192] },
  { id: 'cam-broadway', name: 'Broadway & E Pine St', type: 'redlight', limit: 25, coordinates: [-122.3211, 47.6152] },
  { id: 'cam-boren', name: 'Boren Ave & James St', type: 'redlight', limit: 25, coordinates: [-122.3235, 47.6074] },
  { id: 'cam-mercer', name: 'Mercer St & 9th Ave N', type: 'redlight', limit: 25, coordinates: [-122.3394, 47.6247] },
  { id: 'cam-4th-s', name: '4th Ave S & S Jackson St', type: 'redlight', limit: 25, coordinates: [-122.3298, 47.5992] },
  { id: 'cam-bellevue-way', name: 'Bellevue Way & NE 8th St', type: 'redlight', limit: 30, coordinates: [-122.2014, 47.6178] },
  { id: 'cam-148th', name: '148th Ave NE & NE 24th St', type: 'speed', limit: 35, coordinates: [-122.1428, 47.6321] },
];

// Major Washington mountain passes that frequently have traction advisories
export const MOUNTAIN_PASSES = [
  { id: 'pass-snoqualmie', name: 'I-90 Snoqualmie Pass', elevation: '3,022 ft', coordinates: [-121.4194, 47.4243], radiusMi: 12 },
  { id: 'pass-stevens', name: 'US-2 Stevens Pass', elevation: '4,061 ft', coordinates: [-121.0892, 47.7464], radiusMi: 10 },
  { id: 'pass-blewett', name: 'US-97 Blewett Pass', elevation: '4,102 ft', coordinates: [-120.5794, 47.3347], radiusMi: 8 },
  { id: 'pass-chinook', name: 'SR-410 Chinook Pass', elevation: '5,430 ft', coordinates: [-121.5156, 46.8725], radiusMi: 8 },
];

// Web Audio synthesizer for pleasant Apple-style two-tone turn chime & safety bell
let audioCtx = null;
export function playSafetyChime(type = 'bell') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'camera') {
      // High-pitched two-tone chime (880Hz -> 1320Hz)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.setValueAtTime(1320, t + 0.12);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t);
      osc.stop(t + 0.55);
    } else if (type === 'school') {
      // Soft double tap chime (660Hz -> 880Hz)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(660, t);
      osc.frequency.setValueAtTime(880, t + 0.1);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.45);
    } else {
      // Standard bell
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, t); // B5
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      osc.start(t);
      osc.stop(t + 0.7);
    }
  } catch (err) {
    console.warn('[safety] audio failed', err);
  }
}

/**
 * Check if the current time falls inside active school zone hours (Mon-Fri 7:30 AM - 4:30 PM).
 */
export function isSchoolHours(date = new Date()) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // weekend
  const hour = date.getHours();
  const min = date.getMinutes();
  const timeNum = hour + min / 60;
  return timeNum >= 7.5 && timeNum <= 16.5;
}

/**
 * Check if coordinate is near any speed or red light cameras.
 */
export function checkNearbyCameras(coords, thresholdMiles = 0.35) {
  if (!coords) return null;
  const userPos = { lng: coords[0], lat: coords[1] };
  for (const cam of KNOWN_CAMERAS) {
    const dist = calculateDistanceMiles(userPos, cam.coordinates);
    if (dist != null && dist <= thresholdMiles) {
      const feet = Math.round(dist * 5280);
      return { ...cam, distanceMiles: dist, distanceFeet: feet };
    }
  }
  return null;
}

/**
 * Check if route geometry crosses any known mountain passes.
 */
export function checkMountainPassOnRoute(routeCoords) {
  if (!routeCoords || routeCoords.length === 0) return null;
  for (const pass of MOUNTAIN_PASSES) {
    const passPos = { lng: pass.coordinates[0], lat: pass.coordinates[1] };
    for (let i = 0; i < routeCoords.length; i += 6) {
      const dist = calculateDistanceMiles(passPos, routeCoords[i]);
      if (dist != null && dist <= pass.radiusMi) {
        return pass;
      }
    }
  }
  return null;
}

/**
 * Local storage helpers for user-reported road hazards (Police, Hazard, Crash, Construction).
 */
const HAZARDS_STORAGE_KEY = 'pigpath_hazards';

export function getReportedHazards() {
  try {
    const raw = localStorage.getItem(HAZARDS_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    // Filter out hazards older than 3 hours
    const now = Date.now();
    return list.filter((h) => now - (h.timestamp || 0) < 3 * 3600 * 1000);
  } catch {
    return [];
  }
}

export function saveReportedHazard(hazard) {
  try {
    const current = getReportedHazards();
    const updated = [
      {
        id: `hz-${Date.now()}`,
        type: hazard.type, // 'police' | 'hazard' | 'crash' | 'work'
        name: hazard.name || 'Reported Hazard',
        coordinates: hazard.coordinates,
        timestamp: Date.now(),
      },
      ...current,
    ].slice(0, 30);
    localStorage.setItem(HAZARDS_STORAGE_KEY, JSON.stringify(updated));
    return updated[0];
  } catch (err) {
    console.warn('[safety] failed to save hazard', err);
    return null;
  }
}
