import React from 'react';
import { ClipboardList, Library } from 'lucide-react';

// Row icon that tells quizzes and question banks apart once they share folders.
export const LibraryKindIcon: React.FC<{ kind: 'quiz' | 'bank' }> = ({
  kind,
}) => {
  const Icon = kind === 'quiz' ? ClipboardList : Library;
  return (
    <span
      aria-hidden
      className={`flex h-full w-full items-center justify-center ${
        kind === 'quiz'
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-slate-100 text-slate-600'
      }`}
    >
      <Icon
        style={{ width: 'min(22px, 6cqmin)', height: 'min(22px, 6cqmin)' }}
      />
    </span>
  );
};
