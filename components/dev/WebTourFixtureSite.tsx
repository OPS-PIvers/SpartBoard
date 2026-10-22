// A small fake website for web tour playback: an in-app route change, a late control, a frame and a full page load.
import React, { useEffect, useState } from 'react';

export const WEB_TOUR_FIXTURE_PATH = '/web-tour-fixture-dev';

const btn =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100';

const FixtureFrame: React.FC = () => (
  <div className="p-3 font-sans">
    <label htmlFor="fixture-comment" className="block text-sm text-slate-700">
      Comment
    </label>
    <input
      id="fixture-comment"
      type="text"
      className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
    />
  </div>
);

const Home: React.FC<{ go: (path: string) => void }> = ({ go }) => (
  <>
    <h1 className="text-xl font-bold">Fixture school site</h1>
    <p className="text-sm text-slate-600">Home page. Courses open without a page load.</p>
    <button type="button" className={btn} onClick={() => go(`${WEB_TOUR_FIXTURE_PATH}/course/42`)}>
      Open course
    </button>
  </>
);

const Course: React.FC = () => {
  const [late, setLate] = useState(false);
  const [frame, setFrame] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setLate(true), 1500);
    const t2 = setTimeout(() => setFrame(true), 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  return (
    <>
      <h1 className="text-xl font-bold">Course 42</h1>
      <div role="tablist" className="flex gap-2">
        <span role="tab" className="px-2 py-1 text-sm">
          Materials
        </span>
        <span className="px-2 py-1 text-sm font-semibold">Grades</span>
      </div>
      <div className="flex justify-between">
        <button type="button" className={btn}>
          Edit
        </button>
        <button type="button" className={btn}>
          Edit
        </button>
      </div>
      {late && (
        <button type="button" className={btn}>
          Load more
        </button>
      )}
      {frame && (
        <iframe
          title="Comment box"
          src={`${WEB_TOUR_FIXTURE_PATH}/frame`}
          className="h-24 w-full rounded border border-slate-300"
        />
      )}
      <a className="text-sm font-semibold text-blue-700 underline" href={`${WEB_TOUR_FIXTURE_PATH}/done`}>
        Next page
      </a>
    </>
  );
};

/** Dev builds and the spartboard-dev site only; the routes live under one path so a tour can cross them. */
export const WebTourFixtureSite: React.FC = () => {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (next: string) => {
    window.history.pushState(null, '', next);
    setPath(next);
  };
  if (path === `${WEB_TOUR_FIXTURE_PATH}/frame`) return <FixtureFrame />;
  return (
    <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-50">
      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6 pb-16">
        {path.startsWith(`${WEB_TOUR_FIXTURE_PATH}/course/`) ? (
          <Course />
        ) : path === `${WEB_TOUR_FIXTURE_PATH}/done` ? (
          <>
            <h1 className="text-xl font-bold">All done</h1>
            <p className="text-sm text-slate-600">
              This page has no Share button, so the last step shows its picture.
            </p>
          </>
        ) : (
          <Home go={go} />
        )}
      </main>
    </div>
  );
};
