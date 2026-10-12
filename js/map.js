// Everything that touches Mapbox: style, live traffic, 3D terrain, location puck, camera follow.
import { settings, save } from './store.js';
import { toast } from './ui.js';
import {
  createWaShieldImage,
  COMMON_WA_ROUTES,
  createInterstateShieldImage,
  COMMON_INTERSTATES,
  createUsHighwayShieldImage,
  COMMON_US_HIGHWAYS,
  createApplePoiImage,
  APPLE_POI_DEFS,
} from './waShield.js';

const STYLE_STANDARD = 'mapbox://styles/mapbox/standard';
const STYLE_SATELLITE = 'mapbox://styles/mapbox/standard-satellite';
const DEFAULT_CENTER = [-122.3321, 47.6062]; // Washington (Seattle area)
const FOLLOW_ZOOM = 16;
const EMPTY = { type: 'FeatureCollection', features: [] };

export class MapController {
  constructor(containerId, callbacks = {}) {
    this.containerId = containerId;
    this.cb = callbacks; // onTokenError, onLocateMode, onBearing, on3D, onLocation, onMapTap
    this.map = null;
    this.lightPreset = 'day';
    this.locateMode = 'off'; // 'off' | 'follow' | 'heading'
    this.is3D = false;
    this.pos = null;
    this.heading = null;
    this.watchId = null;
    this.firstFix = true;
    this.compassOn = false;
    this.lastGpsCourse = 0;
    this.lastCam = 0;
    this.lastSavedLoc = 0;
    this.flyingUntil = 0;
    this.bottomPad = 0;
    this.tokenErrorShown = false;
    this.orbiting = false;
    this.orbitPending = false;
  }

  get styleUrl() {
    return settings.mapType === 'satellite' ? STYLE_SATELLITE : STYLE_STANDARD;
  }

  basemapConfig() {
    const driving = settings.mapType === 'driving';
    return {
      lightPreset: this.lightPreset,
      showPointOfInterestLabels: !driving,
      showTransitLabels: !driving,
      show3dObjects: true,
    };
  }

  init(token) {
    mapboxgl.accessToken = token;
    const last = settings.customLocation || settings.lastLocation;
    const m = (this.map = new mapboxgl.Map({
      container: this.containerId,
      style: this.styleUrl,
      config: { basemap: this.basemapConfig() },
      center: last ? [last.lng, last.lat] : DEFAULT_CENTER,
      zoom: settings.customLocation ? 15.5 : last ? 14 : 3.2,
      attributionControl: false,
      logoPosition: 'bottom-left',
      maxPitch: 80,
    }));
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

    m.on('style.load', () => this.onStyleLoad());
    m.on('error', (e) => this.onError(e));
    m.on('rotate', () => this.cb.onBearing?.(m.getBearing()));
    m.on('pitchend', () => {
      const now3D = m.getPitch() > 10;
      if (now3D !== this.is3D) {
        this.is3D = now3D;
        this.applyTerrain();
        this.cb.on3D?.(now3D);
      }
    });
    // User pans → stop following (like Apple Maps).
    m.on('dragstart', (e) => {
      if (e.originalEvent && this.locateMode !== 'off') this.setLocateMode('off');
    });
    m.on('rotatestart', (e) => {
      if (e.originalEvent && this.locateMode === 'heading') this.setLocateMode('follow', { keepBearing: true });
    });
    ['touchstart', 'mousedown', 'wheel'].forEach((ev) => m.on(ev, () => this.stopOrbit()));
    m.on('click', () => this.cb.onMapTap?.());

    // Generate authentic shields on demand (Apple Maps Interstate & Washington State Route)
    m.on('styleimagemissing', async (e) => {
      const id = e.id;
      if (id.startsWith('wa-sr-')) {
        const ref = id.slice(6);
        try {
          const { img } = await createWaShieldImage(ref);
          if (!m.hasImage(id)) m.addImage(id, img, { pixelRatio: 2 });
        } catch (err) {
          console.warn('[shields] failed to generate WA shield for', id, err);
        }
      } else if (id.startsWith('interstate-')) {
        const ref = id.slice(11);
        try {
          const { img } = await createInterstateShieldImage(ref);
          if (!m.hasImage(id)) m.addImage(id, img, { pixelRatio: 2 });
        } catch (err) {
          console.warn('[shields] failed to generate Interstate shield for', id, err);
        }
      } else if (id.startsWith('us-hwy-')) {
        const ref = id.slice(7);
        try {
          const { img } = await createUsHighwayShieldImage(ref);
          if (!m.hasImage(id)) m.addImage(id, img, { pixelRatio: 2 });
        } catch (err) {
          console.warn('[shields] failed to generate US Highway shield for', id, err);
        }
      } else if (id.startsWith('apple-poi-')) {
        const cat = id.slice(10);
        try {
          const { img } = await createApplePoiImage(cat);
          if (!m.hasImage(id)) m.addImage(id, img, { pixelRatio: 2 });
        } catch (err) {
          console.warn('[poi] failed to generate Apple POI image for', id, err);
        }
      }
    });
  }

  onError(e) {
    const err = e && e.error;
    if (!err) return;
    const msg = String(err.message || '');
    if (err.status === 401 || err.status === 403 || /access token|unauthorized|forbidden/i.test(msg)) {
      if (!this.tokenErrorShown) {
        this.tokenErrorShown = true;
        this.cb.onTokenError?.();
      }
    } else {
      console.warn('[map]', err);
    }
  }

  onStyleLoad() {
    const m = this.map;
    this.applyConfig();

    // 3D terrain (used in 3D / Free-Roam).
    if (!m.getSource('mapbox-dem')) {
      m.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });
    }
    this.applyTerrain();

    // Live traffic — Apple-style: only slow (orange) and jammed (red) roads are colored.
    if (!m.getSource('traffic')) {
      m.addSource('traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' });
    }
    if (!m.getLayer('traffic')) {
      m.addLayer({
        id: 'traffic',
        type: 'line',
        source: 'traffic',
        'source-layer': 'traffic',
        slot: 'middle',
        filter: ['in', ['get', 'congestion'], ['literal', ['moderate', 'heavy', 'severe']]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'match', ['get', 'congestion'],
            'moderate', '#ff9500',
            'heavy', '#ff3b30',
            'severe', '#b3122a',
            '#ff9500',
          ],
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9, 1.2, 13, 3, 16, 6, 19, 14],
          'line-offset': ['interpolate', ['exponential', 1.5], ['zoom'], 9, 0.4, 13, 1.5, 16, 3, 19, 8],
          'line-emissive-strength': 1,
        },
      });
    }
    this.applyTraffic();

    // GPS accuracy halo.
    if (!m.getSource('accuracy')) m.addSource('accuracy', { type: 'geojson', data: EMPTY });
    if (!m.getLayer('accuracy')) {
      m.addLayer({
        id: 'accuracy',
        type: 'fill',
        source: 'accuracy',
        slot: 'middle',
        paint: { 'fill-color': '#007aff', 'fill-opacity': 0.12, 'fill-emissive-strength': 1 },
      });
    }
    this.updateAccuracy();

    // Apple Maps 3D Building Extrusions & Landmarks with warm ambient occlusion
    const bldSrc = m.getSource('composite') ? 'composite' : m.getSource('wa-streets') ? 'wa-streets' : null;
    if (bldSrc && !m.getLayer('apple-3d-buildings')) {
      m.addLayer({
        id: 'apple-3d-buildings',
        source: bldSrc,
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 14,
        slot: 'middle',
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['get', 'height'],
            0, '#f4f1ea',
            40, '#ece6dc',
            100, '#dfd7cc',
            250, '#cfc7b9',
          ],
          'fill-extrusion-height': [
            'interpolate', ['linear'], ['zoom'],
            14, 0,
            14.5, ['get', 'height'],
          ],
          'fill-extrusion-base': [
            'interpolate', ['linear'], ['zoom'],
            14, 0,
            14.5, ['get', 'min_height'],
          ],
          'fill-extrusion-opacity': 0.9,
          'fill-extrusion-ambient-occlusion-intensity': 0.35,
          'fill-extrusion-ambient-occlusion-radius': 3.5,
        },
      });
    }

    // Apple Maps alternative route line layers (underneath active route, clickable)
    if (!m.getSource('routes-alt')) m.addSource('routes-alt', { type: 'geojson', data: EMPTY });
    if (!m.getLayer('routes-alt-casing')) {
      m.addLayer({
        id: 'routes-alt-casing',
        type: 'line',
        source: 'routes-alt',
        slot: 'middle',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#2c2c2e',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 4.5, 13, 8, 16, 12, 19, 18],
          'line-opacity': 0.5,
        },
      });
    }
    if (!m.getLayer('routes-alt-line')) {
      m.addLayer({
        id: 'routes-alt-line',
        type: 'line',
        source: 'routes-alt',
        slot: 'middle',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#8e8e93',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 3, 13, 5.5, 16, 8.5, 19, 13],
          'line-opacity': 0.85,
        },
      });

      m.on('click', 'routes-alt-line', (e) => {
        const feat = e.features?.[0];
        if (feat && feat.properties && feat.properties.id != null) {
          this.cb.onSelectRoute?.(Number(feat.properties.id));
        }
      });
      m.on('mouseenter', 'routes-alt-line', () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', 'routes-alt-line', () => (m.getCanvas().style.cursor = ''));
    }

    // Apple Maps active route line layers (electric blue navigation polyline with contrast casing)
    if (!m.getSource('route')) m.addSource('route', { type: 'geojson', data: EMPTY });
    if (!m.getLayer('route-casing')) {
      m.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        slot: 'middle',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#003e8a',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 5.5, 13, 10, 16, 15, 19, 24],
          'line-opacity': 0.75,
        },
      });
    }
    if (!m.getLayer('route-glow')) {
      m.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        slot: 'middle',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#00b4d8',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 4.5, 13, 8.5, 16, 13, 19, 20],
          'line-opacity': 0.35,
          'line-blur': 1.2,
        },
      });
    }
    if (!m.getLayer('route-line')) {
      m.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        slot: 'middle',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#007aff',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 3.5, 13, 6.5, 16, 10.5, 19, 17],
          'line-emissive-strength': 1,
        },
      });
    }
    if (this.currentRouteData) {
      m.getSource('route')?.setData(this.currentRouteData);
    }
    if (this.currentAltData) {
      m.getSource('routes-alt')?.setData(this.currentAltData);
    }

    // Fog of War Coverage Layers (neon glowing roads driven across Washington)
    if (!m.getSource('fog-of-war')) m.addSource('fog-of-war', { type: 'geojson', data: EMPTY });
    if (!m.getLayer('fog-of-war-glow')) {
      m.addLayer({
        id: 'fog-of-war-glow',
        type: 'line',
        source: 'fog-of-war',
        slot: 'middle',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#00f5d4',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 4, 13, 8, 16, 14, 19, 20],
          'line-opacity': 0.4,
          'line-blur': 1.6,
        },
      });
    }
    if (!m.getLayer('fog-of-war-core')) {
      m.addLayer({
        id: 'fog-of-war-core',
        type: 'line',
        source: 'fog-of-war',
        slot: 'middle',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#34c759',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 2, 13, 4, 16, 7, 19, 11],
          'line-opacity': 0.85,
        },
      });
    }

    this.applyWaShields();
    if (settings.customLocation) {
      this.applyCustomLocation();
    }
  }

  updateFogOfWarLayer(geoJson) {
    const m = this.map;
    if (!m || !m.getSource('fog-of-war')) return;
    if (geoJson) {
      m.getSource('fog-of-war').setData(geoJson);
    }
  }

  setFogOfWarVisible(visible) {
    const m = this.map;
    if (!m) return;
    const val = visible ? 'visible' : 'none';
    if (m.getLayer('fog-of-war-glow')) m.setLayoutProperty('fog-of-war-glow', 'visibility', val);
    if (m.getLayer('fog-of-war-core')) m.setLayoutProperty('fog-of-war-core', 'visibility', val);
  }

  applyWaShields() {
    const m = this.map;
    if (!m) return;

    // Vector source for road network attributes
    if (!m.getSource('wa-streets')) {
      m.addSource('wa-streets', {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-streets-v8',
      });
    }

    // Pre-cache prominent Washington state routes
    COMMON_WA_ROUTES.forEach(async (ref) => {
      const id = `wa-sr-${ref}`;
      if (!m.hasImage(id)) {
        try {
          const { img } = await createWaShieldImage(ref);
          if (!m.hasImage(id)) m.addImage(id, img, { pixelRatio: 2 });
        } catch { /* ignore */ }
      }
    });

    // Pre-cache prominent Interstate highways
    COMMON_INTERSTATES.forEach(async (ref) => {
      const id = `interstate-${ref}`;
      if (!m.hasImage(id)) {
        try {
          const { img } = await createInterstateShieldImage(ref);
          if (!m.hasImage(id)) m.addImage(id, img, { pixelRatio: 2 });
        } catch { /* ignore */ }
      }
    });

    // Pre-cache prominent US Highways
    COMMON_US_HIGHWAYS.forEach(async (ref) => {
      const id = `us-hwy-${ref}`;
      if (!m.hasImage(id)) {
        try {
          const { img } = await createUsHighwayShieldImage(ref);
          if (!m.hasImage(id)) m.addImage(id, img, { pixelRatio: 2 });
        } catch { /* ignore */ }
      }
    });

    // Pre-cache Apple Maps POI icons
    Object.keys(APPLE_POI_DEFS).forEach(async (cat) => {
      const id = `apple-poi-${cat}`;
      if (!m.hasImage(id)) {
        try {
          const { img } = await createApplePoiImage(cat);
          if (!m.hasImage(id)) m.addImage(id, img, { pixelRatio: 2 });
        } catch { /* ignore */ }
      }
    });

    // Apple Maps Interstate Shields — Line placement (zoom 6+)
    if (!m.getLayer('apple-interstate-lines')) {
      m.addLayer({
        id: 'apple-interstate-lines',
        type: 'symbol',
        source: 'wa-streets',
        'source-layer': 'road',
        slot: 'top',
        minzoom: 6,
        filter: [
          'all',
          ['in', ['get', 'shield'], ['literal', ['us-interstate', 'us-interstate-duplex', 'us-interstate-truck']]],
          ['has', 'ref'],
        ],
        layout: {
          'icon-image': ['concat', 'interstate-', ['get', 'ref']],
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            6, 0.44,
            10, 0.50,
            13, 0.56,
            16, 0.64,
          ],
          'symbol-placement': 'line',
          'symbol-spacing': 340,
          'icon-rotation-alignment': 'viewport',
          'icon-pitch-alignment': 'viewport',
          'icon-allow-overlap': false,
          'icon-ignore-placement': false,
          'icon-padding': 12,
        },
      });
    }

    // Apple Maps Interstate Shields — Point placement at lower/mid zooms (zoom 5-11)
    if (!m.getLayer('apple-interstate-points')) {
      m.addLayer({
        id: 'apple-interstate-points',
        type: 'symbol',
        source: 'wa-streets',
        'source-layer': 'road',
        slot: 'top',
        minzoom: 5,
        maxzoom: 11,
        filter: [
          'all',
          ['==', ['geometry-type'], 'Point'],
          ['in', ['get', 'shield'], ['literal', ['us-interstate', 'us-interstate-duplex']]],
          ['has', 'ref'],
        ],
        layout: {
          'icon-image': ['concat', 'interstate-', ['get', 'ref']],
          'icon-size': 0.50,
          'symbol-placement': 'point',
          'icon-allow-overlap': false,
          'icon-padding': 10,
        },
      });
    }

    // US Highway Shields — Line placement (zooms 7+)
    if (!m.getLayer('apple-us-highway-lines')) {
      m.addLayer({
        id: 'apple-us-highway-lines',
        type: 'symbol',
        source: 'wa-streets',
        'source-layer': 'road',
        slot: 'top',
        minzoom: 7,
        filter: [
          'all',
          ['in', ['get', 'shield'], ['literal', ['us-highway', 'us-highway-duplex']]],
          ['has', 'ref'],
        ],
        layout: {
          'icon-image': ['concat', 'us-hwy-', ['get', 'ref']],
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            7, 0.44,
            11, 0.50,
            14, 0.56,
            17, 0.64,
          ],
          'symbol-placement': 'line',
          'symbol-spacing': 340,
          'icon-rotation-alignment': 'viewport',
          'icon-pitch-alignment': 'viewport',
          'icon-allow-overlap': false,
          'icon-ignore-placement': false,
          'icon-padding': 12,
        },
      });
    }

    // US Highway Shields — Point placement at lower/mid zooms (6-11)
    if (!m.getLayer('apple-us-highway-points')) {
      m.addLayer({
        id: 'apple-us-highway-points',
        type: 'symbol',
        source: 'wa-streets',
        'source-layer': 'road',
        slot: 'top',
        minzoom: 6,
        maxzoom: 11,
        filter: [
          'all',
          ['==', ['geometry-type'], 'Point'],
          ['in', ['get', 'shield'], ['literal', ['us-highway', 'us-highway-duplex']]],
          ['has', 'ref'],
        ],
        layout: {
          'icon-image': ['concat', 'us-hwy-', ['get', 'ref']],
          'icon-size': 0.50,
          'symbol-placement': 'point',
          'icon-allow-overlap': false,
          'icon-padding': 10,
        },
      });
    }

    // Line placement layer for Washington State Routes (zooms 8+)
    if (!m.getLayer('wa-state-routes-lines')) {
      m.addLayer({
        id: 'wa-state-routes-lines',
        type: 'symbol',
        source: 'wa-streets',
        'source-layer': 'road',
        slot: 'top',
        minzoom: 8,
        filter: [
          'all',
          ['==', ['get', 'iso_3166_2'], 'US-WA'],
          ['!=', ['get', 'shield'], 'us-interstate'],
          ['!=', ['get', 'shield'], 'us-highway'],
          ['!=', ['get', 'shield'], 'us-interstate-duplex'],
          ['!=', ['get', 'shield'], 'us-highway-duplex'],
          ['has', 'ref'],
        ],
        layout: {
          'icon-image': ['concat', 'wa-sr-', ['get', 'ref']],
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            8, 0.44,
            11, 0.50,
            14, 0.56,
            17, 0.64,
          ],
          'symbol-placement': 'line',
          'symbol-spacing': 340,
          'icon-rotation-alignment': 'viewport',
          'icon-pitch-alignment': 'viewport',
          'icon-allow-overlap': false,
          'icon-ignore-placement': false,
          'icon-padding': 12,
        },
      });
    }

    // Point placement layer for Washington State Routes at intermediate zooms (6-11)
    if (!m.getLayer('wa-state-routes-points')) {
      m.addLayer({
        id: 'wa-state-routes-points',
        type: 'symbol',
        source: 'wa-streets',
        'source-layer': 'road',
        slot: 'top',
        minzoom: 6,
        maxzoom: 11,
        filter: [
          'all',
          ['==', ['geometry-type'], 'Point'],
          ['==', ['get', 'iso_3166_2'], 'US-WA'],
          ['!=', ['get', 'shield'], 'us-interstate'],
          ['!=', ['get', 'shield'], 'us-highway'],
          ['has', 'ref'],
        ],
        layout: {
          'icon-image': ['concat', 'wa-sr-', ['get', 'ref']],
          'icon-size': 0.50,
          'symbol-placement': 'point',
          'icon-allow-overlap': false,
          'icon-padding': 10,
        },
      });
    }

    // Apple Maps Point of Interest (POI) Circular Badges & Labels (Parks, Shops, Dining, Transit)
    if (!m.getLayer('apple-poi-symbols')) {
      m.addLayer({
        id: 'apple-poi-symbols',
        type: 'symbol',
        source: 'wa-streets',
        'source-layer': 'poi_label',
        slot: 'top',
        minzoom: 12,
        filter: ['has', 'name'],
        layout: {
          'icon-image': [
            'match', ['get', 'class'],
            'park', 'apple-poi-park',
            'shop', 'apple-poi-shop',
            'grocery', 'apple-poi-grocery',
            'food_and_drink', 'apple-poi-food',
            'restaurant', 'apple-poi-food',
            'fast_food', 'apple-poi-food',
            'cafe', 'apple-poi-cafe',
            'fuel', 'apple-poi-gas',
            'gas_station', 'apple-poi-gas',
            'hospital', 'apple-poi-hospital',
            'school', 'apple-poi-school',
            'college', 'apple-poi-school',
            'transit', 'apple-poi-transit',
            'apple-poi-shop',
          ],
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            12, 0.40,
            14, 0.48,
            17, 0.56,
          ],
          'symbol-placement': 'point',
          'icon-allow-overlap': false,
          'text-allow-overlap': false,
          'icon-ignore-placement': false,
          'icon-padding': 6,
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            12, 10.5,
            14, 12,
            17, 13.5,
          ],
          'text-anchor': 'left',
          'text-offset': [0.95, 0],
          'text-padding': 6,
          'text-optional': true,
        },
        paint: {
          'text-color': [
            'match', ['get', 'class'],
            'park', '#1b8a3e',
            'shop', '#b45309',
            'grocery', '#854d0e',
            'food_and_drink', '#c2410c',
            'restaurant', '#c2410c',
            'fast_food', '#c2410c',
            'cafe', '#78350f',
            'fuel', '#0369a1',
            'hospital', '#b91c1c',
            'school', '#6d28d9',
            'transit', '#0284c7',
            '#374151',
          ],
          'text-halo-color': this.lightPreset === 'night' ? '#1c1c1e' : '#ffffff',
          'text-halo-width': 2.2,
          'text-halo-blur': 0.8,
        },
      });
    }
  }

  applyConfig() {
    if (!this.map) return;
    for (const [k, v] of Object.entries(this.basemapConfig())) {
      try { this.map.setConfigProperty('basemap', k, v); } catch { /* style not ready */ }
    }
  }

  updateBuildingColors() {
    const m = this.map;
    if (!m || !m.getLayer('apple-3d-buildings')) return;
    const isDark = this.lightPreset === 'night';
    const dayColors = [
      'interpolate', ['linear'], ['get', 'height'],
      0, '#f4f1ea',
      40, '#ece6dc',
      100, '#dfd7cc',
      250, '#cfc7b9',
    ];
    const nightColors = [
      'interpolate', ['linear'], ['get', 'height'],
      0, '#22242a',
      40, '#2a2d36',
      100, '#323642',
      250, '#3a3f4e',
    ];
    m.setPaintProperty('apple-3d-buildings', 'fill-extrusion-color', isDark ? nightColors : dayColors);
  }

  setLightPreset(preset) {
    if (preset === this.lightPreset) return;
    this.lightPreset = preset;
    try { this.map?.setConfigProperty('basemap', 'lightPreset', preset); } catch { /* applied on style.load */ }
    const m = this.map;
    if (m && m.getLayer('apple-poi-symbols')) {
      const isNight = preset === 'night';
      m.setPaintProperty('apple-poi-symbols', 'text-halo-color', isNight ? '#1c1c1e' : '#ffffff');
    }
    this.updateBuildingColors();
  }

  setMapType(type) {
    const prevUrl = this.styleUrl;
    save({ mapType: type });
    if (!this.map) return;
    if (this.styleUrl !== prevUrl) {
      this.map.setStyle(this.styleUrl, { config: { basemap: this.basemapConfig() } });
    } else {
      this.applyConfig();
      this.applyTraffic();
    }
  }

  applyTraffic() {
    const m = this.map;
    if (!m || !m.getLayer('traffic')) return;
    const on = settings.traffic || settings.mapType === 'driving';
    m.setLayoutProperty('traffic', 'visibility', on ? 'visible' : 'none');
  }

  applyTerrain() {
    const m = this.map;
    if (!m || !m.getSource('mapbox-dem')) return;
    m.setTerrain(this.is3D ? { source: 'mapbox-dem', exaggeration: 1.2 } : null);
  }

  toggle3D() {
    if (!this.map) return;
    this.stopOrbit();
    this.is3D = !this.is3D;
    this.applyTerrain();
    this.map.easeTo({ pitch: this.is3D ? 60 : 0, duration: 900, padding: this.pad() });
    this.cb.on3D?.(this.is3D);
  }

  // Explorer: tilt into 3D and slowly orbit, Flyover-style, until you touch the map.
  freeRoam() {
    if (!this.map) return;
    this.setLocateMode('off');
    this.is3D = true;
    this.applyTerrain();
    this.cb.on3D?.(true);
    this.orbitPending = true;
    this.map.easeTo({
      pitch: 65,
      zoom: Math.max(this.map.getZoom(), 15.5),
      bearing: this.map.getBearing() - 30,
      duration: 2200,
      padding: this.pad(),
    });
    this.map.once('moveend', () => { if (this.orbitPending) this.startOrbit(); });
  }

  startOrbit() {
    if (this.orbiting) return;
    this.orbiting = true;
    const step = () => {
      if (!this.orbiting) return;
      this.map.setBearing(this.map.getBearing() + 0.05);
      this.orbitRaf = requestAnimationFrame(step);
    };
    step();
  }

  stopOrbit() {
    this.orbitPending = false;
    this.orbiting = false;
    cancelAnimationFrame(this.orbitRaf);
  }

  resetNorth() {
    if (!this.map) return;
    this.stopOrbit();
    if (this.locateMode === 'heading') this.setLocateMode('follow');
    else this.map.easeTo({ bearing: 0, duration: 600 });
  }

  setBottomPadding(px) {
    this.bottomPad = px;
  }

  pad() {
    return { top: 0, bottom: this.bottomPad, left: 0, right: 0 };
  }

  // ---------- Location ----------

  startWatching() {
    if (this.watchId != null) return;
    if (!('geolocation' in navigator)) {
      toast('Location isn’t available on this device');
      return;
    }

    // Force an immediate fresh satellite GPS fix with 0ms cache age
    navigator.geolocation.getCurrentPosition(
      (p) => this.onPosition(p, { forceFly: this.firstFix }),
      (err) => console.warn('[geo] initial getPosition error', err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    );

    this.watchId = navigator.geolocation.watchPosition(
      (p) => this.onPosition(p),
      (err) => this.onGeoError(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  stopWatching() {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }

  // Locate button: off → follow → heading-up → follow …
  async cycleLocate() {
    this.stopOrbit();
    if (settings.customLocation && this.pos) {
      this.setLocateMode('follow');
      this.map?.flyTo({ center: [this.pos.lng, this.pos.lat], zoom: FOLLOW_ZOOM - 1, duration: 1200, padding: this.pad() });
      toast(`🎯 Centered on calibrated location: ${settings.customLocation.name || 'Custom'} 🐷`, 3000);
      return;
    }

    if (this.watchId == null) this.startWatching();

    // Query immediate hardware GPS refresh
    navigator.geolocation?.getCurrentPosition(
      (p) => this.onPosition(p, { forceFly: true }),
      (err) => console.warn('[geo] fresh GPS error', err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );

    if (!this.pos) {
      this.setLocateMode('follow');
      toast('🐷 Sniffing out high-accuracy GPS…');
      return;
    }

    if (this.locateMode === 'off') {
      this.setLocateMode('follow');
      const accDesc = this.pos.accuracy < 100
        ? `±${Math.round(this.pos.accuracy * 3.28)} ft (High Precision GPS)`
        : `±${(this.pos.accuracy / 1609.344).toFixed(1)} mi (Approximate)`;
      toast(`📍 Location: ${accDesc} 🐷`);
    } else if (this.locateMode === 'follow') {
      await this.enableCompass(); // must start inside the tap for iOS permission
      this.setLocateMode('heading');
    } else {
      this.setLocateMode('follow');
    }
  }

  async enableCompass() {
    if (this.compassOn) return;
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') {
          toast('Compass access was denied');
          return;
        }
      }
      window.addEventListener('deviceorientation', (e) => {
        let h = e.webkitCompassHeading;
        if (h == null && e.absolute && e.alpha != null) h = 360 - e.alpha;
        if (h == null) return;
        if (Date.now() - this.lastGpsCourse < 3000) return; // GPS course wins while driving
        this.setHeading(h);
      });
      this.compassOn = true;
    } catch (err) {
      console.warn(err);
    }
  }

  setLocateMode(mode, { keepBearing = false } = {}) {
    const prev = this.locateMode;
    this.locateMode = mode;
    this.cb.onLocateMode?.(mode);
    if (!this.map || !this.pos || mode === 'off') return;
    const opts = {
      center: [this.pos.lng, this.pos.lat],
      zoom: Math.max(this.map.getZoom(), FOLLOW_ZOOM - 1),
      duration: 900,
      padding: this.pad(),
    };
    if (mode === 'heading' && this.heading != null) opts.bearing = this.heading;
    if (mode === 'follow' && prev === 'heading' && !keepBearing) opts.bearing = 0;
    this.flyingUntil = Date.now() + 950;
    this.map.easeTo(opts);
  }

  onPosition(p, { forceFly = false } = {}) {
    if (settings.customLocation) {
      this.applyCustomLocation();
      return;
    }

    const { latitude: lat, longitude: lng, accuracy, heading, speed } = p.coords;
    const wasCoarse = this.prevAccuracy && this.prevAccuracy > 400;
    const isAccurate = accuracy < 200;
    this.prevAccuracy = accuracy;

    this.pos = { lat, lng, accuracy, isManual: false, speed, heading };
    this.ensurePuck();
    this.puck.setLngLat([lng, lat]);
    this.updateAccuracy();

    if (heading != null && !Number.isNaN(heading) && speed != null && speed > 2) {
      this.lastGpsCourse = Date.now();
      this.setHeading(heading);
    }

    // If first fix, or accuracy dramatically improved from coarse to precise, or forced:
    if (this.firstFix || (wasCoarse && isAccurate) || forceFly) {
      this.firstFix = false;
      if (this.locateMode === 'off') {
        this.locateMode = 'follow';
        this.cb.onLocateMode?.('follow');
      }
      this.flyingUntil = Date.now() + 1900;
      this.map.flyTo({ center: [lng, lat], zoom: FOLLOW_ZOOM - 1, duration: 1600, padding: this.pad() });
    } else if (this.locateMode !== 'off' && !this.orbiting) {
      this.followCamera(800, true);
    }

    // On iOS Safari, if "Precise Location" is turned off, accuracy is >1500m (~1 mile off)
    if (accuracy > 1500 && !this.coarseNoticeShown) {
      this.coarseNoticeShown = true;
      const mi = (accuracy / 1609.344).toFixed(1);
      toast(`📍 Approximate location (±${mi} mi). On iPhone: Settings › Safari › Location › Turn ON "Precise Location", or calibrate in Settings 🐷`, 7500);
    }

    if (Date.now() - this.lastSavedLoc > 30000) {
      this.lastSavedLoc = Date.now();
      save({ lastLocation: { lat, lng } });
    }
    this.cb.onLocation?.(this.pos);
  }

  onGeoError(err) {
    if (err.code === 1) {
      toast('📍 Location is off. Turn it on in Settings › Privacy › Location Services › Safari Websites', 6000);
      this.setLocateMode('off');
      this.stopWatching();
    } else if (err.code !== 3) {
      toast('Couldn’t find your location 🐷');
    }
  }

  setCustomLocation({ lat, lng, name = 'Calibrated Spot' }) {
    save({ customLocation: { lat, lng, name }, lastLocation: { lat, lng } });
    this.applyCustomLocation();
    if (this.map) {
      this.flyingUntil = Date.now() + 1500;
      this.map.flyTo({ center: [lng, lat], zoom: FOLLOW_ZOOM - 1, duration: 1400, padding: this.pad() });
    }
  }

  clearCustomLocation() {
    save({ customLocation: null });
    this.firstFix = true;
    this.prevAccuracy = null;
    this.coarseNoticeShown = false;
    this.puckEl?.classList.remove('is-calibrated');
    this.startWatching();
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => this.onPosition(p, { forceFly: true }),
        (err) => this.onGeoError(err),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
    }
  }

  applyCustomLocation() {
    if (!settings.customLocation) return;
    const { lat, lng, name } = settings.customLocation;
    this.pos = { lat, lng, accuracy: 5, isManual: true, name };
    this.ensurePuck();
    this.puck.setLngLat([lng, lat]);
    this.updateAccuracy();
    this.puckEl?.classList.add('is-calibrated');
    this.cb.onLocation?.(this.pos);
  }

  setHeading(h) {
    if (this.heading != null && Math.abs(((h - this.heading + 540) % 360) - 180) < 1) return;
    this.heading = h;
    if (this.puck) {
      this.puck.setRotation(h);
      this.puckEl.classList.add('has-heading');
    }
    if (this.locateMode === 'heading') this.followCamera(250);
  }

  followCamera(duration, force = false) {
    if (!this.map || !this.pos || Date.now() < this.flyingUntil) return;
    const now = Date.now();
    if (!force && now - this.lastCam < 200) return;
    this.lastCam = now;
    const opts = {
      center: [this.pos.lng, this.pos.lat],
      duration,
      padding: this.pad(),
      easing: (t) => t,
    };
    if (this.locateMode === 'heading' && this.heading != null) opts.bearing = this.heading;
    this.map.easeTo(opts);
  }

  ensurePuck() {
    if (this.puck) return;
    const el = document.createElement('div');
    el.className = 'puck';
    el.innerHTML =
      '<div class="puck-heading"></div><div class="puck-pulse"></div>' +
      '<div class="puck-dot"><div class="puck-snout"><i></i><i></i></div></div>';
    this.puckEl = el;
    this.puck = new mapboxgl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })
      .setLngLat([0, 0])
      .addTo(this.map);
  }

  updateAccuracy() {
    const src = this.map?.getSource('accuracy');
    if (!src || !this.pos) return;
    src.setData(circle(this.pos.lng, this.pos.lat, Math.min(this.pos.accuracy || 0, 2000)));
  }

  // ---------- Destination & Routing ----------

  setDestination(coords, info = {}) {
    if (!this.map || !coords) return;
    const [lng, lat] = coords;
    this.destination = { lng, lat, info };
    if (!this.destMarker) {
      const el = document.createElement('div');
      el.className = 'apple-dest-marker';
      el.innerHTML = '<div class="dest-pin"><div class="dest-dot"></div></div><div class="dest-shadow"></div>';
      this.destMarker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(this.map);
    } else {
      this.destMarker.setLngLat([lng, lat]);
    }
  }

  setWaypoint(coords, info = {}) {
    if (!this.map || !coords) return;
    const [lng, lat] = coords;
    this.waypoint = { lng, lat, info };
    if (!this.waypointMarker) {
      const el = document.createElement('div');
      el.className = 'apple-dest-marker waypoint-marker';
      const icon = info.icon || '☕';
      el.innerHTML = `<div class="dest-pin waypoint-pin"><span class="waypoint-pin-icon">${icon}</span></div><div class="dest-shadow"></div>`;
      this.waypointMarker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(this.map);
    } else {
      this.waypointMarker.setLngLat([lng, lat]);
      const iconEl = this.waypointMarker.getElement().querySelector('.waypoint-pin-icon');
      if (iconEl && info.icon) iconEl.textContent = info.icon;
    }
  }

  clearWaypoint() {
    if (this.waypointMarker) {
      this.waypointMarker.remove();
      this.waypointMarker = null;
    }
    this.waypoint = null;
  }

  clearDestination() {
    if (this.destMarker) {
      this.destMarker.remove();
      this.destMarker = null;
    }
    this.clearWaypoint();
    this.destination = null;
    this.clearRoute();
  }

  flyToDestination(coords) {
    if (!this.map || !coords) return;
    this.stopOrbit();
    this.setLocateMode('off');
    this.map.flyTo({
      center: coords,
      zoom: 15.6,
      pitch: 35,
      duration: 1600,
      padding: this.pad(),
    });
  }

  flyoverDestination(coords) {
    if (!this.map || !coords) return;
    this.stopOrbit();
    this.setLocateMode('off');
    this.is3D = true;
    this.applyTerrain();
    this.cb.on3D?.(true);
    this.orbitPending = true;
    this.map.flyTo({
      center: coords,
      zoom: 16.5,
      pitch: 65,
      bearing: this.map.getBearing() - 40,
      duration: 2000,
      padding: this.pad(),
    });
    this.map.once('moveend', () => {
      if (this.orbitPending) this.startOrbit();
    });
  }

  showRoutes(routes, selectedIndex = 0) {
    this.currentRoutes = routes || [];
    this.selectedRouteIndex = selectedIndex;

    const selectedRoute = this.currentRoutes[selectedIndex] || this.currentRoutes[0];
    if (selectedRoute && selectedRoute.geometry) {
      this.currentRouteData = {
        type: 'Feature',
        properties: { id: selectedRoute.id ?? 0, selected: true },
        geometry: selectedRoute.geometry,
      };
      this.map?.getSource('route')?.setData(this.currentRouteData);
    } else {
      this.currentRouteData = null;
      this.map?.getSource('route')?.setData(EMPTY);
    }

    const altFeatures = this.currentRoutes
      .filter((_, idx) => idx !== selectedIndex)
      .filter((r) => r && r.geometry)
      .map((r) => ({
        type: 'Feature',
        properties: { id: r.id ?? 0, summary: r.summary || '' },
        geometry: r.geometry,
      }));

    this.currentAltData = {
      type: 'FeatureCollection',
      features: altFeatures,
    };
    this.map?.getSource('routes-alt')?.setData(this.currentAltData);
  }

  showRoute(routeGeojson) {
    if (routeGeojson && routeGeojson.type) {
      this.showRoutes([{ id: 0, geometry: routeGeojson, durationSec: 0, distanceMeters: 0 }], 0);
    } else {
      this.clearRoute();
    }
  }

  clearRoute() {
    this.currentRoutes = [];
    this.currentRouteData = null;
    this.currentAltData = null;
    this.clearWaypoint();
    this.map?.getSource('route')?.setData(EMPTY);
    this.map?.getSource('routes-alt')?.setData(EMPTY);
  }

  fitRouteBounds(startCoords, destCoords) {
    if (!this.map || !startCoords || !destCoords) return;
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend(startCoords);
    if (this.waypoint && this.waypoint.lng && this.waypoint.lat) {
      bounds.extend([this.waypoint.lng, this.waypoint.lat]);
    }
    bounds.extend(destCoords);
    this.map.fitBounds(bounds, {
      padding: {
        top: 90,
        bottom: Math.max(240, this.bottomPad + 50),
        left: 50,
        right: 50,
      },
      duration: 1400,
      pitch: 28,
    });
  }
}

function circle(lng, lat, radiusM, steps = 64) {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}
