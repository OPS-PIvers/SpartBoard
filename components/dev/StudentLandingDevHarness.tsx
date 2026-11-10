// The student landing v2 page on fixture data at /student-landing-dev (dev and auth-bypass builds only), for layout checks.

import React from 'react';
import { StudentLandingSample } from '@/components/student/landing/StudentLandingSample';
import type { LandingTab } from '@/components/student/landing/types';

const readParam = (key: string): string | null =>
  new URLSearchParams(window.location.search).get(key);

export const StudentLandingDevHarness: React.FC = () => (
  <StudentLandingSample
    inClass={readParam('time') === 'class'}
    gradesEnabled={readParam('gb') === '1'}
    initialClassId={readParam('class')}
    initialTab={(readParam('tab') as LandingTab | null) ?? 'assignments'}
  />
);
