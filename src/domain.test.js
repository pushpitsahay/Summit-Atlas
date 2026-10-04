import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { enrichPasses, enrichMountains, filterPasses, routeUrl, validateRoute, routeToGpx, directionsUrl, getAccessDetails } from './domain.js';

const data = JSON.parse(await readFile(new URL('../public/data/passes.json', import.meta.url)));
const passes = enrichPasses(data.passes);
const mountainData = JSON.parse(await readFile(new URL('../public/data/mountains.json', import.meta.url)));
const mountains = enrichMountains(mountainData.mountains);
const khardung = passes.find(pass => pass.name === 'Khardung La');
const geometry = { type: 'LineString', coordinates: [[77.5771, 34.1526], khardung.coordinates, [77.6428, 34.5786]] };
const payload = { code: 'Ok', routes: [{ geometry, distance: 75000, duration: 10000 }], waypoints: [{ distance: 2 }, { distance: 10 }, { distance: 5 }] };

test('all source passes are retained with unique IDs and valid sourced coordinates', () => {
  assert.equal(passes.length, 64);
  assert.equal(new Set(passes.map(pass => pass.id)).size, 64);
  assert.equal(new Set(passes.map(pass => pass.region)).size, 8);
  for (const pass of passes) {
    if (pass.coordinates) {
      assert.ok(pass.coordinates[0] >= 68 && pass.coordinates[0] <= 100, pass.name);
      assert.ok(pass.coordinates[1] >= 6 && pass.coordinates[1] <= 38, pass.name);
    }
  }
});

test('search, region, elevation and category filters compose', () => {
  assert.equal(filterPasses(passes, { minElevation: '0' }).length, 64);
  assert.equal(filterPasses(passes, { query: ' khardung ' })[0].id, khardung.id);
  const filtered = filterPasses(passes, { region: 'Ladakh', minElevation: 5000, category: 'road' });
  assert.ok(filtered.length > 1);
  assert.ok(filtered.every(pass => pass.region === 'Ladakh' && pass.elevation >= 5000 && pass.category === 'road'));
  assert.equal(filterPasses(passes, { query: 'nonexistent mountain' }).length, 0);
  assert.equal(filterPasses(passes, { sort: 'elevation' })[0].name, 'Kalindi Pass');
});

test('both directories default to descending elevation and support A to Z sorting', () => {
  for (const places of [passes, mountains]) {
    const byElevation = filterPasses(places);
    assert.deepEqual(byElevation, filterPasses(places, { sort: 'elevation' }));
    assert.ok(byElevation.every((place, index) => index === 0 || (place.elevation ?? -1) <= (byElevation[index - 1].elevation ?? -1)));
    const byName = filterPasses(places, { sort: 'name' });
    assert.ok(byName.every((place, index) => index === 0 || byName[index - 1].name.localeCompare(place.name) <= 0));
  }
  assert.equal(filterPasses(passes)[0].name, 'Kalindi Pass');
  assert.equal(filterPasses(passes).at(-1).elevation, null);
  assert.equal(filterPasses(mountains)[0].name, 'Kangchenjunga');
});

test('driving requests force a waypoint near the actual pass', () => {
  const url = routeUrl(khardung);
  assert.ok(url.includes('77.60417,34.27833'));
  assert.ok(url.includes('radiuses=1500;250;1500'));
  assert.equal(routeUrl(passes.find(pass => pass.name === "Auden's Col")), null);
  assert.equal(routeUrl(passes.find(pass => pass.name === 'Palakkad Gap')), null);
  const nathu = passes.find(pass => pass.name === 'Nathu La');
  assert.equal(nathu.route.end, undefined);
  assert.ok(directionsUrl(nathu).includes('destination=27.38681%2C88.83095'));
});

test('access details distinguish unavailable itineraries, trails, broad gaps and missing coordinates', () => {
  const umling = passes.find(pass => pass.name === 'Umling La');
  const access = getAccessDetails(umling);
  assert.equal(routeUrl(umling), null);
  assert.equal(access.title, 'Access needs confirmation');
  assert.match(access.reason, /No pass-crossing road itinerary is configured for Umling La/);
  assert.match(access.guidance, /permits/);
  const location = new URL(access.locationUrl);
  assert.equal(location.pathname, '/maps/search/');
  assert.equal(location.searchParams.get('query'), `${umling.coordinates[1]},${umling.coordinates[0]}`);
  assert.equal(location.searchParams.has('travelmode'), false);
  const trekking = getAccessDetails(passes.find(pass => pass.name === "Auden's Col"));
  assert.equal(trekking.title, 'Trekking access');
  assert.match(trekking.reason, /No verified trail geometry/);
  const unmapped = getAccessDetails(passes.find(pass => !pass.coordinates));
  assert.equal(unmapped.title, 'Location not mapped');
  assert.equal(unmapped.locationUrl, null);
  assert.equal(getAccessDetails(passes.find(pass => pass.name === 'Palakkad Gap')).title, 'A broad road corridor');
  assert.match(getAccessDetails(khardung).reason, /road itinerary is available/);
});

test('accept road geometry close to the pass and reject bypasses or unavailable routes', () => {
  assert.equal(validateRoute(payload, khardung).distance, 75000);
  assert.throws(() => validateRoute({ code: 'NoRoute' }, khardung), /No road route/);
  assert.throws(() => validateRoute({ ...payload, waypoints: [{}, { distance: 1200 }] }, khardung), /bypasses/);
  const bypass = { ...payload, routes: [{ ...payload.routes[0], geometry: { type: 'LineString', coordinates: [[77, 33], [78, 33]] } }] };
  assert.throws(() => validateRoute(bypass, khardung), /bypasses/);
  assert.throws(() => validateRoute({ ...payload, routes: [{ geometry: { type: 'LineString', coordinates: [] } }] }, khardung), /incomplete geometry/);
});

test('GPX preserves longitude/latitude order and escapes source names', () => {
  const gpx = routeToGpx(payload.routes[0], { name: 'A & B <pass>' });
  assert.ok(gpx.includes('creator="Summit Atlas"'));
  assert.ok(gpx.includes('lat="34.27833" lon="77.60417"'));
  assert.ok(gpx.includes('A &amp; B &lt;pass&gt;'));
});

test('only the 50 highest sourced mountains are available, in descending elevation order', () => {
  assert.equal(mountains.length, 50);
  assert.equal(new Set(mountains.map(mountain => mountain.id)).size, 50);
  assert.equal(mountains[0].name, 'Kangchenjunga');
  assert.equal(mountains[0].elevation, 8586);
  assert.deepEqual(mountains.map(mountain => mountain.rank), Array.from({ length: 50 }, (_, index) => index + 1));
  assert.ok(mountains.every((mountain, index) => index === 0 || mountain.elevation <= mountains[index - 1].elevation));
  assert.equal(mountains.at(-1).name, 'Panchchuli II');
  assert.deepEqual(mountains.find(mountain => mountain.rank === 11).coordinates, [79.99444, 30.36667]);
  assert.ok(mountains.every(mountain => mountain.coordinates === null || (mountain.coordinates.length === 2 && mountain.coordinates.every(Number.isFinite) && mountain.coordinates[0] >= 68 && mountain.coordinates[0] <= 100 && mountain.coordinates[1] >= 6 && mountain.coordinates[1] <= 38)));
  assert.equal(enrichMountains([...mountainData.mountains, { name: 'Lower summit', rank: 51, elevation: 6800 }]).length, 50);
  assert.ok(mountains.every((mountain, index) => mountain.atlasRank === index + 1 && mountain.category === 'mountain' && routeUrl(mountain) === null && directionsUrl(mountain) === null));
  assert.equal(mountainData.mountains[0].kind, undefined);
});

test('mountain filters search only the top 50 and support ranges and regions', () => {
  const byRange = filterPasses(mountains, { query: 'karakoram', region: 'Ladakh', minElevation: 7000 });
  assert.ok(byRange.length > 0);
  assert.ok(byRange.every(mountain => mountain.range.toLowerCase().includes('karakoram') && mountain.region === 'Ladakh' && mountain.elevation >= 7000));
  assert.equal(filterPasses(mountains, { query: 'Anamudi' }).length, 0);
  assert.equal(filterPasses(mountains, { query: ' nanda devi ' })[0].name, 'Nanda Devi');
  assert.equal(enrichMountains([{ name: 'Unknown', elevation: null }]).length, 0);
});