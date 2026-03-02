import {
  User,
  Users,
  UsersRound,
  Heart,
  Ear,
  CheckCircle2,
  MessagesSquare,
} from 'lucide-react';
import { ExpectationsConfig } from '../types';

export const VOLUME_OPTIONS = [
  {
    id: 0,
    label: 'Silence',
    sub: 'Independent',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    id: 1,
    label: 'Whisper',
    sub: 'Partner Talk',
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  {
    id: 2,
    label: 'Conversation',
    sub: 'Table Talk',
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
  },
  {
    id: 3,
    label: 'Presenter',
    sub: 'Speaking',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
  {
    id: 4,
    label: 'Outside',
    sub: 'Recess',
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
];

export const GROUP_OPTIONS: {
  id: ExpectationsConfig['workMode'];
  label: string;
  icon: typeof User;
  color: string;
  bg: string;
}[] = [
  {
    id: 'individual',
    label: 'Alone',
    icon: User,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
  },
  {
    id: 'partner',
    label: 'Partner',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    id: 'group',
    label: 'Group',
    icon: UsersRound,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
];

export const INTERACTION_OPTIONS: {
  id: ExpectationsConfig['interactionMode'];
  label: string;
  icon: typeof Heart;
  color: string;
  bg: string;
}[] = [
  {
    id: 'respectful',
    label: 'Respectful',
    icon: Heart,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
  },
  {
    id: 'listening',
    label: 'Listening',
    icon: Ear,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  {
    id: 'productive',
    label: 'Productive',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    id: 'discussion',
    label: 'Discussion',
    icon: MessagesSquare,
    color: 'text-sky-600',
    bg: 'bg-sky-50',
  },
];
