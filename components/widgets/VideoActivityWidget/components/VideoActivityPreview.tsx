/**
 * A video activity, read only: the video plus every question and its answer.
 *
 * Built for a substitute, who cannot launch the activity in v1 (D8) but does
 * have to run the lesson — so what they need is to watch the video and know
 * what each question asks and what counts as right.
 */

import React from 'react';
import { CheckCircle2, Film } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { extractYouTubeId } from '@/utils/youtube';
import type { SubShareVideoActivityView, VideoActivityQuestion } from '@/types';

/** `m:ss` into the video, which is how the editor labels a marker. */
function atTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** Every accepted answer, joined for reading rather than for grading. */
function answersOf(question: VideoActivityQuestion): string[] {
  const canonical = question.correctAnswer ?? '';
  if (question.type === 'MA') {
    return canonical.split('|').filter((part) => part.trim().length > 0);
  }
  const answers = canonical ? [canonical] : [];
  for (const variant of question.acceptableVariants ?? []) {
    if (variant.trim().length > 0) answers.push(variant);
  }
  return answers;
}

export const VideoActivityPreview: React.FC<{
  activity: SubShareVideoActivityView;
}> = ({ activity }) => {
  const videoId = extractYouTubeId(activity.youtubeUrl);
  const questions = [...activity.questions].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  if (!videoId) {
    return (
      <ScaledEmptyState
        icon={Film}
        title={activity.title}
        subtitle="The video for this activity could not be read."
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div
        className="shrink-0"
        style={{ padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin) 0' }}
      >
        <h3
          className="truncate font-semibold text-slate-200"
          style={{ fontSize: 'min(16px, 6cqmin)' }}
          title={activity.title}
        >
          {activity.title}
        </h3>
      </div>

      <div
        className="shrink-0"
        style={{ padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)' }}
      >
        <div className="relative w-full overflow-hidden rounded-lg bg-black/40 pb-[56.25%]">
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube.com/embed/${videoId}?rel=0`}
            title={activity.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ padding: '0 min(12px, 3cqmin) min(12px, 3cqmin)' }}
      >
        {questions.length === 0 ? (
          <p
            className="text-slate-300"
            style={{ fontSize: 'min(13px, 5cqmin)' }}
          >
            This activity has no questions.
          </p>
        ) : (
          <ol className="flex flex-col" style={{ gap: 'min(10px, 2.5cqmin)' }}>
            {questions.map((question, index) => {
              const answers = answersOf(question);
              return (
                <li
                  key={question.id}
                  className="rounded-lg bg-slate-800/50"
                  style={{ padding: 'min(10px, 2.5cqmin)' }}
                >
                  <div
                    className="flex items-baseline"
                    style={{ gap: 'min(8px, 2cqmin)' }}
                  >
                    <span
                      className="shrink-0 font-semibold text-slate-300"
                      style={{ fontSize: 'min(11px, 4cqmin)' }}
                    >
                      {atTime(question.timestamp)}
                    </span>
                    <span
                      className="text-slate-200"
                      style={{ fontSize: 'min(14px, 5.5cqmin)' }}
                    >
                      {index + 1}. {question.text}
                    </span>
                  </div>
                  <div
                    className="flex flex-wrap items-center"
                    style={{
                      gap: 'min(6px, 1.5cqmin)',
                      marginTop: 'min(6px, 1.5cqmin)',
                    }}
                  >
                    <CheckCircle2
                      className="shrink-0 text-emerald-400"
                      aria-hidden
                      style={{
                        width: 'min(16px, 5cqmin)',
                        height: 'min(16px, 5cqmin)',
                      }}
                    />
                    {answers.length === 0 ? (
                      <span
                        className="text-slate-300"
                        style={{ fontSize: 'min(13px, 5cqmin)' }}
                      >
                        No answer saved
                      </span>
                    ) : (
                      answers.map((answer) => (
                        <span
                          key={answer}
                          className="rounded bg-emerald-500/15 text-emerald-200"
                          style={{
                            fontSize: 'min(13px, 5cqmin)',
                            padding: 'min(2px, 0.5cqmin) min(6px, 1.5cqmin)',
                          }}
                        >
                          {answer}
                        </span>
                      ))
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};
