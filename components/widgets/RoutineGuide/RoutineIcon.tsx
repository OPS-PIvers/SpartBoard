import React from 'react';
import { Circle } from 'lucide-react';
import { getNamedLucideIcon } from '@/utils/lucideIconMap';

export const RoutineIcon: React.FC<
  { name?: string } & React.SVGProps<SVGSVGElement> & { size?: number }
> = ({ name, ...props }) =>
  React.createElement(getNamedLucideIcon(name, Circle), props);
