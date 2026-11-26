// One "Last, First" format and last-name order for students; copied into functions/src/studentName.gen.ts.

/** A roster row's name or a ClassLink name; either pair works. */
export interface PersonName {
  firstName?: string | null;
  lastName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
}

/** The label for a student with no name on record. */
export const UNNAMED_STUDENT = 'Unnamed student';

function nameParts(name: PersonName | null | undefined): {
  first: string;
  last: string;
} {
  if (!name) return { first: '', last: '' };
  const classLink = name.givenName != null || name.familyName != null;
  return {
    first: (classLink ? name.givenName : name.firstName)?.trim() ?? '',
    last: (classLink ? name.familyName : name.lastName)?.trim() ?? '',
  };
}

/** "Last, First", or whichever name exists, or '' when neither does. */
export function lastFirst(name: PersonName | null | undefined): string {
  const { first, last } = nameParts(name);
  return last && first ? `${last}, ${first}` : last || first;
}

/** "Last, First", or the unnamed-student label. */
export function lastFirstOrUnnamed(
  name: PersonName | null | undefined
): string {
  return lastFirst(name) || UNNAMED_STUDENT;
}

const nameCollator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});

/** Compares two name strings the way every student list sorts. */
export function compareNameText(a: string, b: string): number {
  return nameCollator.compare(a, b);
}

/** Last name, then first name; a student with no name sorts last. */
export function compareLastFirst(
  a: PersonName | null | undefined,
  b: PersonName | null | undefined
): number {
  const x = nameParts(a);
  const y = nameParts(b);
  const xEmpty = !x.first && !x.last;
  const yEmpty = !y.first && !y.last;
  if (xEmpty !== yEmpty) return xEmpty ? 1 : -1;
  return (
    nameCollator.compare(x.last || x.first, y.last || y.first) ||
    nameCollator.compare(x.first, y.first)
  );
}
