// Fetch stage: reads the Minnesota Questions Tool API into a local folder, one file per item so a rerun resumes.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { imageIds } from './html.mjs';

export const API = 'https://api.education.mn.gov/mqtapi/api';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 1));

/** One request at a time, a pause between them, retries on network errors and 5xx. */
export function createClient({
  delayMs = 350,
  maxAttempts = 3,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  let last = 0;
  return async function get(path, as = 'json') {
    for (let attempt = 1; ; attempt++) {
      const wait = last + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      try {
        const res = await fetchImpl(`${API}${path}`, {
          headers: { 'User-Agent': 'spartboard-mca-package-script' },
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) {
          if (as === 'json') return await res.json();
          if (as === 'bytes') {
            return {
              bytes: Buffer.from(await res.arrayBuffer()),
              type: res.headers.get('content-type') ?? '',
            };
          }
          return await res.text();
        }
        if (res.status < 500 || attempt >= maxAttempts) {
          const err = new Error(`MDE ${res.status} for ${path}`);
          err.status = res.status;
          throw err;
        }
      } catch (err) {
        if (err.status || attempt >= maxAttempts) throw err;
      }
      await sleep(2000 * attempt);
    }
  };
}

const extFor = (type) =>
  type.includes('png')
    ? 'png'
    : type.includes('jpeg')
      ? 'jpg'
      : type.includes('gif')
        ? 'gif'
        : type.includes('svg')
          ? 'svg'
          : 'bin';

/** The ids and names MDE's own filters offer, so no id is guessed. */
export async function lookupFilters(get, { testTypeId, subjectId, grade }) {
  const [tests, subjects, grades] = await Promise.all([
    get('/Test/GetTestTypesAsync'),
    get('/Test/subjects'),
    get(`/Test/grades?testTypeId=${testTypeId}&subjectId=${subjectId}`),
  ]);
  const test = tests.find((t) => t.id === testTypeId);
  const subject = subjects.find((s) => s.id === subjectId);
  if (!test) throw new Error(`Test type ${testTypeId} not offered: ${JSON.stringify(tests)}`);
  if (!subject) throw new Error(`Subject ${subjectId} not offered: ${JSON.stringify(subjects)}`);
  if (!grades.includes(Number(grade))) {
    throw new Error(`Grade ${grade} not offered for ${test.label} ${subject.label}: ${JSON.stringify(grades)}`);
  }
  return { test: test.label, subject: subject.label, grade: String(grade) };
}

export async function fetchSet({
  get,
  dir,
  testTypeId,
  subjectId,
  grade,
  refresh = false,
  log = console.log,
}) {
  for (const sub of ['items', 'tabsets', 'charts', 'img']) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  const filters = await lookupFilters(get, { testTypeId, subjectId, grade });
  writeJson(join(dir, 'filters.json'), { testTypeId, subjectId, ...filters });

  const listPath = join(dir, 'list.json');
  let list;
  if (!refresh && existsSync(listPath)) {
    list = readJson(listPath);
  } else {
    list = await get(
      `/Questions/GetQuestionsAsync?TestTypeId=${testTypeId}&SubjectId=${subjectId}&selectedgrades=${grade}`
    );
    writeJson(listPath, list);
  }
  log(`${list.length} items listed for ${filters.test} ${filters.subject} grade ${grade}`);

  let n = 0;
  for (const row of list) {
    n += 1;
    const id = row.itemTableId;
    const itemPath = join(dir, 'items', `${id}.json`);
    if (!refresh && existsSync(itemPath)) continue;
    const details = await get(`/QuestionDetails/GetQuestionDetailsAsync?itemTableId=${id}`, 'text');
    const guide = await get(`/QuestionDetails/scoringguide?itemTableId=${id}`, 'text');
    let tab = null;
    try {
      tab = await get(`/TabTemplate/DisplayTab?naepid=${row.naepId}`);
    } catch (err) {
      if (!err.status) throw err;
    }
    if (tab?.tabSetId != null) {
      const setPath = join(dir, 'tabsets', `${tab.tabSetId}.json`);
      if (refresh || !existsSync(setPath)) writeJson(setPath, tab);
    }
    let hasChart = false;
    try {
      const chart = await get(`/Charts/CreatePerformanceChartAsync?itemTableId=${id}`);
      if (chart?.fileContents) {
        writeFileSync(join(dir, 'charts', `${id}.png`), Buffer.from(chart.fileContents, 'base64'));
        hasChart = true;
      }
    } catch (err) {
      if (!err.status) throw err;
    }
    writeJson(itemPath, {
      ...row,
      details,
      guide,
      tabSetId: tab?.tabSetId ?? null,
      hasChart,
    });
    log(`  ${n}/${list.length} item ${id} (${row.type})`);
  }

  const indexPath = join(dir, 'img-index.json');
  const index = existsSync(indexPath) ? readJson(indexPath) : {};
  const html = [];
  for (const row of list) {
    const item = readJson(join(dir, 'items', `${row.itemTableId}.json`));
    html.push(item.details, item.guide);
  }
  for (const f of readdirSync(join(dir, 'tabsets'))) {
    html.push(...readJson(join(dir, 'tabsets', f)).tabs.map((t) => t.itemContent));
  }
  const wanted = [...new Set(imageIds(html.join('\n')))];
  for (const id of wanted) {
    if (index[id] && existsSync(join(dir, 'img', `${id}.${index[id].ext}`))) continue;
    const { bytes, type } = await get(`/QuestionDetails/itemresource?TableID=${id}`, 'bytes');
    const ext = extFor(type);
    writeFileSync(join(dir, 'img', `${id}.${ext}`), bytes);
    index[id] = { ext, bytes: bytes.length };
    writeJson(indexPath, index);
  }
  log(`${wanted.length} pictures in the cache`);
  return { list, filters };
}

/** Reads a fetched folder back for the convert stage. */
export function loadSet(dir) {
  const list = readJson(join(dir, 'list.json'));
  const items = list.map((row) => readJson(join(dir, 'items', `${row.itemTableId}.json`)));
  const tabsets = {};
  for (const f of readdirSync(join(dir, 'tabsets'))) {
    const t = readJson(join(dir, 'tabsets', f));
    tabsets[t.tabSetId] = t;
  }
  return {
    list,
    items,
    tabsets,
    imageIndex: readJson(join(dir, 'img-index.json')),
    filters: readJson(join(dir, 'filters.json')),
  };
}
