// CSV parser for bulk-inviting users into an organization.
//
// The Organization admin panel's "Bulk import users" flow (see
// `components/admin/Organization/views/UsersView.tsx`) accepts a CSV whose
// rows become invitation intents. Each row turns into a `createOrganizationInvites`
// call — this parser is the pure, network-free front-end piece that turns
// raw text into a structured payload plus per-row errors.
//
// Intentionally dependency-free: a small RFC-4180-aware parser is inlined
// below rather than pulling in papaparse/csv-parse, because the surface we
// need (header-based lookup, quoted cells, CRLF) is tiny and the bulk-invite
// path is load-bearing enough that we want it fully traceable here.

/** A single resolved invitation payload ready to send to `createOrganizationInvites`. */
export interface InviteIntent {
  name?: string;
  /** Lowercased. */
  email: string;
  /** Resolved from the CSV `role` cell via the roles lookup (id or name match). */
  roleId: string;
  /** Resolved from the CSV `building` cell via the buildings lookup (name first, then id). */
  buildingIds: string[];
}

/** A parse-time problem attached to a specific input line (1-based; header is line 1). */
export interface CsvParseError {
  /** 1-based line number in the original CSV. `0` is reserved for whole-file errors. */
  line: number;
  /** The offending row as it appeared in the source (empty string for whole-file errors). */
  raw: string;
  /** Human-readable explanation. */
  reason: string;
}

export interface CsvParseResult {
  valid: InviteIntent[];
  errors: CsvParseError[];
}

export interface CsvParseOptions {
  /** Available roles from `useOrgRoles`. Used to resolve a CSV `role` cell to a canonical `roleId`. */
  roles: Array<{ id: string; name: string }>;
  /** Available buildings from `useOrgBuildings`. Used to resolve CSV `building` cells to `buildingIds`. */
  buildings: Array<{ id: string; name: string }>;
  /** Default role when the CSV omits a role column or the role cell is empty. Defaults to `'teacher'`. */
  defaultRoleId?: string;
  /** Maximum row count (defence against malicious paste). Defaults to 500. */
  maxRows?: number;
}

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const KNOWN_COLUMNS = new Set(['name', 'email', 'role', 'building']);

// ---------------------------------------------------------------------------
// RFC 4180 line/cell tokenization
// ---------------------------------------------------------------------------

/**
 * Split a CSV document into logical rows, honoring quoted fields that contain
 * embedded newlines. Both `\r\n` and `\n` are accepted as row terminators;
 * `\r` alone is treated as part of the line (rare in practice).
 *
 * Returned rows preserve their raw text (minus the terminator) so we can
 * echo them back in `CsvParseError.raw` for UI display.
 */
function splitLogicalRows(source: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      // Consume a paired \r\n as a single terminator.
      if (ch === '\r' && source[i + 1] === '\n') i++;
      rows.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

/**
 * Parse one CSV row into its individual cells, handling RFC 4180 quoting:
 * - Fields may be wrapped in double quotes; quotes inside a quoted field are
 *   escaped by doubling them (`""` → `"`).
 * - Cells are trimmed of surrounding whitespace after unquoting.
 */
function parseRow(row: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"') {
        if (row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

function resolveRoleId(
  raw: string | undefined,
  roles: CsvParseOptions['roles'],
  defaultRoleId: string
): { ok: true; roleId: string } | { ok: false; reason: string } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, roleId: defaultRoleId };
  const lower = trimmed.toLowerCase();
  const match = roles.find(
    (r) => r.id.toLowerCase() === lower || r.name.toLowerCase() === lower
  );
  if (!match) return { ok: false, reason: `Unknown role "${trimmed}".` };
  return { ok: true, roleId: match.id };
}

function resolveBuildingIds(
  raw: string | undefined,
  buildings: CsvParseOptions['buildings']
): { ok: true; buildingIds: string[] } | { ok: false; reason: string } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, buildingIds: [] };
  const tokens = trimmed
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const resolved: string[] = [];
  const unresolved: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    // Name first (the human-readable thing most CSVs will contain), then id.
    const byName = buildings.find((b) => b.name.toLowerCase() === lower);
    const byId = byName ?? buildings.find((b) => b.id.toLowerCase() === lower);
    if (byId) {
      if (!resolved.includes(byId.id)) resolved.push(byId.id);
    } else {
      unresolved.push(token);
    }
  }
  if (unresolved.length > 0) {
    return {
      ok: false,
      reason: `Unknown building${unresolved.length === 1 ? '' : 's'}: ${unresolved
        .map((t) => `"${t}"`)
        .join(', ')}.`,
    };
  }
  return { ok: true, buildingIds: resolved };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseInvitesCsv(
  source: string,
  options: CsvParseOptions
): CsvParseResult {
  const defaultRoleId = options.defaultRoleId ?? 'teacher';
  const maxRows = options.maxRows ?? 500;

  // Blank input (no characters or only whitespace) is a user error worth
  // surfacing — "your CSV is empty" is clearer than a silent empty result.
  if (!source.trim()) {
    return {
      valid: [],
      errors: [{ line: 0, raw: '', reason: 'CSV is empty.' }],
    };
  }

  const logicalRows = splitLogicalRows(source);
  if (logicalRows.length === 0) {
    return {
      valid: [],
      errors: [{ line: 0, raw: '', reason: 'CSV is empty.' }],
    };
  }

  // Header row — lowercase, trim, build a column index.
  const headerRaw = logicalRows[0];
  const headerCells = parseRow(headerRaw).map((c) => c.toLowerCase());
  const columnIndex: Record<string, number> = {};
  headerCells.forEach((name, idx) => {
    if (KNOWN_COLUMNS.has(name) && !(name in columnIndex)) {
      columnIndex[name] = idx;
    }
  });

  if (!('email' in columnIndex)) {
    return {
      valid: [],
      errors: [
        {
          line: 1,
          raw: headerRaw,
          reason: 'CSV must include an "email" column.',
        },
      ],
    };
  }

  // Collect data rows — skip whitespace-only lines silently. Track the
  // original 1-based line number for error reporting (header is line 1).
  type DataRow = { line: number; raw: string; cells: string[] };
  const dataRows: DataRow[] = [];
  for (let i = 1; i < logicalRows.length; i++) {
    const raw = logicalRows[i];
    if (!raw.trim()) continue;
    dataRows.push({ line: i + 1, raw, cells: parseRow(raw) });
  }

  if (dataRows.length === 0) {
    // Header-only CSV is a valid, benign case (empty paste). No errors.
    return { valid: [], errors: [] };
  }

  if (dataRows.length > maxRows) {
    return {
      valid: [],
      errors: [
        {
          line: 0,
          raw: '',
          reason: `CSV exceeds maxRows (${maxRows}). Split into multiple imports.`,
        },
      ],
    };
  }

  const errors: CsvParseError[] = [];
  // Map from lowercased email → index into `collected`. When we see a
  // duplicate the later row wins; we emit an error on the earlier line and
  // overwrite the slot so `valid` only contains the winning intent.
  const emailIndex = new Map<string, number>();
  const collected: Array<InviteIntent | null> = [];
  const collectedLines: number[] = [];

  for (const row of dataRows) {
    const getCell = (column: string): string | undefined => {
      const idx = columnIndex[column];
      if (idx === undefined) return undefined;
      const value = row.cells[idx];
      return value === undefined || value === '' ? undefined : value;
    };

    const emailRaw = getCell('email');
    if (!emailRaw) {
      errors.push({
        line: row.line,
        raw: row.raw,
        reason: 'Missing email.',
      });
      continue;
    }
    const email = emailRaw.toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      errors.push({
        line: row.line,
        raw: row.raw,
        reason: `Invalid email "${emailRaw}".`,
      });
      continue;
    }

    const roleResult = resolveRoleId(
      getCell('role'),
      options.roles,
      defaultRoleId
    );
    if (!roleResult.ok) {
      errors.push({ line: row.line, raw: row.raw, reason: roleResult.reason });
      continue;
    }

    // All-or-nothing building resolution: one unresolved token invalidates the
    // whole row. Partial success was considered but rejected — a silently
    // dropped building would be easy to miss in a UI toast and would land
    // users in the wrong building with no breadcrumbs.
    const buildingResult = resolveBuildingIds(
      getCell('building'),
      options.buildings
    );
    if (!buildingResult.ok) {
      errors.push({
        line: row.line,
        raw: row.raw,
        reason: buildingResult.reason,
      });
      continue;
    }

    const intent: InviteIntent = {
      email,
      roleId: roleResult.roleId,
      buildingIds: buildingResult.buildingIds,
    };
    const nameCell = getCell('name');
    if (nameCell) intent.name = nameCell;

    const existingIdx = emailIndex.get(email);
    if (existingIdx !== undefined) {
      // Earlier row is shadowed by this one; null it out in `collected`
      // and emit an error on the earlier line.
      const earlierLine = collectedLines[existingIdx];
      const earlierRaw =
        dataRows.find((r) => r.line === earlierLine)?.raw ?? '';
      errors.push({
        line: earlierLine,
        raw: earlierRaw,
        reason: 'Duplicate email; later row supersedes this one.',
      });
      collected[existingIdx] = null;
    }
    emailIndex.set(email, collected.length);
    collectedLines.push(row.line);
    collected.push(intent);
  }

  const valid = collected.filter((i): i is InviteIntent => i !== null);
  return { valid, errors };
}
