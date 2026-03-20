import React from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import {
  FeaturePermission,
  WidgetType,
  InternalToolType,
  ToolMetadata,
} from '@/types';
import { FeatureConfigurationPanel } from './FeatureConfigurationPanel';
import { Modal } from '../common/Modal';

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
  const header = (
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
  );

  const footer = (
    <div className="flex items-center justify-between w-full">
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
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidth="max-w-4xl"
      customHeader={header}
      footer={footer}
      className="!p-0"
      contentClassName="bg-slate-50"
      footerClassName="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between w-full shrink-0"
    >
      <div className="p-6 space-y-8">
        <FeatureConfigurationPanel
          tool={tool}
          permission={permission}
          updatePermission={updatePermission}
          showMessage={showMessage}
          uploadWeatherImage={uploadWeatherImage}
        />
      </div>
    </Modal>
  );
};
