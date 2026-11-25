import React from 'react';
import { tourAttr } from '@/config/tourAnchors';
import { LayoutGrid, Shield } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import { ImagePicker } from '@/components/common/imagePicker/ImagePicker';
import { AccessFeatureRow } from '@/components/admin/access/AccessFeatureRow';
import { useGlobalPermissionsEditor } from '@/components/admin/access/useGlobalPermissionsEditor';

/** App-wide branding and policy, moved here from Global Settings (plan D2). */
export const AppSettingsView: React.FC = () => {
  const {
    getPermission,
    updatePermission,
    savePermission,
    saving,
    unsavedChanges,
    isSaved,
    showMessage,
    loading,
  } = useGlobalPermissionsEditor();
  const { appSettings, updateAppSettings, canAccessFeature } = useAuth();
  const unifiedPicker = canAccessFeature('unified-image-picker');
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

  const savePickedLogo = async (url: string) => {
    try {
      await updateAppSettings({ logoUrl: url });
      showMessage('success', 'Logo updated successfully');
    } catch (error) {
      console.error('Error saving logo:', error);
      showMessage('error', 'Failed to upload logo');
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
      {/* Global Branding */}
      {
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 mb-6 hover:border-brand-blue-light transition-all text-left">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-brand-blue-lighter p-3 rounded-xl text-brand-blue-primary">
              <Shield className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-800 text-lg">Custom Logo</h4>
          </div>

          {unifiedPicker ? (
            <div className="max-w-md">
              <ImagePicker
                value={appSettings?.logoUrl}
                pasteScope="element"
                maxBytes={1024 * 1024}
                tourScope={{ type: 'admin.org', field: 'logo' }}
                tourOverrides={{
                  upload: tourAttr('admin.org.upload-logo'),
                  remove: tourAttr('admin.org.remove-logo'),
                }}
                upload={uploadAdminLogo}
                onChange={(url) => void savePickedLogo(url)}
                onRemove={() => void handleRemoveLogo()}
              />
            </div>
          ) : (
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
                  // no-tour-anchor: hidden file input opened by its upload button
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={(e) => void handleLogoUpload(e)}
                />
                <button
                  {...tourAttr('admin.org.upload-logo')}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="px-4 py-2 bg-brand-blue-primary text-white text-sm font-bold rounded-lg shadow-xs hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload Logo'}
                </button>

                {appSettings?.logoUrl && (
                  <button
                    {...tourAttr('admin.org.remove-logo')}
                    onClick={() => void handleRemoveLogo()}
                    disabled={uploading}
                    className="px-4 py-2 bg-white text-red-600 text-sm font-bold border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    Remove Logo
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      }

      <div className="border-y border-slate-200">
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
    </div>
  );
};
