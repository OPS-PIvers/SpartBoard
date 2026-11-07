import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '@/config/firebase';
import { BACKGROUND_GRADIENTS } from '@/config/backgrounds';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import type { BackgroundPreset } from '@/types';
import {
  BOARD_BACKGROUNDS_SETTINGS_DOC,
  EMPTY_BOARD_BACKGROUND_DEFAULTS,
  forgetBoardBackgroundDefaults,
  normalizeBoardBackgroundDefaults,
  type BoardBackgroundDefaults,
} from '@/utils/boardBackgroundDefaults';
import { logError } from '@/utils/logError';

const settingsRef = () =>
  doc(db, 'admin_settings', BOARD_BACKGROUNDS_SETTINGS_DOC);

interface Props {
  presets: BackgroundPreset[];
  onError: (text: string) => void;
}

/** Admin Settings > Backgrounds: the background new boards start on, for the district and each building (D24). */
export const BoardBackgroundDefaultsPanel: React.FC<Props> = ({
  presets,
  onError,
}) => {
  const buildings = useAdminBuildings();
  const [defaults, setDefaults] = useState<BoardBackgroundDefaults>(
    EMPTY_BOARD_BACKGROUND_DEFAULTS
  );
  useEffect(() => {
    if (!isConfigured) return;
    return onSnapshot(
      settingsRef(),
      (snap) => setDefaults(normalizeBoardBackgroundDefaults(snap.data())),
      (err) => logError('BoardBackgroundDefaultsPanel', err)
    );
  }, []);

  const options = [
    ...BACKGROUND_GRADIENTS.map((g) => ({ value: g.id, label: g.label })),
    ...presets
      .filter((p) => p.active)
      .map((p) => ({ value: p.url, label: p.label })),
  ];

  const save = async (next: BoardBackgroundDefaults) => {
    const before = defaults;
    setDefaults(next);
    try {
      await setDoc(settingsRef(), {
        ...(next.district ? { district: next.district } : {}),
        buildings: next.buildings,
      });
      forgetBoardBackgroundDefaults();
    } catch (err) {
      logError('BoardBackgroundDefaultsPanel.save', err);
      // Nothing changed on the server, so no snapshot will put the old choice back.
      setDefaults(before);
      onError("Couldn't save the default background. Try again.");
    }
  };

  const setDistrict = (value: string) => {
    const { district: _old, ...rest } = defaults;
    void save(value ? { ...rest, district: value } : rest);
  };
  const setBuilding = (id: string, value: string) => {
    const { [id]: _old, ...others } = defaults.buildings;
    void save({
      ...defaults,
      buildings: value ? { ...others, [id]: value } : others,
    });
  };

  const select = (
    value: string | undefined,
    onChange: (value: string) => void,
    anchor: ReturnType<typeof tourAttr>,
    label: string,
    inheritLabel: string
  ) => (
    <select
      {...anchor}
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
    >
      <option value="">{inheritLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h3 className="text-sm font-bold text-slate-700">
        Default for new boards
      </h3>
      <label className="flex items-center gap-3 text-sm text-slate-700">
        <span className="w-40 shrink-0 font-semibold">District</span>
        {select(
          defaults.district,
          setDistrict,
          tourAttr('admin.backgrounds.default-district'),
          'District default background',
          'Snowy (SpartBoard default)'
        )}
      </label>
      {buildings.map((b) => (
        <label
          key={b.id}
          className="flex items-center gap-3 text-sm text-slate-700"
        >
          <span className="w-40 shrink-0 truncate" title={b.name}>
            {b.name}
          </span>
          {select(
            defaults.buildings[b.id],
            (value) => setBuilding(b.id, value),
            tourFieldAttr('admin.backgrounds.default-building', 'admin', b.id),
            `Default background for ${b.name}`,
            'Same as district'
          )}
        </label>
      ))}
    </section>
  );
};
