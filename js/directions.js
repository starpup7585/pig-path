// Pig Path — Mapbox Directions & route calculation engine.
// Fetches live driving routes with traffic congestion and turn-by-turn guidance.

function formatRouteSummary(rawSummary, steps) {
  if (rawSummary && rawSummary.trim().length > 0) {
    const cleaned = rawSummary.trim();
    return cleaned.toLowerCase().startsWith('via ') ? cleaned : `via ${cleaned}`;
  }
  if (Array.isArray(steps) && steps.length > 0) {
    const namedSteps = steps.filter((s) => s.name && !/^(road|street|ramp|highway)$/i.test(s.name.trim()));
    if (namedSteps.length > 0) {
      // Find step with the longest distance
      const topStep = [...namedSteps].sort((a, b) => (b.distance || 0) - (a.distance || 0))[0];
      if (topStep && topStep.name) return `via ${topStep.name}`;
    }
  }
  return 'via main roads';
}

export async function fetchRoutes(start, end, { token, avoidTolls = false, waypoints = [], profile = 'driving' } = {}) {
  const allCoords = [start, ...waypoints, end];
  const coordStr = allCoords.map(([lng, lat]) => `${lng},${lat}`).join(';');

  if (token && token.startsWith('pk.')) {
    try {
      const exclude = avoidTolls && profile === 'driving' ? '&exclude=toll' : '';
      // Mapbox only supports alternatives for 2-point routes (origin & destination)
      const altParam = waypoints.length === 0 ? '&alternatives=true' : '';
      let mapboxProfile = 'mapbox/driving-traffic';
      if (profile === 'walking') mapboxProfile = 'mapbox/walking';
      else if (profile === 'cycling') mapboxProfile = 'mapbox/cycling';

      const url = `https://api.mapbox.com/directions/v5/${mapboxProfile}/${coordStr}?geometries=geojson&overview=full&steps=true&annotations=congestion${altParam}${exclude}&access_token=${token}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          const fastestDur = data.routes[0].duration;
          return data.routes.map((route, idx) => {
            const diffSec = Math.max(0, route.duration - fastestDur);
            const diffMins = Math.round(diffSec / 60);
            const allSteps = (route.legs || []).flatMap((leg) => leg.steps || []);
            const allCongestion = (route.legs || []).flatMap((leg) => leg.annotation?.congestion || []);
            const primarySummary = route.legs?.[0]?.summary || '';
            return {
              id: idx,
              geometry: route.geometry,
              durationSec: route.duration,
              distanceMeters: route.distance,
              steps: allSteps,
              legs: route.legs || [],
              congestion: allCongestion,
              summary: formatRouteSummary(primarySummary, allSteps),
              diffSec,
              diffMins,
              isFastest: idx === 0,
            };
          });
        }
      }
    } catch (err) {
      console.warn('[directions] failed to fetch Mapbox directions, falling back to simulated routes', err);
    }
  }

  // Fallback: primary direct route + alternative scenic bypass
  const [startLng, startLat] = start;
  const [endLng, endLat] = end;
  const dLat = endLat - startLat;
  const dLng = endLng - startLng;
  const approxDistanceMeters = Math.hypot(dLng * 85000, dLat * 111000);
  const approxDurationSec = Math.max(120, Math.round(approxDistanceMeters / 15.6)); // ~35 mph

  const coords = [start];
  if (waypoints.length > 0) {
    coords.push(...waypoints);
  } else {
    coords.push([startLng + dLng * 0.5, startLat + dLat * 0.5]);
  }
  coords.push(end);

  const primaryRoute = {
    id: 0,
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
    durationSec: approxDurationSec,
    distanceMeters: approxDistanceMeters,
    summary: waypoints.length > 0 ? 'via Added Stop' : 'via Direct Route',
    diffSec: 0,
    diffMins: 0,
    isFastest: true,
    steps: [
      {
        maneuver: { instruction: 'Head toward your destination' },
        name: 'Direct Route',
        distance: approxDistanceMeters,
      },
    ],
    congestion: [],
    legs: [],
  };

  const altRoute = {
    id: 1,
    geometry: {
      type: 'LineString',
      coordinates: [
        [startLng, startLat],
        [startLng + dLng * 0.3 - dLat * 0.15, startLat + dLat * 0.3 + dLng * 0.15],
        [startLng + dLng * 0.7 - dLat * 0.1, startLat + dLat * 0.7 + dLng * 0.1],
        [endLng, endLat],
      ],
    },
    durationSec: Math.round(approxDurationSec * 1.18),
    distanceMeters: Math.round(approxDistanceMeters * 1.14),
    summary: 'via Scenic Bypass',
    diffSec: Math.round(approxDurationSec * 0.18),
    diffMins: Math.max(2, Math.round((approxDurationSec * 0.18) / 60)),
    isFastest: false,
    steps: [
      {
        maneuver: { instruction: 'Take the scenic bypass' },
        name: 'Scenic Bypass',
        distance: Math.round(approxDistanceMeters * 1.14),
      },
    ],
    congestion: [],
  };

  return [primaryRoute, altRoute];
}

export async function fetchRoute(start, end, options) {
  const routes = await fetchRoutes(start, end, options);
  return routes[0];
}

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '-- min';
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `${hrs} ${hrs === 1 ? 'hour' : 'hours'}`;
  return `${hrs} hr ${rem} min`;
}

export function formatEtaHtml(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '-- <span class="unit">min</span>';
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} <span class="unit">min</span>`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `${hrs} <span class="unit">${hrs === 1 ? 'hour' : 'hours'}</span>`;
  return `${hrs} <span class="unit">${hrs === 1 ? 'hr' : 'hrs'}</span> ${rem} <span class="unit">min</span>`;
}

export function formatDistanceMeters(meters) {
  if (meters == null || Number.isNaN(meters)) return '';
  const miles = meters / 1609.344;
  if (miles < 0.1) return 'Near you';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export function formatArrivalTime(durationSec) {
  if (durationSec == null || Number.isNaN(durationSec)) return '';
  const arrival = new Date(Date.now() + durationSec * 1000);
  let hours = arrival.getHours();
  const minutes = arrival.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  return `${hours}:${minutes} ${ampm}`;
}

export function calculateDetourEstimate(start, waypoint, end) {
  const [startLng, startLat] = start;
  const [wpLng, wpLat] = waypoint;
  const [endLng, endLat] = end;

  const d1 = Math.hypot((wpLng - startLng) * 85000, (wpLat - startLat) * 111000);
  const d2 = Math.hypot((endLng - wpLng) * 85000, (endLat - wpLat) * 111000);
  const dDirect = Math.hypot((endLng - startLng) * 85000, (endLat - startLat) * 111000);

  const extraMeters = Math.max(0, (d1 + d2) - dDirect);
  const extraSec = Math.round(extraMeters / 15.6) + 120; // road detour + 2 min stop overhead
  const extraMins = Math.max(1, Math.round(extraSec / 60));
  return { extraMeters, extraSec, extraMins };
}
