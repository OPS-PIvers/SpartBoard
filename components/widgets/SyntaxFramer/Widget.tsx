import React from 'react';
import { SyntaxFramerConfig, SyntaxToken, WidgetComponentProps } from '@/types';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDashboard } from '@/context/useDashboard';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Settings } from 'lucide-react';

interface SortableTokenProps {
  token: SyntaxToken;
  mode: 'text' | 'math';
  fontSize: number;
  onMaskToggle: (id: string) => void;
  onColorCycle: (id: string) => void;
}

const WIDGET_COLORS = [
  undefined, // default/none
  'bg-red-100 text-red-800 border-red-300',
  'bg-blue-100 text-blue-800 border-blue-300',
  'bg-green-100 text-green-800 border-green-300',
  'bg-yellow-100 text-yellow-800 border-yellow-300',
  'bg-purple-100 text-purple-800 border-purple-300',
  'bg-pink-100 text-pink-800 border-pink-300',
  'bg-orange-100 text-orange-800 border-orange-300',
];

const SortableToken: React.FC<SortableTokenProps> = ({
  token,
  mode,
  fontSize,
  onMaskToggle,
  onColorCycle,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: token.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
    fontSize: `min(100px, ${fontSize}cqmin)`,
  };

  const isMath = mode === 'math';
  const colorClass = token.color ?? 'bg-white text-slate-800 border-slate-200';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey) {
      onColorCycle(token.id);
    } else {
      onMaskToggle(token.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.shiftKey) {
        onColorCycle(token.id);
      } else {
        onMaskToggle(token.id);
      }
    }
  };

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{
        ...style,
        padding: '1cqmin 2cqmin',
        borderWidth: 'min(1px, 0.2cqmin)',
        borderRadius: '1.5cqmin',
      }}
      className={`
        syntax-token
        relative cursor-grab active:cursor-grabbing shadow-sm
        transition-colors select-none whitespace-pre
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
        ${colorClass}
        ${isMath ? 'font-serif italic' : 'font-sans font-medium'}
      `}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...attributes}
      {...listeners}
      title="Click to mask/unmask. Shift+Click to change color. Drag to move."
      aria-label={token.isMasked ? 'Masked token' : `Token: ${token.value}`}
    >
      {token.isMasked ? (
        <span
          className="opacity-50 inline-block"
          style={{ padding: '0 0.5cqmin' }}
        >
          {'_'.repeat(token.value.length || 3)}
        </span>
      ) : (
        token.value
      )}
    </button>
  );
};

export const SyntaxFramerWidget: React.FC<WidgetComponentProps> = ({
  widget,
}) => {
  const config = widget.config as SyntaxFramerConfig;
  const { updateWidget } = useDashboard();
  const {
    tokens = [],
    mode = 'text',
    fontSize = 8,
    alignment = 'center',
  } = config;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tokens.findIndex((t) => t.id === active.id);
      const newIndex = tokens.findIndex((t) => t.id === over.id);

      const newTokens = arrayMove(tokens, oldIndex, newIndex);
      updateWidget(widget.id, {
        config: { ...config, tokens: newTokens },
      });
    }
  };

  const handleMaskToggle = (id: string) => {
    const newTokens = tokens.map((t) =>
      t.id === id ? { ...t, isMasked: !t.isMasked } : t
    );
    updateWidget(widget.id, {
      config: { ...config, tokens: newTokens },
    });
  };

  const handleColorCycle = (id: string) => {
    const newTokens = tokens.map((t) => {
      if (t.id === id) {
        const currentIndex = WIDGET_COLORS.indexOf(t.color);
        const nextIndex = (currentIndex + 1) % WIDGET_COLORS.length;
        return { ...t, color: WIDGET_COLORS[nextIndex] };
      }
      return t;
    });
    updateWidget(widget.id, {
      config: { ...config, tokens: newTokens },
    });
  };

  const justifyClass =
    alignment === 'left' ? 'justify-start' : 'justify-center';

  if (!tokens.length) {
    return (
      <WidgetLayout
        content={
          <ScaledEmptyState
            icon={Settings}
            title="No Tokens"
            subtitle="Open settings to add tokens"
            titleClassName="text-slate-400"
            subtitleClassName="text-slate-400 italic"
          />
        }
      />
    );
  }

  return (
    <WidgetLayout
      content={
        <div
          className={`w-full h-full flex flex-wrap content-center ${justifyClass}`}
          style={{ gap: '2cqmin' }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tokens.map((t) => t.id)}
              strategy={rectSortingStrategy}
            >
              {tokens.map((token) => (
                <SortableToken
                  key={token.id}
                  token={token}
                  mode={mode}
                  fontSize={fontSize}
                  onMaskToggle={handleMaskToggle}
                  onColorCycle={handleColorCycle}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      }
    />
  );
};

export default SyntaxFramerWidget;
