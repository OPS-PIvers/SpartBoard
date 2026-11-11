// Entry for the connector's preview card: connects to Claude and redraws on each tool result.
/* eslint-disable react-refresh/only-export-components -- an entry file, never hot-swapped as a module */
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  App,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps/app-with-deps';
import '@/index.css';
import '@/i18n';
import { DialogProvider } from '@/context/DialogContext';
import type { CardActions } from './cardActions';
import { QuizPreviewCard } from './QuizPreviewCard';
import { RubricCard } from './RubricCard';
import { createSupersession } from './supersede';
import { isPreviewView, type PreviewView } from './types';

type CardState =
  | { kind: 'loading' }
  | { kind: 'message'; text: string }
  | { kind: 'view'; view: PreviewView };

// The app's global CSS pins html and body to the frame, so the card reports its own height.
const app = new App(
  { name: 'SpartBoard preview', version: '2.0.0' },
  { availableDisplayModes: ['inline', 'fullscreen'] },
  { autoResize: false }
);
let connected = false;
let lastHeight = 0;
function reportHeight(el: HTMLElement): void {
  const height = Math.ceil(el.getBoundingClientRect().height);
  if (!connected || height === lastHeight) return;
  lastHeight = height;
  void app
    .sendSizeChanged({ width: Math.ceil(window.innerWidth), height })
    .catch(() => undefined);
}
let sizedEl: HTMLElement | null = null;

const listeners = new Set<() => void>();
let state: CardState = { kind: 'loading' };
let fullscreen = false;
let superseded = false;
const emit = () => listeners.forEach((fn) => fn());

const supersession = createSupersession(() => {
  superseded = true;
  emit();
});

const actions: CardActions = {
  ask: async (text) => {
    if (superseded) return false;
    try {
      const res = await app.sendMessage({
        role: 'user',
        content: [{ type: 'text', text }],
      });
      return !res.isError;
    } catch {
      return false;
    }
  },
  expand: () => {
    void app
      .requestDisplayMode({ mode: 'fullscreen' })
      .then((r) => {
        fullscreen = r.mode === 'fullscreen';
        emit();
      })
      .catch(() => undefined);
  },
  open: (url) => {
    void app.openLink({ url }).catch(() => undefined);
  },
};

function applyContext(ctx: McpUiHostContext | undefined): void {
  if (!ctx) return;
  if (ctx.displayMode) {
    const next = ctx.displayMode === 'fullscreen';
    if (next !== fullscreen) {
      fullscreen = next;
      emit();
    }
  }
}

app.ontoolinput = () => {
  if (state.kind === 'loading') emit();
};
app.ontoolresult = (result) => {
  const data = result.structuredContent;
  if (result.isError || !isPreviewView(data)) {
    if (state.kind !== 'view') {
      state = {
        kind: 'message',
        text: result.isError
          ? 'Claude could not load this from SpartBoard.'
          : 'Nothing to preview.',
      };
      emit();
    }
    return;
  }
  state = { kind: 'view', view: data };
  supersession.announce(
    data.view === 'quiz' ? `quiz:${data.id}` : `rubric:${data.rubric_id}`,
    data.updated_at
  );
  emit();
};
app.ontoolcancelled = () => {
  if (state.kind === 'loading') {
    state = { kind: 'message', text: 'Cancelled.' };
    emit();
  }
};
app.onhostcontextchanged = (ctx) =>
  applyContext({ ...app.getHostContext(), ...ctx });

const Sized: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    sizedEl = el;
    const observer = new ResizeObserver(() => reportHeight(el));
    observer.observe(el);
    reportHeight(el);
    return () => {
      observer.disconnect();
      sizedEl = null;
    };
  }, []);
  return <div ref={ref}>{children}</div>;
};

const Card: React.FC = () => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  if (state.kind !== 'view') {
    return (
      <p className="p-4 font-sans text-sm text-slate-500">
        {state.kind === 'loading' ? 'Loading the preview…' : state.text}
      </p>
    );
  }
  const { view } = state;
  return view.view === 'quiz' ? (
    <QuizPreviewCard
      view={view}
      actions={actions}
      fullscreen={fullscreen}
      superseded={superseded}
    />
  ) : (
    <RubricCard
      view={view}
      actions={actions}
      openUrl={view.open_url}
      superseded={superseded}
    />
  );
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <DialogProvider>
      <Sized>
        <Card />
      </Sized>
    </DialogProvider>
  );
}
void app.connect().then(() => {
  connected = true;
  applyContext(app.getHostContext());
  if (sizedEl) reportHeight(sizedEl);
});
