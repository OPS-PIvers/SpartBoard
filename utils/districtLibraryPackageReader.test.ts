import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  DISTRICT_PACKAGE_FORMAT,
  DISTRICT_PACKAGE_LIMITS,
} from './districtLibraryPackage';
import {
  declaredUncompressedSize,
  readDistrictPackage,
} from './districtLibraryPackageReader';

const manifest = {
  format: DISTRICT_PACKAGE_FORMAT,
  version: 1,
  title: 'Test package',
  generatedAt: 1,
  entries: [
    {
      kind: 'questionBank',
      id: 'bank-1',
      title: 'Bank',
      path: 'banks/b.bank.json',
      questionCount: 1,
      pictures: [],
    },
  ],
};
const bank = {
  id: 'bank-1',
  title: 'Bank',
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'Q',
      correctAnswer: 'A',
      incorrectAnswers: ['B'],
    },
  ],
};

async function zipOf(files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, text] of Object.entries(files)) zip.file(path, text);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

describe('readDistrictPackage', () => {
  it('reads a valid package', async () => {
    const result = await readDistrictPackage(
      await zipOf({
        'package.json': JSON.stringify(manifest),
        'banks/b.bank.json': JSON.stringify(bank),
      })
    );
    expect(result.ok).toBe(true);
  });

  it('refuses unzipped text over the JSON budget before parsing it', async () => {
    const huge = 'x'.repeat(DISTRICT_PACKAGE_LIMITS.jsonBytes + 1);
    const result = await readDistrictPackage(
      await zipOf({
        'package.json': JSON.stringify(manifest),
        'banks/b.bank.json': huge,
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/once unzipped/);
  });

  it('refuses a file over the zip size cap without opening it', async () => {
    const big = {
      size: DISTRICT_PACKAGE_LIMITS.zipBytes + 1,
    } as unknown as Blob;
    const result = await readDistrictPackage(big);
    expect(result.ok).toBe(false);
  });

  it('reads the uncompressed size from the zip header', async () => {
    const zip = await JSZip.loadAsync(await zipOf({ 'a.txt': 'hello world' }));
    const entry = zip.file('a.txt');
    expect(entry && declaredUncompressedSize(entry)).toBe(11);
  });
});
