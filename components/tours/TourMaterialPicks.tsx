import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TourMaterial } from '@/types';
import { inputLight } from '@/components/common/lightChrome';
import { TourDialog } from './TourDialog';
import { primaryBtn, secondaryBtn } from './tourButtons';
import { listTeacherMaterials } from './tourMaterialSeed';

interface Props {
  title: string;
  /** The tour's materials that use one of the teacher's own items. */
  materials: readonly TourMaterial[];
  uid: string | undefined;
  onCancel: () => void;
  onStart: (picks: Record<string, string>) => void;
}

/** Before a tour starts, the teacher picks which of their items it works on. */
export const TourMaterialPicks: React.FC<Props> = ({
  title,
  materials,
  uid,
  onCancel,
  onStart,
}) => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<
    Record<string, { id: string; title: string }[]>
  >({});
  const [picks, setPicks] = useState<Record<string, string>>({});

  // Keyed on the kinds, not the array, so a parent render doesn't re-read the library.
  const kindsKey = [...new Set(materials.map((m) => m.kind))].join(',');
  useEffect(() => {
    if (!uid) return;
    let live = true;
    const kinds = kindsKey.split(',') as TourMaterial['kind'][];
    void Promise.all(
      kinds.map(async (kind) => {
        try {
          return [kind, await listTeacherMaterials(uid, kind)] as const;
        } catch (err) {
          console.error('Live tour: could not list materials', err);
          return [kind, []] as const;
        }
      })
    ).then((lists) => {
      if (live)
        setOptions(
          Object.fromEntries(lists) as Record<
            string,
            { id: string; title: string }[]
          >
        );
    });
    return () => {
      live = false;
    };
  }, [uid, kindsKey]);

  const ready = materials.every((m) => !!picks[m.id]);
  return (
    <TourDialog
      title={title}
      body={t('tours.materials.pickBody')}
      content={materials.map((m) => {
        const list = options[m.kind];
        return (
          <label
            key={m.id}
            className="flex flex-col gap-1 text-xs font-semibold text-slate-600"
          >
            {m.label.trim() || t(`tours.materials.kind_${m.kind}`)}
            <select
              value={picks[m.id] ?? ''}
              disabled={!list}
              onChange={(e) =>
                setPicks((prev) => ({ ...prev, [m.id]: e.target.value }))
              }
              className={`w-full rounded-lg px-2.5 py-1.5 text-sm font-normal ${inputLight}`}
            >
              <option value="" disabled>
                {list
                  ? list.length > 0
                    ? t('tours.materials.choose')
                    : t('tours.materials.noneYet')
                  : t('common.loading')}
              </option>
              {(list ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title.trim() || t('tours.untitledItem')}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    >
      <button type="button" className={secondaryBtn} onClick={onCancel}>
        {t('tours.cancel')}
      </button>
      <button
        type="button"
        data-autofocus=""
        className={`${primaryBtn} disabled:opacity-40`}
        disabled={!ready}
        onClick={() => onStart(picks)}
      >
        {t('tours.startTour')}
      </button>
    </TourDialog>
  );
};
