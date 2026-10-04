import * as maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { categories } from './domain.js';

const emptyCollection = { type: 'FeatureCollection', features: [] };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function passFeature(pass) {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: pass.coordinates }, properties: { id: pass.id, name: pass.name, color: categories[pass.category].color } };
}

export function createAtlasMap(passes, onSelect, notify) {
  const container = document.querySelector('#map');
  let currentPass;
  let focusSelectionOnLoad = false;
  let selectedMarker;
  let endpointMarkers = [];
  let terrain = false;
  let loaded = false;
  const meshes = new Map();
  const raycaster = new THREE.Raycaster();
  const map = new maplibregl.Map({
    container, center: [80, 23], zoom: 4, minZoom: 2, maxZoom: 16, maxPitch: 70,
    canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
    attributionControl: { compact: true },
    style: {
      version: 8,
      sources: {
        terrain: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18, attribution: 'Tiles &copy; Esri &mdash; Sources: Esri, USGS, NOAA, &copy; OpenStreetMap contributors' },
        satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' },
        elevation: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium', maxzoom: 14, attribution: 'Terrain: Mapzen, AWS Open Data' },
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#e0e8e5' } },
        { id: 'terrain-base', type: 'raster', source: 'terrain', paint: { 'raster-saturation': -0.52, 'raster-contrast': -0.07, 'raster-brightness-min': 0.08 } },
        { id: 'satellite-base', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
      ],
    },
  });

  const attribution = container.querySelector('.maplibregl-ctrl-attrib');
  attribution.classList.add('maplibregl-compact');
  attribution.classList.remove('maplibregl-compact-show');
  attribution.removeAttribute('open');
  const infoButton = attribution.querySelector('summary');
  infoButton.title = 'Map information';
  infoButton.setAttribute('aria-label', 'Map information');

  function padding() {
    if (innerWidth <= 760) return { top: 85, bottom: currentPass ? 235 : 125, left: 28, right: 28 };
    return { top: 85, bottom: 100, left: 75, right: currentPass ? 340 : 55 };
  }

  function fitIndia(duration = 900) {
    map.fitBounds([[67.7, 6.6], [98.2, 37.5]], { padding: padding(), duration: reducedMotion ? 0 : duration, pitch: terrain ? 35 : 0, bearing: 0 });
  }

  const threeLayer = {
    id: 'three-pass-markers', type: 'custom', renderingMode: '3d',
    onAdd(mapInstance, context) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.scene.add(new THREE.AmbientLight(0xffffff, 2.2));
      const light = new THREE.DirectionalLight(0xffffff, 2.5);
      light.position.set(-1, -2, 4);
      this.scene.add(light);
      this.geometry = new THREE.ConeGeometry(0.85, 2.2, 4);
      for (const pass of passes.filter(pass => pass.coordinates)) {
        const material = new THREE.MeshStandardMaterial({ color: categories[pass.category].color, roughness: 0.75, metalness: 0, flatShading: true });
        const mesh = new THREE.Mesh(this.geometry, material);
        mesh.rotation.x = Math.PI / 2;
        mesh.rotation.y = Math.PI / 4;
        mesh.userData.pass = pass;
        this.scene.add(mesh);
        meshes.set(pass.id, mesh);
      }
      this.renderer = new THREE.WebGLRenderer({ canvas: mapInstance.getCanvas(), context, antialias: true });
      this.renderer.autoClear = false;
      this.frames = 0;
    },
    render(context, args) {
      this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix);
      const size = (terrain ? 11 : 7) / (512 * 2 ** map.getZoom());
      for (const [id, mesh] of meshes) {
        const pass = mesh.userData.pass;
        const altitude = terrain ? map.queryTerrainElevation(pass.coordinates) || 0 : 0;
        const location = maplibregl.MercatorCoordinate.fromLngLat(pass.coordinates, altitude);
        const selected = id === currentPass?.id;
        const pulse = selected && terrain && !reducedMotion ? 1 + Math.sin(performance.now() / 550) * 0.09 : 1;
        mesh.scale.setScalar(size * (selected ? 1.45 : 1) * pulse);
        mesh.position.set(location.x, location.y, location.z + size * 1.1);
        mesh.material.color.set(selected ? '#e18355' : categories[pass.category].color);
      }
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.frames++;
      container.dataset.threeFrames = String(this.frames);
      if (terrain && !reducedMotion) map.triggerRepaint();
    },
    onRemove() {
      this.geometry.dispose();
      for (const mesh of meshes.values()) mesh.material.dispose();
      this.renderer.dispose();
    },
  };

  function pickPass(screenPoint) {
    if (!threeLayer.frames) return null;
    const canvas = map.getCanvas();
    const horizontal = screenPoint.x / canvas.clientWidth * 2 - 1;
    const vertical = 1 - screenPoint.y / canvas.clientHeight * 2;
    const inverseProjection = threeLayer.camera.projectionMatrix.clone().invert();
    const near = new THREE.Vector3(horizontal, vertical, -1).applyMatrix4(inverseProjection);
    const far = new THREE.Vector3(horizontal, vertical, 1).applyMatrix4(inverseProjection);
    raycaster.set(near, far.sub(near).normalize());
    const hit = raycaster.intersectObjects([...meshes.values()], false)[0];
    if (hit) return hit.object.userData.pass;
    let nearest = null;
    let nearestDistance = 18;
    for (const mesh of meshes.values()) {
      const projected = mesh.position.clone().project(threeLayer.camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const horizontalDistance = (projected.x + 1) * canvas.clientWidth / 2 - screenPoint.x;
      const verticalDistance = (1 - projected.y) * canvas.clientHeight / 2 - screenPoint.y;
      const distance = Math.hypot(horizontalDistance, verticalDistance);
      if (distance < nearestDistance) {
        nearest = mesh.userData.pass;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  map.on('load', () => {
    loaded = true;
    map.addSource('route', { type: 'geojson', data: emptyCollection });
    map.addLayer({ id: 'route-outline', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.9 } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#236e59', 'line-width': 4 } });
    map.addSource('passes', { type: 'geojson', data: { type: 'FeatureCollection', features: passes.filter(pass => pass.coordinates).map(passFeature) } });
    map.addLayer(threeLayer);
    map.addLayer({ id: 'pass-dots', type: 'circle', source: 'passes', paint: { 'circle-radius': 4, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } });
    map.on('click', event => {
      if (event.originalEvent.target.closest('button, .maplibregl-ctrl')) return;
      const pass = pickPass(event.point);
      if (pass) onSelect(pass.id, map.getZoom() < 6);
    });
    map.on('mousemove', event => { map.getCanvas().style.cursor = pickPass(event.point) ? 'pointer' : ''; });
    map.getCanvas().addEventListener('mouseleave', () => { map.getCanvas().style.cursor = ''; });
    container.dataset.ready = 'true';
    document.querySelector('#map-status').hidden = true;
    fitIndia(0);
    if (currentPass) selectPass(currentPass, focusSelectionOnLoad);
  });
  map.on('error', event => {
    if (event.error?.message?.includes('AJAXError') || event.error?.status) {
      document.querySelector('#map-status').hidden = false;
      document.querySelector('#map-status').textContent = 'Some map tiles are unavailable. Check your connection.';
    }
  });
  map.on('move', () => {
    const center = map.getCenter();
    document.querySelector('#map-coordinate').textContent = `${Math.abs(center.lat).toFixed(4)} ${center.lat < 0 ? 'S' : 'N'}, ${Math.abs(center.lng).toFixed(4)} ${center.lng < 0 ? 'W' : 'E'}`;
    document.querySelector('#north-map svg').style.transform = `rotate(${-map.getBearing()}deg)`;
  });
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');

  function selectPass(pass, focus = false) {
    currentPass = pass;
    if (!loaded) focusSelectionOnLoad = focus;
    selectedMarker?.remove();
    selectedMarker = null;
    if (loaded && pass?.coordinates) {
      const marker = document.createElement('button');
      marker.className = 'selected-map-marker';
      marker.setAttribute('aria-label', `View ${pass.name}`);
      const dot = document.createElement('span');
      dot.className = 'selected-map-dot';
      const label = document.createElement('span');
      label.className = 'selected-map-label';
      label.textContent = pass.name;
      marker.append(dot, label);
      marker.addEventListener('click', () => onSelect(pass.id, false));
      selectedMarker = new maplibregl.Marker({ element: marker, anchor: 'left', offset: [-9, 0] }).setLngLat(pass.coordinates).addTo(map);
      if (focus) map.flyTo({ center: pass.coordinates, zoom: 8.4, padding: padding(), pitch: terrain ? 55 : 0, duration: reducedMotion ? 0 : 1300 });
    }
    map.triggerRepaint();
  }

  function clearRoute() {
    map.getSource('route')?.setData(emptyCollection);
    endpointMarkers.forEach(marker => marker.remove());
    endpointMarkers = [];
  }

  function showRoute(route, pass) {
    if (!loaded) { map.once('load', () => showRoute(route, pass)); return; }
    clearRoute();
    map.getSource('route').setData({ type: 'Feature', geometry: route.geometry, properties: {} });
    const bounds = new maplibregl.LngLatBounds();
    route.geometry.coordinates.forEach(coordinate => bounds.extend(coordinate));
    const endpoints = [[pass.route.start[0], route.geometry.coordinates[0]]];
    if (pass.route.end) endpoints.push([pass.route.end[0], route.geometry.coordinates.at(-1)]);
    endpointMarkers = endpoints.map(([name, coordinates]) => {
      const element = document.createElement('span');
      element.className = 'route-endpoint';
      element.textContent = name;
      return new maplibregl.Marker({ element, anchor: 'bottom', offset: [0, -8] }).setLngLat(coordinates).addTo(map);
    });
    map.fitBounds(bounds, { padding: padding(), maxZoom: 11, pitch: terrain ? 50 : 0, duration: reducedMotion ? 0 : 1400 });
  }

  return {
    map, selectPass, clearRoute, showRoute, fitIndia,
    setStyle(satellite) {
      if (!loaded) return;
      map.setLayoutProperty('satellite-base', 'visibility', satellite ? 'visible' : 'none');
    },
    set3d(enabled) {
      if (!loaded) return;
      terrain = enabled;
      map.setTerrain(enabled ? { source: 'elevation', exaggeration: 1.15 } : null);
      map.setLayoutProperty('pass-dots', 'visibility', enabled ? 'none' : 'visible');
      if (enabled && currentPass?.coordinates) selectPass(currentPass, true);
      else map.easeTo({ pitch: enabled ? 55 : 0, bearing: enabled ? -12 : 0, duration: reducedMotion ? 0 : 1000 });
      container.dataset.dimension = enabled ? '3d' : '2d';
      map.triggerRepaint();
    },
    focusSelected() { if (currentPass?.coordinates) selectPass(currentPass, true); else notify('This entry has no sourced coordinates.'); },
  };
}