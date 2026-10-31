// The picture with a question or note stop (docs/plans/IMPORT.md D32), from the teacher's Drive.
import React from 'react';
import { driveImageUrl } from '@/utils/quizStimuli';
import { isDriveFileId } from '@/utils/videoActivityPublicQuestions';

export const StopPicture: React.FC<{
  fileId?: string;
  className?: string;
}> = ({ fileId, className = 'max-h-56' }) =>
  isDriveFileId(fileId) ? (
    <img
      src={driveImageUrl(fileId)}
      alt=""
      referrerPolicy="no-referrer"
      className={`${className} w-auto max-w-full self-center rounded-lg object-contain`}
    />
  ) : null;
