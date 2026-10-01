import React from 'react';
import * as Icons from 'lucide-react';

const ICONS = Icons as unknown as Record<string, React.ElementType | undefined>;

export const RoutineIcon: React.FC<
  { name?: string } & React.SVGProps<SVGSVGElement> & { size?: number }
> = ({ name, ...props }) =>
  React.createElement((name ? ICONS[name] : undefined) ?? Icons.Circle, props);
