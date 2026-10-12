// Pig Path — Apple Maps Highway Shields & POI Icons generator.
// 1. Washington State Route (SR) marker: George Washington bust in dark charcoal rounded rect with white border
// 2. US Interstate shield: Curved shield with red crown, blue body, curved white separator, and white border
// 3. US Highway shield: Classic white highway shield badge with black border
// 4. Apple Maps POI Category Badges: Circular colored discs with white border and crisp white SF Symbols iconography
// Built with vector SVGs rendered at high-DPI (Retina) for iPhone 16 Pro.

// WSDOT specification George Washington bust silhouette path
export const GEORGE_PATH =
  'm 324.39511,215.64184 c -4.18553,0 -23.44512,0 -23.44512,0 0,0 -4.18553,-4.23513 -3.34978,-11.00852 ' +
  '0,-5.92499 32.65531,-60.10517 35.16939,-78.72853 0,-8.46674 0,-21.1651 0,-32.170134 ' +
  '0,-11.849959 22.60937,-33.01506 25.12,-50.793489 4.18552,-12.69836 15.23917,-37.2467037 36.00512,-44.8684971 ' +
  '9.21022,-3.383219 11.72086,-11.8499599 13.39573,-25.3932659 5.02469,-11.853461 53.72739,-24.732638 90.43414,-31.325213 ' +
  '45.66242,-8.199017 94.61619,-1.693349 118.90047,1.693347 15.23915,2.030618 115.5507,60.9535774 126.4358,167.620602 ' +
  '2.51407,24.54833 36.00513,58.41183 46.05452,66.03014 l -0.83919,12.69838 7.53533,6.77339 ' +
  'c -2.51064,45.71344 -41.02639,90.58198 -65.31066,94.81359 -13.89788,2.37139 -21.97658,12.93829 -25.95574,27.09009 ' +
  '-4.97999,17.6915 1.39974,34.14167 16.74552,44.0201 l 10.88512,-4.23162 ' +
  'c 5.02469,-6.77339 33.13336,-23.24791 31.8196,-10.16009 -0.86326,8.59888 -10.04938,9.31167 -15.07407,16.08506 ' +
  '8.37448,11.00504 1.67834,33.01509 1.67834,33.01509 -17.58471,8.46673 -7.53877,15.24013 -7.53877,15.24013 ' +
  '8.37448,20.3167 29.30899,18.62334 44.37961,36.40177 8.20596,9.81932 10.02531,38.99155 10.04938,38.94006 ' +
  'l -462.20964,0 c 0,0 0,-7.28105 0,-7.61834 0.83918,-21.16511 97.6324,-78.39124 102.15497,-116.48637 ' +
  '3.5183,-30.47679 -58.61453,-39.78844 -97.96944,-42.66749 0,0 -14.5685,-2.201 -15.07063,-11.00504 ' +
  '-1.17278,-11.51266 3.85191,-18.62335 4.18895,-24.54832 0.50213,-7.61834 -0.83915,-27.0901 -0.83915,-27.0901 ' +
  'l 3.34979,-11.85343 -4.18897,-5.08004 4.18897,-14.39173 c 0,0 -0.83918,-11.00153 -6.69959,-11.00153';

/**
 * Builds Apple Maps–style Washington State Route marker SVG.
 * Matches Apple Maps in user screenshots:
 * - Charcoal dark rounded box (#1c1c1e)
 * - Solid crisp white outer border with soft drop shadow
 * - White George Washington bust cleanly centered inside
 * - Route number centered inside the bust in bold Apple SF Pro font
 */
export function generateWaShieldSvg(ref) {
  const cleanRef = String(ref).trim().replace(/^(SR|WA|State Route)\s*/i, '');
  const is3 = cleanRef.length >= 3;
  const w = is3 ? 620 : 540;
  const h = 540;

  // George Washington path extents: x [297.6, 797.5] (w=500), y [-58.6, 487.4] (h=546)
  const scale = 0.74;
  const origW = 500 * scale; // 370
  const origH = 546 * scale; // 404
  const posX = (w - origW) / 2 - 297.6 * scale;
  const posY = (h - origH) / 2 - (-58.6) * scale + 2;

  const fontSize = is3 ? 175 : 210;
  const fontY = 285;
  const fontX = w / 2 + (is3 ? 6 : 3);
  const letterSpacing = is3 ? '-4' : '-1';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<defs>` +
    `<filter id="srShadow" x="-15%" y="-15%" width="130%" height="130%">` +
    `<feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="rgba(0,0,0,0.35)"/>` +
    `</filter>` +
    `</defs>` +
    `<!-- Apple Maps Dark Rounded Container with Crisp White Outer Border and Soft Shadow -->` +
    `<rect x="16" y="16" width="${w - 32}" height="${h - 32}" rx="96" fill="#1c1c1e" stroke="#ffffff" stroke-width="22" stroke-linejoin="round" filter="url(#srShadow)"/>` +
    `<!-- White George Washington Bust Silhouette -->` +
    `<g transform="translate(${posX.toFixed(2)}, ${posY.toFixed(2)}) scale(${scale})">` +
    `<path fill="#ffffff" d="${GEORGE_PATH}"/>` +
    `</g>` +
    `<!-- Route Number centered in bust in Apple SF Pro Bold -->` +
    `<text x="${fontX.toFixed(1)}" y="${fontY}" dominant-baseline="central" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="${fontSize}" text-anchor="middle" fill="#1c1c1e" letter-spacing="${letterSpacing}">${cleanRef}</text>` +
    `</svg>`
  );
}

/**
 * Builds Apple Maps–style Interstate Highway Shield SVG.
 * Matches Apple Maps in user screenshots (like I-405):
 * - Classic curved Interstate shield
 * - Red top header bar (#e3262e)
 * - Smooth downward curved separator
 * - Apple Interstate Blue body (#0066d6)
 * - Bold white numerals centered in the blue section
 * - Thick white outer border with subtle drop shadow
 */
export function generateInterstateSvg(ref) {
  const cleanRef = String(ref).trim().replace(/^(I-?|Interstate\s*)/i, '');
  const is3 = cleanRef.length >= 3;
  const w = is3 ? 680 : 600;
  const h = 600;
  const sX = is3 ? 680 / 600 : 1;
  const fontSize = is3 ? 240 : 280;
  const fontY = 370;
  const fontX = w / 2;
  const letterSpacing = is3 ? '-4' : '-1';

  const pOuter = `M ${80 * sX},38 ` +
    `C ${125 * sX},58 ${165 * sX},66 ${200 * sX},66 ` +
    `C ${235 * sX},66 ${268 * sX},56 ${300 * sX},42 ` +
    `C ${332 * sX},56 ${368 * sX},66 ${400 * sX},66 ` +
    `C ${435 * sX},66 ${475 * sX},58 ${520 * sX},38 ` +
    `C ${568 * sX},94 ${588 * sX},170 ${588 * sX},245 ` +
    `C ${588 * sX},410 ${462 * sX},542 ${300 * sX},570 ` +
    `C ${138 * sX},542 ${12 * sX},410 ${12 * sX},245 ` +
    `C ${12 * sX},170 ${32 * sX},94 ${80 * sX},38 Z`;

  const pInner = `M ${88 * sX},54 ` +
    `C ${130 * sX},72 ${168 * sX},78 ${200 * sX},78 ` +
    `C ${232 * sX},78 ${265 * sX},69 ${300 * sX},57 ` +
    `C ${335 * sX},69 ${368 * sX},78 ${400 * sX},78 ` +
    `C ${432 * sX},78 ${470 * sX},72 ${512 * sX},54 ` +
    `C ${552 * sX},104 ${570 * sX},175 ${570 * sX},245 ` +
    `C ${570 * sX},396 ${450 * sX},522 ${300 * sX},548 ` +
    `C ${150 * sX},522 ${30 * sX},396 ${30 * sX},245 ` +
    `C ${30 * sX},175 ${48 * sX},104 ${88 * sX},54 Z`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<defs>` +
    `<filter id="appleShadow" x="-15%" y="-15%" width="130%" height="130%">` +
    `<feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="rgba(0,0,0,0.35)"/>` +
    `</filter>` +
    `<clipPath id="innerClip">` +
    `<path d="${pInner}"/>` +
    `</clipPath>` +
    `</defs>` +
    `<!-- Outer White Border with Shadow -->` +
    `<path d="${pOuter}" fill="#ffffff" filter="url(#appleShadow)"/>` +
    `<!-- Clipped Shield Core -->` +
    `<g clip-path="url(#innerClip)">` +
    `<rect x="0" y="0" width="${w}" height="180" fill="#e3262e"/>` +
    `<path d="M 0,174 Q ${w / 2},186 ${w},174 L ${w},600 L 0,600 Z" fill="#0066d6"/>` +
    `<path d="M 0,174 Q ${w / 2},186 ${w},174" fill="none" stroke="#ffffff" stroke-width="12"/>` +
    `</g>` +
    `<!-- Centered Bold Numerals in Apple SF Pro Display -->` +
    `<text x="${fontX}" y="${fontY}" dominant-baseline="central" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="${fontSize}" text-anchor="middle" fill="#ffffff" letter-spacing="${letterSpacing}">${cleanRef}</text>` +
    `</svg>`
  );
}

/**
 * Builds Apple Maps–style US Highway Shield SVG (e.g. US-2, US-101).
 */
export function generateUsHighwaySvg(ref) {
  const cleanRef = String(ref).trim().replace(/^(US|U\.S\.)\s*/i, '');
  const is3 = cleanRef.length >= 3;
  const w = is3 ? 640 : 560;
  const h = 560;
  const sX = is3 ? 640 / 560 : 1;
  const fontSize = is3 ? 230 : 270;
  const fontY = 370;
  const fontX = w / 2;

  const p = `M ${60 * sX},80 C ${160 * sX},30 ${400 * sX},30 ${500 * sX},80 ` +
    `C ${540 * sX},180 ${540 * sX},320 ${280 * sX},520 ` +
    `C ${20 * sX},320 ${20 * sX},180 ${60 * sX},80 Z`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<defs>` +
    `<filter id="usShadow" x="-15%" y="-15%" width="130%" height="130%">` +
    `<feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="rgba(0,0,0,0.30)"/>` +
    `</filter>` +
    `</defs>` +
    `<path d="${p}" fill="#ffffff" stroke="#1c1c1e" stroke-width="24" stroke-linejoin="round" filter="url(#usShadow)"/>` +
    `<text x="${fontX}" y="${fontY}" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="${fontSize}" text-anchor="middle" fill="#1c1c1e">${cleanRef}</text>` +
    `</svg>`
  );
}

/**
 * Apple Maps Point of Interest (POI) Circular Icon Badges.
 * Matches Apple Maps in user screenshots:
 * - Circular vibrant disc with crisp white border and subtle drop shadow
 * - Pure white SF Symbols icon centered inside
 */
export const APPLE_POI_DEFS = {
  park: {
    color: '#34c759',
    svg: '<path d="M 60 22 C 48 22 38 31 38 43 C 38 47 39 50 41 53 C 37 56 34 61 34 67 C 34 76 41 83 50 83 L 57 83 L 57 98 L 63 98 L 63 83 L 70 83 C 79 83 86 76 86 67 C 86 61 83 56 79 53 C 81 50 82 47 82 43 C 82 31 72 22 60 22 Z" fill="#ffffff"/>',
  },
  shop: {
    color: '#ff9500',
    svg: '<path d="M 30 36 L 40 36 L 48 68 L 78 68 L 86 44 L 44 44" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="50" cy="84" r="5" fill="#ffffff"/><circle cx="76" cy="84" r="5" fill="#ffffff"/>',
  },
  food: {
    color: '#ff9500',
    svg: '<path d="M 44 32 L 44 54 C 44 60 48 64 54 64 L 54 88 M 49 32 L 49 50 M 39 32 L 39 50 M 68 32 C 68 32 76 44 76 56 C 76 62 72 64 68 64 L 68 88" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  cafe: {
    color: '#8e593c',
    svg: '<path d="M 38 40 L 74 40 L 70 74 C 70 80 64 84 56 84 C 48 84 42 80 42 74 Z M 74 46 L 82 46 C 86 46 88 49 88 53 C 88 57 86 60 82 60 L 72 60 M 34 90 L 78 90" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  grocery: {
    color: '#ff9f0a',
    svg: '<path d="M 52 40 C 42 40 36 48 36 62 C 36 78 48 90 60 90 C 72 90 84 78 84 62 C 84 48 78 40 68 40 C 64 40 61 43 60 46 C 59 43 56 40 52 40 Z M 60 40 C 60 32 66 26 72 26" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  gas: {
    color: '#007aff',
    svg: '<path d="M 40 34 L 66 34 L 66 86 L 40 86 Z M 46 44 L 60 44 L 60 56 L 46 56 Z M 66 48 L 74 48 L 74 74 C 74 78 78 80 82 78 L 82 60 L 78 54" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  hospital: {
    color: '#ff3b30',
    svg: '<path d="M 53 34 L 67 34 L 67 53 L 86 53 L 86 67 L 67 67 L 67 86 L 53 86 L 53 67 L 34 67 L 34 53 L 53 53 Z" fill="#ffffff"/>',
  },
  transit: {
    color: '#007aff',
    svg: '<path d="M 40 34 L 80 34 C 84 34 86 36 86 40 L 86 78 C 86 82 84 84 80 84 L 40 84 C 36 84 34 82 34 78 L 34 40 C 34 36 36 34 40 34 Z M 40 42 L 80 42 L 80 58 L 40 58 Z M 42 84 L 42 90 M 78 84 L 78 90" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="46" cy="72" r="3.5" fill="#ffffff"/><circle cx="74" cy="72" r="3.5" fill="#ffffff"/>',
  },
  school: {
    color: '#5856d6',
    svg: '<path d="M 60 30 L 26 48 L 60 66 L 94 48 Z M 38 56 L 38 74 C 38 74 46 84 60 84 C 74 84 82 74 82 74 L 82 56 M 88 52 L 88 78" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
  },
};

export function generateApplePoiSvg(key) {
  const item = APPLE_POI_DEFS[key] || APPLE_POI_DEFS.shop;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">` +
    `<defs>` +
    `<filter id="pShadow" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.30)"/>` +
    `</filter>` +
    `</defs>` +
    `<circle cx="60" cy="58" r="48" fill="${item.color}" stroke="#ffffff" stroke-width="7" filter="url(#pShadow)"/>` +
    item.svg +
    `</svg>`
  );
}

/**
 * Creates an Image element from SVG markup.
 */
function svgToImage(svg, w, h) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image(w, h);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ img, width: w, height: h });
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Renders WA State Route SVG into an HTMLImageElement ready for map.addImage().
 */
export function createWaShieldImage(ref) {
  const cleanRef = String(ref).trim().replace(/^(SR|WA)\s*/i, '');
  const is3 = cleanRef.length >= 3;
  const w = is3 ? 88 : 78;
  const h = 78;
  const svg = generateWaShieldSvg(cleanRef);
  return svgToImage(svg, w, h);
}

/**
 * Renders Interstate SVG into an HTMLImageElement ready for map.addImage().
 */
export function createInterstateShieldImage(ref) {
  const cleanRef = String(ref).trim().replace(/^(I-?|Interstate\s*)/i, '');
  const is3 = cleanRef.length >= 3;
  const w = is3 ? 94 : 84;
  const h = 84;
  const svg = generateInterstateSvg(cleanRef);
  return svgToImage(svg, w, h);
}

/**
 * Renders US Highway SVG into an HTMLImageElement ready for map.addImage().
 */
export function createUsHighwayShieldImage(ref) {
  const cleanRef = String(ref).trim().replace(/^(US|U\.S\.)\s*/i, '');
  const is3 = cleanRef.length >= 3;
  const w = is3 ? 88 : 78;
  const h = 78;
  const svg = generateUsHighwaySvg(cleanRef);
  return svgToImage(svg, w, h);
}

/**
 * Renders Apple Maps POI Badge into an HTMLImageElement ready for map.addImage().
 */
export function createApplePoiImage(category) {
  const w = 56;
  const h = 56;
  const svg = generateApplePoiSvg(category);
  return svgToImage(svg, w, h);
}

// Pre-cached prominent Washington State Routes
export const COMMON_WA_ROUTES = [
  '520', '99', '522', '16', '167', '509', '512', '518', '524', '525',
  '526', '527', '530', '532', '539', '542', '410', '14', '20', '26',
  '17', '18', '24', '27', '28', '9', '7', '4', '3', '104',
  '105', '161', '169', '202', '203', '240', '303', '305'
];

// Pre-cached prominent Interstates
export const COMMON_INTERSTATES = [
  '405', '5', '90', '82', '182', '205', '705', '10', '15', '80', '84', '95', '94'
];

// Pre-cached prominent US Highways
export const COMMON_US_HIGHWAYS = [
  '2', '12', '101', '97', '395', '195', '830'
];
