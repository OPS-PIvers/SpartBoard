import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera,
  Download,
  Trash2,
  X,
  Grid,
  FileText,
  Loader2,
  Copy,
  Check,
  Video,
  FlipHorizontal,
} from 'lucide-react';
import { WidgetData, WebcamConfig } from '@/types';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { extractTextWithGemini } from '@/utils/ai';
import Tesseract from 'tesseract.js';
import { WidgetLayout } from '../WidgetLayout';
import { CapturedItem, WebcamGlobalConfig } from './types';

export const WebcamWidget: React.FC<{ widget: WidgetData }> = ({
  widget: _widget,
}) => {
  const { featurePermissions } = useAuth();
  const { addWidget, addToast, updateWidget } = useDashboard();
  const { showAlert, showConfirm } = useDialog();
  const webcamPermission = featurePermissions.find(
    (p) => p.widgetType === 'webcam'
  );
  const config = (webcamPermission?.config ?? {}) as WebcamGlobalConfig;
  const ocrMode = config.ocrMode ?? 'standard';
  const widgetConfig = (_widget.config || {}) as WebcamConfig;

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isMirrored, setIsMirrored] = useState(true);
  const [capturedItems, setCapturedItems] = useState<CapturedItem[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [showCaptureSuccess, setShowCaptureSuccess] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    async function startCamera() {
      try {
        // Enumerate devices if not already done
        if (devices.length === 0) {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = allDevices.filter(
            (d) => d.kind === 'videoinput'
          );
          setDevices(videoDevices);
          if (videoDevices.length > 0 && !selectedDeviceId) {
            setSelectedDeviceId(videoDevices[0].deviceId);
          }
        }

        const constraints: MediaStreamConstraints = {
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : { facingMode: 'user' },
          audio: false,
        };

        const mediaStream =
          await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        setError(null);
      } catch (err) {
        console.error('Error accessing webcam:', err);
        setError('Could not access webcam');
      }
    }

    void startCamera();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [selectedDeviceId, devices.length]);

  const switchCamera = useCallback(() => {
    if (devices.length < 2) return;
    const currentIndex = devices.findIndex(
      (d) => d.deviceId === selectedDeviceId
    );
    const nextIndex = (currentIndex + 1) % devices.length;
    setSelectedDeviceId(devices[nextIndex].deviceId);
  }, [devices, selectedDeviceId]);

  const performSendToNotes = useCallback(
    (text: string) => {
      if (!text) return;
      const trimmedText = text.trim();

      if (!trimmedText) {
        addToast('No usable text detected.', 'info');
        return;
      }

      const safeText = trimmedText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br/>');

      addWidget('text', {
        x: _widget.x + _widget.w + 20,
        y: _widget.y,
        config: {
          content: safeText,
        },
      });
      addToast('Created new Notes widget with text', 'success');
    },
    [addWidget, addToast, _widget]
  );

  const extractText = useCallback(async () => {
    const isRemote =
      widgetConfig.isRemoteMode && widgetConfig.remoteCaptureDataUrl;
    if (!isRemote && !videoRef.current) return;

    setIsExtracting(true);
    try {
      let dataUrl = '';
      if (isRemote && widgetConfig.remoteCaptureDataUrl) {
        dataUrl = widgetConfig.remoteCaptureDataUrl;
      } else if (videoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');

        if (isMirrored) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(videoRef.current, 0, 0);
        dataUrl = canvas.toDataURL('image/png');
      }

      let text = '';
      if (ocrMode === 'gemini') {
        text = await extractTextWithGemini(dataUrl);
      } else {
        const result = await Tesseract.recognize(dataUrl, 'eng');
        text = result.data.text;
      }

      if (widgetConfig.autoSendToNotes) {
        performSendToNotes(text);
      } else {
        setExtractedText(text);
        setShowTextModal(true);
      }
    } catch (err) {
      console.error('OCR Error:', err);
      await showAlert('Failed to extract text. Please try again.', {
        title: 'OCR Failed',
        variant: 'error',
      });
    } finally {
      setIsExtracting(false);
    }
  }, [
    isMirrored,
    ocrMode,
    showAlert,
    widgetConfig.autoSendToNotes,
    widgetConfig.isRemoteMode,
    widgetConfig.remoteCaptureDataUrl,
    performSendToNotes,
  ]);

  const handleCopy = useCallback(() => {
    if (extractedText) {
      void navigator.clipboard.writeText(extractedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [extractedText]);

  const handleSendToNotes = useCallback(() => {
    if (!extractedText) return;
    performSendToNotes(extractedText);
    setShowTextModal(false);
  }, [extractedText, performSendToNotes]);

  const takePhoto = useCallback(() => {
    let dataUrl = '';

    if (widgetConfig.isRemoteMode && widgetConfig.remoteCaptureDataUrl) {
      dataUrl = widgetConfig.remoteCaptureDataUrl;
    } else if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (isMirrored) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(videoRef.current, 0, 0);
        dataUrl = canvas.toDataURL('image/png');
      }
    }

    if (dataUrl) {
      const newItem: CapturedItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        dataUrl,
        status: 'captured',
      };
      setCapturedItems((prev) => [newItem, ...prev]);

      // Visual feedback
      setShowCaptureSuccess(true);
      setTimeout(() => setShowCaptureSuccess(false), 1500);
    }
  }, [
    isMirrored,
    widgetConfig.isRemoteMode,
    widgetConfig.remoteCaptureDataUrl,
  ]);

  const toggleMirror = useCallback(() => setIsMirrored((prev) => !prev), []);

  const downloadPhoto = useCallback((dataUrl: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `photo-${Date.now()}.png`;
    link.click();
  }, []);

  const clearPhotos = useCallback(async () => {
    const confirmed = await showConfirm(
      'Are you sure you want to delete all photos?',
      {
        title: 'Delete All Photos',
        variant: 'danger',
        confirmLabel: 'Delete All',
      }
    );
    if (confirmed) {
      setCapturedItems([]);
    }
  }, [showConfirm]);

  const deletePhoto = useCallback((id: string) => {
    setCapturedItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="relative h-full w-full bg-slate-950 overflow-hidden group">
          {error ? (
            <ScaledEmptyState
              icon={Camera}
              title="Camera Error"
              subtitle={error}
              className="text-white/50"
              action={
                <button
                  onClick={() => window.location.reload()}
                  className="bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                  style={{
                    fontSize: 'min(12px, 3cqmin)',
                    padding: 'min(8px, 1.5cqmin) min(16px, 3cqmin)',
                  }}
                >
                  Retry Camera
                </button>
              }
            />
          ) : (
            <>
              {widgetConfig.isRemoteMode &&
              widgetConfig.remoteCaptureDataUrl ? (
                <img
                  src={widgetConfig.remoteCaptureDataUrl}
                  alt="Remote Capture"
                  className="w-full h-full object-cover transition-transform duration-500"
                />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-transform duration-500 ${isMirrored ? 'scale-x-[-1]' : 'scale-x-1'}`}
                />
              )}

              {/* Controls Overlay */}
              <div
                className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center bg-black/60 backdrop-blur-2xl rounded-3xl border border-white/30 shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-30"
                style={{
                  gap: 'min(8px, 2cqmin)',
                  padding: 'min(8px, 2cqmin)',
                }}
              >
                <div
                  className="flex items-center border-r border-white/20"
                  style={{
                    gap: 'min(4px, 1cqmin)',
                    paddingRight: 'min(8px, 2cqmin)',
                  }}
                >
                  <button
                    onClick={takePhoto}
                    disabled={
                      widgetConfig.isRemoteMode
                        ? !widgetConfig.remoteCaptureDataUrl
                        : !stream
                    }
                    className="hover:bg-white/30 rounded-2xl text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ padding: 'min(12px, 2.5cqmin)' }}
                    title="Take Photo"
                  >
                    <Camera
                      style={{
                        width: 'min(20px, 5cqmin)',
                        height: 'min(20px, 5cqmin)',
                      }}
                    />
                  </button>
                  <button
                    onClick={extractText}
                    disabled={
                      (widgetConfig.isRemoteMode
                        ? !widgetConfig.remoteCaptureDataUrl
                        : !stream) || isExtracting
                    }
                    className={`rounded-2xl text-white transition-all ${isExtracting ? 'bg-blue-500/30 text-blue-400 animate-pulse' : 'hover:bg-white/30'}`}
                    style={{ padding: 'min(12px, 2.5cqmin)' }}
                    title="Extract Text (OCR)"
                  >
                    {isExtracting ? (
                      <Loader2
                        className="animate-spin"
                        style={{
                          width: 'min(20px, 5cqmin)',
                          height: 'min(20px, 5cqmin)',
                        }}
                      />
                    ) : (
                      <FileText
                        style={{
                          width: 'min(20px, 5cqmin)',
                          height: 'min(20px, 5cqmin)',
                        }}
                      />
                    )}
                  </button>
                  <button
                    onClick={toggleMirror}
                    disabled={widgetConfig.isRemoteMode ? false : !stream}
                    className={`rounded-2xl text-white transition-all ${isMirrored ? 'bg-blue-500/30 text-blue-400' : 'hover:bg-white/30'}`}
                    style={{ padding: 'min(12px, 2.5cqmin)' }}
                    title="Mirror Camera"
                  >
                    <FlipHorizontal
                      className={isMirrored ? 'rotate-180' : ''}
                      style={{
                        width: 'min(20px, 5cqmin)',
                        height: 'min(20px, 5cqmin)',
                      }}
                    />
                  </button>
                  {devices.length > 1 && !widgetConfig.isRemoteMode && (
                    <button
                      onClick={switchCamera}
                      disabled={!stream}
                      className="hover:bg-white/30 rounded-2xl text-white"
                      style={{ padding: 'min(12px, 2.5cqmin)' }}
                      title="Switch Camera"
                    >
                      <Video
                        style={{
                          width: 'min(20px, 5cqmin)',
                          height: 'min(20px, 5cqmin)',
                        }}
                      />
                    </button>
                  )}
                  {widgetConfig.isRemoteMode && (
                    <button
                      onClick={() => {
                        updateWidget(_widget.id, {
                          config: {
                            ...widgetConfig,
                            isRemoteMode: false,
                            remoteCaptureDataUrl: undefined,
                            remoteCaptureTimestamp: undefined,
                          },
                        });
                      }}
                      className="hover:bg-white/30 rounded-2xl text-white"
                      style={{ padding: 'min(12px, 2.5cqmin)' }}
                      title="Exit Remote Mode"
                    >
                      <X
                        style={{
                          width: 'min(20px, 5cqmin)',
                          height: 'min(20px, 5cqmin)',
                        }}
                      />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setShowGallery(true)}
                  className="relative hover:bg-white/30 rounded-2xl text-white"
                  style={{ padding: 'min(12px, 2.5cqmin)' }}
                  title="View Gallery"
                >
                  <Grid
                    style={{
                      width: 'min(20px, 5cqmin)',
                      height: 'min(20px, 5cqmin)',
                    }}
                  />
                  {capturedItems.length > 0 && (
                    <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full border border-black" />
                  )}
                </button>
              </div>

              {/* Status Overlays */}
              {showCaptureSuccess && (
                <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 backdrop-blur-sm z-40 animate-in fade-in zoom-in duration-300">
                  <div className="bg-green-500 text-white rounded-full p-6 shadow-2xl">
                    <Check
                      style={{
                        width: 'min(48px, 12cqmin)',
                        height: 'min(48px, 12cqmin)',
                      }}
                    />
                  </div>
                </div>
              )}

              {isExtracting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-500/20 backdrop-blur-sm z-40 animate-in fade-in duration-300">
                  <div className="bg-brand-blue-primary text-white rounded-full p-6 shadow-2xl mb-4">
                    <Loader2
                      className="animate-spin"
                      style={{
                        width: 'min(48px, 12cqmin)',
                        height: 'min(48px, 12cqmin)',
                      }}
                    />
                  </div>
                  <div
                    className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full text-white font-bold tracking-widest uppercase"
                    style={{ fontSize: 'min(12px, 3cqmin)' }}
                  >
                    Processing Text...
                  </div>
                </div>
              )}
            </>
          )}

          {/* Extracted Text Modal */}
          {showTextModal && (
            <div className="absolute inset-0 z-widget-internal-overlay bg-slate-950/95 backdrop-blur-md flex flex-col animate-in fade-in duration-300">
              <div
                className="flex items-center justify-between border-b border-white/20 shrink-0"
                style={{ padding: 'min(16px, 3.5cqmin)' }}
              >
                <div className="flex items-center gap-2">
                  <FileText
                    className="text-blue-400"
                    style={{
                      width: 'min(16px, 4cqmin)',
                      height: 'min(16px, 4cqmin)',
                    }}
                  />
                  <h3
                    className="text-white uppercase tracking-widest font-bold"
                    style={{ fontSize: 'min(12px, 3cqmin)' }}
                  >
                    Extracted Text
                  </h3>
                </div>
                <button
                  onClick={() => setShowTextModal(false)}
                  className="hover:bg-white/30 rounded-lg text-white"
                  style={{ padding: 'min(8px, 2cqmin)' }}
                >
                  <X
                    style={{
                      width: 'min(16px, 4cqmin)',
                      height: 'min(16px, 4cqmin)',
                    }}
                  />
                </button>
              </div>

              <div
                className="flex-1 overflow-y-auto custom-scrollbar p-4"
                style={{ padding: 'min(16px, 3.5cqmin)' }}
              >
                <div
                  className="bg-white/5 border border-white/10 rounded-xl p-4 text-white/90 whitespace-pre-wrap font-mono selection:bg-blue-500/30"
                  style={{
                    fontSize: 'min(14px, 3.5cqmin)',
                    lineHeight: '1.6',
                  }}
                >
                  {extractedText ?? 'No text found.'}
                </div>
              </div>

              <div
                className="p-4 border-t border-white/10 flex justify-end gap-3"
                style={{ padding: 'min(16px, 3.5cqmin)' }}
              >
                <button
                  onClick={handleSendToNotes}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-lg active:scale-95"
                  style={{
                    fontSize: 'min(12px, 3cqmin)',
                    padding: 'min(8px, 1.5cqmin) min(16px, 3cqmin)',
                  }}
                >
                  <FileText style={{ width: 'min(14px, 3.5cqmin)' }} />
                  Send to Notes
                </button>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-lg active:scale-95"
                  style={{
                    fontSize: 'min(12px, 3cqmin)',
                    padding: 'min(8px, 1.5cqmin) min(16px, 3cqmin)',
                  }}
                >
                  {copied ? (
                    <Check style={{ width: 'min(14px, 3.5cqmin)' }} />
                  ) : (
                    <Copy style={{ width: 'min(14px, 3.5cqmin)' }} />
                  )}
                  {copied ? 'Copied!' : 'Copy Text'}
                </button>
              </div>
            </div>
          )}

          {/* Gallery Overlay */}
          {showGallery && (
            <div className="absolute inset-0 z-widget-internal-overlay bg-slate-950/95 backdrop-blur-md flex flex-col animate-in slide-in-from-bottom duration-300">
              <div
                className="flex items-center justify-between border-b border-white/20 shrink-0"
                style={{ padding: 'min(16px, 3.5cqmin)' }}
              >
                <h3
                  className="text-white uppercase tracking-widest"
                  style={{ fontSize: 'min(12px, 3cqmin)' }}
                >
                  Photo Gallery
                </h3>
                <div
                  className="flex items-center"
                  style={{ gap: 'min(8px, 2cqmin)' }}
                >
                  <button
                    onClick={clearPhotos}
                    className="hover:bg-white/30 rounded-lg text-red-400"
                    style={{ padding: 'min(8px, 2cqmin)' }}
                    title="Clear All"
                  >
                    <Trash2
                      style={{
                        width: 'min(16px, 4cqmin)',
                        height: 'min(16px, 4cqmin)',
                      }}
                    />
                  </button>
                  <button
                    onClick={() => setShowGallery(false)}
                    className="hover:bg-white/30 rounded-lg text-white"
                    style={{ padding: 'min(8px, 2cqmin)' }}
                  >
                    <X
                      style={{
                        width: 'min(16px, 4cqmin)',
                        height: 'min(16px, 4cqmin)',
                      }}
                    />
                  </button>
                </div>
              </div>

              <div
                className="flex-1 overflow-y-auto custom-scrollbar"
                style={{ padding: 'min(16px, 3.5cqmin)' }}
              >
                {capturedItems.length === 0 ? (
                  <ScaledEmptyState
                    icon={FileText}
                    title="No photos yet"
                    className="text-white/30"
                  />
                ) : (
                  <div
                    className="grid grid-cols-2"
                    style={{ gap: 'min(16px, 3.5cqmin)' }}
                  >
                    {capturedItems.map((item) => (
                      <div
                        key={item.id}
                        className="group/photo relative aspect-video bg-white/10 rounded-xl overflow-hidden border border-white/20"
                      >
                        <img
                          src={item.dataUrl}
                          alt="Captured"
                          className="w-full h-full object-cover"
                        />
                        <div
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center"
                          style={{ gap: 'min(12px, 3cqmin)' }}
                        >
                          <button
                            onClick={() => downloadPhoto(item.dataUrl)}
                            className="bg-white/20 hover:bg-white/30 rounded-full text-white transition-all"
                            style={{ padding: 'min(8px, 2cqmin)' }}
                            title="Download"
                          >
                            <Download
                              style={{
                                width: 'min(16px, 4cqmin)',
                                height: 'min(16px, 4cqmin)',
                              }}
                            />
                          </button>
                          <button
                            onClick={() => deletePhoto(item.id)}
                            className="bg-red-500/20 hover:bg-red-500/40 rounded-full text-red-400 transition-all"
                            style={{ padding: 'min(8px, 2cqmin)' }}
                            title="Delete"
                          >
                            <Trash2
                              style={{
                                width: 'min(16px, 4cqmin)',
                                height: 'min(16px, 4cqmin)',
                              }}
                            />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      }
    />
  );
};
