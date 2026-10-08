import React, { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type {
  TourMaterial,
  TourMaterialContent,
  TourMaterialKind,
  TourMaterialSource,
} from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { useQuiz } from '@/hooks/useQuiz';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { useGuidedLearning } from '@/hooks/useGuidedLearning';
import { useActivityWallLibrary } from '@/hooks/useActivityWallLibrary';
import { useMiniAppSync } from '@/components/widgets/MiniApp/hooks/useMiniAppSync';
import { inputLight } from '@/components/common/lightChrome';
import { iconBtn, secondaryBtn } from '@/components/tours/tourButtons';
import { TOUR_MATERIAL_KINDS, isSandboxId } from '@/utils/tourSandbox';
import { logError } from '@/utils/logError';

const SOURCES: readonly TourMaterialSource[] = ['sample', 'teacher', 'created'];
const inputClass = `w-full rounded-lg px-2.5 py-1.5 text-sm font-normal ${inputLight}`;
const labelClass = 'flex flex-col gap-1 text-xs font-semibold text-slate-600';

const asContent = (meta: object, data: object): TourMaterialContent => ({
  meta: JSON.parse(JSON.stringify(meta)) as Record<string, unknown>,
  data: JSON.parse(JSON.stringify(data)) as Record<string, unknown>,
});

interface SourceList {
  items: { id: string; title: string }[];
  load: (id: string) => Promise<TourMaterialContent | null>;
}

const own = <T extends { id: string; title: string }>(list: readonly T[]) =>
  list.filter((x) => !isSandboxId(x.id));

const useQuizSource = (uid?: string): SourceList => {
  const { quizzes, loadQuizData } = useQuiz(uid);
  return {
    items: own(quizzes),
    load: async (id) => {
      const meta = quizzes.find((q) => q.id === id);
      return meta
        ? asContent(meta, await loadQuizData(meta.driveFileId))
        : null;
    },
  };
};
const useVideoSource = (uid?: string): SourceList => {
  const { activities, loadActivityData } = useVideoActivity(uid);
  return {
    items: own(activities),
    load: async (id) => {
      const meta = activities.find((a) => a.id === id);
      return meta
        ? asContent(meta, await loadActivityData(meta.driveFileId))
        : null;
    },
  };
};
const useGuidedSource = (uid?: string): SourceList => {
  const { sets, loadSetData } = useGuidedLearning(uid);
  return {
    items: own(sets),
    load: async (id) => {
      const meta = sets.find((s) => s.id === id);
      return meta ? asContent(meta, await loadSetData(meta.driveFileId)) : null;
    },
  };
};
const useWallSource = (uid?: string): SourceList => {
  const { activities } = useActivityWallLibrary(uid);
  return {
    items: own(activities),
    load: (id) => {
      const entry = activities.find((a) => a.id === id);
      return Promise.resolve(entry ? asContent(entry, entry) : null);
    },
  };
};
const noToast = () => undefined;
const useMiniAppSource = (): SourceList => {
  const { library } = useMiniAppSync(noToast);
  return {
    items: own(library),
    load: (id) => {
      const app = library.find((a) => a.id === id);
      return Promise.resolve(app ? asContent(app, app) : null);
    },
  };
};

/** Picks one of the author's items and copies it into the tour. */
const SamplePicker: React.FC<{
  label: string;
  value?: string;
  source: SourceList;
  onPick: (sample: NonNullable<TourMaterial['sample']>) => void;
}> = ({ label, value, source, onPick }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const pick = async (id: string) => {
    setBusy(true);
    try {
      const content = await source.load(id);
      const title = source.items.find((i) => i.id === id)?.title ?? '';
      if (content) onPick({ ...content, fromId: id, title });
    } catch (err) {
      logError('TourMaterialsSection', err, { itemId: id });
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className={labelClass}>
      {label}
      <select
        value={value ?? ''}
        disabled={busy}
        onChange={(e) => void pick(e.target.value)}
        className={inputClass}
      >
        <option value="" disabled>
          {source.items.length > 0
            ? t('tours.materials.choose')
            : t('tours.materials.noneYet')}
        </option>
        {source.items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title.trim() || t('tours.untitledItem')}
          </option>
        ))}
      </select>
    </label>
  );
};

const KindSamplePicker: React.FC<{
  kind: TourMaterialKind;
  uid?: string;
  label: string;
  value?: string;
  onPick: (sample: NonNullable<TourMaterial['sample']>) => void;
}> = ({ kind, uid, ...rest }) => {
  switch (kind) {
    case 'quiz':
      return <QuizPicker uid={uid} {...rest} />;
    case 'video-activity':
      return <VideoPicker uid={uid} {...rest} />;
    case 'guided-learning':
      return <GuidedPicker uid={uid} {...rest} />;
    case 'activity-wall':
      return <WallPicker uid={uid} {...rest} />;
    case 'mini-app':
      return <MiniAppPicker {...rest} />;
  }
};

type PickerProps = Omit<React.ComponentProps<typeof SamplePicker>, 'source'>;
const QuizPicker: React.FC<PickerProps & { uid?: string }> = ({
  uid,
  ...p
}) => <SamplePicker {...p} source={useQuizSource(uid)} />;
const VideoPicker: React.FC<PickerProps & { uid?: string }> = ({
  uid,
  ...p
}) => <SamplePicker {...p} source={useVideoSource(uid)} />;
const GuidedPicker: React.FC<PickerProps & { uid?: string }> = ({
  uid,
  ...p
}) => <SamplePicker {...p} source={useGuidedSource(uid)} />;
const WallPicker: React.FC<PickerProps & { uid?: string }> = ({
  uid,
  ...p
}) => <SamplePicker {...p} source={useWallSource(uid)} />;
const MiniAppPicker: React.FC<PickerProps> = (p) => (
  <SamplePicker {...p} source={useMiniAppSource()} />
);

/** Settings > Materials: the library items the tour works on, and where each comes from. */
export const TourMaterialsSection: React.FC<{
  materials: readonly TourMaterial[];
  onChange: (materials: TourMaterial[]) => void;
}> = ({ materials, onChange }) => {
  const { t } = useTranslation();
  const uid = useContext(AuthContext)?.user?.uid;
  const update = (id: string, patch: Partial<TourMaterial>) =>
    onChange(
      materials.map((m) => {
        if (m.id !== id) return m;
        const next = { ...m, ...patch };
        if (!next.sample) delete next.sample;
        return next;
      })
    );
  const add = () =>
    onChange([
      ...materials,
      { id: crypto.randomUUID(), kind: 'quiz', source: 'sample', label: '' },
    ]);
  return (
    <section
      aria-labelledby="tour-editor-materials-title"
      data-testid="tour-editor-materials"
      className="flex flex-col gap-3 py-4"
    >
      <h3
        id="tour-editor-materials-title"
        className="text-xs font-semibold text-slate-700"
      >
        {t('tours.materials.title')}
      </h3>
      {materials.length === 0 && (
        <p className="text-xs text-slate-500">{t('tours.materials.empty')}</p>
      )}
      {materials.map((m) => (
        <div
          key={m.id}
          data-testid="tour-material"
          className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2"
        >
          <div className="flex items-end gap-1">
            <label className={`${labelClass} min-w-0 flex-1`}>
              {t('tours.materials.name')}
              <input
                type="text"
                value={m.label}
                maxLength={60}
                placeholder={t(`tours.materials.kind_${m.kind}`)}
                onChange={(e) => update(m.id, { label: e.target.value })}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              onClick={() => onChange(materials.filter((x) => x.id !== m.id))}
              aria-label={t('tours.materials.remove')}
              title={t('tours.materials.remove')}
              className={iconBtn}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex gap-2">
            <label className={`${labelClass} flex-1`}>
              {t('tours.materials.kind')}
              <select
                value={m.kind}
                onChange={(e) =>
                  update(m.id, {
                    kind: e.target.value as TourMaterialKind,
                    sample: undefined,
                  })
                }
                className={inputClass}
              >
                {TOUR_MATERIAL_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`tours.materials.kind_${kind}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${labelClass} flex-1`}>
              {t('tours.materials.source')}
              <select
                value={m.source}
                onChange={(e) =>
                  update(m.id, {
                    source: e.target.value as TourMaterialSource,
                    ...(e.target.value === 'created'
                      ? { sample: undefined }
                      : {}),
                  })
                }
                className={inputClass}
              >
                {SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {t(`tours.materials.source_${source}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {m.source !== 'created' && (
            <KindSamplePicker
              kind={m.kind}
              uid={uid}
              label={t(
                m.source === 'teacher'
                  ? 'tours.materials.previewWith'
                  : 'tours.materials.copyFrom'
              )}
              value={m.sample?.fromId}
              onPick={(sample) => update(m.id, { sample })}
            />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className={`${secondaryBtn} flex items-center gap-1.5 self-start`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t('tours.materials.add')}
      </button>
    </section>
  );
};
