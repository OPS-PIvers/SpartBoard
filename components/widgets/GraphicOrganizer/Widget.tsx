import React, { useRef, useEffect } from 'react';
import {
  WidgetData,
  GraphicOrganizerConfig,
  GraphicOrganizerTemplate,
} from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { getFontClass, hexToRgba } from '@/utils/styles';

const EditableNode: React.FC<{
  id: string;
  initialText: string;
  onUpdate: (id: string, text: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}> = ({ id, initialText, onUpdate, className, style, placeholder }) => {
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
      style={style}
      data-placeholder={placeholder}
    />
  );
};

export const GraphicOrganizerWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const { featurePermissions } = useAuth();
  const buildingId = useWidgetBuildingId(widget) ?? 'global';
  const config = widget.config as GraphicOrganizerConfig;
  const featureObj = featurePermissions?.find(
    (p) => p.widgetType === 'graphic-organizer'
  );

  const featureConfig = featureObj?.config ?? {};
  const buildingsConfig = (featureConfig.buildings ?? {}) as Record<
    string,
    { templates?: GraphicOrganizerTemplate[] }
  >;
  const buildingConfig = buildingsConfig[buildingId] ?? { templates: [] };
  const customTemplates: GraphicOrganizerTemplate[] =
    buildingConfig.templates ?? [];

  const selectedTemplate = customTemplates.find(
    (t) => t.id === config.templateType
  );
  const layout = selectedTemplate
    ? selectedTemplate.layout
    : config.templateType;

  const globalStyle = activeDashboard?.globalStyle ?? { fontFamily: 'sans' };
  const templateFontFamily = selectedTemplate?.fontFamily;
  const currentFontFamily = config.fontFamily ?? templateFontFamily ?? 'global';
  const fontClass = getFontClass(currentFontFamily, globalStyle.fontFamily);
  const nodes = config.nodes ?? {};
  const cardColor = config.cardColor ?? '#ffffff';
  const cardOpacity = config.cardOpacity ?? 1;
  const cellBg = hexToRgba(cardColor, cardOpacity);

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
    <div className="grid grid-cols-2 grid-rows-2 h-full gap-2 p-2 relative">
      <div
        className="border-2 border-slate-300 rounded relative"
        style={{
          backgroundColor: cellBg,
          padding: 'min(16px, 3cqmin)',
        }}
      >
        <div
          className="absolute top-2 left-2 font-bold text-slate-500 uppercase"
          style={{ fontSize: 'min(11px, 4cqmin)' }}
        >
          {selectedTemplate?.defaultNodes?.topLeft ?? 'Definition'}
        </div>
        <EditableNode
          id="top-left"
          initialText={nodes['top-left']?.text ?? ''}
          onUpdate={handleUpdate}
          className="mt-4 h-full"
          placeholder={`Type ${selectedTemplate?.defaultNodes?.topLeft ?? 'definition'}...`}
        />
      </div>
      <div
        className="border-2 border-slate-300 rounded relative"
        style={{
          backgroundColor: cellBg,
          padding: 'min(16px, 3cqmin)',
        }}
      >
        <div
          className="absolute top-2 left-2 font-bold text-slate-500 uppercase"
          style={{ fontSize: 'min(11px, 4cqmin)' }}
        >
          {selectedTemplate?.defaultNodes?.topRight ?? 'Characteristics'}
        </div>
        <EditableNode
          id="top-right"
          initialText={nodes['top-right']?.text ?? ''}
          onUpdate={handleUpdate}
          className="mt-4 h-full"
          placeholder={`Type ${selectedTemplate?.defaultNodes?.topRight ?? 'characteristics'}...`}
        />
      </div>
      <div
        className="border-2 border-slate-300 rounded relative"
        style={{
          backgroundColor: cellBg,
          padding: 'min(16px, 3cqmin)',
        }}
      >
        <div
          className="absolute top-2 left-2 font-bold text-slate-500 uppercase"
          style={{ fontSize: 'min(11px, 4cqmin)' }}
        >
          {selectedTemplate?.defaultNodes?.bottomLeft ?? 'Examples'}
        </div>
        <EditableNode
          id="bottom-left"
          initialText={nodes['bottom-left']?.text ?? ''}
          onUpdate={handleUpdate}
          className="mt-4 h-full"
          placeholder={`Type ${selectedTemplate?.defaultNodes?.bottomLeft ?? 'examples'}...`}
        />
      </div>
      <div
        className="border-2 border-slate-300 rounded relative"
        style={{
          backgroundColor: cellBg,
          padding: 'min(16px, 3cqmin)',
        }}
      >
        <div
          className="absolute top-2 left-2 font-bold text-slate-500 uppercase"
          style={{ fontSize: 'min(11px, 4cqmin)' }}
        >
          {selectedTemplate?.defaultNodes?.bottomRight ?? 'Non-Examples'}
        </div>
        <EditableNode
          id="bottom-right"
          initialText={nodes['bottom-right']?.text ?? ''}
          onUpdate={handleUpdate}
          className="mt-4 h-full"
          placeholder={`Type ${selectedTemplate?.defaultNodes?.bottomRight ?? 'non-examples'}...`}
        />
      </div>
      <div
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-indigo-100 border-4 border-indigo-300 rounded-full flex items-center justify-center shadow-lg text-center z-10"
        style={{
          width: 'min(128px, 22cqmin)',
          height: 'min(128px, 22cqmin)',
          padding: 'min(16px, 3cqmin)',
        }}
      >
        <EditableNode
          id="center"
          initialText={nodes['center']?.text ?? ''}
          onUpdate={handleUpdate}
          className="w-full text-center font-bold text-indigo-900"
          placeholder={selectedTemplate?.defaultNodes?.center ?? 'Topic'}
        />
      </div>
    </div>
  );

  const renderTChart = () => (
    <div
      className="grid grid-cols-2 h-full gap-0 relative"
      style={{
        backgroundColor: cellBg,
        padding: 'min(16px, 3cqmin)',
      }}
    >
      <div
        className="border-r-4 border-slate-400"
        style={{ padding: 'min(16px, 3cqmin)' }}
      >
        <EditableNode
          id="left-header"
          initialText={nodes['left-header']?.text ?? ''}
          onUpdate={handleUpdate}
          className="font-bold text-center border-b-4 border-slate-400"
          style={{
            fontSize: 'min(20px, 7cqmin)',
            paddingBottom: 'min(8px, 2cqmin)',
            marginBottom: 'min(16px, 3cqmin)',
          }}
          placeholder={selectedTemplate?.defaultNodes?.leftHeader ?? 'Pros'}
        />
        <EditableNode
          id="left"
          initialText={nodes['left']?.text ?? ''}
          onUpdate={handleUpdate}
          className="h-full"
          placeholder={
            selectedTemplate?.defaultNodes?.leftContent ?? '- Item 1\n- Item 2'
          }
        />
      </div>
      <div style={{ padding: 'min(16px, 3cqmin)' }}>
        <EditableNode
          id="right-header"
          initialText={nodes['right-header']?.text ?? ''}
          onUpdate={handleUpdate}
          className="font-bold text-center border-b-4 border-slate-400"
          style={{
            fontSize: 'min(20px, 7cqmin)',
            paddingBottom: 'min(8px, 2cqmin)',
            marginBottom: 'min(16px, 3cqmin)',
          }}
          placeholder={selectedTemplate?.defaultNodes?.rightHeader ?? 'Cons'}
        />
        <EditableNode
          id="right"
          initialText={nodes['right']?.text ?? ''}
          onUpdate={handleUpdate}
          className="h-full"
          placeholder={
            selectedTemplate?.defaultNodes?.rightContent ?? '- Item 1\n- Item 2'
          }
        />
      </div>
    </div>
  );

  const renderVenn = () => (
    <div
      className="flex h-full items-center justify-center relative overflow-hidden"
      style={{
        backgroundColor: cellBg,
        padding: 'min(16px, 3cqmin)',
      }}
    >
      <div className="absolute w-[60%] h-[80%] left-[10%] border-4 border-blue-400 rounded-full opacity-30 bg-blue-100" />
      <div className="absolute w-[60%] h-[80%] right-[10%] border-4 border-green-400 rounded-full opacity-30 bg-green-100" />

      <div className="flex w-full h-[60%] z-10 text-center">
        <div
          className="w-[35%] flex flex-col justify-center"
          style={{ padding: 'min(16px, 3cqmin)' }}
        >
          <EditableNode
            id="left-header"
            initialText={nodes['left-header']?.text ?? ''}
            onUpdate={handleUpdate}
            className="font-bold text-blue-800 mb-2"
            placeholder={
              selectedTemplate?.defaultNodes?.leftCircle ?? 'Topic A'
            }
          />
          <EditableNode
            id="left"
            initialText={nodes['left']?.text ?? ''}
            onUpdate={handleUpdate}
            style={{ fontSize: 'min(14px, 5.5cqmin)' }}
            placeholder="Unique to A"
          />
        </div>
        <div
          className="w-[30%] flex flex-col justify-center border-x-2 border-dashed border-slate-300"
          style={{ padding: 'min(16px, 3cqmin)' }}
        >
          <EditableNode
            id="center-header"
            initialText={nodes['center-header']?.text ?? ''}
            onUpdate={handleUpdate}
            className="font-bold text-indigo-800 mb-2"
            placeholder={selectedTemplate?.defaultNodes?.intersection ?? 'Both'}
          />
          <EditableNode
            id="center"
            initialText={nodes['center']?.text ?? ''}
            onUpdate={handleUpdate}
            style={{ fontSize: 'min(14px, 5.5cqmin)' }}
            placeholder="Shared"
          />
        </div>
        <div
          className="w-[35%] flex flex-col justify-center"
          style={{ padding: 'min(16px, 3cqmin)' }}
        >
          <EditableNode
            id="right-header"
            initialText={nodes['right-header']?.text ?? ''}
            onUpdate={handleUpdate}
            className="font-bold text-green-800 mb-2"
            placeholder={
              selectedTemplate?.defaultNodes?.rightCircle ?? 'Topic B'
            }
          />
          <EditableNode
            id="right"
            initialText={nodes['right']?.text ?? ''}
            onUpdate={handleUpdate}
            style={{ fontSize: 'min(14px, 5.5cqmin)' }}
            placeholder="Unique to B"
          />
        </div>
      </div>
    </div>
  );

  const renderKWL = () => (
    <div
      className="grid grid-cols-3 h-full gap-0"
      style={{ backgroundColor: cellBg }}
    >
      <div className="border-r-2 border-slate-300 flex flex-col h-full">
        <div
          className="bg-blue-100 text-center border-b-2 border-slate-300"
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          <div
            className="font-black text-blue-800"
            style={{ fontSize: 'min(30px, 12cqmin)' }}
          >
            K
          </div>
          <div
            className="font-bold text-blue-600 uppercase"
            style={{ fontSize: 'min(14px, 5.5cqmin)' }}
          >
            {selectedTemplate?.defaultNodes?.k ?? 'What I Know'}
          </div>
        </div>
        <EditableNode
          id="know"
          initialText={nodes['know']?.text ?? ''}
          onUpdate={handleUpdate}
          className="flex-grow h-full"
          style={{ padding: 'min(16px, 3cqmin)' }}
          placeholder="Type here..."
        />
      </div>
      <div className="border-r-2 border-slate-300 flex flex-col h-full">
        <div
          className="bg-amber-100 text-center border-b-2 border-slate-300"
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          <div
            className="font-black text-amber-800"
            style={{ fontSize: 'min(30px, 12cqmin)' }}
          >
            W
          </div>
          <div
            className="font-bold text-amber-600 uppercase"
            style={{ fontSize: 'min(14px, 5.5cqmin)' }}
          >
            {selectedTemplate?.defaultNodes?.w ?? 'What I Wonder'}
          </div>
        </div>
        <EditableNode
          id="wonder"
          initialText={nodes['wonder']?.text ?? ''}
          onUpdate={handleUpdate}
          className="flex-grow h-full"
          style={{ padding: 'min(16px, 3cqmin)' }}
          placeholder="Type here..."
        />
      </div>
      <div className="flex flex-col h-full">
        <div
          className="bg-green-100 text-center border-b-2 border-slate-300"
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          <div
            className="font-black text-green-800"
            style={{ fontSize: 'min(30px, 12cqmin)' }}
          >
            L
          </div>
          <div
            className="font-bold text-green-600 uppercase"
            style={{ fontSize: 'min(14px, 5.5cqmin)' }}
          >
            {selectedTemplate?.defaultNodes?.l ?? 'What I Learned'}
          </div>
        </div>
        <EditableNode
          id="learn"
          initialText={nodes['learn']?.text ?? ''}
          onUpdate={handleUpdate}
          className="flex-grow h-full"
          style={{ padding: 'min(16px, 3cqmin)' }}
          placeholder="Type here..."
        />
      </div>
    </div>
  );

  const renderCauseEffect = () => (
    <div
      className="flex items-center justify-center h-full gap-4"
      style={{
        backgroundColor: cellBg,
        padding: 'min(24px, 5cqmin)',
      }}
    >
      <div
        className="flex-1 border-2 border-rose-300 rounded-lg shadow-sm h-full flex flex-col"
        style={{ backgroundColor: cellBg }}
      >
        <div className="bg-rose-100 p-2 text-center rounded-t-md border-b-2 border-rose-300 font-bold text-rose-800 uppercase tracking-wider">
          Cause
        </div>
        <EditableNode
          id="cause"
          initialText={nodes['cause']?.text ?? ''}
          onUpdate={handleUpdate}
          className="flex-grow"
          style={{ padding: 'min(16px, 3cqmin)' }}
          placeholder={
            selectedTemplate?.defaultNodes?.cause1 ?? 'Why it happened...'
          }
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

      <div
        className="flex-1 border-2 border-emerald-300 rounded-lg shadow-sm h-full flex flex-col"
        style={{ backgroundColor: cellBg }}
      >
        <div className="bg-emerald-100 p-2 text-center rounded-t-md border-b-2 border-emerald-300 font-bold text-emerald-800 uppercase tracking-wider">
          Effect
        </div>
        <EditableNode
          id="effect"
          initialText={nodes['effect']?.text ?? ''}
          onUpdate={handleUpdate}
          className="flex-grow"
          style={{ padding: 'min(16px, 3cqmin)' }}
          placeholder={
            selectedTemplate?.defaultNodes?.effect ?? 'What happened...'
          }
        />
      </div>
    </div>
  );

  const renderContent = () => {
    switch (layout) {
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
