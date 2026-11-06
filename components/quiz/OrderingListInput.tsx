import React from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QuizPublicQuestion } from '@/types';
import { AnswerImageZoomButton, AnswerLabel } from './AnswerImage';
import { ReadAloudButton } from './readAloud/ReadAloudButton';
import { READ_ALOUD_HIGHLIGHT_CLASS } from './readAloud/readAloudHighlight';
import type { ReadAloudItemControls } from './readAloud/useQuizReadAloud';

interface OrderingListInputProps {
  question: QuizPublicQuestion;
  /** Item indices in the order to show first; the parent submits it as is if the student never moves anything. */
  initialOrder: number[];
  onChange: (answer: string) => void;
  disabled?: boolean;
  light?: boolean;
  readAloud?: ReadAloudItemControls;
}

const Row: React.FC<{
  id: string;
  position: number;
  count: number;
  label: string;
  image?: string;
  disabled?: boolean;
  light?: boolean;
  onMove: (dir: 'up' | 'down') => void;
  speaker: React.ReactNode;
  highlighted: boolean;
}> = ({
  id,
  position,
  count,
  label,
  image,
  disabled,
  light,
  onMove,
  speaker,
  highlighted,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const slotPosition = `position ${position + 1}`;
  const arrowCls = `min-w-[32px] min-h-[22px] p-1 disabled:opacity-20 transition-colors ${light ? 'text-slate-400 hover:text-slate-700' : 'text-slate-400 hover:text-white'}`;
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center gap-2 rounded-xl ${isDragging ? 'z-10' : ''} ${highlighted ? READ_ALOUD_HIGHLIGHT_CLASS : ''}`}
    >
      <span
        className={`font-black text-sm w-6 shrink-0 text-center ${light ? 'text-brand-blue-primary' : 'text-violet-400'}`}
      >
        {position + 1}.
      </span>
      <div
        className={`flex flex-1 min-w-0 items-center gap-2 rounded-xl border-2 p-1.5 text-sm font-bold transition-shadow ${
          isDragging
            ? light
              ? 'bg-white border-brand-blue-light shadow-lg ring-2 ring-brand-blue-light/40 text-slate-700'
              : 'bg-slate-600 border-violet-400 shadow-lg text-white'
            : light
              ? 'bg-white border-slate-300 text-slate-700'
              : 'bg-slate-700 border-slate-600 text-white'
        }`}
      >
        <button
          // no-tour-anchor: student quiz screen; tours walk teachers
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          disabled={disabled}
          aria-label={`${label}, ${slotPosition}. Drag to reorder.`}
          className={`flex h-11 w-8 shrink-0 items-center justify-center rounded-lg touch-none select-none ${disabled ? 'cursor-default opacity-40' : 'cursor-grab active:cursor-grabbing'} ${light ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700' : 'text-slate-400 hover:bg-slate-600 hover:text-white'}`}
        >
          <GripVertical className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="min-w-0 flex-1">
          <AnswerLabel label={label} image={image} layout="compact" />
        </span>
      </div>
      {image ? <AnswerImageZoomButton src={image} label={label} /> : null}
      {speaker}
      <div className="flex flex-col">
        <button
          // no-tour-anchor: student quiz screen; tours walk teachers
          type="button"
          onClick={() => onMove('up')}
          disabled={(disabled ?? false) || position === 0}
          className={arrowCls}
          aria-label={`Move ${slotPosition} up`}
        >
          ▲
        </button>
        <button
          // no-tour-anchor: student quiz screen; tours walk teachers
          type="button"
          onClick={() => onMove('down')}
          disabled={(disabled ?? false) || position === count - 1}
          className={arrowCls}
          aria-label={`Move ${slotPosition} down`}
        >
          ▼
        </button>
      </div>
    </li>
  );
};

/** Ordering as one list the student drags (or moves with the arrows) into order. */
export const OrderingListInput: React.FC<OrderingListInputProps> = ({
  question,
  initialOrder,
  onChange,
  disabled,
  light,
  readAloud,
}) => {
  const { t } = useTranslation();
  const items = question.orderingItems ?? [];
  const images =
    question.orderingImages?.length === items.length
      ? question.orderingImages
      : undefined;
  const [order, setOrder] = React.useState<number[]>(initialOrder);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const commit = (next: number[]) => {
    setOrder(next);
    onChange(next.map((i) => items[i]).join('|'));
  };

  const move = (position: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? position - 1 : position + 1;
    if (target < 0 || target >= order.length) return;
    commit(arrayMove(order, position, target));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    if (disabled || !e.over || e.active.id === e.over.id) return;
    const from = order.indexOf(Number(e.active.id));
    const to = order.indexOf(Number(e.over.id));
    if (from < 0 || to < 0) return;
    commit(arrayMove(order, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={order.map(String)}
        strategy={verticalListSortingStrategy}
      >
        <ol className="space-y-2">
          {order.map((itemIndex, position) => {
            const label = items[itemIndex];
            return (
              <Row
                key={itemIndex}
                id={String(itemIndex)}
                position={position}
                count={order.length}
                label={label}
                image={images?.[itemIndex]}
                disabled={disabled}
                light={light}
                onMove={(dir) => move(position, dir)}
                speaker={
                  readAloud ? (
                    <ReadAloudButton
                      label={t('quizReadAloud.readItem', 'Read item aloud')}
                      status={readAloud.status('orderingItem', label)}
                      onClick={() => readAloud.play('orderingItem', label)}
                      onStop={readAloud.stop}
                    />
                  ) : null
                }
                highlighted={
                  readAloud?.highlighted('orderingItem', label) === true
                }
              />
            );
          })}
        </ol>
      </SortableContext>
    </DndContext>
  );
};
