import React, { useState, useRef } from 'react';
import { Wand2, Upload, Loader2, X } from 'lucide-react';
import { GuidedLearningSet } from '@/types';
import { generateGuidedLearning, buildPromptWithFileContext } from '@/utils/ai';
import { useStorage } from '@/hooks/useStorage';
import { useAuth } from '@/context/useAuth';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';

interface Props {
  onClose: () => void;
  onGenerated: (set: GuidedLearningSet) => void;
}

export const GuidedLearningAIGenerator: React.FC<Props> = ({
  onClose,
  onGenerated,
}) => {
  const { user, canAccessFeature } = useAuth();
  const { uploading, uploadHotspotImage } = useStorage();
  const [imageUrl, setImageUrl] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [imageMimeType, setImageMimeType] = useState('');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [fileContext, setFileContext] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setError('');

    // Convert to base64 for Gemini
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      setImageBase64(base64);
      setImageMimeType(file.type);
      // Upload to Storage; if it fails, reject rather than persisting a large data URI
      try {
        const url = await uploadHotspotImage(user.uid, file);
        setImageUrl(url);
      } catch {
        setError(
          'Image upload failed. Please check your connection and try again.'
        );
        setImageBase64('');
        setImageMimeType('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!imageBase64 || !imageUrl) return;
    setGenerating(true);
    setError('');
    try {
      const fullPrompt =
        buildPromptWithFileContext(prompt, fileContext, fileName) || undefined;
      const result = await generateGuidedLearning(
        imageBase64,
        imageMimeType,
        fullPrompt
      );
      const set: GuidedLearningSet = {
        id: crypto.randomUUID(),
        title: result.suggestedTitle,
        imageUrls: [imageUrl],
        steps: result.steps,
        mode: result.suggestedMode,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isBuilding: true,
        authorUid: user?.uid,
      };
      onGenerated(set);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="absolute inset-0 z-widget-internal-overlay bg-slate-900/95 backdrop-blur-sm flex flex-col p-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onClose} className="text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
        <Wand2 className="w-4 h-4 text-violet-400" />
        <span className="text-white font-semibold text-sm">
          Generate with AI
        </span>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto">
        <p className="text-slate-400 text-xs">
          Upload an image and Gemini will analyze it to automatically create a
          guided learning experience with hotspot steps.
        </p>

        {/* Image upload */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Image *</label>
          {imageUrl ? (
            <div className="relative rounded-lg overflow-hidden">
              <img
                src={imageUrl}
                alt="Selected"
                className="w-full max-h-40 object-contain bg-slate-800"
              />
              <button
                onClick={() => {
                  setImageUrl('');
                  setImageBase64('');
                }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                aria-label="Remove image"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-white/20 rounded-xl py-6 text-center hover:border-white/30 transition-colors"
            >
              <Upload className="w-6 h-6 text-slate-500 mx-auto mb-1" />
              <span className="text-slate-400 text-xs">
                Click to upload image
              </span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </div>

        {/* Optional prompt */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Additional instructions (optional)
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="e.g. Focus on vocabulary, include 3 questions, make it for 5th grade…"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
          />
        </div>

        {/* Drive file attachment */}
        {canAccessFeature('ai-file-context') && (
          <DriveFileAttachment
            onFileContent={(content, name) => {
              setFileContext(content);
              setFileName(name);
            }}
            disabled={generating}
          />
        )}

        {error && (
          <p className="text-red-400 text-xs bg-red-900/20 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}
      </div>

      <button
        onClick={handleGenerate}
        disabled={!imageBase64 || !imageUrl || generating || uploading}
        className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-colors font-medium text-sm"
      >
        {generating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <Wand2 className="w-4 h-4" />
            Generate Experience
          </>
        )}
      </button>
    </div>
  );
};
