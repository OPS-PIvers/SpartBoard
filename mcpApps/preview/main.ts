// Entry for the connector's preview card: connects to Claude and redraws on each tool result.
import {
  App,
  applyDocumentTheme,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps/app-with-deps';
import { renderMessage, renderPreview } from './render';
import { isPreviewView, type PreviewView } from './types';
import { createSupersession } from './supersede';

const root = document.getElementById('root') as HTMLElement;
const app = new App(
  { name: 'SpartBoard preview', version: '1.0.0' },
  { availableDisplayModes: ['inline', 'fullscreen'] }
);

let current: PreviewView | null = null;
let fullscreen = false;
let superseded = false;

function draw(): void {
  if (!current) return;
  renderPreview(
    root,
    current,
    {
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
      focus: (text) => {
        if (superseded) return;
        void app
          .updateModelContext({ content: [{ type: 'text', text }] })
          .catch(() => undefined);
      },
      expand: () => {
        void app
          .requestDisplayMode({ mode: 'fullscreen' })
          .then((r) => {
            fullscreen = r.mode === 'fullscreen';
            draw();
          })
          .catch(() => undefined);
      },
      open: (url) => {
        void app.openLink({ url }).catch(() => undefined);
      },
    },
    { compact: !fullscreen, superseded }
  );
}

const supersession = createSupersession(() => {
  superseded = true;
  draw();
});

function applyContext(ctx: McpUiHostContext | undefined): void {
  if (!ctx) return;
  // SpartBoard's own colours and type; only light or dark follows the host.
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.displayMode) {
    const next = ctx.displayMode === 'fullscreen';
    if (next !== fullscreen) {
      fullscreen = next;
      draw();
    }
  }
  const insets = ctx.safeAreaInsets;
  if (insets) {
    document.body.style.padding = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`;
  }
}

app.ontoolinput = () => {
  if (!current) renderMessage(root, 'Loading the preview…');
};

app.ontoolresult = (result) => {
  if (result.isError) {
    if (!current)
      renderMessage(root, 'Claude could not load this from SpartBoard.');
    return;
  }
  const data = result.structuredContent;
  if (!isPreviewView(data)) {
    renderMessage(root, 'Nothing to preview.');
    return;
  }
  current = data;
  supersession.announce(
    data.view === 'quiz' ? `quiz:${data.id}` : `rubric:${data.rubric_id}`,
    data.updated_at
  );
  draw();
};

app.ontoolcancelled = () => {
  if (!current) renderMessage(root, 'Cancelled.');
};

app.onhostcontextchanged = (ctx) =>
  applyContext({ ...app.getHostContext(), ...ctx });

void app.connect().then(() => applyContext(app.getHostContext()));
