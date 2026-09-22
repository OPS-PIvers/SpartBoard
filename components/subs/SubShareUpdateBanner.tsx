/**
 * Tells a sub their teacher pushed new boards, and lets them take them when
 * they are ready. Nothing changes until they press Reload: a teacher updating
 * mid-lesson must not wipe a running timer or a half-taken lunch count.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';

interface SubShareUpdateBannerProps {
  teacherName: string;
  onReload: () => void;
}

export const SubShareUpdateBanner: React.FC<SubShareUpdateBannerProps> = ({
  teacherName,
  onReload,
}) => {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      data-screenshot="exclude"
      className="fixed top-20 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full bg-slate-800/90 backdrop-blur-xl border border-white/20 shadow-xl px-4 py-2 text-sm text-slate-200"
      style={{ zIndex: Z_INDEX.dock }}
    >
      <span>
        {t('subShare.update.available', {
          defaultValue: '{{teacher}} updated these boards.',
          teacher: teacherName,
        })}
      </span>
      <button
        type="button"
        onClick={onReload}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 px-3 py-1 text-xs font-bold text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <RefreshCw className="w-3.5 h-3.5" aria-hidden />
        {t('subShare.update.reload', { defaultValue: 'Reload' })}
      </button>
    </div>
  );
};
