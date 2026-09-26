import React from 'react';
import { tourAttr } from '@/config/tourAnchors';
import { ToggleRow } from './ToggleRow';

interface EngagementSettingsProps {
  allowLikes: boolean;
  allowComments: boolean;
  allowCommentResponses: boolean;
  widgetId: string;
  widgetType: string;
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
  widgetId,
  widgetType,
  onChange,
}) => (
  <div className="space-y-2">
    <ToggleRow
      label="Allow likes"
      checked={allowLikes}
      onChange={(next) => onChange({ allowLikes: next })}
      anchor={tourAttr('activity-wall-editor.likes', widgetId, widgetType)}
    />
    <ToggleRow
      label="Allow comments"
      hint="Signed-in viewers only."
      checked={allowComments}
      onChange={(next) =>
        onChange(
          next
            ? { allowComments: true }
            : { allowComments: false, allowCommentResponses: false }
        )
      }
      anchor={tourAttr('activity-wall-editor.comments', widgetId, widgetType)}
    />
    <ToggleRow
      label="Allow comment replies"
      checked={allowComments && allowCommentResponses}
      disabled={!allowComments}
      onChange={(next) => onChange({ allowCommentResponses: next })}
      anchor={tourAttr('activity-wall-editor.replies', widgetId, widgetType)}
    />
  </div>
);
