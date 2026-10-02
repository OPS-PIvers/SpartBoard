import type {
  GuidedLearningTourBinding,
  GuidedLearningWatchPace,
} from '@/types';
import {
  stepDurationMs,
  type StepDurationInput,
} from '@/components/widgets/GuidedLearning/utils/motion';

/** Shortest pause before autopilot starts moving on a click step. */
export const AUTO_LEAD_MIN_MS = 800;
/** Time the glide and ripple take out of a click step's reading time. */
const AUTO_GLIDE_BUDGET_MS = 1500;
/** How often autopilot looks for the next step's anchor after clicking. */
export const AUTO_POLL_MS = 100;

/** Reading time for an observe step before autopilot moves on. */
export const autoObserveMs = (
  step: StepDurationInput,
  watchPace?: GuidedLearningWatchPace
): number => stepDurationMs(step, { playerV2: true, watchPace });

/** Reading time on a click step before the cursor starts to glide. */
export const autoLeadMs = (
  step: StepDurationInput,
  watchPace?: GuidedLearningWatchPace
): number =>
  Math.max(
    AUTO_LEAD_MIN_MS,
    autoObserveMs(step, watchPace) - AUTO_GLIDE_BUDGET_MS
  );

const pointer = (
  type: string,
  init: MouseEventInit & { pointerType?: string; isPrimary?: boolean }
): MouseEvent =>
  typeof PointerEvent === 'function'
    ? new PointerEvent(type, init)
    : new MouseEvent(type, init);

/** Clicks an element the way a real mouse does: pointer, mouse, focus and click events in order. */
export function dispatchAutoClick(el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  const base: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    clientX: r.x + r.width / 2,
    clientY: r.y + r.height / 2,
  };
  const ptr = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  el.dispatchEvent(pointer('pointerover', ptr));
  el.dispatchEvent(pointer('pointerdown', { ...ptr, buttons: 1 }));
  el.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
  el.focus({ preventScroll: true });
  el.dispatchEvent(pointer('pointerup', ptr));
  el.dispatchEvent(new MouseEvent('mouseup', base));
  el.dispatchEvent(new MouseEvent('click', { ...base, detail: 1 }));
}

/** Resolves true once `check` passes, or false after `timeoutMs` or an abort. */
export function waitFor(
  check: () => boolean,
  timeoutMs: number,
  signal: AbortSignal
): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (signal.aborted) return resolve(false);
      if (check()) return resolve(true);
      if (Date.now() >= deadline) return resolve(false);
      setTimeout(tick, AUTO_POLL_MS);
    };
    // Give the app a beat to respond before the first look.
    setTimeout(tick, AUTO_POLL_MS);
  });
}

/** Pause between typed characters; reduced motion types the whole value at once. */
export const AUTO_TYPE_MS = 35;
/** How long Autopilot waits for a custom listbox to show the recorded option. */
const OPTION_WAIT_MS = 1500;

const TOGGLE = '[role="switch"], [role="checkbox"], input[type="checkbox"]';
const FIELD = 'input, textarea';

type StepBinding = Pick<GuidedLearningTourBinding, 'action' | 'value'>;

const isOn = (el: Element): boolean =>
  el instanceof HTMLInputElement
    ? el.checked
    : el.getAttribute('aria-checked') === 'true';

const own = <T extends Element>(el: HTMLElement, selector: string): T | null =>
  (el.matches(selector) ? el : el.querySelector(selector)) as T | null;

const toggleIn = (el: HTMLElement) => own<HTMLElement>(el, TOGGLE);
const fieldIn = (el: HTMLElement) => {
  const f = own<HTMLInputElement | HTMLTextAreaElement>(el, FIELD);
  return f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement
    ? f
    : null;
};
const selectIn = (el: HTMLElement) => {
  const s = own<HTMLSelectElement>(el, 'select');
  return s instanceof HTMLSelectElement ? s : null;
};

const optionValue = (option: Element): string =>
  option.getAttribute('data-value') ??
  option.getAttribute('value') ??
  (option.textContent ?? '').trim();

/** Sets a value React sees: through the prototype's setter, so the tracker doesn't swallow it. */
const setNativeValue = (
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
) => {
  if (!Reflect.set(Object.getPrototypeOf(el) as object, 'value', value, el))
    el.value = value;
};

const fire = (el: Element, type: string) =>
  el.dispatchEvent(new Event(type, { bubbles: true }));

/** Whether the anchor already holds the step's recorded value; null when it can't tell. */
export function stepValueMet(
  el: HTMLElement,
  binding: StepBinding
): boolean | null {
  if (binding.value === undefined) return null;
  if (binding.action === 'toggle') {
    const toggle = toggleIn(el);
    return toggle ? isOn(toggle) === (binding.value === true) : null;
  }
  if (binding.action === 'select') {
    const select = selectIn(el);
    return select ? select.value === String(binding.value) : null;
  }
  if (binding.action === 'type') {
    const field = fieldIn(el);
    return field ? field.value === String(binding.value) : null;
  }
  return null;
}

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true }
    );
  });

async function typeInto(
  field: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  instant: boolean,
  signal: AbortSignal
) {
  field.focus({ preventScroll: true });
  setNativeValue(field, '');
  fire(field, 'input');
  if (instant) {
    setNativeValue(field, text);
    fire(field, 'input');
  } else {
    for (let i = 1; i <= text.length; i++) {
      await pause(AUTO_TYPE_MS, signal);
      if (signal.aborted || !field.isConnected) return;
      setNativeValue(field, text.slice(0, i));
      fire(field, 'input');
    }
  }
  fire(field, 'change');
  field.blur();
}

async function chooseOption(
  el: HTMLElement,
  value: string,
  signal: AbortSignal
) {
  const matches = (o: Element) =>
    optionValue(o) === value || (o.textContent ?? '').trim() === value;
  // The recorded option itself, or a combobox whose listbox opens on click.
  if (el.matches('[role="option"]')) {
    dispatchAutoClick(el);
    return;
  }
  const find = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
      matches
    ) ?? null;
  if (!find()) dispatchAutoClick(el);
  await waitFor(() => !!find(), OPTION_WAIT_MS, signal);
  const option = find();
  if (option && !signal.aborted) dispatchAutoClick(option);
}

/** Performs a step on its anchor: a click, a toggle to its recorded state, a choice, or typed text. */
export async function performStep(
  el: HTMLElement,
  binding: StepBinding,
  opts: { instant: boolean; signal: AbortSignal }
): Promise<void> {
  const { action, value } = binding;
  if (action === 'observe') return;
  if (action === 'toggle') {
    const toggle = toggleIn(el) ?? el;
    if (value === undefined || isOn(toggle) !== (value === true))
      dispatchAutoClick(toggle);
    return;
  }
  if (action === 'select' && value !== undefined) {
    const select = selectIn(el);
    if (!select) return chooseOption(el, String(value), opts.signal);
    if (select.value === String(value)) return;
    select.focus({ preventScroll: true });
    setNativeValue(select, String(value));
    fire(select, 'input');
    fire(select, 'change');
    return;
  }
  if (action === 'type') {
    const field = fieldIn(el);
    if (!field) return;
    return typeInto(field, String(value ?? ''), opts.instant, opts.signal);
  }
  dispatchAutoClick(el);
}

/** A select or type step with no recorded value has nothing for Autopilot to enter. */
export const canPerform = (binding: StepBinding): boolean =>
  binding.action === 'select' || binding.action === 'type'
    ? binding.value !== undefined && String(binding.value) !== ''
    : true;
