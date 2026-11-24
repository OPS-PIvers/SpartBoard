import React, { Suspense, lazy } from 'react';
import { LazyChunkErrorBoundary } from '@/components/common/LazyChunkErrorBoundary';
import { useStudentFeatureOpen } from '@/hooks/useStudentGrades';
import {
  useStudentTourIdentity,
  type StudentTourIdentity,
} from './useStudentTourIdentity';

const StudentTourLayer = lazy(() => import('./StudentTourLayer'));

/** Live tours on student pages, for signed-in students once Live tours for students is Public. */
export const StudentTours: React.FC = () => {
  const identity = useStudentTourIdentity();
  return identity ? <OpenForStudents identity={identity} /> : null;
};

// The flag is read only once a student is signed in.
const OpenForStudents: React.FC<{ identity: StudentTourIdentity }> = ({
  identity,
}) => {
  const open = useStudentFeatureOpen('student-live-tours');
  if (!open) return null;
  return (
    <LazyChunkErrorBoundary fallback={() => null}>
      <Suspense fallback={null}>
        <StudentTourLayer identity={identity} />
      </Suspense>
    </LazyChunkErrorBoundary>
  );
};
