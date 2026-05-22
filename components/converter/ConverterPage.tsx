import React, { useCallback, useRef, useState } from 'react';
import {
  UploadCloud,
  Download,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  FileText,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import {
  convertNotebookToBundle,
  ConvertResult,
} from '@/utils/notebookConverter';

type Stage = 'idle' | 'converting' | 'done' | 'error';

const formatMb = (bytes: number): string =>
  `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export const ConverterPage: React.FC = () => {
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!/\.notebook$/i.test(file.name)) {
      setStage('error');
      setError('Please choose a SMART Notebook (.notebook) file.');
      return;
    }
    setStage('converting');
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      const res = await convertNotebookToBundle(file, {
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(res);
      setStage('done');
    } catch (err) {
      console.error(err);
      setStage('error');
      setError(
        err instanceof Error
          ? err.message
          : 'Conversion failed. Is this a valid .notebook file?'
      );
    }
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStage('idle');
    setResult(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
  };

  const pct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="min-h-screen w-full bg-slate-100 flex flex-col items-center justify-center p-6 font-sans text-slate-800">
      <div className="w-full max-w-xl">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            SMART Notebook Converter
          </h1>
          <p className="mt-2 text-slate-500 font-medium">
            Shrink a large <span className="font-bold">.notebook</span> file
            into a SpartBoard <span className="font-bold">.spartnb</span> you
            can import.
          </p>
        </header>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-300/40 border border-slate-200 overflow-hidden">
          {/* IDLE — drop zone */}
          {stage === 'idle' && (
            <div className="p-6">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-4 py-16 px-6 transition-all ${
                  dragging
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/40'
                }`}
              >
                <div className="rounded-2xl bg-indigo-600 p-4 shadow-lg shadow-indigo-500/30">
                  <UploadCloud className="w-8 h-8 text-white" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-800 text-lg">
                    Drag your .notebook here
                  </p>
                  <p className="text-slate-500 text-sm mt-1">
                    or click to browse
                  </p>
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".notebook"
                onChange={onInputChange}
                className="hidden"
              />
            </div>
          )}

          {/* CONVERTING — progress */}
          {stage === 'converting' && (
            <div className="p-10 flex flex-col items-center gap-5">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
              <p className="font-bold text-slate-800 text-lg">
                Optimizing your notebook…
              </p>
              <div className="w-full">
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-200"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-center text-sm text-slate-500 mt-2 font-medium tabular-nums">
                  {progress.total > 0
                    ? `Page ${progress.done} of ${progress.total}`
                    : 'Reading file…'}
                </p>
              </div>
            </div>
          )}

          {/* DONE — result + download */}
          {stage === 'done' && result && (
            <div className="p-8 flex flex-col items-center gap-6">
              <div className="rounded-2xl bg-green-100 p-3">
                <CheckCircle2 className="w-9 h-9 text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-black text-slate-900 text-xl truncate max-w-md">
                  {result.title}
                </p>
                <p className="text-slate-500 text-sm mt-1">Ready to import.</p>
              </div>

              <div className="grid grid-cols-3 gap-3 w-full">
                <Stat label="Pages" value={String(result.pageCount)} />
                <Stat
                  label="Lessons"
                  value={
                    result.sectionCount > 0 ? String(result.sectionCount) : '—'
                  }
                />
                <Stat
                  label="Size"
                  value={`${formatMb(result.bytesBefore)} → ${formatMb(result.bytesAfter)}`}
                  small
                />
              </div>

              <button
                onClick={download}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl py-4 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 transition-all active:scale-[0.98]"
              >
                <Download className="w-5 h-5" />
                Download .spartnb
              </button>

              <button
                onClick={reset}
                className="text-slate-500 hover:text-slate-700 font-semibold text-sm flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Convert another
              </button>
            </div>
          )}

          {/* ERROR */}
          {stage === 'error' && (
            <div className="p-8 flex flex-col items-center gap-5 text-center">
              <div className="rounded-2xl bg-red-100 p-3">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <p className="font-bold text-slate-800">{error}</p>
              <button
                onClick={reset}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl px-6 py-3 transition-all active:scale-95"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Reassurance + how-to */}
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
            <ShieldCheck className="w-4 h-4 text-green-600" />
            <span>Converts entirely on your device. Nothing is uploaded.</span>
          </div>
          {stage === 'done' && (
            <div className="flex items-start gap-2 text-slate-500 text-sm bg-white/60 border border-slate-200 rounded-xl p-4">
              <FileText className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" />
              <span>
                Back in SpartBoard, open the SMART Notebook widget, click{' '}
                <span className="font-semibold text-slate-700">Import</span>,
                and choose the <span className="font-semibold">.spartnb</span>{' '}
                file you just downloaded.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; small?: boolean }> = ({
  label,
  value,
  small,
}) => (
  <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-3 text-center">
    <p
      className={`font-black text-slate-800 ${small ? 'text-xs leading-tight' : 'text-2xl'}`}
    >
      {value}
    </p>
    <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mt-1">
      {label}
    </p>
  </div>
);

export default ConverterPage;
