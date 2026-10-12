import { useCallback, useMemo } from 'react';
import { Edit2, Trash2, UserMinus, Users2 } from 'lucide-react';
import type { Plc, QuestionBankMetadata } from '@/types';
import {
  buildDuplicateAction,
  buildMoveToFolderAction,
  LIBRARY_ITEM_NOUNS,
  useLibraryDeleteConfirm,
  type LibraryMenuAction,
} from '@/components/common/library';
import { useDialog } from '@/context/useDialog';

export interface BankMenuActionsOptions {
  userId?: string;
  plcs: readonly Plc[];
  onEditBank: (meta: QuestionBankMetadata) => void;
  onDuplicateBank: (meta: QuestionBankMetadata) => void | Promise<void>;
  onDeleteBank: (meta: QuestionBankMetadata) => void | Promise<void>;
  onShareBankWithPlc?: (meta: QuestionBankMetadata) => void;
  onUnshareBankFromPlc?: (
    meta: QuestionBankMetadata,
    plcId: string
  ) => void | Promise<void>;
}

// A bank row's overflow menu, shared by the Question banks list and bank rows in Quiz folders.
export function useBankMenuActions({
  userId,
  plcs,
  onEditBank,
  onDuplicateBank,
  onDeleteBank,
  onShareBankWithPlc,
  onUnshareBankFromPlc,
}: BankMenuActionsOptions): {
  plcNameById: Map<string, string>;
  buildActions: (
    bank: QuestionBankMetadata,
    onOpenFolderPicker: () => void
  ) => LibraryMenuAction[];
} {
  const { showConfirm } = useDialog();
  const confirmDelete = useLibraryDeleteConfirm();
  const plcNameById = useMemo(
    () => new Map(plcs.map((p) => [p.id, p.name])),
    [plcs]
  );

  const buildActions = useCallback(
    (
      bank: QuestionBankMetadata,
      onOpenFolderPicker: () => void
    ): LibraryMenuAction[] => {
      const actions: LibraryMenuAction[] = [
        {
          id: 'edit',
          label: 'Edit',
          icon: Edit2,
          onClick: () => onEditBank(bank),
        },
        buildDuplicateAction(bank, () => void onDuplicateBank(bank)),
      ];
      if (onShareBankWithPlc && plcs.length > 0) {
        actions.push({
          id: 'share-with-plc',
          label: 'Share with PLC…',
          icon: Users2,
          onClick: () => onShareBankWithPlc(bank),
        });
      }
      if (onUnshareBankFromPlc) {
        for (const plcId of bank.sync?.plcIds ?? []) {
          actions.push({
            id: `unshare-${plcId}`,
            label: `Stop sharing (${plcNameById.get(plcId) ?? 'PLC'})`,
            icon: UserMinus,
            onClick: async () => {
              const ok = await showConfirm(
                `Stop sharing "${bank.title}" with ${plcNameById.get(plcId) ?? 'this PLC'}? Teammates' quizzes that draw from it will stop resolving.`,
                {
                  title: 'Stop Sharing',
                  variant: 'warning',
                  confirmLabel: 'Stop Sharing',
                }
              );
              if (ok) await onUnshareBankFromPlc(bank, plcId);
            },
          });
        }
      }
      actions.push(
        buildMoveToFolderAction({
          onOpenPicker: onOpenFolderPicker,
          disabled: !userId,
        })
      );
      actions.push({
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        destructive: true,
        onClick: async () => {
          const ok = await confirmDelete({
            titles: [bank.title],
            noun: LIBRARY_ITEM_NOUNS.bank,
            detail: 'Quizzes that draw from it will stop resolving.',
          });
          if (ok) await onDeleteBank(bank);
        },
      });
      return actions;
    },
    [
      userId,
      plcs.length,
      plcNameById,
      showConfirm,
      confirmDelete,
      onEditBank,
      onDuplicateBank,
      onDeleteBank,
      onShareBankWithPlc,
      onUnshareBankFromPlc,
    ]
  );

  return { plcNameById, buildActions };
}
