import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as admin from '../firebaseAdmin';
import {
  buildWidgetConfig,
  canUseWidget,
  widgetConfigSources,
  type WidgetAccessContext,
} from './boardConfig';
import { checkWidgetSettings } from './widgetConfigValidator';
import { WIDGET_CONFIG_RUNTIME } from './widgetConfigRuntime.gen';
import { WIDGET_CONFIG_SCHEMAS } from './widgetConfigSchemas.gen';
import { WIDGET_TYPE_LIST } from './widgetTypeList';

const archive = vi.hoisted(() => ({
  featureGranted: true,
  tier: 'internal',
  beta: false,
}));

vi.mock('../quizMediaArchive', () => ({
  isGlobalFeatureGranted: vi.fn(() => Promise.resolve(archive.featureGranted)),
  deriveTeacherTier: vi.fn(() => Promise.resolve(archive.tier)),
  isBetaTeacher: vi.fn(() => Promise.resolve(archive.beta)),
  meetsMinTierServer: (tier: string, min: unknown) => {
    const rank: Record<string, number> = { free: 0, org: 1, internal: 2 };
    return typeof min !== 'string' || (rank[tier] ?? 0) >= (rank[min] ?? 0);
  },
}));

const ctx = (over: Partial<WidgetAccessContext> = {}): WidgetAccessContext => ({
  db: {} as admin.firestore.Firestore,
  uid: 'teacher-1',
  email: 'teacher@orono.k12.mn.us',
  isAdmin: false,
  featurePermissions: [],
  selectedBuildings: ['middle'],
  savedWidgetConfigs: {},
  ...over,
});

beforeEach(() => {
  archive.featureGranted = true;
  archive.tier = 'internal';
  archive.beta = false;
});

describe('widget config schemas', () => {
  it('has a schema for every widget type Claude can add', () => {
    for (const type of WIDGET_TYPE_LIST)
      expect(WIDGET_CONFIG_SCHEMAS.widgets[type], type).toBeDefined();
  });

  // Default keys no config type declares; the widget never reads them.
  const DEAD_DEFAULT_KEYS: Record<string, string[]> = {
    stickers: ['cardColor', 'cardOpacity'],
    'syntax-framer': ['fontSize'],
  };

  it("accepts every widget's built-in defaults", () => {
    for (const [type, def] of Object.entries(WIDGET_CONFIG_RUNTIME.defaults)) {
      const dead = DEAD_DEFAULT_KEYS[type] ?? [];
      const config = Object.fromEntries(
        Object.entries(def.config ?? {}).filter(([k]) => !dead.includes(k))
      );
      const result = checkWidgetSettings(type, config);
      expect(result.ok ? [] : result.errors, type).toEqual([]);
    }
  });
});

describe('checkWidgetSettings', () => {
  it('names the setting and the type Claude got wrong', () => {
    const result = checkWidgetSettings('time-tool', { duration: '5 minutes' });
    expect(result).toEqual({
      ok: false,
      errors: ['`time-tool.duration` must be a number'],
    });
  });

  it('lists the allowed values for a choice', () => {
    const result = checkWidgetSettings('time-tool', { mode: 'alarm' });
    expect(result.ok ? [] : result.errors).toEqual([
      '`time-tool.mode` must be one of "timer", "stopwatch"',
    ]);
  });

  it('refuses a setting the widget does not have and lists the real ones', () => {
    const result = checkWidgetSettings('time-tool', { seconds: 300 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(
      /^`time-tool` has no setting "seconds"; its settings are .*"duration"/
    );
  });

  it('points into nested items by index', () => {
    const result = checkWidgetSettings('checklist', {
      items: [{ text: 'Read', completed: false }, { text: 7 }],
    });
    expect(result.ok ? [] : result.errors).toContain(
      '`checklist.items[1].text` must be a string'
    );
  });

  it('fills the item ids Claude leaves out', () => {
    const result = checkWidgetSettings('checklist', {
      items: [{ text: 'Read', completed: false }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [item] = result.settings.items as Array<Record<string, unknown>>;
    expect(item.id).toEqual(expect.any(String));
  });

  it('keeps ids Claude does send', () => {
    const result = checkWidgetSettings('checklist', {
      items: [{ id: 'keep-me', text: 'Read', completed: false }],
    });
    expect(result.ok && result.settings.items).toEqual([
      { id: 'keep-me', text: 'Read', completed: false },
    ]);
  });

  it('refuses something that is not a widget or not an object', () => {
    expect(checkWidgetSettings('nope', {}).ok).toBe(false);
    expect(checkWidgetSettings('clock', 'big').ok).toBe(false);
    expect(checkWidgetSettings('clock', undefined)).toEqual({
      ok: true,
      settings: {},
    });
  });

  it('fills ids inside a union picked by its discriminator', () => {
    const result = checkWidgetSettings('drawing', {
      objects: [{ kind: 'path', z: 1, color: '#000', width: 2, points: [] }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [obj] = result.settings.objects as Array<Record<string, unknown>>;
    expect(obj.id).toEqual(expect.any(String));
  });

  it('refuses prototype keys anywhere in the settings', () => {
    const settings = JSON.parse(
      '{"items":[{"text":"a","completed":false,"__proto__":{"x":1}}]}'
    ) as unknown;
    expect(checkWidgetSettings('checklist', settings)).toEqual({
      ok: false,
      errors: ['"__proto__" is not an allowed setting name'],
    });
  });

  it('refuses oversized settings before validating them', () => {
    const result = checkWidgetSettings('text', {
      content: 'x'.repeat(300 * 1024),
    });
    expect(result.ok ? [] : result.errors[0]).toMatch(/too large/);
  });

  it('caps a long error list', () => {
    const bad = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`x${i}`, 1])
    );
    const result = checkWidgetSettings('clock', bad);
    expect(result.ok ? [] : result.errors).toHaveLength(11);
  });
});

describe('buildWidgetConfig', () => {
  it('layers defaults, building defaults, saved appearance and then Claude', () => {
    const result = buildWidgetConfig(
      'text',
      { content: 'Welcome back' },
      {
        buildingDefaults: { bgColor: '#fef08a', fontSize: 30 },
        savedAppearance: { fontSize: 24, content: 'Leaked from another board' },
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.content).toBe('Welcome back');
    expect(result.config.bgColor).toBe('#fef08a');
    expect(result.config.fontSize).toBe(24);
  });

  it('drops saved keys outside the appearance allowlist', () => {
    const result = buildWidgetConfig(
      'checklist',
      {},
      {
        savedAppearance: {
          items: [{ id: 'a', text: 'Other board', completed: false }],
          scaleMultiplier: 1.5,
        },
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.items).toEqual(
      WIDGET_CONFIG_RUNTIME.defaults.checklist.config?.items
    );
    expect(result.config.scaleMultiplier).toBe(1.5);
  });

  it('returns the validation errors instead of a config', () => {
    expect(buildWidgetConfig('time-tool', { duration: 'soon' })).toEqual({
      ok: false,
      errors: ['`time-tool.duration` must be a number'],
    });
  });

  it('never hands out the shared defaults object', () => {
    const a = buildWidgetConfig('checklist', {});
    if (!a.ok) throw new Error('expected a config');
    (a.config.items as unknown[]).push('mutated');
    const b = buildWidgetConfig('checklist', {});
    expect(b.ok && (b.config.items as unknown[])).not.toContain('mutated');
  });

  it('starts a timer at its new length', () => {
    const result = buildWidgetConfig('time-tool', { duration: 300 });
    expect(result.ok && result.config.elapsedTime).toBe(300);
    const stopwatch = buildWidgetConfig('time-tool', { mode: 'stopwatch' });
    expect(stopwatch.ok && stopwatch.config.elapsedTime).toBe(0);
  });

  it('applies the admin building defaults the app would', () => {
    const sources = widgetConfigSources(
      ctx({
        featurePermissions: [
          {
            widgetType: 'time-tool',
            enabled: true,
            accessLevel: 'public',
            betaUsers: [],
            config: {
              buildingDefaults: {
                'orono-middle-school': { duration: 120, mode: 'timer' },
              },
            },
          },
        ],
      }),
      'time-tool'
    );
    expect(sources.buildingDefaults).toMatchObject({
      duration: 120,
      elapsedTime: 120,
    });
    const result = buildWidgetConfig('time-tool', {}, sources);
    expect(result.ok && result.config.duration).toBe(120);
  });

  it('seeds a Materials widget from the teacher preferences, under Claude', () => {
    const sources = widgetConfigSources(
      ctx({
        materialsPreferences: {
          selectedItems: ['pencil'],
          title: 'You need',
        },
      }),
      'materials'
    );
    const result = buildWidgetConfig('materials', { title: 'Bring' }, sources);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.selectedItems).toEqual(['pencil']);
    expect(result.config.title).toBe('Bring');
    expect(widgetConfigSources(ctx(), 'text').materialsPreferences).toBe(
      undefined
    );
  });

  it('reads saved appearance per widget type', () => {
    const sources = widgetConfigSources(
      ctx({ savedWidgetConfigs: { text: { fontSize: 40 } } }),
      'text'
    );
    expect(sources.savedAppearance).toEqual({ fontSize: 40 });
  });
});

describe('canUseWidget', () => {
  const perm = (over: Record<string, unknown> = {}) => ({
    widgetType: 'poll',
    enabled: true,
    accessLevel: 'public',
    betaUsers: [],
    ...over,
  });

  it('allows a widget with no permission record', async () => {
    expect(await canUseWidget(ctx(), 'poll')).toEqual({ ok: true });
  });

  it('refuses a widget turned off for everyone, admins included', async () => {
    const result = await canUseWidget(
      ctx({ isAdmin: true, featurePermissions: [perm({ enabled: false })] }),
      'poll'
    );
    expect(result).toMatchObject({ ok: false, reason: 'disabled' });
  });

  it('refuses admin-only widgets to teachers and allows them to admins', async () => {
    const perms = [perm({ accessLevel: 'admin' })];
    expect(
      await canUseWidget(ctx({ featurePermissions: perms }), 'poll')
    ).toMatchObject({ ok: false, reason: 'no-access' });
    expect(
      await canUseWidget(
        ctx({ isAdmin: true, featurePermissions: perms }),
        'poll'
      )
    ).toEqual({ ok: true });
  });

  it('keeps missing-doc admin defaults closed to teachers', async () => {
    expect(await canUseWidget(ctx(), 'flashcards')).toMatchObject({
      ok: false,
    });
    expect(await canUseWidget(ctx({ isAdmin: true }), 'flashcards')).toEqual({
      ok: true,
    });
  });

  it('checks the beta list', async () => {
    const perms = [perm({ accessLevel: 'beta' })];
    expect(
      (await canUseWidget(ctx({ featurePermissions: perms }), 'poll')).ok
    ).toBe(false);
    archive.beta = true;
    expect(
      (await canUseWidget(ctx({ featurePermissions: perms }), 'poll')).ok
    ).toBe(true);
  });

  it('reads the beta grant once per widget type for a whole board', async () => {
    const { isBetaTeacher } = await import('../quizMediaArchive');
    vi.mocked(isBetaTeacher).mockClear();
    const shared = ctx({ featurePermissions: [perm({ accessLevel: 'beta' })] });
    await canUseWidget(shared, 'poll');
    await canUseWidget(shared, 'poll');
    expect(isBetaTeacher).toHaveBeenCalledTimes(1);
  });

  it('applies the tier floor', async () => {
    archive.tier = 'free';
    expect((await canUseWidget(ctx(), 'calendar')).ok).toBe(false);
    const perms = [perm({ minTier: 'org' })];
    expect(
      (await canUseWidget(ctx({ featurePermissions: perms }), 'poll')).ok
    ).toBe(false);
  });

  it('refuses a widget switched off for every one of the teacher buildings', async () => {
    const perms = [
      perm({ config: { dockDefaults: { 'orono-middle-school': false } } }),
    ];
    expect(
      (await canUseWidget(ctx({ featurePermissions: perms }), 'poll')).ok
    ).toBe(false);
    expect(
      (
        await canUseWidget(
          ctx({
            featurePermissions: perms,
            selectedBuildings: ['middle', 'high'],
          }),
          'poll'
        )
      ).ok
    ).toBe(true);
  });

  it('needs the routine-guide feature for the Routine Guide widget', async () => {
    archive.featureGranted = false;
    expect(
      (await canUseWidget(ctx({ isAdmin: true }), 'routineGuide')).ok
    ).toBe(false);
  });

  it('refuses types that are not widgets teachers add', async () => {
    expect(await canUseWidget(ctx({ isAdmin: true }), 'sticker')).toMatchObject(
      {
        ok: false,
        reason: 'unknown',
      }
    );
    expect((await canUseWidget(ctx({ isAdmin: true }), 'nope')).ok).toBe(false);
  });
});
