import {
  FeaturePermission,
  MaterialsGlobalConfig,
  NextUpConfig,
  WidgetType,
} from '../types';
import { canonicalizeBuildingKeyedRecord } from '@/config/buildings';
import { WIDGET_DEFAULTS } from '../config/widgetDefaults';
import { getMaterialsCatalog } from '../components/widgets/MaterialsWidget/constants';

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
  typeof value === 'string' && HEX_COLOR_RE.test(value.trim());

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
      if (
        typeof raw.cardOpacity === 'number' &&
        Number.isFinite(raw.cardOpacity) &&
        raw.cardOpacity >= 0 &&
        raw.cardOpacity <= 1
      )
        out.cardOpacity = raw.cardOpacity;
      if (isGlobalFontFamily(raw.fontFamily)) out.fontFamily = raw.fontFamily;
      if (isHexColor(raw.fontColor)) out.fontColor = raw.fontColor;
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
      const validClockStyles = ['modern', 'lcd', 'minimal'] as const;
      if (typeof raw.format24 === 'boolean') out.format24 = raw.format24;
      if (raw.fontFamily) out.fontFamily = raw.fontFamily;
      if (raw.themeColor) out.themeColor = raw.themeColor;
      if (
        typeof raw.clockStyle === 'string' &&
        (validClockStyles as readonly string[]).includes(raw.clockStyle)
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
    case 'time-tool':
      if (typeof raw.duration === 'number') {
        out.duration = raw.duration;
        out.elapsedTime = raw.duration;
      }
      if (raw.timerEndTrafficColor !== undefined)
        out.timerEndTrafficColor = raw.timerEndTrafficColor;
      break;
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
      if (
        typeof raw.cardOpacity === 'number' &&
        Number.isFinite(raw.cardOpacity) &&
        raw.cardOpacity >= 0 &&
        raw.cardOpacity <= 1
      )
        out.cardOpacity = raw.cardOpacity;
      if (isHexColor(raw.fontColor)) out.fontColor = raw.fontColor;
      break;
    case 'sound':
      if (raw.visual) out.visual = raw.visual;
      if (raw.sensitivity !== undefined) out.sensitivity = raw.sensitivity;
      break;
    case 'text':
      if (raw.bgColor) out.bgColor = raw.bgColor;
      if (typeof raw.fontSize === 'number') out.fontSize = raw.fontSize;
      break;
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
      if (
        typeof raw.cardOpacity === 'number' &&
        Number.isFinite(raw.cardOpacity) &&
        raw.cardOpacity >= 0 &&
        raw.cardOpacity <= 1
      )
        out.cardOpacity = raw.cardOpacity;
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
    default:
      break;
  }
  return out;
};
