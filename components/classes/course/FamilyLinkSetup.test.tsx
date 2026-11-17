import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Course } from '@/utils/course/contract';
import type { DeckSharingDrive } from '@/utils/course/deckSharing';
import { FamilyLinkControl } from './FamilyLinkSetup';

const course = (over: Partial<Course> = {}): Course => ({
  id: 'c1',
  name: 'English 9',
  teacherName: 'T',
  rosterIds: ['r1'],
  agenda: { fileId: '1AbCdEfGhIjKlMn', title: 'Agenda' },
  pinnedLinks: [],
  familyLink: null,
  linkId: 'l1',
  formerLinkIds: [],
  formerShareIds: [],
  rosterClassIds: {},
  deckCheck: null,
  createdAt: 1,
  updatedAt: 7,
  ...over,
});

function drive(refuse = false) {
  const addLinkReaderPermission = vi.fn(() =>
    refuse ? Promise.reject(new Error('403')) : Promise.resolve()
  );
  const d: DeckSharingDrive = {
    listFilePermissions: () => Promise.resolve([]),
    addLinkReaderPermission,
    deletePermission: () => Promise.resolve(),
    getFileModifiedTime: () => Promise.resolve(null),
  };
  return { d, addLinkReaderPermission };
}

const reply = {
  courseId: 'c1',
  rostersWithoutClassPage: [],
  classLinkUnavailable: false,
};

describe('FamilyLinkControl', () => {
  it('asks before switching on, warns that past slides go public, and changes nothing on Cancel', () => {
    const saveCourse = vi.fn(() => Promise.resolve(reply));
    const { d, addLinkReaderPermission } = drive();
    render(
      <FamilyLinkControl
        course={course()}
        saveCourse={saveCourse}
        drive={d}
        domain="orono.k12.mn.us"
        origin="https://x"
      />
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByText(/past days included/)).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(saveCourse).not.toHaveBeenCalled();
    expect(addLinkReaderPermission).not.toHaveBeenCalled();
  });

  it('switches on after the confirm', async () => {
    const saveCourse = vi.fn(() => Promise.resolve(reply));
    const { d, addLinkReaderPermission } = drive();
    render(
      <FamilyLinkControl
        course={course()}
        saveCourse={saveCourse}
        drive={d}
        domain="orono.k12.mn.us"
        origin="https://x"
      />
    );
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByText('Turn on'));
    await waitFor(() =>
      expect(saveCourse).toHaveBeenCalledWith({
        action: 'save',
        course: { id: 'c1', familyLinkOn: true, expectedUpdatedAt: 7 },
      })
    );
    expect(addLinkReaderPermission).toHaveBeenCalledWith('1AbCdEfGhIjKlMn', {
      type: 'anyone',
    });
  });

  it('offers to stop sharing the deck outside Orono when switching off, ticked by default', async () => {
    const saveCourse = vi.fn(() => Promise.resolve(reply));
    const { d, addLinkReaderPermission } = drive();
    render(
      <FamilyLinkControl
        course={course({ familyLink: { shareId: 's1', on: true } })}
        saveCourse={saveCourse}
        drive={d}
        domain="orono.k12.mn.us"
        origin="https://x"
      />
    );
    fireEvent.click(screen.getByRole('switch'));
    const box = screen.getByRole<HTMLInputElement>('checkbox');
    expect(box.checked).toBe(true);
    fireEvent.click(screen.getByText('Turn off'));
    await waitFor(() =>
      expect(addLinkReaderPermission).toHaveBeenCalledWith('1AbCdEfGhIjKlMn', {
        type: 'domain',
        domain: 'orono.k12.mn.us',
      })
    );
    expect(saveCourse).toHaveBeenCalledWith({
      action: 'save',
      course: { id: 'c1', familyLinkOn: false, expectedUpdatedAt: 7 },
    });
  });

  it('copies the family address only while the link is on', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { rerender } = render(
      <FamilyLinkControl
        course={course()}
        saveCourse={vi.fn()}
        drive={drive().d}
        domain="d"
        origin="https://x"
      />
    );
    expect(screen.queryByText('Copy link')).toBeNull();
    rerender(
      <FamilyLinkControl
        course={course({ familyLink: { shareId: 's1', on: true } })}
        saveCourse={vi.fn()}
        drive={drive().d}
        domain="d"
        origin="https://x"
      />
    );
    fireEvent.click(screen.getByText('Copy link'));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('https://x/family/s1')
    );
  });

  it('shows what went wrong when Google refuses public sharing', async () => {
    const { d } = drive(true);
    render(
      <FamilyLinkControl
        course={course()}
        saveCourse={vi.fn()}
        drive={d}
        domain="d"
        origin="https://x"
      />
    );
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByText('Turn on'));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /didn't allow sharing/
    );
  });
});
