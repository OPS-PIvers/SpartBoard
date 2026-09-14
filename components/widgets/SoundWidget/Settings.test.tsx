import { describe, expect, it } from 'vitest';
import schema from './settings.schema';

describe('Sound Meter settings schema', () => {
  it('exposes sensitivity as its own slider field', () => {
    const sensitivity = schema.groups[0]?.fields.find(
      (field) => field.key === 'sensitivity'
    );
    expect(sensitivity).toMatchObject({
      type: 'slider',
      min: 0.5,
      max: 5,
      step: 0.1,
    });
  });

  it('uses schema partner fields for inter-widget automation', () => {
    const partnerFields = schema.groups[0]?.fields.filter(
      (field) => field.type === 'partnerWidget'
    );
    expect(partnerFields?.map((field) => field.key)).toEqual([
      'syncExpectations',
      'autoTrafficLight',
    ]);
  });
});
