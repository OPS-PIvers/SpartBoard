import { STICKY_NOTE_COLORS } from '@/config/colors';
import { FileText, MessageSquare, ShieldCheck, Star } from 'lucide-react';

export const PLACEHOLDER_TEXT = 'Click to edit...';

export const TEXT_WIDGET_COLORS = [
  { hex: STICKY_NOTE_COLORS.yellow, label: 'yellow' },
  { hex: STICKY_NOTE_COLORS.green, label: 'green' },
  { hex: STICKY_NOTE_COLORS.blue, label: 'blue' },
  { hex: STICKY_NOTE_COLORS.pink, label: 'pink' },
  { hex: STICKY_NOTE_COLORS.gray, label: 'gray' },
];

export const TEXT_WIDGET_TEMPLATES = [
  {
    name: 'Integrity Code',
    icon: ShieldCheck,
    content:
      '<b>The Integrity Code</b><br/>I promise that the work I am doing today is my own. I have not received unauthorized help, and I will not share assessment details with others.<br/><br/><i>Signed: ________________</i>',
  },
  {
    name: 'Spartan Scholar',
    icon: Star,
    content:
      '<b>Spartan Scholar Code</b><br/>• I am ready to learn.<br/>• I respect my peers.<br/>• I strive for excellence.<br/>• I own my actions.',
  },
  {
    name: 'Speaking Frames',
    icon: MessageSquare,
    content:
      '<b>Speaking Scaffolds</b><br/>• I agree with ___ because...<br/>• I respectfully disagree with ___ since...<br/>• To build on what ___ said...<br/>• Can you explain what you meant by...?',
  },
  {
    name: 'Writing Frame',
    icon: FileText,
    content:
      "<b>Summary Frame</b><br/>In today's lesson, we learned about ____. One important detail was ____. This is significant because ____.",
  },
];
