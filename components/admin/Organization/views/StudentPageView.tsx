import React from 'react';
import type { GlobalFeature } from '@/types';
import { ViewHeader } from '@/components/admin/Organization/components/primitives';
import { PreviewRow } from '@/components/admin/access/PreviewsPanel';
import { useGlobalPermissionsEditor } from '@/components/admin/access/useGlobalPermissionsEditor';
import { StudentLandingSample } from '@/components/student/landing/StudentLandingSample';

// The access flags that change the student page; each row is the same control as on Access > Previews.
const STUDENT_PAGE_FEATURES: GlobalFeature[] = [
  'student-landing-v2',
  'student-gradebook',
];

// Rows in the sample are links to fixture sessions; keep the admin on this page.
const blockLinks = (e: React.MouseEvent) => {
  if ((e.target as HTMLElement).closest('a')) e.preventDefault();
};

export const StudentPageView: React.FC = () => {
  const editor = useGlobalPermissionsEditor();
  const gradesEnabled = editor.getPermission('student-gradebook').enabled;

  return (
    <div className="pb-6">
      <ViewHeader
        title="Student page"
        blurb="What students see when they sign in."
      />
      {editor.loading ? (
        <div className="py-4 text-sm text-slate-500">Loading...</div>
      ) : (
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {STUDENT_PAGE_FEATURES.map((id) => (
            <PreviewRow key={id} featureId={id} editor={editor} />
          ))}
        </div>
      )}
      <div
        onClickCapture={blockLinks}
        className="mt-5 h-[640px] overflow-hidden rounded-lg border border-slate-200"
      >
        <StudentLandingSample
          key={gradesEnabled ? 'grades' : 'completed'}
          gradesEnabled={gradesEnabled}
          initialClassId="eng"
          embedded
        />
      </div>
    </div>
  );
};
