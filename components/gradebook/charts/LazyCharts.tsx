import React, { Suspense, lazy } from 'react';
import type {
  ScoreHistogramProps,
  ScoreTrendChartProps,
} from './rechartsCharts';

// Recharts loads in its own chunk the first time a chart renders (D34).
const LazyHistogram = lazy(() =>
  import('./rechartsCharts').then((m) => ({ default: m.ScoreHistogramImpl }))
);
const LazyTrend = lazy(() =>
  import('./rechartsCharts').then((m) => ({ default: m.ScoreTrendChartImpl }))
);

const Placeholder: React.FC<{ height: number }> = ({ height }) => (
  <div aria-hidden style={{ height }} className="rounded-lg bg-slate-50" />
);

export const ScoreHistogram: React.FC<ScoreHistogramProps> = (props) => (
  <Suspense fallback={<Placeholder height={props.height ?? 180} />}>
    <LazyHistogram {...props} />
  </Suspense>
);

export const ScoreTrendChart: React.FC<ScoreTrendChartProps> = (props) => (
  <Suspense fallback={<Placeholder height={props.height ?? 200} />}>
    <LazyTrend {...props} />
  </Suspense>
);
