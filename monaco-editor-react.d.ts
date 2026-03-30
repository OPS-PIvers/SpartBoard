declare module '@monaco-editor/react' {
  import type { ComponentType } from 'react';

  interface MonacoEditorOptions {
    minimap?: { enabled?: boolean };
    wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
    lineNumbers?: 'off' | 'on' | 'relative' | 'interval';
    fontSize?: number;
    scrollBeyondLastLine?: boolean;
    automaticLayout?: boolean;
  }

  interface MonacoEditorProps {
    height?: string | number;
    language?: string;
    theme?: string;
    value?: string;
    onChange?: (value: string | undefined) => void;
    options?: MonacoEditorOptions;
  }

  const Editor: ComponentType<MonacoEditorProps>;
  export default Editor;
}
