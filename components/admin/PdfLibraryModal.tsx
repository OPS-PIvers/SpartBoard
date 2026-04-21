import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
  getDoc,
} from 'firebase/firestore';
import {
  X,
  Plus,
  Pencil,
  Trash2,
  Save,
  ChevronUp,
  FileText,
  Building2,
  Globe,
  Settings,
  Library,
  Upload,
  Loader2,
} from 'lucide-react';
import { db, isAuthBypass } from '@/config/firebase';
import { GlobalPdfItem, PdfGlobalConfig, FeaturePermission } from '@/types';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { Toast } from '@/components/common/Toast';
import { useDialog } from '@/context/useDialog';
import { useStorage, MAX_PDF_SIZE_BYTES } from '@/hooks/useStorage';
import { DockDefaultsPanel } from './DockDefaultsPanel';

interface PdfLibraryModalProps {
  onClose: () => void;
}

type View = 'list' | 'editor' | 'settings';

const COLLECTION = 'global_pdfs';

export const PdfLibraryModal: React.FC<PdfLibraryModalProps> = ({
  onClose,
}) => {
  const { showConfirm } = useDialog();
  const { uploadAdminPdf, deleteFile } = useStorage();
  const BUILDINGS = useAdminBuildings();
  const BUILDINGS_BY_ID = React.useMemo(
    () => new Map(BUILDINGS.map((b) => [b.id, b])),
    [BUILDINGS]
  );
  const [pdfs, setPdfs] = useState<GlobalPdfItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBuildings, setEditBuildings] = useState<string[]>([]); // empty = all
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editExistingUrl, setEditExistingUrl] = useState<string | null>(null);
  const [editExistingPath, setEditExistingPath] = useState<string | null>(null);
  const [editExistingSize, setEditExistingSize] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  // Global Config state
  const [globalConfig, setGlobalConfig] = useState<PdfGlobalConfig>({});
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setMessage(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Real-time listener for global PDFs
  useEffect(() => {
    if (isAuthBypass) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, COLLECTION),
      orderBy('order', 'asc'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setPdfs(
          snap.docs.map((d) => ({ ...d.data(), id: d.id }) as GlobalPdfItem)
        );
        setLoading(false);
      },
      (err) => {
        console.error('[PdfLibraryModal]', err);
        showMessage('error', 'Failed to load global PDFs');
        setLoading(false);
      }
    );

    return unsub;
  }, [showMessage]);

  // Load global config
  useEffect(() => {
    if (isAuthBypass) return;

    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'feature_permissions', 'pdf');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as FeaturePermission;
          if (data.config) {
            setGlobalConfig(data.config as unknown as PdfGlobalConfig);
          }
        }
      } catch (err) {
        console.error('Failed to load pdf global config', err);
      }
    };

    void fetchConfig();
  }, []);

  // --- Helpers ---
  const openEditor = (pdf?: GlobalPdfItem) => {
    if (pdf) {
      setEditingId(pdf.id);
      setEditTitle(pdf.name);
      setEditBuildings(pdf.buildings ?? []);
      setEditExistingUrl(pdf.storageUrl);
      setEditExistingPath(pdf.storagePath);
      setEditExistingSize(pdf.size);
      setEditFile(null);
    } else {
      setEditingId(null);
      setEditTitle('');
      setEditBuildings([]);
      setEditExistingUrl(null);
      setEditExistingPath(null);
      setEditExistingSize(0);
      setEditFile(null);
    }
    setView('editor');
  };

  const cancelEditor = () => {
    setView('list');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      showMessage('error', 'Please upload a PDF file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_PDF_SIZE_BYTES) {
      showMessage('error', 'PDF is too large. Maximum size is 50MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setEditFile(file);
    if (!editTitle) {
      setEditTitle(file.name.replace(/\.pdf$/i, ''));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!editTitle.trim()) {
      showMessage('error', 'Please enter a title');
      return;
    }
    if (!editFile && !editExistingUrl) {
      showMessage('error', 'Please upload a PDF file');
      return;
    }

    setSaving(true);
    try {
      let finalUrl = editExistingUrl ?? '';
      let finalPath = editExistingPath ?? '';
      let finalSize = editExistingSize;

      if (editFile) {
        showMessage('success', 'Uploading PDF...');
        const { url, storagePath } = await uploadAdminPdf(editFile);
        finalUrl = url;
        finalPath = storagePath;
        finalSize = editFile.size;

        // Best effort to delete old file if replacing
        if (editExistingPath && editExistingPath !== storagePath) {
          try {
            await deleteFile(editExistingPath);
          } catch {
            // non-fatal
          }
        }
      }

      const id = editingId ?? crypto.randomUUID();
      const pdfData: GlobalPdfItem = {
        id,
        name: editTitle.trim(),
        storageUrl: finalUrl,
        storagePath: finalPath,
        size: finalSize,
        buildings: editBuildings,
        uploadedAt: editingId
          ? (pdfs.find((a) => a.id === editingId)?.uploadedAt ?? Date.now())
          : Date.now(),
        order: editingId
          ? (pdfs.find((a) => a.id === editingId)?.order ?? pdfs.length)
          : pdfs.length,
      };

      await setDoc(doc(db, COLLECTION, id), {
        ...pdfData,
        createdAt: editingId
          ? pdfs.find((a) => a.id === editingId)?.createdAt
          : Date.now(), // to sort correctly in query
      });

      showMessage(
        'success',
        editingId ? 'PDF updated' : 'PDF published to library'
      );
      setView('list');
    } catch (err) {
      console.error(err);
      showMessage('error', 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const docRef = doc(db, 'feature_permissions', 'pdf');
      const snap = await getDoc(docRef);
      const currentPerm = snap.exists()
        ? (snap.data() as FeaturePermission)
        : {
            widgetType: 'pdf',
            accessLevel: 'public',
            betaUsers: [],
            enabled: true,
          };

      await setDoc(docRef, {
        ...currentPerm,
        config: globalConfig,
      });
      showMessage('success', 'Global settings saved');
    } catch (err) {
      console.error(err);
      showMessage('error', 'Failed to save settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleDelete = async (pdf: GlobalPdfItem) => {
    const confirmed = await showConfirm(
      `Delete "${pdf.name}" from the global library?`,
      { title: 'Delete PDF', variant: 'danger', confirmLabel: 'Delete' }
    );
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, COLLECTION, pdf.id));
      try {
        await deleteFile(pdf.storagePath);
      } catch {
        // non-fatal
      }
      showMessage('success', 'PDF removed');
    } catch (err) {
      console.error(err);
      showMessage('error', 'Delete failed');
    }
  };

  const toggleBuilding = (buildingId: string) => {
    setEditBuildings((prev) =>
      prev.includes(buildingId)
        ? prev.filter((id) => id !== buildingId)
        : [...prev, buildingId]
    );
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const pdfToMoveUp = pdfs[index];
    const pdfToMoveDown = pdfs[index - 1];

    const orderUp = pdfToMoveUp.order ?? index;
    const orderDown = pdfToMoveDown.order ?? index - 1;
    const batch = writeBatch(db);
    batch.update(doc(db, COLLECTION, pdfToMoveUp.id), { order: orderDown });
    batch.update(doc(db, COLLECTION, pdfToMoveDown.id), { order: orderUp });
    try {
      await batch.commit();
    } catch (err) {
      console.error(err);
      showMessage('error', 'Failed to reorder');
    }
  };

  // --- Building badge display ---
  const buildingLabel = (buildings: string[] | undefined): string => {
    if (!buildings || buildings.length === 0) return 'All Buildings';
    if (buildings.length === BUILDINGS.length) return 'All Buildings';
    return buildings
      .map((id) => BUILDINGS_BY_ID.get(id)?.name ?? id)
      .join(', ');
  };

  // --- Render ---
  return (
    <div className="fixed inset-0 z-modal-nested bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-red-100 text-red-600 p-1.5 rounded-lg">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-800 uppercase tracking-widest">
                Global PDF Library
              </h3>
              <p className="text-xxs text-slate-400 font-medium">
                {view === 'list'
                  ? `${pdfs.length} PDF${pdfs.length !== 1 ? 's' : ''} published`
                  : view === 'settings'
                    ? 'Global PDF settings'
                    : editingId
                      ? 'Edit PDF'
                      : 'New PDF'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {view !== 'editor' && (
              <div className="flex bg-slate-100 p-1 rounded-xl mr-2">
                <button
                  onClick={() => setView('list')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xxs font-black uppercase tracking-widest transition-all ${
                    view === 'list'
                      ? 'bg-white text-red-600 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Library className="w-3.5 h-3.5" />
                  Library
                </button>
                <button
                  onClick={() => setView('settings')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xxs font-black uppercase tracking-widest transition-all ${
                    view === 'settings'
                      ? 'bg-white text-red-600 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  Settings
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        {view === 'list' ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                Loading…
              </div>
            ) : pdfs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 py-16">
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                  <FileText className="w-10 h-10 stroke-slate-300" />
                </div>
                <div className="text-center">
                  <p className="font-black text-sm uppercase tracking-widest mb-1">
                    No PDFs yet
                  </p>
                  <p className="text-xs">
                    Upload your first PDF to share it with teachers.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {pdfs.map((pdf, idx) => (
                  <div
                    key={pdf.id}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-3 shadow-sm hover:shadow-md hover:border-red-200 transition-all"
                  >
                    {/* Reorder handle / index */}
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => handleMoveUp(idx)}
                        disabled={idx === 0}
                        className="text-slate-300 hover:text-slate-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="Move up"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Icon */}
                    <div className="bg-red-50 text-red-600 rounded-lg flex items-center justify-center shrink-0 border border-red-100 w-9 h-9">
                      <FileText className="w-5 h-5" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-800 truncate">
                        {pdf.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xxs text-slate-400 font-mono">
                          {(pdf.size / 1024).toFixed(1)} KB
                        </span>
                        <span className="text-slate-200">•</span>
                        <span
                          className={`flex items-center gap-1 text-xxs font-bold ${
                            !pdf.buildings || pdf.buildings.length === 0
                              ? 'text-emerald-600'
                              : 'text-red-600'
                          }`}
                        >
                          {!pdf.buildings || pdf.buildings.length === 0 ? (
                            <Globe className="w-3 h-3" />
                          ) : (
                            <Building2 className="w-3 h-3" />
                          )}
                          {buildingLabel(pdf.buildings)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditor(pdf)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(pdf)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : view === 'settings' ? (
          /* Settings View */
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            <DockDefaultsPanel
              config={{
                dockDefaults: globalConfig.dockDefaults ?? {},
              }}
              onChange={(dockDefaults) =>
                setGlobalConfig((prev) => ({ ...prev, dockDefaults }))
              }
            />
            <div className="pt-2">
              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-red-100 transition-all active:scale-95"
              >
                {isSavingSettings ? (
                  'Saving Settings…'
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Global Settings
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Editor View */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
              {/* File Upload */}
              <div>
                <label className="block text-xxs font-black uppercase text-slate-400 tracking-widest mb-1">
                  PDF File
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {editFile || editExistingUrl ? 'Change PDF' : 'Upload PDF'}
                  </button>
                  <span className="text-xs font-medium text-slate-600 truncate">
                    {editFile
                      ? editFile.name
                      : editExistingUrl
                        ? 'Existing PDF loaded'
                        : 'No file chosen'}
                  </span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Title */}
              <div>
                <label className="block text-xxs font-black uppercase text-slate-400 tracking-widest mb-1">
                  PDF Name
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="e.g. District Policy"
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500 shadow-sm"
                />
              </div>

              {/* Building Targeting */}
              <div>
                <label className="block text-xxs font-black uppercase text-slate-400 tracking-widest mb-1">
                  Available To
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Select which buildings can see this PDF. Leave all unchecked
                  to make it available to everyone.
                </p>
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  {BUILDINGS.map((building) => {
                    const isSelected = editBuildings.includes(building.id);
                    return (
                      <button
                        key={building.id}
                        type="button"
                        onClick={() => toggleBuilding(building.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-xs font-bold transition-colors ${
                          isSelected
                            ? 'bg-red-600 text-white border-red-600 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{building.name}</span>
                        <span
                          className={`ml-auto text-xxs font-normal ${isSelected ? 'text-red-200' : 'text-slate-400'}`}
                        >
                          {building.gradeLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {editBuildings.length === 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-bold">
                    <Globe className="w-4 h-4 shrink-0" />
                    Visible to teachers in all buildings
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="shrink-0 border-t border-slate-100 px-5 py-3 flex gap-3">
              <button
                onClick={cancelEditor}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 border border-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={
                  saving || !editTitle.trim() || (!editFile && !editExistingUrl)
                }
                className="flex-1 flex items-center justify-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-red-200 transition-all"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {editingId ? 'Update PDF' : 'Publish PDF'}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Footer (list view only) */}
        {view === 'list' && (
          <div className="shrink-0 border-t border-slate-100 px-5 py-3 flex items-center justify-between">
            <p className="text-xxs text-slate-400">
              PDFs are available to teachers via the PDF widget library.
            </p>
            <button
              onClick={() => openEditor()}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-red-200 transition-all"
            >
              <Plus className="w-4 h-4" /> New PDF
            </button>
          </div>
        )}
      </div>

      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}
    </div>
  );
};
