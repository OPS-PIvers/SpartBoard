// Program Hub resources card (T34): the program's shared links.

import { usePlcLinks } from '@/hooks/usePlcLinks';
import { ResourcesListView } from './ProgramHubCards';
import type { TeamCardProps } from './teamContract';

export default function ProgramResourcesCard({ plc }: TeamCardProps) {
  const { links } = usePlcLinks(plc.id);
  if (links.length === 0) return null;
  return <ResourcesListView links={links} />;
}
