import { afterEach, describe, expect, it, vi } from 'vitest';
import { MINI_APP_PREVIEW_SCRIPT } from '@/functions/src/miniAppPreview';

const source = /<script[^>]*>([\s\S]*)<\/script>/.exec(
  MINI_APP_PREVIEW_SCRIPT
)?.[1];

type Helper = {
  preview?: boolean;
  onInit: (cb: (s: unknown) => void) => void;
  submit: (r: unknown) => Promise<unknown>;
};
const helper = () => (window as unknown as { SpartBoard?: Helper }).SpartBoard;

function runPreview() {
  const script = document.createElement('script');
  script.textContent = source ?? '';
  document.head.appendChild(script);
  script.remove();
}

const note = () => document.getElementById('spart-preview-note')?.textContent;

afterEach(() => {
  delete (window as unknown as { SpartBoard?: Helper }).SpartBoard;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('mini-app chat preview script', () => {
  it('stands in for SpartBoard and says what a submit would send', async () => {
    runPreview();
    expect(helper()?.preview).toBe(true);
    const settings = await new Promise((resolve) => helper()?.onInit(resolve));
    expect(settings).toMatchObject({ submissionsEnabled: true });
    await expect(
      helper()?.submit({ items: [{ id: 'q1', answer: 3 }] })
    ).resolves.toMatchObject({ attempt: 1 });
    expect(note()).toBe(
      'Preview only. In SpartBoard this sends 1 answer to be graded.'
    );
  });

  it('rejects a result SpartBoard would refuse', async () => {
    runPreview();
    await expect(
      helper()?.submit({ items: [{ id: 'q1' }, { id: 'q1' }] })
    ).rejects.toMatchObject({ code: 'invalid-result' });
    expect(note()).toMatch(/^Preview found a problem: Item q1 appears twice/);
  });

  it('notes a basic Submit click that sends nothing through the helper', () => {
    vi.useFakeTimers();
    runPreview();
    document.body.innerHTML = '<button data-spart-submit>Submit</button>';
    document.querySelector('button')?.click();
    vi.runAllTimers();
    expect(note()).toMatch(/sends the student's work to you/);
  });

  it('leaves the real SpartBoard helper alone', () => {
    const real = { onInit: vi.fn(), submit: vi.fn() };
    (window as unknown as { SpartBoard?: unknown }).SpartBoard = real;
    runPreview();
    expect(helper()).toBe(real);
  });
});
