import { point, lineString } from '@turf/helpers';
import { pointToLineDistance } from '@turf/point-to-line-distance';

export const categories = {
  road: { label: 'Road pass', color: '#257268' },
  trek: { label: 'Trekking pass', color: '#b88632' },
  restricted: { label: 'Restricted access', color: '#c05e51' },
  unknown: { label: 'Access unverified', color: '#7c8787' },
  mountain: { label: 'Mountain summit', color: '#527a9f' },
};

const trekking = new Set(["Auden's Col", 'Debsa Pass', 'Goecha La', 'Indrahar Pass', 'Kalindi Pass', 'Lamkhaga Pass', 'Sasser Pass', 'Sin La', "Traill's Pass"]);
const restricted = new Set(['Bilafond La', 'Bum La Pass', 'Diphu Pass (Dipher Pass)', 'Dongkhala', 'Gyong La', 'Imis La', 'Jelep La', 'Karakoram Pass (Qara Tagh La)', 'Kongka Pass', 'Lipulekh Pass', 'Mana Pass', 'Marsimik La', 'Nama Pass', 'Nathu La', 'Niti Pass', 'Pangsau Pass', 'Rezang La', 'Shipki La', 'Sia La', 'Spangur Gap', 'Umling La']);
const roadNames = new Set(['Banihal Pass', 'Bara-lacha-la', 'Bomdila', 'Changla Pass', 'Chanshal Pass', 'Fotu La', 'Haldighati Pass', 'Sach Pass', 'Jalori Pass', 'Khardung La', 'Kunzum Pass', 'Lungalacha La', 'Mayodia Pass', 'Namika La', 'Palakkad Gap', 'Pensi La', 'Pir-Panjal Pass', 'Rohtang Pass', 'Sela Pass', 'Sengottai', 'Shingo La', 'Tanglang La (Thang La)', 'Thamarassery', 'Zojila Pass']);

const routes = {
  'Khardung La': { start: ['Leh', 77.5771, 34.1526], end: ['Khalsar', 77.6428, 34.5786], road: 'Khardung La Road', season: 'Usually May - October', description: 'Above Leh, the road climbs into the Ladakh Range before descending toward the Shyok and Nubra valleys.', note: 'Check Ladakh permits and local traffic advisories. Snow can close the pass at any time.' },
  'Rohtang Pass': { start: ['Manali', 77.1892, 32.2432], end: ['Khoksar', 77.2452, 32.4194], road: 'Old Manali - Leh Road', season: 'Usually June - October', description: 'A high crossing of the Pir Panjal, linking the Kullu Valley with Lahaul. The pass road is distinct from the Atal Tunnel.', note: 'A Rohtang permit may be required. This route must cross the pass, not use the Atal Tunnel.' },
  'Zojila Pass': { start: ['Sonamarg', 75.293, 34.299], end: ['Dras', 75.7583, 34.4286], road: 'Srinagar - Leh Highway', season: 'Usually May - October', description: 'A dramatic crossing between the Kashmir Valley and the high, dry landscape of Ladakh.', note: 'Convoy timings, one-way restrictions and sudden closures are common. Confirm with local traffic police.' },
  'Nathu La': { start: ['Gangtok', 88.6138, 27.3314], road: 'Jawaharlal Nehru Road', season: 'Permit-dependent', description: 'An eastern Himalayan crossing on the historic trade corridor between Sikkim and Tibet.', note: 'Restricted border area. Visitor eligibility, permits and opening days must be confirmed locally. No cross-border route is offered.' },
  'Sela Pass': { start: ['Dirang', 92.271, 27.358], end: ['Jang', 91.983, 27.586], road: 'Old Sela Pass Road', season: 'Weather-dependent', description: 'A high-altitude lake and saddle on the historic road to Tawang in the eastern Himalaya.', note: 'The Sela Tunnel bypasses the pass. The route check rejects routes that do not approach the sourced pass location.' },
  'Bara-lacha-la': { start: ['Darcha', 77.1975, 32.6691], end: ['Sarchu', 77.585, 32.912], road: 'Manali - Leh Highway', season: 'Usually June - September', description: 'A broad, high saddle in the Zanskar Range on the long road between Lahaul and Ladakh.', note: 'Remote road with limited services. Check snow conditions and acclimatize before travelling.' },
  'Changla Pass': { start: ['Sakti', 77.808, 34.008], end: ['Durbuk', 78.158, 34.103], road: 'Chang La Road', season: 'Usually May - October' },
  'Kunzum Pass': { start: ['Batal', 77.6167, 32.3568], end: ['Losar', 77.7528, 32.4389], road: 'Batal - Kaza Road', season: 'Usually June - October' },
  'Fotu La': { start: ['Mulbekh', 76.36, 34.374], end: ['Lamayuru', 76.775, 34.282], road: 'Srinagar - Leh Highway', season: 'Weather-dependent' },
  'Namika La': { start: ['Mulbekh', 76.36, 34.374], end: ['Bod Kharbu', 76.595, 34.321], road: 'Srinagar - Leh Highway', season: 'Weather-dependent' },
  'Tanglang La (Thang La)': { start: ['Rumtse', 77.748, 33.632], end: ['Debring', 77.803, 33.384], road: 'Manali - Leh Highway', season: 'Usually June - September' },
  'Pensi La': { start: ['Rangdum', 76.22, 34.002], end: ['Padum', 76.883, 33.466], road: 'Kargil - Zanskar Road', season: 'Usually June - October' },
  'Shingo La': { start: ['Darcha', 77.1975, 32.6691], end: ['Kargyak', 77.081, 33.035], road: 'Darcha - Padum Road', season: 'Usually June - September' },
  'Mayodia Pass': { start: ['Roing', 95.835, 28.143], end: ['Hunli', 95.973, 28.321], road: 'Roing - Hunli Road', season: 'Weather-dependent' },
  'Haldighati Pass': { start: ['Nathdwara', 73.823, 24.938], end: ['Gogunda', 73.528, 24.759], road: 'Haldighati Road', season: 'Year-round; check conditions' },
  'Palakkad Gap': { start: ['Palakkad', 76.6548, 10.7867], end: ['Coimbatore', 76.9558, 11.0168], road: 'Palakkad - Coimbatore corridor', season: 'Year-round; check conditions', description: 'A broad break in the Western Ghats connecting Kerala and Tamil Nadu, far below the high Himalayan passes.', note: 'The source coordinate represents the broad gap, not a road summit. A general driving link is available; no pass-validated route is shown.', area: true },
};

export function enrichPasses(passes) {
  return passes.map(pass => ({
    ...pass,
    kind: 'pass',
    category: trekking.has(pass.name) ? 'trek' : restricted.has(pass.name) ? 'restricted' : roadNames.has(pass.name) ? 'road' : 'unknown',
    route: routes[pass.name] || null,
    approximate: ['Bomdila', 'Sengottai', 'Nama Pass', 'Sin La', 'Palakkad Gap'].includes(pass.name),
  }));
}

export function enrichMountains(mountains) {
  return mountains.filter(mountain => Number.isFinite(mountain.elevation) && Number.isInteger(mountain.rank) && mountain.rank > 0)
    .sort((first, second) => second.elevation - first.elevation || first.rank - second.rank || first.name.localeCompare(second.name))
    .slice(0, 50)
    .map((mountain, index) => ({ ...mountain, kind: 'mountain', category: 'mountain', atlasRank: index + 1, route: null }));
}

  export function filterPasses(passes, { query = '', region = '', category = '', minElevation = 0, sort = 'elevation' } = {}) {
  const search = query.trim().toLowerCase();
  return passes.filter(pass =>
    (!search || `${pass.name} ${pass.region} ${pass.range || ''} ${pass.route?.road || ''}`.toLowerCase().includes(search)) &&
    (!region || pass.region === region) &&
    (!category || pass.category === category) &&
    (Number(minElevation) <= 0 || (pass.elevation !== null && pass.elevation >= Number(minElevation))),
  ).sort((first, second) => sort === 'name' ? first.name.localeCompare(second.name) : (second.elevation ?? -1) - (first.elevation ?? -1));
}

export function routeCoordinates(pass) {
  if (!pass.coordinates || !pass.route || pass.route.area) return null;
  const coordinates = [pass.route.start.slice(1), pass.coordinates];
  if (pass.route.end) coordinates.push(pass.route.end.slice(1));
  return coordinates;
}

export function routeUrl(pass) {
  const coordinates = routeCoordinates(pass);
  if (!coordinates) return null;
  const radiuses = coordinates.map((coordinate, index) => index === 1 ? 250 : 1500);
  return `https://router.project-osrm.org/route/v1/driving/${coordinates.map(coordinate => coordinate.join(',')).join(';')}?overview=full&geometries=geojson&steps=true&radiuses=${radiuses.join(';')}`;
}

export function validateRoute(payload, pass) {
  if (payload.code !== 'Ok' || !payload.routes?.length) throw new Error('No road route is available for this pass.');
  const route = payload.routes[0];
  const coordinates = route.geometry?.coordinates;
  if (route.geometry?.type !== 'LineString' || !Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(coordinate => coordinate.length >= 2 && coordinate.slice(0, 2).every(Number.isFinite))) throw new Error('The routing service returned incomplete geometry.');
  if (!payload.waypoints?.[1] || payload.waypoints[1].distance > 250 || pointToLineDistance(point(pass.coordinates), lineString(coordinates), { units: 'meters' }) > 300) throw new Error('The available road route bypasses the pass. It has not been drawn.');
  if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration)) throw new Error('The routing service returned incomplete distances.');
  return route;
}

export function directionsUrl(pass) {
  if (!pass.route) return null;
  const search = new URLSearchParams({ api: '1', origin: `${pass.route.start[2]},${pass.route.start[1]}`, destination: pass.route.end ? `${pass.route.end[2]},${pass.route.end[1]}` : `${pass.coordinates[1]},${pass.coordinates[0]}`, travelmode: 'driving' });
  if (pass.route.end && !pass.route.area && pass.coordinates) search.set('waypoints', `${pass.coordinates[1]},${pass.coordinates[0]}`);
  return `https://www.google.com/maps/dir/?${search}`;
}

export function getAccessDetails(pass) {
  const guidance = pass.route?.note || ({
    trek: 'This is a trekking crossing, not a driving route. Check trail conditions and arrange suitable equipment, acclimatization and local guidance.',
    restricted: 'Access rules may depend on permits, visitor eligibility and local restrictions. Confirm current requirements with the relevant local authorities before travelling.',
    road: 'Confirm road openings, weather and local traffic restrictions before travelling. A mapped road is not a live access report.',
  }[pass.category] || 'Road and trail access have not been verified. Consult the source and local authorities before planning a visit.');
  const title = !pass.coordinates ? 'Location not mapped' : pass.route?.area ? 'A broad road corridor' : pass.category === 'trek' ? 'Trekking access' : pass.category === 'restricted' ? 'Access needs confirmation' : 'Road access';
  const reason = !pass.coordinates ? 'The source does not supply coordinates, so this atlas cannot plot a route to the pass.' : pass.route?.area ? 'This is a broad geographic gap, not a surveyed road summit. A general road corridor is available below.' : routeUrl(pass) ? 'A road itinerary is available to request. Current conditions and access are not verified.' : pass.category === 'trek' ? 'No verified trail geometry is available in this atlas. No driving directions are offered for this trekking pass.' : `No pass-crossing road itinerary is configured for ${pass.name} in this atlas. This does not mean there is no road; a route and travel time cannot be shown here.`;
  const locationUrl = pass.coordinates ? `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: `${pass.coordinates[1]},${pass.coordinates[0]}` })}` : null;
  return { title, reason, guidance, locationUrl };
}

export function formatElevation(elevation) {
  return elevation === null ? 'Not listed' : `${elevation.toLocaleString('en-IN')} m`;
}

export function routeToGpx(route, pass) {
  const escapeXml = text => text.replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Summit Atlas" xmlns="http://www.topografix.com/GPX/1/1"><metadata><desc>OSRM/OpenStreetMap road geometry. Not a guarantee of access or road conditions.</desc></metadata><trk><name>${escapeXml(pass.name)}</name><trkseg>${route.geometry.coordinates.map(coordinate => `<trkpt lat="${coordinate[1]}" lon="${coordinate[0]}"></trkpt>`).join('')}</trkseg></trk></gpx>`;
}