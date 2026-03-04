import { TalkingToolCategory } from '@/types';

export const DEFAULT_TALKING_TOOL_CATEGORIES: TalkingToolCategory[] = [
  {
    id: 'listen',
    label: 'Listen Closely',
    color: '#008ab6',
    icon: 'Ear',
    stems: [
      { id: 'l1', text: 'What do you mean by ________?' },
      { id: 'l2', text: 'Can you tell me more about ________?' },
      { id: 'l3', text: 'What evidence supports your idea?' },
      { id: 'l4', text: 'How does your idea relate to ________?' },
    ],
  },
  {
    id: 'share',
    label: 'Share What You Think',
    color: '#009cc3',
    icon: 'MessageCircle',
    stems: [
      { id: 's1', text: 'I think ________ because ________.' },
      { id: 's2', text: 'First, ________. Also, ________. Finally, ________.' },
      { id: 's3', text: 'I agree and I will add that ________.' },
      { id: 's4', text: 'I disagree because ________.' },
      {
        id: 's5',
        text: 'I hear you say that ________. This makes me think that ________.',
      },
      { id: 's6', text: 'I hear you say that ________. However, ________.' },
    ],
  },
  {
    id: 'support',
    label: 'Support What You Say',
    color: '#5aafd1',
    icon: 'BookOpen',
    stems: [
      { id: 'su1', text: 'In the text, ________.' },
      { id: 'su2', text: 'For example, ________.' },
      {
        id: 'su3',
        text: 'One reason is ________. Another reason is ________.',
      },
      { id: 'su4', text: 'This evidence shows ________.' },
      { id: 'su5', text: 'This evidence means ________.' },
      { id: 'su6', text: 'This evidence is important because ________.' },
    ],
  },
];
