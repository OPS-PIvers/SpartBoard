import { describe, expect, it } from 'vitest';
import { Trash2, Users2 } from 'lucide-react';
import type { AssignedStatus } from '@/utils/assignedStatus';
import { assignedMenu } from './assignedMenu';

const status = {
  bucket: 'done',
  singleLine: true,
  classes: [{ status: 'closed' }],
} as unknown as AssignedStatus;

describe('assignedMenu', () => {
  it('never offers Stop sharing with a PLC', () => {
    const ids = assignedMenu({
      status,
      viewOnly: false,
      published: false,
      tourWidgetType: 'quiz',
      items: [
        {
          id: 'stop-sharing-plc',
          label: 'Stop sharing with Grade 7 Math',
          icon: Users2,
          onClick: () => undefined,
        },
        {
          id: 'delete',
          label: 'Delete',
          icon: Trash2,
          destructive: true,
          onClick: () => undefined,
        },
      ],
    }).map((m) => m.id);
    expect(ids).toEqual(['delete']);
  });
});
