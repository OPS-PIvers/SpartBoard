import {
  WidgetType,
  AnnouncementActivationType,
  AnnouncementDismissalType,
} from '@/types';

export interface AnnouncementFormData {
  name: string;
  widgetType: WidgetType;
  widgetConfig: Record<string, unknown>;
  widgetSize: { w: number; h: number };
  maximized: boolean;
  activationType: AnnouncementActivationType;
  scheduledActivationDate: string;
  scheduledActivationTime: string;
  /** When true, the form's end date+time auto-deactivate the announcement */
  autoDeactivateEnabled: boolean;
  scheduledEndDate: string;
  scheduledEndTime: string;
  dismissalType: AnnouncementDismissalType;
  scheduledDismissalTime: string;
  dismissalDurationSeconds: number;
  dismissalDurationUnit: 'seconds' | 'minutes';
  targetBuildings: string[];
  targetUsers: string[];
}

export type EmbedTab = 'url' | 'code' | 'record' | 'live';
