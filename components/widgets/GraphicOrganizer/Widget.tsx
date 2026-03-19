import React, { useRef, useEffect } from 'react';
import { WidgetData, GraphicOrganizerConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDashboard } from '@/context/useDashboard';
import { getFontClass } from '@/utils/styles';

const EditableNode: React.FC<{
  id: string;
  initialText: string;
  onUpdate: (id: string, text: string) => void;
  className?: string;
  placeholder?: string;
}> = ({ id, initialText, onUpdate, className, placeholder }) => {
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (
      contentEditableRef.current &&
      contentEditableRef.current.innerText !== initialText &&
      document.activeElement !== contentEditableRef.current
    ) {
      contentEditableRef.current.innerText = initialText;
    }
  }, [initialText]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const triggerUpdate = () => {
    if (contentEditableRef.current && onUpdateRef.current) {
      onUpdateRef.current(id, contentEditableRef.current.innerText);
    }
  };

  const handleInput = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(triggerUpdate, 500);
  };

  const handleBlur = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    triggerUpdate();
  };

  return (
    <div
      ref={contentEditableRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onBlur={handleBlur}
      className={`outline-none min-h-[50px] whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 ${className ?? ''}`}
      data-placeholder={placeholder}
    />
  );
};

export const GraphicOrganizerWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const config = widget.config as GraphicOrganizerConfig;
  const globalStyle = activeDashboard?.globalStyle ?? { fontFamily: 'sans' };
  const fontClass = getFontClass(
    config.fontFamily ?? 'global',
    globalStyle.fontFamily
  );
  const nodes = config.nodes || {};

  const handleUpdate = (id: string, text: string) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        nodes: {
          ...nodes,
          [id]: { id, text },
        },
      },
    });
  };

  const renderFrayer = () => (
    <div className="grid grid-cols-2 grid-rows-2 h-full gap-2 p-2 relative bg-slate-100">
      <div className="bg-white border-2 border-slate-300 rounded p-4 relative">
        <div className="absolute top-2 left-2 text-xs font-bold text-slate-500 uppercase">
          Definition
        </div>
        <EditableNode
          id="top-left"
          initialText={nodes['top-left']?.text || ''}
          onUpdate={handleUpdate}
          className="mt-4 h-full"
          placeholder="Type definition..."
        />
      </div>
      <div className="bg-white border-2 border-slate-300 rounded p-4 relative">
        <div className="absolute top-2 left-2 text-xs font-bold text-slate-500 uppercase">
          Characteristics
        </div>
        <EditableNode
          id="top-right"
          initialText={nodes['top-right']?.text || ''}
          onUpdate={handleUpdate}
          className="mt-4 h-full"
          placeholder="Type characteristics..."
        />
      </div>
      <div className="bg-white border-2 border-slate-300 rounded p-4 relative">
        <div className="absolute top-2 left-2 text-xs font-bold text-slate-500 uppercase">
          Examples
        </div>
        <EditableNode
          id="bottom-left"
          initialText={nodes['bottom-left']?.text || ''}
          onUpdate={handleUpdate}
          className="mt-4 h-full"
          placeholder="Type examples..."
        />
      </div>
      <div className="bg-white border-2 border-slate-300 rounded p-4 relative">
        <div className="absolute top-2 left-2 text-xs font-bold text-slate-500 uppercase">
          Non-Examples
        </div>
        <EditableNode
          id="bottom-right"
          initialText={nodes['bottom-right']?.text || ''}
          onUpdate={handleUpdate}
          className="mt-4 h-full"
          placeholder="Type non-examples..."
        />
      </div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-indigo-100 border-4 border-indigo-300 rounded-full w-32 h-32 flex items-center justify-center p-4 shadow-lg text-center z-10">
        <EditableNode
          id="center"
          initialText={nodes['center']?.text || ''}
          onUpdate={handleUpdate}
          className="w-full text-center font-bold text-indigo-900"
          placeholder="Topic"
        />
      </div>
    </div>
  );

  const renderTChart = () => (
    <div className="grid grid-cols-2 h-full gap-0 p-4 bg-white relative">
      <div className="border-r-4 border-slate-400 p-4">
        <EditableNode
          id="left-header"
          initialText={nodes['left-header']?.text || ''}
          onUpdate={handleUpdate}
          className="font-bold text-center border-b-4 border-slate-400 pb-2 mb-4 text-xl"
          placeholder="Pros"
        />
        <EditableNode
          id="left"
          initialText={nodes['left']?.text || ''}
          onUpdate={handleUpdate}
          className="h-full"
          placeholder="- Item 1\n- Item 2"
        />
      </div>
      <div className="p-4">
        <EditableNode
          id="right-header"
          initialText={nodes['right-header']?.text || ''}
          onUpdate={handleUpdate}
          className="font-bold text-center border-b-4 border-slate-400 pb-2 mb-4 text-xl"
          placeholder="Cons"
        />
        <EditableNode
          id="right"
          initialText={nodes['right']?.text || ''}
          onUpdate={handleUpdate}
          className="h-full"
          placeholder="- Item 1\n- Item 2"
        />
      </div>
    </div>
  );

  const renderVenn = () => (
    <div className="flex h-full items-center justify-center relative bg-white overflow-hidden p-4">
      <div className="absolute w-[60%] h-[80%] left-[10%] border-4 border-blue-400 rounded-full opacity-30 bg-blue-100" />
      <div className="absolute w-[60%] h-[80%] right-[10%] border-4 border-green-400 rounded-full opacity-30 bg-green-100" />

      <div className="flex w-full h-[60%] z-10 text-center">
        <div className="w-[35%] p-4 flex flex-col justify-center">
          <EditableNode
            id="left-header"
            initialText={nodes['left-header']?.text || ''}
            onUpdate={handleUpdate}
            className="font-bold text-blue-800 mb-2"
            placeholder="Topic A"
          />
          <EditableNode
            id="left"
            initialText={nodes['left']?.text || ''}
            onUpdate={handleUpdate}
            className="text-sm"
            placeholder="Unique to A"
          />
        </div>
        <div className="w-[30%] p-4 flex flex-col justify-center border-x-2 border-dashed border-slate-300">
          <EditableNode
            id="center-header"
            initialText={nodes['center-header']?.text || ''}
            onUpdate={handleUpdate}
            className="font-bold text-indigo-800 mb-2"
            placeholder="Both"
          />
          <EditableNode
            id="center"
            initialText={nodes['center']?.text || ''}
            onUpdate={handleUpdate}
            className="text-sm"
            placeholder="Shared"
          />
        </div>
        <div className="w-[35%] p-4 flex flex-col justify-center">
          <EditableNode
            id="right-header"
            initialText={nodes['right-header']?.text || ''}
            onUpdate={handleUpdate}
            className="font-bold text-green-800 mb-2"
            placeholder="Topic B"
          />
          <EditableNode
            id="right"
            initialText={nodes['right']?.text || ''}
            onUpdate={handleUpdate}
            className="text-sm"
            placeholder="Unique to B"
          />
        </div>
      </div>
    </div>
  );

  const renderKWL = () => (
    <div className="grid grid-cols-3 h-full gap-0 bg-white">
      <div className="border-r-2 border-slate-300 flex flex-col h-full">
        <div className="bg-blue-100 p-3 text-center border-b-2 border-slate-300">
          <div className="text-3xl font-black text-blue-800">K</div>
          <div className="text-sm font-bold text-blue-600 uppercase">
            What I Know
          </div>
        </div>
        <EditableNode
          id="know"
          initialText={nodes['know']?.text || ''}
          onUpdate={handleUpdate}
          className="p-4 flex-grow h-full"
          placeholder="Type here..."
        />
      </div>
      <div className="border-r-2 border-slate-300 flex flex-col h-full">
        <div className="bg-amber-100 p-3 text-center border-b-2 border-slate-300">
          <div className="text-3xl font-black text-amber-800">W</div>
          <div className="text-sm font-bold text-amber-600 uppercase">
            What I Wonder
          </div>
        </div>
        <EditableNode
          id="wonder"
          initialText={nodes['wonder']?.text || ''}
          onUpdate={handleUpdate}
          className="p-4 flex-grow h-full"
          placeholder="Type here..."
        />
      </div>
      <div className="flex flex-col h-full">
        <div className="bg-green-100 p-3 text-center border-b-2 border-slate-300">
          <div className="text-3xl font-black text-green-800">L</div>
          <div className="text-sm font-bold text-green-600 uppercase">
            What I Learned
          </div>
        </div>
        <EditableNode
          id="learn"
          initialText={nodes['learn']?.text || ''}
          onUpdate={handleUpdate}
          className="p-4 flex-grow h-full"
          placeholder="Type here..."
        />
      </div>
    </div>
  );

  const renderCauseEffect = () => (
    <div className="flex items-center justify-center h-full p-6 bg-slate-50 gap-4">
      <div className="flex-1 bg-white border-2 border-rose-300 rounded-lg shadow-sm h-full flex flex-col">
        <div className="bg-rose-100 p-2 text-center rounded-t-md border-b-2 border-rose-300 font-bold text-rose-800 uppercase tracking-wider">
          Cause
        </div>
        <EditableNode
          id="cause"
          initialText={nodes['cause']?.text || ''}
          onUpdate={handleUpdate}
          className="p-4 flex-grow"
          placeholder="Why it happened..."
        />
      </div>

      <div className="text-slate-400 shrink-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>

      <div className="flex-1 bg-white border-2 border-emerald-300 rounded-lg shadow-sm h-full flex flex-col">
        <div className="bg-emerald-100 p-2 text-center rounded-t-md border-b-2 border-emerald-300 font-bold text-emerald-800 uppercase tracking-wider">
          Effect
        </div>
        <EditableNode
          id="effect"
          initialText={nodes['effect']?.text || ''}
          onUpdate={handleUpdate}
          className="p-4 flex-grow"
          placeholder="What happened..."
        />
      </div>
    </div>
  );

  const renderContent = () => {
    switch (config.templateType) {
      case 'frayer':
        return renderFrayer();
      case 't-chart':
        return renderTChart();
      case 'venn':
        return renderVenn();
      case 'kwl':
        return renderKWL();
      case 'cause-effect':
        return renderCauseEffect();
      default:
        return renderFrayer();
    }
  };

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`h-full w-full overflow-hidden text-slate-800 flex flex-col ${fontClass}`}
        >
          {renderContent()}
        </div>
      }
    />
  );
};
