import React from 'react';
import {
  BookOpen,
  Boxes,
  ClipboardCheck,
  Eye,
  LayoutGrid,
  ListChecks,
  PlayCircle,
  Save,
  Shield,
  Send,
} from 'lucide-react';
import type { AssignmentMode, AssignmentWidgetKey } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import { parseAssignmentModesConfig } from '@/utils/assignmentModesConfig';
import { Toast } from '@/components/common/Toast';
import { AccessFeatureRow } from '@/components/admin/access/AccessFeatureRow';
import { useGlobalPermissionsEditor } from '@/components/admin/access/useGlobalPermissionsEditor';

/**
 * Widgets surfaced in the Assignment Modes admin section. All four widgets
 * with student-facing assignment flows are listed; flipping any of them to
 * View only swaps the teacher Assign button to Share, hides the In Progress
 * tab in favor of Shared, blocks submissions, and starts logging URL views.
 */
const ASSIGNMENT_WIDGETS: {
  key: AssignmentWidgetKey;
  label: string;
  Icon: React.ElementType;
}[] = [
  {
    key: 'quiz',
    label: 'Quiz',
    Icon: ListChecks,
  },
  {
    key: 'videoActivity',
    label: 'Video Activity',
    Icon: PlayCircle,
  },
  {
    key: 'miniApp',
    label: 'Mini Apps',
    Icon: Boxes,
  },
  {
    key: 'guidedLearning',
    label: 'Guided Learning',
    Icon: BookOpen,
  },
];

/** App-wide branding and policy, moved here from Global Settings (plan D2). */
export const AppSettingsView: React.FC = () => {
  const {
    getPermission,
    updatePermission,
    savePermission,
    saving,
    unsavedChanges,
    isSaved,
    message,
    setMessage,
    showMessage,
    loading,
  } = useGlobalPermissionsEditor();
  const { appSettings, updateAppSettings } = useAuth();
  const { uploadAdminLogo, deleteAdminLogo, uploading } = useStorage();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showMessage('error', 'Please upload an image file');
      return;
    }

    const MAX_LOGO_SIZE_MB = 1; // 1MB limit for logos
    if (file.size > MAX_LOGO_SIZE_MB * 1024 * 1024) {
      showMessage(
        'error',
        `Logo file size cannot exceed ${MAX_LOGO_SIZE_MB}MB.`
      );
      return;
    }

    try {
      const url = await uploadAdminLogo(file);
      await updateAppSettings({ logoUrl: url });
      showMessage('success', 'Logo updated successfully');
    } catch (error) {
      console.error('Error uploading logo:', error);
      showMessage('error', 'Failed to upload logo');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await deleteAdminLogo();
      await updateAppSettings({ logoUrl: '' });
      showMessage('success', 'Logo removed successfully');
    } catch (error) {
      console.error('Error removing logo:', error);
      showMessage('error', 'Failed to remove logo');
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-slate-600">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}

      {/* Global Branding */}
      {
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 mb-6 hover:border-brand-blue-light transition-all text-left">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-brand-blue-lighter p-3 rounded-xl text-brand-blue-primary">
              <Shield className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-800 text-lg">Custom Logo</h4>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="w-16 h-16 bg-slate-200 rounded-xl flex items-center justify-center overflow-hidden shrink-0 border border-slate-300">
              {appSettings?.logoUrl ? (
                <img
                  src={appSettings.logoUrl}
                  alt="Custom Logo"
                  className="w-full h-full object-contain"
                />
              ) : (
                <LayoutGrid className="w-8 h-8 text-slate-400" />
              )}
            </div>

            <div className="flex-1 flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={(e) => void handleLogoUpload(e)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 bg-brand-blue-primary text-white text-sm font-bold rounded-lg shadow-sm hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload Logo'}
              </button>

              {appSettings?.logoUrl && (
                <button
                  onClick={() => void handleRemoveLogo()}
                  disabled={uploading}
                  className="px-4 py-2 bg-white text-red-600 text-sm font-bold border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  Remove Logo
                </button>
              )}
            </div>
          </div>
        </div>
      }

      {/* Assignment Modes */}
      {(() => {
        const assignmentPermission = getPermission('assignment-modes');
        // `permission.config` is an admin-writable Firestore blob and could
        // be any shape (a stale string, an array, etc.). Run it through the
        // trust-boundary parser so the toggle UI never spreads a non-object
        // into the saved config.
        const config = parseAssignmentModesConfig(assignmentPermission.config);
        const isSavingAssignment = saving.has('assignment-modes');
        const hasUnsaved = unsavedChanges.has('assignment-modes');

        const setMode = (widget: AssignmentWidgetKey, mode: AssignmentMode) => {
          updatePermission('assignment-modes', {
            accessLevel: 'public',
            enabled: true,
            config: { ...config, [widget]: mode },
          });
        };

        return (
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 mb-6 hover:border-brand-blue-light transition-all text-left">
            <div className="flex items-center gap-4 mb-4">
              <div className="bg-brand-blue-lighter p-3 rounded-xl text-brand-blue-primary">
                <ClipboardCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-lg">
                  Assignment Modes
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Applies to new assignments only.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {ASSIGNMENT_WIDGETS.map(({ key, label, Icon }) => {
                const currentMode: AssignmentMode =
                  config[key] === 'view-only' ? 'view-only' : 'submissions';

                return (
                  <div
                    key={key}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <Icon className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                      <div className="min-w-0 font-bold text-sm text-slate-800">
                        {label}
                      </div>
                    </div>
                    <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 shrink-0 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setMode(key, 'submissions')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                          currentMode === 'submissions'
                            ? 'bg-brand-blue-primary text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-800'
                        }`}
                        aria-pressed={currentMode === 'submissions'}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Submissions
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode(key, 'view-only')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                          currentMode === 'view-only'
                            ? 'bg-brand-blue-primary text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-800'
                        }`}
                        aria-pressed={currentMode === 'view-only'}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View only
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => savePermission('assignment-modes')}
              disabled={isSavingAssignment || !hasUnsaved}
              className={`mt-4 w-full py-3 rounded-xl transition-all flex items-center justify-center gap-2 font-bold text-sm shadow-md disabled:opacity-50 ${
                hasUnsaved
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'bg-brand-blue-primary hover:bg-brand-blue-dark text-white'
              }`}
            >
              {isSavingAssignment ? (
                'Saving...'
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {hasUnsaved ? 'Save Changes' : 'Settings Up-to-Date'}
                </>
              )}
            </button>
          </div>
        );
      })()}

      <AccessFeatureRow
        featureId="org-admin-writes"
        permission={getPermission('org-admin-writes')}
        isSaved={isSaved('org-admin-writes')}
        isSaving={saving.has('org-admin-writes')}
        hasUnsaved={unsavedChanges.has('org-admin-writes')}
        onUpdate={(updates) => updatePermission('org-admin-writes', updates)}
        onSave={() => void savePermission('org-admin-writes')}
        showMessage={showMessage}
      />
    </div>
  );
};
