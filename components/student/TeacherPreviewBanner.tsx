import React from 'react';
import { Eye } from 'lucide-react';

/**
 * Banner shown atop student route lobbies when the URL carries `?preview=1`.
 * Lets a teacher verify what students will see without their teacher Firebase
 * session being replaced by `signInAnonymously` or contaminating a session
 * via the SSO auto-join path. Pure visual — reads no auth state.
 */
export const TeacherPreviewBanner: React.FC = () => (
  <div className="w-full bg-indigo-500/15 border-b border-indigo-400/30 px-4 py-3 flex items-center justify-center gap-2 text-indigo-200 text-sm font-semibold backdrop-blur-sm">
    <Eye className="w-4 h-4 shrink-0" />
    <span>Teacher preview — students will see this exact screen.</span>
  </div>
);
