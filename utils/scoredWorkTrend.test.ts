import { describe, expect, it } from 'vitest';
import type { PlcScoredWorkAggregate } from '@/types';
import { buildScoredWorkTrend } from './scoredWorkTrend';

const agg = (
  key: string,
  at: number,
  criteria: Array<[string, number]>
): PlcScoredWorkAggregate => ({
  seriesKey: key,
  seriesLabel: key,
  teacherCount: 2,
  studentCount: 40,
  averagePercent: 70,
  criteria: criteria.map(([name, averagePercent]) => ({
    name,
    studentCount: 40,
    averagePercent,
  })),
  scoreDistribution: [],
  firstPublishedAt: at,
  lastPublishedAt: at,
  ranAt: at,
});

describe('buildScoredWorkTrend', () => {
  it('orders series by date and follows a criterion by name', () => {
    const trend = buildScoredWorkTrend([
      agg('b', 20, [
        ['thesis', 80],
        ['Voice', 60],
      ]),
      agg('a', 10, [['Thesis', 50]]),
    ]);
    expect(trend.columns.map((c) => c.seriesKey)).toEqual(['a', 'b']);
    expect(trend.rows).toEqual([{ name: 'Thesis', values: [50, 80] }]);
  });

  it('leaves out criteria that appear only once', () => {
    expect(buildScoredWorkTrend([agg('a', 1, [['Voice', 60]])]).rows).toEqual(
      []
    );
  });
});
