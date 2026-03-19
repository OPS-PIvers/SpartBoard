import {
  WidgetType,
  WidgetConfig,
  GridPosition,
  PollOption,
  MiniAppConfig,
  EmbedConfig,
  TextConfig,
  PollConfig,
  ScoreboardConfig,
  ScoreboardTeam,
  RandomConfig,
} from '@/types';

/** Validates and clamps grid coordinates to the 12x12 system */
export const validateGridConfig = (pos: GridPosition): GridPosition | null => {
  if (!pos) return null;
  const col = Number(pos.col);
  const row = Number(pos.row);
  const colSpan = Number(pos.colSpan);
  const rowSpan = Number(pos.rowSpan);

  if (isNaN(col) || isNaN(row) || isNaN(colSpan) || isNaN(rowSpan)) {
    return null;
  }

  // Clamp starting points to 0-11
  const vCol = Math.max(0, Math.min(11, Math.floor(col)));
  const vRow = Math.max(0, Math.min(11, Math.floor(row)));

  // Clamp spans to at least 1, and ensure they don't exceed the grid boundary
  const vColSpan = Math.max(1, Math.min(12 - vCol, Math.floor(colSpan)));
  const vRowSpan = Math.max(1, Math.min(12 - vRow, Math.floor(rowSpan)));

  return { col: vCol, row: vRow, colSpan: vColSpan, rowSpan: vRowSpan };
};

/** Basic sanitization for AI-generated widget configurations to prevent XSS/Injection */
export const sanitizeAIConfig = (
  type: WidgetType,
  config: Partial<WidgetConfig> | undefined
): Partial<WidgetConfig> => {
  if (!config || typeof config !== 'object') return {};

  // Deep clone to avoid mutating original
  const sanitized = JSON.parse(JSON.stringify(config)) as Record<
    string,
    unknown
  >;

  // 1. Critical XSS prevention for widgets with HTML/Script capability
  // AI is not intended to generate executable code via the layout tool.
  if (type === 'miniApp') {
    const c = sanitized as unknown as Partial<MiniAppConfig>;
    delete c.activeApp;
  }

  if (type === 'miniApp' || type === 'embed') {
    const c = sanitized as unknown as Record<string, unknown>;
    delete c.html;
  }

  // 2. URL validation for widgets that load external content
  if (type === 'embed' || type === 'qr') {
    const c = sanitized as unknown as Partial<EmbedConfig>;
    // Always normalize url to a string; non-strings and empty/whitespace become ''.
    if (typeof c.url !== 'string') {
      c.url = '';
    } else {
      const trimmed = c.url.trim();
      if (trimmed === '') {
        c.url = '';
      } else {
        try {
          const url = new URL(trimmed);
          if (!['http:', 'https:'].includes(url.protocol)) {
            c.url = '';
          } else {
            // Store back the normalized URL string
            c.url = url.toString();
          }
        } catch {
          c.url = '';
        }
      }
    }
  }

  // 3. Type-safe content checks for common widgets
  if (type === 'text') {
    const c = sanitized as unknown as Partial<TextConfig>;
    if (typeof c.content !== 'string') c.content = '';

    const rawFontSize = c.fontSize;
    let numericFontSize: number | null = null;
    if (typeof rawFontSize === 'number' && Number.isFinite(rawFontSize)) {
      numericFontSize = rawFontSize;
    } else if (typeof rawFontSize === 'string') {
      const parsed = parseFloat(rawFontSize);
      if (Number.isFinite(parsed)) {
        numericFontSize = parsed;
      }
    }

    if (numericFontSize !== null) {
      c.fontSize = Math.max(8, Math.min(120, numericFontSize));
    } else {
      delete c.fontSize;
    }
  }

  if (type === 'poll') {
    const c = sanitized as unknown as Partial<PollConfig>;
    if (typeof c.question !== 'string') c.question = '';
    if (Array.isArray(c.options)) {
      c.options = (c.options as unknown[]).map((opt: unknown) => {
        let label = '';
        if (typeof opt === 'string') {
          label = opt;
        } else if (opt && typeof opt === 'object') {
          const o = opt as Record<string, unknown>;
          const rawLabel = o.label;
          if (typeof rawLabel === 'string') {
            label = rawLabel;
          } else if (
            typeof rawLabel === 'number' ||
            typeof rawLabel === 'boolean'
          ) {
            label = String(rawLabel);
          }
        }

        const pollOpt: PollOption = {
          id: crypto.randomUUID(),
          label,
          votes: 0,
        };
        return pollOpt;
      });
    } else if (typeof (c as Record<string, unknown>).options !== 'undefined') {
      // If AI provided a non-array options value, remove it so defaults remain valid
      delete (c as Record<string, unknown>).options;
    }
  }

  if (type === 'scoreboard') {
    const c = sanitized as unknown as Partial<ScoreboardConfig>;
    if (Array.isArray(c.teams)) {
      c.teams = (c.teams as unknown[]).map((team: unknown, idx: number) => {
        let name = `Team ${idx + 1}`;
        let score = 0;
        let color = undefined;

        if (typeof team === 'string') {
          name = team;
        } else if (team && typeof team === 'object') {
          const t = team as Record<string, unknown>;
          if (typeof t.name === 'string') name = t.name;
          if (typeof t.score === 'number') score = t.score;
          if (typeof t.color === 'string') color = t.color;
        }

        const scoreboardTeam: ScoreboardTeam = {
          id: crypto.randomUUID(),
          name,
          score,
          color,
        };
        return scoreboardTeam;
      });
    } else if (typeof (c as Record<string, unknown>).teams !== 'undefined') {
      delete (c as Record<string, unknown>).teams;
    }
  }

  if (type === 'random') {
    const c = sanitized as unknown as Partial<RandomConfig>;

    // Clear lastResult if it's not a simple string or array
    if (typeof c.lastResult !== 'undefined') {
      if (typeof c.lastResult === 'string') {
        // Valid string, keep it
      } else if (Array.isArray(c.lastResult)) {
        // Filter out non-string items from array
        c.lastResult = c.lastResult.filter((item) => typeof item === 'string');
      } else {
        delete c.lastResult;
      }
    }

    // Ensure remainingStudents is an array and only contains strings
    if (typeof c.remainingStudents !== 'undefined') {
      if (!Array.isArray(c.remainingStudents)) {
        delete c.remainingStudents;
      } else {
        c.remainingStudents = c.remainingStudents.filter(
          (item) => typeof item === 'string'
        );
      }
    }
  }

  return sanitized as Partial<WidgetConfig>;
};
