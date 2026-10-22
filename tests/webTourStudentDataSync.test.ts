import { describe, expect, it } from 'vitest';
import { findStudentData } from '@/components/tours/web/studentData';
import { webTourTextHits } from '@/functions/src/mcp/webTourStudentData';

const SAMPLES = [
  'Open Gradebook',
  'Email jane.doe@school.org for help',
  'Student 4821937 is absent',
  'Call (612) 555-1234',
  'Open 0f8fad5b-d9cb-469f-a165-70867728950e',
  'Find Smith, Jane in the list',
  'Room 12, period 3',
  'Smith-Jones, Mary K. and 55512',
  'élève@école.fr',
];

describe('web tour student data, server copy', () => {
  it('finds the same kinds as the app without a roster', () => {
    for (const text of SAMPLES)
      expect([...webTourTextHits(text)].sort(), text).toEqual(
        [...new Set(findStudentData(text, null).map((h) => h.kind))].sort()
      );
  });
});
