import {
  AppWindow,
  ClipboardList,
  FolderKanban,
  GraduationCap,
  Layers,
  MessagesSquare,
  PlayCircle,
  type LucideIcon,
} from 'lucide-react';
import type { GradebookKind } from '@/utils/gradebook/gradebookCore';

export const GRADEBOOK_KIND_META: Record<
  GradebookKind,
  { label: string; icon: LucideIcon }
> = {
  quiz: { label: 'Quiz', icon: ClipboardList },
  'video-activity': { label: 'Video activity', icon: PlayCircle },
  'guided-learning': { label: 'Guided learning', icon: GraduationCap },
  flashcards: { label: 'Flashcards', icon: Layers },
  projects: { label: 'Project', icon: FolderKanban },
  'mini-app': { label: 'Mini app', icon: AppWindow },
  'activity-wall': { label: 'Activity wall', icon: MessagesSquare },
};
