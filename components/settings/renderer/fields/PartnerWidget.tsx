import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { PartnerCardFrame } from '@/components/settings/PartnerCardFrame';
import type { FieldProps } from '../FieldProps';

// Card body: the inner control, plus a one-tap add while the partner is off the board.
export const PartnerWidget: React.FC<FieldProps> = ({
  field,
  ctx,
  id,
  labelId,
  renderField,
}) => {
  const { activeDashboard, addWidget } = useDashboard();
  if (field.type !== 'partnerWidget' || !renderField) return null;
  const present = !!activeDashboard?.widgets.some(
    (w) => w.type === field.partner
  );
  const name = ctx.toolLabel?.(field.partner) ?? field.partner;
  return (
    <PartnerCardFrame
      partner={field.partner}
      name={name}
      present={present}
      addLabel={ctx.t('widgetSettings.common.partner.add', { name })}
      onAdd={() => addWidget(field.partner)}
      id={id}
      labelId={labelId}
    >
      {renderField(field.control, !present)}
    </PartnerCardFrame>
  );
};
