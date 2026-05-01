import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { attemptChunkReload, isChunkLoadError } from '@/utils/chunkLoadError';

interface LazyChunkErrorBoundaryProps {
  children: React.ReactNode;
}

interface LazyChunkErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches errors thrown by a Suspended descendant — most importantly, the
 * dynamic-import failures that occur when a widget chunk no longer exists
 * after a redeploy. A stale-chunk error triggers a one-shot full-page reload
 * (guarded by sessionStorage so we never loop). Any other error renders a
 * scoped "widget failed to render" tile with a Retry button so a single bad
 * widget can't blank the entire dashboard.
 */
export class LazyChunkErrorBoundary extends React.Component<
  LazyChunkErrorBoundaryProps,
  LazyChunkErrorBoundaryState
> {
  override state: LazyChunkErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): LazyChunkErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isChunkLoadError(error)) {
      console.warn(
        '[LazyChunkErrorBoundary] Chunk load failed — attempting reload',
        error.message
      );
      attemptChunkReload();
      return;
    }
    console.error(
      '[LazyChunkErrorBoundary] Widget render error',
      error,
      info.componentStack
    );
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (isChunkLoadError(error)) {
      return (
        <div className="flex h-full w-full items-center justify-center p-4 text-center text-slate-300">
          <div
            className="flex flex-col items-center gap-2"
            style={{ fontSize: 'min(13px, 4cqmin)' }}
          >
            <RotateCw className="h-5 w-5 animate-spin text-slate-400" />
            <span>Updating to the latest version…</span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center">
        <AlertTriangle className="h-6 w-6 text-amber-400" />
        <div
          className="font-semibold text-slate-200"
          style={{ fontSize: 'min(14px, 4.5cqmin)' }}
        >
          Widget failed to load
        </div>
        <button
          type="button"
          onClick={this.handleRetry}
          className="rounded-md bg-slate-700/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-600"
        >
          Retry
        </button>
      </div>
    );
  }
}
