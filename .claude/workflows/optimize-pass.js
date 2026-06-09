export const meta = {
  name: 'optimize-pass',
  description: 'SpartBoard codebase optimization pass — phase-dispatched (explore | plan | implement) so human review gates between phases',
  whenToUse:
    'Run a structured, multi-agent optimization sweep of the SpartBoard repo. Invoke once per phase: explore (read-only fan-out → impact-ranked findings, STOP for review), plan (group approved items into file-disjoint waves), implement (build ONE wave with file-owned parallel agents; orchestrator verifies+commits between waves).',
  phases: [
    { title: 'Explore', detail: 'read-only finders, one per dimension' },
    { title: 'Critic', detail: 'completeness critic (thorough depth only)' },
    { title: 'Synthesize', detail: 'dedupe + impact-rank into one list' },
    { title: 'Plan', detail: 'bin approved items into file-disjoint waves' },
    { title: 'Implement', detail: 'one file-owned agent per item group in a wave' },
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// SpartBoard repo contract — injected into every agent so findings/fixes match
// house rules. Keep in sync with CLAUDE.md.
// ───────────────────────────────────────────────────────────────────────────
const REPO = `SpartBoard — React 19 + TypeScript + Vite classroom dashboard. Firebase (Auth/Firestore/Storage), i18next, Tailwind.

STRUCTURE: FLAT — there is NO src/ directory. All code is in root-level dirs (components/, context/, hooks/, config/, utils/, functions/). Path alias '@/' maps to the ROOT, not src/.

TOOLCHAIN: pnpm@10.30.2 (NEVER npm), Node 24+. There are TWO trees: root and functions/.
  - Type-check (both):   pnpm run type-check:all
  - Lint (zero warnings): pnpm run lint        # eslint . --max-warnings 0
  - Format check:        pnpm run format:check
  - Tests (root):        pnpm run test          # vitest run
  - Tests (root+fns):    pnpm run test:all
  - Build (both):        pnpm run build:all
  - Everything:          pnpm run validate

HOUSE RULES (hard constraints — a fix that breaks any of these is invalid):
  - NO suppressions: no 'any' without explicit justification, no @ts-ignore / @ts-expect-error, no eslint-disable, no // prettier-ignore as a shortcut. Lint runs with --max-warnings 0, so warnings fail CI too.
  - Preserve runtime behavior unless the item is explicitly a bug fix.
  - useEffect is an escape hatch, NOT a default — only to sync with an external system (Firestore, Auth, DOM, timers, Web Audio, localStorage). Derived state computes during render / useMemo; refs assign in render body; reset-on-prop uses key or the adjusting-state-while-rendering pattern.
  - Widget front-face content for skipScaling:true widgets MUST size with container-query units (cqmin), never hardcoded Tailwind text/size classes (text-sm, w-12, size={24}). Settings/back-face panels are exempt.
  - Firestore is a school-district cost line: justify every added read/write/listener; prefer fewer, narrower queries and cleaned-up onSnapshot listeners.
  - Match surrounding code style, comment density, and naming. Reference code as file:line.`;

// ───────────────────────────────────────────────────────────────────────────
// Schemas
// ───────────────────────────────────────────────────────────────────────────
const FINDING = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'dimension', 'problem', 'evidence', 'fix', 'effort', 'risk', 'impact', 'files', 'behaviorChange'],
  properties: {
    title: { type: 'string', description: 'Short imperative name for the issue' },
    dimension: { type: 'string', description: 'Which analysis dimension surfaced this' },
    problem: { type: 'string', description: 'What is wrong and the concrete consequence' },
    evidence: { type: 'array', items: { type: 'string' }, description: 'file:line references proving the issue' },
    fix: { type: 'string', description: 'Proposed change, specific enough to hand to an implementer' },
    effort: { type: 'string', enum: ['trivial', 'small', 'medium', 'large'] },
    risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    impact: { type: 'integer', minimum: 1, maximum: 10, description: '10 = highest user/perf/cost/correctness impact' },
    files: { type: 'array', items: { type: 'string' }, description: 'Files the fix would touch (for wave disjointness)' },
    behaviorChange: { type: 'boolean', description: 'true if the fix changes user-visible behavior' },
  },
};
const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: { findings: { type: 'array', items: FINDING } },
};
const RANKED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ranked'],
  properties: {
    ranked: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'problem', 'evidence', 'fix', 'effort', 'risk', 'impact', 'files', 'behaviorChange', 'rationale'],
        properties: {
          id: { type: 'string', description: 'Stable short id, e.g. F1, F2' },
          title: { type: 'string' },
          problem: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
          fix: { type: 'string' },
          effort: { type: 'string', enum: ['trivial', 'small', 'medium', 'large'] },
          risk: { type: 'string', enum: ['low', 'medium', 'high'] },
          impact: { type: 'integer', minimum: 1, maximum: 10 },
          files: { type: 'array', items: { type: 'string' } },
          behaviorChange: { type: 'boolean' },
          rationale: { type: 'string', description: 'Why it sits at this rank vs neighbors' },
        },
      },
    },
  },
};
const WAVE_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['waves'],
  properties: {
    waves: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'rationale', 'runsAlone', 'items'],
        properties: {
          name: { type: 'string' },
          rationale: { type: 'string', description: 'Why these items group here and why this slot in the sequence' },
          runsAlone: { type: 'boolean', description: 'true for invasive/behavior-changing/global items that must run in their own wave' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'title', 'files', 'fix'],
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                files: { type: 'array', items: { type: 'string' } },
                fix: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};
const IMPLEMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ids', 'status', 'filesChanged', 'testsAddedOrUpdated', 'summary'],
  properties: {
    ids: { type: 'array', items: { type: 'string' }, description: 'Finding ids this agent implemented' },
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    filesChanged: { type: 'array', items: { type: 'string' } },
    testsAddedOrUpdated: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string', description: 'What changed and how behavior was preserved' },
    notes: { type: 'string', description: 'Blockers, follow-ups, or assumptions (optional)' },
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Dimensions for the explore fan-out. Override via args.dimensions.
// ───────────────────────────────────────────────────────────────────────────
const DIMENSIONS = [
  {
    key: 'ux-a11y',
    label: 'UI/UX & accessibility',
    focus: `Visual hierarchy, glanceability on projectors, WCAG AA contrast (4.5:1 text / 3:1 large), keyboard nav, focus rings, screen-reader labels on icon-only buttons, prefers-reduced-motion, container-query scaling correctness in skipScaling widgets, dead/duplicated style controls. Cross-check against the Design Context + Widget Appearance Standard in CLAUDE.md.`,
  },
  {
    key: 'perf',
    label: 'Render/runtime performance',
    focus: `Unnecessary re-renders, missing memoization on hot paths, misuse of useEffect for derived state/state-chaining, unstable callback/object props, large lists without virtualization, heavy work in render, oversized lazy chunks, leaked timers/listeners/AudioContexts, webcam/canvas resource churn.`,
  },
  {
    key: 'data',
    label: 'Data layer / queries / network',
    focus: `Firestore read/write/listener cost (DISTRICT BUDGET — flag every avoidable read), unbounded or unindexed queries, onSnapshot listeners not cleaned up or over-broad, N+1 fetch patterns, missing debounce on writes, redundant Storage/Drive/Gemini calls, missing pagination, retries/backoff, and request waterfalls.`,
  },
  {
    key: 'correctness',
    label: 'Business-logic correctness & edge cases',
    focus: `Race conditions, stale closures, unhandled null/undefined, off-by-one, timezone/locale bugs, auth/permission gaps (canAccessWidget/canAccessFeature), Firestore rule mismatches, silent catch blocks / swallowed errors, migration edge cases, session/PIN/quiz-identity correctness. Prefer high-confidence, evidenced bugs.`,
  },
  {
    key: 'build-quality',
    label: 'Build/infra/code-quality',
    focus: `Dead code, duplicated logic ripe for extraction, type holes ('any', loose unions, unsafe casts), eslint/prettier drift, lint memory/CI config, fragile test mocks, missing test coverage on critical paths, bundle/build config, functions/ tree skew, and tech-debt that raises change-risk.`,
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

// Union items into groups where any two items sharing a file land together,
// so parallel implementers in a wave NEVER edit the same file. Handles the
// bridging case (an item that overlaps two existing groups merges them).
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

// Normalize args: the runtime may deliver the Workflow `args` global as a JSON
// string rather than a parsed object. Parse it once so ARGS.phase / ARGS.wave /
// ARGS.items resolve regardless of delivery form.
const ARGS = typeof args === 'string' ? (args.trim() ? JSON.parse(args) : {}) : (args ?? {});

// ───────────────────────────────────────────────────────────────────────────
// PHASE: explore — read-only fan-out → (optional critic) → impact-ranked list
// args: { phase:'explore', dimensions?: string[], depth?: 'normal'|'thorough', scope?: string }
// Returns: { ranked: [...] }  — orchestrator presents this and STOPS for review.
// ───────────────────────────────────────────────────────────────────────────
async function runExplore() {
  const depth = ARGS.depth || (budget.total && budget.total > 600_000 ? 'thorough' : 'normal');
  const scope = ARGS.scope ? `\n\nSCOPE LIMIT: Restrict analysis to: ${ARGS.scope}` : '';
  const chosen = ARGS.dimensions?.length
    ? DIMENSIONS.filter((d) => ARGS.dimensions.includes(d.key))
    : DIMENSIONS;

  log(`Explore: ${chosen.length} dimensions, depth=${depth}.`);
  phase('Explore');

  const perDimension = await parallel(
    chosen.map((d) => () =>
      agent(
        `${REPO}${scope}

You are a READ-ONLY analyst for the "${d.label}" dimension of a codebase optimization pass. Make NO edits.

Look specifically for: ${d.focus}

Read broadly across the relevant SpartBoard directories. For EVERY issue you report, give concrete file:line evidence — no speculation without a citation. Score impact 1-10 honestly (reserve 8-10 for issues that materially hurt teachers, performance, district cost, or correctness). List the exact files a fix would touch so the work can be scheduled into non-conflicting waves. Set behaviorChange=true if the fix would alter anything a teacher or student sees. Prefer a smaller set of well-evidenced findings over a long speculative list.`,
        { label: `find:${d.key}`, phase: 'Explore', agentType: 'Explore', schema: FINDINGS_SCHEMA }
      )
    )
  );

  let findings = perDimension.filter(Boolean).flatMap((r) => r.findings || []);
  log(`Collected ${findings.length} raw findings from ${chosen.length} dimensions.`);

  if (depth === 'thorough' && findings.length) {
    phase('Critic');
    const critic = await agent(
      `${REPO}${scope}

You are a completeness critic for a codebase optimization pass. Below are findings already collected. Find what the dimension finders MISSED — a whole subsystem not examined, a cross-cutting issue (perf+cost+correctness interacting), or a high-impact problem nobody cited. Read the repo to confirm. Report ONLY genuinely new, well-evidenced issues with file:line; do not restate existing ones.

EXISTING FINDINGS:
${findings.map((f, i) => `${i + 1}. [${f.dimension}] ${f.title} — ${(f.evidence || []).join(', ')}`).join('\n')}`,
      { label: 'critic', phase: 'Critic', agentType: 'Explore', schema: FINDINGS_SCHEMA }
    );
    const extra = (critic?.findings || []).filter(Boolean);
    log(`Critic surfaced ${extra.length} additional findings.`);
    findings = findings.concat(extra);
  }

  if (!findings.length) {
    log('No findings produced.');
    return { ranked: [] };
  }

  phase('Synthesize');
  const synthesis = await agent(
    `${REPO}

You are the synthesis lead for a codebase optimization pass. Below are raw findings from parallel analysts. Produce ONE list, highest-impact first:
  1. MERGE duplicates/overlaps into a single entry (union their evidence + files).
  2. Assign each a stable id (F1, F2, ...).
  3. Order strictly by impact (consider severity × reach × confidence; cost-saving Firestore wins and real correctness bugs rank high; cosmetic nits rank low).
  4. Keep file:line evidence and the full files list intact (needed for wave planning).
  5. Add a one-line rationale for each item's rank.
Do NOT invent new findings; only consolidate and rank what's given.

RAW FINDINGS (JSON):
${JSON.stringify(findings)}`,
    { label: 'synthesize', phase: 'Synthesize', schema: RANKED_SCHEMA }
  );

  log(`Synthesized ${synthesis.ranked.length} ranked items.`);
  return synthesis;
}

// ───────────────────────────────────────────────────────────────────────────
// PHASE: plan — bin APPROVED items into file-disjoint, impact-sequenced waves
// args: { phase:'plan', items: RankedItem[] }   (items = the subset you approved)
// Returns: { waves: [...] }
// ───────────────────────────────────────────────────────────────────────────
async function runPlan() {
  const items = ARGS.items;
  if (!Array.isArray(items) || !items.length) {
    throw new Error("plan phase requires args.items (the approved findings, each with id/title/files/fix).");
  }
  phase('Plan');
  log(`Planning waves for ${items.length} approved items.`);

  const plan = await agent(
    `${REPO}

You are sequencing approved optimization items into execution "waves" for parallel subagents. HARD RULES:
  1. Within a single wave, NO two items may list the same file — parallel agents must never collide. If items share a file, push one to a later wave.
  2. Items that are invasive, change user-visible behavior (behaviorChange), do large refactors, or make global/strict-type-style changes MUST run ALONE in their own wave (runsAlone=true), sequenced LAST.
  3. Earlier waves = lower-risk, higher-impact, file-disjoint quick wins. Later waves = the heavy/risky items.
  4. Every approved item must appear in exactly one wave. Preserve each item's id, title, files, and fix.

APPROVED ITEMS (JSON):
${JSON.stringify(items)}`,
    { label: 'plan-waves', phase: 'Plan', schema: WAVE_PLAN_SCHEMA }
  );

  // Defensive re-check: split any accidental intra-wave file collisions.
  for (const w of plan.waves) {
    const groups = groupByFileOverlap(w.items);
    const collided = groups.filter((g) => g.items.length > 1);
    if (collided.length) {
      log(`WARNING: wave "${w.name}" has file-overlapping items; implement phase will bundle them into one agent each.`);
    }
  }
  log(`Planned ${plan.waves.length} waves.`);
  return plan;
}

// ───────────────────────────────────────────────────────────────────────────
// PHASE: implement — build ONE wave. File-owned parallel agents, no collisions.
// args: { phase:'implement', wave: { name, items: [{id,title,files,fix}] } }
// Returns: { results: [...] }
// NOTE: This does NOT verify/commit. The orchestrator runs validate+build,
//       fixes fallout, commits, and pushes between waves (per the runbook).
// ───────────────────────────────────────────────────────────────────────────
async function runImplement() {
  const wave = ARGS.wave;
  if (!wave?.items?.length) {
    throw new Error("implement phase requires args.wave = { name, items: [{id,title,files,fix}] }.");
  }
  phase('Implement');

  // Bundle file-overlapping items so each parallel agent owns a disjoint file set.
  const groups = groupByFileOverlap(wave.items);
  log(`Wave "${wave.name || 'unnamed'}": ${wave.items.length} items → ${groups.length} file-disjoint agent(s).`);

  const results = await parallel(
    groups.map((g) => () => {
      const ids = g.items.map((it) => it.id);
      const ownedFiles = [...g.files];
      const work = g.items
        .map((it) => `• [${it.id}] ${it.title}\n  Files: ${(it.files || []).join(', ')}\n  Fix: ${it.fix}`)
        .join('\n');
      return agent(
        `${REPO}

You are implementing part of an approved optimization wave. Implement EXACTLY the item(s) below — no scope creep.

YOU OWN ONLY THESE FILES (do not edit any file outside this set; if a change truly requires another file, stop and report it in notes instead):
${ownedFiles.map((f) => `  - ${f}`).join('\n')}

ITEM(S):
${work}

REQUIREMENTS:
  - Match the surrounding code style, naming, and comment density.
  - Add or extend tests (vitest) that lock in the fix / guard the behavior. Colocated *.test.ts(x) or under tests/ — follow what's nearby.
  - Introduce NO suppressions: no 'any', no @ts-ignore/@ts-expect-error, no eslint-disable. Lint fails on warnings.
  - Preserve runtime behavior unless the item is explicitly a bug fix.
  - Keep the diff minimal and reviewable.
Then report exactly what you changed.`,
        { label: `impl:${ids.join('+')}`, phase: 'Implement', schema: IMPLEMENT_SCHEMA }
      );
    })
  );

  const out = results.filter(Boolean);
  const blocked = out.filter((r) => r.status !== 'done');
  log(`Wave complete: ${out.length} agent(s), ${blocked.length} not fully done. Orchestrator must now run validate+build, fix fallout, commit, push.`);
  return { results: out };
}

// ───────────────────────────────────────────────────────────────────────────
// Dispatch
// ───────────────────────────────────────────────────────────────────────────
const requestedPhase = ARGS.phase || 'explore';
log(`optimize-pass: phase="${requestedPhase}"`);

if (requestedPhase === 'explore') {
  return await runExplore();
} else if (requestedPhase === 'plan') {
  return await runPlan();
} else if (requestedPhase === 'implement') {
  return await runImplement();
} else {
  throw new Error(`Unknown phase "${requestedPhase}". Use one of: explore | plan | implement.`);
}
