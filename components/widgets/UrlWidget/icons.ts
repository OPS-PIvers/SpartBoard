import {
  ExternalLink,
  Globe,
  Link as LinkIcon,
  BookOpen,
  Video,
  Image as ImageIcon,
  FileText,
  Music,
  Gamepad2,
  GraduationCap,
  Calendar,
  Mail,
  Newspaper,
  Star,
  Heart,
  PenTool,
  Calculator,
  Microscope,
  Map,
  Camera,
  type LucideIcon,
} from 'lucide-react';

export const URL_ICONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'external-link', label: 'External Link', icon: ExternalLink },
  { id: 'globe', label: 'Globe', icon: Globe },
  { id: 'link', label: 'Link', icon: LinkIcon },
  { id: 'book', label: 'Book', icon: BookOpen },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'file', label: 'File', icon: FileText },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'game', label: 'Game', icon: Gamepad2 },
  { id: 'school', label: 'School', icon: GraduationCap },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'mail', label: 'Mail', icon: Mail },
  { id: 'news', label: 'News', icon: Newspaper },
  { id: 'star', label: 'Star', icon: Star },
  { id: 'heart', label: 'Heart', icon: Heart },
  { id: 'pen', label: 'Draw', icon: PenTool },
  { id: 'calc', label: 'Calculator', icon: Calculator },
  { id: 'science', label: 'Science', icon: Microscope },
  { id: 'map', label: 'Map', icon: Map },
  { id: 'camera', label: 'Camera', icon: Camera },
];

export const DEFAULT_URL_ICON_ID = 'external-link';

export const getUrlIcon = (id?: string): LucideIcon => {
  const found = URL_ICONS.find((i) => i.id === id);
  return found?.icon ?? ExternalLink;
};

export const URL_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#f43f5e',
];

export const DEFAULT_URL_COLOR = '#10b981';
