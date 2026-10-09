// Lead and co-lead compose box for a new or edited update (mock: BuildingUpdatesMock).

import React, { useRef, useState } from 'react';
import { Link2, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { Toggle } from '@/components/common/Toggle';
import { INPUT } from '@/components/plc/redesignMockup/ui';
import type { PlcUpdate } from '@/types';
import type { PlcUpdateDraft } from '@/hooks/usePlcUpdates';
import { isUpdateLinkUrl, splitComposeText } from '@/utils/teamUpdates';
import { tourAttr } from '@/config/tourAnchors';

export type AttachPicker = () => Promise<{ name: string; url: string } | null>;

const withHttps = (raw: string): string => {
  const v = raw.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v)
    ? v.replace(/^http:\/\//i, 'https://')
    : `https://${v}`;
};

export const UpdateComposer: React.FC<{
  initial?: PlcUpdate;
  onSubmit: (draft: PlcUpdateDraft) => Promise<void> | void;
  onCancel?: () => void;
  onAttach?: AttachPicker;
}> = ({ initial, onSubmit, onCancel, onAttach }) => {
  const [text, setText] = useState(
    initial ? [initial.title, initial.body].filter(Boolean).join('\n') : ''
  );
  const [ackRequired, setAckRequired] = useState(initial?.requiresAck ?? false);
  const [weekly, setWeekly] = useState(initial?.inDigest ?? true);
  const [attachment, setAttachment] = useState(initial?.attachment);
  const [linkOpen, setLinkOpen] = useState(!!initial?.linkUrl);
  const [link, setLink] = useState(initial?.linkUrl ?? '');
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const linkUrl = withHttps(link);
  const linkOk = !linkUrl || isUpdateLinkUrl(linkUrl);
  const { title } = splitComposeText(text);
  const canPost = title.length > 0 && linkOk && !busy;

  const submit = async () => {
    if (!canPost) {
      textRef.current?.focus();
      return;
    }
    const { title: t, body } = splitComposeText(text);
    setBusy(true);
    try {
      await onSubmit({
        title: t,
        body,
        ...(linkUrl ? { linkUrl } : {}),
        ...(attachment ? { attachment } : {}),
        requiresAck: ackRequired,
        inDigest: weekly,
      });
      if (!initial) {
        setText('');
        setAttachment(undefined);
        setLink('');
        setLinkOpen(false);
        setAckRequired(false);
      }
    } catch {
      // The caller already showed the error; keep the draft for a retry.
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    if (!onAttach) return;
    const picked = await onAttach();
    if (picked) setAttachment(picked);
  };

  return (
    <div>
      <textarea
        ref={textRef}
        rows={3}
        placeholder="Post an update"
        aria-label="Post an update"
        value={text}
        onChange={(e) => setText(e.target.value)}
        {...tourAttr('teams.update-composer.text')}
        className={`${INPUT} w-full resize-y`}
      />
      {linkOpen && (
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://"
          aria-label="Add a link"
          aria-invalid={!linkOk}
          {...tourAttr('teams.update-composer.link-input')}
          className={`${INPUT} mt-2 w-full`}
        />
      )}
      {attachment && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-700">
          <Paperclip
            className="h-3.5 w-3.5 text-slate-400"
            aria-hidden="true"
          />
          <span className="min-w-0 truncate">{attachment.name}</span>
          <IconButton
            icon={<X className="h-3.5 w-3.5" />}
            label="Remove"
            size="sm"
            {...tourAttr('teams.update-composer.remove-attachment')}
            onClick={() => setAttachment(undefined)}
          />
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <IconButton
          icon={<Paperclip className="h-4 w-4" />}
          label="Attach a file"
          size="sm"
          {...tourAttr('teams.update-composer.attach')}
          onClick={() => void attach()}
          disabled={!onAttach}
        />
        <IconButton
          icon={<Link2 className="h-4 w-4" />}
          label="Add a link"
          size="sm"
          active={linkOpen}
          {...tourAttr('teams.update-composer.add-link')}
          onClick={() => setLinkOpen((v) => !v)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Toggle
            size="sm"
            showLabels={false}
            checked={ackRequired}
            onChange={setAckRequired}
            anchor={tourAttr('teams.update-composer.require-ack')}
            label="Require acknowledgement"
          />
          Require acknowledgement
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Toggle
            size="sm"
            showLabels={false}
            checked={weekly}
            onChange={setWeekly}
            anchor={tourAttr('teams.update-composer.weekly-email')}
            label="Include in weekly email"
          />
          Include in weekly email
        </label>
        <span className="flex-1" />
        {onCancel && (
          <Button
            size="sm"
            variant="ghost"
            {...tourAttr('teams.update-composer.cancel')}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          icon={
            initial ? undefined : (
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
            )
          }
          isLoading={busy}
          {...tourAttr('teams.update-composer.submit')}
          onClick={() => void submit()}
        >
          {initial ? 'Save' : 'Post'}
        </Button>
      </div>
    </div>
  );
};
