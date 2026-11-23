import React, { Suspense, lazy } from 'react';
import { LazyChunkErrorBoundary } from '@/components/common/LazyChunkErrorBoundary';
import { useStudentFeatureOpen } from '@/hooks/useStudentGrades';
import { useStudentTourIdentity } from './useStudentTourIdentity';

const StudentTourLayer = lazy(() => import('./StudentTourLayer'));

/** Live tours on student pages, for signed-in students once Live tours for students is Public. */
export const StudentTours: React.FC = () => {
  const identity = useStudentTourIdentity();
  const open = useStudentFeatureOpen('student-live-tours');
  if (!identity || !open) return null;
  return (
    <LazyChunkErrorBoundary fallback={() => null}>
      <Suspense fallback={null}>
        <StudentTourLayer identity={identity} />
      </Suspense>
    </LazyChunkErrorBoundary>
  );
};
