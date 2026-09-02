import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { ActivityWallSubmission } from '@/types';

interface MyPostsListProps {
  posts: ActivityWallSubmission[];
  allowEdit: boolean;
  allowDelete: boolean;
  busyId: string | null;
  onEdit: (post: ActivityWallSubmission) => void;
  onDelete: (post: ActivityWallSubmission) => void;
}

const firstNonEmpty = (...values: (string | undefined)[]): string => {
  for (const value of values) {
    if (value && value.trim()) return value;
  }
  return '';
};

const summarize = (post: ActivityWallSubmission): string => {
  if (post.type === 'photo' || post.type === 'video' || post.type === 'file')
    return firstNonEmpty(post.fileName, post.title, 'Uploaded file');
  return firstNonEmpty(post.title, post.content, 'Your post');
};

/** The student's own posts. Other students' posts are never shown here. */
export const MyPostsList: React.FC<MyPostsListProps> = ({
  posts,
  allowEdit,
  allowDelete,
  busyId,
  onEdit,
  onDelete,
}) => {
  if (posts.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
        Your posts
      </h2>
      <ul className="space-y-2">
        {posts.map((post) => (
          <li
            key={post.id}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
              {summarize(post)}
            </span>
            {post.status === 'pending' && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                Pending
              </span>
            )}
            {allowEdit && (
              <button
                type="button"
                aria-label={`Edit ${summarize(post)}`}
                disabled={busyId === post.id}
                onClick={() => onEdit(post)}
                className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {allowDelete && (
              <button
                type="button"
                aria-label={`Delete ${summarize(post)}`}
                disabled={busyId === post.id}
                onClick={() => onDelete(post)}
                className="rounded-lg p-1.5 text-slate-600 transition hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
