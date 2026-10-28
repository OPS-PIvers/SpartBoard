// Entry for tests/mcpWidgetConfigSchemas.test.ts: the runtime it bundles into functions and the type it turns into JSON schemas.
import type { ConfigForWidget, WidgetType } from '@/types';

export { getAdminBuildingConfig } from '@/utils/adminBuildingConfig';
export {
  APPEARANCE_CONFIG_KEY_LIST,
  mergeWidgetConfig,
} from '@/utils/widgetConfigPersistence';
export { WIDGET_DEFAULTS } from '@/config/widgetDefaults';

export type WidgetConfigSchemaRoot = { [K in WidgetType]: ConfigForWidget<K> };
