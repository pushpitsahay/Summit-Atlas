import { load } from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';

const source = 'https://en.wikipedia.org/wiki/List_of_mountain_passes_of_India';
const headers = { 'User-Agent': 'PassageAtlas/1.0 (educational mountain pass atlas)' };

async function readHtml(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return load(await response.text());
}

function coordinate(value) {
  const parts = value.match(/[\d.]+/g)?.map(Number);
  if (!parts?.length) return null;
  const decimal = parts[0] + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600;
  return /[SW]/i.test(value) ? -decimal : decimal;
}

const list = await readHtml(source);
const passes = [];
list('table.wikitable tbody tr').each((index, row) => {
  const cells = list(row).children('td');
  if (cells.length < 4) return;
  const name = cells.eq(0).text().trim();
  const href = cells.eq(0).find('a').first().attr('href');
  const elevation = cells.eq(2).text().match(/([\d,.]+)\s*m\b/);
  passes.push({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, ''),
    name,
    region: cells.eq(1).text().trim(),
    elevation: elevation ? Number(elevation[1].replaceAll(',', '')) : null,
    connection: cells.eq(3).text().replace(/\[\d+\]/g, '').trim(),
    sourceUrl: href && !href.includes('redlink') ? new URL(href, source).href : source,
    coordinates: null,
    image: null,
  });
});

await mkdir('public/data', { recursive: true });
await mkdir('public/images', { recursive: true });
const featured = new Set(['Khardung La', 'Rohtang Pass', 'Nathu La', 'Sela Pass', 'Zojila Pass', 'Palakkad Gap', 'Bara-lacha-la', 'Kunzum Pass']);
for (let offset = 0; offset < passes.length; offset += 4) {
  await Promise.all(passes.slice(offset, offset + 4).map(async pass => {
    if (pass.sourceUrl === source) return;
    try {
      const article = await readHtml(pass.sourceUrl);
      const latitude = article('.geo .latitude, .geo-dms .latitude').first().text();
      const longitude = article('.geo .longitude, .geo-dms .longitude').first().text();
      const decimal = article('.geo').first().text().match(/(-?\d+\.?\d*)\s*;\s*(-?\d+\.?\d*)/);
      if (decimal) pass.coordinates = [Number(decimal[2]), Number(decimal[1])];
      else if (latitude && longitude) pass.coordinates = [coordinate(longitude), coordinate(latitude)];
      if (featured.has(pass.name)) {
        const image = article('.infobox img').first();
        const imagePath = image.attr('src');
        if (imagePath) {
          const imageUrl = new URL(imagePath, pass.sourceUrl).href;
          const response = await fetch(imageUrl, { headers, signal: AbortSignal.timeout(20000) });
          if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
            const extension = new URL(imageUrl).pathname.split('.').pop().toLowerCase();
            const filename = `${pass.id}.${extension}`;
            await writeFile(`public/images/${filename}`, Buffer.from(await response.arrayBuffer()));
            pass.image = `/images/${filename}`;
            const credit = image.closest('a').attr('href');
            pass.imageSource = credit ? new URL(credit, pass.sourceUrl).href : pass.sourceUrl;
          }
        }
      }
      console.log(`${pass.name}: ${pass.coordinates ? pass.coordinates.join(', ') : 'no sourced coordinates'}`);
    } catch (error) {
      console.warn(`${pass.name}: ${error.message}`);
    }
  }));
}

await writeFile('public/data/passes.json', JSON.stringify({
  source,
  retrieved: new Date().toISOString().slice(0, 10),
  license: 'CC BY-SA 4.0; Wikipedia contributors. Extracted names, regions, elevations and connections; article coordinates added.',
  passes,
}, null, 2));

const response = await fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson', { signal: AbortSignal.timeout(25000) });
if (!response.ok) throw new Error(`Boundary download: ${response.status}`);
const countries = await response.json();
const india = countries.features.find(feature => feature.properties.ADM0_A3 === 'IND');
if (!india) throw new Error('India boundary was not found');
await writeFile('public/data/india.geojson', JSON.stringify({ type: 'FeatureCollection', features: [india] }));
console.log(`Saved ${passes.length} passes; ${passes.filter(pass => pass.coordinates).length} have sourced coordinates.`);