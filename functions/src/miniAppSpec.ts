// One Mini App spec for every creation path (docs/plans/shipped/MINI_APP_RESULTS.md D14).
import type { MiniAppQuestionType } from './miniAppGrading';

export const QUESTION_TYPE_HELP: Record<MiniAppQuestionType, string> = {
  mc: 'one choice; key `correct` is the choice text',
  multi: 'several choices, all-or-nothing; key `correct` is a list',
  tf: 'true or false; key `correct` is true or false',
  numeric: 'a number; key `correct` is the number, optional `tolerance`',
  short:
    'typed text, case and spacing ignored; key `accepted` lists every accepted answer',
  order: 'a sequence; key `correct` is the list in order',
  other: 'the app scores it by sending `correct` and `points` itself; no key',
};

const CLASSROOM_RULES = `## Classroom rules
- One self-contained HTML file: inline CSS and JS, no server, no logins. It runs in a sandboxed frame on a classroom board and on student devices, so it must be readable from across a room and work by touch.
- Never ask for a student's name or email; SpartBoard knows who submitted, and name or email fields are dropped.
- The app is anything a teacher wants: a game, a simulation, a model with sliders, a quiz. Not every app collects results.

## Build it in the chat first
- Write the whole app as an HTML artifact in the chat so the teacher can try it, and change it there until they are happy. Save only when they say to.
- Put \`preview_script\` from get_mini_app_spec first inside \`<head>\`. Outside SpartBoard it shows the Submit button and stands in for SpartBoard, so the teacher can try submitting; it shows what would be sent and saves nothing.
- Save the HTML exactly as the teacher tried it, preview script included. SpartBoard removes the script when it saves the app; add it back after get_mini_app before showing an edit in the chat.`;

/** For teachers without Mini App results: the original Submit protocol. */
export const MINI_APP_BASIC_SPEC = `# SpartBoard Mini App spec

${CLASSROOM_RULES}

## Optional Submit button
An app can offer a Submit button that sends whatever the activity produced to the teacher.
- Give the button the attribute \`data-spart-submit\`. Hide it until SpartBoard says submissions are on:
\`\`\`js
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SPART_MINIAPP_INIT') {
    const on = e.data.payload && e.data.payload.submissionsEnabled === true;
    document.querySelectorAll('[data-spart-submit]').forEach((b) => { b.style.display = on ? '' : 'none'; });
  }
});
\`\`\`
- Post the result once per click, as a plain object: \`window.parent.postMessage({ type: 'SPART_MINIAPP_RESULT', payload: { ... } }, '*')\`.
- Timed apps read \`payload.timeMultiplier\` from the same message: a number multiplies the time, 'unlimited' means no time limit. Apply it silently and never show it.
- Leave \`collects_results\`, \`manifest\` and \`answer_key\` out; results scoring is not turned on for this teacher.`;

/** For teachers with Mini App results on (flag and Mini App submissions). */
export const MINI_APP_RESULTS_SPEC = `# SpartBoard Mini App spec

${CLASSROOM_RULES}

## Does the app collect results?
Set \`collects_results\` to true only when the teacher wants to see how students did. Timers, randomizers, simulations meant for exploring and display tools leave it false and need no Submit button. An app that collects results can still be a simulation or a game: it sends whatever it measured.

## The SpartBoard helper
SpartBoard adds \`window.SpartBoard\` to the app before it runs for students. Check \`window.SpartBoard\` exists before calling it, so the app still works when shown on a board.
- \`SpartBoard.onInit((settings) => ...)\`: \`settings.submissionsEnabled\`, \`settings.attemptsLeft\` (null means unlimited) and \`settings.timeMultiplier\` (a number to multiply any time limit by, or 'unlimited'). Apply the time multiplier silently and never show it.
- \`SpartBoard.submit(result)\` returns a promise. It resolves with \`{ attempt, attemptsLeft, score?, maxScore?, items?: [{ id, correct }] }\` once the result is saved; \`score\` and \`items\` are left out when the teacher hides correct answers. It rejects with an error whose \`code\` is \`attempts-exhausted\`, \`submissions-off\`, \`invalid-result\`, \`closed\` or \`failed\`; show a short message and let the student try again where that makes sense.
- Put \`data-spart-submit\` on the Submit button. SpartBoard shows it only when submissions are on and disables it while saving and when no attempts are left. Call \`submit\` from its click handler, once per click, never on every change.

## Result shape
\`\`\`js
{
  items: [{ id: 'q1', answer: '3/4' }],   // one per question, ids from the manifest
  score: 7, maxScore: 10,                 // optional: the app's own score, used only when SpartBoard can't grade
  data: { trials: 4 }                     // optional: anything else worth keeping
}
\`\`\`
At most 200 items and 20 KB. An item may add \`correct\` (true or false) and \`points\` when the app scores that question itself.

## Manifest and answer key
- \`manifest.questions\`: \`[{ id, type, prompt, points? }]\`. Ids are short and unique (q1, q2). Points default to 1.
- Question types: ${Object.entries(QUESTION_TYPE_HELP)
  .map(([type, help]) => `\`${type}\` (${help})`)
  .join('; ')}.
- \`answer_key.questions\`: \`{ q1: { correct: '3/4' }, q2: { correct: 15, tolerance: 0.5 }, q3: { accepted: ['photosynthesis'] } }\`. SpartBoard grades with it on the server.
- The key is saved apart from the app and students never see it. Never put correct answers in the HTML, and never check answers in the app's code for questions that have a key.
- A simulation or model with no right answers sends its measurements as \`data\` or as \`other\` items, or its own \`score\`.

## Worked example
\`\`\`html
<!doctype html>
<html><head><style>
body{font-family:system-ui,sans-serif;padding:24px;font-size:20px}
button{font:inherit;padding:12px 20px;border:0;border-radius:10px;background:#2d3f89;color:#fff}
</style></head><body>
<p>1. What is 3/4 of 20? <input id="a1" inputmode="decimal"></p>
<p>2. True or false: 2/4 equals 1/2.
  <select id="a2"><option></option><option>true</option><option>false</option></select></p>
<button data-spart-submit id="send">Submit</button>
<p id="msg"></p>
<script>
document.getElementById('send').addEventListener('click', () => {
  if (!window.SpartBoard) return;
  SpartBoard.submit({ items: [
    { id: 'q1', answer: Number(a1.value) },
    { id: 'q2', answer: a2.value === 'true' }
  ]}).then((r) => {
    msg.textContent = r.score === undefined ? 'Turned in.' : 'Score: ' + r.score + '/' + r.maxScore;
  }).catch((e) => { msg.textContent = e.code === 'attempts-exhausted' ? 'No attempts left.' : 'Not saved. Try again.'; });
});
</script></body></html>
\`\`\`
Manifest: \`{ questions: [{ id: 'q1', type: 'numeric', prompt: 'What is 3/4 of 20?' }, { id: 'q2', type: 'tf', prompt: '2/4 equals 1/2' }] }\`
Answer key: \`{ questions: { q1: { correct: 15 }, q2: { correct: true } } }\``;

/** The block copied into the claude-skills repo's references/mini-apps.md. */
export const skillReferenceMarkdown = (): string =>
  `<!-- Generated from SpartBoard functions/src/miniAppSpec.ts; edit it there. -->\n\n${MINI_APP_RESULTS_SPEC}\n`;
