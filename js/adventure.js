// Pig Path — Adventure Loop Generator:
// Generates scenic loop drives based on time budget and scenic theme, ending back home.

import { calculateDistanceMiles } from './search.js';
import { fetchRoutes } from './directions.js';

// Curated scenic points of interest for Washington adventure drives
export const SCENIC_ANCHORS = [
  { name: 'Magnolia Bluff & Sound Views', coordinates: [-122.4042, 47.6438], theme: 'waterfront' },
  { name: 'Alki Beach Promenade', coordinates: [-122.4082, 47.5756], theme: 'waterfront' },
  { name: 'Lake Washington Boulevard', coordinates: [-122.2845, 47.5786], theme: 'waterfront' },
  { name: 'Discovery Park Lighthouse Road', coordinates: [-122.4243, 47.6622], theme: 'nature' },
  { name: 'Seward Park Forest Loop', coordinates: [-122.2536, 47.5501], theme: 'nature' },
  { name: 'Mercer Slough Nature Park', coordinates: [-122.1812, 47.5878], theme: 'nature' },
  { name: 'May Valley Scenic Curving Road', coordinates: [-122.0835, 47.4998], theme: 'curvy' },
  { name: 'Tiger Mountain Foothills Byway', coordinates: [-121.9865, 47.5142], theme: 'curvy' },
  { name: 'Woodinville River Valley', coordinates: [-122.1557, 47.7543], theme: 'curvy' },
];

/**
 * Generate a scenic multi-waypoint loop starting and ending at startCoords.
 */
export async function generateAdventureLoop(startCoords, { durationMins = 45, theme = 'waterfront', token } = {}) {
  if (!startCoords) startCoords = [-122.3321, 47.6062];
  const [startLng, startLat] = startCoords;

  // Approximate target miles based on 28 mph scenic driving
  const targetMiles = (durationMins / 60) * 28;
  const loopRadiusMiles = Math.max(2, targetMiles / 4.8);
  const degPerMileLat = 1 / 69.0;
  const degPerMileLng = 1 / (69.0 * Math.cos((startLat * Math.PI) / 180));

  // Find suitable anchors near user or generate geometric scenic waypoints
  const userPos = { lng: startLng, lat: startLat };
  const matchingAnchors = SCENIC_ANCHORS.filter((a) => a.theme === theme).map((a) => ({
    ...a,
    dist: calculateDistanceMiles(userPos, a.coordinates),
  }));

  matchingAnchors.sort((a, b) => a.dist - b.dist);

  let waypoints = [];
  if (matchingAnchors.length > 0 && matchingAnchors[0].dist <= loopRadiusMiles * 2) {
    // Pick closest scenic anchor as primary midpoint
    const anchor = matchingAnchors[0];
    // Create an outward arc waypoint and return arc waypoint
    const midAngle = Math.atan2(anchor.coordinates[1] - startLat, anchor.coordinates[0] - startLng);
    const sideAngle1 = midAngle + Math.PI / 3;
    const sideAngle2 = midAngle - Math.PI / 3;

    const wp1 = [
      startLng + Math.cos(sideAngle1) * loopRadiusMiles * 0.7 * degPerMileLng,
      startLat + Math.sin(sideAngle1) * loopRadiusMiles * 0.7 * degPerMileLat,
    ];
    const wp2 = anchor.coordinates;
    const wp3 = [
      startLng + Math.cos(sideAngle2) * loopRadiusMiles * 0.7 * degPerMileLng,
      startLat + Math.sin(sideAngle2) * loopRadiusMiles * 0.7 * degPerMileLat,
    ];

    waypoints = [wp1, wp2, wp3];
  } else {
    // Generate circular polygon circuit with 3 waypoints
    const startBearing = Math.random() * Math.PI * 2;
    for (let i = 1; i <= 3; i++) {
      const angle = startBearing + (i * (Math.PI * 2)) / 4;
      const wp = [
        startLng + Math.cos(angle) * loopRadiusMiles * degPerMileLng,
        startLat + Math.sin(angle) * loopRadiusMiles * degPerMileLat,
      ];
      waypoints.push(wp);
    }
  }

  // Fetch full loop directions from startCoords through waypoints back to startCoords
  const routes = await fetchRoutes(startCoords, startCoords, {
    token,
    waypoints,
    profile: 'driving',
  });

  const bestRoute = routes && routes[0] ? routes[0] : null;

  return {
    title: `${durationMins}-Minute ${theme === 'waterfront' ? 'Waterfront Loop' : theme === 'nature' ? 'Forest & Lake Loop' : 'Curvy Scenic Loop'}`,
    durationMins,
    theme,
    route: bestRoute,
    waypoints,
  };
}
