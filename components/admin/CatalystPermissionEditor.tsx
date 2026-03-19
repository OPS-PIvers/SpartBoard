import React from 'react';
import { Settings2 } from 'lucide-react';

/**
 * Catalyst routines are now managed via the dedicated Catalyst Configuration
 * Modal (opened from the Feature Permissions settings gear). This component is
 * kept as a stub for backward compatibility with any existing imports.
 */
export const CatalystPermissionEditor: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center text-slate-500">
      <Settings2 className="w-12 h-12 mb-4 text-slate-300" />
      <h3 className="font-bold text-lg text-slate-700 mb-2">Admin Managed</h3>
      <p className="text-sm">
        Catalyst routines are managed in the dedicated Catalyst Configuration
        modal. Click the gear icon next to &quot;Catalyst&quot; in the Feature
        Permissions list to manage routines.
      </p>
    </div>
  );
};
