#!/usr/bin/env node
// Copies this week's and next week's Nutrislice lunch menus into Firestore `lunch_menus/{schoolSite}`.
// Runs from GitHub Actions because Nutrislice refuses requests from Google Cloud IPs (2026-10-02).
// Usage: PROJECT_ID=spartboard ACCESS_TOKEN=$(gcloud auth print-access-token) node scripts/sync-lunch-menus.mjs [--dry-run]

const SCHOOL_SITES = [
  'schumann-elementary',
  'orono-intermediate-school',
  'orono-middle-school',
  'orono-high-school',
];
const TIME_ZONE = 'America/Chicago';
const DRY_RUN = process.argv.includes('--dry-run');

const localDateParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { year: get('year'), month: get('month'), day: get('day') };
};

const weekUrl = (site, date) => {
  const { year, month, day } = localDateParts(date);
  return `https://orono.api.nutrislice.com/menu/api/weeks/school/${site}/menu-type/lunch/${year}/${month}/${day}/`;
};

// Keeps only the fields useNutrislice reads, in Nutrislice's own shape.
const trimItem = (item) => {
  const out = {};
  if (item.is_section_title) out.is_section_title = true;
  if (typeof item.section_name === 'string')
    out.section_name = item.section_name;
  if (typeof item.text === 'string' && item.text) out.text = item.text;
  if (item.food && typeof item.food.name === 'string') {
    out.food = { name: item.food.name };
    if (typeof item.food.image_url === 'string' && item.food.image_url) {
      out.food.image_url = item.food.image_url;
    }
  }
  return out;
};

const fetchWeek = async (site, date) => {
  const url = weekUrl(site, date);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) return res.json();
    if (attempt >= 3 || res.status < 500) {
      throw new Error(`Nutrislice ${res.status} for ${url}`);
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
};

const toValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(v).map(([k, val]) => [k, toValue(val)])
      ),
    },
  };
};

const writeMenu = async (projectId, token, site, data) => {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/lunch_menus/${site}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: toValue(data).mapValue.fields }),
  });
  if (!res.ok) {
    throw new Error(
      `Firestore ${res.status} writing ${site}: ${await res.text()}`
    );
  }
};

const main = async () => {
  const projectId = process.env.PROJECT_ID;
  const token = process.env.ACCESS_TOKEN;
  if (!DRY_RUN && (!projectId || !token)) {
    throw new Error('PROJECT_ID and ACCESS_TOKEN are required');
  }

  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const failures = [];

  for (const site of SCHOOL_SITES) {
    try {
      const weeks = [
        await fetchWeek(site, now),
        await fetchWeek(site, nextWeek),
      ];
      const days = {};
      for (const week of weeks) {
        for (const d of week.days ?? []) {
          const items = (d.menu_items ?? []).map(trimItem);
          if (items.length) days[d.date] = items;
        }
      }
      const summary = `${site}: ${Object.keys(days).length} days with menu items`;
      if (DRY_RUN) {
        console.log(`[dry run] ${summary}`);
        continue;
      }
      await writeMenu(projectId, token, site, { days, fetchedAt: now });
      console.log(summary);
    } catch (err) {
      console.error(`${site}: ${err.message}`);
      failures.push(site);
    }
  }

  if (failures.length) {
    throw new Error(`Failed to sync: ${failures.join(', ')}`);
  }
};

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
