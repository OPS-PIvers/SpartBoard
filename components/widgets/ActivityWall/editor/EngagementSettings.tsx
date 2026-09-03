import React from 'react';
import { ToggleRow } from './ToggleRow';

interface EngagementSettingsProps {
  allowLikes: boolean;
  allowComments: boolean;
  allowCommentResponses: boolean;
  onChange: (patch: {
    allowLikes?: boolean;
    allowComments?: boolean;
    allowCommentResponses?: boolean;
  }) => void;
}

/** Likes, comments, and replies — shared by the student page and the public gallery. */
export const EngagementSettings: React.FC<EngagementSettingsProps> = ({
  allowLikes,
  allowComments,
  allowCommentResponses,
  onChange,
}) => (
  <div className="space-y-2">
    <ToggleRow
      label="Allow likes"
      hint="Viewers can give each post a heart."
      checked={allowLikes}
      onChange={(next) => onChange({ allowLikes: next })}
    />
    <ToggleRow
      label="Allow comments"
      hint="Signed-in viewers can leave a comment on each post."
      checked={allowComments}
      onChange={(next) =>
        onChange(
          next
            ? { allowComments: true }
            : { allowComments: false, allowCommentResponses: false }
        )
      }
    />
    <ToggleRow
      label="Allow comment replies"
      hint="Viewers can reply to other people's comments."
      checked={allowComments && allowCommentResponses}
      disabled={!allowComments}
      onChange={(next) => onChange({ allowCommentResponses: next })}
    />
  </div>
);
