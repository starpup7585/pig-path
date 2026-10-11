// Pig Path — app wiring: settings, theme, sheet, map controls, Mapbox token setup.
import { APP_VERSION, BUILD_NAME } from './version.js';
import { settings, save, onChange } from './store.js';
import { toast, openModal, closeModal, sunElevation } from './ui.js';
import { createSheet } from './sheet.js';
import { MapController } from './map.js';
import {
  searchPlaces,
  getCategoryIconSvg,
  calculateDistanceMiles,
  formatDistance,
  QUICK_CATEGORIES,
  getRecentSearches,
  saveRecentSearch,
  WA_CURATED_PLACES,
} from './search.js';
import {
  fetchRoutes,
  fetchRoute,
  formatDuration,
  formatEtaHtml,
  formatDistanceMeters,
  formatArrivalTime,
  calculateDetourEstimate,
} from './directions.js';
import { NavigationController, getManeuverIconSvg } from './navigation.js';
import { generateAdventureLoop } from './adventure.js';
import { saveReportedHazard, getReportedHazards } from './safety.js';
import { analyzeRouteCurviness } from './curviness.js';
import { getFogGeoJson, getFogStats, clearFogHistory } from './fog.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------- Version (shown in Settings › About and the sheet footer) ----------
$$('[data-version]').forEach((el) => (el.textContent = APP_VERSION));
$$('[data-build]').forEach((el) => (el.textContent = BUILD_NAME));

// ---------- Locate button icons ----------
const LOCATE_ICONS = {
  off: '<svg viewBox="0 0 24 24"><path d="M20.5 3.5L3.5 10.6l7.4 2.5 2.5 7.4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
  follow: '<svg viewBox="0 0 24 24"><path d="M20.5 3.5L3.5 10.6l7.4 2.5 2.5 7.4z" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
  heading: '<svg viewBox="0 0 24 24"><path d="M12 2.5l6.5 18-6.5-3.8-6.5 3.8z" fill="currentColor"/></svg>',
};

function updateLocateButton(mode) {
  const btn = $('#btnLocate');
  btn.innerHTML = LOCATE_ICONS[mode];
  btn.dataset.mode = mode;
}

function updateCompass(bearing) {
  $('#btnCompass').classList.toggle('hidden', Math.abs(bearing) < 1);
  $('#compassRose').style.transform = `rotate(${-bearing}deg)`;
}

// ---------- Map ----------
const mapCtl = new MapController('map', {
  onTokenError: () =>
    showTokenModal('That token didn’t work. Make sure you copied the whole thing — it starts with pk.'),
  onLocateMode: updateLocateButton,
  onBearing: updateCompass,
  on3D: (is3D) => ($('#btn3D').textContent = is3D ? '2D' : '3D'),
  onLocation: () => {
    applyTheme();
    updateLocationUI();
    updateLocationModalUI();
    if (navCtl && navCtl.isActive && mapCtl.pos) {
      navCtl.updateLiveSpeed(mapCtl.pos.speed, [mapCtl.pos.lng, mapCtl.pos.lat]);
    }
  },
  onSelectRoute: (routeId) => {
    selectRouteByIndex(routeId);
    toast(`Switched to ${currentRoutes[routeId]?.summary || 'route'} 🐷`);
  },
  onMapTap: () => {
    if (sheet.state !== 'peek') sheet.snapTo('peek');
  },
});

function startMap() {
  if (typeof mapboxgl === 'undefined') {
    toast('Couldn’t load the map — check your internet 🐷', 5000);
    return;
  }
  mapCtl.init(settings.token);
  mapCtl.map.on('load', () => {
    document.body.classList.add('map-ready');
    mapCtl.startWatching();
    renderHazardMarkers();
    syncFogOfWarMap();
  });
  applyTheme();
}

// ---------- Bottom sheet ----------
const sheet = createSheet($('#sheet'), {
  onChange: (_state, visible) => {
    const capped = Math.min(visible, window.innerHeight * 0.5);
    document.documentElement.style.setProperty('--sheet-visible', `${capped}px`);
    mapCtl.setBottomPadding(Math.min(visible, window.innerHeight * 0.46));
  },
});

// ---------- Theme: auto = dark at night (real sunset at your location) or when iPhone is in Dark Mode ----------
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');

function computePreset() {
  if (settings.appearance === 'light') return 'day';
  if (settings.appearance === 'dark') return 'night';
  const now = new Date();
  const loc = mapCtl.pos || settings.lastLocation;
  let elev;
  if (loc) {
    elev = sunElevation(now, loc.lat, loc.lng);
  } else {
    const h = now.getHours() + now.getMinutes() / 60;
    elev = h >= 7 && h < 19 ? 20 : (h >= 6 && h < 7) || (h >= 19 && h < 20) ? -3 : -20;
  }
  if (elev < -6 || darkMQ.matches) return 'night';
  if (elev < 2) return now.getHours() < 12 ? 'dawn' : 'dusk';
  return 'day';
}

function applyTheme() {
  const preset = computePreset();
  const theme = preset === 'night' ? 'dark' : 'light';
  if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
  mapCtl.setLightPreset(preset);
}

darkMQ.addEventListener('change', applyTheme);
setInterval(applyTheme, 60_000);
applyTheme();

// ---------- Settings controls ----------
function maskToken(t) {
  if (!t) return 'Not set';
  return `${t.slice(0, 7)}…${t.slice(-4)}`;
}

function syncControls() {
  $$('.segmented[data-setting]').forEach((seg) => {
    const v = settings[seg.dataset.setting];
    $$('button', seg).forEach((b) => b.classList.toggle('active', b.dataset.value === v));
  });
  $$('input[type=checkbox][data-setting]').forEach((i) => (i.checked = !!settings[i.dataset.setting]));
  $$('[data-maptype]').forEach((b) => b.classList.toggle('active', b.dataset.maptype === settings.mapType));
  $('#tokenValue').textContent = maskToken(settings.token);

  const isEv = settings.car !== 'gas';
  const evRow = $('#carEvRangeRow');
  const gasRow = $('#carGasRangeRow');
  if (evRow) evRow.hidden = !isEv;
  if (gasRow) gasRow.hidden = isEv;
  const evInput = $('#settingEvRange');
  if (evInput) evInput.value = settings.evMaxRange || 260;
  const gasInput = $('#settingGasRange');
  if (gasInput) gasInput.value = settings.gasMaxRange || 380;
  const foot = $('#carGroupFoot');
  if (foot) {
    foot.textContent = isEv
      ? 'Calculates arrival battery % and warns if you need to charge.'
      : 'Calculates arrival fuel % and fuel needed for this trip.';
  }
}

$('#settingEvRange')?.addEventListener('change', (e) => {
  const val = Math.max(50, Math.min(800, Number(e.target.value) || 260));
  save({ evMaxRange: val });
  if (currentRoute) updateRouteCardUI(currentRoute);
});

$('#settingGasRange')?.addEventListener('change', (e) => {
  const val = Math.max(50, Math.min(1000, Number(e.target.value) || 380));
  save({ gasMaxRange: val });
  if (currentRoute) updateRouteCardUI(currentRoute);
});

$$('.segmented[data-setting]').forEach((seg) =>
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) save({ [seg.dataset.setting]: b.dataset.value });
  }),
);
$$('input[type=checkbox][data-setting]').forEach((i) =>
  i.addEventListener('change', () => save({ [i.dataset.setting]: i.checked })),
);
$$('[data-maptype]').forEach((b) =>
  b.addEventListener('click', () => mapCtl.setMapType(b.dataset.maptype)),
);

onChange((keys) => {
  syncControls();
  if (keys.includes('appearance')) applyTheme();
  if (keys.includes('traffic')) mapCtl.applyTraffic();
  if (keys.includes('favHome') || keys.includes('favWork')) updateSavedPlacesUI();
  if (keys.includes('customLocation')) updateLocationUI();
  if (keys.includes('car') || keys.includes('evMaxRange') || keys.includes('gasMaxRange') || keys.includes('evStartPercent')) {
    if (currentRoute) updateRouteCardUI(currentRoute);
  }
  if (keys.includes('car')) {
    renderQuickCategories();
    toast(settings.car === 'ev' ? '⚡ EV mode: battery arrival % active' : '⛽ Gas mode: fuel arrival % active');
  }
  if (keys.includes('fogOfWar')) syncFogOfWarMap();
  if (keys.includes('speedometer')) {
    const badge = $('#navSpeedometerBadge');
    if (badge) badge.style.display = settings.speedometer === false ? 'none' : 'flex';
  }
  if (keys.includes('voicePersonality')) {
    toast(`🎙️ Co-Pilot set to ${settings.voicePersonality === 'roadtrip' ? 'Roadtrip 🏎️' : settings.voicePersonality === 'snarky' ? 'Snarky 😼' : 'Siri'} 🐷`);
  }
});

// ---------- Buttons ----------
$('#btnSettings').addEventListener('click', () => openModal('settingsModal'));
$('#btnLayers').addEventListener('click', () => openModal('layersModal'));
$$('[data-close]').forEach((el) =>
  el.addEventListener('click', () => closeModal(el.closest('.modal').id)),
);

$('#btnLocate').addEventListener('click', () => {
  if (!mapCtl.map) return showTokenModal();
  mapCtl.cycleLocate();
});
$('#btn3D').addEventListener('click', () => mapCtl.toggle3D());
$('#btnCompass').addEventListener('click', () => mapCtl.resetNorth());

$$('[data-soon]').forEach((el) =>
  el.addEventListener('click', () => toast(`🐷 ${el.dataset.title} is coming in v${el.dataset.soon}`)),
);

$('[data-action="freeroam"]').addEventListener('click', () => {
  if (!mapCtl.map) return showTokenModal();
  sheet.snapTo('peek');
  mapCtl.freeRoam();
  toast('🐷 Free-Roam: drag, pinch & twist to explore. Tap 2D to exit.', 3500);
});

// ---------- Panes & Search State ----------
let activePane = 'home';
let selectedDestination = null;
let currentWaypoint = null;
let activeLeaveAlarm = null;
let leaveAlarmTimer = null;
let leaveBufferMins = 5;
let stopSearchDebounce = null;
let currentStopCategory = 'ev';
let currentTransportMode = 'driving';
let currentRoute = null;
let currentRoutes = [];
let selectedRouteIndex = 0;
let searchDebounceTimer = null;

function escapeHtml(str) {
  return String(str || '').replace(
    /[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]),
  );
}

function showPane(pane) {
  activePane = pane;
  $$('.sheet-pane').forEach((el) => el.classList.add('hidden'));
  $(`#${pane}Pane`)?.classList.remove('hidden');
}

// Quick category pills on Home pane (Coffee, Food, EV Chargers/Gas, Groceries, Parking)
function renderQuickCategories() {
  const container = $('#quickCategoriesHome');
  if (!container) return;
  container.innerHTML = '';
  QUICK_CATEGORIES.forEach((cat) => {
    // Show EV or Gas based on driver car preference
    if (settings.car === 'ev' && cat.id === 'gas') return;
    if (settings.car === 'gas' && cat.id === 'ev') return;

    const iconData = getCategoryIconSvg(cat.icon);
    const btn = document.createElement('button');
    btn.className = 'cat-pill';
    btn.innerHTML = `<span class="cat-pill-icon" style="background:${iconData.bg}">${iconData.svg}</span><span>${cat.label}</span>`;
    btn.addEventListener('click', () => {
      searchInput.value = cat.query;
      showPane('search');
      sheet.snapTo('full');
      searchClear.classList.remove('hidden');
      performSearch(cat.query);
    });
    container.appendChild(btn);
  });
}

// Search Suggestions & Recents
function renderSuggestions() {
  const recents = getRecentSearches();
  const titleEl = $('#searchSectionTitle');
  const listEl = $('#recentSearchesList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const placesToRender = recents.length > 0 ? recents : WA_CURATED_PLACES.slice(0, 6);
  if (titleEl) {
    titleEl.textContent = recents.length > 0 ? 'Recent Searches' : 'Top Washington Destinations';
  }

  placesToRender.forEach((place) => {
    const iconData = getCategoryIconSvg(place.category);
    const userPos = mapCtl.pos || settings.lastLocation;
    const dist = calculateDistanceMiles(userPos, place.coordinates);
    const distText = formatDistance(dist);

    const row = document.createElement('button');
    row.className = 'list-row';
    row.innerHTML =
      `<span class="row-icon" style="background:${iconData.bg}">${iconData.svg}</span>` +
      `<span class="row-text"><span class="row-title">${escapeHtml(place.name)}</span>` +
      `<span class="row-sub">${escapeHtml(place.shortAddress || '')}</span></span>` +
      (distText ? `<span class="search-dist">${distText}</span>` : '') +
      `<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    row.addEventListener('click', () => selectPlace(place));
    listEl.appendChild(row);
  });
}

// Live Search with Mapbox Geocoding & WA fallback
async function performSearch(query) {
  const cleanQ = query.trim();
  const suggestionsSection = $('#searchSuggestionsSection');
  const resultsHead = $('#searchResultsHead');
  const resultsList = $('#searchResultsList');
  const emptyState = $('#searchEmptyState');

  if (!cleanQ) {
    suggestionsSection?.classList.remove('hidden');
    resultsHead?.classList.add('hidden');
    resultsList?.classList.add('hidden');
    emptyState?.classList.add('hidden');
    renderSuggestions();
    return;
  }

  suggestionsSection?.classList.add('hidden');
  const userPos = mapCtl.pos || settings.lastLocation;
  const places = await searchPlaces(cleanQ, {
    token: settings.token,
    userPos,
    limit: 8,
  });

  if (!places || places.length === 0) {
    resultsHead?.classList.add('hidden');
    resultsList?.classList.add('hidden');
    emptyState?.classList.remove('hidden');
    return;
  }

  emptyState?.classList.add('hidden');
  resultsHead?.classList.remove('hidden');
  resultsList?.classList.remove('hidden');
  resultsList.innerHTML = '';

  places.forEach((place) => {
    const iconData = getCategoryIconSvg(place.category);
    const distText = formatDistance(place.distanceMi);

    const row = document.createElement('button');
    row.className = 'list-row';
    row.innerHTML =
      `<span class="row-icon" style="background:${iconData.bg}">${iconData.svg}</span>` +
      `<span class="row-text"><span class="row-title">${escapeHtml(place.name)}</span>` +
      `<span class="row-sub">${escapeHtml(place.shortAddress || '')}</span></span>` +
      (distText ? `<span class="search-dist">${distText}</span>` : '') +
      `<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    row.addEventListener('click', () => selectPlace(place));
    resultsList.appendChild(row);
  });
}

// Tapping a search result or suggested place
function selectPlace(place) {
  saveRecentSearch(place);
  selectedDestination = place;
  currentWaypoint = null;
  mapCtl.clearWaypoint();
  renderWaypointStripUI();
  updateLeaveByButtonUI();
  currentRoute = null;

  // Search input reflects selected place
  searchInput.value = place.name;
  searchInput.blur();
  searchClear.classList.remove('hidden');

  // Place marker and fly camera
  mapCtl.setDestination(place.coordinates, place);
  mapCtl.flyToDestination(place.coordinates);

  // Update Destination Card
  $('#destTitle').textContent = place.name;
  $('#destSubtitle').textContent = place.shortAddress || place.fullAddress || '';
  const iconData = getCategoryIconSvg(place.category);
  $('#destCategoryIcon').style.background = iconData.bg;
  $('#destCategoryIcon').innerHTML = iconData.svg;

  const userPos = mapCtl.pos || settings.lastLocation;
  if (userPos) {
    const distMi = calculateDistanceMiles(userPos, place.coordinates);
    const approxMin = Math.max(2, Math.round(distMi * 2.1));
    $('#destDurationPill').textContent = `🚗 ~${approxMin} min`;
    $('#destDistanceSub').textContent = `· ${formatDistance(distMi)}`;
  } else {
    $('#destDurationPill').textContent = '🚗 Drive';
    $('#destDistanceSub').textContent = '';
  }

  showPane('dest');
  sheet.snapTo('half');
}

// Route preview & Directions
async function startDirections(dest, { waypoint = currentWaypoint, mode = currentTransportMode } = {}) {
  if (!dest) return;
  currentTransportMode = mode;
  updateTransportModeUI(currentTransportMode);

  const btn = $('#btnDirections');
  const origBtnText = btn ? btn.innerHTML : '';
  if (btn) btn.innerHTML = '<span>Calculating route…</span>';

  let start = mapCtl.pos
    ? [mapCtl.pos.lng, mapCtl.pos.lat]
    : settings.customLocation
    ? [settings.customLocation.lng, settings.customLocation.lat]
    : settings.lastLocation
    ? [settings.lastLocation.lng, settings.lastLocation.lat]
    : null;

  if (!start) {
    if (mapCtl.map) {
      const c = mapCtl.map.getCenter();
      start = [c.lng, c.lat];
      toast('📍 Starting from map center — turn on GPS for live start');
    } else {
      toast('Turn on Location Services to route from your location');
      if (btn) btn.innerHTML = origBtnText;
      return;
    }
  }

  try {
    currentWaypoint = waypoint;
    const waypoints = currentWaypoint ? [currentWaypoint.coordinates] : [];
    const routes = await fetchRoutes(start, dest.coordinates, {
      token: settings.token,
      avoidTolls: settings.avoidTolls,
      waypoints,
      profile: currentTransportMode,
    });
    currentRoutes = routes;
    selectedRouteIndex = 0;
    currentRoute = routes[0];

    if (currentWaypoint) {
      mapCtl.setWaypoint(currentWaypoint.coordinates, {
        icon: currentWaypoint.icon || '☕',
        name: currentWaypoint.name,
      });
    } else {
      mapCtl.clearWaypoint();
    }

    mapCtl.showRoutes(routes, 0);
    mapCtl.fitRouteBounds(start, dest.coordinates);

    renderWaypointStripUI();
    renderRouteOptionsUI();
    updateRouteCardUI(currentRoute);
    updateLeaveByButtonUI();

    showPane('route');
    sheet.snapTo('half');
  } catch (err) {
    toast('Couldn’t calculate route 🐷');
    console.warn(err);
  } finally {
    if (btn) btn.innerHTML = origBtnText;
  }
}

function updateTransportModeUI(mode) {
  $$('#routeTransportBar .transport-mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
}

function updateRouteCardUI(route) {
  if (!route) return;
  $('#routeEtaTime').innerHTML = formatEtaHtml(route.durationSec);
  $('#routeArriveTime').textContent = formatArrivalTime(route.durationSec);
  $('#routeDistance').textContent = formatDistanceMeters(route.distanceMeters);

  if (currentWaypoint) {
    $('#routeTrafficBadge').textContent = `Via stop at ${currentWaypoint.name} · Live traffic`;
  } else if (route.isFastest) {
    $('#routeTrafficBadge').textContent = settings.avoidTolls
      ? 'Toll-free route'
      : `${route.summary} · Fastest route with live traffic`;
  } else {
    $('#routeTrafficBadge').textContent = `${route.summary} · +${route.diffMins} min slower`;
  }

  // Twisty Backroad Fun Meter
  const twistyBadge = $('#routeTwistyBadge');
  if (twistyBadge && route.geometry?.coordinates) {
    const curve = analyzeRouteCurviness(route.geometry.coordinates);
    twistyBadge.className = `twisty-badge ${curve.badgeClass}`;
    twistyBadge.innerHTML = `${curve.emoji} ${curve.score}/100 Twisty · ${curve.curveCount} curves`;
    twistyBadge.title = curve.summary;
    twistyBadge.classList.remove('hidden');
  } else if (twistyBadge) {
    twistyBadge.classList.add('hidden');
  }

  updateLeaveByButtonUI();

  // Energy & Battery calculations
  const isEv = settings.car !== 'gas';
  const maxRange = isEv ? (settings.evMaxRange || 260) : (settings.gasMaxRange || 380);
  const startPct = settings.evStartPercent != null ? settings.evStartPercent : 80;
  const miles = (route.distanceMeters || 0) / 1609.344;
  const usedPct = (miles / Math.max(1, maxRange)) * 100;
  const arrivalPct = Math.round(startPct - usedPct);

  const chip = $('#btnBatteryChip');
  const arrivalText = $('#batteryArrivalText');
  const startTag = $('#batteryStartTag');
  const warningPill = $('#energyWarningPill');
  const barSvg = $('#batteryBarSvg');

  if (chip && arrivalText) {
    chip.classList.toggle('warning', arrivalPct <= 25 && arrivalPct > 12);
    chip.classList.toggle('critical', arrivalPct <= 12);

    if (isEv) {
      arrivalText.textContent = `Arrive with ${arrivalPct}% ⚡`;
      startTag.textContent = `(from ${startPct}%)`;
    } else {
      arrivalText.textContent = `Arrive with ${arrivalPct}% ⛽`;
      startTag.textContent = `(from ${startPct}%)`;
    }

    if (barSvg) {
      const fillW = Math.max(1, Math.min(10, Math.round((Math.max(0, arrivalPct) / 100) * 10)));
      barSvg.setAttribute('width', String(fillW));
      barSvg.style.color = arrivalPct <= 12 ? '#ff3b30' : arrivalPct <= 25 ? '#ff9500' : '#34c759';
    }

    if (warningPill) {
      if (arrivalPct <= 0) {
        warningPill.textContent = `🚨 Need charge (-${Math.abs(arrivalPct)}%)`;
        warningPill.hidden = false;
      } else if (arrivalPct <= 15) {
        warningPill.textContent = `⚠️ Low Battery (${arrivalPct}%)`;
        warningPill.hidden = false;
      } else {
        warningPill.hidden = true;
      }
    }
  }
}

// Battery / Fuel Modal Controls
function openBatteryModal() {
  const isEv = settings.car !== 'gas';
  const title = $('#batteryModalTitle');
  if (title) title.textContent = isEv ? 'Starting Battery Level' : 'Starting Fuel Level';
  updateBatteryModalUI();
  openModal('batteryModal');
}

function updateBatteryModalUI() {
  const isEv = settings.car !== 'gas';
  const curPct = settings.evStartPercent != null ? settings.evStartPercent : 80;
  const maxRange = isEv ? (settings.evMaxRange || 260) : (settings.gasMaxRange || 380);
  const remainingMi = Math.round((curPct / 100) * maxRange);

  const valEl = $('#batteryDialVal');
  const subEl = $('#batteryDialSub');
  const slider = $('#batterySlider');

  if (valEl) {
    valEl.textContent = `${curPct}%`;
    valEl.style.color = curPct <= 15 ? '#ff3b30' : curPct <= 25 ? '#ff9500' : '#34c759';
  }
  if (subEl) subEl.textContent = `~${remainingMi} mi remaining range`;
  if (slider) slider.value = curPct;

  $$('#batteryQuickGrid button').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.pct) === curPct);
  });
}

$('#btnBatteryChip')?.addEventListener('click', openBatteryModal);

$('#batterySlider')?.addEventListener('input', (e) => {
  const pct = Number(e.target.value);
  save({ evStartPercent: pct });
  updateBatteryModalUI();
  if (currentRoute) updateRouteCardUI(currentRoute);
});

$$('#batteryQuickGrid button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const pct = Number(btn.dataset.pct);
    save({ evStartPercent: pct });
    updateBatteryModalUI();
    if (currentRoute) updateRouteCardUI(currentRoute);
  });
});

function renderRouteOptionsUI() {
  const container = $('#routeOptionsContainer');
  if (!container) return;
  if (!currentRoutes || currentRoutes.length <= 1) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = '';

  currentRoutes.forEach((route, idx) => {
    const card = document.createElement('div');
    card.className = `route-opt-card ${idx === selectedRouteIndex ? 'active' : ''}`;
    card.dataset.routeId = idx;

    const badgeHtml = route.isFastest
      ? '<span class="route-opt-badge fastest">Fastest</span>'
      : `<span class="route-opt-badge diff">+${route.diffMins} min</span>`;

    card.innerHTML = `
      <div class="route-opt-header">
        <span class="route-opt-via" title="${escapeHtml(route.summary)}">${escapeHtml(route.summary)}</span>
        ${badgeHtml}
      </div>
      <div class="route-opt-meta">
        <span class="route-opt-time">${formatDuration(route.durationSec)}</span>
        <span class="route-opt-dist">${formatDistanceMeters(route.distanceMeters)}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      selectRouteByIndex(idx);
    });

    container.appendChild(card);
  });
}

function selectRouteByIndex(idx) {
  if (idx < 0 || idx >= currentRoutes.length) return;
  selectedRouteIndex = idx;
  currentRoute = currentRoutes[idx];

  mapCtl.showRoutes(currentRoutes, selectedRouteIndex);
  updateRouteCardUI(currentRoute);

  const container = $('#routeOptionsContainer');
  if (container) {
    $$('.route-opt-card', container).forEach((el) => {
      el.classList.toggle('active', Number(el.dataset.routeId) === selectedRouteIndex);
    });
  }
}

// Search input controls
const searchInput = $('#searchInput');
const searchClear = $('#searchClear');
const sheetCancel = $('#sheetCancel');

searchInput.addEventListener('focus', () => {
  sheet.snapTo('full');
  showPane('search');
  renderSuggestions();
  searchClear.classList.toggle('hidden', !searchInput.value.trim());
});

searchInput.addEventListener('input', () => {
  const val = searchInput.value;
  searchClear.classList.toggle('hidden', !val.trim());
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    performSearch(val);
  }, 220);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    searchInput.blur();
    performSearch(searchInput.value);
  }
});

searchClear.addEventListener('click', (e) => {
  e.preventDefault();
  searchInput.value = '';
  searchClear.classList.add('hidden');
  performSearch('');
  searchInput.focus();
});

// Apple Maps voice dictation / microphone search
$('#searchMic')?.addEventListener('click', (e) => {
  e.preventDefault();
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRec) {
    try {
      const rec = new SpeechRec();
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = false;
      toast('🎙️ Listening… Speak a destination 🐷', 4000);
      rec.onresult = (evt) => {
        const transcript = evt.results?.[0]?.[0]?.transcript;
        if (transcript) {
          searchInput.value = transcript;
          searchClear.classList.remove('hidden');
          sheet.snapTo('full');
          showPane('search');
          performSearch(transcript);
          toast(`🎙️ "${transcript}" 🐷`);
        }
      };
      rec.onerror = () => {
        toast('🎙️ Voice dictation finished · Type search above 🐷');
      };
      rec.start();
    } catch {
      toast('🎙️ Speak your destination or tap keyboard mic 🐷', 3500);
      searchInput.focus();
    }
  } else {
    toast('🎙️ Tip: Tap the microphone on your iPhone keyboard to dictate! 🐷', 3500);
    searchInput.focus();
  }
});

sheetCancel.addEventListener('click', () => {
  searchInput.blur();
  if (selectedDestination) {
    searchInput.value = selectedDestination.name;
    searchClear.classList.remove('hidden');
    showPane('dest');
    sheet.snapTo('half');
  } else {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    showPane('home');
    sheet.snapTo('peek');
  }
});

// Destination Pane buttons
$('#destClose').addEventListener('click', () => {
  mapCtl.clearDestination();
  selectedDestination = null;
  currentRoute = null;
  searchInput.value = '';
  searchClear.classList.add('hidden');
  showPane('home');
  sheet.snapTo('peek');
});

$('#btnFlyoverDest').addEventListener('click', () => {
  if (!selectedDestination) return;
  mapCtl.flyoverDestination(selectedDestination.coordinates);
  toast(`🐷 3D Flyover: Orbiting ${selectedDestination.name}`, 3200);
  sheet.snapTo('peek');
});

$('#btnDirections').addEventListener('click', () => {
  if (selectedDestination) startDirections(selectedDestination);
});

// Apple Maps Share Destination
$('#btnShareDest')?.addEventListener('click', async () => {
  if (!selectedDestination) return;
  const title = selectedDestination.name;
  const text = `Directions to ${selectedDestination.name} on Pig Path (${selectedDestination.shortAddress || ''})`;
  const url = window.location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
    } catch { /* user cancelled share */ }
  } else if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(`${title} · ${selectedDestination.shortAddress || ''}`);
      toast('📋 Address copied to clipboard! 🐷');
    } catch {
      toast(`📍 ${selectedDestination.name}`);
    }
  } else {
    toast(`📍 ${selectedDestination.name}`);
  }
});

// Apple Maps Transport Mode Selector Tabs
$$('#routeTransportBar .transport-mode-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const mode = btn.dataset.mode;
    if (mode === currentTransportMode) return;
    currentTransportMode = mode;
    updateTransportModeUI(currentTransportMode);

    if (mode === 'transit') {
      toast('🚌 Transit: Checking estimated transit schedule 🐷', 3500);
    } else if (mode === 'walking') {
      toast('🚶 Walking directions preview active 🐷');
    } else if (mode === 'cycling') {
      toast('🚲 Cycling directions preview active 🐷');
    } else {
      toast('🚗 Driving directions with live traffic 🐷');
    }

    if (selectedDestination) {
      await startDirections(selectedDestination, { mode: currentTransportMode });
    }
  });
});

// Route Preview buttons
$('#routeClose').addEventListener('click', () => {
  if (currentWaypoint) {
    currentWaypoint = null;
    mapCtl.clearWaypoint();
    renderWaypointStripUI();
  }
  mapCtl.clearRoute();
  currentRoute = null;
  currentRoutes = [];
  selectedRouteIndex = 0;
  showPane('dest');
  sheet.snapTo('half');
});

$('#btnEndRoute').addEventListener('click', () => {
  if (currentWaypoint) {
    currentWaypoint = null;
    mapCtl.clearWaypoint();
    renderWaypointStripUI();
  }
  mapCtl.clearRoute();
  currentRoute = null;
  currentRoutes = [];
  selectedRouteIndex = 0;
  showPane('dest');
  sheet.snapTo('half');
});

// ---------- Turn-by-Turn Navigation Controller ----------
const navCtl = new NavigationController({
  mapController: mapCtl,
  onEnd: () => {
    showPane('route');
    sheet.snapTo('half');
  },
  onArrival: (dest) => {
    toast(`🎉 Oink! You have arrived at ${dest?.name || 'your destination'}!`, 5000);
  },
  onWaypointArrival: (wp) => {
    toast(`☕ Stop Reached: ${wp.name}! Take a breather 🐷`, 6000);
  },
  onStepChange: () => {},
});

$('#btnStartDrive').addEventListener('click', () => {
  if (!currentRoute || !selectedDestination) return;
  navCtl.start(currentRoute, selectedDestination, currentWaypoint);
  toast(`🚗 Turn-by-Turn Navigation Started! 🐷`, 2500);
});

$('#btnNavEnd').addEventListener('click', () => {
  navCtl.stop();
});

$('#navMuteBtn').addEventListener('click', () => {
  const isMuted = navCtl.toggleMute();
  toast(isMuted ? 'Muted voice directions' : 'Voice directions unmuted');
});

$('#btnNavSimulate').addEventListener('click', () => {
  if (navCtl.isSimulating) {
    navCtl.stopSimulation();
    toast('Simulation paused');
    $('#btnNavSimulate span').textContent = 'Test';
  } else {
    navCtl.startSimulation();
    toast('🐷 Simulation driving along the route!');
    $('#btnNavSimulate span').textContent = 'Pause';
  }
});

$('#btnNavSteps').addEventListener('click', () => {
  const container = $('#stepsListContainer');
  if (!container || !navCtl.steps) return;
  container.innerHTML = '';
  navCtl.steps.forEach((step, idx) => {
    const row = document.createElement('div');
    row.className = 'list-row';
    const isCur = idx === navCtl.currentStepIndex;
    row.innerHTML =
      `<span class="row-icon" style="background:#1b8a3e;color:#fff">${getManeuverIconSvg(step.maneuver)}</span>` +
      `<span class="row-text"><span class="row-title">${escapeHtml(step.maneuver?.instruction || step.name)}</span>` +
      (step.distance ? `<span class="row-sub">${formatDistanceMeters(step.distance)}</span>` : '') +
      `</span>` +
      (isCur ? '<span class="badge" style="background:#1b8a3e;color:#fff">Current</span>' : '');
    container.appendChild(row);
  });
  openModal('stepsModal');
});

// ---------- Hazard & Incident Reporting (Apple Maps style) ----------
const activeHazardMarkers = [];

function renderHazardMarkers() {
  if (!mapCtl.map || typeof mapboxgl === 'undefined') return;
  while (activeHazardMarkers.length) {
    const m = activeHazardMarkers.pop();
    m.remove();
  }
  const hazards = getReportedHazards();
  hazards.forEach((hz) => {
    if (!hz.coordinates) return;
    const el = document.createElement('div');
    el.className = 'hazard-pin-marker';
    let icon = '⚠️';
    if (hz.type === 'police') icon = '🚓';
    else if (hz.type === 'crash') icon = '🛑';
    else if (hz.type === 'work') icon = '🚧';
    el.textContent = icon;
    el.title = `${hz.label || hz.type} reported`;

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat(hz.coordinates)
      .addTo(mapCtl.map);
    activeHazardMarkers.push(marker);
  });
}

$('#btnReportHazard')?.addEventListener('click', () => {
  openModal('hazardModal');
});

$$('#hazardModal [data-hazard]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.hazard;
    const userPos = mapCtl.pos
      ? [mapCtl.pos.lng, mapCtl.pos.lat]
      : settings.customLocation
      ? [settings.customLocation.lng, settings.customLocation.lat]
      : mapCtl.map
      ? [mapCtl.map.getCenter().lng, mapCtl.map.getCenter().lat]
      : [-122.3321, 47.6062];

    const labels = {
      police: 'Speed Trap',
      hazard: 'Road Hazard',
      crash: 'Crash',
      work: 'Road Work',
    };
    saveReportedHazard({
      type,
      label: labels[type] || 'Hazard',
      coordinates: userPos,
    });
    renderHazardMarkers();
    closeModal('hazardModal');
    toast(`🐷 Reported ${labels[type] || 'hazard'}! Thank you for warning other drivers.`);
  });
});

// ---------- CarPlay Horizontal Dashboard Mode ----------
$('#btnCarPlay')?.addEventListener('click', () => {
  const isCarPlay = document.body.classList.toggle('carplay-active');
  $('#btnCarPlay')?.classList.toggle('active', isCarPlay);
  if (isCarPlay) {
    toast('🏎️ CarPlay Dashboard layout active! Rotate device horizontally 🐷', 4000);
  } else {
    toast('Standard Navigation HUD restored 🐷');
  }
});

// ---------- Adventure Loop Generator ----------
let advDuration = 45;
let advTheme = 'waterfront';
let currentAdventureLoop = null;

$('#btnOpenAdventureLoop')?.addEventListener('click', () => {
  $('#advResultCard')?.classList.add('hidden');
  openModal('adventureModal');
});

$$('#advDurationChips .adv-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    $$('#advDurationChips .adv-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    advDuration = Number(chip.dataset.min) || 45;
  });
});

$$('#advThemeCards .adv-theme-card').forEach((card) => {
  card.addEventListener('click', () => {
    $$('#advThemeCards .adv-theme-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
    advTheme = card.dataset.theme || 'waterfront';
  });
});

$('#btnGenerateLoop')?.addEventListener('click', async () => {
  const btn = $('#btnGenerateLoop');
  const origText = btn ? btn.innerHTML : '';
  if (btn) btn.innerHTML = '<span>Calculating scenic loop… 🐷</span>';

  const startCoords = mapCtl.pos
    ? [mapCtl.pos.lng, mapCtl.pos.lat]
    : settings.customLocation
    ? [settings.customLocation.lng, settings.customLocation.lat]
    : settings.lastLocation
    ? [settings.lastLocation.lng, settings.lastLocation.lat]
    : mapCtl.map
    ? [mapCtl.map.getCenter().lng, mapCtl.map.getCenter().lat]
    : [-122.3321, 47.6062];

  try {
    const loop = await generateAdventureLoop(startCoords, {
      durationMins: advDuration,
      theme: advTheme,
      token: settings.token,
    });
    currentAdventureLoop = loop;

    const titleEl = $('#advResultTitle');
    const distEl = $('#advResultDist');
    const infoEl = $('#advResultInfo');
    const resultCard = $('#advResultCard');

    if (titleEl) titleEl.textContent = `${loop.durationMins}-Minute ${loop.name}`;
    if (distEl) distEl.textContent = `~${loop.distanceMiles} mi · ${loop.summary}`;
    if (infoEl) infoEl.textContent = `Scenic loop starting & returning to origin. Includes ${loop.theme} corridors.`;
    resultCard?.classList.remove('hidden');

    currentRoute = loop.route;
    currentRoutes = [loop.route];
    selectedRouteIndex = 0;
    selectedDestination = {
      name: `${loop.name} Loop`,
      shortAddress: `Scenic ${loop.theme} drive`,
      coordinates: startCoords,
      category: 'nature',
    };

    mapCtl.showRoutes([loop.route], 0);
    mapCtl.setDestination(startCoords, selectedDestination);
    const midIdx = Math.floor(loop.route.geometry.coordinates.length / 2);
    const midCoord = loop.route.geometry.coordinates[midIdx] || startCoords;
    mapCtl.fitRouteBounds(startCoords, midCoord);

    updateRouteCardUI(loop.route);
    toast(`✨ Generated ${loop.name}! Tap "Start Adventure Drive" 🐷`, 3500);
  } catch (err) {
    console.warn('[adventure] generation error', err);
    toast('Couldn’t generate loop — check your Mapbox token 🐷');
  } finally {
    if (btn) btn.innerHTML = origText;
  }
});

$('#btnStartAdventureDrive')?.addEventListener('click', () => {
  if (!currentAdventureLoop || !currentRoute) return;
  closeModal('adventureModal');
  showPane('route');
  sheet.snapTo('peek');
  navCtl.start(currentRoute, selectedDestination);
  toast(`🏎️ Adventure Drive Started! Enjoy your scenic drive 🐷`, 3500);
});

// ---------- Fog of War Washington Tracker ----------
function syncFogOfWarMap() {
  if (!mapCtl.map) return;
  const isEnabled = settings.fogOfWar !== false;
  mapCtl.setFogOfWarVisible(isEnabled);
  if (isEnabled) {
    mapCtl.updateFogOfWarLayer(getFogGeoJson());
  }
}

function updateFogModalUI() {
  const stats = getFogStats();
  const milesEl = $('#fogStatMiles');
  const pctEl = $('#fogStatPct');
  const titleEl = $('#fogRankTitle');
  const iconEl = $('#fogRankIcon');

  if (milesEl) milesEl.textContent = stats.miles;
  if (pctEl) pctEl.textContent = `${stats.pctSeattle}%`;
  if (titleEl) titleEl.textContent = stats.rank;
  if (iconEl) iconEl.textContent = stats.badgeIcon;
}

$('#btnOpenFogOfWar')?.addEventListener('click', () => {
  updateFogModalUI();
  openModal('fogModal');
});

$('#btnViewFogMap')?.addEventListener('click', () => {
  closeModal('fogModal');
  sheet.snapTo('peek');
  syncFogOfWarMap();
  if (mapCtl.map) {
    mapCtl.map.flyTo({
      center: [-122.34, 47.61],
      zoom: 11.2,
      pitch: 48,
      duration: 1600,
    });
  }
  toast('✨ Fog of War: Glowing roads show where you’ve driven 🐷', 3500);
});

$('#btnClearFog')?.addEventListener('click', () => {
  clearFogHistory();
  syncFogOfWarMap();
  updateFogModalUI();
  toast('Fog of War exploration history reset 🐷');
});

// ---------- Saved Places (Home & Work) ----------
function updateSavedPlacesUI() {
  const homeSub = $('#favHomeSub');
  const workSub = $('#favWorkSub');
  const setHomeVal = $('#settingsHomeValue');
  const setWorkVal = $('#settingsWorkValue');

  if (homeSub) homeSub.textContent = settings.favHome ? (settings.favHome.name || settings.favHome.shortAddress) : 'Set in search';
  if (workSub) workSub.textContent = settings.favWork ? (settings.favWork.name || settings.favWork.shortAddress) : 'Set in search';

  if (setHomeVal) setHomeVal.textContent = settings.favHome ? (settings.favHome.name || settings.favHome.shortAddress) : 'Not set';
  if (setWorkVal) setWorkVal.textContent = settings.favWork ? (settings.favWork.name || settings.favWork.shortAddress) : 'Not set';
}

$('#btnSetAsHome')?.addEventListener('click', () => {
  if (!selectedDestination) return;
  save({ favHome: selectedDestination });
  updateSavedPlacesUI();
  toast(`🐷 Saved ${selectedDestination.name} as Home!`);
});

$('#btnSetAsWork')?.addEventListener('click', () => {
  if (!selectedDestination) return;
  save({ favWork: selectedDestination });
  updateSavedPlacesUI();
  toast(`🐷 Saved ${selectedDestination.name} as Work!`);
});

$('#settingsHomeRow')?.addEventListener('click', () => {
  closeModal('settingsModal');
  if (settings.favHome) {
    selectPlace(settings.favHome);
    startDirections(settings.favHome);
  } else {
    showPane('search');
    sheet.snapTo('full');
    searchInput.focus();
    toast('Search your home address, then tap "Set as Home" 🐷');
  }
});

$('#settingsWorkRow')?.addEventListener('click', () => {
  closeModal('settingsModal');
  if (settings.favWork) {
    selectPlace(settings.favWork);
    startDirections(settings.favWork);
  } else {
    showPane('search');
    sheet.snapTo('full');
    searchInput.focus();
    toast('Search your work address, then tap "Set as Work" 🐷');
  }
});

// Favorites (Home / Work shortcuts)
$$('[data-fav]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const type = btn.dataset.fav;
    const saved = type === 'home' ? settings.favHome : settings.favWork;
    if (saved) {
      selectPlace(saved);
      await startDirections(saved);
    } else {
      searchInput.value = type === 'home' ? 'Home' : 'Work';
      sheet.snapTo('full');
      showPane('search');
      searchInput.focus();
      toast(`Search your ${type} address, then tap "Set as ${type === 'home' ? 'Home' : 'Work'}" on the place card! 🐷`);
    }
  });
});

// ---------- Mapbox token setup ----------
function showTokenModal(error) {
  $('#tokenInput').value = settings.token || '';
  const errEl = $('#tokenError');
  errEl.hidden = !error;
  errEl.textContent = error || '';
  $('#tokenCancel').hidden = !settings.token || !!error;
  closeModal('settingsModal');
  openModal('tokenModal');
}

$('#tokenRow').addEventListener('click', () => showTokenModal());
$('#tokenCancel').addEventListener('click', () => closeModal('tokenModal'));

$('#tokenPaste').addEventListener('click', async () => {
  try {
    $('#tokenInput').value = (await navigator.clipboard.readText()).trim();
  } catch {
    toast('Long-press the box and tap Paste');
  }
});

$('#tokenSave').addEventListener('click', () => {
  const t = $('#tokenInput').value.trim();
  const errEl = $('#tokenError');
  if (!/^pk\.[\w-]+\.[\w-]+$/.test(t)) {
    errEl.hidden = false;
    errEl.textContent = t.startsWith('sk.')
      ? 'That’s a secret token (sk.). Use your Default public token — it starts with pk.'
      : 'That doesn’t look like a Mapbox public token. It should start with pk.';
    return;
  }
  const hadMap = !!mapCtl.map;
  const changed = t !== settings.token;
  save({ token: t });
  closeModal('tokenModal');
  if (!hadMap) {
    startMap();
    toast('🐷 Oink! Maps are ready');
  } else if (changed || mapCtl.tokenErrorShown) {
    location.reload();
  }
});

// ---------- Waypoint & Stop Along Route Management ----------
function getStopCategoryIcon(cat) {
  switch (cat) {
    case 'ev': return '⚡';
    case 'gas': return '⛽';
    case 'coffee': return '☕';
    case 'food':
    case 'restaurant': return '🍔';
    case 'parking': return '🅿️';
    case 'groceries': return '🛒';
    default: return '📍';
  }
}

function getRouteMidpoint() {
  if (currentRoute && currentRoute.geometry?.coordinates?.length > 1) {
    const coords = currentRoute.geometry.coordinates;
    const midIdx = Math.floor(coords.length / 2);
    return coords[midIdx];
  }
  const userPos = mapCtl.pos || settings.customLocation || settings.lastLocation;
  if (userPos && selectedDestination?.coordinates) {
    return [
      (userPos.lng + selectedDestination.coordinates[0]) / 2,
      (userPos.lat + selectedDestination.coordinates[1]) / 2,
    ];
  }
  if (selectedDestination?.coordinates) return selectedDestination.coordinates;
  return [-122.3321, 47.6062];
}

function renderWaypointStripUI() {
  const strip = $('#waypointStrip');
  const iconEl = $('#waypointBadgeIcon');
  const nameEl = $('#waypointStripName');
  const subEl = $('#waypointStripSub');
  const addBtnText = $('#addStopBtnText');
  const addBtnTag = $('#addStopTag');

  if (!strip) return;

  if (currentWaypoint) {
    strip.classList.remove('hidden');
    if (iconEl) iconEl.textContent = currentWaypoint.icon || '📍';
    if (nameEl) nameEl.textContent = currentWaypoint.name || 'Added Stop';
    const detourText = currentWaypoint.detourMins ? `+${currentWaypoint.detourMins} min detour` : 'Detour added';
    if (subEl) subEl.textContent = `Stop along route · ${detourText}`;
    if (addBtnText) addBtnText.textContent = 'Change Stop';
    if (addBtnTag) addBtnTag.textContent = currentWaypoint.name;
    $('#btnAddStop')?.classList.add('active');
  } else {
    strip.classList.add('hidden');
    if (addBtnText) addBtnText.textContent = 'Add Stop';
    const isEv = settings.car !== 'gas';
    if (addBtnTag) addBtnTag.textContent = isEv ? '⚡ ☕ 🍔 🅿️' : '⛽ ☕ 🍔 🅿️';
    $('#btnAddStop')?.classList.remove('active');
  }
}

$('#btnRemoveWaypoint')?.addEventListener('click', async (e) => {
  e.stopPropagation();
  currentWaypoint = null;
  mapCtl.clearWaypoint();
  renderWaypointStripUI();
  if (selectedDestination) {
    await startDirections(selectedDestination, { waypoint: null });
    toast('Stop removed · Direct route restored 🐷');
  }
});

function openAddStopModal() {
  const isEv = settings.car !== 'gas';
  const primaryChip = $('#stopCatPrimary');
  if (primaryChip) {
    primaryChip.dataset.cat = isEv ? 'ev' : 'gas';
    primaryChip.textContent = isEv ? '⚡ Fast Chargers' : '⛽ Gas Stations';
  }

  currentStopCategory = isEv ? 'ev' : 'gas';
  $$('#stopCategoriesRow .stop-cat-chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.cat === currentStopCategory);
  });

  const searchInp = $('#stopSearchInput');
  if (searchInp) searchInp.value = '';
  $('#stopSearchClear')?.classList.add('hidden');

  fetchAndRenderStops(currentStopCategory);
  openModal('addStopModal');
}

async function fetchAndRenderStops(categoryOrQuery) {
  const listEl = $('#stopCandidatesList');
  const emptyEl = $('#stopEmptyState');
  if (!listEl) return;

  listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--label2);font-weight:600;">Searching stops along route… 🐷</div>';
  emptyEl?.classList.add('hidden');

  let query = categoryOrQuery;
  if (categoryOrQuery === 'ev') query = 'EV charging station';
  else if (categoryOrQuery === 'gas') query = 'gas station';
  else if (categoryOrQuery === 'coffee') query = 'coffee';
  else if (categoryOrQuery === 'food') query = 'restaurants';
  else if (categoryOrQuery === 'parking') query = 'parking';

  const mid = getRouteMidpoint();
  const places = await searchPlaces(query, {
    token: settings.token,
    userPos: { lng: mid[0], lat: mid[1] },
    limit: 10,
  });

  if (!places || places.length === 0) {
    listEl.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }

  const start = mapCtl.pos
    ? [mapCtl.pos.lng, mapCtl.pos.lat]
    : settings.lastLocation
    ? [settings.lastLocation.lng, settings.lastLocation.lat]
    : mid;
  const dest = selectedDestination?.coordinates || mid;

  const withDetours = places.map((p) => {
    const detour = calculateDetourEstimate(start, p.coordinates, dest);
    return { ...p, detour };
  });

  withDetours.sort((a, b) => a.detour.extraMins - b.detour.extraMins);
  renderStopCandidates(withDetours);
}

function renderStopCandidates(stops) {
  const listEl = $('#stopCandidatesList');
  const emptyEl = $('#stopEmptyState');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (stops.length === 0) {
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  stops.forEach((stop) => {
    const card = document.createElement('div');
    card.className = 'stop-candidate-card';
    const icon = getStopCategoryIcon(stop.category);
    const detourMins = stop.detour?.extraMins || 2;
    const isFast = detourMins <= 3;
    const distText = stop.distanceMi != null ? `${formatDistance(stop.distanceMi)} away` : '';

    card.innerHTML = `
      <div class="stop-card-main">
        <span class="stop-card-icon">${icon}</span>
        <div class="stop-card-info">
          <span class="stop-card-title">${escapeHtml(stop.name)}</span>
          <span class="stop-card-addr">${escapeHtml(stop.shortAddress || stop.fullAddress || '')}</span>
          <div class="stop-card-meta">
            <span class="detour-badge ${isFast ? 'fast' : ''}">+${detourMins} min detour</span>
            <span class="stop-card-dist">${distText}</span>
          </div>
        </div>
      </div>
      <button class="stop-add-btn" type="button">+ Add</button>
    `;

    card.addEventListener('click', async () => {
      closeModal('addStopModal');
      await applyWaypointStop({
        ...stop,
        icon,
        detourMins,
      });
    });

    listEl.appendChild(card);
  });
}

async function applyWaypointStop(stop) {
  currentWaypoint = stop;
  await startDirections(selectedDestination, { waypoint: currentWaypoint });
  toast(`🐷 Added stop: ${stop.name} (+${stop.detourMins} min detour)`);
}

$('#btnAddStop')?.addEventListener('click', () => {
  if (!selectedDestination || !currentRoute) {
    toast('Calculate a route first to add a stop 🐷');
    return;
  }
  openAddStopModal();
});

$$('#stopCategoriesRow .stop-cat-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#stopCategoriesRow .stop-cat-chip').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentStopCategory = btn.dataset.cat;
    const searchInp = $('#stopSearchInput');
    if (searchInp) searchInp.value = '';
    $('#stopSearchClear')?.classList.add('hidden');
    fetchAndRenderStops(currentStopCategory);
  });
});

const stopSearchInput = $('#stopSearchInput');
const stopSearchClear = $('#stopSearchClear');

stopSearchInput?.addEventListener('input', () => {
  const val = stopSearchInput.value.trim();
  stopSearchClear?.classList.toggle('hidden', !val);
  clearTimeout(stopSearchDebounce);
  stopSearchDebounce = setTimeout(() => {
    if (val) {
      $$('#stopCategoriesRow .stop-cat-chip').forEach((b) => b.classList.remove('active'));
      fetchAndRenderStops(val);
    } else {
      fetchAndRenderStops(currentStopCategory);
    }
  }, 250);
});

stopSearchClear?.addEventListener('click', () => {
  if (stopSearchInput) stopSearchInput.value = '';
  stopSearchClear?.classList.add('hidden');
  fetchAndRenderStops(currentStopCategory);
  stopSearchInput?.focus();
});

// ---------- Leave By Departure Clock ----------
function computeDeparturePlan(targetTimeString, bufferMins) {
  if (!targetTimeString || !currentRoute) return null;
  const [hStr, mStr] = targetTimeString.split(':');
  const targetH = parseInt(hStr, 10);
  const targetM = parseInt(mStr, 10);
  if (Number.isNaN(targetH) || Number.isNaN(targetM)) return null;

  const now = new Date();
  const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetH, targetM, 0, 0);

  // If target time is past today by more than 1 hour, roll to tomorrow
  if (targetDate.getTime() < now.getTime() - 60 * 60 * 1000) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const travelDurationSec = currentRoute.durationSec || 900;
  const bufferSec = (bufferMins || 0) * 60;
  const totalOffsetSec = travelDurationSec + bufferSec;

  const departureTimestamp = targetDate.getTime() - totalOffsetSec * 1000;
  const diffSec = Math.round((departureTimestamp - now.getTime()) / 1000);
  const diffMins = Math.round(diffSec / 60);

  const depDate = new Date(departureTimestamp);
  let depH = depDate.getHours();
  const depM = depDate.getMinutes().toString().padStart(2, '0');
  const ampm = depH >= 12 ? 'PM' : 'AM';
  depH = depH % 12 || 12;
  const departureFormatted = `${depH}:${depM} ${ampm}`;

  let targetHFormatted = targetH % 12 || 12;
  const targetMFormatted = targetM.toString().padStart(2, '0');
  const targetAmpm = targetH >= 12 ? 'PM' : 'AM';
  const targetFormatted = `${targetHFormatted}:${targetMFormatted} ${targetAmpm}`;

  return {
    targetDate,
    targetFormatted,
    departureTimestamp,
    departureFormatted,
    diffMins,
    travelDurationSec,
    bufferMins,
  };
}

function openLeaveByModal() {
  if (!currentRoute) {
    toast('Calculate a route first to plan departure 🐷');
    return;
  }
  const timeInput = $('#leaveTargetTimeInput');
  if (timeInput) {
    if (!timeInput.value || !activeLeaveAlarm) {
      const travelSec = currentRoute.durationSec || 900;
      const defTarget = new Date(Date.now() + (travelSec + 15 * 60) * 1000);
      const m = Math.ceil(defTarget.getMinutes() / 5) * 5;
      defTarget.setMinutes(m);
      timeInput.value = `${defTarget.getHours().toString().padStart(2, '0')}:${defTarget.getMinutes().toString().padStart(2, '0')}`;
    }
  }

  updateLeaveByModalUI();
  openModal('leaveByModal');
}

function updateLeaveByModalUI() {
  if (!currentRoute) return;
  const timeInput = $('#leaveTargetTimeInput');
  if (!timeInput || !timeInput.value) return;

  const plan = computeDeparturePlan(timeInput.value, leaveBufferMins);
  if (!plan) return;

  const heroTime = $('#leaveHeroTime');
  const heroCountdown = $('#leaveHeroCountdown');
  const statusBadge = $('#leaveStatusBadge');
  const calcCard = $('.leave-calc-card');
  const driveDurEl = $('#leaveDriveDuration');
  const bufferValEl = $('#leaveBufferVal');
  const targetSummaryEl = $('#leaveTargetSummary');

  if (heroTime) heroTime.textContent = plan.departureFormatted;
  if (driveDurEl) driveDurEl.textContent = formatDuration(plan.travelDurationSec);
  if (bufferValEl) bufferValEl.textContent = `${plan.bufferMins} min`;
  if (targetSummaryEl) targetSummaryEl.textContent = plan.targetFormatted;

  if (heroCountdown && statusBadge && calcCard) {
    calcCard.classList.remove('warning', 'critical');
    heroCountdown.classList.remove('warning', 'critical');
    statusBadge.classList.remove('warning', 'critical');

    if (plan.diffMins > 15) {
      statusBadge.textContent = '🟢 On Track';
      heroCountdown.textContent = `Leave in ${plan.diffMins} min`;
    } else if (plan.diffMins > 0) {
      statusBadge.textContent = '🟡 Leaving Soon';
      statusBadge.classList.add('warning');
      heroCountdown.textContent = `Leave in ${plan.diffMins} min`;
      heroCountdown.classList.add('warning');
      calcCard.classList.add('warning');
    } else if (plan.diffMins >= -15) {
      statusBadge.textContent = '🔴 Depart Now!';
      statusBadge.classList.add('critical');
      heroCountdown.textContent = plan.diffMins === 0 ? 'Depart immediately' : `Departed ${Math.abs(plan.diffMins)}m ago`;
      heroCountdown.classList.add('critical');
      calcCard.classList.add('critical');
    } else {
      statusBadge.textContent = '⚠️ Late';
      statusBadge.classList.add('critical');
      heroCountdown.textContent = `${Math.abs(plan.diffMins)} min past departure`;
      heroCountdown.classList.add('critical');
      calcCard.classList.add('critical');
    }
  }

  const clearBtn = $('#btnClearLeaveAlarm');
  if (clearBtn) clearBtn.hidden = !activeLeaveAlarm;
  const setBtnText = $('#btnSetLeaveAlarmText');
  if (setBtnText) {
    setBtnText.textContent = activeLeaveAlarm ? 'Update Departure Alert' : 'Set Departure Alert';
  }
}

function updateLeaveByButtonUI() {
  const btn = $('#btnLeaveBy');
  const textEl = $('#leaveByBtnText');
  const tagEl = $('#leaveByTag');
  if (!btn) return;

  if (activeLeaveAlarm && currentRoute) {
    const timeInput = $('#leaveTargetTimeInput');
    const plan = computeDeparturePlan(timeInput?.value || '', leaveBufferMins);
    if (plan) {
      btn.classList.add('active');
      if (textEl) textEl.textContent = `Leave ${plan.departureFormatted}`;
      if (tagEl) tagEl.textContent = plan.diffMins > 0 ? `⏰ In ${plan.diffMins}m` : '⏰ Depart now';
      return;
    }
  }

  btn.classList.remove('active');
  if (textEl) textEl.textContent = 'Leave By';
  if (tagEl) tagEl.textContent = 'Arrive on time';
}

function playDepartureChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    [587.33, 880.0].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.16);

      gain.gain.setValueAtTime(0, now + i * 0.16);
      gain.gain.linearRampToValueAtTime(0.3, now + i * 0.16 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.16 + 0.65);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.7);
    });
  } catch (err) {
    console.warn('[audio] chime not permitted', err);
  }
}

function scheduleLeaveAlarm() {
  const timeInput = $('#leaveTargetTimeInput');
  const plan = computeDeparturePlan(timeInput?.value || '', leaveBufferMins);
  if (!plan) return;

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  if (leaveAlarmTimer) {
    clearTimeout(leaveAlarmTimer);
    leaveAlarmTimer = null;
  }

  activeLeaveAlarm = plan;

  const msUntilDeparture = plan.departureTimestamp - Date.now();
  if (msUntilDeparture > 0) {
    leaveAlarmTimer = setTimeout(() => {
      triggerDepartureAlert(plan);
    }, msUntilDeparture);
  } else {
    triggerDepartureAlert(plan);
  }

  updateLeaveByButtonUI();
  closeModal('leaveByModal');
  toast(`⏰ Departure alarm set for ${plan.departureFormatted} · Pig Path will notify you 🐷`, 3500);
}

function triggerDepartureAlert(plan) {
  playDepartureChime();
  const destName = selectedDestination?.name || 'your destination';
  const title = `⏰ Time to Hit the Road! 🐷`;
  const body = `Depart now (${plan.departureFormatted}) for ${destName} to arrive on time by ${plan.targetFormatted}!`;

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
    });
  }
  toast(`⏰ Time to leave for ${destName}! Arrive by ${plan.targetFormatted} 🐷`, 8000);
}

function clearLeaveAlarm() {
  if (leaveAlarmTimer) {
    clearTimeout(leaveAlarmTimer);
    leaveAlarmTimer = null;
  }
  activeLeaveAlarm = null;
  updateLeaveByButtonUI();
  closeModal('leaveByModal');
  toast('Departure alert cancelled');
}

$('#btnLeaveBy')?.addEventListener('click', openLeaveByModal);
$('#leaveTargetTimeInput')?.addEventListener('input', updateLeaveByModalUI);

$$('#leaveQuickOffsets button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const offsetMins = Number(btn.dataset.offset) || 30;
    const now = new Date();
    const future = new Date(now.getTime() + offsetMins * 60 * 1000);
    const timeInput = $('#leaveTargetTimeInput');
    if (timeInput) {
      timeInput.value = `${future.getHours().toString().padStart(2, '0')}:${future.getMinutes().toString().padStart(2, '0')}`;
      updateLeaveByModalUI();
    }
  });
});

$$('#leaveBufferSegmented button').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#leaveBufferSegmented button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    leaveBufferMins = Number(btn.dataset.buffer) || 0;
    updateLeaveByModalUI();
  });
});

$('#btnSetLeaveAlarm')?.addEventListener('click', scheduleLeaveAlarm);
$('#btnClearLeaveAlarm')?.addEventListener('click', clearLeaveAlarm);

// ---------- Location Calibration & Accuracy Controls ----------
function updateLocationUI() {
  const locVal = $('#settingsLocationValue');
  const locFoot = $('#settingsLocationFoot');
  if (!locVal) return;

  if (settings.customLocation) {
    locVal.textContent = `🎯 ${settings.customLocation.name || 'Calibrated'}`;
    locVal.style.color = '#007aff';
    if (locFoot) locFoot.textContent = `Using custom spot: ${settings.customLocation.name}. Tap to recalibrate or reset to GPS.`;
  } else if (mapCtl.pos) {
    const acc = mapCtl.pos.accuracy || 0;
    if (acc < 50) {
      locVal.textContent = `±${Math.round(acc * 3.28)} ft (GPS)`;
      locVal.style.color = '#34c759';
    } else if (acc < 300) {
      locVal.textContent = `±${Math.round(acc * 3.28)} ft (Good)`;
      locVal.style.color = '#34c759';
    } else {
      const mi = (acc / 1609.344).toFixed(1);
      locVal.textContent = `⚠️ ±${mi} mi (Coarse)`;
      locVal.style.color = '#ff9500';
    }
    if (locFoot) {
      locFoot.textContent = acc > 500
        ? 'Location is approximate (few miles off). Tap to calibrate or enable iOS Precise Location.'
        : 'High-precision satellite GPS active.';
    }
  } else {
    locVal.textContent = 'Detecting…';
    locVal.style.color = 'var(--label2)';
  }
}

function openLocationModal() {
  updateLocationModalUI();
  const searchInp = $('#locSearchInput');
  if (searchInp) searchInp.value = '';
  $('#locSearchClear')?.classList.add('hidden');
  $('#locSearchResultsList')?.classList.add('hidden');
  openModal('locationModal');
}

function updateLocationModalUI() {
  const badge = $('#locPrecisionBadge');
  const coordsText = $('#locCoordsText');
  const accuracyText = $('#locAccuracyText');
  const statusSub = $('#locStatusSub');
  const calibratedBanner = $('#locCalibratedBanner');
  const calibratedName = $('#locCalibratedName');
  const homeSub = $('#locHomeSub');
  const workSub = $('#locWorkSub');

  if (homeSub) homeSub.textContent = settings.favHome ? settings.favHome.name : 'Home not set yet';
  if (workSub) workSub.textContent = settings.favWork ? settings.favWork.name : 'Work not set yet';

  if (settings.customLocation) {
    calibratedBanner?.classList.remove('hidden');
    if (calibratedName) calibratedName.textContent = settings.customLocation.name || 'Custom spot';
    if (badge) {
      badge.textContent = '🎯 Calibrated Spot';
      badge.className = 'loc-status-badge calibrated';
    }
    if (coordsText) coordsText.textContent = `${settings.customLocation.lat.toFixed(4)}°, ${settings.customLocation.lng.toFixed(4)}°`;
    if (accuracyText) accuracyText.textContent = 'Exact Pinned Location';
    if (statusSub) statusSub.textContent = 'Your location puck and directions are pinned to this exact calibrated address.';
    return;
  }

  calibratedBanner?.classList.add('hidden');

  if (mapCtl.pos) {
    const acc = mapCtl.pos.accuracy || 0;
    const isPrecise = acc < 200;
    if (badge) {
      badge.textContent = isPrecise ? '🟢 High Precision GPS' : '⚠️ Approximate Location';
      badge.className = `loc-status-badge ${isPrecise ? '' : 'coarse'}`;
    }
    if (coordsText) coordsText.textContent = `${mapCtl.pos.lat.toFixed(4)}°, ${mapCtl.pos.lng.toFixed(4)}°`;
    if (accuracyText) {
      accuracyText.textContent = acc < 500
        ? `Accuracy: ±${Math.round(acc * 3.28)} ft`
        : `Accuracy: ±${(acc / 1609.344).toFixed(1)} miles`;
    }
    if (statusSub) {
      statusSub.textContent = isPrecise
        ? 'Connected to hardware satellite GPS with high accuracy.'
        : 'Using approximate Wi-Fi or cellular location. If you are on iPhone, turn ON "Precise Location" in iOS Settings, or pin your address below.';
    }
  } else {
    if (badge) badge.textContent = '⏳ Waiting for GPS…';
    if (coordsText) coordsText.textContent = '--°, --°';
    if (accuracyText) accuracyText.textContent = 'Accuracy: Detecting…';
  }
}

$('#settingsLocationRow')?.addEventListener('click', openLocationModal);

$('#btnLocRefreshGps')?.addEventListener('click', () => {
  mapCtl.clearCustomLocation();
  updateLocationUI();
  updateLocationModalUI();
  toast('🔄 Querying fresh high-accuracy satellite GPS… 🐷');
});

$('#btnRevertGps')?.addEventListener('click', () => {
  mapCtl.clearCustomLocation();
  updateLocationUI();
  updateLocationModalUI();
  toast('🔄 Reverted to live device GPS 🐷');
});

$('#btnLocUseHome')?.addEventListener('click', () => {
  if (settings.favHome && settings.favHome.coordinates) {
    const [lng, lat] = settings.favHome.coordinates;
    mapCtl.setCustomLocation({ lat, lng, name: settings.favHome.name || 'Home' });
    updateLocationUI();
    updateLocationModalUI();
    closeModal('locationModal');
    toast(`🎯 Location calibrated to Home (${settings.favHome.name})! 🐷`);
  } else {
    toast('Set a Home address first in Settings or Search 🐷');
  }
});

$('#btnLocUseWork')?.addEventListener('click', () => {
  if (settings.favWork && settings.favWork.coordinates) {
    const [lng, lat] = settings.favWork.coordinates;
    mapCtl.setCustomLocation({ lat, lng, name: settings.favWork.name || 'Work' });
    updateLocationUI();
    updateLocationModalUI();
    closeModal('locationModal');
    toast(`🎯 Location calibrated to Work (${settings.favWork.name})! 🐷`);
  } else {
    toast('Set a Work address first in Settings or Search 🐷');
  }
});

$('#btnLocUseMapCenter')?.addEventListener('click', () => {
  if (mapCtl.map) {
    const c = mapCtl.map.getCenter();
    mapCtl.setCustomLocation({ lat: c.lat, lng: c.lng, name: 'Pinned Map Spot' });
    updateLocationUI();
    updateLocationModalUI();
    closeModal('locationModal');
    toast('🎯 Location calibrated to center of map! 🐷');
  }
});

// Address search in Location modal
const locSearchInput = $('#locSearchInput');
const locSearchClear = $('#locSearchClear');
const locSearchResults = $('#locSearchResultsList');
let locSearchDebounce = null;

locSearchInput?.addEventListener('input', () => {
  const q = locSearchInput.value.trim();
  locSearchClear?.classList.toggle('hidden', !q);
  clearTimeout(locSearchDebounce);
  locSearchDebounce = setTimeout(async () => {
    if (!q) {
      locSearchResults?.classList.add('hidden');
      return;
    }
    const center = mapCtl.map ? mapCtl.map.getCenter() : null;
    const places = await searchPlaces(q, {
      token: settings.token,
      userPos: center,
      limit: 5,
    });
    if (!places || places.length === 0) {
      locSearchResults.innerHTML = '<div style="padding:14px;text-align:center;color:var(--label2);font-size:13px;">No places found</div>';
      locSearchResults.classList.remove('hidden');
      return;
    }
    locSearchResults.innerHTML = '';
    locSearchResults.classList.remove('hidden');
    places.forEach((p) => {
      const row = document.createElement('button');
      row.className = 'list-row';
      row.style.padding = '10px 12px';
      row.innerHTML = `
        <span class="row-icon" style="background:#007aff;color:#fff;width:28px;height:28px;font-size:14px;display:grid;place-items:center;">📍</span>
        <span class="row-text">
          <span class="row-title" style="font-size:14px;font-weight:600;">${escapeHtml(p.name)}</span>
          <span class="row-sub" style="font-size:12px;">${escapeHtml(p.shortAddress || p.fullAddress || '')}</span>
        </span>
      `;
      row.addEventListener('click', () => {
        mapCtl.setCustomLocation({
          lat: p.coordinates[1],
          lng: p.coordinates[0],
          name: p.name,
        });
        updateLocationUI();
        updateLocationModalUI();
        closeModal('locationModal');
        toast(`🎯 Location calibrated to ${p.name}! 🐷`);
      });
      locSearchResults.appendChild(row);
    });
  }, 220);
});

locSearchClear?.addEventListener('click', () => {
  if (locSearchInput) locSearchInput.value = '';
  locSearchClear?.classList.add('hidden');
  locSearchResults?.classList.add('hidden');
  locSearchInput?.focus();
});

// ---------- iOS niceties ----------
document.addEventListener('gesturestart', (e) => e.preventDefault()); // no page zoom
document.addEventListener('dblclick', (e) => {
  if (!e.target.closest('#map')) e.preventDefault();
});

// ---------- Service worker (offline app shell + home-screen install) ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register(`sw.js?v=${APP_VERSION}`).catch((err) => console.warn('SW failed', err));
}

// ---------- Go ----------
syncControls();
updateSavedPlacesUI();
updateLocationUI();
renderQuickCategories();
showPane('home');
updateLocateButton('off');
if (settings.token) startMap();
else setTimeout(() => showTokenModal(), 350);
