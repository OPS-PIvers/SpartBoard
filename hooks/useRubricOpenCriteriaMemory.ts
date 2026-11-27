import { useEffect } from 'react';

// Which criteria a teacher left open, per rubric, so the next student opens the same way.
export const openCriteriaMemory = new Map<string, Set<string>>();

/** Forgets the open criteria when the grader that hosts the rubric panel closes. */
export const useForgetOpenCriteriaOnUnmount = () =>
  useEffect(() => () => openCriteriaMemory.clear(), []);
