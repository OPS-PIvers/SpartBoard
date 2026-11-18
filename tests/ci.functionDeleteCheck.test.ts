// Guards function-delete-check.mjs: a deploy may never delete a function some codebase still exports,
// and after a deploy every live label must match functions/codebases.json.
import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = resolve(repoRoot, '.github/scripts/function-delete-check.mjs');

interface Live {
  id: string;
  codebase?: string;
  managed?: boolean;
  createTime?: string;
}

const apiResponse = (live: Live[]) => ({
  functions: live.map((f) => ({
    name: `projects/demo/locations/us-central1/functions/${f.id}`,
    labels: {
      ...(f.managed === false ? {} : { 'deployment-tool': 'cli-firebase' }),
      ...(f.codebase ? { 'firebase-functions-codebase': f.codebase } : {}),
    },
    createTime: f.createTime ?? '2026-01-01T00:00:00Z',
  })),
});

// A repo with two codebases: orgAdminV1 belongs to admin, fetchLinkPreview to default.
function withRepo(
  run: (
    check: (...args: string[]) => Result,
    setLive: (live: Live[]) => void,
    root: string
  ) => void
) {
  const root = mkdtempSync(join(tmpdir(), 'delete-check-'));
  const files: Record<string, string> = {
    'functions/lib/index.js': [
      'const fn = () => Object.assign(() => {}, { __endpoint: {} });',
      'exports.orgAdminV1 = fn();',
      'exports.fetchLinkPreview = fn();',
      'exports.helper = () => {};',
    ].join('\n'),
    'firebase.json': JSON.stringify({
      functions: [
        { source: 'functions/deploy/default', codebase: 'default' },
        { source: 'functions/deploy/admin', codebase: 'admin' },
      ],
    }),
    'functions/codebases.json': JSON.stringify({
      codebases: { admin: ['orgAdminV1'] },
    }),
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  const liveFile = join(root, 'live.json');
  const snapshot = join(root, 'snapshot.json');
  const setLive = (live: Live[]) =>
    writeFileSync(liveFile, JSON.stringify(apiResponse(live)));
  const check = (...args: string[]): Result => {
    const result = spawnSync('node', [script, ...args], {
      cwd: root,
      encoding: 'utf-8',
      env: {
        ...process.env,
        LIVE_FUNCTIONS_JSON: liveFile,
        FUNCTION_SNAPSHOT_FILE: snapshot,
      },
    });
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
    };
  };
  try {
    run(check, setLive, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

interface Result {
  status: number | null;
  output: string;
}

describe('function-delete-check.mjs before a deploy', () => {
  it('lets every codebase deploy together claim a function that moved', () => {
    withRepo((check, setLive) => {
      setLive([{ id: 'orgAdminV1' }, { id: 'fetchLinkPreview' }]);
      const result = check('pre', 'demo', 'functions,storage');
      expect(result.status).toBe(0);
      expect(result.output).toContain('0 removals');
    });
  });

  it('fails when the old codebase deploys without the moved function’s new one', () => {
    withRepo((check, setLive) => {
      setLive([{ id: 'orgAdminV1' }, { id: 'fetchLinkPreview' }]);
      const result = check('pre', 'demo', 'functions:default,storage');
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'orgAdminV1 (live in default, now admin)'
      );
      // A bare name means the default codebase, so it would delete the moved function too.
      expect(check('pre', 'demo', 'functions:orgAdminV1').status).toBe(1);
    });
  });

  it('passes a named deploy, which only touches the functions it names', () => {
    withRepo((check, setLive) => {
      setLive([{ id: 'orgAdminV1' }, { id: 'fetchLinkPreview' }]);
      expect(
        check('pre', 'demo', 'functions:default:fetchLinkPreview').status
      ).toBe(0);
      expect(check('pre', 'demo', 'functions:admin:orgAdminV1').status).toBe(0);
      expect(check('pre', 'demo', 'functions:admin').status).toBe(0);
    });
  });

  it('lets a function removed from the code delete as today', () => {
    withRepo((check, setLive) => {
      setLive([
        { id: 'orgAdminV1', codebase: 'admin' },
        { id: 'fetchLinkPreview' },
        { id: 'previewOnlyV1' },
        { id: 'notOurs', managed: false },
      ]);
      const result = check('pre', 'demo', 'functions');
      expect(result.status).toBe(0);
      expect(result.output).toContain('Will delete previewOnlyV1');
      expect(result.output).not.toContain('notOurs');
      // Only a deployed codebase deletes its own labels.
      expect(check('pre', 'demo', 'functions:admin').output).toContain(
        '0 removals'
      );
    });
  });

  it('fails when the manifest names a codebase firebase.json does not deploy', () => {
    withRepo((check, setLive, root) => {
      setLive([]);
      writeFileSync(
        join(root, 'firebase.json'),
        JSON.stringify({
          functions: { source: 'functions', codebase: 'default' },
        })
      );
      const result = check('pre', 'demo', 'functions');
      expect(result.status).toBe(1);
      expect(result.output).toContain("puts orgAdminV1 in 'admin'");
    });
  });
});

describe('function-delete-check.mjs after a deploy', () => {
  it('passes when every live label matches the manifest', () => {
    withRepo((check, setLive) => {
      setLive([
        { id: 'orgAdminV1', codebase: 'admin' },
        { id: 'fetchLinkPreview' },
      ]);
      expect(check('post', 'demo').status).toBe(0);
    });
  });

  it('fails when a function is still labelled with its old codebase', () => {
    withRepo((check, setLive) => {
      setLive([{ id: 'orgAdminV1' }, { id: 'fetchLinkPreview' }]);
      const result = check('post', 'demo');
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        "orgAdminV1 is live in 'default' but belongs to 'admin'"
      );
    });
  });

  it('fails when a move recreated the function instead of updating it', () => {
    withRepo((check, setLive) => {
      setLive([{ id: 'orgAdminV1' }, { id: 'fetchLinkPreview' }]);
      expect(check('pre', 'demo', 'functions').status).toBe(0);
      setLive([
        {
          id: 'orgAdminV1',
          codebase: 'admin',
          createTime: '2026-11-18T00:00:00Z',
        },
        { id: 'fetchLinkPreview' },
      ]);
      const result = check('post', 'demo');
      expect(result.status).toBe(1);
      expect(result.output).toContain('by being recreated');
      setLive([
        { id: 'orgAdminV1', codebase: 'admin' },
        { id: 'fetchLinkPreview' },
      ]);
      expect(check('post', 'demo').status).toBe(0);
    });
  });
});
