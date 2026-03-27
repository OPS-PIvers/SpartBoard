import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Upload, ArrowLeft, Loader2 } from 'lucide-react';
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useStorage, MAX_PDF_SIZE_BYTES } from '@/hooks/useStorage';
import { WidgetData, PdfItem, PdfConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { SortableRow } from './components/SortableRow';
import { useDialog } from '@/context/useDialog';

export const PdfWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget, addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const { user } = useAuth();
  const { uploadAndRegisterPdf, deleteFile, uploading } = useStorage();
  const config = widget.config as PdfConfig;

  const [library, setLibrary] = useState<PdfItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Firestore real-time sync for PDF library
  useEffect(() => {
    if (!user) return;
    const pdfsRef = collection(db, 'users', user.uid, 'pdfs');
    const q = query(
      pdfsRef,
      orderBy('order', 'asc'),
      orderBy('uploadedAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pdfs = snapshot.docs.map(
        (d) => ({ ...d.data(), id: d.id }) as PdfItem
      );
      setLibrary(pdfs);
    });
    return () => unsubscribe();
  }, [user]);

  const handleOpen = (pdf: PdfItem) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        activePdfId: pdf.id,
        activePdfUrl: pdf.storageUrl,
        activePdfName: pdf.name,
      },
    });
  };

  const handleBackToLibrary = () => {
    updateWidget(widget.id, {
      config: {
        ...config,
        activePdfId: null,
        activePdfUrl: null,
        activePdfName: null,
      },
    });
  };

  const handleUpload = async (file: File) => {
    if (!user) return;
    try {
      addToast('Uploading PDF…', 'info');
      const pdfData = await uploadAndRegisterPdf(user.uid, file);
      addToast(`"${pdfData.name}" saved to library`, 'success');
      // Auto-open the newly uploaded PDF
      updateWidget(widget.id, {
        config: {
          ...config,
          activePdfId: pdfData.id,
          activePdfUrl: pdfData.storageUrl,
          activePdfName: pdfData.name,
        },
      });
    } catch (err) {
      console.error(err);
      addToast('Upload failed', 'error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      addToast('Please upload a PDF file.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_PDF_SIZE_BYTES) {
      addToast('PDF is too large. Maximum size is 50MB.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    void handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (id: string, storagePath: string) => {
    if (!user) return;
    const confirmed = await showConfirm('Remove this PDF from your library?', {
      title: 'Remove PDF',
      variant: 'danger',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'pdfs', id));
      // Best-effort storage delete (may fail if URL has expired)
      try {
        await deleteFile(storagePath);
      } catch {
        // non-fatal
      }
      // If this was the active PDF, go back to library
      if (config.activePdfId === id) handleBackToLibrary();
      addToast('PDF removed', 'info');
    } catch (err) {
      console.error(err);
      addToast('Failed to delete PDF', 'error');
    }
  };

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!user || !over || active.id === over.id) return;

      const oldIndex = library.findIndex((p) => p.id === active.id);
      const newIndex = library.findIndex((p) => p.id === over.id);
      const reordered = arrayMove(library, oldIndex, newIndex);

      const batch = writeBatch(db);
      reordered.forEach((pdf, index) => {
        batch.set(doc(db, 'users', user.uid, 'pdfs', pdf.id), {
          ...pdf,
          order: index,
        });
      });

      try {
        await batch.commit();
      } catch (err) {
        console.error('Failed to save reorder', err);
      }
    },
    [library, user]
  );

  // --- VIEWER MODE ---
  if (config.activePdfUrl) {
    return (
      <WidgetLayout
        padding="p-0"
        contentClassName="flex-1 min-h-0 flex flex-col"
        content={
          <div className="w-full h-full flex flex-col">
            {/* Compact header bar */}
            <div
              className="shrink-0 bg-slate-50 border-b border-slate-200 flex items-center"
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
              }}
            >
              <button
                onClick={handleBackToLibrary}
                className="text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0 flex items-center"
                style={{ padding: 'min(4px, 1cqmin)', gap: 'min(4px, 1cqmin)' }}
                title="Back to library"
              >
                <ArrowLeft
                  style={{
                    width: 'min(14px, 3.5cqmin)',
                    height: 'min(14px, 3.5cqmin)',
                  }}
                />
                <span
                  className="font-black uppercase tracking-wider"
                  style={{ fontSize: 'min(9px, 2.5cqmin)' }}
                >
                  Library
                </span>
              </button>
              <div
                className="bg-slate-300"
                style={{ width: '1px', height: 'min(16px, 4cqmin)' }}
              />
              <span
                className="text-slate-600 font-bold truncate flex-1 min-w-0"
                style={{ fontSize: 'min(11px, 3cqmin)' }}
                title={config.activePdfName ?? ''}
              >
                {config.activePdfName}
              </span>
            </div>

            {/* PDF iframe — browser renders PDF natively */}
            <iframe
              src={config.activePdfUrl}
              className="flex-1 w-full border-none bg-white"
              title={config.activePdfName ?? 'PDF Viewer'}
            />
          </div>
        }
      />
    );
  }

  // --- LIBRARY MODE ---
  return (
    <WidgetLayout
      padding="p-0"
      contentClassName="flex-1 min-h-0 flex flex-col overflow-hidden"
      header={
        <div
          className="shrink-0 flex items-center justify-between bg-white border-b border-slate-100"
          style={{ padding: 'min(14px, 3cqmin) min(16px, 3.5cqmin)' }}
        >
          <div>
            <h2
              className="font-black text-slate-800 tracking-tight uppercase"
              style={{ fontSize: 'min(16px, 4cqmin)' }}
            >
              PDF Library
            </h2>
            <p
              className="text-slate-400 font-bold uppercase tracking-wider"
              style={{
                fontSize: 'min(9px, 2.5cqmin)',
                marginTop: 'min(2px, 0.5cqmin)',
              }}
            >
              {library.length} document{library.length !== 1 ? 's' : ''}
            </p>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-black uppercase tracking-wider shadow transition-all active:scale-95 flex items-center"
            style={{
              padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
              gap: 'min(6px, 1.5cqmin)',
              fontSize: 'min(10px, 2.5cqmin)',
            }}
            title="Upload PDF"
          >
            {uploading ? (
              <Loader2
                className="animate-spin"
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
              />
            ) : (
              <Upload
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
              />
            )}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>

          <input
            type="file"
            ref={fileInputRef}
            accept="application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      }
      content={
        <div
          className="flex-1 w-full h-full overflow-y-auto custom-scrollbar flex flex-col"
          style={{ padding: 'min(12px, 3cqmin)', gap: 'min(8px, 2cqmin)' }}
        >
          {library.length === 0 ? (
            <ScaledEmptyState
              icon={FileText}
              title="No PDFs yet"
              subtitle="Upload a PDF or drag one onto the board."
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={library.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {library.map((pdf) => (
                  <SortableRow
                    key={pdf.id}
                    pdf={pdf}
                    onOpen={handleOpen}
                    onDelete={handleDelete}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      }
      footer={
        <div
          className="shrink-0 text-center font-black text-slate-400 uppercase tracking-widest border-t border-slate-100"
          style={{
            padding: 'min(8px, 2cqmin)',
            fontSize: 'min(9px, 2.5cqmin)',
          }}
        >
          Drag to reorder · Drag a PDF onto the board to add
        </div>
      }
    />
  );
};
