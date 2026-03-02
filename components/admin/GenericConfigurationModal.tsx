import React, { useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import {
  FeaturePermission,
  WidgetType,
  InternalToolType,
  ToolMetadata,
} from '@/types';
import { FeatureConfigurationPanel } from './FeatureConfigurationPanel';

interface GenericConfigurationModalProps {
  tool: ToolMetadata;
  permission: FeaturePermission;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  updatePermission: (
    widgetType: WidgetType | InternalToolType,
    updates: Partial<FeaturePermission>
  ) => void;
  showMessage: (type: 'success' | 'error', text: string) => void;
  uploadWeatherImage: (rangeId: string, file: File) => Promise<string>;
}

export const GenericConfigurationModal: React.FC<
  GenericConfigurationModalProps
> = ({
  tool,
  permission,
  onClose,
  onSave,
  isSaving,
  hasUnsavedChanges,
  updatePermission,
  showMessage,
  uploadWeatherImage,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className={`${tool.color} p-2 rounded-xl text-white`}>
              <tool.icon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 tracking-tight">
                {tool.label} Administration
              </h2>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                Global Settings & Building Defaults
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-slate-50">
          <FeatureConfigurationPanel
            tool={tool}
            permission={permission}
            updatePermission={updatePermission}
            showMessage={showMessage}
            uploadWeatherImage={uploadWeatherImage}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <p className="text-xxs text-slate-400 font-bold uppercase tracking-widest">
            {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-2xl text-sm font-black text-slate-500 hover:bg-white transition-all border border-transparent hover:border-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                void onSave();
              }}
              disabled={isSaving || !hasUnsavedChanges}
              className="px-8 py-2.5 bg-brand-blue-primary text-white rounded-2xl text-sm font-black shadow-lg shadow-blue-500/20 hover:bg-brand-blue-dark transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save Configuration
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
