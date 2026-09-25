import { describe, expect, it } from 'vitest';
import { collapseTestSuffix, withTestSuffix } from '@/utils/testClassSuffix';

describe('withTestSuffix', () => {
  it('appends the suffix to a plain title', () => {
    expect(withTestSuffix('Mock Period 1')).toBe('Mock Period 1 (test)');
  });

  it('leaves a title that already ends in (test), in any case', () => {
    expect(withTestSuffix('Mock Period 1 (test)')).toBe('Mock Period 1 (test)');
    expect(withTestSuffix('Mock Period 1 (Test)')).toBe('Mock Period 1 (Test)');
    expect(withTestSuffix('Mock Period 1 (TEST) ')).toBe(
      'Mock Period 1 (TEST)'
    );
  });

  it('does not treat a mid-title (test) as the suffix', () => {
    expect(withTestSuffix('(Test) kitchen')).toBe('(Test) kitchen (test)');
  });
});

describe('collapseTestSuffix', () => {
  it('collapses repeated suffixes to the first one', () => {
    expect(collapseTestSuffix('Mock Period 1 (Test) (Test)')).toBe(
      'Mock Period 1 (Test)'
    );
    expect(collapseTestSuffix('Mock Period 1 (Test) (test) (TEST)')).toBe(
      'Mock Period 1 (Test)'
    );
    expect(collapseTestSuffix('Mock Period 1(test)(test)')).toBe(
      'Mock Period 1 (test)'
    );
  });

  it('keeps a single suffix and plain names unchanged', () => {
    expect(collapseTestSuffix('Mock Period 1 (test)')).toBe(
      'Mock Period 1 (test)'
    );
    expect(collapseTestSuffix('Period 3 Biology')).toBe('Period 3 Biology');
    expect(collapseTestSuffix('Unit test review')).toBe('Unit test review');
  });
});
