// The `window.SpartBoard` helper injected into v2 Mini App frames (docs/plans/shipped/MINI_APP_RESULTS.md D2, D3).

export const MINI_APP_HELPER_VERSION = 1;
export const MAX_RESULT_ITEMS = 200;
export const MAX_RESULT_BYTES = 20_000;

/** Host -> frame: the app's settings; frame -> host: a submit request; host -> frame: its outcome. */
export const MSG_INIT = 'SPART_MINIAPP_INIT';
export const MSG_SUBMIT = 'SPART_MINIAPP_SUBMIT';
export const MSG_SUBMIT_RESULT = 'SPART_MINIAPP_SUBMIT_RESULT';
export const MSG_LEGACY_RESULT = 'SPART_MINIAPP_RESULT';

export interface MiniAppInitPayload {
  submissionsEnabled: boolean;
  timeMultiplier?: number | 'unlimited';
  /** v2 only: null = unlimited. */
  attemptsLeft?: number | null;
}

/** Frame-side check of the result shape (D3); mirrors functions/src/miniAppGrading.ts parseMiniAppResult. */
export const RESULT_VALIDATOR_SOURCE = `function (result) {
  if (typeof result !== 'object' || result === null || Array.isArray(result))
    return 'The result must be an object.';
  var size;
  try {
    size = new TextEncoder().encode(JSON.stringify(result)).length;
  } catch (e) {
    return 'The result must be plain data.';
  }
  if (size > ${MAX_RESULT_BYTES}) return 'The result is larger than 20 KB.';
  var items = result.items === undefined ? [] : result.items;
  if (!Array.isArray(items)) return 'items must be a list.';
  if (items.length > ${MAX_RESULT_ITEMS}) return 'A result can hold at most 200 items.';
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (typeof it !== 'object' || it === null || Array.isArray(it))
      return 'Each item must be an object.';
    if (typeof it.id !== 'string' || it.id.length === 0) return 'Each item needs an id.';
    if (Object.prototype.hasOwnProperty.call(seen, it.id))
      return 'Item ' + it.id + ' appears twice.';
    seen[it.id] = true;
    if (it.correct !== undefined && typeof it.correct !== 'boolean')
      return 'Item ' + it.id + ': correct must be true or false.';
    if (it.points !== undefined && (typeof it.points !== 'number' || !isFinite(it.points) || it.points < 0))
      return 'Item ' + it.id + ': points must be a number of 0 or more.';
  }
  if (result.score !== undefined && (typeof result.score !== 'number' || !isFinite(result.score) || result.score < 0))
    return 'score must be a number of 0 or more.';
  if (result.maxScore !== undefined && (typeof result.maxScore !== 'number' || !isFinite(result.maxScore) || result.maxScore <= 0))
    return 'maxScore must be a number above 0.';
  if (result.data !== undefined && (typeof result.data !== 'object' || result.data === null || Array.isArray(result.data)))
    return 'data must be an object.';
  return null;
}`;

// Runs inside the sandboxed frame, so it is plain ES5 source.
const HELPER_SOURCE = `(function () {
  if (window.SpartBoard) return;
  var validate = ${RESULT_VALIDATOR_SOURCE};
  var init = null;
  var initCallbacks = [];
  var pending = {};
  var seq = 0;
  var busy = false;
  var hideStyle = document.createElement('style');
  hideStyle.textContent = '[data-spart-submit]{display:none !important}';
  (document.head || document.documentElement).appendChild(hideStyle);
  function syncControls() {
    var show = !!(init && init.submissionsEnabled);
    if (show && hideStyle.parentNode) hideStyle.parentNode.removeChild(hideStyle);
    if (!show && !hideStyle.parentNode)
      (document.head || document.documentElement).appendChild(hideStyle);
    var off = busy || (init && init.attemptsLeft === 0);
    var els = document.querySelectorAll('[data-spart-submit]');
    for (var i = 0; i < els.length; i++) {
      if (off) els[i].setAttribute('disabled', '');
      else els[i].removeAttribute('disabled');
    }
  }
  function failure(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
  }
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var data = event.data || {};
    if (data.type === '${MSG_INIT}') {
      init = data.payload || {};
      syncControls();
      for (var i = 0; i < initCallbacks.length; i++) {
        try { initCallbacks[i](init); } catch (e) { console.error(e); }
      }
    } else if (data.type === '${MSG_SUBMIT_RESULT}') {
      var request = pending[data.requestId];
      if (!request) return;
      delete pending[data.requestId];
      busy = false;
      if (data.ok) {
        if (init && data.result && 'attemptsLeft' in data.result)
          init.attemptsLeft = data.result.attemptsLeft;
        syncControls();
        request.resolve(data.result);
      } else {
        var code = (data.error && data.error.code) || 'failed';
        if (init && code === 'attempts-exhausted') init.attemptsLeft = 0;
        syncControls();
        request.reject(failure(code, (data.error && data.error.message) || 'The result was not saved.'));
      }
    }
  });
  window.SpartBoard = {
    version: ${MINI_APP_HELPER_VERSION},
    onInit: function (callback) {
      if (typeof callback !== 'function') return;
      initCallbacks.push(callback);
      if (init) callback(init);
    },
    submit: function (result) {
      if (!init || !init.submissionsEnabled)
        return Promise.reject(failure('submissions-off', 'This activity does not take submissions.'));
      if (init.attemptsLeft === 0)
        return Promise.reject(failure('attempts-exhausted', 'No attempts are left.'));
      if (busy)
        return Promise.reject(failure('busy', 'A submission is already being saved.'));
      var problem = validate(result);
      if (problem) return Promise.reject(failure('invalid-result', problem));
      var requestId = 'r' + ++seq;
      busy = true;
      syncControls();
      return new Promise(function (resolve, reject) {
        pending[requestId] = { resolve: resolve, reject: reject };
        window.parent.postMessage(
          { type: '${MSG_SUBMIT}', requestId: requestId, payload: JSON.parse(JSON.stringify(result)) },
          '*'
        );
      });
    }
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', syncControls);
})();`;

export const miniAppHelperSource = (): string => HELPER_SOURCE;

/** Puts the helper first in the document's head so the app's own scripts can call it. */
export function injectMiniAppHelper(html: string): string {
  return injectIntoHead(
    html,
    `<script data-spart-helper="${MINI_APP_HELPER_VERSION}">${HELPER_SOURCE}</script>`
  );
}

export const MSG_BLOCK_CONTEXT_MENU = 'SPART_MINIAPP_BLOCK_CONTEXT_MENU';

const CONTEXT_MENU_GUARD_SOURCE = `(function () {
  var blocked = false;
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || !e.data || e.data.type !== '${MSG_BLOCK_CONTEXT_MENU}') return;
    blocked = e.data.enabled === true;
  });
  document.addEventListener('contextmenu', function (e) {
    if (blocked) e.preventDefault();
  }, true);
})();`;

/** Adds the listener the parent page switches on to block the right-click menu inside the app. */
export function injectContextMenuGuard(html: string): string {
  return injectIntoHead(
    html,
    `<script data-spart-menu-guard="1">${CONTEXT_MENU_GUARD_SOURCE}</script>`
  );
}

function injectIntoHead(html: string, tag: string): string {
  const anchor =
    /<head\b[^>]*>/i.exec(html) ??
    /<html\b[^>]*>/i.exec(html) ??
    /<!doctype[^>]*>/i.exec(html);
  if (!anchor) return tag + html;
  const at = anchor.index + anchor[0].length;
  return html.slice(0, at) + tag + html.slice(at);
}
