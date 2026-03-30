import React, { useState, useEffect, useRef, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { GeminiPanel } from './GeminiPanel';
import { RefreshCw } from 'lucide-react';

export const INITIAL_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #1e293b;
    color: #e2e8f0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* Your styles here */
</style>
</head>
<body>
  <!-- Your widget content here -->
  <div class="widget">
    <h1>My Widget</h1>
  </div>

  <script>
    // Your widget logic here
  </script>
</body>
</html>`;

interface CodeEditorPaneProps {
  code: string;
  onChange: (code: string) => void;
}

function constrainPreviewContent(content: string): string {
  const guardStyle = `\n<style>html,body{width:100%;height:100%;overflow:auto;}body{max-width:100vw;max-height:100vh;}</style>\n`;
  const closingHeadTagRegex = /<\/head\s*>/i;
  if (closingHeadTagRegex.test(content)) {
    return content.replace(closingHeadTagRegex, `${guardStyle}$&`);
  }
  const doctypeMatch = content.match(/^\s*<!doctype html[^>]*>/i);
  if (doctypeMatch) {
    const doctype = doctypeMatch[0];
    const restOfContent = content.slice(doctype.length);
    return `${doctype}${guardStyle}${restOfContent}`;
  }
  return `${guardStyle}${content}`;
}

export const CodeEditorPane: React.FC<CodeEditorPaneProps> = ({
  code,
  onChange,
}) => {
  const [previewContent, setPreviewContent] = useState(code);
  const [previewWidth, setPreviewWidth] = useState(420);
  const [previewHeight, setPreviewHeight] = useState(280);
  const [previewKey, setPreviewKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewContent(code);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code]);

  const handleEditorChange = (value: string | undefined) => {
    onChange(value ?? '');
  };

  const handleGenerate = (generatedCode: string) => {
    onChange(generatedCode);
    setPreviewContent(generatedCode);
    setPreviewKey((k) => k + 1);
  };

  const constrainedDoc = useMemo(
    () => constrainPreviewContent(previewContent),
    [previewContent]
  );

  return (
    <div className="flex h-full gap-3">
      <div className="flex flex-col min-w-0" style={{ flex: '0 0 50%' }}>
        <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-t-lg border-b-0 flex items-center">
          <span className="text-xs font-mono text-slate-400">editor.html</span>
        </div>
        <div className="flex-1 min-h-0 rounded-b-lg overflow-hidden border border-slate-700 border-t-0">
          <Editor
            height="100%"
            language="html"
            theme="vs-dark"
            value={code}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              wordWrap: 'on',
              lineNumbers: 'on',
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>
        <div className="mt-3 h-60 min-h-0">
          <GeminiPanel onGenerate={handleGenerate} currentCode={code} />
        </div>
      </div>

      <div className="flex flex-col min-w-0" style={{ flex: '0 0 50%' }}>
        <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-t-lg border-b-0 flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400">Preview</span>
          <button
            onClick={() => setPreviewKey((k) => k + 1)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            title="Refresh preview"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        <div className="border border-slate-700 border-t-0 rounded-b-lg p-3 flex-1 min-h-0 bg-slate-900 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 flex-shrink-0">
            <label className="text-xs text-slate-400">
              Width: {previewWidth}px
              <input
                className="w-full mt-1"
                type="range"
                min={220}
                max={900}
                step={10}
                value={previewWidth}
                onChange={(e) => setPreviewWidth(Number(e.target.value))}
              />
            </label>
            <label className="text-xs text-slate-400">
              Height: {previewHeight}px
              <input
                className="w-full mt-1"
                type="range"
                min={160}
                max={700}
                step={10}
                value={previewHeight}
                onChange={(e) => setPreviewHeight(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="flex-1 min-h-0 rounded-lg border border-slate-700 bg-slate-950 p-4 overflow-auto flex items-start justify-center">
            <div
              className="rounded-lg border border-slate-600 shadow-2xl overflow-hidden bg-white"
              style={{
                width: previewWidth,
                height: previewHeight,
                maxWidth: '100%',
              }}
            >
              <iframe
                key={previewKey}
                srcDoc={constrainedDoc}
                className="w-full h-full border-none"
                sandbox="allow-scripts allow-forms allow-modals"
                title="Widget preview"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
