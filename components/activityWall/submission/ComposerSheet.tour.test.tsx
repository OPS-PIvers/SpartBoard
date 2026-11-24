import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ComposerSheet } from './ComposerSheet';
import { StudentWallTourContext } from './studentWallTour';
import { makeSession } from '@/components/activityWall/render/fixtures';

vi.mock('@/config/firebase', () => ({ db: {}, storage: {}, auth: {} }));

const sheet = (
  <ComposerSheet
    session={makeSession({
      layout: 'wall',
      allowedTypes: {
        text: true,
        photo: true,
        link: true,
        file: false,
        video: false,
      },
    })}
    onSubmit={vi.fn()}
    onClose={vi.fn()}
    busy={false}
    progress={null}
    error={null}
  />
);

const tourIds = () =>
  Array.from(document.querySelectorAll('[data-tour]')).map((el) =>
    el.getAttribute('data-tour')
  );

describe('ComposerSheet tour anchors', () => {
  it('tags the post form on the student wall page', () => {
    render(
      <StudentWallTourContext.Provider value={true}>
        {sheet}
      </StudentWallTourContext.Provider>
    );
    expect(tourIds()).toEqual(
      expect.arrayContaining([
        'student.activity-wall.composer-close',
        'student.activity-wall.post-type',
        'student.activity-wall.title',
        'student.activity-wall.body',
        'student.activity-wall.post-submit',
      ])
    );
  });

  it('leaves the board post form untagged', () => {
    render(sheet);
    expect(tourIds()).toEqual([]);
  });
});
