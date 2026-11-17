// Fixture Class page Agendas and links for the /student-landing-dev and /class-student-page-dev harnesses (?agenda=1).
import React from 'react';
import { ClassPageAgenda } from '@/components/student/landing/ClassPageAgenda';
import type { ClassPageView } from '@/hooks/useClassPageAgendas';

const slide = (heading: string, lines: string[], color: string): string => {
  const rows = lines
    .map(
      (line, i) =>
        `<text x="70" y="${200 + i * 52}" font-family="Lexend, sans-serif" font-size="30" fill="#334155">${line}</text>`
    )
    .join('');
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 562"><rect width="1000" height="562" fill="#fff"/><rect width="1000" height="10" fill="${color}"/><text x="70" y="120" font-family="Lexend, sans-serif" font-size="50" font-weight="700" fill="#0f172a">${heading}</text>${rows}</svg>`
  )}`;
};

const SLIDES: Record<string, string> = {
  deckBioAgenda01: slide(
    'Monday, November 16',
    [
      'Warm-up: label the cell',
      'Notes: mitosis',
      'Lab: onion root tips',
      'Due Friday: lab report',
    ],
    '#2d3f89'
  ),
  deckOrtizEng0001: slide(
    'Ms. Ortiz: Monday',
    ['Read chapter 7', 'Quote journal', 'Book club groups'],
    '#ad2122'
  ),
  deckLeeEnglish01: slide(
    'Mr. Lee: Monday',
    ['Vocabulary quiz', 'Thesis workshop'],
    '#0f766e'
  ),
};

export const fixtureEmbedUrl = (fileId: string): string =>
  SLIDES[fileId] ?? slide('Agenda', [], '#64748b');

const LINKS = [
  {
    title: 'Class syllabus',
    url: 'https://docs.google.com/document/d/abc/edit',
  },
  { title: 'Lab safety video', url: 'https://www.youtube.com/watch?v=abc' },
  { title: 'Textbook online', url: 'https://www.pearson.com/biology' },
];

const LONG_LINKS = [
  {
    title:
      'Unit 4 study guide with every vocabulary word, diagram and practice question for the test',
    url: 'https://docs.google.com/document/d/a-very-long-document-identifier-that-keeps-going/edit',
  },
  { title: 'Khan Academy', url: 'https://www.khanacademy.org/science/biology' },
  { title: 'Quizlet', url: 'https://quizlet.com/123' },
  { title: 'Desmos', url: 'https://www.desmos.com/calculator' },
  { title: 'Padlet', url: 'https://padlet.com/x' },
  {
    title: 'Ms. Hanson-Abernathy-Oyelaran website',
    url: 'https://sites.google.com/orono.k12.mn.us/hanson',
  },
];

export const FIXTURE_CLASS_PAGES: Record<string, ClassPageView> = {
  bio: {
    agendas: [
      {
        fileId: 'deckBioAgenda01',
        title: 'Biology 9 Agenda',
        teacherName: null,
      },
    ],
    links: LINKS,
  },
  eng: {
    agendas: [
      {
        fileId: 'deckOrtizEng0001',
        title: 'English 9 Agenda',
        teacherName: 'Ms. Ortiz',
      },
      {
        fileId: 'deckLeeEnglish01',
        title: 'English 9 Agenda',
        teacherName: 'Mr. Lee',
      },
    ],
    links: LINKS.slice(0, 1),
  },
  alg: { agendas: [], links: LONG_LINKS },
};

export const fixtureClassTop = (classId: string): React.ReactNode => {
  const view = FIXTURE_CLASS_PAGES[classId];
  return view ? (
    <ClassPageAgenda view={view} embedUrlFor={fixtureEmbedUrl} />
  ) : null;
};
