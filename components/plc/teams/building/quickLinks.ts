// Quick-link data and icon choice for the `quickLinks` card.

import {
  ClipboardList,
  Clock,
  FileText,
  FolderOpen,
  LifeBuoy,
  Link2,
  Users2,
  type LucideIcon,
} from 'lucide-react';
import { usePlcLinks } from '@/hooks/usePlcLinks';

export interface QuickLink {
  id: string;
  title: string;
  url: string;
}

const ICON_RULES: [RegExp, LucideIcon][] = [
  [/handbook|policy|guide|manual/i, FileText],
  [/folder|drive|copy|files/i, FolderOpen],
  [/request|form|sign.?up/i, ClipboardList],
  [/help|ticket|support/i, LifeBuoy],
  [/schedule|bell|calendar|time/i, Clock],
  [/directory|people|contacts/i, Users2],
];

export const quickLinkIcon = (title: string): LucideIcon =>
  ICON_RULES.find(([re]) => re.test(title))?.[1] ?? Link2;

export function useQuickLinks(plcId: string): QuickLink[] {
  return usePlcLinks(plcId).links;
}
