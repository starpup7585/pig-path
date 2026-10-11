// Pig Path — Apple Maps style search and geocoding engine.
// Powered by Mapbox Geocoding API with proximity bias and Washington local fallback.

const RECENTS_KEY = 'pigpath_recents';

// Top curated Washington landmarks used when offline, testing, or browsing suggestions
export const WA_CURATED_PLACES = [
  {
    id: 'wa-pike-place',
    name: 'Pike Place Market',
    shortAddress: '85 Pike St, Seattle',
    fullAddress: '85 Pike St, Seattle, WA 98101',
    category: 'market',
    coordinates: [-122.3421, 47.6088],
  },
  {
    id: 'wa-space-needle',
    name: 'Space Needle',
    shortAddress: '400 Broad St, Seattle',
    fullAddress: '400 Broad St, Seattle, WA 98109',
    category: 'landmark',
    coordinates: [-122.3493, 47.6205],
  },
  {
    id: 'wa-bellevue-sq',
    name: 'Bellevue Square',
    shortAddress: '575 Bellevue Way NE, Bellevue',
    fullAddress: '575 Bellevue Way NE, Bellevue, WA 98004',
    category: 'shopping',
    coordinates: [-122.2038, 47.6174],
  },
  {
    id: 'wa-kirkland-marina',
    name: 'Kirkland Marina Park',
    shortAddress: '25 Lakeshore Plaza, Kirkland',
    fullAddress: '25 Lakeshore Plaza, Kirkland, WA 98033',
    category: 'park',
    coordinates: [-122.2091, 47.6758],
  },
  {
    id: 'wa-rainier',
    name: 'Mount Rainier National Park',
    shortAddress: 'Ashford, WA',
    fullAddress: 'Mount Rainier National Park, WA 98304',
    category: 'nature',
    coordinates: [-121.7269, 46.88],
  },
  {
    id: 'wa-seatac',
    name: 'Seattle-Tacoma Int’l Airport (SEA)',
    shortAddress: '17801 International Blvd, SeaTac',
    fullAddress: '17801 International Blvd, SeaTac, WA 98158',
    category: 'airport',
    coordinates: [-122.3088, 47.4502],
  },
  {
    id: 'wa-snoqualmie-falls',
    name: 'Snoqualmie Falls',
    shortAddress: '6501 Railroad Ave, Snoqualmie',
    fullAddress: '6501 Railroad Ave, Snoqualmie, WA 98024',
    category: 'nature',
    coordinates: [-121.8377, 47.5417],
  },
  {
    id: 'wa-redmond-tc',
    name: 'Redmond Town Center',
    shortAddress: '7525 166th Ave NE, Redmond',
    fullAddress: '7525 166th Ave NE, Redmond, WA 98052',
    category: 'shopping',
    coordinates: [-122.1206, 47.6705],
  },
  {
    id: 'wa-woodinville',
    name: 'Woodinville Wine Country',
    shortAddress: 'Woodinville, WA',
    fullAddress: '14144 NE 145th St, Woodinville, WA 98072',
    category: 'wine',
    coordinates: [-122.1557, 47.7543],
  },
  {
    id: 'wa-uw',
    name: 'University of Washington',
    shortAddress: 'Seattle, WA',
    fullAddress: 'University of Washington, Seattle, WA 98195',
    category: 'school',
    coordinates: [-122.3035, 47.6553],
  },
  {
    id: 'wa-tesla-supercharger-sodo',
    name: 'Tesla Supercharger - SODO',
    shortAddress: '2200 4th Ave S, Seattle',
    fullAddress: '2200 4th Ave S, Seattle, WA 98134',
    category: 'ev',
    coordinates: [-122.3294, 47.5833],
  },
  {
    id: 'wa-ea-bellevue',
    name: 'Electrify America - Factoria',
    shortAddress: '4055 Factoria Square Mall SE, Bellevue',
    fullAddress: '4055 Factoria Square Mall SE, Bellevue, WA 98006',
    category: 'ev',
    coordinates: [-122.1698, 47.5756],
  },
  {
    id: 'wa-starbucks-reserve',
    name: 'Starbucks Reserve Roastery',
    shortAddress: '1124 Pike St, Seattle',
    fullAddress: '1124 Pike St, Seattle, WA 98101',
    category: 'coffee',
    coordinates: [-122.3283, 47.6140],
  },
  {
    id: 'wa-dicks-queen-anne',
    name: 'Dick’s Drive-In',
    shortAddress: '500 Queen Anne Ave N, Seattle',
    fullAddress: '500 Queen Anne Ave N, Seattle, WA 98109',
    category: 'food',
    coordinates: [-122.3564, 47.6234],
  },
  {
    id: 'wa-costco-gas-kirkland',
    name: 'Costco Gas - Kirkland',
    shortAddress: '8629 120th Ave NE, Kirkland',
    fullAddress: '8629 120th Ave NE, Kirkland, WA 98033',
    category: 'gas',
    coordinates: [-122.1795, 47.6798],
  },
];

export const QUICK_CATEGORIES = [
  { id: 'coffee', label: 'Coffee', query: 'coffee', icon: 'coffee', color: '#8e593c' },
  { id: 'food', label: 'Food', query: 'restaurants', icon: 'restaurant', color: '#ff9500' },
  { id: 'ev', label: 'EV Chargers', query: 'EV charging station', icon: 'ev', color: '#34c759' },
  { id: 'gas', label: 'Gas', query: 'gas station', icon: 'gas', color: '#007aff' },
  { id: 'groceries', label: 'Groceries', query: 'grocery supermarket', icon: 'grocery', color: '#ff9f0a' },
  { id: 'parking', label: 'Parking', query: 'parking', icon: 'parking', color: '#5856d6' },
];

/**
 * Computes straight-line distance in miles between user and target coordinates.
 */
export function calculateDistanceMiles(userPos, targetCoord) {
  if (!userPos || !targetCoord) return null;
  const [lng2, lat2] = targetCoord;
  const lat1 = userPos.lat;
  const lng1 = userPos.lng;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d;
}

export function formatDistance(miles) {
  if (miles == null || Number.isNaN(miles)) return '';
  if (miles < 0.1) return 'Near you';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/**
 * Categorize a place based on its text, category property, and type.
 */
function detectCategory(f) {
  const text = `${f.text || ''} ${f.place_name || ''} ${f.properties?.category || ''}`.toLowerCase();
  if (text.includes('coffee') || text.includes('starbucks') || text.includes('cafe')) return 'coffee';
  if (text.includes('charging') || text.includes('supercharger') || text.includes('electrify america')) return 'ev';
  if (text.includes('gas') || text.includes('shell') || text.includes('chevron') || text.includes('costco gasoline')) return 'gas';
  if (text.includes('market') || text.includes('grocery') || text.includes('safeway') || text.includes('trader joe') || text.includes('whole foods') || text.includes('kroger')) return 'grocery';
  if (text.includes('restaurant') || text.includes('burger') || text.includes('pizza') || text.includes('bakery') || text.includes('food')) return 'restaurant';
  if (text.includes('park') || text.includes('trail') || text.includes('lake') || text.includes('falls') || text.includes('mountain') || text.includes('rainier')) return 'nature';
  if (text.includes('airport') || text.includes('seatac') || text.includes('terminal')) return 'airport';
  if (text.includes('parking') || text.includes('garage')) return 'parking';
  if (text.includes('mall') || text.includes('square') || text.includes('center') || text.includes('target') || text.includes('costco')) return 'shopping';
  if (f.place_type?.includes('poi')) return 'poi';
  if (f.place_type?.includes('address')) return 'address';
  return 'place';
}

/**
 * Returns Apple Maps style SVG icon markup for a given category.
 */
export function getCategoryIconSvg(category) {
  switch (category) {
    case 'coffee':
      return {
        bg: '#8e593c',
        svg: '<svg viewBox="0 0 24 24"><path d="M4 19h16M6 6h10v6a4 4 0 01-4 4H10a4 4 0 01-4-4V6zm10 2h2a2 2 0 010 4h-2V8z" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      };
    case 'restaurant':
      return {
        bg: '#ff9500',
        svg: '<svg viewBox="0 0 24 24"><path d="M18 4v16M15 4v5a2 2 0 002 2M21 4v5a2 2 0 01-2 2M6 4v7a3 3 0 003 3v6M6 4h6M9 4v7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      };
    case 'ev':
      return {
        bg: '#34c759',
        svg: '<svg viewBox="0 0 24 24"><path d="M13 2L5 13h6l-2 9 10-12h-6z" fill="#fff"/></svg>',
      };
    case 'gas':
      return {
        bg: '#007aff',
        svg: '<svg viewBox="0 0 24 24"><path d="M4 4h8v16H4zm8 5h4a2 2 0 012 2v6a2 2 0 01-2 2M6 8h4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      };
    case 'grocery':
    case 'market':
      return {
        bg: '#ff9f0a',
        svg: '<svg viewBox="0 0 24 24"><circle cx="9" cy="20" r="1.5" fill="#fff"/><circle cx="18" cy="20" r="1.5" fill="#fff"/><path d="M3 4h3l2.4 11.2a1 1 0 001 .8h9.6a1 1 0 001-.8L22 7H7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
      };
    case 'parking':
      return {
        bg: '#5856d6',
        svg: '<svg viewBox="0 0 24 24"><text x="12" y="17.5" text-anchor="middle" font-size="16" font-weight="800" fill="#fff">P</text></svg>',
      };
    case 'airport':
      return {
        bg: '#5ac8fa',
        svg: '<svg viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="#fff"/></svg>',
      };
    case 'nature':
    case 'park':
      return {
        bg: '#30b0c7',
        svg: '<svg viewBox="0 0 24 24"><path d="M12 3l4 6h-3l4 6h-3v4h-4v-4H7l4-6H8l4-6z" fill="#fff"/></svg>',
      };
    case 'shopping':
      return {
        bg: '#ff2d55',
        svg: '<svg viewBox="0 0 24 24"><path d="M6 7l1-3h10l1 3M4 7h16v13a1 1 0 01-1 1H5a1 1 0 01-1-1V7zm5 4a3 3 0 006 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
      };
    case 'landmark':
      return {
        bg: '#af52de',
        svg: '<svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.2h7.6l-6.1 4.5 2.3 7.1-6.2-4.5-6.2 4.5 2.3-7.1L2 9.2h7.6z" fill="#fff"/></svg>',
      };
    case 'address':
      return {
        bg: '#8e8e93',
        svg: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-9z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M9 21v-7h6v7" fill="none" stroke="#fff" stroke-width="2"/></svg>',
      };
    default:
      return {
        bg: '#007aff',
        svg: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" fill="#fff"/></svg>',
      };
  }
}

/**
 * Searches places via Mapbox Geocoding API or curated WA places.
 */
export async function searchPlaces(query, { token, userPos, limit = 8 } = {}) {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  // If user has token, query live Mapbox Geocoding API
  if (token && token.startsWith('pk.')) {
    try {
      const prox = userPos ? `&proximity=${userPos.lng},${userPos.lat}` : '';
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQ)}.json?access_token=${token}&autocomplete=true&limit=${limit}${prox}&types=poi,address,neighborhood,place,postcode`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.features && data.features.length > 0) {
          return data.features.map((f) => {
            const cat = detectCategory(f);
            const dist = calculateDistanceMiles(userPos, f.center);
            const title = f.text || f.place_name.split(',')[0];
            const subtitle = f.place_name.replace(new RegExp(`^${escapeRegex(title)},?\\s*`), '') || f.place_name;
            return {
              id: f.id,
              name: title,
              shortAddress: subtitle,
              fullAddress: f.place_name,
              category: cat,
              coordinates: f.center, // [lng, lat]
              distanceMi: dist,
              raw: f,
            };
          });
        }
      }
    } catch (err) {
      console.warn('[search] Mapbox geocoding error, using fallback:', err);
    }
  }

  // Fallback: match query against curated Washington destinations
  const lower = cleanQ.toLowerCase();
  const matched = WA_CURATED_PLACES.filter(
    (p) =>
      p.name.toLowerCase().includes(lower) ||
      p.shortAddress.toLowerCase().includes(lower) ||
      p.category.toLowerCase().includes(lower),
  ).map((p) => ({
    ...p,
    distanceMi: calculateDistanceMiles(userPos, p.coordinates),
  }));

  // Sort by distance if available, otherwise by title match
  matched.sort((a, b) => {
    if (a.distanceMi != null && b.distanceMi != null) return a.distanceMi - b.distanceMi;
    return a.name.localeCompare(b.name);
  });

  return matched.slice(0, limit);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Storage helpers for Recent Searches
 */
export function getRecentSearches() {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecentSearch(place) {
  if (!place || !place.name || !place.coordinates) return;
  try {
    const existing = getRecentSearches().filter(
      (p) => p.name !== place.name && p.coordinates[0] !== place.coordinates[0],
    );
    const updated = [
      {
        id: place.id || String(Date.now()),
        name: place.name,
        shortAddress: place.shortAddress || place.fullAddress || '',
        fullAddress: place.fullAddress || place.name,
        category: place.category || 'poi',
        coordinates: place.coordinates,
      },
      ...existing,
    ].slice(0, 10);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[search] failed to save recent', err);
  }
}

export function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENTS_KEY);
  } catch { /* ignore */ }
}
