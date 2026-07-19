import {
  FeaturePermission,
  GRAPHIC_ORGANIZER_LAYOUT_TYPES,
  MaterialsGlobalConfig,
  NextUpConfig,
  NumberLineJump,
  NumberLineMarker,
  WidgetType,
} from '@/types';
import { canonicalizeBuildingKeyedRecord } from '@/config/buildings';
import { FONTS } from '@/config/fonts';
import {
  TIME_TOOL_MODES,
  TIME_TOOL_VISUAL_TYPES,
  TIME_TOOL_SOUNDS,
  TIME_TOOL_CLOCK_STYLES,
  TIME_TOOL_MAX_DURATION_SECONDS,
} from '@/config/timeTool';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { getMaterialsCatalog } from '@/components/widgets/MaterialsWidget/constants';

/**
 * Validates a CSS hex color string. Accepts the three forms an HTML color
 * picker / Tailwind palette can emit: `#abc` (shortform), `#aabbcc`
 * (standard), `#aabbccdd` (with alpha). Mirrors the panel-side `isValidHex`
 * helper so admin-side validators don't silently accept malformed values
 * (`'banana'`, `'rgb(0,0,0)'`, `'#fff '` with stray whitespace) that would
 * round-trip through Firestore and degrade downstream widgets.
 */
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR_RE.test(value);

/**
 * The `GlobalFontFamily` union values, used to validate per-building
 * `fontFamily` defaults so an admin can only persist a font the widgets
 * actually know how to render. Mirrors the `GlobalFontFamily` type in
 * `types.ts` — kept as a runtime array because TypeScript unions are
 * erased at runtime and the validator needs a membership check.
 */
const VALID_FONT_FAMILIES = [
  'sans',
  'serif',
  'mono',
  'handwritten',
  'rounded',
  'fun',
  'comic',
  'slab',
  'retro',
  'marker',
  'cursive',
] as const;
const isGlobalFontFamily = (value: unknown): value is string =>
  typeof value === 'string' &&
  (VALID_FONT_FAMILIES as readonly string[]).includes(value);

/**
 * The prefixed `FONTS`-id value space written by the shared `TypographySettings`
 * primitive (`'font-sans'`, `'font-mono'`, …). Distinct from the bare
 * `GlobalFontFamily` set above: widgets that use `TypographySettings`
 * (e.g. `stations`) store and consume these prefixed ids, decoded by
 * `getFontClass()`. Derived from `FONTS` (minus the `'global'` sentinel, which
 * is persisted as absence) so the validator stays in lockstep with the panel.
 */
const VALID_WIDGET_FONT_FAMILIES = FONTS.map((f) => f.id).filter(
  (id) => id !== 'global'
);
const isWidgetFontFamily = (value: unknown): value is string =>
  typeof value === 'string' &&
  (VALID_WIDGET_FONT_FAMILIES as readonly string[]).includes(value);

/**
 * Validates a `cardOpacity` default: a finite number within the panel slider's
 * `0–1` range. Shared by every widget case that exposes a card-surface opacity
 * default so the range check lives in one place — previously this four-line
 * guard was copy-pasted across the `numberLine`, `checklist`, `stations`, and
 * `concept-web` cases, where one copy had already drifted in structure.
 */
const isCardOpacity = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

/**
 * The non-null `timerEndTrafficColor` values a TimeTool building default may
 * carry (the panel also allows `null` = "None"). Hoisted to module scope for
 * consistency with the other module-level validators rather than re-allocating
 * inside the `time-tool` case on every call.
 */
const VALID_TRAFFIC_COLORS = ['red', 'yellow', 'green'] as const;

// Validates admin-stored markers: requires non-empty id, finite value, hex color; drops malformed/dup-id entries.
const sanitizeNumberLineMarkers = (value: unknown): NumberLineMarker[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: NumberLineMarker[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.id !== 'string' || rec.id.trim() === '') continue;
    const id = rec.id.trim();
    if (typeof rec.value !== 'number' || !Number.isFinite(rec.value)) continue;
    if (!isHexColor(rec.color)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const marker: NumberLineMarker = {
      id,
      value: rec.value,
      color: rec.color,
    };
    if (typeof rec.label === 'string' && rec.label.trim() !== '')
      marker.label = rec.label.trim();
    out.push(marker);
  }
  return out;
};

// Validates admin-stored jumps: requires non-empty id, finite startValue/endValue; drops malformed/dup-id entries.
const sanitizeNumberLineJumps = (value: unknown): NumberLineJump[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: NumberLineJump[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.id !== 'string' || rec.id.trim() === '') continue;
    const id = rec.id.trim();
    if (typeof rec.startValue !== 'number' || !Number.isFinite(rec.startValue))
      continue;
    if (typeof rec.endValue !== 'number' || !Number.isFinite(rec.endValue))
      continue;
    if (rec.startValue === rec.endValue) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const jump: NumberLineJump = {
      id,
      startValue: rec.startValue,
      endValue: rec.endValue,
    };
    if (typeof rec.label === 'string' && rec.label.trim() !== '')
      jump.label = rec.label.trim();
    out.push(jump);
  }
  return out;
};

/**
 * Extracts building-level config overrides for a widget type from the admin's
 * feature_permissions config. These are applied between widget defaults and
 * explicit overrides so that per-building admin settings pre-configure new
 * widget instances for the teacher's building.
 *
 * Pure helper — moved out of `context/DashboardContext.tsx` so the validation
 * logic is independently testable and the context file shrinks.
 */
export const getAdminBuildingConfig = (
  type: WidgetType,
  featurePermissions: FeaturePermission[],
  selectedBuildings: string[]
): Record<string, unknown> => {
  if (!selectedBuildings.length) return {};
  const buildingId = selectedBuildings[0];
  const perm = featurePermissions.find((p) => p.widgetType === type);
  const rawBuildingDefaults = (
    perm?.config as
      | { buildingDefaults?: Record<string, Record<string, unknown>> }
      | undefined
  )?.buildingDefaults;
  // Same legacy-key issue as `dockDefaults` — canonicalize so
  // `orono-high-school`-keyed entries still resolve for canonical
  // `buildingId` lookups.
  const buildingDefaults = rawBuildingDefaults
    ? canonicalizeBuildingKeyedRecord(rawBuildingDefaults)
    : undefined;
  const raw = buildingDefaults?.[buildingId];
  if (!raw) return {};

  const out: Record<string, unknown> = {};
  switch (type) {
    case 'seating-chart': {
      let validRosterMode: 'class' | 'custom' | undefined;
      if (typeof raw.rosterMode === 'string') {
        if (raw.rosterMode === 'class' || raw.rosterMode === 'custom') {
          validRosterMode = raw.rosterMode;
          out.rosterMode = validRosterMode;
        }
      }
      break;
    }
    case 'reveal-grid': {
      const validRevealModes = ['flip', 'fade'] as const;
      const validRevealFonts = [
        'sans',
        'serif',
        'mono',
        'handwritten',
        'rounded',
        'fun',
        'comic',
        'slab',
        'retro',
        'marker',
        'cursive',
      ] as const;
      const validColumns = [2, 3, 4, 5] as const;
      if (
        typeof raw.columns === 'number' &&
        (validColumns as readonly number[]).includes(raw.columns)
      )
        out.columns = raw.columns;
      if (
        typeof raw.revealMode === 'string' &&
        (validRevealModes as readonly string[]).includes(raw.revealMode)
      )
        out.revealMode = raw.revealMode;
      if (
        typeof raw.fontFamily === 'string' &&
        (validRevealFonts as readonly string[]).includes(raw.fontFamily)
      )
        out.fontFamily = raw.fontFamily;
      if (
        typeof raw.defaultCardColor === 'string' &&
        raw.defaultCardColor.trim() !== ''
      )
        out.defaultCardColor = raw.defaultCardColor;
      if (
        typeof raw.defaultCardBackColor === 'string' &&
        raw.defaultCardBackColor.trim() !== ''
      )
        out.defaultCardBackColor = raw.defaultCardBackColor;
      break;
    }
    case 'smartNotebook': {
      const storageLimit = (raw as { storageLimitMb?: unknown }).storageLimitMb;
      if (typeof storageLimit === 'number' && Number.isFinite(storageLimit)) {
        const clampedStorageLimit = Math.max(0, storageLimit);
        out.storageLimitMb = clampedStorageLimit;
      }
      // Only `storageLimitMb` is admin-configurable. The appearance fields
      // (cardColor/cardOpacity/fontFamily/fontColor) in SmartNotebookConfig are
      // intentionally user-level only — SmartNotebook renders image/SVG pages
      // and themes no surface/text, so building defaults for them would set
      // values the widget never reads. See SmartNotebookConfig in types.ts.
      break;
    }
    case 'numberLine': {
      const validDisplayModes = ['integers', 'decimals', 'fractions'] as const;
      if (typeof raw.min === 'number' && Number.isFinite(raw.min))
        out.min = raw.min;
      if (typeof raw.max === 'number' && Number.isFinite(raw.max))
        out.max = raw.max;
      if (
        typeof raw.step === 'number' &&
        Number.isFinite(raw.step) &&
        raw.step > 0
      )
        out.step = raw.step;
      if (
        typeof raw.displayMode === 'string' &&
        (validDisplayModes as readonly string[]).includes(raw.displayMode)
      )
        out.displayMode = raw.displayMode;
      if (typeof raw.showArrows === 'boolean') out.showArrows = raw.showArrows;
      if (isHexColor(raw.cardColor)) out.cardColor = raw.cardColor;
      if (isCardOpacity(raw.cardOpacity)) out.cardOpacity = raw.cardOpacity;
      if (isGlobalFontFamily(raw.fontFamily)) out.fontFamily = raw.fontFamily;
      if (isHexColor(raw.fontColor)) out.fontColor = raw.fontColor;
      // Only seed when ≥1 entry survives — empty means "unconfigured", not "explicitly cleared to none".
      const markers = sanitizeNumberLineMarkers(raw.markers);
      if (markers.length > 0) out.markers = markers;
      const jumps = sanitizeNumberLineJumps(raw.jumps);
      if (jumps.length > 0) out.jumps = jumps;
      break;
    }
    case 'syntax-framer':
      if (
        typeof raw.mode === 'string' &&
        (raw.mode === 'text' || raw.mode === 'math')
      ) {
        out.mode = raw.mode;
      }
      if (
        typeof raw.alignment === 'string' &&
        (raw.alignment === 'left' || raw.alignment === 'center')
      ) {
        out.alignment = raw.alignment;
      }
      break;
    case 'clock': {
      // Clock and TimeTool share one display-style vocabulary — identical
      // values and the same `widgets.clock.styles.*` i18n keys — so both
      // reference the single shared constant rather than re-declaring it.
      if (typeof raw.format24 === 'boolean') out.format24 = raw.format24;
      if (raw.fontFamily) out.fontFamily = raw.fontFamily;
      if (raw.themeColor) out.themeColor = raw.themeColor;
      if (
        typeof raw.clockStyle === 'string' &&
        (TIME_TOOL_CLOCK_STYLES as readonly string[]).includes(raw.clockStyle)
      ) {
        out.clockStyle = raw.clockStyle;
      }
      if (typeof raw.glow === 'boolean') out.glow = raw.glow;
      break;
    }
    case 'breathing': {
      const validPatterns = ['4-4-4-4', '4-7-8', '5-5'] as const;
      const validVisuals = ['circle', 'lotus', 'wave'] as const;
      if (
        typeof raw.pattern === 'string' &&
        (validPatterns as readonly string[]).includes(raw.pattern)
      )
        out.pattern = raw.pattern;
      if (
        typeof raw.visual === 'string' &&
        (validVisuals as readonly string[]).includes(raw.visual)
      )
        out.visual = raw.visual;
      if (typeof raw.color === 'string' && raw.color.trim() !== '')
        out.color = raw.color;
      break;
    }
    case 'time-tool': {
      let mode: 'timer' | 'stopwatch' | undefined;
      if (
        typeof raw.mode === 'string' &&
        (TIME_TOOL_MODES as readonly string[]).includes(raw.mode)
      ) {
        mode = raw.mode as 'timer' | 'stopwatch';
        out.mode = mode;
      }
      if (typeof raw.duration === 'number' && Number.isFinite(raw.duration)) {
        // Clamp to the shared panel input ceiling so a malformed/oversized
        // value can't overflow the timer readout layout.
        const clampedDuration = Math.max(
          0,
          Math.min(TIME_TOOL_MAX_DURATION_SECONDS, Math.round(raw.duration))
        );
        out.duration = clampedDuration;
        // A timer counts down from `duration`, so seed elapsedTime to the full
        // value; a stopwatch counts up from zero. The base widget default seeds
        // elapsedTime=600 for timer mode, so reset it when defaulting to a
        // stopwatch (otherwise a new stopwatch would start at 600s).
        out.elapsedTime = mode === 'stopwatch' ? 0 : clampedDuration;
      } else if (mode === 'stopwatch') {
        out.elapsedTime = 0;
      }
      if (
        typeof raw.visualType === 'string' &&
        (TIME_TOOL_VISUAL_TYPES as readonly string[]).includes(raw.visualType)
      )
        out.visualType = raw.visualType;
      if (
        typeof raw.selectedSound === 'string' &&
        (TIME_TOOL_SOUNDS as readonly string[]).includes(raw.selectedSound)
      )
        out.selectedSound = raw.selectedSound;
      if (isHexColor(raw.themeColor)) out.themeColor = raw.themeColor;
      if (typeof raw.glow === 'boolean') out.glow = raw.glow;
      // TimeTool's appearance panel uses the shared TypographySettings primitive,
      // so `fontFamily` lives in the prefixed `FONTS`-id space (like `stations`).
      if (isWidgetFontFamily(raw.fontFamily)) out.fontFamily = raw.fontFamily;
      if (
        typeof raw.clockStyle === 'string' &&
        (TIME_TOOL_CLOCK_STYLES as readonly string[]).includes(raw.clockStyle)
      )
        out.clockStyle = raw.clockStyle;
      if (
        raw.timerEndTrafficColor === null ||
        (typeof raw.timerEndTrafficColor === 'string' &&
          (VALID_TRAFFIC_COLORS as readonly string[]).includes(
            raw.timerEndTrafficColor
          ))
      )
        out.timerEndTrafficColor = raw.timerEndTrafficColor;
      if (typeof raw.timerEndTriggerRandom === 'boolean')
        out.timerEndTriggerRandom = raw.timerEndTriggerRandom;
      if (typeof raw.timerEndTriggerNextUp === 'boolean')
        out.timerEndTriggerNextUp = raw.timerEndTriggerNextUp;
      if (typeof raw.timerEndTriggerStationsRotate === 'boolean')
        out.timerEndTriggerStationsRotate = raw.timerEndTriggerStationsRotate;
      break;
    }
    case 'checklist':
      if (Array.isArray(raw.items) && raw.items.length > 0) {
        out.items = (raw.items as Array<{ id: string; text: string }>).map(
          (item) => ({
            id: crypto.randomUUID(),
            text: item.text,
            completed: false,
          })
        );
      }
      if (
        typeof raw.scaleMultiplier === 'number' &&
        Number.isFinite(raw.scaleMultiplier)
      )
        // Clamp to the panel slider's range so a malformed/out-of-range value
        // can't break the widget layout; in-range legacy values pass through.
        out.scaleMultiplier = Math.max(0.5, Math.min(2.5, raw.scaleMultiplier));
      if (isGlobalFontFamily(raw.fontFamily)) out.fontFamily = raw.fontFamily;
      if (isHexColor(raw.cardColor)) out.cardColor = raw.cardColor;
      if (isCardOpacity(raw.cardOpacity)) out.cardOpacity = raw.cardOpacity;
      if (isHexColor(raw.fontColor)) out.fontColor = raw.fontColor;
      break;
    case 'stations':
      // `stations` uses the shared TypographySettings/SurfaceColorSettings
      // primitives, so fontFamily lives in the prefixed `FONTS`-id space
      // (validated by `isWidgetFontFamily`, not the bare GlobalFontFamily set).
      if (isWidgetFontFamily(raw.fontFamily)) out.fontFamily = raw.fontFamily;
      if (isHexColor(raw.fontColor)) out.fontColor = raw.fontColor;
      if (isHexColor(raw.cardColor)) out.cardColor = raw.cardColor;
      if (isCardOpacity(raw.cardOpacity)) out.cardOpacity = raw.cardOpacity;
      break;
    case 'need-do-put-then': {
      // Like `stations`, the widget uses the shared TypographySettings /
      // SurfaceColorSettings / TextSizePresetSettings primitives, so
      // `fontFamily` is a prefixed `FONTS`-id (validated by
      // `isWidgetFontFamily`). All five fields are actively consumed by
      // NeedDoPutThen/Widget.tsx (getFontClass, hexToRgba, fontColor,
      // resolveTextPresetMultiplier).
      const validTextSizePresets = [
        'small',
        'medium',
        'large',
        'x-large',
      ] as const;
      if (isWidgetFontFamily(raw.fontFamily)) out.fontFamily = raw.fontFamily;
      if (isHexColor(raw.fontColor)) out.fontColor = raw.fontColor;
      if (isHexColor(raw.cardColor)) out.cardColor = raw.cardColor;
      if (isCardOpacity(raw.cardOpacity)) out.cardOpacity = raw.cardOpacity;
      if (
        typeof raw.textSizePreset === 'string' &&
        (validTextSizePresets as readonly string[]).includes(raw.textSizePreset)
      )
        out.textSizePreset = raw.textSizePreset;
      break;
    }
    case 'sound':
      if (raw.visual) out.visual = raw.visual;
      if (raw.sensitivity !== undefined) out.sensitivity = raw.sensitivity;
      break;
    case 'text': {
      // The Note/Text widget consumes the prefixed `FONTS`-id space for
      // fontFamily (via `getFontClass`, default `'global'`), so it is validated
      // by `isWidgetFontFamily` like `stations`/`need-do-put-then` — not the
      // bare `GlobalFontFamily` set. `bgColor` is a STICKY_NOTE_COLORS hex.
      const validVerticalAligns = ['top', 'center', 'bottom'] as const;
      if (isHexColor(raw.bgColor)) out.bgColor = raw.bgColor;
      if (typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize))
        out.fontSize = raw.fontSize;
      if (isWidgetFontFamily(raw.fontFamily)) out.fontFamily = raw.fontFamily;
      if (isHexColor(raw.fontColor)) out.fontColor = raw.fontColor;
      if (
        typeof raw.verticalAlign === 'string' &&
        (validVerticalAligns as readonly string[]).includes(raw.verticalAlign)
      )
        out.verticalAlign = raw.verticalAlign;
      break;
    }
    case 'traffic':
      if (raw.active !== undefined) out.active = raw.active;
      break;
    case 'random':
      if (raw.visualStyle) out.visualStyle = raw.visualStyle;
      if (raw.soundEnabled !== undefined) out.soundEnabled = raw.soundEnabled;
      break;
    case 'dice':
      if (typeof raw.count === 'number') out.count = raw.count;
      break;
    case 'drawing':
      // Note: `mode` is no longer configurable per-building — annotation
      // vs windowed whiteboard is now an explicit runtime choice via the
      // Dock popover. Only width/colors remain as building defaults.
      if (typeof raw.width === 'number') {
        const roundedWidth = Math.round(raw.width);
        if (roundedWidth >= 1 && roundedWidth <= 20) {
          out.width = roundedWidth;
        }
      }
      if (Array.isArray(raw.customColors)) {
        const stringColors = raw.customColors.filter(
          (c): c is string => typeof c === 'string' && c.trim() !== ''
        );
        if (stringColors.length > 0) {
          const normalized: string[] = stringColors.slice(0, 5);
          while (normalized.length < 5) {
            normalized.push(normalized[normalized.length - 1]);
          }
          out.customColors = normalized;
          // Also set the active color to the first preset
          out.color = normalized[0];
        }
      }
      break;
    case 'scoreboard':
      if (Array.isArray(raw.teams) && raw.teams.length > 0) {
        out.teams = (raw.teams as Array<{ name: string; color?: string }>).map(
          (t) => ({
            id: crypto.randomUUID(),
            name: t.name,
            color: t.color,
            score: 0,
          })
        );
      }
      break;
    case 'poll':
      if (typeof raw.question === 'string') out.question = raw.question;
      if (Array.isArray(raw.options) && raw.options.length > 0) {
        out.options = (raw.options as Array<{ label: string }>).map((opt) => ({
          id: crypto.randomUUID(),
          label: opt.label,
          votes: 0,
        }));
      }
      break;
    case 'materials':
      if (Array.isArray(raw.selectedItems) && raw.selectedItems.length > 0) {
        const validMaterialIds = new Set(
          getMaterialsCatalog(
            perm?.config as Partial<MaterialsGlobalConfig>
          ).map((item) => item.id)
        );
        out.selectedItems = raw.selectedItems.filter(
          (item): item is string =>
            typeof item === 'string' && validMaterialIds.has(item)
        );
      }
      break;
    case 'nextUp':
      if (raw) {
        if (typeof raw['displayCount'] === 'number') {
          out.displayCount = raw['displayCount'];
        }
        if (raw['fontFamily'] || raw['themeColor']) {
          const nextUpDefaultConfig = WIDGET_DEFAULTS.nextUp
            .config as unknown as NextUpConfig | undefined;
          out.styling = {
            ...(nextUpDefaultConfig?.styling ?? {}),
            ...(typeof raw['fontFamily'] === 'string'
              ? { fontFamily: raw['fontFamily'] }
              : {}),
            ...(typeof raw['themeColor'] === 'string'
              ? { themeColor: raw['themeColor'] }
              : {}),
          };
        }
      }
      break;
    case 'hotspot-image':
      if (raw.popoverTheme) out.popoverTheme = raw.popoverTheme;
      break;
    case 'concept-web':
      if (
        typeof raw.defaultNodeWidth === 'number' &&
        Number.isFinite(raw.defaultNodeWidth)
      ) {
        out.defaultNodeWidth = Math.max(
          5,
          Math.min(50, Math.round(raw.defaultNodeWidth))
        );
      }
      if (
        typeof raw.defaultNodeHeight === 'number' &&
        Number.isFinite(raw.defaultNodeHeight)
      ) {
        out.defaultNodeHeight = Math.max(
          5,
          Math.min(50, Math.round(raw.defaultNodeHeight))
        );
      }
      if (isGlobalFontFamily(raw.fontFamily)) out.fontFamily = raw.fontFamily;
      if (isHexColor(raw.cardColor)) out.cardColor = raw.cardColor;
      if (isCardOpacity(raw.cardOpacity)) out.cardOpacity = raw.cardOpacity;
      // No `fontColor` default: ConceptWeb's widget renders node text with a
      // hardcoded `text-slate-800` and never reads `config.fontColor`.
      break;
    case 'classes':
      if (typeof raw.classLinkEnabled === 'boolean') {
        out.classLinkEnabled = raw.classLinkEnabled;
      }
      break;
    case 'url':
      if (Array.isArray(raw.urls) && raw.urls.length > 0) {
        out.urls = (
          raw.urls as Array<{
            url: string;
            title?: string;
            color?: string;
          }>
        ).map((item) => ({
          id: crypto.randomUUID(),
          url: typeof item.url === 'string' ? item.url : '',
          ...(typeof item.title === 'string' ? { title: item.title } : {}),
          ...(typeof item.color === 'string' ? { color: item.color } : {}),
        }));
      }
      break;
    case 'soundboard': {
      const soundIds: string[] = [];
      if (Array.isArray(raw.availableSounds)) {
        for (const s of raw.availableSounds as Array<{ id?: string }>) {
          if (typeof s.id === 'string') soundIds.push(s.id);
        }
      }
      if (Array.isArray(raw.enabledLibrarySoundIds)) {
        for (const id of raw.enabledLibrarySoundIds as string[]) {
          if (typeof id === 'string') soundIds.push(id);
        }
      }
      if (Array.isArray(raw.enabledCustomSoundIds)) {
        for (const id of raw.enabledCustomSoundIds as string[]) {
          if (typeof id === 'string') soundIds.push(id);
        }
      }
      if (soundIds.length > 0) out.selectedSoundIds = soundIds;
      break;
    }
    case 'schedule': {
      if (Array.isArray(raw.schedules) && raw.schedules.length > 0) {
        out.schedules = (
          raw.schedules as Array<{
            name?: string;
            items?: Array<Record<string, unknown>>;
            days?: number[];
          }>
        ).map((sched) => ({
          ...sched,
          id: crypto.randomUUID(),
          items: Array.isArray(sched.items)
            ? sched.items.map((item) => ({
                ...item,
                id: crypto.randomUUID(),
              }))
            : [],
        }));
      }
      if (Array.isArray(raw.items) && raw.items.length > 0) {
        out.items = (raw.items as Array<Record<string, unknown>>).map(
          (item) => ({
            ...item,
            id: crypto.randomUUID(),
          })
        );
      }
      break;
    }
    case 'embed':
      // Building embed defaults (hideUrlField, whitelistUrls) are
      // admin-level constraints consumed by the EmbedWidget via direct
      // permission config lookup, not widget config fields.
      break;
    case 'qr':
      if (typeof raw.defaultUrl === 'string' && raw.defaultUrl.trim() !== '')
        out.url = raw.defaultUrl;
      if (typeof raw.qrColor === 'string' && raw.qrColor.trim() !== '')
        out.qrColor = raw.qrColor;
      if (typeof raw.qrBgColor === 'string' && raw.qrBgColor.trim() !== '')
        out.qrBgColor = raw.qrBgColor;
      break;
    case 'countdown': {
      const validViewModes = ['number', 'grid'] as const;
      if (typeof raw.title === 'string') out.title = raw.title;
      if (typeof raw.startDate === 'string') out.startDate = raw.startDate;
      if (typeof raw.eventDate === 'string') out.eventDate = raw.eventDate;
      if (typeof raw.includeWeekends === 'boolean')
        out.includeWeekends = raw.includeWeekends;
      if (typeof raw.countToday === 'boolean') out.countToday = raw.countToday;
      if (
        typeof raw.viewMode === 'string' &&
        (validViewModes as readonly string[]).includes(raw.viewMode)
      )
        out.viewMode = raw.viewMode;
      break;
    }
    case 'work-symbols': {
      // WorkSymbols uses the shared TypographySettings / TextSizePresetSettings
      // primitives, so `fontFamily` lives in the prefixed `FONTS`-id space
      // (validated by `isWidgetFontFamily`, like `stations`/`need-do-put-then`).
      // All four fields are actively consumed by WorkSymbols/Widget.tsx
      // (getFontClass, resolveTextPresetMultiplier, fontColor, titlePosition).
      const validTextSizePresets = [
        'small',
        'medium',
        'large',
        'x-large',
      ] as const;
      if (isWidgetFontFamily(raw.fontFamily)) out.fontFamily = raw.fontFamily;
      if (isHexColor(raw.fontColor)) out.fontColor = raw.fontColor;
      if (
        typeof raw.textSizePreset === 'string' &&
        (validTextSizePresets as readonly string[]).includes(raw.textSizePreset)
      )
        out.textSizePreset = raw.textSizePreset;
      if (
        typeof raw.titlePosition === 'string' &&
        (raw.titlePosition === 'bottom' || raw.titlePosition === 'top')
      )
        out.titlePosition = raw.titlePosition;
      break;
    }
    case 'graphic-organizer': {
      // GraphicOrganizer's Appearance tab uses the shared TypographySettings /
      // SurfaceColorSettings primitives, so `fontFamily` lives in the prefixed
      // `FONTS`-id space (validated by `isWidgetFontFamily`, like
      // stations/need-do-put-then/work-symbols). `templateType` is restricted to
      // the five built-in layouts — per-building custom template ids live under
      // a separate `config.buildings[id].templates` path and are not
      // admin-defaultable here. Derived from the same `GRAPHIC_ORGANIZER_LAYOUT_TYPES`
      // const the `GraphicOrganizerLayoutType` union is built from, so adding a
      // sixth layout can't silently drift this validator out of sync.
      if (
        typeof raw.templateType === 'string' &&
        (GRAPHIC_ORGANIZER_LAYOUT_TYPES as readonly string[]).includes(
          raw.templateType
        )
      )
        out.templateType = raw.templateType;
      if (isWidgetFontFamily(raw.fontFamily)) out.fontFamily = raw.fontFamily;
      if (isHexColor(raw.cardColor)) out.cardColor = raw.cardColor;
      if (isCardOpacity(raw.cardOpacity)) out.cardOpacity = raw.cardOpacity;
      // No `fontColor` default: the Appearance tab renders a fontColor picker,
      // but GraphicOrganizer/Widget.tsx hardcodes node text colors and never
      // reads config.fontColor (dead control, same as ConceptWeb).
      break;
    }
    default:
      break;
  }
  return out;
};
