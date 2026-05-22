import { describe, it, expect } from 'vitest';
import { parseManifest } from './smartNotebook';

const NS = 'xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"';

describe('parseManifest', () => {
  it('derives order + sections from lesson groups (not filename order)', () => {
    const xml = `<manifest ${NS}>
      <organizations><organization id="pagegroups">
        <item identifierref="g0"><title>Lesson B</title></item>
        <item identifierref="g1"><title>Lesson A</title></item>
      </organization></organizations>
      <resources>
        <resource identifier="g0"><file href="page2.svg"/><file href="page0.svg"/></resource>
        <resource identifier="g1"><file href="page1.svg"/></resource>
      </resources>
    </manifest>`;
    const plan = parseManifest(xml, ['page0.svg', 'page1.svg', 'page2.svg']);
    expect(plan.order).toEqual(['page2.svg', 'page0.svg', 'page1.svg']);
    expect(plan.sections).toEqual([
      { title: 'Lesson B', startIndex: 0, pageCount: 2 },
      { title: 'Lesson A', startIndex: 2, pageCount: 1 },
    ]);
  });

  it('falls back to the flat "pages" resource when there are no groups', () => {
    const xml = `<manifest ${NS}>
      <resources>
        <resource identifier="pages"><file href="page1.svg"/><file href="page0.svg"/></resource>
      </resources>
    </manifest>`;
    const plan = parseManifest(xml, ['page0.svg', 'page1.svg']);
    expect(plan.order).toEqual(['page1.svg', 'page0.svg']);
    expect(plan.sections).toEqual([]);
  });

  it('appends present-but-unreferenced pages in numeric order', () => {
    const xml = `<manifest ${NS}>
      <organizations><organization id="pagegroups">
        <item identifierref="g0"><title>Only</title></item>
      </organization></organizations>
      <resources>
        <resource identifier="g0"><file href="page1.svg"/><file href="page0.svg"/></resource>
      </resources>
    </manifest>`;
    // page2 + page10 exist on disk but are not referenced anywhere.
    const plan = parseManifest(xml, [
      'page0.svg',
      'page1.svg',
      'page2.svg',
      'page10.svg',
    ]);
    expect(plan.order).toEqual([
      'page1.svg',
      'page0.svg',
      'page2.svg', // orphans appended, numeric order (2 before 10)
      'page10.svg',
    ]);
    expect(plan.sections).toEqual([
      { title: 'Only', startIndex: 0, pageCount: 2 },
    ]);
  });

  it('returns an empty plan for malformed XML (caller does numeric fallback)', () => {
    const plan = parseManifest('<manifest <<broken', [
      'page2.svg',
      'page0.svg',
      'page1.svg',
    ]);
    // On a parse failure parseManifest yields nothing usable; resolvePageOrder
    // (the caller) is what falls back to a numeric filename sort.
    expect(plan.order).toEqual([]);
    expect(plan.sections).toEqual([]);
  });

  it('filters dangling references to pages not on disk', () => {
    const xml = `<manifest ${NS}>
      <organizations><organization id="pagegroups">
        <item identifierref="g0"><title>L</title></item>
      </organization></organizations>
      <resources>
        <resource identifier="g0"><file href="page0.svg"/><file href="page9.svg"/></resource>
      </resources>
    </manifest>`;
    // page9 is referenced but absent -> dropped; section count reflects reality.
    const plan = parseManifest(xml, ['page0.svg']);
    expect(plan.order).toEqual(['page0.svg']);
    expect(plan.sections).toEqual([
      { title: 'L', startIndex: 0, pageCount: 1 },
    ]);
  });
});
