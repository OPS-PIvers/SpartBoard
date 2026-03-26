import { createContext } from 'react';
import { CustomWidgetDoc, ToolMetadata } from '../types';

export interface CustomWidgetsContextValue {
  /** All custom widget docs (admins see all; non-admins see only published) */
  customWidgets: CustomWidgetDoc[];
  /** Dynamic ToolMetadata[] entries for published custom widgets, ready for Dock injection */
  customTools: ToolMetadata[];
  /** Whether the initial load is still in flight */
  loading: boolean;
  /** Save (create or update) a custom widget doc */
  saveCustomWidget: (
    doc: Omit<CustomWidgetDoc, 'id'> & { id?: string }
  ) => Promise<string>;
  /** Publish or unpublish a custom widget */
  setPublished: (id: string, published: boolean) => Promise<void>;
  /** Delete a custom widget doc */
  deleteCustomWidget: (id: string) => Promise<void>;
}

export const CustomWidgetsContext =
  createContext<CustomWidgetsContextValue | null>(null);
