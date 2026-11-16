import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryFirestore } from '../focus/testFirestore';
import {
  handleSaveCourse,
  type CourseCaller,
  type CourseDeps,
} from './saveCourse';

type Db = ReturnType<typeof createMemoryFirestore>;

const UID = 'teacher-1';
const caller = { uid: UID, email: 't@orono.k12.mn.us', name: 'Ms. Rivera' };

let db: Db;
let ids = 0;
let taught: Set<string> | null;
let classLinkDown = false;
let deps: CourseDeps;

const roster = (id: string, data: Record<string, unknown>) =>
  db.doc(`users/${UID}/rosters/${id}`).set({ name: id, ...data });
const doc = (path: string) => db.dump().get(path);
const paths = (prefix: string) =>
  [...db.dump().keys()].filter((k) => k.startsWith(prefix)).sort();

const save = (course: Record<string, unknown>, who: CourseCaller = caller) =>
  handleSaveCourse(db, who, { action: 'save', course }, deps);

const base = {
  name: 'English 9',
  agenda: { fileId: 'deckFile_123456', title: 'Agenda' },
  pinnedLinks: [{ title: 'Novel', url: 'https://example.com/novel' }],
  familyLinkOn: false,
};

beforeEach(async () => {
  db = createMemoryFirestore();
  ids = 0;
  taught = new Set(['cl-p2', 'cl-p5']);
  classLinkDown = false;
  deps = {
    now: () => 1000,
    newId: () => `id${++ids}`,
    taughtClassIds: vi.fn(() =>
      classLinkDown
        ? Promise.reject(new Error('down'))
        : Promise.resolve(taught)
    ),
    isTestClassAuthority: vi.fn(() => Promise.resolve(false)),
    resolveOrgId: () => Promise.resolve('orono'),
    featureGranted: () => Promise.resolve(true),
  };
  await roster('p2', { classlinkClassId: 'cl-p2' });
  await roster('p5', { classlinkClassId: 'cl-p5' });
  await roster('hand', {});
});

describe('saveCourseV1 save', () => {
  it('writes the Course, a Class page copy per confirmed class and the course link', async () => {
    const reply = await save({ ...base, rosterIds: ['p2', 'p5', 'hand'] });
    expect(reply).toEqual({
      courseId: 'id1',
      rostersWithoutClassPage: ['hand'],
      classLinkUnavailable: false,
    });
    const course = doc(`users/${UID}/courses/id1`);
    expect(course).toMatchObject({
      name: 'English 9',
      rosterIds: ['p2', 'p5', 'hand'],
      rosterClassIds: { p2: 'cl-p2', p5: 'cl-p5' },
      linkId: 'id2',
      familyLink: null,
    });
    expect(paths('class_pages/')).toEqual([
      `class_pages/cl-p2/teachers/${UID}`,
      `class_pages/cl-p5/teachers/${UID}`,
    ]);
    expect(doc(`class_pages/cl-p2/teachers/${UID}`)).toEqual({
      courseName: 'English 9',
      teacherName: 'Ms. Rivera',
      agenda: base.agenda,
      pinnedLinks: base.pinnedLinks,
      linkId: 'id2',
      updatedAt: 1000,
    });
    expect(doc('course_page_links/id2')).toEqual({
      classIds: ['cl-p2', 'cl-p5'],
    });
  });

  it('never writes a copy for a class ClassLink says the teacher does not teach', async () => {
    taught = new Set(['cl-p5']);
    const reply = await save({ ...base, rosterIds: ['p2', 'p5'] });
    expect(reply.rostersWithoutClassPage).toEqual(['p2']);
    expect(paths('class_pages/')).toEqual([
      `class_pages/cl-p5/teachers/${UID}`,
    ]);
  });

  it('keeps classes ClassLink confirmed before when it is down, and adds no new ones', async () => {
    taught = new Set(['cl-p2']);
    await save({ ...base, rosterIds: ['p2'] });
    classLinkDown = true;
    const reply = await save({ ...base, id: 'id1', rosterIds: ['p2', 'p5'] });
    expect(reply.classLinkUnavailable).toBe(true);
    expect(reply.rostersWithoutClassPage).toEqual(['p5']);
    expect(paths('class_pages/')).toEqual([
      `class_pages/cl-p2/teachers/${UID}`,
    ]);
  });

  it('gives a mock class a copy only to a test-class authority', async () => {
    await roster('mock', { testClassId: 'mock-1' });
    await db.doc('organizations/orono/testClasses/mock-1').set({});
    let reply = await save({ ...base, rosterIds: ['mock'] });
    expect(reply.rostersWithoutClassPage).toEqual(['mock']);
    deps.isTestClassAuthority = vi.fn(() => Promise.resolve(true));
    reply = await save({ ...base, id: 'id1', rosterIds: ['mock'] });
    expect(reply.rostersWithoutClassPage).toEqual([]);
    expect(paths('class_pages/')).toEqual([
      `class_pages/mock-1/teachers/${UID}`,
    ]);
  });

  it('keeps co-teachers apart: each teacher writes only their own copy', async () => {
    await save({ ...base, rosterIds: ['p2'] });
    await db
      .doc('users/teacher-2/rosters/x')
      .set({ classlinkClassId: 'cl-p2' });
    await save(
      { ...base, name: 'English 9 B', rosterIds: ['x'] },
      { uid: 'teacher-2', email: 'b@orono.k12.mn.us', name: 'Mr. Lee' }
    );
    expect(paths('class_pages/cl-p2/')).toEqual([
      `class_pages/cl-p2/teachers/${UID}`,
      'class_pages/cl-p2/teachers/teacher-2',
    ]);
    expect(doc(`class_pages/cl-p2/teachers/${UID}`)?.courseName).toBe(
      'English 9'
    );
  });

  it('moves a roster out of its old Course and deletes a Course left empty', async () => {
    await save({ ...base, name: 'Alone', rosterIds: ['p5'] });
    await save({ ...base, rosterIds: ['p2'] });
    await save({ ...base, id: 'id3', rosterIds: ['p2', 'p5'] });
    expect(paths(`users/${UID}/courses/`)).toEqual([
      `users/${UID}/courses/id3`,
    ]);
    expect(doc('course_page_links/id2')).toBeUndefined();
    expect(doc(`class_pages/cl-p5/teachers/${UID}`)?.courseName).toBe(
      'English 9'
    );
  });

  it('switches the family link on and off without changing its address', async () => {
    await save({ ...base, rosterIds: ['p2'], familyLinkOn: true });
    const shareId = (
      doc(`users/${UID}/courses/id1`)?.familyLink as { shareId: string }
    ).shareId;
    expect(doc(`family_pages/${shareId}`)).toEqual({
      courseName: 'English 9',
      teacherName: 'Ms. Rivera',
      agenda: base.agenda,
      pinnedLinks: base.pinnedLinks,
      updatedAt: 1000,
    });
    await save({ ...base, id: 'id1', rosterIds: ['p2'], familyLinkOn: false });
    expect(doc(`family_pages/${shareId}`)).toBeUndefined();
    await save({ ...base, id: 'id1', rosterIds: ['p2'], familyLinkOn: true });
    expect(doc(`family_pages/${shareId}`)).toBeDefined();
    expect(
      (doc(`users/${UID}/courses/id1`)?.familyLink as { shareId: string })
        .shareId
    ).toBe(shareId);
  });

  it('drops a class page when its roster leaves the Course', async () => {
    await save({ ...base, rosterIds: ['p2', 'p5'] });
    await save({ ...base, id: 'id1', rosterIds: ['p2'] });
    expect(paths('class_pages/')).toEqual([
      `class_pages/cl-p2/teachers/${UID}`,
    ]);
    expect(doc('course_page_links/id2')).toEqual({ classIds: ['cl-p2'] });
  });

  it('refuses bad input, unknown rosters and other teachers', async () => {
    await expect(
      save({ ...base, name: ' ', rosterIds: ['p2'] })
    ).rejects.toThrow(/name/);
    await expect(save({ ...base, rosterIds: [] })).rejects.toThrow(/class/);
    await expect(save({ ...base, rosterIds: ['nope'] })).rejects.toThrow(
      /Unknown class/
    );
    await expect(
      save({ ...base, agenda: { fileId: '../x' }, rosterIds: ['p2'] })
    ).rejects.toThrow(/Agenda/);
    await expect(
      save({ ...base, id: 'missing', rosterIds: ['p2'] })
    ).rejects.toThrow(/gone/);
    await expect(
      save({ ...base, rosterIds: ['p2'] }, { ...caller, email: null })
    ).rejects.toThrow(/Teacher/);
    deps.featureGranted = () => Promise.resolve(false);
    await expect(save({ ...base, rosterIds: ['p2'] })).rejects.toThrow(
      /not turned on/
    );
  });

  it('refuses one class in two Courses', async () => {
    await roster('dup', { classlinkClassId: 'cl-p2' });
    await save({ ...base, rosterIds: ['p2'] });
    await expect(save({ ...base, rosterIds: ['dup'] })).rejects.toThrow(
      /another course/
    );
  });

  it('cleans pinned links and caps them at six', async () => {
    const pinnedLinks = [
      { title: 'x', url: 'javascript:alert(1)' },
      ...Array.from({ length: 8 }, (_, i) => ({
        title: `L${i}`,
        url: `https://example.com/${i}`,
      })),
    ];
    await save({ ...base, rosterIds: ['p2'], pinnedLinks });
    const saved = doc(`users/${UID}/courses/id1`)?.pinnedLinks as unknown[];
    expect(saved).toHaveLength(6);
    expect(saved[0]).toEqual({ title: 'L0', url: 'https://example.com/0' });
  });
});

describe('saveCourseV1 unlink, delete and deck check', () => {
  it('unlinks a class into its own Course with a copy of the Agenda and links (D5)', async () => {
    await save({ ...base, rosterIds: ['p2', 'p5'], familyLinkOn: true });
    const reply = await handleSaveCourse(
      db,
      caller,
      { action: 'unlink', courseId: 'id1', rosterId: 'p5' },
      deps
    );
    const newId = reply.courseId as string;
    const alone = doc(`users/${UID}/courses/${newId}`);
    expect(alone).toMatchObject({
      name: 'p5',
      rosterIds: ['p5'],
      agenda: base.agenda,
      pinnedLinks: base.pinnedLinks,
      familyLink: null,
      rosterClassIds: { p5: 'cl-p5' },
    });
    expect(doc(`users/${UID}/courses/id1`)?.rosterIds).toEqual(['p2']);
    const copy = doc(`class_pages/cl-p5/teachers/${UID}`);
    expect(copy?.courseName).toBe('p5');
    expect(copy?.linkId).toBe((alone as { linkId: string }).linkId);
    const oldLink = doc(`users/${UID}/courses/id1`)?.linkId as string;
    expect(doc(`course_page_links/${oldLink}`)).toEqual({
      classIds: ['cl-p2'],
    });
  });

  it('refuses to unlink the last class', async () => {
    await save({ ...base, rosterIds: ['p2'] });
    await expect(
      handleSaveCourse(
        db,
        caller,
        { action: 'unlink', courseId: 'id1', rosterId: 'p2' },
        deps
      )
    ).rejects.toThrow(/own/);
  });

  it('deletes a Course and every copy, even with the flag off', async () => {
    await save({ ...base, rosterIds: ['p2', 'p5'], familyLinkOn: true });
    deps.featureGranted = () => Promise.resolve(false);
    await handleSaveCourse(
      db,
      caller,
      { action: 'delete', courseId: 'id1' },
      deps
    );
    expect(paths('users/teacher-1/courses/')).toEqual([]);
    expect(paths('class_pages/')).toEqual([]);
    expect(paths('course_page_links/')).toEqual([]);
    expect(paths('family_pages/')).toEqual([]);
  });

  it('records a deck check and refuses a bad one', async () => {
    await save({ ...base, rosterIds: ['p2'] });
    await handleSaveCourse(
      db,
      caller,
      {
        action: 'recordDeckCheck',
        courseId: 'id1',
        modifiedAt: 500,
        sharing: 'domain',
      },
      deps
    );
    expect(doc(`users/${UID}/courses/id1`)?.deckCheck).toEqual({
      checkedAt: 1000,
      modifiedAt: 500,
      sharing: 'domain',
    });
    await expect(
      handleSaveCourse(
        db,
        caller,
        {
          action: 'recordDeckCheck',
          courseId: 'id1',
          modifiedAt: 1,
          sharing: 'public',
        },
        deps
      )
    ).rejects.toThrow(/Bad/);
  });

  it('clears the deck check when the Agenda deck changes', async () => {
    await save({ ...base, rosterIds: ['p2'] });
    await handleSaveCourse(
      db,
      caller,
      {
        action: 'recordDeckCheck',
        courseId: 'id1',
        modifiedAt: 1,
        sharing: 'domain',
      },
      deps
    );
    await save({ ...base, id: 'id1', rosterIds: ['p2'] });
    expect(doc(`users/${UID}/courses/id1`)?.deckCheck).not.toBeNull();
    await save({
      ...base,
      id: 'id1',
      rosterIds: ['p2'],
      agenda: { fileId: 'otherDeck_12345', title: 'New' },
    });
    expect(doc(`users/${UID}/courses/id1`)?.deckCheck).toBeNull();
  });
});
