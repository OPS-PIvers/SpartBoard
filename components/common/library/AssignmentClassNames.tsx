import React, { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  assignmentClassNamesTitle,
  formatAssignmentClassNames,
  splitAssignmentClassNames,
} from './assignmentClassNames';

interface AssignmentClassNamesProps {
  names: readonly (string | null | undefined)[];
}

/** Class names in an assignment row's meta line; wraps instead of truncating. */
export const AssignmentClassNames: React.FC<AssignmentClassNamesProps> = ({
  names,
}) => {
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLSpanElement>(null);
  const expand = () => {
    flushSync(() => setExpanded(true));
    // Keep keyboard focus here once the button is gone.
    listRef.current?.focus();
  };
  const label = formatAssignmentClassNames(names);
  if (label == null) return null;
  const split = expanded ? null : splitAssignmentClassNames(names);
  return (
    <span
      ref={listRef}
      tabIndex={expanded ? -1 : undefined}
      data-testid="assignment-class-names"
      className="min-w-0 whitespace-normal text-pretty font-semibold outline-hidden [overflow-wrap:anywhere]"
      title={assignmentClassNamesTitle(names)}
    >
      {split ? (
        <>
          {split.first}{' '}
          {/* no-tour-anchor: reveals the rest of this row's class list */}
          <button
            type="button"
            onClick={expand}
            className="touch-target-expand relative whitespace-nowrap font-bold underline decoration-current/40 underline-offset-2 hover:decoration-current focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 rounded-sm [-webkit-tap-highlight-color:transparent]"
          >
            +{split.more} more
          </button>
        </>
      ) : (
        label
      )}
    </span>
  );
};
