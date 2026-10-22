import React, {
  lazy,
  Suspense,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import { EXTENSION_PROTOCOL_VERSION } from './extensionProtocol';
import {
  INTAKE_PORT,
  parseIntakePortMessage,
  type IntakePageMessage,
  type IntakePortMessage,
} from './recorderProtocol';
import {
  appendRecordedSteps,
  intakeDraftFor,
  intakeDrafts,
} from './intakeSave';

const SignInPage = lazy(() =>
  import('@/components/auth/SignInPage').then((m) => ({
    default: m.SignInPage,
  }))
);

interface ChromePort {
  postMessage: (msg: unknown) => void;
  disconnect: () => void;
  onMessage: { addListener: (fn: (msg: unknown) => void) => void };
  onDisconnect: { addListener: (fn: () => void) => void };
}

const connectExtension = (): ChromePort | null => {
  const id: unknown = import.meta.env.VITE_SPART_EXTENSION_ID;
  const connect = (
    globalThis as {
      chrome?: {
        runtime?: {
          connect?: (id: string, info: { name: string }) => ChromePort;
        };
      };
    }
  ).chrome?.runtime?.connect;
  if (typeof id !== 'string' || !connect) return null;
  try {
    return connect(id, { name: INTAKE_PORT });
  } catch {
    return null;
  }
};

type Phase = 'loading' | 'signin' | 'denied' | 'ready';

/** The `/web-tour-intake` page the extension opens to save steps recorded with no editor open (U17). */
export const WebTourIntakePage: React.FC = () => {
  const { user, loading, globalPermissionsLoaded, isAdmin, canAccessFeature } =
    useAuth();
  const phase: Phase = loading
    ? 'loading'
    : !user
      ? 'signin'
      : !globalPermissionsLoaded || isAdmin === null
        ? 'loading'
        : isAdmin && canAccessFeature('web-tours')
          ? 'ready'
          : 'denied';
  return <Intake phase={phase} />;
};

const Intake: React.FC<{ phase: Phase }> = ({ phase }) => {
  const port = useRef<ChromePort | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Which draft each job created, so a later batch of the same job appends to it.
  const created = useRef(new Map<string, string>());
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>(
    'idle'
  );
  const [noExtension, setNoExtension] = useState(false);

  const post = (msg: IntakePageMessage) => {
    try {
      port.current?.postMessage(msg);
    } catch {
      // Closed; the extension reopens this page when it still has work.
    }
  };

  const announce = useEffectEvent(async () => {
    if (phase === 'signin') post({ type: 'intake/signin' });
    else if (phase === 'denied') post({ type: 'intake/denied' });
    else if (phase === 'ready') {
      try {
        post({
          type: 'intake/ready',
          drafts: await intakeDrafts(),
          protocol: EXTENSION_PROTOCOL_VERSION,
        });
      } catch (err) {
        logError('web tour intake drafts', err);
        post({
          type: 'intake/ready',
          drafts: [],
          protocol: EXTENSION_PROTOCOL_VERSION,
        });
      }
    }
  });

  const save = (msg: Extract<IntakePortMessage, { type: 'intake/save' }>) => {
    queue.current = queue.current.then(async () => {
      setStatus('saving');
      try {
        const known = created.current.get(msg.jobId);
        const set = await intakeDraftFor(
          known ? { kind: 'append', setId: known } : msg.target
        );
        if (!set) throw new Error('Web tour draft not found');
        if (msg.target.kind === 'new' && !known) {
          created.current.set(msg.jobId, set.id);
          post({ type: 'intake/created', jobId: msg.jobId, setId: set.id });
        }
        await appendRecordedSteps(set, msg.steps, (stepId) =>
          post({ type: 'intake/ack', jobId: msg.jobId, stepId })
        );
        setStatus('saved');
      } catch (err) {
        logError('web tour intake save', err, { jobId: msg.jobId });
        post({ type: 'intake/failed', jobId: msg.jobId });
        setStatus('failed');
      }
    });
  };

  const onPortMessage = useEffectEvent((raw: unknown) => {
    const msg = parseIntakePortMessage(raw);
    // Steps come only from this page's own extension port, never from page messages.
    if (!msg) return;
    if (msg.type === 'intake/listDrafts') void announce();
    else if (phase === 'ready') save(msg);
  });

  useEffect(() => {
    if (phase === 'loading') return;
    if (!port.current) {
      port.current = connectExtension();
      if (!port.current) {
        setNoExtension(true);
        return;
      }
      port.current.onDisconnect.addListener(() => {
        port.current = null;
      });
      port.current.onMessage.addListener((raw) => onPortMessage(raw));
    }
    void announce();
  }, [phase]);

  useEffect(
    () => () => {
      port.current?.disconnect();
      port.current = null;
    },
    []
  );

  if (phase === 'signin')
    return (
      <Suspense fallback={<Spinner />}>
        <SignInPage />
      </Suspense>
    );
  if (phase === 'loading') return <Spinner />;
  const text = noExtension
    ? 'Open this page from the SpartBoard extension.'
    : phase === 'denied'
      ? "This account can't save web tours."
      : status === 'saving'
        ? 'Saving steps...'
        : status === 'failed'
          ? "Steps couldn't be saved."
          : status === 'saved'
            ? 'Saved.'
            : 'Ready to save steps.';
  return (
    <main className="flex h-screen [height:100dvh] items-center justify-center bg-white px-4">
      <p role="status" className="text-sm font-semibold text-slate-700">
        {text}
      </p>
    </main>
  );
};

const Spinner: React.FC = () => (
  <main className="flex h-screen [height:100dvh] items-center justify-center bg-white">
    <Loader2
      className="h-6 w-6 animate-spin text-brand-blue-primary"
      aria-label="Loading"
    />
  </main>
);
