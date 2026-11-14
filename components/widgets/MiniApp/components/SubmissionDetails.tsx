// A Mini App's free-form result as labelled rows and tables, never raw code.
import React from 'react';
import {
  humanizeKey,
  isPlain,
  primitiveText,
  type Plain,
} from '@/utils/miniAppSubmissionText';

const TEXT = { fontSize: 'min(12px, 3.8cqmin)' } as const;
const MAX_DEPTH = 4;
const MAX_ROWS = 200;

/** Columns for a list of records that share simple fields, or null. */
const tableColumns = (rows: unknown[]): string[] | null => {
  if (rows.length === 0 || !rows.every(isPlain)) return null;
  const cols: string[] = [];
  for (const row of rows)
    for (const [k, v] of Object.entries(row)) {
      if (primitiveText(v) === null) return null;
      if (!cols.includes(k)) cols.push(k);
    }
  return cols.length > 0 && cols.length <= 8 ? cols : null;
};

const Value: React.FC<{ value: unknown; depth: number }> = ({
  value,
  depth,
}) => {
  const text = primitiveText(value);
  if (text !== null)
    return <span className="whitespace-pre-wrap break-words">{text}</span>;
  if (depth >= MAX_DEPTH) return <span>…</span>;

  if (Array.isArray(value)) {
    const rows = (value as unknown[]).slice(0, MAX_ROWS);
    const cols = tableColumns(rows);
    if (cols)
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-brand-gray-lighter">
                {cols.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className="font-semibold text-brand-gray-primary"
                    style={{ padding: 'min(4px, 1cqmin) min(8px, 2cqmin)' }}
                  >
                    {humanizeKey(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-brand-gray-lightest last:border-b-0"
                >
                  {cols.map((c) => (
                    <td
                      key={c}
                      className="align-top break-words"
                      style={{ padding: 'min(4px, 1cqmin) min(8px, 2cqmin)' }}
                    >
                      {primitiveText((row as Plain)[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    return (
      <ol className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
        {rows.map((item, i) => (
          <li key={i} className="flex" style={{ gap: 'min(6px, 1.5cqmin)' }}>
            <span className="shrink-0 font-semibold text-brand-gray-primary tabular-nums">
              {i + 1}.
            </span>
            <div className="min-w-0 flex-1">
              <Value value={item} depth={depth + 1} />
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if (isPlain(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return <span>–</span>;
    return (
      <dl
        className="grid min-w-0"
        style={{
          gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)',
          columnGap: 'min(12px, 3cqmin)',
          rowGap: 'min(4px, 1cqmin)',
        }}
      >
        {entries.slice(0, MAX_ROWS).map(([k, v]) => {
          const inline = primitiveText(v) !== null;
          return (
            <React.Fragment key={k}>
              <dt
                className={`font-semibold text-brand-gray-primary break-words ${inline ? '' : 'col-span-2'}`}
              >
                {humanizeKey(k)}
              </dt>
              <dd
                className={`min-w-0 text-brand-gray-dark ${inline ? '' : 'col-span-2 border-l-2 border-brand-gray-lightest'}`}
                style={inline ? undefined : { paddingLeft: 'min(8px, 2cqmin)' }}
              >
                <Value value={v} depth={depth + 1} />
              </dd>
            </React.Fragment>
          );
        })}
      </dl>
    );
  }

  return <span>–</span>;
};

/** What a student sent from a Mini App, laid out for the teacher to read. */
export const SubmissionDetails: React.FC<{ value: unknown }> = ({ value }) => (
  <div
    className="text-brand-gray-dark"
    style={TEXT}
    data-testid="mini-app-submission-details"
  >
    <Value value={value} depth={0} />
  </div>
);
