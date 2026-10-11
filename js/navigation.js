// Pig Path — Apple Maps style Turn-by-Turn Navigation & HUD Engine.
// Designed for iPhone 16 Pro with Dynamic Island clearance, voice guidance,
// live turn arrows, US speed limit signs, and drive simulation.

import { formatArrivalTime, formatDistanceMeters, formatEtaHtml } from './directions.js';
import { settings } from './store.js';
import {
  checkNearbyCameras,
  isSchoolHours,
  checkMountainPassOnRoute,
  playSafetyChime,
} from './safety.js';

export class NavigationController {
  constructor({ mapController, onEnd, onArrival, onWaypointArrival, onStepChange }) {
    this.mapCtl = mapController;
    this.onEnd = onEnd;
    this.onArrival = onArrival;
    this.onWaypointArrival = onWaypointArrival;
    this.onStepChange = onStepChange;

    this.isActive = false;
    this.route = null;
    this.destination = null;
    this.waypoint = null;
    this.waypointReached = false;
    this.waypointStepIndex = null;
    this.steps = [];
    this.currentStepIndex = 0;
    this.isMuted = false;
    this.simulationTimer = null;
    this.isSimulating = false;
    this.lastCameraAlertId = null;
    this.lastSchoolAlertTime = 0;

    // UI elements
    this.bannerEl = document.getElementById('navBanner');
    this.dockEl = document.getElementById('navDock');
    this.speedSignEl = document.getElementById('speedLimitSign');
    this.stepsModalEl = document.getElementById('stepsModal');
    this.hazardAlertEl = document.getElementById('navHazardAlert');
  }

  start(route, destination, waypoint = null) {
    if (!route || !route.steps || route.steps.length === 0) return;
    this.isActive = true;
    this.route = route;
    this.destination = destination;
    this.waypoint = waypoint;
    this.waypointReached = false;
    this.steps = this.ensureSteps(route);
    this.currentStepIndex = 0;

    if (this.waypoint && route.legs && route.legs.length > 1) {
      this.waypointStepIndex = Math.max(0, (route.legs[0].steps?.length || 1) - 1);
    } else if (this.waypoint) {
      this.waypointStepIndex = Math.max(0, Math.floor(this.steps.length / 2));
    } else {
      this.waypointStepIndex = null;
    }

    document.body.classList.add('in-navigation');

    // 3D Navigation Camera Mode (Apple Maps driving perspective)
    if (this.mapCtl && this.mapCtl.map) {
      this.mapCtl.stopOrbit();
      this.mapCtl.is3D = true;
      this.mapCtl.applyTerrain();
      const firstCoord = route.geometry?.coordinates?.[0] || destination.coordinates;
      this.mapCtl.map.easeTo({
        center: firstCoord,
        zoom: 17.2,
        pitch: 58,
        duration: 1200,
      });
    }

    this.renderBanner();
    this.renderDock();
    this.updateSpeedLimit();

    // Mountain pass advisory check
    if (settings.mountainPassAlerts !== false && route.geometry?.coordinates) {
      const pass = checkMountainPassOnRoute(route.geometry.coordinates);
      if (pass) {
        setTimeout(() => {
          import('./ui.js').then(({ toast }) => {
            toast(`❄️ Mountain Pass Advisory: ${pass.name} (${pass.elevation}) · Traction tires advised · Drive safely 🐷`, 6000);
          });
        }, 1200);
      }
    }

    // Voice announcement for first instruction
    this.announceCurrentStep();
  }

  stop() {
    this.stopSimulation();
    this.isActive = false;
    this.route = null;
    this.destination = null;
    this.steps = [];
    this.currentStepIndex = 0;

    document.body.classList.remove('in-navigation');
    window.speechSynthesis?.cancel();

    if (this.mapCtl && this.mapCtl.map) {
      this.mapCtl.map.easeTo({
        pitch: 0,
        zoom: Math.min(this.mapCtl.map.getZoom(), 15),
        duration: 800,
      });
    }

    this.onEnd?.();
  }

  ensureSteps(route) {
    if (route.steps && route.steps.length > 0) return route.steps;
    // Generate realistic steps along geometry coordinates if none provided
    const coords = route.geometry?.coordinates || [];
    if (coords.length <= 1) {
      return [
        {
          maneuver: { type: 'depart', modifier: 'straight', instruction: 'Head toward your destination' },
          name: 'Route',
          distance: route.distanceMeters || 1000,
        },
        {
          maneuver: { type: 'arrive', modifier: 'straight', instruction: 'Arrive at destination' },
          name: 'Destination',
          distance: 0,
        },
      ];
    }
    return [
      {
        maneuver: { type: 'depart', modifier: 'straight', instruction: `Head toward ${this.destination?.name || 'destination'}` },
        name: 'Road',
        distance: route.distanceMeters * 0.4,
      },
      {
        maneuver: { type: 'turn', modifier: 'right', instruction: 'Turn right onto highway' },
        name: 'Highway',
        distance: route.distanceMeters * 0.5,
      },
      {
        maneuver: { type: 'arrive', modifier: 'straight', instruction: `Arrive at ${this.destination?.name || 'destination'}` },
        name: this.destination?.name || 'Destination',
        distance: 0,
      },
    ];
  }

  currentStep() {
    return this.steps[this.currentStepIndex] || null;
  }

  nextStep() {
    return this.steps[this.currentStepIndex + 1] || null;
  }

  advanceStep() {
    if (this.currentStepIndex < this.steps.length - 1) {
      this.currentStepIndex++;
      this.renderBanner();
      this.renderDock();
      this.updateSpeedLimit();
      this.announceCurrentStep();
      this.onStepChange?.(this.currentStepIndex);

      // Check waypoint arrival
      if (this.waypoint && !this.waypointReached && this.waypointStepIndex != null && this.currentStepIndex >= this.waypointStepIndex) {
        this.waypointReached = true;
        this.onWaypointArrival?.(this.waypoint);
      }

      // Check final arrival
      if (this.currentStepIndex === this.steps.length - 1) {
        this.onArrival?.(this.destination);
      }
    }
  }

  renderBanner() {
    const step = this.currentStep();
    if (!step) return;

    const iconEl = document.getElementById('navTurnIcon');
    const distEl = document.getElementById('navTurnDist');
    const instructionEl = document.getElementById('navTurnInstruction');
    const nextPreviewEl = document.getElementById('navNextPreview');
    const exitBadgeEl = document.getElementById('navExitBadge');
    const laneGuidanceEl = document.getElementById('navLaneGuidance');

    if (iconEl) iconEl.innerHTML = getManeuverIconSvg(step.maneuver);
    if (distEl) distEl.textContent = formatManeuverDistance(step.distance);
    if (instructionEl) instructionEl.textContent = step.maneuver?.instruction || step.name || 'Continue straight';

    // Highway Exit Badge
    if (exitBadgeEl) {
      const exitMatch = (step.maneuver?.instruction || '').match(/Exit\s+([0-9]+[A-Z]?|[A-Z])/i) ||
                        (step.name || '').match(/Exit\s+([0-9]+[A-Z]?|[A-Z])/i);
      if (exitMatch) {
        exitBadgeEl.textContent = `EXIT ${exitMatch[1].toUpperCase()}`;
        exitBadgeEl.classList.remove('hidden');
      } else {
        exitBadgeEl.classList.add('hidden');
      }
    }

    // Lane Guidance
    if (laneGuidanceEl) {
      renderLaneGuidance(laneGuidanceEl, step);
    }

    const next = this.nextStep();
    if (nextPreviewEl) {
      if (next && next.maneuver?.instruction) {
        nextPreviewEl.textContent = `Then: ${next.maneuver.instruction}`;
        nextPreviewEl.classList.remove('hidden');
      } else {
        nextPreviewEl.classList.add('hidden');
      }
    }
  }

  renderDock() {
    if (!this.route) return;
    const etaTimeEl = document.getElementById('navDockEtaTime');
    const arriveTimeEl = document.getElementById('navDockArriveTime');
    const distEl = document.getElementById('navDockDist');

    // Calculate remaining duration & distance from current step forward
    let remDist = 0;
    for (let i = this.currentStepIndex; i < this.steps.length; i++) {
      remDist += this.steps[i].distance || 0;
    }
    const remSec = Math.max(60, Math.round((remDist / (this.route.distanceMeters || 1)) * this.route.durationSec));

    if (etaTimeEl) etaTimeEl.innerHTML = formatEtaHtml(remSec);
    if (arriveTimeEl) arriveTimeEl.textContent = formatArrivalTime(remSec);
    if (distEl) distEl.textContent = formatDistanceMeters(remDist);

    const energyEl = document.getElementById('navDockEnergy');
    if (energyEl) {
      const isEv = settings.car !== 'gas';
      const maxRange = isEv ? (settings.evMaxRange || 260) : (settings.gasMaxRange || 380);
      const startPct = settings.evStartPercent != null ? settings.evStartPercent : 80;
      const remMiles = remDist / 1609.344;
      const usedPct = (remMiles / Math.max(1, maxRange)) * 100;
      const arrivalPct = Math.round(startPct - usedPct);

      if (isEv) {
        energyEl.textContent = `${arrivalPct}% ⚡`;
        energyEl.style.color = arrivalPct <= 15 ? '#ff3b30' : arrivalPct <= 25 ? '#ff9500' : '#34c759';
      } else {
        energyEl.textContent = `${arrivalPct}% ⛽`;
        energyEl.style.color = arrivalPct <= 15 ? '#ff3b30' : arrivalPct <= 25 ? '#ff9500' : 'var(--label2)';
      }
    }
  }

  updateSpeedLimit() {
    const step = this.currentStep();
    const name = (step?.name || '').toLowerCase();
    let limit = 35; // default arterial speed limit in WA

    if (name.includes('i-') || name.includes('interstate') || name.includes('sr ') || name.includes('hwy') || name.includes('freeway')) {
      limit = 60;
    } else if (name.includes('blvd') || name.includes('way') || name.includes('pkwy')) {
      limit = 40;
    } else if (name.includes('residential') || name.includes('alley') || name.includes('st') || name.includes('ave')) {
      limit = 25;
    }

    const numEl = document.getElementById('speedLimitNumber');
    if (numEl) numEl.textContent = limit;
  }

  buildSiriPrompt(step, nextStep) {
    if (!step) return '';
    const distMeters = step.distance || 0;
    const feet = Math.round(distMeters * 3.28084);
    let distPhrase = '';
    if (feet > 0 && feet < 300) {
      distPhrase = '';
    } else if (feet >= 300 && feet < 1500) {
      const rounded = Math.round(feet / 100) * 100;
      distPhrase = `In ${rounded} feet, `;
    } else if (feet >= 1500 && feet < 3000) {
      distPhrase = 'In half a mile, ';
    } else if (feet >= 3000) {
      const miles = (feet / 5280).toFixed(1);
      distPhrase = `In ${miles} miles, `;
    }

    let instruction = step.maneuver?.instruction || `continue on ${step.name || 'the road'}`;
    // Strip redundant leading "In X feet" if Mapbox directions already prefixed it
    instruction = instruction.replace(/^in\s+[\d\.]+\s+(feet|miles|meters|km)[,\s]*/i, '');

    let full = `${distPhrase}${instruction}`.trim();
    if (full.length > 0) full = full.charAt(0).toUpperCase() + full.slice(1);

    // Siri's natural compound instruction: "..., then merge onto I-5 North"
    if (nextStep && nextStep.maneuver?.instruction && (nextStep.distance || 0) < 600) {
      let nextInst = nextStep.maneuver.instruction.replace(/^in\s+[\d\.]+\s+(feet|miles|meters|km)[,\s]*/i, '');
      if (nextInst.length > 0) {
        nextInst = nextInst.charAt(0).toLowerCase() + nextInst.slice(1);
        full += `, then ${nextInst}`;
      }
    }

    return full;
  }

  announceCurrentStep() {
    if (this.isMuted) return;
    const step = this.currentStep();
    if (!step) return;
    const next = this.nextStep();
    const siriText = this.buildSiriPrompt(step, next);
    speakInstruction(siriText);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) window.speechSynthesis?.cancel();
    const btn = document.getElementById('navMuteBtn');
    if (btn) {
      btn.innerHTML = this.isMuted
        ? '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor"/><path d="M23 9l-6 6M17 9l6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      btn.setAttribute('aria-label', this.isMuted ? 'Unmute' : 'Mute');
    }
    return this.isMuted;
  }

  // ---------- Drive Simulation Mode ----------
  startSimulation() {
    if (!this.route || !this.route.geometry?.coordinates) return;
    this.stopSimulation();
    this.isSimulating = true;
    const coords = this.route.geometry.coordinates;
    let idx = 0;

    const stepInterval = Math.max(12, Math.floor(coords.length / Math.max(1, this.steps.length)));

    this.simulationTimer = setInterval(() => {
      if (!this.isActive || idx >= coords.length) {
        this.stopSimulation();
        return;
      }

      const curCoord = coords[idx];
      const nextCoord = coords[Math.min(idx + 1, coords.length - 1)];

      // Calculate bearing
      const bearing = calculateBearing(curCoord, nextCoord);

      // Move puck
      if (this.mapCtl) {
        this.mapCtl.ensurePuck();
        this.mapCtl.puck.setLngLat(curCoord);
        this.mapCtl.setHeading(bearing);
        this.mapCtl.map?.easeTo({
          center: curCoord,
          bearing,
          zoom: 17.5,
          pitch: 60,
          duration: 380,
          easing: (t) => t,
        });
      }

      // Check safety alerts (speed cameras, active school zones)
      this.checkSafetyAlerts(curCoord);

      // Check if we should advance step
      if (idx > 0 && idx % stepInterval === 0 && this.currentStepIndex < this.steps.length - 1) {
        this.advanceStep();
      }

      idx++;
    }, 400);
  }

  checkSafetyAlerts(coord) {
    if (!coord) return;
    const alertEl = this.hazardAlertEl;
    const iconEl = document.getElementById('navHazardIcon');
    const textEl = document.getElementById('navHazardText');
    const subEl = document.getElementById('navHazardSub');
    const distEl = document.getElementById('navHazardDist');

    // 1. Check speed or red light cameras
    if (settings.speedCameraAlerts !== false) {
      const cam = checkNearbyCameras(coord, 0.35);
      if (cam) {
        if (alertEl) {
          alertEl.classList.remove('hidden');
          if (iconEl) iconEl.textContent = cam.type === 'speed' ? '📷' : '🚦';
          if (textEl) textEl.textContent = `${cam.type === 'speed' ? 'Speed Camera Ahead' : 'Red Light Camera Ahead'} · ${cam.limit} MPH`;
          if (subEl) subEl.textContent = cam.name;
          if (distEl) distEl.textContent = `${cam.distanceFeet} FT`;
        }

        if (this.lastCameraAlertId !== cam.id) {
          this.lastCameraAlertId = cam.id;
          playSafetyChime('camera');
        }
        return;
      }
    }

    // 2. Check active school zones
    const step = this.currentStep();
    const isSchool = (step?.name || '').toLowerCase().includes('school') || (step?.maneuver?.instruction || '').toLowerCase().includes('school');
    if (isSchool && isSchoolHours() && settings.schoolZoneAlerts !== false) {
      if (alertEl) {
        alertEl.classList.remove('hidden');
        if (iconEl) iconEl.textContent = '🚸';
        if (textEl) textEl.textContent = 'Active School Zone · 20 MPH';
        if (subEl) subEl.textContent = 'School hours in effect';
        if (distEl) distEl.textContent = 'SLOW';
      }
      const speedNumEl = document.getElementById('speedLimitNumber');
      if (speedNumEl) speedNumEl.textContent = '20';

      const now = Date.now();
      if (now - this.lastSchoolAlertTime > 45000) {
        this.lastSchoolAlertTime = now;
        playSafetyChime('school');
      }
      return;
    }

    // No active alert nearby
    if (alertEl && !alertEl.classList.contains('hidden')) {
      alertEl.classList.add('hidden');
    }
  }

  stopSimulation() {
    this.isSimulating = false;
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
    if (this.hazardAlertEl) this.hazardAlertEl.classList.add('hidden');
  }
}

// Distance to maneuver formatted like Apple Maps (feet when near, miles when far)
export function formatManeuverDistance(meters) {
  if (meters == null || meters <= 15) return 'NOW';
  const feet = Math.round(meters * 3.28084);
  if (feet < 900) {
    const roundedFeet = Math.round(feet / 50) * 50;
    return `${Math.max(50, roundedFeet)} FT`;
  }
  const miles = meters / 1609.344;
  if (miles < 10) return `${miles.toFixed(1)} MI`;
  return `${Math.round(miles)} MI`;
}

// Speech synthesis for turn directions (Apple Siri voice)
let cachedVoices = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

export function speakInstruction(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
    // Prefer authentic Apple Siri / Samantha / Natural voices
    const siriVoice =
      voices.find((v) => v.lang.startsWith('en') && /siri|samantha|karen|moira|daniel|natural|apple/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith('en-US')) ||
      voices.find((v) => v.lang.startsWith('en'));

    if (siriVoice) utterance.voice = siriVoice;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[speech] voice failed', err);
  }
}

// Bearing between two [lng, lat] coordinates
function calculateBearing(start, end) {
  const [lng1, lat1] = start;
  const [lng2, lat2] = end;
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Apple Maps Lane Guidance indicator with recommended active lanes.
 */
function renderLaneGuidance(containerEl, step) {
  if (!containerEl) return;
  const modifier = step.maneuver?.modifier || 'straight';
  const type = step.maneuver?.type || 'turn';
  if (type === 'arrive') {
    containerEl.classList.add('hidden');
    return;
  }

  containerEl.classList.remove('hidden');
  containerEl.innerHTML = '';

  let lanes = [];
  if (step.intersections?.[0]?.lanes && step.intersections[0].lanes.length > 0) {
    lanes = step.intersections[0].lanes.map((l) => ({
      active: !!l.valid,
      type: l.indications?.[0] || 'straight',
    }));
  } else {
    // Generate lane configuration based on maneuver modifier
    if (modifier.includes('left')) {
      lanes = [
        { active: true, type: 'left' },
        { active: modifier === 'slight left', type: 'straight' },
        { active: false, type: 'straight' },
        { active: false, type: 'right' },
      ];
    } else if (modifier.includes('right')) {
      lanes = [
        { active: false, type: 'left' },
        { active: false, type: 'straight' },
        { active: modifier === 'slight right', type: 'straight' },
        { active: true, type: 'right' },
      ];
    } else {
      lanes = [
        { active: false, type: 'left' },
        { active: true, type: 'straight' },
        { active: true, type: 'straight' },
        { active: false, type: 'right' },
      ];
    }
  }

  lanes.forEach((l) => {
    const box = document.createElement('div');
    box.className = `lane-box ${l.active ? 'lane-active' : ''}`;
    let icon = '<svg viewBox="0 0 16 16"><path d="M8 14V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    if (l.type === 'left') {
      icon = '<svg viewBox="0 0 16 16"><path d="M12 14V8a3 3 0 00-3-3H3M6 2L3 5l3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    } else if (l.type === 'right') {
      icon = '<svg viewBox="0 0 16 16"><path d="M4 14V8a3 3 0 013-3h6M10 2l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    }
    box.innerHTML = icon;
    containerEl.appendChild(box);
  });
}

/**
 * Returns white Apple Maps SVG turn arrows matching maneuver type and modifier.
 */
export function getManeuverIconSvg(maneuver = {}) {
  const type = maneuver.type || 'turn';
  const modifier = maneuver.modifier || 'straight';

  if (type === 'arrive') {
    return '<svg viewBox="0 0 32 32"><path d="M7 6v22M7 6l16 6-16 6z" fill="#fff"/></svg>';
  }
  if (modifier === 'uturn') {
    return '<svg viewBox="0 0 32 32"><path d="M22 24V14a6 6 0 00-12 0v12M6 22l4 4 4-4" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  if (modifier === 'left') {
    return '<svg viewBox="0 0 32 32"><path d="M22 26v-10a5 5 0 00-5-5H7M11 7L6 11l5 4" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  if (modifier === 'right') {
    return '<svg viewBox="0 0 32 32"><path d="M10 26v-10a5 5 0 015-5h10M21 7l5 4-5 4" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  if (modifier === 'slight left') {
    return '<svg viewBox="0 0 32 32"><path d="M20 26v-8a6 6 0 00-2-4.5L10 8M9 13V8h5" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  if (modifier === 'slight right') {
    return '<svg viewBox="0 0 32 32"><path d="M12 26v-8a6 6 0 012-4.5L22 8M23 13V8h-5" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  if (modifier === 'sharp left') {
    return '<svg viewBox="0 0 32 32"><path d="M22 26v-6a4 4 0 00-4-4H8M11 11L6 16l5 5" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  if (modifier === 'sharp right') {
    return '<svg viewBox="0 0 32 32"><path d="M10 26v-6a4 4 0 014-4h10M21 11l5 5-5 5" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  if (type === 'roundabout') {
    return '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="8" fill="none" stroke="#fff" stroke-width="3.2"/><path d="M16 4v5M19 6l-3-3-3 3" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  // Default: straight
  return '<svg viewBox="0 0 32 32"><path d="M16 26V6M10 12l6-6 6 6" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
