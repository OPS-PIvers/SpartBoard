/**
 * Creator — YouTube URL input + AI question generation for Video Activity.
 * Teacher pastes a YouTube URL, sets question count, and generates an activity.
 */

import React, { useState } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Link,
  Loader2,
  AlertCircle,
  X,
  PlayCircle,
  Wand2,
} from 'lucide-react';
import { VideoActivityData, VideoActivityQuestion } from '@/types';
import {
  generateVideoActivity,
  transcribeVideoWithGemini,
  GeneratedVideoQuestion,
} from '@/utils/ai';
import { extractYouTubeId } from '@/utils/youtube';
import { useAuth } from '@/context/useAuth';

interface CreatorProps {
  onBack: () => void;
  onSave: (activity: VideoActivityData) => Promise<void>;
  /** Whether the admin-gated audio transcription feature is enabled. */
  audioTranscriptionEnabled?: boolean;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const Creator: React.FC<CreatorProps> = ({
  onBack,
  onSave,
  audioTranscriptionEnabled = false,
}) => {
  const { isAdmin } = useAuth();
  const [url, setUrl] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [restrictedError, setRestrictedError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VideoActivityData | null>(null);

  const videoId = extractYouTubeId(url);
  const isValidUrl = !!videoId;

  const clearErrors = () => {
    setCaptionError(null);
    setRestrictedError(null);
    setGeneralError(null);
  };

  const buildActivityFromGenerated = (
    generated: { title: string; questions: GeneratedVideoQuestion[] },
    sourceUrl: string
  ): VideoActivityData => {
    const now = Date.now();
    const questions: VideoActivityQuestion[] = generated.questions.map((q) => {
      const base = (q.incorrectAnswers ?? []).slice(0, 3);
      const incorrectAnswers =
        base.length === 3
          ? base
          : [...base, ...Array<string>(3 - base.length).fill('')];
      return {
        id: crypto.randomUUID(),
        text: q.text,
        type: 'MC' as const,
        correctAnswer: q.correctAnswer ?? '',
        incorrectAnswers,
        timeLimit: q.timeLimit ?? 30,
        timestamp: q.timestamp ?? 0,
      };
    });

    return {
      id: crypto.randomUUID(),
      title: generated.title,
      youtubeUrl: sourceUrl,
      questions,
      createdAt: now,
      updatedAt: now,
    };
  };

  const handleGenerate = async () => {
    if (!isValidUrl) return;
    clearErrors();
    setGenerating(true);
    setPreview(null);

    try {
      const generated = await generateVideoActivity(url, questionCount);
      setPreview(buildActivityFromGenerated(generated, url));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      if (
        msg.toLowerCase().includes('no captions') ||
        msg.toLowerCase().includes('not-found') ||
        msg.toLowerCase().includes('caption')
      ) {
        setCaptionError(msg);
      } else if (
        msg.toLowerCase().includes('private') ||
        msg.toLowerCase().includes('restricted') ||
        msg.toLowerCase().includes('unavailable')
      ) {
        setRestrictedError(
          "This video is private or age-restricted and can't be used. Try a different video."
        );
      } else {
        setGeneralError(msg);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleAudioFallback = async () => {
    if (!isValidUrl) return;
    clearErrors();
    setGenerating(true);
    setPreview(null);

    try {
      const generated = await transcribeVideoWithGemini(url, questionCount);
      setPreview(buildActivityFromGenerated(generated, url));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed';
      setGeneralError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await onSave(preview);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <div
        className="flex items-center justify-between border-b border-brand-blue-primary/10 bg-brand-blue-lighter/30"
        style={{ padding: 'min(12px, 2.5cqmin) min(16px, 4cqmin)' }}
      >
        <div className="flex items-center" style={{ gap: 'min(8px, 2cqmin)' }}>
          <button
            onClick={onBack}
            className="text-brand-blue-primary hover:text-brand-blue-dark transition-colors"
          >
            <ArrowLeft
              style={{
                width: 'min(18px, 4.5cqmin)',
                height: 'min(18px, 4.5cqmin)',
              }}
            />
          </button>
          <div
            className="bg-brand-red-primary text-white flex items-center justify-center rounded-lg"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          >
            <PlayCircle
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
          </div>
          <span
            className="font-bold text-brand-blue-dark"
            style={{ fontSize: 'min(14px, 4.5cqmin)' }}
          >
            New Video Activity
          </span>
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(16px, 4cqmin)' }}
      >
        <div className="space-y-4">
          {/* URL input */}
          <div>
            <label
              className="block font-semibold text-brand-blue-dark mb-1"
              style={{ fontSize: 'min(12px, 3.5cqmin)' }}
            >
              YouTube URL
            </label>
            <div className="relative flex items-center">
              <Link
                className="absolute left-3 text-slate-400 pointer-events-none"
                style={{
                  width: 'min(15px, 4cqmin)',
                  height: 'min(15px, 4cqmin)',
                }}
              />
              <input
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  clearErrors();
                  setPreview(null);
                }}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                style={{
                  paddingLeft: 'min(36px, 9cqmin)',
                  paddingRight: 'min(12px, 3cqmin)',
                  paddingTop: 'min(8px, 2cqmin)',
                  paddingBottom: 'min(8px, 2cqmin)',
                  fontSize: 'min(13px, 4cqmin)',
                }}
              />
              {url && (
                <button
                  onClick={() => {
                    setUrl('');
                    clearErrors();
                    setPreview(null);
                  }}
                  className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X
                    style={{
                      width: 'min(14px, 3.5cqmin)',
                      height: 'min(14px, 3.5cqmin)',
                    }}
                  />
                </button>
              )}
            </div>
            {videoId && (
              <p
                className="text-emerald-600 font-medium mt-1"
                style={{ fontSize: 'min(11px, 3cqmin)' }}
              >
                ✓ Video ID: {videoId}
              </p>
            )}
          </div>

          {/* Question count */}
          <div>
            <label
              className="block font-semibold text-brand-blue-dark mb-1"
              style={{ fontSize: 'min(12px, 3.5cqmin)' }}
            >
              Number of Questions
            </label>
            <div
              className="flex items-center"
              style={{ gap: 'min(8px, 2cqmin)' }}
            >
              {[3, 5, 8, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setQuestionCount(n)}
                  className={`font-bold rounded-xl border transition-all ${
                    questionCount === n
                      ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                      : 'bg-white text-brand-blue-primary border-brand-blue-primary/30 hover:border-brand-blue-primary'
                  }`}
                  style={{
                    padding: 'min(6px, 1.5cqmin) min(14px, 3.5cqmin)',
                    fontSize: 'min(13px, 4cqmin)',
                  }}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={20}
                value={questionCount}
                onChange={(e) =>
                  setQuestionCount(
                    Math.min(20, Math.max(1, parseInt(e.target.value) || 5))
                  )
                }
                className="w-16 text-center bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                style={{
                  padding: 'min(6px, 1.5cqmin)',
                  fontSize: 'min(13px, 4cqmin)',
                }}
              />
            </div>
          </div>

          {/* Error states */}
          {captionError && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
              <div
                className="flex items-start"
                style={{
                  padding: 'min(12px, 3cqmin)',
                  gap: 'min(10px, 2.5cqmin)',
                }}
              >
                <AlertCircle
                  className="text-amber-600 shrink-0 mt-0.5"
                  style={{
                    width: 'min(16px, 4.5cqmin)',
                    height: 'min(16px, 4.5cqmin)',
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="font-semibold text-amber-800"
                    style={{ fontSize: 'min(13px, 4cqmin)' }}
                  >
                    No captions available
                  </p>
                  <p
                    className="text-amber-700 mt-0.5"
                    style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                  >
                    This video doesn&apos;t have captions available. Try a
                    different video
                    {isAdmin && audioTranscriptionEnabled
                      ? ', or use Gemini audio transcription below.'
                      : isAdmin && !audioTranscriptionEnabled
                        ? ', or enable Gemini audio transcription in Admin Settings → Global Settings.'
                        : ', or ask your admin to enable Gemini audio transcription.'}
                  </p>
                </div>
                <button
                  onClick={() => setCaptionError(null)}
                  className="text-amber-500 hover:text-amber-700 shrink-0"
                >
                  <X
                    style={{
                      width: 'min(14px, 3.5cqmin)',
                      height: 'min(14px, 3.5cqmin)',
                    }}
                  />
                </button>
              </div>
              {isAdmin && audioTranscriptionEnabled && (
                <div className="border-t border-amber-200 bg-amber-100/60">
                  <button
                    onClick={handleAudioFallback}
                    disabled={generating}
                    className="w-full flex items-center justify-center font-bold text-amber-800 hover:text-amber-900 transition-colors disabled:opacity-50"
                    style={{
                      padding: 'min(10px, 2.5cqmin)',
                      gap: 'min(6px, 1.5cqmin)',
                      fontSize: 'min(12px, 3.5cqmin)',
                    }}
                  >
                    {generating ? (
                      <Loader2
                        className="animate-spin"
                        style={{
                          width: 'min(14px, 3.5cqmin)',
                          height: 'min(14px, 3.5cqmin)',
                        }}
                      />
                    ) : (
                      <Wand2
                        style={{
                          width: 'min(14px, 3.5cqmin)',
                          height: 'min(14px, 3.5cqmin)',
                        }}
                      />
                    )}
                    Transcribe with Gemini (Admin feature)
                  </button>
                </div>
              )}
            </div>
          )}

          {restrictedError && (
            <div
              className="flex items-start bg-brand-red-lighter/40 border border-brand-red-primary/30 rounded-xl"
              style={{
                padding: 'min(12px, 3cqmin)',
                gap: 'min(10px, 2.5cqmin)',
              }}
            >
              <AlertCircle
                className="text-brand-red-primary shrink-0 mt-0.5"
                style={{
                  width: 'min(16px, 4.5cqmin)',
                  height: 'min(16px, 4.5cqmin)',
                }}
              />
              <div className="flex-1 min-w-0">
                <p
                  className="font-semibold text-brand-red-dark"
                  style={{ fontSize: 'min(13px, 4cqmin)' }}
                >
                  Video unavailable
                </p>
                <p
                  className="text-brand-red-dark/80 mt-0.5"
                  style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                >
                  {restrictedError}
                </p>
              </div>
              <button
                onClick={() => setRestrictedError(null)}
                className="text-brand-red-primary hover:text-brand-red-dark shrink-0"
              >
                <X
                  style={{
                    width: 'min(14px, 3.5cqmin)',
                    height: 'min(14px, 3.5cqmin)',
                  }}
                />
              </button>
            </div>
          )}

          {generalError && (
            <div
              className="flex items-start bg-brand-red-lighter/40 border border-brand-red-primary/30 rounded-xl"
              style={{
                padding: 'min(12px, 3cqmin)',
                gap: 'min(10px, 2.5cqmin)',
              }}
            >
              <AlertCircle
                className="text-brand-red-primary shrink-0 mt-0.5"
                style={{
                  width: 'min(16px, 4.5cqmin)',
                  height: 'min(16px, 4.5cqmin)',
                }}
              />
              <p
                className="text-brand-red-dark"
                style={{ fontSize: 'min(12px, 3.5cqmin)' }}
              >
                {generalError}
              </p>
              <button
                onClick={() => setGeneralError(null)}
                className="text-brand-red-primary hover:text-brand-red-dark shrink-0"
              >
                <X
                  style={{
                    width: 'min(14px, 3.5cqmin)',
                    height: 'min(14px, 3.5cqmin)',
                  }}
                />
              </button>
            </div>
          )}

          {/* Generate button */}
          {!preview && (
            <button
              onClick={handleGenerate}
              disabled={!isValidUrl || generating}
              className="w-full flex items-center justify-center font-bold bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-2xl transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(12px, 3cqmin)',
                fontSize: 'min(14px, 4.5cqmin)',
              }}
            >
              {generating ? (
                <>
                  <Loader2
                    className="animate-spin"
                    style={{
                      width: 'min(18px, 4.5cqmin)',
                      height: 'min(18px, 4.5cqmin)',
                    }}
                  />
                  Fetching captions &amp; generating questions…
                </>
              ) : (
                <>
                  <Sparkles
                    style={{
                      width: 'min(18px, 4.5cqmin)',
                      height: 'min(18px, 4.5cqmin)',
                    }}
                  />
                  Generate with AI
                </>
              )}
            </button>
          )}

          {/* Preview of generated activity */}
          {preview && (
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl">
                <div
                  className="flex items-center"
                  style={{
                    padding: 'min(10px, 2.5cqmin) min(14px, 3.5cqmin)',
                    gap: 'min(8px, 2cqmin)',
                  }}
                >
                  <Sparkles
                    className="text-emerald-600"
                    style={{
                      width: 'min(16px, 4.5cqmin)',
                      height: 'min(16px, 4.5cqmin)',
                    }}
                  />
                  <div>
                    <p
                      className="font-bold text-emerald-800"
                      style={{ fontSize: 'min(13px, 4cqmin)' }}
                    >
                      {preview.title}
                    </p>
                    <p
                      className="text-emerald-600"
                      style={{ fontSize: 'min(11px, 3cqmin)' }}
                    >
                      {preview.questions.length} questions generated
                    </p>
                  </div>
                </div>
              </div>

              {/* Question timestamp list */}
              <div className="space-y-2">
                {preview.questions.map((q, i) => (
                  <div
                    key={q.id}
                    className="flex items-start bg-white border border-slate-100 rounded-xl"
                    style={{
                      padding: 'min(10px, 2.5cqmin)',
                      gap: 'min(10px, 2.5cqmin)',
                    }}
                  >
                    <span
                      className="bg-brand-blue-lighter text-brand-blue-primary font-black rounded-md shrink-0 text-center"
                      style={{
                        fontSize: 'min(10px, 3cqmin)',
                        padding: 'min(2px, 0.5cqmin) min(6px, 1.5cqmin)',
                        minWidth: 'min(24px, 6cqmin)',
                      }}
                    >
                      {formatTimestamp(q.timestamp)}
                    </span>
                    <p
                      className="text-slate-700 min-w-0"
                      style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                    >
                      {i + 1}. {q.text}
                    </p>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex" style={{ gap: 'min(8px, 2cqmin)' }}>
                <button
                  onClick={() => {
                    setPreview(null);
                    clearErrors();
                  }}
                  className="flex-1 font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  style={{
                    padding: 'min(10px, 2.5cqmin)',
                    fontSize: 'min(13px, 4cqmin)',
                  }}
                >
                  Regenerate
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center font-bold bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-xl transition-all active:scale-95 disabled:opacity-50"
                  style={{
                    gap: 'min(6px, 1.5cqmin)',
                    padding: 'min(10px, 2.5cqmin)',
                    fontSize: 'min(13px, 4cqmin)',
                  }}
                >
                  {saving ? (
                    <Loader2
                      className="animate-spin"
                      style={{
                        width: 'min(14px, 3.5cqmin)',
                        height: 'min(14px, 3.5cqmin)',
                      }}
                    />
                  ) : null}
                  Save to Library
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
