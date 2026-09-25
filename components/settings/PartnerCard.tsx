import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useToolLabel } from '@/hooks/useToolLabel';
import type { WidgetType } from '@/types';
import { PartnerCardFrame } from './PartnerCardFrame';

export type PartnerCardProps = {
  partner: WidgetType;
  /** Receives whether the partner is on the board; render the control disabled when it is not. */
  children: (present: boolean) => React.ReactNode;
};

// Legacy-panel twin of the `partnerWidget` schema field: same card, same gates, hooks instead of FieldCtx.
export const PartnerCard: React.FC<PartnerCardProps> = ({
  partner,
  children,
}) => {
  const { t } = useTranslation();
  const { canAccessWidget } = useAuth();
  const toolLabel = useToolLabel();
  const { activeDashboard, addWidget } = useDashboard();
  const id = useId();
  if (!canAccessWidget(partner)) return null;
  const present = !!activeDashboard?.widgets.some((w) => w.type === partner);
  const name = toolLabel(partner);
  return (
    <PartnerCardFrame
      partner={partner}
      name={name}
      present={present}
      addLabel={t('widgetSettings.common.partner.add', { name })}
      onAdd={() => addWidget(partner)}
      id={id}
      showTitle
    >
      {children(present)}
    </PartnerCardFrame>
  );
};
