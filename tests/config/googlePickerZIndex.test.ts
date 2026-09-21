import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';
import { Z_INDEX } from '@/config/zIndex';

// The Google Picker mounts on <body> at its own z-index, so any modal layer
// raised above it strands the picker behind the modal's click-blocking backdrop.
describe('Google Picker stacking', () => {
  const pickerLayers = ['googlePicker', 'googlePickerBackdrop'] as const;
  // Layers allowed above the picker: nothing that can host a picker lives here.
  const allowedAbove = ['critical', 'cursor'] as const;

  it('sits above every layer that can open it', () => {
    const entries = Object.entries(Z_INDEX).filter(
      ([name]) =>
        !pickerLayers.includes(name as (typeof pickerLayers)[number]) &&
        !allowedAbove.includes(name as (typeof allowedAbove)[number])
    );
    const tooHigh = entries.filter(
      ([, value]) => value >= Z_INDEX.googlePickerBackdrop
    );
    expect(tooHigh).toEqual([]);
  });

  it('keeps the picker dialog above its own backdrop', () => {
    expect(Z_INDEX.googlePicker).toBeGreaterThan(Z_INDEX.googlePickerBackdrop);
    expect(Z_INDEX.googlePickerBackdrop).toBeGreaterThan(Z_INDEX.dialog);
  });

  it('stays below the critical layer', () => {
    expect(Z_INDEX.googlePicker).toBeLessThan(Z_INDEX.critical);
  });

  it('is generated from the registry, not hardcoded in index.css', () => {
    const config = readFileSync(
      resolve(__dirname, '../../tailwind.config.js'),
      'utf8'
    );
    expect(config).toContain('.picker-dialog');
    expect(config).toContain('Z_INDEX.googlePicker');

    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).not.toContain('picker-dialog');
  });
});
