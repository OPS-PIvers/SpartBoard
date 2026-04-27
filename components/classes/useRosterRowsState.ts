import { useState, useMemo, useCallback } from 'react';
import { Student, ClassRoster } from '@/types';
import {
  splitNames,
  findDuplicatePins,
} from '@/components/widgets/Classes/rosterUtils';
import { normalizeRestrictions } from '@/utils/rosterRestrictions';

export interface DraftRow {
  id: string;
  firstName: string;
  lastName: string;
  pin: string;
  classLinkSourcedId?: string;
  email?: string;
  restrictedStudentIds?: string[];
}

/**
 * State hook for the row-based roster editor.
 *
 * Each row is an explicit DraftRow (not a slice of three parallel textarea
 * strings). This makes point edits, deletes, and reorders trivial while
 * still supporting fast bulk entry via paste.
 *
 * PIN auto-assignment (zero-padding) is handled downstream by
 * `useRosters.assignPins` on save — we intentionally pass raw empty
 * strings through when the user hasn't provided PINs.
 */
export function useRosterRowsState(roster: ClassRoster | null) {
  const [name, setName] = useState(roster?.name ?? '');
  const [rows, setRows] = useState<DraftRow[]>(
    () =>
      roster?.students.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        pin: s.pin,
        classLinkSourcedId: s.classLinkSourcedId,
        email: s.email,
        restrictedStudentIds: s.restrictedStudentIds,
      })) ?? []
  );
  const [showLastNames, setShowLastNames] = useState(
    roster?.students.some((s) => s.lastName.trim() !== '') ?? false
  );
  const [showPins, setShowPins] = useState(
    roster?.students.some((s) => s.pin.trim() !== '') ?? false
  );
  // Auto-show email column when at least one student has an email — so
  // freshly imported ClassLink/test-class rosters reveal it immediately
  // without requiring the teacher to find the toggle.
  const [showEmails, setShowEmails] = useState(
    roster?.students.some((s) => (s.email ?? '').trim() !== '') ?? false
  );
  const [showRestrictions, setShowRestrictions] = useState(
    roster?.students.some((s) => (s.restrictedStudentIds?.length ?? 0) > 0) ??
      false
  );

  const addRow = useCallback(() => {
    setRows((rs) => [
      ...rs,
      { id: crypto.randomUUID(), firstName: '', lastName: '', pin: '' },
    ]);
  }, []);

  const updateRow = useCallback((id: string, patch: Partial<DraftRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const deleteRow = useCallback((id: string) => {
    setRows((rs) =>
      rs
        .filter((r) => r.id !== id)
        .map((r) => {
          if (!r.restrictedStudentIds?.includes(id)) return r;
          const next = r.restrictedStudentIds.filter((x) => x !== id);
          return {
            ...r,
            restrictedStudentIds: next.length > 0 ? next : undefined,
          };
        })
    );
  }, []);

  /**
   * Toggle a mutual restriction between two students. Mirrors the change
   * on both sides so the in-memory invariant matches what the normalizer
   * will emit on save.
   */
  const toggleRestriction = useCallback(
    (studentId: string, otherId: string) => {
      if (studentId === otherId) return;
      setRows((rs) => {
        const aRow = rs.find((r) => r.id === studentId);
        if (!aRow) return rs;
        const currentlyRestricted =
          aRow.restrictedStudentIds?.includes(otherId) ?? false;
        const mutate = (row: DraftRow, peerId: string): DraftRow => {
          const existing = row.restrictedStudentIds ?? [];
          const next = currentlyRestricted
            ? existing.filter((id) => id !== peerId)
            : [...new Set([...existing, peerId])];
          return {
            ...row,
            restrictedStudentIds: next.length > 0 ? next : undefined,
          };
        };
        return rs.map((r) => {
          if (r.id === studentId) return mutate(r, otherId);
          if (r.id === otherId) return mutate(r, studentId);
          return r;
        });
      });
    },
    []
  );

  /**
   * Multi-line paste into a first-name input. First line replaces the target
   * row's name fields; remaining lines become new rows inserted after it.
   * When lastNames are shown, splits each line on the last space.
   */
  const bulkPasteInto = useCallback(
    (targetRowId: string, pasted: string, splitLastName: boolean) => {
      const lines = pasted
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length === 0) return;

      const buildEntry = (
        line: string
      ): { firstName: string; lastName: string } => {
        if (!splitLastName) return { firstName: line, lastName: '' };
        const { firsts, lasts } = splitNames(line);
        return { firstName: firsts[0] ?? line, lastName: lasts[0] ?? '' };
      };

      setRows((rs) => {
        const idx = rs.findIndex((r) => r.id === targetRowId);
        if (idx === -1) return rs;

        const targetEntry = buildEntry(lines[0]);
        const updatedTarget: DraftRow = {
          ...rs[idx],
          firstName: targetEntry.firstName,
          lastName: splitLastName ? targetEntry.lastName : rs[idx].lastName,
        };

        const newRows: DraftRow[] = lines.slice(1).map((line) => {
          const entry = buildEntry(line);
          return {
            id: crypto.randomUUID(),
            firstName: entry.firstName,
            lastName: entry.lastName,
            pin: '',
          };
        });

        return [
          ...rs.slice(0, idx),
          updatedTarget,
          ...newRows,
          ...rs.slice(idx + 1),
        ];
      });
    },
    []
  );

  const handleToggleLastNames = useCallback(() => {
    setShowLastNames((prev) => {
      if (prev) {
        // Collapsing: merge last into first, then clear last
        setRows((rs) =>
          rs.map((r) => ({
            ...r,
            firstName: [r.firstName, r.lastName]
              .filter(Boolean)
              .join(' ')
              .trim(),
            lastName: '',
          }))
        );
        return false;
      } else {
        // Expanding: split existing firstName on last space
        setRows((rs) =>
          rs.map((r) => {
            if (r.lastName) return r;
            const trimmed = r.firstName.trim();
            const lastSpace = trimmed.lastIndexOf(' ');
            if (lastSpace > 0) {
              return {
                ...r,
                firstName: trimmed.substring(0, lastSpace),
                lastName: trimmed.substring(lastSpace + 1),
              };
            }
            return r;
          })
        );
        return true;
      }
    });
  }, []);

  /**
   * Students ready to save: trimmed, skips fully-empty rows.
   * PIN zero-padding happens in useRosters downstream.
   */
  const validStudents = useMemo<Student[]>(
    () =>
      normalizeRestrictions(
        rows
          .map((r) => {
            const firstName = r.firstName.trim();
            const lastName = r.lastName.trim();
            if (!firstName && !lastName) return null;
            const student: Student = {
              id: r.id,
              firstName,
              lastName,
              pin: showPins ? r.pin.trim() : r.pin,
            };
            if (r.classLinkSourcedId !== undefined) {
              student.classLinkSourcedId = r.classLinkSourcedId;
            }
            const trimmedEmail = (r.email ?? '').trim();
            if (trimmedEmail) {
              student.email = trimmedEmail;
            }
            if (r.restrictedStudentIds && r.restrictedStudentIds.length > 0) {
              student.restrictedStudentIds = r.restrictedStudentIds;
            }
            return student;
          })
          .filter((s): s is Student => s !== null)
      ),
    [rows, showPins]
  );

  const duplicatePins = useMemo(
    () => findDuplicatePins(validStudents),
    [validStudents]
  );

  return {
    name,
    setName,
    rows,
    addRow,
    updateRow,
    deleteRow,
    bulkPasteInto,
    showLastNames,
    handleToggleLastNames,
    showPins,
    setShowPins,
    showEmails,
    setShowEmails,
    showRestrictions,
    setShowRestrictions,
    toggleRestriction,
    validStudents,
    duplicatePins,
  };
}
