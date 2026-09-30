import React from 'react';
import type { ProjectGroupGrade } from '@/types';

interface ProjectScoreCardProps {
  grade: ProjectGroupGrade;
  /** A4: a member's own absolute score replaces the group total. */
  override?: { points: number; note?: string };
}

export const ProjectScoreCard: React.FC<ProjectScoreCardProps> = ({
  grade,
  override,
}) => (
  <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
    <h3 className="text-sm font-bold text-emerald-900">Your score</h3>
    <p className="mt-1 text-2xl font-black text-emerald-900">
      {override ? override.points : grade.points}
      <span className="text-base font-bold text-emerald-700">
        {' '}
        / {grade.maxPoints}
      </span>
    </p>
    {override?.note && (
      <p className="mt-1 text-sm text-emerald-900">{override.note}</p>
    )}
    {grade.comment && (
      <p className="mt-2 text-sm text-emerald-900">{grade.comment}</p>
    )}
  </section>
);
