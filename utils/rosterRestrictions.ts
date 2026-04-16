import { Student } from '@/types';

/**
 * Enforces the bidirectional invariant on student restriction lists and
 * strips references to student IDs that no longer exist in the roster.
 *
 * Invariant: for any two students A and B, `B ∈ A.restrictedStudentIds`
 * if and only if `A ∈ B.restrictedStudentIds`. Any asymmetry produced by
 * partial edits, imports, or bugs is resolved by *union* — if either side
 * claims the restriction, both do. This is the safe direction: a teacher
 * who set a restriction expects it to stick.
 *
 * Also drops self-references and duplicates. Returns a new array; input
 * is not mutated. Idempotent.
 */
export function normalizeRestrictions(students: Student[]): Student[] {
  const validIds = new Set(students.map((s) => s.id));

  // Build union of directed edges.
  const edges = new Map<string, Set<string>>();
  const addEdge = (from: string, to: string) => {
    let peers = edges.get(from);
    if (!peers) {
      peers = new Set();
      edges.set(from, peers);
    }
    peers.add(to);
  };
  for (const s of students) {
    for (const other of s.restrictedStudentIds ?? []) {
      if (other === s.id) continue;
      if (!validIds.has(other)) continue;
      addEdge(s.id, other);
      addEdge(other, s.id);
    }
  }

  return students.map((s) => {
    const ids = edges.get(s.id);
    if (!ids || ids.size === 0) {
      if (s.restrictedStudentIds === undefined) return s;
      const copy = { ...s };
      delete copy.restrictedStudentIds;
      return copy;
    }
    return { ...s, restrictedStudentIds: [...ids].sort() };
  });
}
