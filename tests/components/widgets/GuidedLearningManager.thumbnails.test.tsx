// The library shows small thumbnails: Storage thumbs for district sets, sized Drive URLs for personal ones.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { GuidedLearningManager } from '@/components/widgets/GuidedLearning/components/GuidedLearningManager';
import type { GuidedLearningSet, GuidedLearningSetMetadata } from '@/types';

vi.mock('@/hooks/useFolders', () => ({
  useFolders: () => ({
    folders: [],
    loading: false,
    error: null,
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveItem: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0 }),
}));

const DRIVE = 'https://lh3.googleusercontent.com/d/drive-slide';
const SLIDE = 'https://firebasestorage.googleapis.com/v0/b/b/o/slide.webp';
const THUMB = 'https://firebasestorage.googleapis.com/v0/b/b/o/thumbs%2Fs.webp';

const personalSet: GuidedLearningSetMetadata = {
  id: 'set-1',
  title: 'Personal Set',
  stepCount: 3,
  mode: 'guided',
  imageUrl: DRIVE,
  driveFileId: 'drive-1',
  createdAt: 1000,
  updatedAt: 2000,
};

const buildingSet: GuidedLearningSet = {
  id: 'b-1',
  title: 'Building Lesson',
  imageUrls: [SLIDE],
  slideThumbnails: { [SLIDE]: THUMB },
  steps: [],
  mode: 'guided',
  createdAt: 1000,
  updatedAt: 2000,
  isBuilding: true,
};

describe('GuidedLearningManager — thumbnails', () => {
  it('uses thumbnail URLs and lazy, async-decoded images', async () => {
    const { container } = render(
      <GuidedLearningManager
        userId="teacher-1"
        sets={[personalSet]}
        buildingSets={[buildingSet]}
        assignments={[]}
        loading={false}
        buildingLoading={false}
        assignmentsLoading={false}
        isDriveConnected={true}
        isAdmin={false}
        onPlay={vi.fn()}
        onEdit={vi.fn()}
        onAssign={vi.fn()}
        onDeletePersonal={vi.fn()}
        onDeleteBuilding={vi.fn()}
        onCreateNewPersonal={vi.fn()}
        onCreateNewBuilding={vi.fn()}
        onOpenAIAuthoring={vi.fn()}
        onReorderPersonal={vi.fn()}
        recentSessionIds={{}}
        onViewResults={vi.fn()}
        onAssignmentCopyLink={vi.fn()}
        onAssignmentOpenResults={vi.fn()}
        onAssignmentArchive={vi.fn()}
        onAssignmentUnarchive={vi.fn()}
        onAssignmentDelete={vi.fn()}
      />
    );
    await screen.findByText('Personal Set');
    const imgs = Array.from(container.querySelectorAll('img'));
    const srcs = imgs.map((img) => img.getAttribute('src'));
    expect(srcs).toContain(`${DRIVE}=w400`);
    expect(srcs).toContain(THUMB);
    expect(srcs).not.toContain(SLIDE);
    for (const img of imgs) {
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('decoding')).toBe('async');
    }
  });
});
