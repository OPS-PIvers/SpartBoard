/**
 * Creator — Video Activity creation orchestrator.
 *
 * Three discovery paths in the `info` step:
 *   - **Search**: type a query, hit Enter/Search button, pick from
 *     YouTube Data API v3 results. (Search button only — no debounce-on-
 *     keystroke — to keep daily quota under the 10k unit cap.)
 *   - **Paste URL**: classic flow, paste a YouTube URL.
 *   - **Recommend**: describe a topic/objective, Gemini suggests a video.
 *
 * After a video is chosen the rest of the flow (manual / import / AI
 * draft) is unchanged from PR2a.
 */

import React, { useState } from 'react';
import {
  ArrowLeft,
  Youtube,
  FileSpreadsheet,
  PlusCircle,
  Search as SearchIcon,
  Sparkles,
  Loader2,
  AlertCircle,
  Wand2,
  Check,
} from 'lucide-react';
import { VideoActivityData } from '@/types';
import { generateVideoActivity, recommendVideoForActivity } from '@/utils/ai';
import {
  searchYouTube,
  formatDuration,
  YouTubeKeyMissingError,
  YouTubeQuotaError,
  type YouTubeSearchResult,
} from '@/utils/youtubeSearch';
import { extractYouTubeId } from '@/utils/youtube';
import { ImportWizard } from '@/components/common/library/importer';
import { createVideoActivityImportAdapter } from '../adapters/videoActivityImportAdapter';

interface CreatorProps {
  onBack: () => void;
  onSave: (activity: VideoActivityData) => Promise<void>;
  aiEnabled: boolean; // From widget global settings
  isAdmin: boolean;
  audioTranscriptionEnabled: boolean;
  createTemplateSheet: (title: string) => Promise<string>;
}

type Step = 'info' | 'source' | 'ai' | 'import';
type DiscoverTab = 'search' | 'paste' | 'recommend';

export const Creator: React.FC<CreatorProps> = ({
  onBack,
  onSave,
  aiEnabled,
  isAdmin,
  createTemplateSheet,
}) => {
  const [step, setStep] = useState<Step>('info');
  const [discoverTab, setDiscoverTab] = useState<DiscoverTab>('paste');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search-tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Recommend-tab state
  const [recommendTopic, setRecommendTopic] = useState('');
  const [recommending, setRecommending] = useState(false);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<{
    videoId: string;
    title: string;
    rationale: string;
  } | null>(null);

  // Allow AI if explicitly enabled OR if user is admin
  const canUseAI = aiEnabled || isAdmin;

  const handleNextFromInfo = () => {
    if (!url.trim() || !title.trim()) {
      setError('Title and YouTube URL are required.');
      return;
    }
    if (!extractYouTubeId(url.trim())) {
      setError(
        'That doesn’t look like a YouTube URL. Paste a youtube.com or youtu.be link.'
      );
      return;
    }
    setError(null);
    setStep('source');
  };

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (q.length === 0) return;
    setSearching(true);
    setSearchError(null);
    setHasSearched(true);
    try {
      const results = await searchYouTube(q, 10);
      setSearchResults(results);
    } catch (err) {
      if (err instanceof YouTubeKeyMissingError) {
        setSearchError(
          'YouTube search isn’t configured. Paste a URL or ask Gemini to recommend one instead.'
        );
      } else if (err instanceof YouTubeQuotaError) {
        setSearchError(
          'YouTube search quota is exhausted for today. Paste a URL or use the recommend tab.'
        );
      } else {
        setSearchError(
          err instanceof Error ? err.message : 'YouTube search failed.'
        );
      }
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const pickResult = (result: YouTubeSearchResult) => {
    setUrl(`https://www.youtube.com/watch?v=${result.videoId}`);
    if (!title.trim()) setTitle(result.title);
    setDiscoverTab('paste');
  };

  const handleRecommend = async () => {
    const topic = recommendTopic.trim();
    if (topic.length === 0) return;
    setRecommending(true);
    setRecommendError(null);
    setRecommendation(null);
    try {
      const result = await recommendVideoForActivity(topic);
      if (!result || result.videoId.length === 0) {
        setRecommendError(
          'Gemini couldn’t confidently recommend a video for that topic. Try rephrasing or describing a grade level.'
        );
      } else {
        setRecommendation(result);
      }
    } catch (err) {
      setRecommendError(
        err instanceof Error ? err.message : 'Recommendation failed. Try again.'
      );
    } finally {
      setRecommending(false);
    }
  };

  const acceptRecommendation = () => {
    if (!recommendation) return;
    setUrl(`https://www.youtube.com/watch?v=${recommendation.videoId}`);
    if (!title.trim() && recommendation.title) setTitle(recommendation.title);
    setDiscoverTab('paste');
  };

  const handleManualCreate = async () => {
    const activity: VideoActivityData = {
      id: crypto.randomUUID(),
      title: title.trim(),
      youtubeUrl: url.trim(),
      questions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await onSave(activity);
  };

  const handleAIGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      // The Creator's pre-editor wizard only exposes a single "how many?"
      // slider, so we ask Gemini for all MC. The richer per-type stepper
      // UX lives in the editor's "Draft with AI" overlay where the teacher
      // has already loaded the player and chosen a video.
      const result = await generateVideoActivity(url, { MC: questionCount });
      const activity: VideoActivityData = {
        id: crypto.randomUUID(),
        title: title.trim() || result.title,
        youtubeUrl: url.trim(),
        questions: result.questions.map((q) => {
          const type =
            q.type === 'FIB' || q.type === 'MA' || q.type === 'MC'
              ? q.type
              : 'MC';
          const variants =
            type === 'FIB' && Array.isArray(q.acceptableVariants)
              ? q.acceptableVariants.filter(
                  (v): v is string =>
                    typeof v === 'string' && v.trim().length > 0
                )
              : undefined;
          return {
            id: crypto.randomUUID(),
            timestamp: q.timestamp,
            text: q.text,
            type,
            correctAnswer: q.correctAnswer ?? '',
            incorrectAnswers: type === 'FIB' ? [] : (q.incorrectAnswers ?? []),
            timeLimit: q.timeLimit ?? 30,
            ...(variants && variants.length > 0
              ? { acceptableVariants: variants }
              : {}),
          };
        }),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await onSave(activity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Renderers ─────────────────────────────────────────────────────────────

  if (step === 'import') {
    const importAdapter = createVideoActivityImportAdapter({
      title: title.trim(),
      youtubeUrl: url.trim(),
      onSave: async (activity) => {
        await onSave(activity);
      },
      createTemplateSheet: () => createTemplateSheet(title || 'Video Activity'),
    });
    return (
      <ImportWizard
        isOpen={true}
        onClose={() => setStep('source')}
        adapter={importAdapter}
        defaultTitle={title.trim()}
        onSaved={() => setStep('source')}
      />
    );
  }

  return (
    <div className="flex flex-col h-full font-sans bg-slate-50/50">
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b border-brand-blue-primary/10 bg-white"
        style={{ padding: 'min(12px, 2.5cqmin) min(16px, 4cqmin)' }}
      >
        <button
          onClick={step === 'info' ? onBack : () => setStep('info')}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span
          className="font-black text-brand-blue-dark uppercase tracking-tight"
          style={{ fontSize: 'min(14px, 4.5cqmin)' }}
        >
          {step === 'info' ? 'New Video Activity' : 'Question Source'}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(16px, 4cqmin)' }}
      >
        <div className="max-w-md mx-auto space-y-6">
          {step === 'info' && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-4">
                <div>
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    Activity Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Introduction to Photosynthesis"
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-2xl text-slate-800 font-medium focus:outline-none focus:border-brand-blue-primary transition-all shadow-sm"
                    style={{ fontSize: 'min(14px, 4cqmin)' }}
                  />
                </div>

                <div>
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    YouTube Video
                  </label>
                  {/* Discover-tab selector */}
                  <div
                    role="tablist"
                    aria-label="Find a video"
                    className="inline-flex w-full rounded-xl border border-slate-200 bg-white overflow-hidden mb-3"
                  >
                    {[
                      {
                        id: 'search' as const,
                        label: 'Search',
                        Icon: SearchIcon,
                      },
                      {
                        id: 'paste' as const,
                        label: 'Paste URL',
                        Icon: Youtube,
                      },
                      {
                        id: 'recommend' as const,
                        label: 'Recommend',
                        Icon: Wand2,
                      },
                    ].map(({ id, label, Icon }) => {
                      const active = discoverTab === id;
                      return (
                        <button
                          key={id}
                          role="tab"
                          aria-selected={active}
                          onClick={() => setDiscoverTab(id)}
                          className={
                            'flex-1 font-bold transition-colors flex items-center justify-center gap-1.5 ' +
                            (active
                              ? 'bg-brand-blue-primary text-white'
                              : 'text-slate-600 hover:bg-slate-50')
                          }
                          style={{
                            padding: 'min(8px, 2cqmin) min(12px, 2.5cqmin)',
                            fontSize: 'min(12px, 3.5cqmin)',
                          }}
                        >
                          <Icon
                            style={{
                              width: 'min(14px, 4cqmin)',
                              height: 'min(14px, 4cqmin)',
                            }}
                          />
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {discoverTab === 'paste' && (
                    <div className="relative">
                      <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-200 rounded-2xl text-slate-800 font-medium focus:outline-none focus:border-brand-blue-primary transition-all shadow-sm"
                        style={{ fontSize: 'min(13px, 3.5cqmin)' }}
                      />
                    </div>
                  )}

                  {discoverTab === 'search' && (
                    <SearchTab
                      query={searchQuery}
                      onQueryChange={setSearchQuery}
                      onSubmit={handleSearch}
                      results={searchResults}
                      searching={searching}
                      hasSearched={hasSearched}
                      error={searchError}
                      onPick={pickResult}
                      pickedUrl={url}
                    />
                  )}

                  {discoverTab === 'recommend' && (
                    <RecommendTab
                      topic={recommendTopic}
                      onTopicChange={setRecommendTopic}
                      onSubmit={handleRecommend}
                      recommending={recommending}
                      error={recommendError}
                      recommendation={recommendation}
                      onAccept={acceptRecommendation}
                      pickedUrl={url}
                    />
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleNextFromInfo}
                className="w-full py-4 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-black rounded-2xl shadow-lg shadow-brand-blue-primary/20 transition-all active:scale-[0.98] uppercase tracking-widest"
                style={{ fontSize: 'min(14px, 4cqmin)' }}
              >
                Next Step
              </button>
            </div>
          )}

          {step === 'source' && (
            <div className="grid gap-3 animate-in fade-in zoom-in-95 duration-300">
              <p className="text-center text-slate-500 text-xs font-medium mb-2">
                How would you like to add questions to this video?
              </p>

              {canUseAI && (
                <button
                  onClick={() => setStep('ai')}
                  className="group relative p-5 bg-white border-2 border-slate-200 hover:border-indigo-500 hover:shadow-md rounded-2xl text-left transition-all overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Sparkles className="w-12 h-12 text-indigo-600" />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 rounded-xl group-hover:bg-indigo-100 transition-colors">
                      <Sparkles className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">
                        Draft with AI
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Generate questions automatically using Gemini&apos;s
                        video understanding.
                      </p>
                    </div>
                  </div>
                </button>
              )}

              <button
                onClick={() => setStep('import')}
                className="group relative p-5 bg-white border-2 border-slate-200 hover:border-emerald-500 hover:shadow-md rounded-2xl text-left transition-all overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <FileSpreadsheet className="w-12 h-12 text-emerald-600" />
                </div>
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 rounded-xl group-hover:bg-emerald-100 transition-colors">
                    <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">
                      Import from Sheets
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Paste CSV data from a Google Sheet or Gemini Gem.
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={handleManualCreate}
                className="group relative p-5 bg-white border-2 border-slate-200 hover:border-brand-blue-primary hover:shadow-md rounded-2xl text-left transition-all overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <PlusCircle className="w-12 h-12 text-brand-blue-primary" />
                </div>
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-brand-blue-lighter/50 rounded-xl group-hover:bg-brand-blue-lighter transition-colors">
                    <PlusCircle className="w-6 h-6 text-brand-blue-primary" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">Manual Entry</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Start from scratch and add your own questions.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {step === 'ai' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  <span className="font-bold text-indigo-900 text-sm">
                    AI Configuration
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-indigo-700/60 uppercase">
                    <span>Target Question Count</span>
                    <span>{questionCount}</span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={15}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                    className="w-full h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <div className="text-xs text-indigo-600/70 italic leading-relaxed">
                  Note: AI generation uses Gemini&apos;s video understanding to
                  analyze the content and generate questions.
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-medium leading-relaxed">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleAIGenerate}
                disabled={isGenerating}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black rounded-2xl shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 uppercase tracking-widest"
                style={{ fontSize: 'min(14px, 4cqmin)' }}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="animate-spin w-5 h-5" />
                    Generating Activity...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate with Gemini
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── SearchTab ─────────────────────────────────────────────────────────── */

interface SearchTabProps {
  query: string;
  onQueryChange: (v: string) => void;
  onSubmit: () => void;
  results: YouTubeSearchResult[];
  searching: boolean;
  hasSearched: boolean;
  error: string | null;
  onPick: (result: YouTubeSearchResult) => void;
  pickedUrl: string;
}

const SearchTab: React.FC<SearchTabProps> = ({
  query,
  onQueryChange,
  onSubmit,
  results,
  searching,
  hasSearched,
  error,
  onPick,
  pickedUrl,
}) => (
  <div className="space-y-3">
    <div className="flex gap-2">
      <div className="relative flex-1">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
          placeholder="e.g. photosynthesis crash course"
          className="w-full pl-9 pr-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:border-brand-blue-primary shadow-sm"
          style={{ fontSize: 'min(13px, 3.5cqmin)' }}
        />
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={query.trim().length === 0 || searching}
        className="px-4 py-2.5 bg-brand-blue-primary text-white rounded-xl font-bold uppercase tracking-wider disabled:opacity-50 hover:bg-brand-blue-dark transition-colors shadow-sm"
        style={{ fontSize: 'min(12px, 3.5cqmin)' }}
      >
        {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
      </button>
    </div>

    {error && (
      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 text-xs font-medium">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    )}

    {!error && hasSearched && !searching && results.length === 0 && (
      <p className="text-xs text-slate-500 text-center py-4">
        No results. Try different keywords.
      </p>
    )}

    {results.length > 0 && (
      <div className="grid gap-2 max-h-72 overflow-y-auto custom-scrollbar">
        {results.map((r) => {
          const picked = pickedUrl.includes(r.videoId);
          return (
            <button
              key={r.videoId}
              type="button"
              onClick={() => onPick(r)}
              className={`flex gap-3 p-2 bg-white border-2 rounded-xl text-left transition-all active:scale-[0.99] ${
                picked
                  ? 'border-emerald-500 ring-2 ring-emerald-100'
                  : 'border-slate-200 hover:border-brand-blue-primary'
              }`}
            >
              <img
                src={r.thumbnailUrl}
                alt=""
                className="w-32 h-18 rounded-md object-cover bg-slate-100 shrink-0"
                style={{ aspectRatio: '16 / 9' }}
              />
              <div className="flex-1 min-w-0 py-1">
                <p className="font-bold text-slate-800 text-sm leading-snug line-clamp-2">
                  {r.title}
                </p>
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {r.channelTitle}
                </p>
                {r.durationSeconds > 0 && (
                  <p className="text-xxs text-slate-400 font-mono mt-1">
                    {formatDuration(r.durationSeconds)}
                  </p>
                )}
              </div>
              {picked && (
                <Check className="w-5 h-5 text-emerald-600 shrink-0 self-center" />
              )}
            </button>
          );
        })}
      </div>
    )}
  </div>
);

/* ─── RecommendTab ──────────────────────────────────────────────────────── */

interface RecommendTabProps {
  topic: string;
  onTopicChange: (v: string) => void;
  onSubmit: () => void;
  recommending: boolean;
  error: string | null;
  recommendation: { videoId: string; title: string; rationale: string } | null;
  onAccept: () => void;
  pickedUrl: string;
}

const RecommendTab: React.FC<RecommendTabProps> = ({
  topic,
  onTopicChange,
  onSubmit,
  recommending,
  error,
  recommendation,
  onAccept,
  pickedUrl,
}) => {
  const accepted =
    !!recommendation && pickedUrl.includes(recommendation.videoId);
  return (
    <div className="space-y-3">
      <textarea
        value={topic}
        onChange={(e) => onTopicChange(e.target.value)}
        rows={3}
        placeholder="e.g. 6th grade lesson on photosynthesis — focus on chloroplasts and the role of sunlight"
        className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:border-brand-blue-primary shadow-sm resize-none"
        style={{ fontSize: 'min(13px, 3.5cqmin)' }}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={topic.trim().length === 0 || recommending}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-sm"
        style={{ fontSize: 'min(12px, 3.5cqmin)' }}
      >
        {recommending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Asking Gemini…
          </>
        ) : (
          <>
            <Wand2 className="w-4 h-4" /> Suggest a video
          </>
        )}
      </button>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {recommendation && (
        <div
          className={`p-3 bg-white border-2 rounded-xl transition-all ${
            accepted
              ? 'border-emerald-500 ring-2 ring-emerald-100'
              : 'border-indigo-200'
          }`}
        >
          <div className="flex gap-3">
            <img
              src={`https://img.youtube.com/vi/${recommendation.videoId}/mqdefault.jpg`}
              alt=""
              className="w-32 h-18 rounded-md object-cover bg-slate-100 shrink-0"
              style={{ aspectRatio: '16 / 9' }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800 text-sm leading-snug">
                {recommendation.title || 'Recommended video'}
              </p>
              <p className="text-xs text-slate-500 mt-1 italic line-clamp-3">
                {recommendation.rationale}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAccept}
            disabled={accepted}
            className="w-full mt-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-colors"
          >
            {accepted ? '✓ Selected' : 'Use this video'}
          </button>
        </div>
      )}
    </div>
  );
};
