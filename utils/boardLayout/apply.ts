import type { BoardTemplate } from '@/config/boardTemplates';
import { placeInZone, type PlacedRect, type ScreenShape } from './geometry';

export interface TemplateFill {
  zoneId: string;
}

export type TemplatePlacement<F extends TemplateFill> = F & {
  role: string;
  rect: PlacedRect;
};

export interface TemplateFillIssue {
  zoneId: string;
  problem: 'unknown-zone' | 'zone-already-filled';
}

export interface AppliedTemplate<F extends TemplateFill> {
  templateId: string;
  placements: TemplatePlacement<F>[];
  emptyZones: string[];
  issues: TemplateFillIssue[];
}

/** Places each fill on its template zone; unknown and repeated zones are reported, never guessed. */
export const applyTemplate = <F extends TemplateFill>(
  template: BoardTemplate,
  fills: readonly F[],
  screen?: ScreenShape
): AppliedTemplate<F> => {
  const used = new Set<string>();
  const placements: TemplatePlacement<F>[] = [];
  const issues: TemplateFillIssue[] = [];
  for (const fill of fills) {
    const zone = template.zones.find((z) => z.id === fill.zoneId);
    if (!zone) {
      issues.push({ zoneId: fill.zoneId, problem: 'unknown-zone' });
      continue;
    }
    if (used.has(zone.id)) {
      issues.push({ zoneId: fill.zoneId, problem: 'zone-already-filled' });
      continue;
    }
    used.add(zone.id);
    const role =
      template.slots.find((slot) => slot.zoneId === zone.id)?.role ?? zone.id;
    placements.push({ ...fill, role, rect: placeInZone(zone, screen) });
  }
  return {
    templateId: template.id,
    placements,
    emptyZones: template.zones.filter((z) => !used.has(z.id)).map((z) => z.id),
    issues,
  };
};
