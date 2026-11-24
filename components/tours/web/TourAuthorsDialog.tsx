import React, { useEffect, useId, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  iconBtn,
  inputLight,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
import { logError } from '@/utils/logError';
import {
  addTourAuthor,
  authorEmailOf,
  removeTourAuthor,
  watchTourAuthors,
  type TourAuthor,
} from './tourAuthors';

/** The people who may record and publish web tours without being admins; admins add and remove them here. */
export const TourAuthorsDialog: React.FC<{
  /** The signed-in admin's email, recorded on each person they add. */
  adminEmail: string;
  onClose: () => void;
}> = ({ adminEmail, onClose }) => {
  const [authors, setAuthors] = useState<TourAuthor[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  useEffect(
    () =>
      watchTourAuthors(setAuthors, () => {
        setAuthors([]);
        setError("The list couldn't load.");
      }),
    []
  );

  const add = async () => {
    const clean = authorEmailOf(email);
    if (!clean) {
      setError('Enter an orono.k12.mn.us email address.');
      return;
    }
    if (authors?.some((a) => a.email === clean)) {
      setError('That person is already on the list.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addTourAuthor(clean, adminEmail);
      setEmail('');
    } catch (err) {
      logError('TourAuthorsDialog add', err);
      setError("That person couldn't be added.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (target: string) => {
    setError(null);
    try {
      await removeTourAuthor(target);
    } catch (err) {
      logError('TourAuthorsDialog remove', err);
      setError("That person couldn't be removed.");
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Tour authors"
      maxWidth="max-w-md"
      footer={
        <div className="flex w-full items-center justify-center">
          {/* no-tour-anchor: inside the Tour authors dialog */}
          <button type="button" className={secondaryBtn} onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-4">
        <p className="text-sm text-slate-700">
          Authors record, edit and publish web tours. They get no other admin
          access.
        </p>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label
              htmlFor={fieldId}
              className="text-sm font-semibold text-slate-900"
            >
              Add a person
            </label>
            {/* no-tour-anchor: inside the Tour authors dialog */}
            <input
              id={fieldId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@orono.k12.mn.us"
              autoComplete="off"
              className={`${inputLight} min-h-10 w-full rounded-lg px-3 text-sm`}
            />
          </div>
          {/* no-tour-anchor: inside the Tour authors dialog */}
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className={`${primaryBtn} inline-flex min-h-10 items-center gap-1.5 disabled:opacity-60`}
          >
            {busy && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Add
          </button>
        </form>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        {authors === null ? (
          <div className="flex justify-center py-6">
            <Loader2
              className="h-6 w-6 animate-spin text-slate-400"
              aria-label="Loading"
            />
          </div>
        ) : authors.length === 0 ? (
          <p className="text-sm text-slate-600">No authors yet.</p>
        ) : (
          <ul className="scroll-bleed max-h-72 divide-y divide-slate-200 overflow-y-auto">
            {authors.map((a) => (
              <li
                key={a.email}
                className="flex items-center justify-between gap-2 py-2"
              >
                <span className="min-w-0 truncate text-sm text-slate-900">
                  {a.email}
                </span>
                {/* no-tour-anchor: inside the Tour authors dialog */}
                <button
                  type="button"
                  onClick={() => void remove(a.email)}
                  aria-label={`Remove ${a.email}`}
                  title="Remove"
                  className={iconBtn}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};
