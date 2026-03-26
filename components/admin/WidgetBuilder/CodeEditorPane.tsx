import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { GeminiPanel } from './GeminiPanel';
import { PreviewPane } from './PreviewPane';

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
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
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

export const CodeEditorPane: React.FC<CodeEditorPaneProps> = ({
  code,
  onChange,
}) => {
  // Debounced preview content — only updates 500ms after typing stops
  const [previewContent, setPreviewContent] = useState(code);
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
  };

  return (
    <div className="flex h-full gap-2">
      {/* Left: Monaco Editor — 60% */}
      <div className="flex flex-col" style={{ flex: '0 0 60%' }}>
        <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-t-lg border-b-0 flex items-center">
          <span className="text-xs font-mono text-slate-400">editor.html</span>
        </div>
        <div className="flex-1 rounded-b-lg overflow-hidden border border-slate-700 border-t-0">
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
      </div>

      {/* Right: AI panel + Preview — 40%, stacked vertically */}
      <div className="flex flex-col gap-2" style={{ flex: '0 0 40%' }}>
        {/* Top: GeminiPanel */}
        <div style={{ flex: '0 0 45%' }} className="min-h-0">
          <GeminiPanel onGenerate={handleGenerate} currentCode={code} />
        </div>
        {/* Bottom: PreviewPane */}
        <div style={{ flex: '1 1 0%' }} className="min-h-0">
          <PreviewPane content={previewContent} mode="code" />
        </div>
      </div>
    </div>
  );
};
