import React, { useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useGuidedLearning } from '@/hooks/useGuidedLearning';
import type { GuidedLearningSet } from '@/types';

interface GuidedLearningPickerProps {
  selectedSetId: string | null;
  onSelect: (setId: string) => void;
  onError: (message: string) => void;
}

const matches = (title: string, search: string): boolean =>
  title.toLowerCase().includes(search.toLowerCase().trim());

export const GuidedLearningPicker: React.FC<GuidedLearningPickerProps> = ({
  selectedSetId,
  onSelect,
  onError,
}) => {
  const { user } = useAuth();
  const { sets, buildingSets, loadSetData, saveBuildingSet } =
    useGuidedLearning(user?.uid);
  const [search, setSearch] = useState('');
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const shared = buildingSets.filter((set) => matches(set.title, search));
  const personal = sets.filter((set) => matches(set.title, search));

  // Personal sets live in Drive; publishing copies the JSON into the shared library.
  const handlePersonalPick = async (
    setId: string,
    driveFileId: string
  ): Promise<void> => {
    setCopyingId(setId);
    try {
      const loaded = await loadSetData(driveFileId);
      const copy: GuidedLearningSet = {
        ...loaded,
        id: crypto.randomUUID(),
        isBuilding: true,
      };
      await saveBuildingSet(copy);
      onSelect(copy.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setCopyingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search activities..."
          aria-label="Search activities"
          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Shared library
          </h4>
          <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
            {shared.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">
                No shared activities.
              </li>
            )}
            {shared.map((set) => (
              <li key={set.id}>
                <button
                  type="button"
                  onClick={() => onSelect(set.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span className="truncate">{set.title}</span>
                  {selectedSetId === set.id && (
                    <Check className="w-4 h-4 text-green-600 shrink-0" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
            My library
          </h4>
          <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
            {personal.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">
                No personal activities.
              </li>
            )}
            {personal.map((set) => (
              <li key={set.id}>
                <button
                  type="button"
                  disabled={copyingId !== null}
                  onClick={() => handlePersonalPick(set.id, set.driveFileId)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <span className="truncate">{set.title}</span>
                  {copyingId === set.id && (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="text-xs text-slate-500">
        Picking a personal activity copies it into the shared library so
        teachers can open it from Help.
      </p>
    </div>
  );
};
