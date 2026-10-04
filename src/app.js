import 'bootstrap/dist/css/bootstrap.min.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './atlas.css';
import { Toast } from 'bootstrap';
import { createIcons, MountainSnow, Mountain, Compass, Bookmark, BookOpen, ArrowUpRight, Search, X, SlidersHorizontal, Satellite, Plus, Minus, Scan, LocateFixed, Navigation2, Box, WifiOff, Map, ListFilter, MapPin, Route, ArrowRight, ArrowLeft, Download, ExternalLink, Sun, ShieldAlert, ChevronDown, Camera, Check, RotateCcw, Footprints, TriangleAlert } from 'lucide';
import { enrichPasses, enrichMountains, filterPasses, categories, formatElevation, routeUrl, validateRoute, directionsUrl, routeToGpx, getAccessDetails } from './domain.js';

const icons = { MountainSnow, Mountain, Compass, Bookmark, BookOpen, ArrowUpRight, Search, X, SlidersHorizontal, Satellite, Plus, Minus, Scan, LocateFixed, Navigation2, Box, WifiOff, Map, ListFilter, MapPin, Route, ArrowRight, ArrowLeft, Download, ExternalLink, Sun, ShieldAlert, ChevronDown, Camera, Check, RotateCcw, Footprints, TriangleAlert };
const element = selector => document.querySelector(selector);
const refreshIcons = () => createIcons({ icons, attrs: { 'aria-hidden': 'true' } });
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const icon = name => `<i data-lucide="${name}"></i>`;
const prayerFlagsHtml = () => `<div class="prayer-flags prayer-flags-strand" aria-hidden="true">${Array.from({ length: 2 }, () => ['blue', 'white', 'red', 'green', 'yellow'].map(color => `<span class="prayer-flag flag-${color}"></span>`).join('')).join('')}</div>`;
const state = { passes: [], mountains: [], kind: 'pass', selected: null, saved: [], route: null, routeStatus: 'idle', routeError: '', tab: 'overview', expanded: false };
let atlas;
let routeRequest;
const routeCache = new globalThis.Map();

function notify(message) {
  element('#toast-message').textContent = message;
  Toast.getOrCreateInstance(element('#app-toast'), { delay: 3500 }).show();
}

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem('passage:saved') || '[]');
    return Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : [];
  } catch { return []; }
}

function currentFilters() {
  return { query: element('#pass-search').value, region: element('#region-filter').value, category: element('#access-filter').value, minElevation: element('#elevation-filter').value, sort: element('#sort-select').value };
}

function currentCollection() {
  return state.kind === 'mountain' ? state.mountains : state.passes;
}

function setCollection(kind, resetMap = true) {
  routeRequest?.abort();
  setFiltersOpen(false);
  state.kind = kind;
  state.selected = null;
  state.route = null;
  state.routeStatus = 'idle';
  state.tab = 'overview';
  atlas?.clearRoute();
  atlas?.selectPass(null);
  const mountain = kind === 'mountain';
  const places = currentCollection();
  const regions = [...new Set(places.map(place => place.region))].sort();
  element('#region-filter').replaceChildren(new Option('All regions', ''));
  regions.forEach(region => element('#region-filter').add(new Option(region, region)));
  element('#total-count').textContent = places.length;
  element('#entry-type').textContent = mountain ? 'mountains' : 'passes';
  element('#region-count').textContent = regions.length;
  element('#highest-pass').innerHTML = `${Math.max(0, ...places.map(place => place.elevation || 0)).toLocaleString('en-IN')}<span> m</span>`;
  element('#directory-title').innerHTML = `${mountain ? 'Mountains' : 'Mountain passes'}<br /> of India<span class="accent-dot">.</span>`;
  element('#directory-eyebrow').textContent = mountain ? 'THE HIGHEST SUMMITS' : 'THE HIGHER WAY';
  element('.intro-caption').textContent = mountain ? 'The 50 highest major summits.' : 'The Himalaya. The Ghats. And in between.';
  element('#directory').setAttribute('aria-label', mountain ? 'Top 50 mountain directory' : 'Mountain pass directory');
  element('#pass-list').setAttribute('aria-label', mountain ? 'Top 50 mountains' : 'Passes');
  element('#pass-search').placeholder = mountain ? 'Find a mountain or range...' : 'Find a pass or region...';
  element('#pass-search').setAttribute('aria-label', mountain ? 'Search top 50 mountains, ranges or regions' : 'Search passes or regions');
  element('#sort-select').setAttribute('aria-label', mountain ? 'Sort mountains' : 'Sort passes');
  element('label[for="sort-select"]').textContent = mountain ? 'Sort mountains' : 'Sort passes';
  element('#sort-select').value = 'elevation';
  element('#access-filter').closest('label').hidden = mountain;
  element('#extra-filters').classList.toggle('mountain-filters', mountain);
  element('#mobile-collection').textContent = mountain ? 'Mountains' : 'Passes';
  element('#mobile-count').hidden = mountain;
  element('.map-legend').innerHTML = '<span><b class="legend-dot mountain"></b>Summit</span><span><b class="legend-dot road"></b>Road</span><span><b class="legend-dot trek"></b>Trek</span><span><b class="legend-dot restricted"></b>Restricted</span><span><b class="legend-dot unknown"></b>Unverified</span>';
  for (const [selector, active] of [['#passes-view', !mountain], ['#mountains-view', mountain]]) {
    element(selector).classList.toggle('active', active);
    element(selector).setAttribute('aria-pressed', String(active));
    element(selector).disabled = false;
  }
  const url = new URL(location.href);
  url.searchParams.set('view', mountain ? 'mountains' : 'passes');
  for (const parameter of ['pass', 'mountain', 'route']) url.searchParams.delete(parameter);
  history.replaceState(null, '', url);
  resetFilters();
  renderDetail();
  if (resetMap) atlas?.fitIndia();
}

function renderList() {
  const filters = currentFilters();
  const passes = filterPasses(currentCollection(), filters);
  const mountain = state.kind === 'mountain';
  element('#results-count').textContent = mountain ? `${passes.length} of 50 mountains` : `${passes.length} pass${passes.length === 1 ? '' : 'es'}`;
  element('#mobile-count').textContent = passes.length;
  element('#clear-search').hidden = !filters.query;
  const filterCount = [filters.region, filters.category, Number(filters.minElevation) > 0].filter(Boolean).length;
  element('#filter-dot').hidden = filterCount === 0;
  const filterLabel = filterCount ? `Filters (${filterCount} active)` : 'Filters';
  element('#filter-toggle').title = filterLabel;
  element('#filter-toggle').setAttribute('aria-label', filterLabel);
  element('#map-subtitle').textContent = `${state.passes.filter(pass => pass.coordinates).length} passes / ${state.mountains.filter(mountain => mountain.coordinates).length} summits`;
  element('#pass-list').innerHTML = passes.length ? passes.map(pass => `<button class="pass-row ${mountain ? 'mountain-row' : ''} ${pass.id === state.selected?.id ? 'selected' : ''}" data-pass="${escapeHtml(pass.id)}" aria-pressed="${pass.id === state.selected?.id}" aria-label="${escapeHtml(`${pass.name}, ${pass.region}, ${formatElevation(pass.elevation)}`)}"><span class="pass-symbol">${mountain ? String(pass.atlasRank).padStart(2, '0') : icon(pass.category === 'trek' ? 'footprints' : 'mountain')}</span><span class="pass-row-copy"><span class="pass-name">${escapeHtml(pass.name)}</span><span class="pass-region"><span class="category-dot" style="background:${categories[pass.category].color}"></span>${escapeHtml(pass.region)}</span></span><span class="pass-elevation">${pass.elevation === null ? '--' : pass.elevation.toLocaleString('en-IN')}<small>${pass.elevation === null ? 'not listed' : 'METRES'}</small>${state.saved.includes(pass.id) ? icon('bookmark') : ''}</span></button>`).join('') : `<div class="list-empty">${icon('search')}<strong>No ${mountain ? 'mountains' : 'passes'} found</strong><p>Try a different name or region.</p><button class="text-button" data-action="reset-filters">Reset filters</button></div>`;
  refreshIcons();
}

function selectedDescription(pass) {
  if (pass.route?.description) return pass.route.description;
  if (pass.connection && pass.connection.length < 190) return pass.connection;
  return `A ${pass.category === 'trek' ? 'high-altitude trekking' : 'mountain'} crossing listed in ${pass.region}. ${pass.category === 'restricted' ? 'Access to this sensitive area is restricted and subject to authorization.' : 'Detailed geography and source notes are available in the linked article.'}`;
}

function overviewHtml(pass) {
  const category = categories[pass.category];
  const warning = !pass.coordinates ? 'No coordinates in the linked source. This pass is retained in the directory but is not plotted.' : pass.approximate ? 'Approximate area location from the source article, not a surveyed pass summit.' : pass.route?.note || (pass.category === 'trek' ? 'Not a driving route. High-altitude trekking requires suitable expertise, equipment and local guidance.' : pass.category === 'restricted' ? 'Restricted area. Confirm permits and eligibility with the relevant authorities. No public road route is assumed.' : 'Not a live access report. Verify local weather, permits and road conditions before travelling.');
  return `<div class="detail-stats"><div><span class="stat-label">${icon('mountain')} SOURCE ELEVATION</span><span class="stat-value">${formatElevation(pass.elevation)}</span></div><div><span class="stat-label">${icon('compass')} ACCESS TYPE</span><span class="stat-value access"><b class="category-dot" style="background:${category.color}"></b>${category.label}</span></div></div><p class="detail-description">${escapeHtml(selectedDescription(pass))}</p>${pass.route?.season ? `<div class="season-row">${icon('sun')}${escapeHtml(pass.route.season)}</div>` : ''}<div class="access-note">${icon('shield-alert')}<span>${escapeHtml(warning)}</span></div>`;
}

function routeHtml(pass) {
  const stops = pass.route ? `<ol class="route-stops"><li>${escapeHtml(pass.route.start[0])}<small>START</small></li><li class="pass-stop">${escapeHtml(pass.name)}<small>${pass.route.end ? 'VIA THE PASS' : 'INDIAN-SIDE APPROACH'}</small></li>${pass.route.end ? `<li>${escapeHtml(pass.route.end[0])}<small>DESTINATION</small></li>` : ''}</ol>` : '';
  if (state.routeStatus === 'loading') return `${stops}<div class="route-loading"><span class="spinner-border spinner-border-sm"></span>Finding the pass road...</div>`;
  if (state.routeStatus === 'error') return `${stops}<div class="route-error" role="status">${icon('triangle-alert')}${escapeHtml(state.routeError)}</div><div class="access-links"><button class="btn" data-action="route">${icon('rotate-ccw')}Retry road route</button>${pass.route ? `<a class="text-button" href="${directionsUrl(pass)}" target="_blank" rel="noopener noreferrer">Check in Google Maps ${icon('arrow-up-right')}</a>` : ''}</div>`;
  if (!state.route) {
    const access = getAccessDetails(pass);
    const mapUrl = pass.route?.area ? directionsUrl(pass) : access.locationUrl;
    const mapLabel = pass.route?.area ? 'Open road corridor' : pass.approximate ? 'View approximate area' : 'View location in Google Maps';
    return `<section class="access-details" aria-labelledby="access-heading"><h3 id="access-heading" tabindex="-1">${icon(pass.category === 'trek' ? 'footprints' : 'shield-alert')}${escapeHtml(access.title)}</h3><p class="detail-description">${escapeHtml(access.reason)}</p><div class="access-note">${icon('shield-alert')}<span>${escapeHtml(access.guidance)}</span></div><div class="access-links">${mapUrl ? `<a class="btn" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer">${icon('map-pin')}${mapLabel}${icon('arrow-up-right')}</a>` : ''}<a class="text-button" href="${escapeHtml(pass.sourceUrl)}" target="_blank" rel="noopener noreferrer">Read source article ${icon('arrow-up-right')}</a></div></section>`;
  }
  const route = state.route;
  const minutes = Math.round(route.duration / 60);
  const duration = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  const steps = route.legs.flatMap(leg => leg.steps || []).filter(step => step.distance > 10);
  return `${stops}<div class="route-stat-grid"><div><strong>${(route.distance / 1000).toFixed(1)} <small>km</small></strong><small>ROAD DISTANCE</small></div><div><strong>${duration}</strong><small>MODEL ESTIMATE</small></div></div><div class="route-success">${icon('check')}Route approaches the sourced pass location</div><p class="detail-description">${escapeHtml(pass.route.road)}. Road access and current conditions are not verified.</p>${steps.length ? `<details class="route-steps"><summary>Road directions <span>(${steps.length})</span></summary><ol>${steps.map(step => `<li>${escapeHtml(step.maneuver.type === 'depart' ? 'Depart' : step.maneuver.type === 'arrive' ? 'Arrive' : `${step.maneuver.type}${step.maneuver.modifier ? ` ${step.maneuver.modifier}` : ''}`)}${step.name ? ` - ${escapeHtml(step.name)}` : ''}<span>${step.distance < 1000 ? `${Math.round(step.distance)} m` : `${(step.distance / 1000).toFixed(1)} km`}</span></li>`).join('')}</ol></details>` : ''}<div class="access-note">${icon('shield-alert')}<span>${escapeHtml(pass.route.note || 'Confirm weather, closures and permits locally. Estimated time excludes stops and delays.')}</span></div><div class="route-tools"><button class="btn" data-action="download">${icon('download')}GPX</button><a class="btn" href="${directionsUrl(pass)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}Google Maps</a></div>`;
}

function mountainDetailHtml(mountain) {
  const saved = state.saved.includes(mountain.id);
  return `${mountain.image ? `<figure class="detail-photo"><img src="${escapeHtml(mountain.image)}" alt="${escapeHtml(mountain.name)}" /><a href="${escapeHtml(mountain.imageSource || mountain.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="photo-credit">${icon('camera')}Photo &amp; credit ${icon('arrow-up-right')}</a></figure>` : ''}
    <div class="detail-header"><span class="eyebrow">SUMMIT / ${String(mountain.atlasRank).padStart(2, '0')}</span><h2>${escapeHtml(mountain.name)}</h2><span class="detail-region">${icon('map-pin')}${escapeHtml(mountain.region)}</span><div class="detail-top-actions"><button class="icon-button detail-expand" data-action="expand" title="${state.expanded ? 'Collapse' : 'Expand'} summit details" aria-label="${state.expanded ? 'Collapse' : 'Expand'} summit details" aria-expanded="${state.expanded}">${icon('chevron-down')}</button><button class="icon-button" data-action="close" title="Close summit details" aria-label="Close summit details">${icon('x')}</button></div></div>
    <div class="detail-content"><div class="detail-body"><div class="detail-stats"><div><span class="stat-label">${icon('mountain-snow')} ELEVATION</span><span class="stat-value">${formatElevation(mountain.elevation)}</span></div><div><span class="stat-label">NATIONAL RANK</span><span class="stat-value">${mountain.rank}<small class="rank-total"> / 50</small></span></div></div><dl class="mountain-facts"><div><dt>Range</dt><dd>${escapeHtml(mountain.range || 'Not listed')}</dd></div><div><dt>Prominence</dt><dd>${formatElevation(mountain.prominence ?? null)}</dd></div></dl><div class="access-note">${icon('shield-alert')}<span>Summit access may be restricted or prohibited. Confirm permits and climbing regulations with local authorities. No driving route to the summit is offered.${mountain.coordinates ? '' : ' No coordinates are available in the source.'}</span></div></div></div>
    <div class="detail-actions"><a class="btn btn-primary primary-action summit-source" href="${escapeHtml(mountain.sourceUrl)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}Summit article</a><button class="btn btn-primary primary-action summit-open" data-action="summit-details" aria-expanded="${state.expanded}">${icon('mountain-snow')}Summit details</button><button class="icon-button save-pass" data-action="save" title="${saved ? 'Unsave' : 'Save'} ${escapeHtml(mountain.name)}" aria-label="${saved ? 'Unsave' : 'Save'} ${escapeHtml(mountain.name)}" aria-pressed="${saved}">${icon('bookmark')}</button></div><div class="detail-footer"><span>${mountain.coordinates ? `${mountain.coordinates[1].toFixed(3)} N, ${mountain.coordinates[0].toFixed(3)} E` : 'Location not sourced'}</span><a href="${escapeHtml(mountain.sourceUrl)}" target="_blank" rel="noopener noreferrer">Wikipedia ${icon('arrow-up-right')}</a></div>`;
}

function renderDetail() {
  const pass = state.selected;
  const panel = element('#pass-detail');
  if (!pass) { panel.hidden = true; return; }
  panel.hidden = false;
  panel.classList.toggle('expanded', state.expanded);
  panel.setAttribute('aria-label', `Selected ${pass.kind === 'mountain' ? 'mountain' : 'pass'} details`);
  if (pass.kind === 'mountain') {
    panel.innerHTML = mountainDetailHtml(pass);
    panel.querySelector('.detail-header').insertAdjacentHTML('beforebegin', prayerFlagsHtml());
    refreshIcons();
    panel.querySelector('img')?.addEventListener('error', event => { event.target.closest('figure').hidden = true; }, { once: true });
    return;
  }
  const sourceCoordinate = pass.coordinates ? `${pass.approximate ? '~ ' : ''}${pass.coordinates[1].toFixed(3)} N, ${pass.coordinates[0].toFixed(3)} E` : 'Location not sourced';
  const canRoute = Boolean(routeUrl(pass));
  const routeOpen = state.tab === 'route';
  const actionLabel = routeOpen ? 'Back to overview' : !canRoute ? 'Access details' : state.routeStatus === 'error' ? 'Retry road route' : state.route ? 'View road route' : 'Trace road route';
  panel.innerHTML = `${pass.image && !routeOpen ? `<figure class="detail-photo"><img src="${escapeHtml(pass.image)}" alt="${escapeHtml(pass.name)} mountain landscape" /><span class="photo-label">${icon('map-pin')}${escapeHtml(pass.region.toUpperCase())}</span><a href="${escapeHtml(pass.imageSource)}" target="_blank" rel="noopener noreferrer" class="photo-credit">${icon('camera')}Photo &amp; credit ${icon('arrow-up-right')}</a></figure>` : ''}
    <div class="detail-header"><span class="eyebrow">${routeOpen ? canRoute ? 'THE ROAD THROUGH' : 'ACCESS AT THE PASS' : 'A PASS WORTH KNOWING'}</span><h2>${escapeHtml(pass.name)}</h2><span class="detail-region">${icon('map-pin')}${escapeHtml(pass.region)}, India</span><div class="detail-top-actions"><button class="icon-button detail-expand" data-action="expand" title="${state.expanded ? 'Collapse' : 'Expand'} pass details" aria-label="${state.expanded ? 'Collapse' : 'Expand'} pass details" aria-expanded="${state.expanded}">${icon('chevron-down')}</button><button class="icon-button" data-action="close" title="Close pass details" aria-label="Close pass details">${icon('x')}</button></div></div>
    <div class="detail-content"><div class="detail-tabs" role="tablist" aria-label="Pass information"><button data-action="overview" id="overview-tab" role="tab" aria-controls="detail-tabpanel" aria-selected="${!routeOpen}" class="${!routeOpen ? 'active' : ''}">Overview</button><button data-action="route" id="route-tab" role="tab" aria-controls="detail-tabpanel" aria-selected="${routeOpen}" class="${routeOpen ? 'active' : ''}">${canRoute ? 'Route' : 'Access'}</button></div><div class="detail-body" id="detail-tabpanel" role="tabpanel" aria-labelledby="${state.tab}-tab">${!routeOpen ? overviewHtml(pass) : routeHtml(pass)}</div></div>
    <div class="detail-actions"><button class="btn btn-primary primary-action" data-action="${routeOpen ? 'overview' : 'route'}">${icon(routeOpen ? 'arrow-left' : canRoute ? 'route' : 'book-open')}${actionLabel}${!routeOpen ? icon('arrow-right') : ''}</button><button class="icon-button save-pass" data-action="save" title="${state.saved.includes(pass.id) ? 'Unsave' : 'Save'} ${escapeHtml(pass.name)}" aria-label="${state.saved.includes(pass.id) ? 'Unsave' : 'Save'} ${escapeHtml(pass.name)}" aria-pressed="${state.saved.includes(pass.id)}">${icon('bookmark')}</button></div>
    <div class="detail-footer"><span>${sourceCoordinate}</span><a href="${escapeHtml(pass.sourceUrl)}" target="_blank" rel="noopener noreferrer">Wikipedia ${icon('arrow-up-right')}</a></div>`;
  panel.querySelector('.detail-header').insertAdjacentHTML('beforebegin', prayerFlagsHtml());
  refreshIcons();
  panel.querySelector('img')?.addEventListener('error', event => { event.target.closest('figure').hidden = true; }, { once: true });
}

function setMobileView(directory) {
  document.body.classList.toggle('show-directory', directory);
  element('#mobile-map').classList.toggle('active', !directory);
  element('#mobile-list').classList.toggle('active', directory);
  element('#mobile-map').setAttribute('aria-pressed', String(!directory));
  element('#mobile-list').setAttribute('aria-pressed', String(directory));
  if (!directory) atlas?.map.resize();
}

function selectPass(id, focus = true) {
  const pass = [...state.passes, ...state.mountains].find(pass => pass.id === id);
  if (!pass) return;
  if (state.kind !== pass.kind) setCollection(pass.kind, false);
  routeRequest?.abort();
  state.selected = pass;
  state.route = null;
  state.routeStatus = 'idle';
  state.tab = 'overview';
  state.expanded = false;
  atlas?.clearRoute();
  atlas?.selectPass(pass, focus);
  const url = new URL(location.href);
  url.searchParams.delete(pass.kind === 'mountain' ? 'pass' : 'mountain');
  url.searchParams.set(pass.kind === 'mountain' ? 'mountain' : 'pass', id);
  url.searchParams.delete('route');
  history.replaceState(null, '', url);
  setMobileView(false);
  renderList();
  renderDetail();
}

async function traceRoute() {
  const pass = state.selected;
  if (!pass) return;
  state.tab = 'route';
  state.expanded = true;
  const requestUrl = routeUrl(pass);
  if (!requestUrl) {
    renderDetail();
    element('#pass-detail').scrollTop = 0;
    element('#access-heading')?.focus({ preventScroll: true });
    return;
  }
  if (state.routeStatus === 'loading') { renderDetail(); return; }
  if (routeCache.has(pass.id)) {
    state.route = routeCache.get(pass.id);
    state.routeStatus = 'ready';
    atlas?.showRoute(state.route, pass);
    renderDetail();
    return;
  }
  routeRequest?.abort();
  const controller = new AbortController();
  routeRequest = controller;
  state.routeStatus = 'loading';
  state.route = null;
  renderDetail();
  try {
    const response = await fetch(requestUrl, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(18000)]) });
    if (!response.ok) throw new Error('The public routing service is unavailable. Please try again.');
    const route = validateRoute(await response.json(), pass);
    if (controller.signal.aborted || state.selected?.id !== pass.id) return;
    state.route = route;
    state.routeStatus = 'ready';
    routeCache.set(pass.id, route);
    atlas?.showRoute(route, pass);
    const url = new URL(location.href);
    url.searchParams.set('route', '1');
    history.replaceState(null, '', url);
  } catch (error) {
    if (controller.signal.aborted || state.selected?.id !== pass.id) return;
    state.routeStatus = 'error';
    state.routeError = error.name === 'TimeoutError' || error instanceof TypeError ? 'The road routing service could not be reached. Check your connection and try again.' : error.message;
    atlas?.clearRoute();
  }
  renderDetail();
}

function setFiltersOpen(open, restoreFocus = false) {
  element('#extra-filters').hidden = !open;
  element('#filter-toggle').setAttribute('aria-expanded', String(open));
  if (open) element('#region-filter').focus();
  else if (restoreFocus) element('#filter-toggle').focus();
}

function resetFilters() {
  element('#pass-search').value = '';
  element('#region-filter').value = '';
  element('#access-filter').value = '';
  element('#elevation-filter').value = '0';
  renderList();
}

function toggleSaved() {
  if (!state.selected) return;
  const id = state.selected.id;
  const saved = state.saved.includes(id);
  state.saved = saved ? state.saved.filter(savedId => savedId !== id) : [...state.saved, id];
  let persistent = true;
  try { localStorage.setItem('passage:saved', JSON.stringify(state.saved)); }
  catch { persistent = false; }
  renderList();
  renderDetail();
  notify(persistent ? `${state.selected.name} ${saved ? 'removed from' : 'added to'} saved places.` : 'Saved for this session only. Browser storage is unavailable.');
}

element('#pass-detail').addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'summit-details') { state.expanded = true; renderDetail(); }
  if (action === 'route') traceRoute();
  if (action === 'overview') { state.tab = 'overview'; renderDetail(); element('#pass-detail').scrollTop = 0; }
  if (action === 'save') toggleSaved();
  if (action === 'expand') { state.expanded = !state.expanded; renderDetail(); }
  if (action === 'close') {
    routeRequest?.abort();
    state.selected = null;
    state.route = null;
    state.routeStatus = 'idle';
    atlas?.selectPass(null);
    atlas?.clearRoute();
    const url = new URL(location.href);
    for (const parameter of ['pass', 'mountain', 'route']) url.searchParams.delete(parameter);
    history.replaceState(null, '', url);
    renderDetail();
    renderList();
  }
  if (action === 'download' && state.route) {
    const url = URL.createObjectURL(new Blob([routeToGpx(state.route, state.selected)], { type: 'application/gpx+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.selected.id}-road-route.gpx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Road route exported as GPX. Verify conditions before travelling.');
  }
});
element('#pass-list').addEventListener('click', event => {
  const pass = event.target.closest('[data-pass]');
  if (pass) selectPass(pass.dataset.pass);
  if (event.target.closest('[data-action="reset-filters"]')) resetFilters();
});
element('#pass-search').addEventListener('input', renderList);
for (const selector of ['#region-filter', '#access-filter', '#elevation-filter', '#sort-select']) element(selector).addEventListener('change', renderList);
element('#clear-search').addEventListener('click', () => { element('#pass-search').value = ''; renderList(); element('#pass-search').focus(); });
element('#filter-toggle').addEventListener('click', () => setFiltersOpen(element('#extra-filters').hidden));
element('#close-filters').addEventListener('click', () => setFiltersOpen(false, true));
for (const eventName of ['pointerdown', 'focusin']) document.addEventListener(eventName, event => {
  if (!element('#extra-filters').hidden && !event.target.closest('.directory-filters')) setFiltersOpen(false);
});
element('#reset-filters').addEventListener('click', resetFilters);
element('#passes-view').addEventListener('click', () => setCollection('pass'));
element('#mountains-view').addEventListener('click', () => setCollection('mountain'));
element('#mobile-list').addEventListener('click', () => setMobileView(true));
element('#mobile-map').addEventListener('click', () => setMobileView(false));
element('#zoom-in').addEventListener('click', () => atlas?.map.zoomIn());
element('#zoom-out').addEventListener('click', () => atlas?.map.zoomOut());
element('#reset-map').addEventListener('click', () => atlas?.fitIndia());
element('#north-map').addEventListener('click', () => atlas?.map.resetNorth());
element('#locate-pass').addEventListener('click', () => atlas?.focusSelected());
element('#retry-map').addEventListener('click', () => location.reload());
for (const [selector, satellite] of [['#terrain-style', false], ['#satellite-style', true]]) element(selector).addEventListener('click', () => {
  atlas?.setStyle(satellite);
  element('#terrain-style').classList.toggle('active', !satellite);
  element('#satellite-style').classList.toggle('active', satellite);
  element('#terrain-style').setAttribute('aria-pressed', String(!satellite));
  element('#satellite-style').setAttribute('aria-pressed', String(satellite));
});
for (const [selector, enabled] of [['#view-2d', false], ['#view-3d', true]]) element(selector).addEventListener('click', () => {
  atlas?.set3d(enabled);
  element('#view-2d').classList.toggle('active', !enabled);
  element('#view-3d').classList.toggle('active', enabled);
  element('#view-2d').setAttribute('aria-pressed', String(!enabled));
  element('#view-3d').setAttribute('aria-pressed', String(enabled));
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) { event.preventDefault(); setMobileView(true); element('#pass-search').focus(); }
  if (event.key === 'Escape' && !element('#extra-filters').hidden) { event.preventDefault(); setFiltersOpen(false, true); return; }
  if (event.key === 'Escape') { setMobileView(false); if (state.expanded) { state.expanded = false; renderDetail(); } }
});
window.addEventListener('storage', event => { if (event.key === 'passage:saved') { state.saved = readSaved(); renderList(); renderDetail(); } });
refreshIcons();

async function initialize() {
  try {
    const responses = await Promise.all([fetch('/data/passes.json'), fetch('/data/mountains.json')]);
    if (responses.some(response => !response.ok)) throw new Error('Atlas data could not be loaded.');
    const [data, mountainData] = await Promise.all(responses.map(response => response.json()));
    state.passes = enrichPasses(data.passes);
    state.mountains = enrichMountains(mountainData.mountains);
    const places = [...state.passes, ...state.mountains];
    state.saved = readSaved().filter(id => places.some(place => place.id === id));
    const params = new URLSearchParams(location.search);
    const requested = places.find(place => place.id === params.get('mountain') || place.id === params.get('pass'));
    setCollection(requested?.kind || (params.get('view') === 'mountains' ? 'mountain' : 'pass'));
    if (requested) selectPass(requested.id, false);
    try {
      const { createAtlasMap } = await import('./atlas-map.js');
      atlas = createAtlasMap(places, selectPass, notify);
      atlas.selectPass(state.selected, false);
      if (params.get('route') === '1' && state.selected?.kind === 'pass') traceRoute();
    } catch (error) {
      console.error('Map initialization:', error);
      element('#map-error').hidden = false;
      element('#map-status').hidden = true;
    }
  } catch (error) {
    element('#pass-list').innerHTML = `<div class="list-empty"><strong>The atlas could not be loaded.</strong><p>${escapeHtml(error.message)}</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div>`;
    element('#results-count').textContent = 'Data unavailable';
    element('#map-status').hidden = true;
  }
}

initialize();