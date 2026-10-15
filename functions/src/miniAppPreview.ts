// Lets a mini-app built in a Claude chat be tried there before it is saved; never stored with the app.

const PREVIEW_ATTR = 'data-spart-preview';

// Plain ES5 that stands in for SpartBoard's helper outside SpartBoard; inert in SpartBoard's srcdoc frames.
export const PREVIEW_SOURCE = `(function () {
  if (window.SpartBoard || location.href === 'about:srcdoc') return;
  var sent = false;
  var attempt = 0;
  var settings = { submissionsEnabled: true, attemptsLeft: null, timeMultiplier: 1 };
  function note(text) {
    var el = document.getElementById('spart-preview-note');
    if (!el) {
      el = document.createElement('div');
      el.id = 'spart-preview-note';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;padding:10px 14px;border-radius:8px;background:#1e293b;color:#fff;font:16px/1.4 system-ui,sans-serif';
      document.body.appendChild(el);
    }
    el.textContent = text;
  }
  function failure(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
  }
  function check(result) {
    if (typeof result !== 'object' || result === null || Array.isArray(result)) return 'The result must be an object.';
    var items = result.items === undefined ? [] : result.items;
    if (!Array.isArray(items)) return 'items must be a list.';
    if (items.length > 200) return 'A result can hold at most 200 items.';
    if (JSON.stringify(result).length > 20000) return 'The result is larger than 20 KB.';
    var seen = {};
    for (var i = 0; i < items.length; i++) {
      var id = items[i] && items[i].id;
      if (typeof id !== 'string' || !id) return 'Each item needs an id.';
      if (seen[id]) return 'Item ' + id + ' appears twice.';
      seen[id] = true;
    }
    return null;
  }
  window.SpartBoard = {
    version: 1,
    preview: true,
    onInit: function (callback) {
      if (typeof callback === 'function') setTimeout(function () { callback(settings); }, 0);
    },
    submit: function (result) {
      sent = true;
      var problem = check(result);
      if (problem) {
        note('Preview found a problem: ' + problem);
        return Promise.reject(failure('invalid-result', problem));
      }
      attempt += 1;
      var count = result.items ? result.items.length : 0;
      note('Preview only. In SpartBoard this sends ' + count + (count === 1 ? ' answer' : ' answers') + ' to be graded.');
      return Promise.resolve({ attempt: attempt, attemptsLeft: null });
    }
  };
  document.addEventListener('click', function (e) {
    var target = e.target && e.target.closest ? e.target.closest('[data-spart-submit]') : null;
    if (!target) return;
    sent = false;
    setTimeout(function () {
      if (!sent) note("Preview only. In SpartBoard this sends the student's work to you.");
    }, 0);
  }, true);
  window.addEventListener('load', function () {
    window.postMessage({ type: 'SPART_MINIAPP_INIT', payload: { submissionsEnabled: true, timeMultiplier: 1 } }, '*');
  });
})();`;

export const MINI_APP_PREVIEW_SCRIPT = `<script ${PREVIEW_ATTR}>${PREVIEW_SOURCE}</script>`;

const PREVIEW_TAG = new RegExp(
  `<script\\b[^>]*\\b${PREVIEW_ATTR}\\b[^>]*>[\\s\\S]*?</script>\\s*`,
  'gi'
);

/** Removes the chat preview script so only the app itself is saved. */
export const stripMiniAppPreview = (html: string): string =>
  html.replace(PREVIEW_TAG, '');
