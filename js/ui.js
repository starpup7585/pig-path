// Small UI helpers: toasts, modals, and the sun-position math used for auto dark mode.

let toastTimer;
export function toast(message, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function openModal(id) {
  const m = document.getElementById(id);
  m.classList.add('open');
  m.setAttribute('aria-hidden', 'false');
}

export function closeModal(id) {
  const m = document.getElementById(id);
  m.classList.remove('open');
  m.setAttribute('aria-hidden', 'true');
}

/**
 * Sun elevation in degrees above the horizon for a date and location.
 * Accurate to well under a degree — plenty for picking day / dusk / night.
 */
export function sunElevation(date, lat, lng) {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86400000 - 10957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * rad;     // mean anomaly
  const q = 280.459 + 0.98564736 * d;             // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;      // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const ha = (gmst * 15 + lng) * rad - ra;
  const latR = lat * rad;
  const sinAlt = Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha);
  return Math.asin(sinAlt) / rad;
}
