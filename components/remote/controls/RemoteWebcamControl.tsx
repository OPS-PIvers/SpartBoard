import React, { useRef, useState } from 'react';
import { Camera, RefreshCw, XCircle } from 'lucide-react';
import { WidgetData, WebcamConfig } from '@/types';

interface RemoteWebcamControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

export const RemoteWebcamControl: React.FC<RemoteWebcamControlProps> = ({
  widget,
  updateWidget,
}) => {
  const config = widget.config as WebcamConfig;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCaptureClick = () => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1280;
        const scale = Math.min(1, MAX_WIDTH / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        updateWidget(widget.id, {
          config: {
            ...config,
            remoteCaptureDataUrl: dataUrl,
            remoteCaptureTimestamp: Date.now(),
            isRemoteMode: true,
          },
        });
        setIsProcessing(false);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      setIsProcessing(false);
      console.error('Failed to read file');
    };
    reader.readAsDataURL(file);

    // Clear input to allow capturing another photo even if the file name is the same
    event.target.value = '';
  };

  const exitRemoteMode = () => {
    updateWidget(widget.id, {
      config: {
        ...config,
        isRemoteMode: false,
        remoteCaptureDataUrl: undefined,
        remoteCaptureTimestamp: undefined,
      },
    });
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-6">
      <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
        Webcam
      </div>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        ref={inputRef}
        onChange={handleFileChange}
      />

      {config.isRemoteMode && config.remoteCaptureDataUrl ? (
        <div className="flex flex-col items-center gap-4">
          <div className="text-green-400 font-bold mb-2">
            Image sent to board!
          </div>
          <img
            src={config.remoteCaptureDataUrl}
            alt="Captured remotely"
            className="w-full max-w-[280px] rounded-xl border-2 border-white/20 object-contain max-h-[40vh]"
          />
          <div className="flex gap-4 mt-4 w-full max-w-[280px]">
            <button
              onClick={handleCaptureClick}
              disabled={isProcessing}
              className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-4 rounded-2xl bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white font-bold transition-all active:scale-95"
            >
              {isProcessing ? (
                <RefreshCw className="w-6 h-6 animate-spin" />
              ) : (
                <Camera className="w-6 h-6" />
              )}
              <span>Retake</span>
            </button>
            <button
              onClick={exitRemoteMode}
              className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all active:scale-95 border border-white/20"
            >
              <XCircle className="w-6 h-6" />
              <span>Exit Remote</span>
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleCaptureClick}
          disabled={isProcessing}
          className="flex flex-col items-center justify-center gap-4 w-48 h-48 rounded-3xl bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white font-black text-xl shadow-lg transition-all active:scale-95"
        >
          {isProcessing ? (
            <RefreshCw className="w-12 h-12 animate-spin" />
          ) : (
            <Camera className="w-12 h-12" />
          )}
          <span>Take Photo</span>
        </button>
      )}
    </div>
  );
};
