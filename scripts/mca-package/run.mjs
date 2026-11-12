// Admin-run: reads MDE released items and writes a package file. See scripts/mca-package/README.md.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { convertItems, reportMarkdown, validateRun } from './lib/convert.mjs';
import { createClient, fetchSet, loadSet } from './lib/fetchMdeItems.mjs';
import { slug } from './lib/html.mjs';
import { renderPictures } from './lib/renderPictures.mjs';
import { writePackage } from './lib/writePackage.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const STAGES = ['fetch', 'convert', 'render', 'package'];

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    test: { type: 'string', default: '5' },
    subject: { type: 'string', default: '30' },
    grade: { type: 'string', default: '8' },
    data: { type: 'string' },
    out: { type: 'string' },
    overrides: { type: 'string' },
    delay: { type: 'string', default: '350' },
    refresh: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

const usage = `Usage: node scripts/mca-package/run.mjs <stage> [options]
Stages: fetch, convert, render, package, all
  --test <id>      MDE test type id (default 5, MCA IV)
  --subject <id>   MDE subject id (default 30, Science)
  --grade <n>      grade (science offers 5, 8 and 9 for high school)
  --data <dir>     cache folder (default ~/spartboard-mca-data/<test>-<subject>-<grade>)
  --out <dir>      output folder (default <data>/out)
  --overrides <f>  hand conversions (default overrides/<subject>-grade-<n>.json when present)
  --delay <ms>     pause between MDE requests (default 350)
  --refresh        fetch again even when a file is already cached`;

const stage = positionals[0];
if (opt.help || ![...STAGES, 'all'].includes(stage)) {
  console.log(usage);
  process.exit(opt.help ? 0 : 1);
}

const dataDir = resolve(
  opt.data ??
    join(homedir(), 'spartboard-mca-data', `${opt.test}-${opt.subject}-${opt.grade}`)
);
const outDir = resolve(opt.out ?? join(dataDir, 'out'));
const testTypeId = Number(opt.test);
const subjectId = Number(opt.subject);
mkdirSync(outDir, { recursive: true });

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 1));

function loadOverrides(subjectLabel) {
  const file =
    opt.overrides ??
    join(here, 'overrides', `${slug(subjectLabel)}-grade-${opt.grade}.json`);
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    Object.entries(readJson(file)).filter(([k]) => !k.startsWith('_'))
  );
}

function loadCatalog(subjectLabel) {
  const file = join(repo, 'config', 'standards', 'mn-sci-2019.json');
  if (subjectLabel !== 'Science' || !existsSync(file)) return new Map();
  return new Map(readJson(file).benchmarks.map((b) => [b.code, b]));
}

async function runFetch() {
  const get = createClient({ delayMs: Number(opt.delay) });
  await fetchSet({
    get,
    dir: dataDir,
    testTypeId,
    subjectId,
    grade: opt.grade,
    refresh: opt.refresh,
  });
}

function runConvert() {
  const set = loadSet(dataDir);
  const meta = {
    ...set.filters,
    grade: opt.grade,
    now: Date.now(),
  };
  const result = convertItems({
    items: set.items,
    tabsets: set.tabsets,
    imageIndex: set.imageIndex,
    overrides: loadOverrides(set.filters.subject),
    catalog: loadCatalog(set.filters.subject),
    meta,
  });
  const problems = validateRun(result, set.list);
  writeJson(join(outDir, 'converted.json'), { ...result, problems, meta });
  writeJson(join(outDir, 'report.json'), { report: result.report, problems });
  writeFileSync(join(outDir, 'report.md'), reportMarkdown(result, problems, meta));
  const count = (s) => result.report.filter((r) => r.status === s).length;
  console.log(
    `${result.banks.length} banks; ${count('converted')} items converted, ${count('converted-check')} need a check, ${count('not-converted')} not converted`
  );
  console.log(`Report: ${join(outDir, 'report.md')}`);
  if (problems.length) {
    console.error(`PROBLEMS:\n${problems.join('\n')}`);
    process.exitCode = 1;
  }
}

async function runRender() {
  const converted = readJson(join(outDir, 'converted.json'));
  const set = loadSet(dataDir);
  const pictures = await renderPictures({
    dir: dataDir,
    imageIndex: set.imageIndex,
    pictures: converted.pictures,
  });
  for (const [path, bytes] of pictures) {
    const full = join(outDir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, bytes);
  }
  console.log(`${pictures.size} pictures written to ${join(outDir, 'pictures')}`);
}

async function runPackage() {
  const converted = readJson(join(outDir, 'converted.json'));
  if (converted.problems.length) {
    throw new Error(
      `Not writing a package: the convert stage reported problems (see report.md)`
    );
  }
  const pictures = new Map();
  const dir = join(outDir, 'pictures');
  if (!existsSync(dir)) throw new Error('Run the render stage first (no pictures folder).');
  for (const f of readdirSync(dir)) pictures.set(`pictures/${f}`, readFileSync(join(dir, f)));
  const bytes = await writePackage({
    banks: converted.banks,
    pictures,
    meta: {
      title: converted.collection,
      generatedAt: converted.meta.now,
      source: {
        name: 'Minnesota Department of Education, Minnesota Questions Tool',
        testTypeId,
        subjectId,
        grade: opt.grade,
      },
    },
  });
  const file = join(outDir, `${slug(converted.collection)}.package.zip`);
  writeFileSync(file, bytes);
  console.log(`Package: ${file} (${(bytes.length / 1e6).toFixed(1)} MB)`);
}

const RUN = {
  fetch: runFetch,
  convert: runConvert,
  render: runRender,
  package: runPackage,
};
for (const s of stage === 'all' ? STAGES : [stage]) {
  console.log(`== ${s}`);
  await RUN[s]();
  if (process.exitCode) break;
}
