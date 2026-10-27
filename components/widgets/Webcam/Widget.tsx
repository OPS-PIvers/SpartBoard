import { copyText } from '@/utils/copyText';
import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useEffectEvent,
} from 'react';
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
  Pause,
  Play,
  Pencil,
  Columns2,
} from 'lucide-react';
import { PathObject, WidgetData, WebcamConfig } from '@/types';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { useAuth } from '@/context/useAuth';
import { useDashboardActions } from '@/context/dashboardCanvasStore';
import { useDialog } from '@/context/useDialog';
import { extractTextWithGemini } from '@/utils/ai';
import { WidgetLayout } from '../WidgetLayout';
import { CapturedItem } from './types';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { useDocCamView } from './useDocCamView';
import { DocCamViewControls } from './DocCamViewControls';
import { DocCamInkLayer, DocCamInkToolbar } from './DocCamInk';
import {
  type CompareSide,
  DocCamCompare,
  LIVE_COMPARE_ID,
} from './DocCamCompare';
import { INK_COLORS, type InkTool, paintInk } from './docCamInk';
import { DocCamQualityMenu } from './DocCamQualityMenu';
import {
  type CameraControls,
  normalizeResolution,
  NO_CAMERA_CONTROLS,
  readCameraControls,
  resolutionConstraints,
  setAutoMode,
} from './docCamQuality';
import { useCommandStack } from '@/components/widgets/DrawingWidget/useCommandStack';
import {
  type Size,
  isDefaultView,
  mediaBox,
  mediaTransform,
  renderView,
  toOcrDataUrl,
} from './docCamView';

const NO_SIZE: Size = { width: 0, height: 0 };
const videoSizeOf = (v: HTMLVideoElement): Size => ({
  width: v.videoWidth,
  height: v.videoHeight,
});
const naturalSizeOf = (img: HTMLImageElement): Size => ({
  width: img.naturalWidth,
  height: img.naturalHeight,
});

export const WebcamWidget: React.FC<{
  widget: WidgetData;
  isActive?: boolean;
}> = ({ widget: _widget, isActive = true }) => {
  const { canAccessFeature } = useAuth();
  const { addWidget, addToast, updateWidget } = useDashboardActions();
  const { showAlert, showConfirm } = useDialog();
  const ocrMode: 'standard' | 'gemini' =
    canAccessFeature('gemini-functions') && canAccessFeature('webcam-ai')
      ? 'gemini'
      : 'standard';
  const widgetConfig = (_widget.config || {}) as WebcamConfig;

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isMirrored, setIsMirrored] = useState(true);
  const [capturedItems, setCapturedItems] = useState<CapturedItem[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [comparePick, setComparePick] = useState<string[] | null>(null);
  const [compareSides, setCompareSides] = useState<
    readonly [CompareSide, CompareSide] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [showCaptureSuccess, setShowCaptureSuccess] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const resolution = normalizeResolution(widgetConfig.resolution);
  const constraintsKey = canAccessFeature('document-camera-pro')
    ? resolution
    : 'auto';
  const [retryKey, setRetryKey] = useState(0);
  const [cameraLost, setCameraLost] = useState(false);
  const [cameraControls, setCameraControls] =
    useState<CameraControls>(NO_CAMERA_CONTROLS);
  const startedStreamRef = useRef<MediaStream | null>(null);
  const remoteImgRef = useRef<HTMLImageElement>(null);
  const frozenImgRef = useRef<HTMLImageElement>(null);
  const [frozenUrl, setFrozenUrl] = useState<string | null>(null);
  const frozenUrlRef = useRef<string | null>(null);
  const docCamPro = canAccessFeature('document-camera-pro');
  const {
    attachFeed,
    size: feedSize,
    view: docCamView,
    isPanning,
    zoomIn,
    zoomOut,
    rotate,
    resetView,
  } = useDocCamView({
    enabled: docCamPro,
    savedZoom: widgetConfig.zoomLevel,
    savedRotation: widgetConfig.rotation,
    onSave: (patch) => updateWidget(_widget.id, { config: patch }),
  });
  const isRemoteShown = !!(
    widgetConfig.isRemoteMode && widgetConfig.remoteCaptureDataUrl
  );
  const isFrozen = docCamPro && !isRemoteShown && frozenUrl !== null;

  // Ink over the feed is view-only: it never goes on the board, only into photos.
  const [inkStrokes, setInkStrokes] = useState<PathObject[]>([]);
  // Camera frame sizes, so ink is stored against the picture rather than the widget box.
  const [videoSize, setVideoSize] = useState<Size>(NO_SIZE);
  const [remoteSize, setRemoteSize] = useState<Size>(NO_SIZE);
  const [isDrawing, setIsDrawing] = useState(false);
  const [inkTool, setInkTool] = useState<InkTool>('pen');
  const [penColor, setPenColor] = useState<string>(INK_COLORS[0].value);
  // A new picture (unfreeze, camera switch, another phone photo) starts a fresh drawing and undo history.
  const [inkPage, setInkPage] = useState(0);
  const clearInkPage = useCallback(() => {
    setInkStrokes([]);
    setInkPage((n) => n + 1);
  }, []);
  const inkSourceKey = isRemoteShown
    ? (widgetConfig.remoteCaptureDataUrl ?? '')
    : 'live';
  const [prevInkSourceKey, setPrevInkSourceKey] = useState(inkSourceKey);
  if (prevInkSourceKey !== inkSourceKey) {
    setPrevInkSourceKey(inkSourceKey);
    clearInkPage();
  }
  const inkFrame = useMemo(
    () => ({
      feed: feedSize,
      source: isRemoteShown ? remoteSize : videoSize,
      view: docCamView,
      mirrored: !isRemoteShown && isMirrored,
    }),
    [feedSize, isRemoteShown, remoteSize, videoSize, docCamView, isMirrored]
  );
  const inkStack = useCommandStack({
    pageKey: `camera-${inkPage}`,
    objects: inkStrokes,
    onObjectsChange: (next) =>
      setInkStrokes(next.filter((o): o is PathObject => o.kind === 'path')),
  });

  // Document camera view: the photo matches the turned, zoomed feed.
  const captureDocCamView = useCallback(
    (withInk = false, forOcr = false): string => {
      const encode = (canvas: HTMLCanvasElement | null, type = 'image/png') =>
        !canvas
          ? ''
          : forOcr
            ? toOcrDataUrl(canvas)
            : canvas.toDataURL(type, 0.9);
      const overlayFor = (source: Size, mirrored: boolean) =>
        withInk && inkStrokes.length > 0
          ? (ctx: CanvasRenderingContext2D) =>
              paintInk(ctx, inkStrokes, {
                feed: feedSize,
                source,
                view: docCamView,
                mirrored,
              })
          : undefined;
      const frozen = frozenImgRef.current;
      if (isFrozen) {
        // Never fall back to the hidden live video while the frozen frame loads.
        if (!frozen?.naturalWidth) return '';
        const size = {
          width: frozen.naturalWidth,
          height: frozen.naturalHeight,
        };
        const canvas = renderView(
          frozen,
          size,
          docCamView,
          isMirrored,
          feedSize,
          overlayFor(size, isMirrored)
        );
        return encode(canvas);
      }
      if (isRemoteShown) {
        const img = remoteImgRef.current;
        const size = {
          width: img?.naturalWidth ?? 0,
          height: img?.naturalHeight ?? 0,
        };
        const overlay = overlayFor(size, false);
        if (!img || !size.width || (isDefaultView(docCamView) && !overlay)) {
          return widgetConfig.remoteCaptureDataUrl ?? '';
        }
        const canvas = renderView(
          img,
          size,
          docCamView,
          false,
          feedSize,
          overlay
        );
        // JPEG keeps a phone photo near the size the phone sent.
        return encode(canvas, 'image/jpeg');
      }
      const video = videoRef.current;
      if (!video) return '';
      const size = { width: video.videoWidth, height: video.videoHeight };
      const canvas = renderView(
        video,
        size,
        docCamView,
        isMirrored,
        feedSize,
        overlayFor(size, isMirrored)
      );
      return encode(canvas);
    },
    [
      feedSize,
      docCamView,
      isFrozen,
      inkStrokes,
      isMirrored,
      isRemoteShown,
      widgetConfig.remoteCaptureDataUrl,
    ]
  );

  // Bumped on every freeze/unfreeze so a slow toBlob from an older freeze is dropped.
  const freezeToken = useRef(0);
  const unfreeze = useCallback(() => {
    freezeToken.current += 1;
    if (frozenUrlRef.current) URL.revokeObjectURL(frozenUrlRef.current);
    frozenUrlRef.current = null;
    setFrozenUrl(null);
    clearInkPage();
  }, [clearInkPage]);

  // Holds the current frame on screen so the paper can move while the class keeps seeing it.
  const freeze = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const token = ++freezeToken.current;
    canvas.toBlob((blob) => {
      if (!blob || token !== freezeToken.current) return;
      if (frozenUrlRef.current) URL.revokeObjectURL(frozenUrlRef.current);
      const url = URL.createObjectURL(blob);
      frozenUrlRef.current = url;
      setFrozenUrl(url);
    }, 'image/png');
  }, []);

  useEffect(
    () => () => {
      freezeToken.current += 1;
      if (frozenUrlRef.current) URL.revokeObjectURL(frozenUrlRef.current);
    },
    []
  );
  // Remote mode or the flag turning off drops a held frame, so coming back shows live video.
  const freezeAllowed = docCamPro && !isRemoteShown;
  if (!freezeAllowed && frozenUrl !== null) setFrozenUrl(null);
  useEffect(() => {
    if (freezeAllowed) return;
    freezeToken.current += 1;
    if (frozenUrlRef.current) URL.revokeObjectURL(frozenUrlRef.current);
    frozenUrlRef.current = null;
  }, [freezeAllowed]);
  const liveComparable = docCamPro && !isRemoteShown && !!stream;
  // Picks and a shown comparison drop the live camera once it is gone.
  const validPick = comparePick?.filter(
    (id) =>
      (id === LIVE_COMPARE_ID && liveComparable) ||
      capturedItems.some((c) => c.id === id)
  );
  const shownCompare =
    docCamPro &&
    compareSides &&
    compareSides.every((side) => side.kind !== 'live' || liveComparable)
      ? compareSides
      : null;
  if (compareSides && !shownCompare) setCompareSides(null);
  if (comparePick && validPick && validPick.length !== comparePick.length) {
    setComparePick(validPick);
  }

  const onCameraStarted = useEffectEvent((mediaStream: MediaStream) => {
    if (!docCamPro) return;
    setCameraLost(false);
    startedStreamRef.current = mediaStream;
    const track = mediaStream.getVideoTracks()[0];
    setCameraControls(readCameraControls(track));
    track?.addEventListener?.('ended', () => {
      if (startedStreamRef.current !== mediaStream) return;
      setCameraControls(NO_CAMERA_CONTROLS);
      setCameraLost(true);
      setStream(null);
      setError('Camera disconnected');
    });
  });
  // True when the failure was handled: an unplugged camera waits to come back, a stale remembered one falls back.
  const onCameraFailed = useEffectEvent((err: unknown): boolean => {
    if (!docCamPro) return false;
    const name = err instanceof DOMException ? err.name : '';
    const gone = name === 'NotFoundError' || name === 'OverconstrainedError';
    // Only a camera that was working before counts as unplugged.
    if (startedStreamRef.current && (gone || name === 'NotReadableError')) {
      setCameraControls(NO_CAMERA_CONTROLS);
      setCameraLost(true);
      setError('Camera disconnected');
      return true;
    }
    if (selectedDeviceId && gone) {
      setSelectedDeviceId('');
      return true;
    }
    setCameraControls(NO_CAMERA_CONTROLS);
    return false;
  });

  const applyAutoMode = useCallback(
    async (kind: 'focusMode' | 'exposureMode', on: boolean) => {
      const track = stream?.getVideoTracks()[0];
      if (!track) return;
      const ok = await setAutoMode(track, kind, on);
      if (ok) setCameraControls(readCameraControls(track));
      else addToast('This camera did not accept that change.', 'info');
    },
    [addToast, stream]
  );

  // The doc-cam layout remounts the <video> (flag change, leaving remote mode), so hand it the stream again.
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream && video.srcObject !== stream) video.srcObject = stream;
  }, [stream, docCamPro, isRemoteShown]);

  useEffect(() => {
    // When the host Board becomes inactive, release the camera immediately so
    // another Board's Webcam widget (or the OS) can acquire it.
    if (!isActive) {
      const existing = videoRef.current?.srcObject;
      if (existing instanceof MediaStream) {
        existing.getTracks().forEach((track) => track.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
      }
      startedStreamRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears state after releasing the camera
      setStream(null);
      return;
    }

    let cancelled = false;
    let currentStream: MediaStream | null = null;

    async function startCamera() {
      try {
        const constraints: MediaStreamConstraints = {
          video: {
            ...(selectedDeviceId
              ? { deviceId: { exact: selectedDeviceId } }
              : { facingMode: 'user' }),
            ...resolutionConstraints(constraintsKey),
          },
          audio: false,
        };

        const mediaStream =
          await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        currentStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        setError(null);
        onCameraStarted(mediaStream);
        // Enumerate after the grant so ids are populated without a second getUserMedia.
        const allDevices = await navigator.mediaDevices
          .enumerateDevices()
          .catch(() => []);
        if (cancelled) return;
        setDevices(allDevices.filter((d) => d.kind === 'videoinput'));
      } catch (err) {
        if (cancelled) return;
        console.error('Error accessing webcam:', err);
        if (onCameraFailed(err)) return;
        setError('Could not access webcam');
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isActive, selectedDeviceId, constraintsKey, retryKey]);

  // A Chromebook doc cam that is unplugged comes back on its own when plugged in again.
  useEffect(() => {
    if (!cameraLost || !isActive) return;
    const media = navigator.mediaDevices;
    const onChange = () => setRetryKey((k) => k + 1);
    media.addEventListener?.('devicechange', onChange);
    return () => media.removeEventListener?.('devicechange', onChange);
  }, [cameraLost, isActive]);

  const switchCamera = useCallback(() => {
    if (devices.length < 2) return;
    const currentId =
      stream?.getVideoTracks()[0]?.getSettings().deviceId ?? selectedDeviceId;
    const currentIndex = devices.findIndex((d) => d.deviceId === currentId);
    const nextIndex = (currentIndex + 1) % devices.length;
    // A different camera that fails to start is busy, not unplugged.
    startedStreamRef.current = null;
    setSelectedDeviceId(devices[nextIndex].deviceId);
    unfreeze();
  }, [devices, selectedDeviceId, stream, unfreeze]);

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
      if (docCamPro) {
        dataUrl = captureDocCamView(false, true);
        if (!dataUrl) throw new Error('Could not capture the camera view');
      } else if (isRemote && widgetConfig.remoteCaptureDataUrl) {
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
        text = await extractTextWithGemini(dataUrl, 'webcam');
      } else {
        // Loaded on demand: tesseract.js is multi-megabyte and only the local OCR mode needs it.
        const { default: Tesseract } = await import('tesseract.js');
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
    captureDocCamView,
    docCamPro,
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
      void copyText(extractedText).then((ok) => {
        if (!ok) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [extractedText]);

  const handleSendToNotes = useCallback(() => {
    if (!extractedText) return;
    performSendToNotes(extractedText);
    setShowTextModal(false);
  }, [extractedText, performSendToNotes]);

  const takePhoto = useCallback(() => {
    let dataUrl = '';

    if (docCamPro) {
      dataUrl = captureDocCamView(true);
    } else if (widgetConfig.isRemoteMode && widgetConfig.remoteCaptureDataUrl) {
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
    captureDocCamView,
    docCamPro,
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

  const togglePick = useCallback((id: string) => {
    setComparePick((prev) => {
      if (!prev) return prev;
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      return prev.length < 2 ? [...prev, id] : prev;
    });
  }, []);

  const showCompare = useCallback(
    (picks: readonly string[]) => {
      if (picks.length !== 2) return;
      const sides = picks.map((id): CompareSide | null => {
        if (id === LIVE_COMPARE_ID) return { kind: 'live' };
        const index = capturedItems.findIndex((c) => c.id === id);
        if (index < 0) return null;
        const { dataUrl } = capturedItems[index];
        return { kind: 'photo', id, dataUrl, label: `Photo ${index + 1}` };
      });
      const [a, b] = sides;
      if (!a || !b) return;
      setCompareSides([a, b]);
      setComparePick(null);
      setShowGallery(false);
    },
    [capturedItems]
  );

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
                  {...tourAttr('webcam.retry-camera', _widget.id, _widget.type)}
                  onClick={() => {
                    if (!docCamPro) {
                      window.location.reload();
                      return;
                    }
                    setError(null);
                    // A camera that never started gets the default camera, as the old reload did.
                    if (!cameraLost) {
                      startedStreamRef.current = null;
                      setSelectedDeviceId('');
                    }
                    setRetryKey((k) => k + 1);
                  }}
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
              {docCamPro ? (
                <div
                  ref={attachFeed}
                  data-inking-surface=""
                  className="absolute inset-0 overflow-hidden"
                  style={{
                    cursor:
                      docCamView.zoom > 1
                        ? isPanning
                          ? 'grabbing'
                          : 'grab'
                        : undefined,
                  }}
                >
                  {isRemoteShown ? (
                    <img
                      data-pii=""
                      ref={remoteImgRef}
                      src={widgetConfig.remoteCaptureDataUrl}
                      alt="Remote Capture"
                      draggable={false}
                      onLoad={(e) =>
                        setRemoteSize(naturalSizeOf(e.currentTarget))
                      }
                      className="absolute object-cover max-w-none select-none"
                      style={{
                        ...mediaBox(docCamView.rotation, feedSize),
                        transform: mediaTransform(docCamView, false),
                      }}
                    />
                  ) : (
                    <video
                      data-pii=""
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      onLoadedMetadata={(e) =>
                        setVideoSize(videoSizeOf(e.currentTarget))
                      }
                      onResize={(e) =>
                        setVideoSize(videoSizeOf(e.currentTarget))
                      }
                      className={`absolute object-cover max-w-none ${isFrozen ? 'invisible' : ''}`}
                      style={{
                        ...mediaBox(docCamView.rotation, feedSize),
                        transform: mediaTransform(docCamView, isMirrored),
                      }}
                    />
                  )}
                  {isFrozen && frozenUrl && (
                    <img
                      data-pii=""
                      ref={frozenImgRef}
                      src={frozenUrl}
                      alt="Frozen camera frame"
                      draggable={false}
                      className="absolute object-cover max-w-none select-none"
                      style={{
                        ...mediaBox(docCamView.rotation, feedSize),
                        transform: mediaTransform(docCamView, isMirrored),
                      }}
                    />
                  )}
                  <DocCamInkLayer
                    strokes={inkStrokes}
                    frame={inkFrame}
                    active={isDrawing}
                    tool={inkTool}
                    penColor={penColor}
                    onStroke={(stroke) =>
                      inkStack.push({ kind: 'add', object: stroke })
                    }
                  />
                </div>
              ) : widgetConfig.isRemoteMode &&
                widgetConfig.remoteCaptureDataUrl ? (
                <img
                  data-pii=""
                  src={widgetConfig.remoteCaptureDataUrl}
                  alt="Remote Capture"
                  className="w-full h-full object-cover transition-transform duration-500"
                />
              ) : (
                <video
                  data-pii=""
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-transform duration-500 ${isMirrored ? 'scale-x-[-1]' : 'scale-x-1'}`}
                />
              )}

              {isFrozen && (
                <div
                  className="absolute flex items-center bg-black/70 text-white font-semibold rounded-lg z-30 pointer-events-none"
                  style={{
                    top: 'min(12px, 3cqmin)',
                    left: 'min(12px, 3cqmin)',
                    gap: 'min(6px, 1.5cqmin)',
                    padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                    fontSize: 'min(13px, 3.25cqmin)',
                  }}
                  role="status"
                >
                  <Pause
                    aria-hidden="true"
                    style={{
                      width: 'min(14px, 3.5cqmin)',
                      height: 'min(14px, 3.5cqmin)',
                    }}
                  />
                  Frozen
                </div>
              )}

              {docCamPro && isDrawing && (
                <DocCamInkToolbar
                  widgetId={_widget.id}
                  widgetType={_widget.type}
                  tool={inkTool}
                  penColor={penColor}
                  canUndo={inkStack.canUndo}
                  hasInk={inkStrokes.length > 0}
                  onTool={setInkTool}
                  onPenColor={setPenColor}
                  onUndo={inkStack.undo}
                  onClear={() =>
                    inkStack.push({ kind: 'clear', objects: inkStrokes })
                  }
                />
              )}

              {docCamPro && (
                <DocCamViewControls
                  widgetId={_widget.id}
                  widgetType={_widget.type}
                  view={docCamView}
                  disabled={isRemoteShown ? false : !stream}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onRotate={rotate}
                  onReset={resetView}
                >
                  {!isRemoteShown && (
                    <DocCamQualityMenu
                      widgetId={_widget.id}
                      widgetType={_widget.type}
                      resolution={resolution}
                      controls={cameraControls}
                      onResolution={(r) => {
                        // The restart may find the old stream still holding the camera; that isn't an unplug.
                        startedStreamRef.current = null;
                        updateWidget(_widget.id, { config: { resolution: r } });
                      }}
                      onAutoFocus={(on) => void applyAutoMode('focusMode', on)}
                      onAutoExposure={(on) =>
                        void applyAutoMode('exposureMode', on)
                      }
                    />
                  )}
                </DocCamViewControls>
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
                    {...tourAttr('webcam.take-photo', _widget.id, _widget.type)}
                    onClick={takePhoto}
                    disabled={
                      widgetConfig.isRemoteMode
                        ? !widgetConfig.remoteCaptureDataUrl
                        : !stream && !isFrozen
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
                  {docCamPro && !isRemoteShown && (
                    <button
                      {...tourAttr('webcam.freeze', _widget.id, _widget.type)}
                      onClick={isFrozen ? unfreeze : freeze}
                      disabled={!isFrozen && !stream}
                      aria-pressed={isFrozen}
                      aria-label="Freeze"
                      className={`rounded-2xl text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed ${isFrozen ? 'bg-blue-500/30 text-blue-400' : 'hover:bg-white/30'}`}
                      style={{ padding: 'min(12px, 2.5cqmin)' }}
                      title={isFrozen ? 'Unfreeze' : 'Freeze'}
                    >
                      {isFrozen ? (
                        <Play
                          style={{
                            width: 'min(20px, 5cqmin)',
                            height: 'min(20px, 5cqmin)',
                          }}
                        />
                      ) : (
                        <Pause
                          style={{
                            width: 'min(20px, 5cqmin)',
                            height: 'min(20px, 5cqmin)',
                          }}
                        />
                      )}
                    </button>
                  )}
                  {docCamPro && (
                    <button
                      {...tourAttr('webcam.draw', _widget.id, _widget.type)}
                      onClick={() => setIsDrawing((on) => !on)}
                      aria-pressed={isDrawing}
                      aria-label="Draw"
                      className={`rounded-2xl text-white transition-all ${isDrawing ? 'bg-blue-500/30 text-blue-400' : 'hover:bg-white/30'}`}
                      style={{ padding: 'min(12px, 2.5cqmin)' }}
                      title="Draw"
                    >
                      <Pencil
                        style={{
                          width: 'min(20px, 5cqmin)',
                          height: 'min(20px, 5cqmin)',
                        }}
                      />
                    </button>
                  )}
                  <button
                    {...tourAttr(
                      'webcam.extract-text',
                      _widget.id,
                      _widget.type
                    )}
                    onClick={extractText}
                    disabled={
                      (widgetConfig.isRemoteMode
                        ? !widgetConfig.remoteCaptureDataUrl
                        : !stream && !isFrozen) || isExtracting
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
                    {...tourAttr('webcam.mirror', _widget.id, _widget.type)}
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
                      {...tourAttr(
                        'webcam.switch-camera',
                        _widget.id,
                        _widget.type
                      )}
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
                      {...tourAttr(
                        'webcam.exit-remote',
                        _widget.id,
                        _widget.type
                      )}
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
                  {...tourAttr('webcam.open-gallery', _widget.id, _widget.type)}
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
                    <span
                      className="absolute top-2 right-2 bg-blue-500 rounded-full border border-black"
                      style={{
                        width: 'min(8px, 2cqmin)',
                        height: 'min(8px, 2cqmin)',
                      }}
                    />
                  )}
                </button>
              </div>

              {/* Status Overlays */}
              {showCaptureSuccess && (
                <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 backdrop-blur-sm z-40 animate-in fade-in zoom-in duration-300">
                  <div
                    className="bg-green-500 text-white rounded-full shadow-2xl"
                    style={{ padding: 'min(24px, 6cqmin)' }}
                  >
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
                  <div
                    className="bg-brand-blue-primary text-white rounded-full shadow-2xl"
                    style={{
                      padding: 'min(24px, 6cqmin)',
                      marginBottom: 'min(16px, 4cqmin)',
                    }}
                  >
                    <Loader2
                      className="animate-spin"
                      style={{
                        width: 'min(48px, 12cqmin)',
                        height: 'min(48px, 12cqmin)',
                      }}
                    />
                  </div>
                  <div
                    className="bg-black/60 backdrop-blur-md rounded-full text-white font-bold tracking-widest uppercase"
                    style={{
                      fontSize: 'min(12px, 3cqmin)',
                      paddingLeft: 'min(16px, 4cqmin)',
                      paddingRight: 'min(16px, 4cqmin)',
                      paddingTop: 'min(8px, 2cqmin)',
                      paddingBottom: 'min(8px, 2cqmin)',
                    }}
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
                <div
                  className="flex items-center"
                  style={{ gap: 'min(8px, 2cqmin)' }}
                >
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
                  {...tourAttr('webcam.text-close', _widget.id, _widget.type)}
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
                className="flex-1 overflow-y-auto custom-scrollbar"
                style={{ padding: 'min(16px, 3.5cqmin)' }}
              >
                <div
                  className="bg-white/5 border border-white/10 rounded-xl text-white/90 whitespace-pre-wrap font-mono selection:bg-blue-500/30"
                  style={{
                    fontSize: 'min(14px, 3.5cqmin)',
                    lineHeight: '1.6',
                    padding: 'min(16px, 3.5cqmin)',
                  }}
                >
                  {extractedText ?? 'No text found.'}
                </div>
              </div>

              <div
                className="border-t border-white/10 flex justify-end"
                style={{
                  padding: 'min(16px, 3.5cqmin)',
                  gap: 'min(12px, 3cqmin)',
                }}
              >
                <button
                  {...tourAttr(
                    'webcam.send-to-notes',
                    _widget.id,
                    _widget.type
                  )}
                  onClick={handleSendToNotes}
                  className="flex items-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-lg active:scale-95"
                  style={{
                    fontSize: 'min(12px, 3cqmin)',
                    padding: 'min(8px, 1.5cqmin) min(16px, 3cqmin)',
                    gap: 'min(8px, 2cqmin)',
                  }}
                >
                  <FileText style={{ width: 'min(14px, 3.5cqmin)' }} />
                  Send to Notes
                </button>
                <button
                  {...tourAttr('webcam.copy-text', _widget.id, _widget.type)}
                  onClick={handleCopy}
                  className="flex items-center bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-lg active:scale-95"
                  style={{
                    fontSize: 'min(12px, 3cqmin)',
                    padding: 'min(8px, 1.5cqmin) min(16px, 3cqmin)',
                    gap: 'min(8px, 2cqmin)',
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

          {shownCompare && (
            <DocCamCompare
              widgetId={_widget.id}
              widgetType={_widget.type}
              sides={shownCompare}
              stream={stream}
              isMirrored={isMirrored}
              rotation={docCamView.rotation}
              onExit={() => setCompareSides(null)}
            />
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
                  {comparePick ? 'Pick two to compare' : 'Photo Gallery'}
                </h3>
                {comparePick ? (
                  <div
                    className="flex items-center"
                    style={{ gap: 'min(8px, 2cqmin)' }}
                  >
                    <button
                      {...tourAttr(
                        'webcam.compare-show',
                        _widget.id,
                        _widget.type
                      )}
                      onClick={() => showCompare(validPick ?? [])}
                      disabled={validPick?.length !== 2}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        fontSize: 'min(12px, 3cqmin)',
                        padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                      }}
                    >
                      Show side by side
                    </button>
                    <button
                      {...tourAttr(
                        'webcam.compare-cancel',
                        _widget.id,
                        _widget.type
                      )}
                      onClick={() => setComparePick(null)}
                      className="hover:bg-white/30 rounded-lg text-white"
                      style={{
                        fontSize: 'min(12px, 3cqmin)',
                        padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div
                    className="flex items-center"
                    style={{ gap: 'min(8px, 2cqmin)' }}
                  >
                    {docCamPro &&
                      capturedItems.length + (liveComparable ? 1 : 0) >= 2 && (
                        <button
                          {...tourAttr(
                            'webcam.compare',
                            _widget.id,
                            _widget.type
                          )}
                          onClick={() => setComparePick([])}
                          className="relative touch-target-expand hover:bg-white/30 rounded-lg text-white"
                          style={{ padding: 'min(8px, 2cqmin)' }}
                          title="Compare"
                          aria-label="Compare"
                        >
                          <Columns2
                            style={{
                              width: 'min(16px, 4cqmin)',
                              height: 'min(16px, 4cqmin)',
                            }}
                          />
                        </button>
                      )}
                    <button
                      {...tourAttr(
                        'webcam.clear-gallery',
                        _widget.id,
                        _widget.type
                      )}
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
                      {...tourAttr(
                        'webcam.gallery-close',
                        _widget.id,
                        _widget.type
                      )}
                      onClick={() => {
                        setShowGallery(false);
                        setComparePick(null);
                      }}
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
                )}
              </div>

              <div
                className="flex-1 overflow-y-auto custom-scrollbar"
                style={{ padding: 'min(16px, 3.5cqmin)' }}
              >
                {comparePick ? (
                  <div
                    className="grid grid-cols-2"
                    style={{ gap: 'min(16px, 3.5cqmin)' }}
                  >
                    {[
                      ...(liveComparable
                        ? [{ id: LIVE_COMPARE_ID, dataUrl: null }]
                        : []),
                      ...capturedItems.map((c) => ({
                        id: c.id,
                        dataUrl: c.dataUrl,
                      })),
                    ].map((tile, index) => {
                      const order = (validPick ?? []).indexOf(tile.id);
                      const picked = order !== -1;
                      return (
                        // no-tour-anchor: one tile per photo; tours point at Compare and Show side by side
                        <button
                          key={tile.id}
                          onClick={() => togglePick(tile.id)}
                          aria-pressed={picked}
                          aria-label={
                            tile.dataUrl
                              ? `Photo ${liveComparable ? index : index + 1}`
                              : 'Live camera'
                          }
                          className={`relative aspect-video bg-white/10 rounded-xl overflow-hidden border-2 ${picked ? 'border-blue-400' : 'border-white/20 hover:border-white/50'}`}
                        >
                          {tile.dataUrl ? (
                            <img
                              data-pii=""
                              src={tile.dataUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span
                              className="flex flex-col items-center justify-center h-full text-white/80"
                              style={{
                                gap: 'min(6px, 1.5cqmin)',
                                fontSize: 'min(12px, 3cqmin)',
                              }}
                            >
                              <Video
                                style={{
                                  width: 'min(20px, 5cqmin)',
                                  height: 'min(20px, 5cqmin)',
                                }}
                              />
                              Live camera
                            </span>
                          )}
                          {picked && (
                            <span
                              className="absolute bg-blue-500 text-white font-bold rounded-md"
                              style={{
                                top: 'min(6px, 1.5cqmin)',
                                left: 'min(6px, 1.5cqmin)',
                                fontSize: 'min(12px, 3cqmin)',
                                padding: '0 min(6px, 1.5cqmin)',
                              }}
                            >
                              {order + 1}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : capturedItems.length === 0 ? (
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
                    {capturedItems.map((item, photoIndex) => (
                      <div
                        key={item.id}
                        className="group/photo relative aspect-video bg-white/10 rounded-xl overflow-hidden border border-white/20"
                      >
                        <img
                          data-pii=""
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
                            {...tourFieldAttr(
                              'webcam.download-photo',
                              _widget.type,
                              `photo-${photoIndex + 1}`
                            )}
                            data-tour-widget={_widget.id}
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
                            {...tourFieldAttr(
                              'webcam.delete-photo',
                              _widget.type,
                              `photo-${photoIndex + 1}`
                            )}
                            data-tour-widget={_widget.id}
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
