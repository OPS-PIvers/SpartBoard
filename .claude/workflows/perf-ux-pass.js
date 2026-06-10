export const meta = {
  name: 'perf-ux-pass',
  description:
    'Measured performance/UX improvement pass — establishes an objective committed baseline (React Profiler harness + bundle stats), diagnoses, implements file-disjoint fixes, then re-measures and cost-audits the diff',
  whenToUse:
    'Run when a feature area "feels slow/clunky" and you want quantified improvement. Pass args.target = { name, description, files[], harnessSpec } to aim it at an area (e.g. the quiz/VA/GL editors). The pass refuses to claim success without before/after numbers from the same harness, and fails the run if the diff increases Firestore/Storage/AI cost.',
  phases: [
    { title: 'Baseline', detail: 'build Profiler harness + record bundle stats' },
    { title: 'Diagnose', detail: 'parallel lens finders (read-only)' },
    { title: 'Synthesize', detail: 'dedupe, rank, bin into file-disjoint groups' },
    { title: 'Implement', detail: 'one file-owned agent per group' },
    { title: 'Verify', detail: 're-measure, quality gates, cost audit' },
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// Repo contract injected into every agent. Keep in sync with CLAUDE.md.
// ───────────────────────────────────────────────────────────────────────────
const REPO = `SpartBoard — React 19 + TypeScript + Vite classroom dashboard. Firebase (Auth/Firestore/Storage), i18next, Tailwind.

STRUCTURE: FLAT — there is NO src/ directory. All code is in root-level dirs (components/, context/, hooks/, config/, utils/). Path alias '@/' maps to the ROOT.

TOOLCHAIN: pnpm (NEVER npm), Node 24+.
  - Type-check: pnpm run type-check
  - Lint (zero warnings): pnpm run lint
  - Format: pnpm run format:check  (fix with: pnpm exec prettier --write <files>)
  - Tests: pnpm exec vitest run <path>   (full: pnpm run test)
  - Prod build: pnpm run build

HOUSE RULES (hard constraints — a change that breaks any of these is invalid):
  - NO suppressions: no 'any', no @ts-ignore/@ts-expect-error, no eslint-disable. Lint fails on warnings.
  - Preserve user-visible behavior exactly — this is a performance pass, not a redesign. UX changes limited to responsiveness/feedback (perceived speed), never layout/feature changes.
  - useEffect is an escape hatch, NOT a default — only to sync with an external system. Derived state computes during render / useMemo; refs assign in render body; reset-on-prop uses key or adjusting-state-while-rendering.
  - Firestore is a school-district cost line: the diff must NOT add reads, writes, listeners, Storage ops, or AI calls. Debounced-write patterns must keep or lower their write frequency.
  - Match surrounding code style, naming, and comment density. Reference code as file:line.`;

// ───────────────────────────────────────────────────────────────────────────
// Schemas
// ───────────────────────────────────────────────────────────────────────────
const BASELINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['harnessFile', 'runCommand', 'resultsFile', 'metrics', 'notes'],
  properties: {
    harnessFile: { type: 'string', description: 'Path of the committed harness test file' },
    runCommand: { type: 'string', description: 'Exact command that re-runs the harness' },
    resultsFile: { type: 'string', description: 'Path of the committed baseline JSON' },
    metrics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['scenario', 'commits', 'medianDurationMs'],
        properties: {
          scenario: { type: 'string' },
          commits: { type: 'integer', description: 'Profiler commit count (deterministic primary metric)' },
          medianDurationMs: { type: 'number', description: 'Median actualDuration over 3 runs (indicative)' },
        },
      },
    },
    notes: { type: 'string' },
  },
};
const BUNDLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resultsFile', 'chunks', 'notes'],
  properties: {
    resultsFile: { type: 'string' },
    chunks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'gzipKb'],
        properties: { name: { type: 'string' }, gzipKb: { type: 'number' } },
      },
    },
    notes: { type: 'string' },
  },
};
const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'lens', 'problem', 'evidence', 'fix', 'expectedMetricImpact', 'effort', 'risk', 'impact', 'files'],
        properties: {
          title: { type: 'string' },
          lens: { type: 'string' },
          problem: { type: 'string', description: 'What is slow/clunky and why, concretely' },
          evidence: { type: 'array', items: { type: 'string' }, description: 'file:line citations' },
          fix: { type: 'string', description: 'Specific enough to hand to an implementer' },
          expectedMetricImpact: {
            type: 'string',
            description: 'Which harness scenario / bundle chunk this should move, and roughly how',
          },
          effort: { type: 'string', enum: ['trivial', 'small', 'medium', 'large'] },
          risk: { type: 'string', enum: ['low', 'medium', 'high'] },
          impact: { type: 'integer', minimum: 1, maximum: 10 },
          files: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};
const RANKED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['approved', 'deferred'],
  properties: {
    approved: {
      type: 'array',
      description: 'Items to implement this run, highest impact first',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'fix', 'files', 'expectedMetricImpact', 'rationale'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          fix: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          expectedMetricImpact: { type: 'string' },
          rationale: { type: 'string' },
        },
      },
    },
    deferred: {
      type: 'array',
      description: 'Items NOT implemented this run (too risky/large/uncertain), with reason',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'reason'],
        properties: { title: { type: 'string' }, reason: { type: 'string' } },
      },
    },
  },
};
const IMPLEMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ids', 'status', 'filesChanged', 'summary'],
  properties: {
    ids: { type: 'array', items: { type: 'string' } },
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    filesChanged: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    notes: { type: 'string' },
  },
};
const REMEASURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resultsFile', 'comparison', 'regressions'],
  properties: {
    resultsFile: { type: 'string' },
    comparison: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['scenario', 'before', 'after', 'verdict'],
        properties: {
          scenario: { type: 'string' },
          before: { type: 'string', description: 'baseline commits / median ms (or gzip KB)' },
          after: { type: 'string' },
          verdict: { type: 'string', enum: ['improved', 'unchanged', 'regressed'] },
        },
      },
    },
    regressions: { type: 'array', items: { type: 'string' } },
  },
};
const GATES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['typecheck', 'lint', 'format', 'tests', 'failures'],
  properties: {
    typecheck: { type: 'boolean' },
    lint: { type: 'boolean' },
    format: { type: 'boolean' },
    tests: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'string' }, description: 'Verbatim failure output snippets, empty if all pass' },
  },
};
const COST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['costNeutral', 'analysis'],
  properties: {
    costNeutral: { type: 'boolean', description: 'true ONLY if the diff adds zero Firestore reads/writes/listeners, Storage ops, and AI calls' },
    analysis: { type: 'string', description: 'Per-touched-data-path accounting of read/write/listener deltas' },
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
function groupByFileOverlap(items) {
  let groups = [];
  for (const item of items) {
    const itemFiles = new Set(item.files || []);
    const overlapping = groups.filter((g) => [...itemFiles].some((f) => g.files.has(f)));
    const rest = groups.filter((g) => !overlapping.includes(g));
    const merged = { items: [item], files: new Set(itemFiles) };
    for (const g of overlapping) {
      for (const it of g.items) merged.items.push(it);
      for (const f of g.files) merged.files.add(f);
    }
    groups = [...rest, merged];
  }
  return groups;
}

const ARGS = typeof args === 'string' ? (args.trim() ? JSON.parse(args) : {}) : (args ?? {});
const TARGET = ARGS.target;
// Optional filename prefix for tests/perf/results/* so a pass over a NEW
// surface doesn't overwrite a previously committed ruler (e.g. 'dashboard-').
const PREFIX = ARGS.resultsPrefix ?? '';
if (!TARGET || !TARGET.name || !TARGET.files?.length || !TARGET.harnessSpec) {
  throw new Error(
    'perf-ux-pass requires args.target = { name, description, files: string[], harnessSpec }. ' +
      'harnessSpec describes the scenarios the Profiler harness must script (mount, keystroke, switch, add-item, ...).'
  );
}
const TARGET_BLOCK = `TARGET AREA: ${TARGET.name}
${TARGET.description || ''}
CORE FILES:
${TARGET.files.map((f) => `  - ${f}`).join('\n')}`;

// ───────────────────────────────────────────────────────────────────────────
// Phase 1+2 combined wall-clock: baseline builders and read-only finders are
// independent (harness only ADDS files under tests/perf/), so run them in one
// parallel() — the barrier IS needed because Synthesize wants all findings and
// the implementers must not start before the baseline exists.
// ───────────────────────────────────────────────────────────────────────────
log(`perf-ux-pass targeting: ${TARGET.name}`);

const LENSES = [
  {
    key: 'rerender',
    focus: `Re-render hot paths under typing/dragging: controlled inputs re-rendering the whole editor tree per keystroke, missing React.memo on list-item children (question cards, slide thumbnails, step rows), unstable callback/object/array props defeating memoization, context values rebuilt every render, expensive derived computation in render without useMemo. React 19: do not add useCallback/useMemo noise where it cannot help — only where a memoized child or expensive computation actually benefits.`,
  },
  {
    key: 'interaction-latency',
    focus: `Synchronous work on the interaction path: layout thrash (reading layout then writing in the same handler), heavy JSON.stringify/deep-clone/deep-compare on every change (dirty-checking on each keystroke), state updates that cascade through useEffect chains, images/video elements re-mounting on selection change, autosave/debounce work running on the render path, scroll/resize handlers without throttle.`,
  },
  {
    key: 'mount-cost',
    focus: `Editor open/close cost: what mounts eagerly when the modal opens vs. could lazy-mount per tab/section, oversized lazy chunks (everything in one editor chunk), synchronous data transforms of the full set/quiz on open, modal animation jank from layout-triggering CSS, lists rendering all items eagerly where windowing or content-visibility would do.`,
  },
  {
    key: 'perceived-ux',
    focus: `Perceived responsiveness WITHOUT changing layout/features: missing immediate visual feedback on actions (button press → visible state within one frame), spinners where optimistic updates are safe, focus loss after add/delete/reorder operations, controls that block on async work that could be backgrounded, janky transitions. Flag ONLY items with concrete evidence; no redesigns.`,
  },
];

phase('Baseline');
const [harnessBaseline, bundleBaseline, ...lensResults] = await parallel([
  () =>
    agent(
      `${REPO}

${TARGET_BLOCK}

You are building the OBJECTIVE PERFORMANCE BASELINE for this pass. Create a React Profiler harness and record pre-change numbers. This harness is the contract that later proves (or disproves) improvement, so it must be deterministic and re-runnable.

BUILD: tests/perf/ harness test file(s) (vitest + @testing-library/react + jsdom, matching the mocking patterns used by neighboring component tests — e.g. components/widgets/GuidedLearning/components/GuidedLearningPlayer.test.tsx stubs ResizeObserver and getBoundingClientRect). Wrap each mounted editor in <React.Profiler> and script the scenarios below. For each scenario record: (a) Profiler commit COUNT — the deterministic primary metric — and (b) summed actualDuration. Run the suite 3 times and take the median duration; commit counts must be identical across runs or the harness is flawed — fix it until they are.

SCENARIOS (per the target spec):
${TARGET.harnessSpec}

REQUIREMENTS:
  - Mock Firebase/Firestore/context exactly the way neighboring tests do — the harness must run offline with zero network.
  - Mount each editor with REALISTIC data sizes (not 2 items — use the spec's sizes) so re-render cost is visible.
  - Write results as pretty-printed JSON to tests/perf/results/${PREFIX}baseline.json via node:fs INSIDE the test (mkdir recursive). The test itself must only assert that metrics were produced — NO duration thresholds (CI machines vary; this must never be flaky).
  - The run command must be a single line, e.g.: pnpm exec vitest run tests/perf/editorPerf.test.tsx
  - Keep the harness lint/type/format clean (pnpm run lint touches it; zero warnings).
  - Do NOT modify any production source file. tests/perf/** is your only write surface.
Record the baseline numbers in your structured output AND in the JSON file.`,
      { label: 'baseline:harness', phase: 'Baseline', schema: BASELINE_SCHEMA }
    ),
  () =>
    agent(
      `${REPO}

${TARGET_BLOCK}

You are recording the BUNDLE-SIZE BASELINE. Run "pnpm run build" once and identify which built chunks contain the target editor code (check dist/ output names and, if ambiguous, grep the chunk contents for distinctive editor strings). Record the gzip size of each relevant chunk plus the total. Write a pretty-printed JSON file to tests/perf/results/${PREFIX}bundle-baseline.json with { chunks: [{name, gzipKb}], totalGzipKb } — strip any content-hash from chunk names so before/after names match. Do NOT modify any source file.`,
      { label: 'baseline:bundle', phase: 'Baseline', schema: BUNDLE_SCHEMA }
    ),
  ...LENSES.map((l) => () =>
    agent(
      `${REPO}

${TARGET_BLOCK}

You are a READ-ONLY performance analyst for the "${l.key}" lens. Make NO edits.

Look specifically for: ${l.focus}

Read the core files completely, plus whatever they import that sits on the hot path (shared shell components, state hooks, child components rendered per-item). Every finding needs file:line evidence and a fix concrete enough to hand off. For expectedMetricImpact, name the harness scenario or bundle chunk the fix should move ("keystroke commit count for the quiz editor should drop from ~N to ~1-2"). Honest impact scores: reserve 8-10 for fixes a teacher would feel. Prefer few well-evidenced findings over a speculative list.`,
      { label: `find:${l.key}`, phase: 'Diagnose', agentType: 'Explore', schema: FINDINGS_SCHEMA }
    )
  ),
]);

if (!harnessBaseline) throw new Error('Baseline harness agent failed — cannot proceed without a baseline.');
const findings = lensResults.filter(Boolean).flatMap((r) => r.findings || []);
log(
  `Baseline recorded (${harnessBaseline.metrics.length} scenarios, ${bundleBaseline ? bundleBaseline.chunks.length + ' chunks' : 'bundle baseline FAILED'}). ${findings.length} raw findings.`
);
if (!findings.length) return { baseline: harnessBaseline, bundleBaseline, result: 'No findings — nothing to implement.' };

// ───────────────────────────────────────────────────────────────────────────
phase('Synthesize');
const ranked = await agent(
  `${REPO}

${TARGET_BLOCK}

You are the synthesis lead for a measured performance pass. Raw findings from four lenses are below, plus the recorded baseline. Produce the implementation plan:
  1. MERGE duplicates (union evidence + files), assign stable ids (P1, P2, ...).
  2. APPROVE the set to implement THIS run: high/medium impact, low/medium risk, and plausibly measurable against the baseline scenarios. Order by impact.
  3. DEFER (with reason) anything high-risk, very large, behavior-changing, or whose payoff is speculative.
  4. Keep each approved item's full files list intact — it drives conflict-free parallel scheduling.
Do not invent findings.

BASELINE (the yardstick): ${JSON.stringify(harnessBaseline.metrics)}

RAW FINDINGS (JSON):
${JSON.stringify(findings)}`,
  { label: 'synthesize', phase: 'Synthesize', schema: RANKED_SCHEMA }
);
log(`Plan: ${ranked.approved.length} approved, ${ranked.deferred.length} deferred.`);
ranked.approved.forEach((it) => log(`  [${it.id}] ${it.title} → ${it.expectedMetricImpact}`));
ranked.deferred.forEach((it) => log(`  deferred: ${it.title} — ${it.reason}`));
if (!ranked.approved.length) {
  return { baseline: harnessBaseline, bundleBaseline, ranked, result: 'Nothing approved for implementation.' };
}

// ───────────────────────────────────────────────────────────────────────────
phase('Implement');
const groups = groupByFileOverlap(ranked.approved);
log(`Implementing ${ranked.approved.length} items via ${groups.length} file-disjoint agent(s).`);
const implResults = (
  await parallel(
    groups.map((g) => () => {
      const ids = g.items.map((it) => it.id);
      const ownedFiles = [...g.files];
      const work = g.items
        .map((it) => `• [${it.id}] ${it.title}\n  Files: ${(it.files || []).join(', ')}\n  Fix: ${it.fix}\n  Must move: ${it.expectedMetricImpact}`)
        .join('\n');
      return agent(
        `${REPO}

${TARGET_BLOCK}

You are implementing approved performance items. Implement EXACTLY the item(s) below — no scope creep, no redesigns.

YOU OWN ONLY THESE FILES (do not edit outside this set; if a change truly requires another file, report it in notes instead). You may also ADD colocated *.test.tsx files for your owned components:
${ownedFiles.map((f) => `  - ${f}`).join('\n')}

ITEM(S):
${work}

REQUIREMENTS:
  - Behavior-preserving: a teacher must not be able to tell anything changed except speed/responsiveness.
  - Run "pnpm exec vitest run <existing tests for your owned files>" and "pnpm run type-check" before reporting done; fix what you broke.
  - Where a fix's correctness is non-obvious (memo equality, debounce semantics), add or extend a focused test.
  - NO suppressions ('any', ts-ignore, eslint-disable). Zero-warning lint.
  - Do NOT touch tests/perf/** (the yardstick must stay fixed) and do NOT add any Firestore/Storage/AI call.
  - Keep the diff minimal and reviewable.`,
        { label: `impl:${ids.join('+')}`, phase: 'Implement', schema: IMPLEMENT_SCHEMA }
      );
    })
  )
).filter(Boolean);
const blocked = implResults.filter((r) => r.status !== 'done');
log(`Implementation: ${implResults.length} agent(s) finished, ${blocked.length} not fully done.`);

// ───────────────────────────────────────────────────────────────────────────
phase('Verify');
// Quality gates first (with one fix round), THEN re-measure on the settled tree.
let gates = await agent(
  `${REPO}

Run the quality gates on the current working tree and report results truthfully:
  1. pnpm run type-check
  2. pnpm run lint
  3. pnpm run format:check   (if it fails, run pnpm exec prettier --write on ONLY the offending files, then re-check and report format=true)
  4. pnpm exec vitest run ${TARGET.files.map((f) => f.replace(/\/[^/]+$/, '')).filter((v, i, a) => a.indexOf(v) === i).join(' ')} tests/perf
Make NO code edits other than the prettier formatting in step 3. Include verbatim failure snippets.`,
  { label: 'gates', phase: 'Verify', schema: GATES_SCHEMA }
);
if (gates && gates.failures.length) {
  log(`Gates failed (${gates.failures.length} issue groups) — running one fix round.`);
  await agent(
    `${REPO}

The performance pass introduced the following type/lint/test failures. Fix them with MINIMAL diffs — do not revert the performance changes unless a failure proves one incorrect, and never weaken a test to make it pass. No suppressions.

FAILURES:
${gates.failures.join('\n---\n')}`,
    { label: 'fix-gates', phase: 'Verify' }
  );
  gates = await agent(
    `${REPO}

Re-run the quality gates and report truthfully (no edits except prettier --write on offending files for format):
  1. pnpm run type-check
  2. pnpm run lint
  3. pnpm run format:check
  4. pnpm exec vitest run ${TARGET.files.map((f) => f.replace(/\/[^/]+$/, '')).filter((v, i, a) => a.indexOf(v) === i).join(' ')} tests/perf`,
    { label: 'gates:recheck', phase: 'Verify', schema: GATES_SCHEMA }
  );
}

const [remeasure, bundleAfter, costAudit] = await parallel([
  () =>
    agent(
      `${REPO}

Re-run the UNCHANGED performance harness and compare against the committed baseline.
  - Command: ${harnessBaseline.runCommand}
  - Baseline: ${harnessBaseline.resultsFile} → ${JSON.stringify(harnessBaseline.metrics)}
Run it 3 times; commit counts must be stable, take median durations. The harness writes its JSON results file — copy/save the post-change numbers to tests/perf/results/${PREFIX}after.json. Compare scenario by scenario: commits are the primary verdict (lower = improved), durations are corroborating. List ANY regression honestly. Do not modify the harness or any source file.`,
      { label: 'remeasure', phase: 'Verify', schema: REMEASURE_SCHEMA }
    ),
  () =>
    agent(
      `${REPO}

Re-run "pnpm run build" and record the gzip sizes of the SAME chunks as the bundle baseline (tests/perf/results/${PREFIX}bundle-baseline.json — names are hash-stripped). Write tests/perf/results/${PREFIX}bundle-after.json in the same shape. Note new/split/removed chunks explicitly. Do not modify any source file.`,
      { label: 'bundle:after', phase: 'Verify', schema: BUNDLE_SCHEMA }
    ),
  () =>
    agent(
      `${REPO}

You are the COST AUDITOR — the hard gate for a school-district budget. Examine the full working-tree diff (git diff + git status for new files; ignore tests/perf/**). Account for every touched data path: Firestore reads/writes/listeners (onSnapshot/getDoc(s)/setDoc/updateDoc/batch), debounce intervals (a shortened debounce = more writes = NOT cost-neutral), Firebase Storage uploads/downloads, and Gemini/AI calls. costNeutral=true ONLY if nothing increased. Adversarial mindset: assume the diff hides a cost increase until proven otherwise.`,
      { label: 'cost-audit', phase: 'Verify', schema: COST_SCHEMA }
    ),
]);

const improved = (remeasure?.comparison || []).filter((c) => c.verdict === 'improved').length;
const regressed = (remeasure?.comparison || []).filter((c) => c.verdict === 'regressed').length;
log(
  `Verify: ${improved} scenarios improved, ${regressed} regressed; gates ${gates && !gates.failures.length ? 'PASS' : 'FAIL'}; cost ${costAudit?.costNeutral ? 'NEUTRAL' : 'NOT NEUTRAL — REVIEW REQUIRED'}.`
);

return {
  target: TARGET.name,
  baseline: harnessBaseline,
  bundleBaseline,
  plan: ranked,
  implementation: implResults,
  gates,
  remeasure,
  bundleAfter,
  costAudit,
};
