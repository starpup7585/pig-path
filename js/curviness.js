// Pig Path — Twisty Backroad "Fun Meter"
// Analyzes route coordinate geometry to score curvature and curves per mile.

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

// Distance in miles between two [lng, lat] coordinates
function distanceMiles(coordA, coordB) {
  const [lng1, lat1] = coordA;
  const [lng2, lat2] = coordB;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Initial bearing between two [lng, lat] coordinates
function bearingBetween(coordA, coordB) {
  const [lng1, lat1] = coordA;
  const [lng2, lat2] = coordB;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Calculates twistiness and backroad fun score for a route geometry.
 * @param {Array<[number, number]>} coordinates - Array of [lng, lat]
 * @returns {Object} Score and curvature metrics
 */
export function analyzeRouteCurviness(coordinates) {
  if (!coordinates || coordinates.length < 3) {
    return {
      score: 15,
      rating: 'Straight',
      curveCount: 0,
      curvesPerMile: 0,
      stars: '★☆☆☆☆',
      badgeHtml: '<span class="twisty-badge straight">Highway 🛣️</span>',
      summary: 'Mostly straight cruising',
    };
  }

  let totalMiles = 0;
  let totalAngleChange = 0;
  let curveCount = 0;
  let prevBearing = null;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const p1 = coordinates[i];
    const p2 = coordinates[i + 1];
    const dist = distanceMiles(p1, p2);

    // Skip micro-jitter segments under 15 meters
    if (dist < 0.009) continue;

    totalMiles += dist;
    const currentBearing = bearingBetween(p1, p2);

    if (prevBearing != null) {
      let diff = Math.abs(currentBearing - prevBearing);
      if (diff > 180) diff = 360 - diff;

      // Filter highway gentle swerves vs distinct road curves
      if (diff >= 18) {
        totalAngleChange += diff;
        if (diff >= 28) {
          curveCount++;
        }
      }
    }
    prevBearing = currentBearing;
  }

  const safeMiles = Math.max(0.5, totalMiles);
  const curvesPerMile = Number((curveCount / safeMiles).toFixed(1));
  const anglePerMile = totalAngleChange / safeMiles;

  // Formula: angle changes per mile scaled to 0-100
  let rawScore = Math.round(anglePerMile * 0.42 + curvesPerMile * 8.5);
  const score = Math.max(10, Math.min(99, rawScore));

  let rating = 'Straight';
  let stars = '★☆☆☆☆';
  let badgeClass = 'straight';
  let emoji = '🛣️';

  if (score >= 82) {
    rating = 'Twisty Rollercoaster';
    stars = '★★★★★';
    badgeClass = 'epic';
    emoji = '🔥';
  } else if (score >= 65) {
    rating = 'Enthusiast Backroad';
    stars = '★★★★☆';
    badgeClass = 'hot';
    emoji = '🏁';
  } else if (score >= 48) {
    rating = 'Fun & Curvy';
    stars = '★★★☆☆';
    badgeClass = 'fun';
    emoji = '🏎️';
  } else if (score >= 32) {
    rating = 'Moderate Curves';
    stars = '★★☆☆☆';
    badgeClass = 'moderate';
    emoji = '🌿';
  }

  return {
    score,
    rating,
    curveCount,
    curvesPerMile,
    stars,
    badgeClass,
    emoji,
    badgeHtml: `<span class="twisty-badge ${badgeClass}" title="${curveCount} curves · ${curvesPerMile}/mi">${emoji} ${score}/100 Twisty</span>`,
    summary: `${curveCount} curves (${curvesPerMile}/mi) · ${rating}`,
  };
}
