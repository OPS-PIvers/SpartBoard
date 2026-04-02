import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetComponentProps,
  ConceptWebConfig,
  GlobalFontFamily,
  ConceptNode,
  TextConfig,
} from '@/types';
import { Type, RefreshCw } from 'lucide-react';

export const ConceptWebSettings: React.FC<WidgetComponentProps> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard, addToast } = useDashboard();
  const config = widget.config as ConceptWebConfig;

  const handleClear = () => {
    updateWidget(widget.id, {
      config: { ...config, nodes: [], edges: [] },
    });
  };

  const importFromTextWidget = () => {
    const textWidgets =
      activeDashboard?.widgets.filter((w) => w.type === 'text') ?? [];
    if (textWidgets.length === 0) {
      addToast('No Text widget found!', 'error');
      return;
    }

    let allLines: string[] = [];
    for (const textWidget of textWidgets) {
      const textConfig = textWidget.config as TextConfig;
      const rawContent = textConfig.content || '';

      // First, inject spaces or newlines around block elements and br tags
      // before parsing to avoid squashing text together (e.g. <p>A</p><p>B</p> -> AB)
      const preProcessed = rawContent
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, '\n');

      const parsedDocument = new DOMParser().parseFromString(
        preProcessed,
        'text/html'
      );
      const body = parsedDocument.body;

      const plainText = (body.innerText ?? body.textContent ?? '').replace(
        /\r\n/g,
        '\n'
      );

      const lines = plainText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      allLines = [...allLines, ...lines];
    }

    if (allLines.length > 0) {
      const newNodes: ConceptNode[] = allLines.map((line, index) => {
        // Simple spiral/grid placement logic for generated nodes
        const defaultWidth = config.defaultNodeWidth ?? 15;
        const defaultHeight = config.defaultNodeHeight ?? 15;
        const cols = 4;
        const row = Math.floor(index / cols);
        const col = index % cols;
        const xPos = 10 + col * (defaultWidth + 5);
        const yPos = 10 + row * (defaultHeight + 5);

        // Wrap around if they go off screen
        const wrappedX = xPos > 85 ? (xPos % 85) + 5 : xPos;
        const wrappedY = yPos > 85 ? (yPos % 85) + 5 : yPos;

        return {
          id: crypto.randomUUID(),
          text: line,
          x: wrappedX,
          y: wrappedY,
          width: defaultWidth,
          height: defaultHeight,
        };
      });

      updateWidget(widget.id, {
        config: { ...config, nodes: [...(config.nodes || []), ...newNodes] },
      });
      addToast(
        `Imported ${newNodes.length} nodes from Text widget!`,
        'success'
      );
    } else {
      addToast('All Text widgets are empty or have no usable text.', 'info');
    }
  };

  const defaultWidth = config.defaultNodeWidth ?? 15;
  const defaultHeight = config.defaultNodeHeight ?? 15;

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateWidget(widget.id, {
      config: { ...config, defaultNodeWidth: parseInt(e.target.value, 10) },
    });
  };

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateWidget(widget.id, {
      config: { ...config, defaultNodeHeight: parseInt(e.target.value, 10) },
    });
  };

  return (
    <div className="space-y-4 p-4 text-slate-800">
      <div className="space-y-2">
        <label
          htmlFor="defaultNodeWidth"
          className="block text-sm font-medium mb-1"
        >
          Default Node Width ({defaultWidth}%)
        </label>
        <input
          id="defaultNodeWidth"
          type="range"
          min={5}
          max={50}
          value={defaultWidth}
          onChange={handleWidthChange}
          className="w-full"
        />

        <label
          htmlFor="defaultNodeHeight"
          className="block text-sm font-medium mb-1"
        >
          Default Node Height ({defaultHeight}%)
        </label>
        <input
          id="defaultNodeHeight"
          type="range"
          min={5}
          max={50}
          value={defaultHeight}
          onChange={handleHeightChange}
          className="w-full"
        />

        <div className="mt-4 border border-slate-200 rounded-xl p-4 bg-slate-50 flex items-center justify-center min-h-[150px] relative overflow-hidden">
          {/* We simulate the visual result using container queries within the preview bounds to ensure the relative font sizes scale identically to the widget's render behavior. */}
          <div
            className="absolute shadow-sm border border-slate-300 flex flex-col items-center justify-center p-2 rounded-lg"
            style={{
              width: `${defaultWidth}%`,
              height: `${defaultHeight}%`,
              backgroundColor: '#fdf0d5',
              containerType: 'size',
            }}
          >
            <textarea
              className="w-full h-full text-center bg-transparent border-none resize-none focus:outline-none focus:ring-1 focus:ring-slate-400 rounded-sm font-medium text-slate-800 leading-tight"
              style={{ fontSize: '15cqmin' }}
              value="Idea..."
              readOnly
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          These dimensions apply to new nodes. You can still resize nodes
          individually!
        </p>
      </div>

      <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-900">
          <Type className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-wider">
            Import from Text Widget
          </span>
        </div>
        <button
          onClick={importFromTextWidget}
          aria-label="Sync Text"
          className="bg-white text-emerald-600 px-3 py-1.5 rounded-lg text-xxs font-bold uppercase shadow-sm border border-emerald-100 hover:bg-emerald-50 transition-colors flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Sync
        </button>
      </div>

      <div className="border-t border-slate-200 pt-4">
        <button
          onClick={handleClear}
          className="w-full py-2 px-4 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 transition-colors font-medium"
        >
          Clear All Nodes & Edges
        </button>
      </div>
    </div>
  );
};

export const ConceptWebAppearanceSettings: React.FC<WidgetComponentProps> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as ConceptWebConfig;

  const handleFontChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    const fontFamily =
      selected === 'global' ? undefined : (selected as GlobalFontFamily);

    updateWidget(widget.id, {
      config: { ...config, fontFamily },
    });
  };

  return (
    <div className="space-y-4 p-4 text-slate-800">
      <div>
        <label className="block text-sm font-medium mb-1">Font Family</label>
        <select
          value={config.fontFamily ?? 'global'}
          onChange={handleFontChange}
          className="w-full rounded border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        >
          <option value="global">Global (Dashboard default)</option>
          <option value="sans">Sans Serif</option>
          <option value="serif">Serif</option>
          <option value="mono">Monospace</option>
          <option value="comic">Comic</option>
          <option value="handwritten">Handwritten</option>
        </select>
      </div>
    </div>
  );
};
