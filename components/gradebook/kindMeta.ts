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
  { label: string; letter: string; icon: LucideIcon }
> = {
  quiz: { label: 'Quiz', letter: 'Q', icon: ClipboardList },
  'video-activity': { label: 'Video activity', letter: 'V', icon: PlayCircle },
  'guided-learning': {
    label: 'Guided learning',
    letter: 'G',
    icon: GraduationCap,
  },
  flashcards: { label: 'Flashcards', letter: 'F', icon: Layers },
  projects: { label: 'Project', letter: 'P', icon: FolderKanban },
  'mini-app': { label: 'Mini app', letter: 'M', icon: AppWindow },
  'activity-wall': {
    label: 'Activity wall',
    letter: 'W',
    icon: MessagesSquare,
  },
};
