import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GuidedLearningTourBinding, WidgetType } from '@/types';
import {
  TOUR_ANCHORS,
  isTourAnchorId,
  parseTourAnchorRef,
  tourAnchorRef,
  type TourAnchorDef,
} from '@/config/tourAnchors';
import { TOOLS } from '@/config/tools';
import { fieldKeysForWidgetType, hasFieldSchema } from './tourFieldKeys';

interface Props {
  tour: GuidedLearningTourBinding;
  onChange: (tour: GuidedLearningTourBinding) => void;
  labelClass: string;
  inputClass: string;
}

/** Which widget, and which setting, a per-widget-type or per-field anchor points at. */
export const TourWidgetFields: React.FC<Props> = ({
  tour,
  onChange,
  labelClass,
  inputClass,
}) => {
  const { t } = useTranslation();
  const { id, widgetType, fieldKey } = parseTourAnchorRef(tour.anchor ?? '');
  const def: TourAnchorDef | undefined = isTourAnchorId(id)
    ? TOUR_ANCHORS[id]
    : undefined;
  const perField = !!def?.perField;
  const needsType = !!def?.perWidgetType || perField;

  const schemaAvailable =
    perField && !!widgetType && hasFieldSchema(widgetType as WidgetType);
  const [loadedKeys, setLoadedKeys] = useState<{
    type: string;
    keys: string[];
  } | null>(null);
  const fieldKeys =
    schemaAvailable && loadedKeys?.type === widgetType ? loadedKeys.keys : [];
  useEffect(() => {
    if (!schemaAvailable || !widgetType) return;
    let active = true;
    void fieldKeysForWidgetType(widgetType as WidgetType).then((keys) => {
      if (active) setLoadedKeys({ type: widgetType, keys });
    });
    return () => {
      active = false;
    };
  }, [schemaAvailable, widgetType]);

  if (!needsType || !isTourAnchorId(id)) return null;
  const rebind = (type?: string, field?: string) =>
    onChange({ ...tour, anchor: tourAnchorRef(id, type, field) });
  const knownType = !widgetType || TOOLS.some((x) => x.type === widgetType);
  const fieldOptions =
    fieldKey && !fieldKeys.includes(fieldKey)
      ? [fieldKey, ...fieldKeys]
      : fieldKeys;

  return (
    <>
      <label className={labelClass}>
        {t('glStudio.tourWidget')}
        <select
          value={widgetType ?? ''}
          onChange={(e) =>
            rebind(e.target.value || undefined, perField ? fieldKey : undefined)
          }
          className={inputClass}
          data-testid="tour-editor-widget-type"
        >
          <option value="">{t('glStudio.tourWidgetPick')}</option>
          {!knownType && widgetType && (
            <option value={widgetType}>{widgetType}</option>
          )}
          {TOOLS.map((tool) => (
            <option key={tool.type} value={tool.type}>
              {tool.label}
            </option>
          ))}
        </select>
      </label>
      {perField && widgetType && (
        <label className={labelClass}>
          {t('glStudio.tourField')}
          {schemaAvailable ? (
            <select
              value={fieldKey ?? ''}
              onChange={(e) => rebind(widgetType, e.target.value || undefined)}
              className={inputClass}
              data-testid="tour-editor-field-key"
            >
              <option value="">{t('glStudio.tourFieldPick')}</option>
              {fieldOptions.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={fieldKey ?? ''}
              placeholder={t('glStudio.tourFieldPlaceholder')}
              onChange={(e) => rebind(widgetType, e.target.value || undefined)}
              className={inputClass}
              data-testid="tour-editor-field-key"
            />
          )}
        </label>
      )}
    </>
  );
};
