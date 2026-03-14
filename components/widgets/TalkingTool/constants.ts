import type { ElementType } from 'react';
import { Ear, MessageCircle, BookOpen, MessageSquare } from 'lucide-react';

export const ICON_MAP: Record<string, ElementType> = {
  Ear,
  MessageCircle,
  BookOpen,
  MessageSquare,
};

export const getIcon = (iconName: string) => {
  return ICON_MAP[iconName] || MessageSquare;
};
