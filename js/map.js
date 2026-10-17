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
    this.flyoverActive = false;
    this.flyoverCenter = null;
    this.flyoverName = null;
    this.waypointMarkers = [];
    this.waypoints = [];
  }


  get styleUrl() {
    return settings.mapType === 'satellite' ? STYLE_SATELLITE : STYLE_STANDARD;
  }

  basemapConfig() {
    const isSat = settings.mapType === 'satellite';
    const driving = settings.mapType === 'driving';
    return {
      lightPreset: this.lightPreset,
      showPointOfInterestLabels: false,
      showTransitLabels: !driving && isSat,
      showRoadLabels: false,
      showPlaceLabels: false,
      show3dObjects: isSat,
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
    ['touchstart', 'mousedown', 'wheel', 'dragstart'].forEach((ev) => m.on(ev, () => {
      if (this.flyoverActive) this.stopFlyover();
      else this.stopOrbit();
    }));
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

    // Vector source for Apple Maps cartography, road hierarchy, POIs & highway shields
    if (!m.getSource('wa-streets')) {
      m.addSource('wa-streets', {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-streets-v8',
      });
    }

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

    // Apple Maps iOS 18 Vector Cartography (Land, Parks, Water, Buildings, Roads)
    this.applyAppleCartography();

    // Live traffic — Apple Maps style: orange (slow) and red (jammed) directly on road carriageways
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
            'severe', '#d70015',
            '#ff9500',
          ],
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9, 1.5, 13, 3.6, 16, 7, 19, 15],
          'line-offset': ['interpolate', ['exponential', 1.5], ['zoom'], 9, 0.4, 13, 1.3, 16, 2.6, 19, 6.5],
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

    // Apple Maps 3D Building Extrusions & Landmarks with warm ambient occlusion
    if (!m.getLayer('apple-3d-buildings')) {
      m.addLayer({
        id: 'apple-3d-buildings',
        source: 'wa-streets',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 14.2,
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
            14.2, 0,
            14.8, ['get', 'height'],
          ],
          'fill-extrusion-base': [
            'interpolate', ['linear'], ['zoom'],
            14.2, 0,
            14.8, ['get', 'min_height'],
          ],
          'fill-extrusion-opacity': 0.88,
          'fill-extrusion-ambient-occlusion-intensity': 0.35,
          'fill-extrusion-ambient-occlusion-radius': 3.5,
        },
      });
    }

    this.applyWaShields();
    this.updateCartographyColors();
    this.applyCartographyVisibility();
    if (settings.customLocation) {
      this.applyCustomLocation();
    }
  }

  /**
   * Builds Apple Maps iOS 18 vector cartography layers:
   * - Warm porcelain background (#f5f4f0) & warm sand commercial pockets (#efe6d5)
   * - Pastel mint-sage parks & woodlands (#c3ecc7 / #bae8be)
   * - Sky-azure water (#92d3f7) with soft shoreline casing
   * - Cool lavender-slate residential streets transitioning to crisp white at close zoom
   * - Signature Apple Maps steel-slate blue-gray freeways (#96a5b9) & ramps (#a5b3c6)
   */
  applyAppleCartography() {
    const m = this.map;
    if (!m) return;

    // 1. Warm Porcelain Land Background
    if (!m.getLayer('apple-bg')) {
      m.addLayer({
        id: 'apple-bg',
        type: 'background',
        slot: 'middle',
        paint: {
          'background-color': '#f5f4f0',
          'background-emissive-strength': 1,
        },
      });
    }

    // 2. Commercial, Retail, School & Hospital Warm Sand Zones
    if (!m.getLayer('apple-landuse-urban')) {
      m.addLayer({
        id: 'apple-landuse-urban',
        type: 'fill',
        source: 'wa-streets',
        'source-layer': 'landuse',
        slot: 'middle',
        filter: [
          'in',
          ['get', 'class'],
          ['literal', ['commercial_area', 'retail', 'school', 'hospital', 'industrial', 'airport', 'sand']],
        ],
        paint: {
          'fill-color': '#efe6d5',
          'fill-opacity': 0.78,
          'fill-emissive-strength': 1,
        },
      });
    }

    // 3. Parks, Forests & Green Spaces (Pastel Mint-Sage)
    if (!m.getLayer('apple-landuse-park')) {
      m.addLayer({
        id: 'apple-landuse-park',
        type: 'fill',
        source: 'wa-streets',
        'source-layer': 'landuse',
        slot: 'middle',
        filter: [
          'in',
          ['get', 'class'],
          ['literal', ['park', 'national_park', 'wood', 'grass', 'pitch', 'scrub', 'cemetery', 'golf_course', 'agriculture']],
        ],
        paint: {
          'fill-color': [
            'match',
            ['get', 'class'],
            ['park', 'pitch', 'golf_course'],
            '#bae8be',
            '#c4ecc8',
          ],
          'fill-opacity': 0.92,
          'fill-emissive-strength': 1,
        },
      });
    }

    if (!m.getLayer('apple-landuse-overlay')) {
      m.addLayer({
        id: 'apple-landuse-overlay',
        type: 'fill',
        source: 'wa-streets',
        'source-layer': 'landuse_overlay',
        slot: 'middle',
        filter: ['in', ['get', 'class'], ['literal', ['national_park', 'wetland', 'wetland_noveg']]],
        paint: {
          'fill-color': '#c2ecc6',
          'fill-opacity': 0.65,
          'fill-emissive-strength': 1,
        },
      });
    }

    // 4. Waterways (Rivers, Streams, Canals)
    if (!m.getLayer('apple-waterway')) {
      m.addLayer({
        id: 'apple-waterway',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'waterway',
        slot: 'middle',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#92d3f7',
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 8, 0.8, 12, 1.8, 16, 4.5],
          'line-emissive-strength': 1,
        },
      });
    }

    // 5. Water Bodies (Lakes, Bays, Puget Sound)
    if (!m.getLayer('apple-water')) {
      m.addLayer({
        id: 'apple-water',
        type: 'fill',
        source: 'wa-streets',
        'source-layer': 'water',
        slot: 'middle',
        paint: {
          'fill-color': '#92d3f7',
          'fill-emissive-strength': 1,
        },
      });
    }
    if (!m.getLayer('apple-water-line')) {
      m.addLayer({
        id: 'apple-water-line',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'water',
        slot: 'middle',
        paint: {
          'line-color': '#80c4ec',
          'line-width': 1,
          'line-emissive-strength': 1,
        },
      });
    }

    // 6. Aeroway (Runways & Taxiways)
    if (!m.getLayer('apple-aeroway')) {
      m.addLayer({
        id: 'apple-aeroway',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'aeroway',
        slot: 'middle',
        paint: {
          'line-color': '#e2e0d8',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 1.5, 15, 10],
          'line-emissive-strength': 1,
        },
      });
    }

    // 7. 2D Building Footprints (Warm Stone)
    if (!m.getLayer('apple-buildings-2d')) {
      m.addLayer({
        id: 'apple-buildings-2d',
        type: 'fill',
        source: 'wa-streets',
        'source-layer': 'building',
        minzoom: 13,
        slot: 'middle',
        paint: {
          'fill-color': '#eae5dc',
          'fill-outline-color': '#ded8cc',
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.35, 14.5, 0.75],
          'fill-emissive-strength': 1,
        },
      });
    }

    // 8. Park Trails & Pedestrian Paths
    if (!m.getLayer('apple-road-path')) {
      m.addLayer({
        id: 'apple-road-path',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'road',
        minzoom: 13,
        slot: 'middle',
        filter: ['in', ['get', 'class'], ['literal', ['path', 'pedestrian', 'steps', 'track']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#b4c4b6',
          'line-dasharray': [2, 1.6],
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.0, 16, 2.0],
          'line-emissive-strength': 1,
        },
      });
    }

    // 9. Minor / Residential Streets Casing & Fill
    // At mid-zooms (11-13.4), residential streets are Apple Maps' signature cool slate-lavender (#cfd7e4);
    // at close zooms (14+), they smoothly open into crisp white streets with cool-slate casings.
    if (!m.getLayer('apple-road-street-casing')) {
      m.addLayer({
        id: 'apple-road-street-casing',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'road',
        minzoom: 13.2,
        slot: 'middle',
        filter: ['in', ['get', 'class'], ['literal', ['street', 'street_limited', 'service']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#c4cddc',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 13.2, 2.4, 15, 5.8, 18, 16],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 13.2, 0, 13.8, 1],
          'line-emissive-strength': 1,
        },
      });
    }
    if (!m.getLayer('apple-road-street')) {
      m.addLayer({
        id: 'apple-road-street',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'road',
        minzoom: 10.8,
        slot: 'middle',
        filter: ['in', ['get', 'class'], ['literal', ['street', 'street_limited', 'service']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'interpolate', ['linear'], ['zoom'],
            11, '#d2d9e5',
            13.3, '#cfd7e4',
            14.2, '#ffffff',
          ],
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10.8, 0.85, 12.5, 1.55, 13.5, 2.2, 15, 4.2, 18, 13],
          'line-emissive-strength': 1,
        },
      });
    }

    // 10. Secondary & Tertiary Collector Roads
    if (!m.getLayer('apple-road-secondary-casing')) {
      m.addLayer({
        id: 'apple-road-secondary-casing',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'road',
        minzoom: 11,
        slot: 'middle',
        filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary', 'secondary_link', 'tertiary_link']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#b5c0d1',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 11, 2.6, 13, 4.5, 15, 8.2, 18, 22],
          'line-emissive-strength': 1,
        },
      });
    }
    if (!m.getLayer('apple-road-secondary')) {
      m.addLayer({
        id: 'apple-road-secondary',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'road',
        minzoom: 9.5,
        slot: 'middle',
        filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary', 'secondary_link', 'tertiary_link']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'interpolate', ['linear'], ['zoom'],
            10, '#c9d2e1',
            12.8, '#dce2ec',
            13.8, '#ffffff',
          ],
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9.5, 1.2, 11, 1.8, 13, 3.1, 15, 6.4, 18, 18.5],
          'line-emissive-strength': 1,
        },
      });
    }

    // 11. Primary Arterial Roads & State Route Surface Corridors
    if (!m.getLayer('apple-road-primary-casing')) {
      m.addLayer({
        id: 'apple-road-primary-casing',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'road',
        minzoom: 7.5,
        slot: 'middle',
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'primary_link']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#a3b0c4',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 7.5, 2.0, 11, 3.8, 13, 6.0, 15, 10.6, 18, 26],
          'line-emissive-strength': 1,
        },
      });
    }
    if (!m.getLayer('apple-road-primary')) {
      m.addLayer({
        id: 'apple-road-primary',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'road',
        minzoom: 6.5,
        slot: 'middle',
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'primary_link']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'interpolate', ['linear'], ['zoom'],
            8, '#bcc7d8',
            12, '#d5dde9',
            13.6, '#e3e8f0',
            15, '#ffffff',
          ],
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 6.5, 1.2, 11, 2.6, 13, 4.4, 15, 8.4, 18, 22],
          'line-emissive-strength': 1,
        },
      });
    }

    // 12. Freeway Ramps / Interchange Loops (Apple Maps Steel-Slate)
    if (!m.getLayer('apple-road-ramp-casing')) {
      m.addLayer({
        id: 'apple-road-ramp-casing',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'road',
        minzoom: 10,
        slot: 'middle',
        filter: ['in', ['get', 'class'], ['literal', ['motorway_link', 'trunk_link']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#8392a7',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 2.4, 13, 4.6, 15, 7.6, 18, 16.5],
          'line-emissive-strength': 1,
        },
      });
    }
    if (!m.getLayer('apple-road-ramp')) {
      m.addLayer({
        id: 'apple-road-ramp',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'road',
        minzoom: 10,
        slot: 'middle',
        filter: ['in', ['get', 'class'], ['literal', ['motorway_link', 'trunk_link']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#a4b2c5',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 1.5, 13, 3.0, 15, 5.4, 18, 12.8],
          'line-emissive-strength': 1,
        },
      });
    }

    // 13. Freeways / Interstates & Divided State Highways (Signature Apple Maps Steel-Slate #95a4b8)
    if (!m.getLayer('apple-road-motorway-casing')) {
      m.addLayer({
        id: 'apple-road-motorway-casing',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'road',
        minzoom: 5,
        slot: 'middle',
        filter: [
          'all',
          ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
          ['!=', ['get', 'structure'], 'bridge'],
        ],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#7c8ba2',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 2.0, 8, 3.6, 11, 5.8, 13, 8.6, 15, 14.2, 18, 31],
          'line-emissive-strength': 1,
        },
      });
    }
    if (!m.getLayer('apple-road-motorway')) {
      m.addLayer({
        id: 'apple-road-motorway',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'road',
        minzoom: 5,
        slot: 'middle',
        filter: [
          'all',
          ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
          ['!=', ['get', 'structure'], 'bridge'],
        ],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#95a4b8',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 1.2, 8, 2.4, 11, 4.2, 13, 6.5, 15, 11.4, 18, 26],
          'line-emissive-strength': 1,
        },
      });
    }

    // 14. Freeway Bridges & Flyover Overpasses (Stacked with crisp overpass casing)
    if (!m.getLayer('apple-road-motorway-bridge-casing')) {
      m.addLayer({
        id: 'apple-road-motorway-bridge-casing',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'road',
        minzoom: 9,
        slot: 'middle',
        filter: [
          'all',
          ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'motorway_link', 'trunk_link']]],
          ['==', ['get', 'structure'], 'bridge'],
        ],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': '#6e7e96',
          'line-width': [
            'interpolate', ['exponential', 1.5], ['zoom'],
            9, ['match', ['get', 'class'], ['motorway_link', 'trunk_link'], 2.4, 4.2],
            13, ['match', ['get', 'class'], ['motorway_link', 'trunk_link'], 4.8, 9.0],
            15, ['match', ['get', 'class'], ['motorway_link', 'trunk_link'], 8.0, 14.8],
            18, ['match', ['get', 'class'], ['motorway_link', 'trunk_link'], 17.0, 32.0],
          ],
          'line-emissive-strength': 1,
        },
      });
    }
    if (!m.getLayer('apple-road-motorway-bridge')) {
      m.addLayer({
        id: 'apple-road-motorway-bridge',
        type: 'line',
        source: 'wa-streets',
        'source-layer': 'road',
        minzoom: 9,
        slot: 'middle',
        filter: [
          'all',
          ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'motorway_link', 'trunk_link']]],
          ['==', ['get', 'structure'], 'bridge'],
        ],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'class'],
            ['motorway_link', 'trunk_link'],
            '#a4b2c5',
            '#95a4b8',
          ],
          'line-width': [
            'interpolate', ['exponential', 1.5], ['zoom'],
            9, ['match', ['get', 'class'], ['motorway_link', 'trunk_link'], 1.5, 2.8],
            13, ['match', ['get', 'class'], ['motorway_link', 'trunk_link'], 3.0, 6.5],
            15, ['match', ['get', 'class'], ['motorway_link', 'trunk_link'], 5.4, 11.4],
            18, ['match', ['get', 'class'], ['motorway_link', 'trunk_link'], 12.8, 26.0],
          ],
          'line-emissive-strength': 1,
        },
      });
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

    // Note: In Mapbox GL JS, symbol layers added LATER have HIGHER collision priority.
    // Order from lowest to highest priority:
    // 1. POI badges & labels -> 2. Water labels -> 3. Street labels -> 4. Green Corridor labels -> 5. Place/City labels -> 6. Highway Shields

    // 1. Apple Maps Point of Interest (POI) Circular Badges & Labels (Parks, Shops, Dining, Transit)
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
            12, 0.42,
            14, 0.50,
            17, 0.58,
          ],
          'symbol-placement': 'point',
          'icon-allow-overlap': false,
          'text-allow-overlap': false,
          'icon-ignore-placement': false,
          'icon-padding': 8,
          'text-field': ['get', 'name'],
          'text-font': ['Arial Unicode MS Bold', 'DIN Pro Medium'],
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
          'text-halo-blur': 0.6,
        },
      });
    }

    // 2. Apple Maps Water Labels (Lakes, Bays, Sounds)
    if (!m.getLayer('apple-water-labels')) {
      m.addLayer({
        id: 'apple-water-labels',
        type: 'symbol',
        source: 'wa-streets',
        'source-layer': 'natural_label',
        slot: 'top',
        minzoom: 8,
        filter: ['in', ['get', 'class'], ['literal', ['water', 'bay', 'sea', 'ocean', 'reservoir', 'stream', 'river', 'canal']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Arial Unicode MS Regular', 'DIN Pro Italic'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 13, 13.5, 16, 15.5],
          'text-max-width': 7,
          'text-letter-spacing': 0.04,
        },
        paint: {
          'text-color': this.lightPreset === 'night' ? '#67b7e8' : '#2f7ba8',
          'text-halo-color': this.lightPreset === 'night' ? '#0e2841' : '#bce6fc',
          'text-halo-width': 1.8,
        },
      });
    }

    // 3. Apple Maps Local & Arterial Street Name Labels
    if (!m.getLayer('apple-road-labels')) {
      m.addLayer({
        id: 'apple-road-labels',
        type: 'symbol',
        source: 'wa-streets',
        'source-layer': 'road',
        slot: 'top',
        minzoom: 12,
        filter: [
          'all',
          ['has', 'name'],
          ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'tertiary', 'street', 'street_limited']]],
        ],
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 320,
          'text-field': ['get', 'name'],
          'text-font': ['Arial Unicode MS Regular', 'DIN Pro Medium'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10.5, 14, 12, 17, 14],
          'text-rotation-alignment': 'map',
          'text-pitch-alignment': 'viewport',
          'text-padding': 8,
        },
        paint: {
          'text-color': this.lightPreset === 'night' ? '#b0bdd1' : '#4a5363',
          'text-halo-color': this.lightPreset === 'night' ? '#1b222c' : '#ffffff',
          'text-halo-width': 2.2,
        },
      });
    }

    // 4. Apple Maps Green Corridor & Trail Labels (e.g. "5 SnoCo", "Burke-Gilman Trail")
    if (!m.getSource('apple-corridors')) {
      m.addSource('apple-corridors', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { name: '5 SnoCo' }, geometry: { type: 'Point', coordinates: [-122.2735, 47.8135] } },
            { type: 'Feature', properties: { name: '5 SnoCo' }, geometry: { type: 'Point', coordinates: [-122.3095, 47.7985] } },
            { type: 'Feature', properties: { name: '405 Express' }, geometry: { type: 'Point', coordinates: [-122.1865, 47.6920] } },
            { type: 'Feature', properties: { name: '520 Bridge' }, geometry: { type: 'Point', coordinates: [-122.2560, 47.6410] } },
            { type: 'Feature', properties: { name: 'Burke-Gilman Trail' }, geometry: { type: 'Point', coordinates: [-122.2780, 47.6790] } },
            { type: 'Feature', properties: { name: 'Sammamish River Trail' }, geometry: { type: 'Point', coordinates: [-122.1490, 47.7160] } },
            { type: 'Feature', properties: { name: 'Interurban Trail' }, geometry: { type: 'Point', coordinates: [-122.3190, 47.7880] } },
          ],
        },
      });
    }
    if (!m.getLayer('apple-corridor-labels')) {
      m.addLayer({
        id: 'apple-corridor-labels',
        type: 'symbol',
        source: 'apple-corridors',
        slot: 'top',
        minzoom: 10.5,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Arial Unicode MS Bold', 'DIN Pro Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10.5, 11.5, 13, 13.5, 16, 15.5],
          'text-padding': 10,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': this.lightPreset === 'night' ? '#4ade80' : '#116e30',
          'text-halo-color': this.lightPreset === 'night' ? '#1b222c' : '#ffffff',
          'text-halo-width': 2.6,
          'text-halo-blur': 0.4,
        },
      });
    }

    // 5. Apple Maps Place, Neighborhood & City Labels (Wide rounded sans-serif with crisp white halo)
    if (!m.getLayer('apple-place-labels')) {
      m.addLayer({
        id: 'apple-place-labels',
        type: 'symbol',
        source: 'wa-streets',
        'source-layer': 'place_label',
        slot: 'top',
        minzoom: 6,
        filter: ['in', ['get', 'type'], ['literal', ['city', 'town', 'village', 'suburb', 'neighbourhood', 'quarter']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Arial Unicode MS Bold', 'DIN Pro Bold'],
          'text-transform': [
            'match',
            ['get', 'type'],
            ['suburb', 'neighbourhood', 'quarter'],
            'uppercase',
            'none',
          ],
          'text-letter-spacing': [
            'match',
            ['get', 'type'],
            ['suburb', 'neighbourhood', 'quarter'],
            0.09,
            0.01,
          ],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            8, ['match', ['get', 'type'], 'city', 14, 'town', 11.5, 10],
            12, ['match', ['get', 'type'], 'city', 19, 'town', 14.5, 11.5],
            15, ['match', ['get', 'type'], 'city', 23, 'town', 17, 13],
          ],
          'text-padding': 10,
          'text-max-width': 8,
        },
        paint: {
          'text-color': [
            'match',
            ['get', 'type'],
            ['suburb', 'neighbourhood', 'quarter'],
            this.lightPreset === 'night' ? '#98a3b3' : '#6c727d',
            this.lightPreset === 'night' ? '#e5ebf5' : '#333740',
          ],
          'text-halo-color': this.lightPreset === 'night' ? '#1b222c' : '#ffffff',
          'text-halo-width': 2.4,
          'text-halo-blur': 0.5,
        },
      });
    }

    // 6. US Highway Shields — Point & Line placement
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
          ['<=', ['length', ['get', 'ref']], 4],
        ],
        layout: {
          'icon-image': ['concat', 'us-hwy-', ['get', 'ref']],
          'icon-size': 0.62,
          'symbol-placement': 'point',
          'icon-allow-overlap': false,
          'icon-padding': 12,
        },
      });
    }
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
          ['<=', ['length', ['get', 'ref']], 4],
        ],
        layout: {
          'icon-image': ['concat', 'us-hwy-', ['get', 'ref']],
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            7, 0.54,
            11, 0.64,
            14, 0.74,
            17, 0.82,
          ],
          'symbol-placement': 'line',
          'symbol-spacing': 320,
          'icon-rotation-alignment': 'viewport',
          'icon-pitch-alignment': 'viewport',
          'icon-allow-overlap': false,
          'icon-ignore-placement': false,
          'icon-padding': 14,
        },
      });
    }

    // 7. Washington State Route Shields (1:1 Charcoal Squircle + White Washington Bust)
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
          ['<=', ['length', ['get', 'ref']], 4],
        ],
        layout: {
          'icon-image': ['concat', 'wa-sr-', ['get', 'ref']],
          'icon-size': 0.62,
          'symbol-placement': 'point',
          'icon-allow-overlap': false,
          'icon-padding': 12,
        },
      });
    }
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
          ['<=', ['length', ['get', 'ref']], 4],
        ],
        layout: {
          'icon-image': ['concat', 'wa-sr-', ['get', 'ref']],
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            8, 0.56,
            11, 0.66,
            14, 0.76,
            17, 0.84,
          ],
          'symbol-placement': 'line',
          'symbol-spacing': 300,
          'icon-rotation-alignment': 'viewport',
          'icon-pitch-alignment': 'viewport',
          'icon-allow-overlap': false,
          'icon-ignore-placement': false,
          'icon-padding': 12,
        },
      });
    }

    // 8. Apple Maps Interstate Shields (Added LAST for #1 highest collision priority: I-405, I-5, I-90)
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
          ['<=', ['length', ['get', 'ref']], 4],
        ],
        layout: {
          'icon-image': ['concat', 'interstate-', ['get', 'ref']],
          'icon-size': 0.66,
          'symbol-placement': 'point',
          'icon-allow-overlap': false,
          'icon-padding': 12,
        },
      });
    }
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
          ['<=', ['length', ['get', 'ref']], 4],
        ],
        layout: {
          'icon-image': ['concat', 'interstate-', ['get', 'ref']],
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            6, 0.56,
            10, 0.68,
            13, 0.78,
            16, 0.88,
          ],
          'symbol-placement': 'line',
          'symbol-spacing': 300,
          'icon-rotation-alignment': 'viewport',
          'icon-pitch-alignment': 'viewport',
          'icon-allow-overlap': false,
          'icon-ignore-placement': false,
          'icon-padding': 12,
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

  applyCartographyVisibility() {
    const m = this.map;
    if (!m) return;
    const isSat = settings.mapType === 'satellite';
    const isDriving = settings.mapType === 'driving';
    const baseVis = isSat ? 'none' : 'visible';

    const baseLayers = [
      'apple-bg',
      'apple-landuse-urban',
      'apple-landuse-park',
      'apple-landuse-overlay',
      'apple-waterway',
      'apple-water',
      'apple-water-line',
      'apple-aeroway',
      'apple-buildings-2d',
      'apple-road-path',
      'apple-road-street-casing',
      'apple-road-street',
      'apple-road-secondary-casing',
      'apple-road-secondary',
      'apple-road-primary-casing',
      'apple-road-primary',
      'apple-road-ramp-casing',
      'apple-road-ramp',
      'apple-road-motorway-casing',
      'apple-road-motorway',
      'apple-road-motorway-bridge-casing',
      'apple-road-motorway-bridge',
      'apple-3d-buildings',
    ];
    for (const id of baseLayers) {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', baseVis);
    }
    if (m.getLayer('apple-poi-symbols')) {
      m.setLayoutProperty('apple-poi-symbols', 'visibility', isDriving ? 'none' : 'visible');
    }
  }

  updateCartographyColors() {
    const m = this.map;
    if (!m) return;
    const isNight = this.lightPreset === 'night';
    const setPaint = (layer, prop, val) => {
      if (m.getLayer(layer)) m.setPaintProperty(layer, prop, val);
    };

    // Base land, parks & water
    setPaint('apple-bg', 'background-color', isNight ? '#1b222c' : '#f5f4f0');
    setPaint('apple-landuse-urban', 'fill-color', isNight ? '#222a37' : '#efe6d5');
    setPaint(
      'apple-landuse-park',
      'fill-color',
      isNight
        ? '#173026'
        : ['match', ['get', 'class'], ['park', 'pitch', 'golf_course'], '#bae8be', '#c4ecc8']
    );
    setPaint('apple-landuse-overlay', 'fill-color', isNight ? '#173026' : '#c2ecc6');
    setPaint('apple-waterway', 'line-color', isNight ? '#112c46' : '#92d3f7');
    setPaint('apple-water', 'fill-color', isNight ? '#0e2841' : '#92d3f7');
    setPaint('apple-water-line', 'line-color', isNight ? '#153656' : '#80c4ec');
    setPaint('apple-aeroway', 'line-color', isNight ? '#28303e' : '#e2e0d8');
    setPaint('apple-buildings-2d', 'fill-color', isNight ? '#242c3a' : '#eae5dc');
    setPaint('apple-buildings-2d', 'fill-outline-color', isNight ? '#2d3646' : '#ded8cc');

    // Roads
    setPaint('apple-road-path', 'line-color', isNight ? '#2e3d37' : '#b4c4b6');
    setPaint('apple-road-street-casing', 'line-color', isNight ? '#222a37' : '#c4cddc');
    setPaint(
      'apple-road-street',
      'line-color',
      isNight
        ? '#313b4c'
        : ['interpolate', ['linear'], ['zoom'], 11, '#d2d9e5', 13.3, '#cfd7e4', 14.2, '#ffffff']
    );
    setPaint('apple-road-secondary-casing', 'line-color', isNight ? '#242e3d' : '#b5c0d1');
    setPaint(
      'apple-road-secondary',
      'line-color',
      isNight
        ? '#3b4659'
        : ['interpolate', ['linear'], ['zoom'], 10, '#c9d2e1', 12.8, '#dce2ec', 13.8, '#ffffff']
    );
    setPaint('apple-road-primary-casing', 'line-color', isNight ? '#263142' : '#a3b0c4');
    setPaint(
      'apple-road-primary',
      'line-color',
      isNight
        ? '#445166'
        : ['interpolate', ['linear'], ['zoom'], 8, '#bcc7d8', 12, '#d5dde9', 13.6, '#e3e8f0', 15, '#ffffff']
    );
    setPaint('apple-road-ramp-casing', 'line-color', isNight ? '#1f2938' : '#8392a7');
    setPaint('apple-road-ramp', 'line-color', isNight ? '#435369' : '#a4b2c5');
    setPaint('apple-road-motorway-casing', 'line-color', isNight ? '#1e2736' : '#7c8ba2');
    setPaint('apple-road-motorway', 'line-color', isNight ? '#4f617a' : '#95a4b8');
    setPaint('apple-road-motorway-bridge-casing', 'line-color', isNight ? '#18202c' : '#6e7e96');
    setPaint(
      'apple-road-motorway-bridge',
      'line-color',
      isNight
        ? '#526580'
        : ['match', ['get', 'class'], ['motorway_link', 'trunk_link'], '#a4b2c5', '#95a4b8']
    );

    // Labels & Typography
    setPaint('apple-poi-symbols', 'text-halo-color', isNight ? '#1c1c1e' : '#ffffff');
    setPaint('apple-water-labels', 'text-color', isNight ? '#67b7e8' : '#2f7ba8');
    setPaint('apple-water-labels', 'text-halo-color', isNight ? '#0e2841' : '#bce6fc');
    setPaint('apple-road-labels', 'text-color', isNight ? '#b0bdd1' : '#4a5363');
    setPaint('apple-road-labels', 'text-halo-color', isNight ? '#1b222c' : '#ffffff');
    setPaint('apple-corridor-labels', 'text-color', isNight ? '#4ade80' : '#116e30');
    setPaint('apple-corridor-labels', 'text-halo-color', isNight ? '#1b222c' : '#ffffff');
    setPaint(
      'apple-place-labels',
      'text-color',
      [
        'match',
        ['get', 'type'],
        ['suburb', 'neighbourhood', 'quarter'],
        isNight ? '#98a3b3' : '#6c727d',
        isNight ? '#e5ebf5' : '#333740',
      ]
    );
    setPaint('apple-place-labels', 'text-halo-color', isNight ? '#1b222c' : '#ffffff');

    this.updateBuildingColors();
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
    this.updateCartographyColors();
  }

  setMapType(type) {
    const prevUrl = this.styleUrl;
    save({ mapType: type });
    if (!this.map) return;
    if (this.styleUrl !== prevUrl) {
      this.map.setStyle(this.styleUrl, { config: { basemap: this.basemapConfig() } });
    } else {
      this.applyConfig();
      this.applyCartographyVisibility();
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

  startFlyoverOrbit(centerCoords) {
    if (this.orbiting) return;
    this.orbiting = true;
    this.flyoverActive = true;
    this.flyoverCenter = centerCoords;
    const startTime = performance.now();
    const basePitch = 64.5;
    const baseZoom = 16.6;

    const step = (now) => {
      if (!this.orbiting || !this.map || !this.flyoverCenter) return;
      const elapsed = (now - startTime) / 1000;
      // Gentle sinusoidal pitch oscillation between 62° and 67°
      const pitch = basePitch + Math.sin(elapsed * 0.25) * 2.5;
      // Gentle altitude breathing
      const zoom = baseZoom + Math.cos(elapsed * 0.18) * 0.12;
      const bearing = (this.map.getBearing() + 0.065) % 360;

      this.map.jumpTo({
        center: this.flyoverCenter,
        bearing,
        pitch,
        zoom,
      });
      this.orbitRaf = requestAnimationFrame(step);
    };
    this.orbitRaf = requestAnimationFrame(step);
    this.cb.onFlyoverStateChange?.(true, {
      name: this.flyoverName,
      coords: this.flyoverCenter,
    });
  }

  stopOrbit() {
    this.orbitPending = false;
    this.orbiting = false;
    cancelAnimationFrame(this.orbitRaf);
  }

  stopFlyover() {
    this.stopOrbit();
    if (this.flyoverActive) {
      this.flyoverActive = false;
      this.flyoverCenter = null;
      this.flyoverName = null;
      this.cb.onFlyoverStateChange?.(false);
    }
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

  setWaypoints(waypointsArray = []) {
    this.clearWaypoints();
    if (!this.map || !Array.isArray(waypointsArray)) return;
    this.waypoints = waypointsArray;
    this.waypointMarkers = [];

    waypointsArray.forEach((wp, idx) => {
      const coords = wp.coordinates || (wp.lng != null && wp.lat != null ? [wp.lng, wp.lat] : null);
      if (!coords) return;
      const el = document.createElement('div');
      el.className = 'apple-dest-marker waypoint-marker';
      const icon = wp.icon || '📍';
      const stopNum = idx + 1;
      el.innerHTML = `
        <div class="dest-pin waypoint-pin">
          <span class="waypoint-pin-seq">${stopNum}</span>
          <span class="waypoint-pin-icon">${icon}</span>
        </div>
        <div class="dest-shadow"></div>
      `;
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(coords)
        .addTo(this.map);
      this.waypointMarkers.push(marker);
    });

    if (this.waypoints.length > 0) {
      const first = this.waypoints[0];
      const c = first.coordinates || [first.lng, first.lat];
      this.waypoint = { lng: c[0], lat: c[1], info: first };
    } else {
      this.waypoint = null;
    }
  }

  setWaypoint(coords, info = {}) {
    if (!coords) return;
    this.setWaypoints([{ coordinates: coords, ...info }]);
  }

  clearWaypoints() {
    if (this.waypointMarkers && this.waypointMarkers.length > 0) {
      this.waypointMarkers.forEach((m) => m.remove());
      this.waypointMarkers = [];
    }
    if (this.waypointMarker) {
      this.waypointMarker.remove();
      this.waypointMarker = null;
    }
    this.waypoints = [];
    this.waypoint = null;
  }

  clearWaypoint() {
    this.clearWaypoints();
  }

  clearDestination() {
    if (this.destMarker) {
      this.destMarker.remove();
      this.destMarker = null;
    }
    this.clearWaypoints();
    this.destination = null;
    this.clearRoute();
  }

  flyToDestination(coords) {
    if (!this.map || !coords) return;
    this.stopFlyover();
    this.setLocateMode('off');
    this.map.flyTo({
      center: coords,
      zoom: 15.6,
      pitch: 35,
      duration: 1600,
      padding: this.pad(),
    });
  }

  flyoverDestination(coords, { placeName = 'Destination' } = {}) {
    if (!this.map || !coords) return;
    this.stopFlyover();
    this.setLocateMode('off');
    this.is3D = true;
    this.applyTerrain();
    this.cb.on3D?.(true);
    this.orbitPending = true;
    this.flyoverCenter = coords;
    this.flyoverName = placeName;
    this.cb.onFlyoverStateChange?.(true, { name: placeName, coords });

    this.map.flyTo({
      center: coords,
      zoom: 16.6,
      pitch: 65,
      bearing: this.map.getBearing() - 35,
      duration: 2200,
      essential: true,
      curve: 1.4,
      padding: this.pad(),
    });
    this.map.once('moveend', () => {
      if (this.orbitPending && this.flyoverCenter) {
        this.startFlyoverOrbit(this.flyoverCenter);
      }
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
    if (Array.isArray(this.waypoints) && this.waypoints.length > 0) {
      this.waypoints.forEach((wp) => {
        const coords = wp.coordinates || (wp.lng != null && wp.lat != null ? [wp.lng, wp.lat] : null);
        if (coords) bounds.extend(coords);
      });
    } else if (this.waypoint && this.waypoint.lng && this.waypoint.lat) {
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
