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
  scheduledActivationTime: string;
  dismissalType: AnnouncementDismissalType;
  scheduledDismissalTime: string;
  dismissalDurationSeconds: number;
  dismissalDurationUnit: 'seconds' | 'minutes';
  targetBuildings: string[];
}

export type EmbedTab = 'url' | 'code' | 'record' | 'live';
