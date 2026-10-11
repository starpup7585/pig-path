// Highway Shields generator:
// 1. Washington State Route (SR) marker — Apple Maps design (George Washington bust in dark charcoal rounded rect)
// 2. US Interstate shield — Apple Maps design (Red header, white separator, rich blue body, white border)
// Built with vector SVG rendered at high-DPI (Retina) for iPhone 16 Pro.

// WSDOT specification George Washington bust silhouette path
const TX = -247.48986;
const TY = 87.6157;
const GEORGE_PATH =
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
 * Exactly matches the user screenshot:
 * - Charcoal dark rounded box (#323236)
 * - White George Washington bust facing left
 * - Dark condensed bold numerals centered inside the bust
 */
export function generateWaShieldSvg(ref) {
  const cleanRef = String(ref).trim().replace(/^(SR|WA|State Route)\s*/i, '');
  const is3 = cleanRef.length >= 3;
  // Aspect ratio tuned to match Apple Maps (almost square with smooth rounded corners)
  const w = is3 ? 640 : 560;
  const h = 530;
  const offsetX = is3 ? 20 : -20;
  const offsetY = -45;
  const fontSize = is3 ? 190 : 230;
  const fontY = is3 ? 320 : 330;
  const fontX = (w / 2) + 6;
  const letterSpacing = is3 ? '-10' : '-4';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<defs>` +
    `<filter id="srShadow" x="-12%" y="-12%" width="124%" height="128%">` +
    `<feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="rgba(0,0,0,0.35)"/>` +
    `</filter>` +
    `</defs>` +
    `<g filter="url(#srShadow)">` +
    `<!-- Apple Maps Charcoal Rounded Container -->` +
    `<rect x="0" y="0" width="${w}" height="${h}" rx="96" fill="#323236" stroke="rgba(255,255,255,0.14)" stroke-width="3"/>` +
    `<!-- White George Washington bust -->` +
    `<g transform="translate(${TX + offsetX}, ${TY + offsetY})">` +
    `<path fill="#ffffff" d="${GEORGE_PATH}"/>` +
    `</g>` +
    `</g>` +
    `<!-- Route Number in Apple SF Pro Condensed Bold -->` +
    `<text x="${fontX}" y="${fontY}" font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', 'Arial Narrow', sans-serif" font-weight="900" font-size="${fontSize}" text-anchor="middle" fill="#222224" letter-spacing="${letterSpacing}">${cleanRef}</text>` +
    `</svg>`
  );
}

/**
 * Builds Apple Maps–style Interstate Highway Shield SVG.
 * Exactly matches Apple Maps (like I-405 in the screenshot):
 * - Classic curved Interstate shield
 * - Red top header bar (#ea3323)
 * - Thin crisp white horizontal separator
 * - Rich Apple Blue body (#0b72f4)
 * - Bold white numerals centered in the blue section
 * - Thick white outer border with subtle drop shadow
 */
export function generateInterstateSvg(ref) {
  const cleanRef = String(ref).trim().replace(/^(I-?|Interstate\s*)/i, '');
  const is3 = cleanRef.length >= 3;
  const w = is3 ? 690 : 600;
  const h = 600;
  const scaleX = is3 ? 690 / 600 : 1;
  const fontSize = is3 ? 245 : 290;
  const fontY = is3 ? 440 : 445;
  const fontX = w / 2;
  const letterSpacing = is3 ? '-6' : '-2';

  const pOuter = `M ${80.75 * scaleX},14 C ${115.4 * scaleX},25 ${152.2 * scaleX},30 ${190.4 * scaleX},30 C ${228.5 * scaleX},30 ${265.3 * scaleX},25 ${300 * scaleX},14 C ${334.7 * scaleX},25 ${371.5 * scaleX},30 ${409.6 * scaleX},30 C ${447.8 * scaleX},30 ${484.6 * scaleX},25 ${519.2 * scaleX},14 C ${570 * scaleX},78 ${600 * scaleX},156 ${600 * scaleX},242 C ${600 * scaleX},418 ${471 * scaleX},566 ${300 * scaleX},592 C ${129 * scaleX},566 0,418 0,242 C 0,156 ${30.2 * scaleX},78 ${80.75 * scaleX},14 Z`;
  const pRed = `M ${31.3 * scaleX},138 C ${43.6 * scaleX},99 ${62.4 * scaleX},62 ${86.4 * scaleX},30 C ${119.5 * scaleX},39 ${154.4 * scaleX},44 ${190.4 * scaleX},44 C ${228.4 * scaleX},44 ${265.2 * scaleX},39 ${300 * scaleX},28 C ${334.8 * scaleX},39 ${371.6 * scaleX},44 ${409.6 * scaleX},44 C ${445.6 * scaleX},44 ${480.5 * scaleX},39 ${513.6 * scaleX},30 C ${537.6 * scaleX},62 ${556.4 * scaleX},99 ${568.7 * scaleX},138 Z`;
  const pBlue = `M ${26 * scaleX},152 L ${574 * scaleX},152 C ${582 * scaleX},180 ${586 * scaleX},211 ${586 * scaleX},242 C ${586 * scaleX},410 ${464 * scaleX},550 ${300 * scaleX},580 C ${136 * scaleX},550 ${14 * scaleX},410 ${14 * scaleX},242 C ${14 * scaleX},211 ${18 * scaleX},180 ${26 * scaleX},152 Z`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<defs>` +
    `<filter id="appleShadow" x="-12%" y="-12%" width="124%" height="128%">` +
    `<feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="rgba(0,0,0,0.30)"/>` +
    `</filter>` +
    `</defs>` +
    `<g filter="url(#appleShadow)">` +
    `<!-- Outer white border with subtle stroke -->` +
    `<path fill="#ffffff" stroke="rgba(0,0,0,0.20)" stroke-width="6" d="${pOuter}"/>` +
    `<!-- Apple Maps Red Header -->` +
    `<path fill="#ea3323" d="${pRed}"/>` +
    `<!-- Crisp white separator -->` +
    `<rect x="${27 * scaleX}" y="137" width="${546 * scaleX}" height="15" fill="#ffffff"/>` +
    `<!-- Apple Maps Blue Body -->` +
    `<path fill="#0b72f4" d="${pBlue}"/>` +
    `</g>` +
    `<!-- Route Number in Apple SF Pro Bold -->` +
    `<text x="${fontX}" y="${fontY}" font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-weight="800" font-size="${fontSize}" text-anchor="middle" fill="#ffffff" letter-spacing="${letterSpacing}">${cleanRef}</text>` +
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
  const w = is3 ? 112 : 98;
  const h = 94;
  const svg = generateWaShieldSvg(cleanRef);
  return svgToImage(svg, w, h);
}

/**
 * Renders Interstate SVG into an HTMLImageElement ready for map.addImage().
 */
export function createInterstateShieldImage(ref) {
  const cleanRef = String(ref).trim().replace(/^(I-?|Interstate\s*)/i, '');
  const is3 = cleanRef.length >= 3;
  const w = is3 ? 115 : 100;
  const h = 100;
  const svg = generateInterstateSvg(cleanRef);
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
