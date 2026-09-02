import React from 'react';
import type { ActivityWallAppearance } from '@/types';
import { ACTIVITY_WALL_DEFAULT_APPEARANCE } from '@/types';

interface WallShellProps {
  appearance?: ActivityWallAppearance;
  title?: string;
  prompt?: string;
  children: React.ReactNode;
}

/**
 * Full-page background for the student submission screens. Renders the wall's
 * appearance directly (Tailwind class or preset image URL) — this page must
 * never import `useBackgrounds`, which requires the teacher auth context.
 */
export const WallShell: React.FC<WallShellProps> = ({
  appearance,
  title,
  prompt,
  children,
}) => {
  const resolved = appearance ?? ACTIVITY_WALL_DEFAULT_APPEARANCE;
  const isImage = resolved.kind === 'image';

  return (
    <div
      className={`min-h-screen w-full overflow-y-auto bg-slate-800 bg-cover bg-center ${
        isImage ? '' : resolved.value
      }`}
      style={
        isImage ? { backgroundImage: `url(${resolved.value})` } : undefined
      }
    >
      <div className="flex min-h-screen items-start justify-center p-4 sm:p-6">
        <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-xl">
          {(Boolean(title) || Boolean(prompt)) && (
            <div className="bg-brand-blue-primary px-5 py-4 text-white">
              <p className="text-xs font-bold uppercase tracking-widest opacity-90">
                Activity wall
              </p>
              {title && <h1 className="text-xl font-black">{title}</h1>}
              {prompt && (
                <p className="mt-1 text-sm font-medium text-white/90">
                  {prompt}
                </p>
              )}
            </div>
          )}
          <div className="space-y-4 p-5">{children}</div>
        </div>
      </div>
    </div>
  );
};
