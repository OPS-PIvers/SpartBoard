// DEV-only: the Mini App editor with the answer key panel and Try as student, for /assign-stepper-dev mockups.
import React from 'react';
import { MiniAppEditorModal } from '@/components/widgets/MiniApp/components/MiniAppEditorModal';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import type { MiniAppItem } from '@/types';

const HTML = `<!doctype html>
<html><head><style>
body{font-family:Lexend,system-ui,sans-serif;background:#f8fafc;color:#1e293b;padding:24px}
.q{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px}
input{font:inherit;padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px}
button{font:inherit;padding:10px 18px;border:0;border-radius:10px;background:#2d3f89;color:#fff;font-weight:600}
#msg{margin-top:12px;font-weight:600}
</style></head><body>
<h2>Fraction Pizza</h2>
<div class="q">1. Which fraction is larger, 2/3 or 3/4? <input id="a1" value="3/4"></div>
<div class="q">2. What is 3/4 of 20? <input id="a2" value="12"></div>
<div class="q">3. True or false: 2/4 equals 1/2. <input id="a3" value="true"></div>
<button data-spart-submit onclick="send()">Submit</button>
<div id="msg"></div>
<script>
function send(){
  SpartBoard.submit({ items: [
    { id: 'q1', answer: a1.value },
    { id: 'q2', answer: Number(a2.value) },
    { id: 'q3', answer: a3.value }
  ]}).then(function(r){ msg.textContent = 'Score: ' + r.score + '/' + r.maxScore; });
}
</script></body></html>`;

const APP: MiniAppItem = {
  id: 'dev-fraction-pizza',
  title: 'Fraction Pizza',
  html: HTML,
  createdAt: 0,
  collectsResults: true,
  manifest: {
    questions: [
      { id: 'q1', type: 'mc', prompt: 'Which fraction is larger, 2/3 or 3/4?' },
      { id: 'q2', type: 'numeric', prompt: 'What is 3/4 of 20?' },
      { id: 'q3', type: 'tf', prompt: '2/4 equals 1/2' },
    ],
  },
};

const dashboard = {
  addToast: () => undefined,
  activeDashboard: null,
} as unknown as DashboardContextValue;

const Preview: React.FC = () => (
  <DashboardContext.Provider value={dashboard}>
    <MiniAppEditorModal
      isOpen
      app={APP}
      resultsOn
      onClose={() => undefined}
      onSave={() => Promise.resolve()}
    />
  </DashboardContext.Provider>
);

const MiniAppEditorDev = {
  title: 'Mini App editor',
  render: Preview,
};

export default MiniAppEditorDev;
