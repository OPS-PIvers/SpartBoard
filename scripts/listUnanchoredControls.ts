// Inventory of existing teacher-facing controls with no live-tour anchor, for the anchor mapper sweep: node scripts/listUnanchoredControls.ts [--json] [path-prefix...]

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scansFile, unanchoredControls } from './checkTourAnchors.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const json = args.includes('--json');
const unknown = args.filter((a) => a.startsWith('--') && a !== '--json');
if (unknown.length) {
  console.error(`Unknown flag: ${unknown.join(', ')}`);
  process.exit(2);
}
const prefixes = args.filter((a) => a !== '--json');

const files = execFileSync('git', ['ls-files', 'components', 'App.tsx'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter(
    (path) =>
      scansFile(path) &&
      (prefixes.length === 0 || prefixes.some((p) => path.startsWith(p)))
  );

if (prefixes.length && files.length === 0) {
  console.error(
    `No teacher-facing .tsx files match ${prefixes.join(', ')} (paths are case-sensitive).`
  );
  process.exit(2);
}

const out: { file: string; controls: { line: number; tag: string }[] }[] = [];
for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8');
  const every = new Set(text.split('\n').map((_, i) => i + 1));
  const controls = unanchoredControls(text, every);
  if (controls.length) out.push({ file, controls });
}

if (json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const total = out.reduce((n, f) => n + f.controls.length, 0);
  for (const { file, controls } of out) {
    console.log(
      `${file} (${controls.length}): ${controls.map((c) => `${c.line} <${c.tag}>`).join(', ')}`
    );
  }
  console.log(`\n${total} unanchored controls in ${out.length} files`);
}
