import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Play,
  Pencil,
  Trash2,
  Link2,
  Building2,
  User,
  Loader2,
  Wand2,
  BarChart2,
} from 'lucide-react';
import {
  GuidedLearningSet,
  GuidedLearningSetMetadata,
  GuidedLearningMode,
  WidgetData,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';

interface GuidedLearningLibraryProps {
  widget: WidgetData;
  sets: GuidedLearningSetMetadata[];
  buildingSets: GuidedLearningSet[];
  loading: boolean;
  buildingLoading: boolean;
  isDriveConnected: boolean;
  onPlay: (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => void;
  onEdit: (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => void;
  onDelete: (setId: string, driveFileId: string) => void;
  onDeleteBuilding: (setId: string) => void;
  onAssign: (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => void;
  onCreateNew: () => void;
  onCreateNewBuilding: () => void;
  onViewResults: (sessionId: string) => void;
  onGenerateWithAI: () => void;
  recentSessionIds: Record<string, string>;
}

const MODE_LABELS: Record<GuidedLearningMode, string> = {
  structured: 'Structured',
  guided: 'Guided',
  explore: 'Explore',
};

const MODE_COLORS: Record<GuidedLearningMode, string> = {
  structured: 'bg-blue-500/20 text-blue-300',
  guided: 'bg-emerald-500/20 text-emerald-300',
  explore: 'bg-violet-500/20 text-violet-300',
};

interface SetCardProps {
  title: string;
  description?: string;
  stepCount: number;
  mode: GuidedLearningMode;
  imageUrl?: string;
  isBuilding?: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAssign: () => void;
  onViewResults?: () => void;
  showEdit?: boolean;
  showDelete?: boolean;
}

const SetCard: React.FC<SetCardProps> = ({
  title,
  description,
  stepCount,
  mode,
  imageUrl,
  isBuilding,
  onPlay,
  onEdit,
  onDelete,
  onAssign,
  onViewResults,
  showEdit = true,
  showDelete = true,
}) => (
  <div
    className="group bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all flex items-center"
    style={{
      padding: 'min(10px, 2.5cqmin)',
      gap: 'min(12px, 3cqmin)',
    }}
  >
    {/* Image / Icon */}
    <div
      className="bg-slate-800 rounded-lg flex items-center justify-center shrink-0 border border-white/10 overflow-hidden"
      style={{
        width: 'min(48px, 12cqmin)',
        height: 'min(48px, 12cqmin)',
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title}
          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
        />
      ) : (
        <BookOpen
          className="text-slate-500"
          style={{
            width: 'min(20px, 5cqmin)',
            height: 'min(20px, 5cqmin)',
          }}
        />
      )}
    </div>

    {/* Info */}
    <div className="flex-1 min-w-0">
      <div
        className="flex items-center"
        style={{
          gap: 'min(6px, 1.5cqmin)',
          marginBottom: 'min(2px, 0.5cqmin)',
        }}
      >
        <h3
          className="font-bold text-white truncate"
          style={{ fontSize: 'clamp(12px, 4cqmin, 22px)' }}
        >
          {title}
        </h3>
        <span
          className={`shrink-0 font-black uppercase tracking-widest rounded-md ${MODE_COLORS[mode]}`}
          style={{
            fontSize: 'clamp(10px, 2.2cqmin, 13px)',
            padding: 'min(1px, 0.2cqmin) min(6px, 1.5cqmin)',
          }}
        >
          {MODE_LABELS[mode]}
        </span>
      </div>
      <div
        className="flex items-center flex-wrap"
        style={{ gap: 'min(8px, 2cqmin)' }}
      >
        <div
          className="flex items-center text-slate-400 font-medium"
          style={{
            gap: 'min(4px, 1cqmin)',
            fontSize: 'clamp(10px, 3cqmin, 16px)',
          }}
        >
          {isBuilding && (
            <span
              className="flex items-center"
              style={{ gap: 'min(3px, 0.8cqmin)' }}
            >
              <Building2
                style={{
                  width: 'clamp(11px, 3cqmin, 18px)',
                  height: 'clamp(11px, 3cqmin, 18px)',
                }}
              />
              Building
            </span>
          )}
          <span>
            {stepCount} step{stepCount !== 1 ? 's' : ''}
          </span>
        </div>
        {description && (
          <span
            className="text-slate-500 truncate italic hidden sm:inline"
            style={{ fontSize: 'clamp(10px, 3cqmin, 16px)' }}
          >
            — {description}
          </span>
        )}
      </div>
    </div>

    {/* Actions */}
    <div className="flex items-center" style={{ gap: 'min(6px, 1.5cqmin)' }}>
      <button
        onClick={onPlay}
        className="flex items-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all active:scale-95"
        style={{
          gap: 'min(4px, 1cqmin)',
          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
          fontSize: 'clamp(10px, 3cqmin, 16px)',
        }}
        title="Play (display to class)"
      >
        <Play
          style={{
            width: 'clamp(12px, 3cqmin, 18px)',
            height: 'clamp(12px, 3cqmin, 18px)',
          }}
        />
        <span className="hidden sm:inline">Play</span>
      </button>

      <button
        onClick={onAssign}
        className="flex items-center bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all active:scale-95 shadow-sm"
        style={{
          gap: 'min(4px, 1cqmin)',
          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
          fontSize: 'clamp(10px, 3cqmin, 16px)',
        }}
        title="Assign (copy student link)"
      >
        <Link2
          style={{
            width: 'clamp(12px, 3cqmin, 18px)',
            height: 'clamp(12px, 3cqmin, 18px)',
          }}
        />
        <span className="hidden sm:inline">Assign</span>
      </button>

      {onViewResults && (
        <button
          onClick={onViewResults}
          className="flex items-center bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-all active:scale-95"
          style={{
            gap: 'min(4px, 1cqmin)',
            padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
            fontSize: 'clamp(10px, 3cqmin, 16px)',
          }}
          title="View results"
        >
          <BarChart2
            style={{
              width: 'clamp(12px, 3cqmin, 18px)',
              height: 'clamp(12px, 3cqmin, 18px)',
            }}
          />
          <span className="hidden sm:inline">Results</span>
        </button>
      )}

      {(showEdit || showDelete) && (
        <div
          className="flex items-center border-l border-white/10"
          style={{ paddingLeft: 'min(6px, 1.5cqmin)', gap: 'min(4px, 1cqmin)' }}
        >
          {showEdit && (
            <button
              onClick={onEdit}
              className="text-slate-400 hover:text-white p-1.5 hover:bg-white/5 rounded-lg transition-colors"
              title="Edit"
            >
              <Pencil
                style={{
                  width: 'clamp(14px, 3.5cqmin, 22px)',
                  height: 'clamp(14px, 3.5cqmin, 22px)',
                }}
              />
            </button>
          )}
          {showDelete && (
            <button
              onClick={onDelete}
              className="text-slate-500 hover:text-red-400 p-1.5 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2
                style={{
                  width: 'clamp(14px, 3.5cqmin, 22px)',
                  height: 'clamp(14px, 3.5cqmin, 22px)',
                }}
              />
            </button>
          )}
        </div>
      )}
    </div>
  </div>
);

export const GuidedLearningLibrary: React.FC<GuidedLearningLibraryProps> = ({
  widget: _widget,
  sets,
  buildingSets,
  loading,
  buildingLoading,
  isDriveConnected,
  onPlay,
  onEdit,
  onDelete,
  onDeleteBuilding,
  onAssign,
  onCreateNew,
  onCreateNewBuilding,
  onViewResults,
  onGenerateWithAI,
  recentSessionIds,
}) => {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<'my' | 'building'>('my');

  if (!isDriveConnected && tab === 'my') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
        <BookOpen className="w-10 h-10 text-slate-500" />
        <div>
          <p className="text-white font-semibold mb-1">Connect Google Drive</p>
          <p className="text-slate-400 text-sm">
            Your guided learning sets are saved to Google Drive. Sign out and
            sign back in to grant Drive access.
          </p>
        </div>
        <button
          onClick={() => setTab('building')}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
        >
          Browse Building Sets
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{
          padding: 'min(12px, 3cqmin) min(12px, 3cqmin) min(8px, 2cqmin)',
          gap: 'min(8px, 2cqmin)',
        }}
      >
        <div
          className="flex bg-slate-800 rounded-lg p-0.5"
          style={{ gap: 'min(2px, 0.5cqmin)' }}
        >
          <button
            onClick={() => setTab('my')}
            className={`rounded-md transition-colors font-bold uppercase tracking-tight ${tab === 'my' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
            style={{
              padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
              fontSize: 'clamp(10px, 2.5cqmin, 15px)',
            }}
          >
            <User
              style={{
                width: 'clamp(11px, 2.8cqmin, 18px)',
                height: 'clamp(11px, 2.8cqmin, 18px)',
                marginRight: 'min(4px, 1cqmin)',
              }}
              className="inline"
            />
            My Sets
          </button>
          <button
            onClick={() => setTab('building')}
            className={`rounded-md transition-colors font-bold uppercase tracking-tight ${tab === 'building' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
            style={{
              padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
              fontSize: 'clamp(10px, 2.5cqmin, 15px)',
            }}
          >
            <Building2
              style={{
                width: 'clamp(11px, 2.8cqmin, 18px)',
                height: 'clamp(11px, 2.8cqmin, 18px)',
                marginRight: 'min(4px, 1cqmin)',
              }}
              className="inline"
            />
            Building
          </button>
        </div>
        <div className="flex" style={{ gap: 'min(6px, 1.5cqmin)' }}>
          {isAdmin && tab === 'building' && (
            <button
              onClick={onGenerateWithAI}
              title="Generate with AI (Admin)"
              className="flex items-center bg-violet-700 hover:bg-violet-600 text-white font-bold rounded-lg transition-colors"
              style={{
                padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                gap: 'min(4px, 1cqmin)',
                fontSize: 'clamp(10px, 2.5cqmin, 15px)',
              }}
            >
              <Wand2
                style={{
                  width: 'min(12px, 3cqmin)',
                  height: 'min(12px, 3cqmin)',
                }}
              />
              AI
            </button>
          )}
          <button
            onClick={tab === 'my' ? onCreateNew : onCreateNewBuilding}
            className="flex items-center bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors shadow-sm"
            style={{
              padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
              gap: 'min(4px, 1cqmin)',
              fontSize: 'clamp(10px, 2.5cqmin, 15px)',
            }}
          >
            <Plus
              style={{
                width: 'min(12px, 3cqmin)',
                height: 'min(12px, 3cqmin)',
              }}
            />
            New
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: '0 min(12px, 3cqmin) min(12px, 3cqmin)' }}
      >
        {tab === 'my' ? (
          loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2
                className="text-slate-400 animate-spin"
                style={{
                  width: 'min(24px, 6cqmin)',
                  height: 'min(24px, 6cqmin)',
                }}
              />
            </div>
          ) : sets.length === 0 ? (
            <div style={{ paddingTop: 'min(40px, 10cqmin)' }}>
              <ScaledEmptyState
                icon={BookOpen}
                title="No Sets Yet"
                subtitle="Click + New to create your first guided experience."
              />
            </div>
          ) : (
            <div className="space-y-2">
              {sets.map((meta) => (
                <SetCard
                  key={meta.id}
                  title={meta.title}
                  description={meta.description}
                  stepCount={meta.stepCount}
                  mode={meta.mode}
                  imageUrl={meta.imageUrl}
                  onPlay={() => onPlay(meta.id, meta.driveFileId)}
                  onEdit={() => onEdit(meta.id, meta.driveFileId)}
                  onDelete={() => onDelete(meta.id, meta.driveFileId)}
                  onAssign={() => onAssign(meta.id, meta.driveFileId)}
                  onViewResults={
                    recentSessionIds[meta.id]
                      ? () => onViewResults(recentSessionIds[meta.id])
                      : undefined
                  }
                />
              ))}
            </div>
          )
        ) : buildingLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2
              className="text-slate-400 animate-spin"
              style={{
                width: 'min(24px, 6cqmin)',
                height: 'min(24px, 6cqmin)',
              }}
            />
          </div>
        ) : buildingSets.length === 0 ? (
          <div style={{ paddingTop: 'min(40px, 10cqmin)' }}>
            <ScaledEmptyState
              icon={Building2}
              title="No Building Sets"
              subtitle={
                isAdmin
                  ? 'Click + New to create a building-level set.'
                  : 'No building sets have been created yet.'
              }
            />
          </div>
        ) : (
          <div className="space-y-2">
            {buildingSets.map((set) => (
              <SetCard
                key={set.id}
                title={set.title}
                description={set.description}
                stepCount={set.steps.length}
                mode={set.mode}
                imageUrl={set.imageUrl}
                isBuilding
                onPlay={() => onPlay(set.id, undefined, set)}
                onEdit={() => onEdit(set.id, undefined, set)}
                onDelete={() => onDeleteBuilding(set.id)}
                onAssign={() => onAssign(set.id, undefined, set)}
                showEdit={isAdmin ?? false}
                showDelete={isAdmin ?? false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
