import React from 'react';
import { Toggle } from '@/components/common/Toggle';

export interface ConfigSchemaField {
  type: 'string' | 'number' | 'boolean' | 'stringArray';
  label: string;
  description?: string;
  default?: unknown;
}

export type ConfigSchema = Record<string, ConfigSchemaField>;

interface SchemaDrivenConfigurationPanelProps {
  schema: ConfigSchema;
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const SchemaDrivenConfigurationPanel: React.FC<
  SchemaDrivenConfigurationPanelProps
> = ({ schema, config, onChange }) => {
  return (
    <div className="space-y-4">
      {Object.entries(schema).map(([key, field]) => {
        const rawValue = (config || {})[key] ?? field.default;
        let value: string | number | boolean | string[];
        switch (field.type) {
          case 'number': {
            const n = Number(rawValue ?? 0);
            value = isNaN(n) ? 0 : n;
            break;
          }
          case 'boolean':
            value = !!rawValue;
            break;
          case 'stringArray':
            value = Array.isArray(rawValue) ? (rawValue as string[]) : [];
            break;
          case 'string':
          default:
            value = typeof rawValue === 'string' ? rawValue : '';
            break;
        }

        return (
          <div key={key}>
            <label
              htmlFor={`sdcp-${key}`}
              className="text-xxs font-bold text-slate-500 uppercase mb-1 block"
            >
              {field.label}
            </label>
            {field.description && (
              <p className="text-xs text-slate-400 mb-2">{field.description}</p>
            )}

            {field.type === 'number' && (
              <input
                id={`sdcp-${key}`}
                type="number"
                value={value as number}
                onChange={(e) =>
                  onChange({ ...config, [key]: Number(e.target.value) })
                }
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none"
              />
            )}

            {field.type === 'string' && (
              <input
                id={`sdcp-${key}`}
                type="text"
                value={value as string}
                onChange={(e) => onChange({ ...config, [key]: e.target.value })}
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none"
              />
            )}

            {field.type === 'boolean' && (
              <div className="flex items-center">
                <Toggle
                  checked={!!value}
                  onChange={(checked) =>
                    onChange({ ...config, [key]: checked })
                  }
                />
              </div>
            )}

            {field.type === 'stringArray' && (
              <textarea
                id={`sdcp-${key}`}
                value={(value as string[]).join('\n')}
                onChange={(e) =>
                  onChange({ ...config, [key]: e.target.value.split('\n') })
                }
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none"
                placeholder="One item per line"
                rows={4}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
