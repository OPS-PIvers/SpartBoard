import { useState } from 'react';
import { useGradebook } from '@/components/gradebook/GradebookContext';
import {
  resolveCardOrder,
  STUDENT_CARD_HIDDEN_KEY,
  STUDENT_CARD_IDS,
  STUDENT_CARD_LAYOUT_KEY,
  type StudentCardId,
} from './studentViewModel';

interface CardLayout {
  order: StudentCardId[];
  hidden: StudentCardId[];
}

const isCardId = (id: string): id is StudentCardId =>
  (STUDENT_CARD_IDS as readonly string[]).includes(id);

/** Card order and hidden cards, saved per teacher per class. */
export function useStudentCardLayout(): CardLayout & {
  save: (next: CardLayout) => void;
} {
  const { rosterId, classState, saveCardLayouts, toast } = useGradebook();
  const layouts = classState?.cardLayouts;
  const [pending, setPending] = useState<{
    rosterId: string;
    layout: CardLayout;
  } | null>(null);
  const layout: CardLayout =
    pending?.rosterId === rosterId
      ? pending.layout
      : {
          order: resolveCardOrder(layouts?.[STUDENT_CARD_LAYOUT_KEY]),
          hidden: (layouts?.[STUDENT_CARD_HIDDEN_KEY] ?? []).filter(isCardId),
        };

  const save = (next: CardLayout): void => {
    const mine = { rosterId, layout: next };
    setPending(mine);
    const clear = (): void => setPending((p) => (p === mine ? null : p));
    saveCardLayouts({
      [STUDENT_CARD_LAYOUT_KEY]: next.order,
      [STUDENT_CARD_HIDDEN_KEY]: next.hidden,
    })
      .then(clear)
      .catch(() => {
        clear();
        toast('Could not save the card layout');
      });
  };

  return { ...layout, save };
}
