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
  <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-colors">
    {imageUrl && (
      <div className="h-24 overflow-hidden bg-slate-800">
        <img
          src={imageUrl}
          alt={title}
          className="w-full h-full object-cover opacity-70"
        />
      </div>
    )}
    <div className="p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold text-white text-sm leading-tight line-clamp-2">
          {title}
        </h3>
        <span
          className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${MODE_COLORS[mode]}`}
        >
          {MODE_LABELS[mode]}
        </span>
      </div>
      {description && (
        <p className="text-slate-400 text-xs mb-2 line-clamp-2">
          {description}
        </p>
      )}
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
        {isBuilding && (
          <span className="flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            Building
          </span>
        )}
        <span>
          {stepCount} step{stepCount !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={onPlay}
          className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg transition-colors"
          title="Play (display to class)"
        >
          <Play className="w-3 h-3" />
          Play
        </button>
        <button
          onClick={onAssign}
          className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors"
          title="Assign (copy student link)"
        >
          <Link2 className="w-3 h-3" />
          Assign
        </button>
        {onViewResults && (
          <button
            onClick={onViewResults}
            className="flex items-center gap-1 px-2 py-1 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded-lg transition-colors"
            title="View results"
          >
            <BarChart2 className="w-3 h-3" />
            Results
          </button>
        )}
        {showEdit && (
          <button
            onClick={onEdit}
            className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition-colors"
            title="Edit"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
        {showDelete && (
          <button
            onClick={onDelete}
            className="flex items-center gap-1 px-2 py-1 bg-red-900/50 hover:bg-red-800/70 text-red-300 text-xs rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
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
      <div className="flex items-center justify-between px-3 pt-3 pb-2 gap-2 flex-shrink-0">
        <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => setTab('my')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${tab === 'my' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <User className="w-3 h-3 inline mr-1" />
            My Sets
          </button>
          <button
            onClick={() => setTab('building')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${tab === 'building' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Building2 className="w-3 h-3 inline mr-1" />
            Building
          </button>
        </div>
        <div className="flex gap-1.5">
          {isAdmin && tab === 'building' && (
            <button
              onClick={onGenerateWithAI}
              title="Generate with AI (Admin)"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-700 hover:bg-violet-600 text-white text-xs rounded-lg transition-colors"
            >
              <Wand2 className="w-3 h-3" />
              AI
            </button>
          )}
          <button
            onClick={tab === 'my' ? onCreateNew : onCreateNewBuilding}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg transition-colors"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {tab === 'my' ? (
          loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : sets.length === 0 ? (
            <ScaledEmptyState
              icon={BookOpen}
              title="No Sets Yet"
              subtitle="Click + New to create your first guided experience."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3">
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
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        ) : buildingSets.length === 0 ? (
          <ScaledEmptyState
            icon={Building2}
            title="No Building Sets"
            subtitle={
              isAdmin
                ? 'Click + New to create a building-level set.'
                : 'No building sets have been created yet.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
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
