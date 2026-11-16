import React, { useContext, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Presentation,
  RefreshCw,
  Repeat,
  Users,
} from 'lucide-react';
import type { AgendaConfig, WidgetData } from '@/types';
import {
  useDashboardActions,
  useDashboardCanvasSelector,
} from '@/context/dashboardCanvasStore';
import { useAuth } from '@/context/useAuth';
import { useCourses } from '@/hooks/useCourses';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { resolveBaseTextScale } from '@/config/widgetAppearance';
import { tourAttr } from '@/config/tourAnchors';
import type { Course, SaveCourseRequest } from '@/utils/course/contract';
import {
  agendaChoices,
  agendaEmbedUrl,
  agendaOpenUrl,
  deckBlocksStudents,
  hasAgendaPick,
  pickPatch,
  resolveAgendaChoice,
  type AgendaChoice,
} from './agendaWidgetState';
import { AgendaFixtureContext } from './fixtureCourses';
import { useAgendaDeckCheck } from './useAgendaDeckCheck';

const EMPTY_TONE = {
  iconClassName: 'text-slate-400',
  titleClassName: 'text-slate-700',
  subtitleClassName: 'text-slate-600',
};

const openMyClasses = () =>
  window.dispatchEvent(
    new CustomEvent('open-sidebar', { detail: { section: 'classes' } })
  );

const noSave = (): Promise<unknown> => Promise.resolve(null);

const sectionsLabel = (n: number) => (n > 1 ? `${n} sections` : null);

export const AgendaWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const fixture = useContext(AgendaFixtureContext);
  const { canAccessFeature } = useAuth();
  const on = !!fixture || canAccessFeature('course-agenda');
  const live = useCourses(on && !fixture);
  const courses = fixture?.courses ?? live.courses;
  const loading = !fixture && live.loading;
  const saveCourse = fixture ? noSave : live.saveCourse;

  if (!on) {
    return (
      <ScaledEmptyState
        {...EMPTY_TONE}
        icon={Presentation}
        title="Agenda"
        subtitle="Agendas aren't turned on for your account yet."
      />
    );
  }
  return (
    <AgendaFace
      widget={widget}
      courses={courses}
      loading={loading}
      error={!fixture && !!live.error}
      saveCourse={saveCourse}
      deckSrcDoc={fixture?.deckSrcDoc}
    />
  );
};

const AgendaFace: React.FC<{
  widget: WidgetData;
  courses: Course[];
  loading: boolean;
  error: boolean;
  saveCourse: (request: SaveCourseRequest) => Promise<unknown>;
  deckSrcDoc?: string;
}> = ({ widget, courses, loading, error, saveCourse, deckSrcDoc }) => {
  const config = widget.config as AgendaConfig;
  const { updateWidget } = useDashboardActions();
  const rosters = useDashboardCanvasSelector((s) => s.rosters);
  const [picking, setPicking] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [reloading, setReloading] = useState(false);
  const scale = resolveBaseTextScale(widget.baseTextSize);

  const choices = agendaChoices(courses, rosters ?? []);
  const choice = resolveAgendaChoice(config, choices);
  // Rosters arrive before Courses, so a saved Course pick waits rather than flashing "No agenda yet".
  const waitingForCourse =
    loading && !!config.courseId && choice?.course?.id !== config.courseId;
  useAgendaDeckCheck(picking ? null : (choice?.course ?? null), saveCourse);

  if (error) {
    return (
      <ScaledEmptyState
        {...EMPTY_TONE}
        icon={AlertTriangle}
        title="Couldn't load courses"
        subtitle="Reload the page to try again."
      />
    );
  }
  if (waitingForCourse && !picking) return <Waiting />;

  if (choices.length === 0) {
    if (loading || rosters === undefined) return <Waiting />;
    return (
      <ScaledEmptyState
        {...EMPTY_TONE}
        icon={Users}
        title="No classes yet"
        subtitle="Add your classes in My Classes to pick a course."
        action={
          <FaceButton
            icon={Users}
            onClick={openMyClasses}
            scale={scale}
            {...tourAttr('agenda.open-classes', widget.id)}
          >
            Open My Classes
          </FaceButton>
        }
      />
    );
  }

  if (picking || !choice) {
    if (!picking && hasAgendaPick(config) && loading) return <Waiting />;
    return (
      <CoursePicker
        widgetId={widget.id}
        choices={choices}
        selectedKey={choice?.key ?? null}
        scale={scale}
        onPick={(c) => {
          updateWidget(widget.id, { config: { ...config, ...pickPatch(c) } });
          setPicking(false);
        }}
        onBack={choice ? () => setPicking(false) : undefined}
      />
    );
  }

  const course = choice.course;
  const agenda = course?.agenda ?? null;
  const embedUrl = agenda ? agendaEmbedUrl(agenda.fileId) : null;
  const openUrl = agenda ? agendaOpenUrl(agenda.fileId) : null;
  const blocked = deckBlocksStudents(course);
  // Too small for the controls: the slide alone, which is what a tiny agenda is for.
  const slideOnly =
    !!embedUrl && !widget.maximized && (widget.w < 200 || widget.h < 200);

  return (
    <div className="flex h-full w-full flex-col bg-transparent">
      {!slideOnly && (
        <div
          className="flex shrink-0 items-center"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)',
          }}
        >
          <span
            className="min-w-0 flex-1 break-words font-bold leading-tight text-slate-800"
            style={{ fontSize: `min(${22 * scale}px, ${5 * scale}cqmin)` }}
          >
            {choice.label}
          </span>
          {embedUrl && (
            <IconButton
              label="Reload agenda"
              icon={RefreshCw}
              spinning={reloading}
              onClick={() => {
                setReloading(true);
                setReloads((n) => n + 1);
              }}
              {...tourAttr('agenda.reload', widget.id)}
            />
          )}
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in Google Slides"
              title="Open in Google Slides"
              className={ICON_BUTTON_CLASS}
              style={ICON_BUTTON_STYLE}
              {...tourAttr('agenda.open-slides', widget.id)}
            >
              <ExternalLink aria-hidden="true" style={ICON_STYLE} />
            </a>
          )}
          <IconButton
            label="Change course"
            icon={Repeat}
            onClick={() => setPicking(true)}
            {...tourAttr('agenda.change-course', widget.id)}
          />
        </div>
      )}

      {blocked && !slideOnly && (
        <div
          role="status"
          className="flex shrink-0 items-center border-y border-slate-200 text-amber-800"
          style={{
            gap: 'min(8px, 2cqmin)',
            padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
            fontSize: `min(${14 * scale}px, ${4.2 * scale}cqmin)`,
          }}
        >
          <AlertTriangle
            aria-hidden="true"
            className="shrink-0"
            style={{
              width: 'min(16px, 4.5cqmin)',
              height: 'min(16px, 4.5cqmin)',
            }}
          />
          <span className="min-w-0 flex-1">Students can’t open this deck.</span>
          <button
            type="button"
            onClick={openMyClasses}
            className="shrink-0 rounded-md font-semibold text-amber-800 underline underline-offset-2 hover:bg-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600"
            style={{
              padding: '0 min(8px, 2cqmin)',
              minHeight: '44px',
            }}
            {...tourAttr('agenda.fix-sharing', widget.id)}
          >
            Fix in My Classes
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1 [container-type:size]">
        {embedUrl ? (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              padding: slideOnly
                ? 'min(8px, 2cqmin)'
                : '0 min(8px, 2cqmin) min(8px, 2cqmin)',
            }}
          >
            <div
              className="relative overflow-hidden rounded-lg bg-white shadow-sm"
              style={{
                width:
                  'min(100cqw - min(16px, 4cqmin), (100cqh - min(8px, 2cqmin)) * 16 / 9)',
                aspectRatio: '16 / 9',
              }}
            >
              {deckSrcDoc ? (
                <iframe
                  title={`Agenda: ${choice.label}`}
                  srcDoc={deckSrcDoc}
                  sandbox=""
                  className="absolute inset-0 block h-full w-full border-none"
                  tabIndex={-1}
                />
              ) : (
                <iframe
                  key={`${agenda?.fileId}-${reloads}`}
                  title={`Agenda: ${choice.label}`}
                  src={embedUrl}
                  className="absolute inset-0 block h-full w-full border-none"
                  allow="fullscreen"
                  tabIndex={-1}
                  onLoad={() => setReloading(false)}
                  allowFullScreen
                />
              )}
              {/* Today's slide stays put: a click drags the widget instead of advancing the deck. */}
              <div aria-hidden="true" className="absolute inset-0" />
            </div>
          </div>
        ) : (
          <ScaledEmptyState
            {...EMPTY_TONE}
            icon={Presentation}
            title="No agenda yet"
            subtitle="Pick a Google Slides deck for this course in My Classes."
            action={
              <FaceButton
                icon={Presentation}
                onClick={openMyClasses}
                scale={scale}
                {...tourAttr('agenda.set-up', widget.id)}
              >
                Set up in My Classes
              </FaceButton>
            }
          />
        )}
      </div>
    </div>
  );
};

const Waiting: React.FC = () => (
  <div
    role="status"
    aria-label="Loading"
    className="flex h-full w-full items-center justify-center text-slate-400"
  >
    <RefreshCw
      aria-hidden="true"
      className="animate-spin motion-reduce:animate-none"
      style={{ width: 'min(28px, 8cqmin)', height: 'min(28px, 8cqmin)' }}
    />
  </div>
);

const CoursePicker: React.FC<{
  widgetId: string;
  choices: AgendaChoice[];
  selectedKey: string | null;
  scale: number;
  onPick: (choice: AgendaChoice) => void;
  onBack?: () => void;
}> = ({ widgetId, choices, selectedKey, scale, onPick, onBack }) => (
  <div className="flex h-full w-full flex-col bg-transparent">
    <div
      className="flex shrink-0 items-center"
      style={{
        gap: 'min(6px, 1.5cqmin)',
        padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
      }}
    >
      {onBack && (
        <IconButton
          label="Back"
          icon={ArrowLeft}
          onClick={onBack}
          {...tourAttr('agenda.picker-back', widgetId)}
        />
      )}
      <h3
        className="font-bold text-slate-800"
        style={{ fontSize: `min(${17 * scale}px, ${5.5 * scale}cqmin)` }}
      >
        Select a course
      </h3>
    </div>
    <ul
      className="min-h-0 flex-1 divide-y divide-slate-200 overflow-y-auto border-t border-slate-200"
      style={{ paddingBottom: 'min(12px, 3cqmin)' }}
    >
      {choices.map((c) => {
        const selected = c.key === selectedKey;
        const sections = sectionsLabel(c.rosters.length);
        const detail = c.course?.agenda?.title ?? 'No agenda yet';
        return (
          <li key={c.key}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(c)}
              className={`flex w-full flex-col items-start text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary ${
                selected
                  ? 'bg-brand-blue-primary text-white'
                  : 'text-slate-800 hover:bg-slate-100'
              }`}
              style={{
                padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                gap: 'min(2px, 0.5cqmin)',
              }}
              {...tourAttr('agenda.pick-course', widgetId)}
            >
              <span
                className="w-full break-words font-semibold"
                style={{ fontSize: `min(${16 * scale}px, ${5 * scale}cqmin)` }}
              >
                {c.label}
              </span>
              <span
                className={`w-full break-words ${selected ? 'text-white/85' : 'text-slate-600'}`}
                style={{ fontSize: `min(${13 * scale}px, ${4 * scale}cqmin)` }}
              >
                {sections ? `${sections} · ${detail}` : detail}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  </div>
);

const ICON_BUTTON_CLASS =
  'inline-flex shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary';
const ICON_BUTTON_STYLE: React.CSSProperties = {
  width: 'max(44px, min(48px, 10cqmin))',
  height: 'max(44px, min(48px, 10cqmin))',
};
const ICON_STYLE: React.CSSProperties = {
  width: 'max(16px, min(20px, 5cqmin))',
  height: 'max(16px, min(20px, 5cqmin))',
};

const IconButton: React.FC<
  {
    label: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    spinning?: boolean;
  } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>
> = ({ label, icon: Icon, spinning = false, ...rest }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={ICON_BUTTON_CLASS}
    style={ICON_BUTTON_STYLE}
    {...rest}
  >
    <Icon
      aria-hidden="true"
      className={
        spinning ? 'animate-spin motion-reduce:animate-none' : undefined
      }
      style={ICON_STYLE}
    />
  </button>
);

const FaceButton: React.FC<
  {
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    scale: number;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ icon: Icon, scale, children, ...rest }) => (
  <button
    type="button"
    className="inline-flex items-center justify-center rounded-lg bg-brand-blue-primary font-semibold text-white hover:bg-brand-blue-light active:bg-brand-blue-dark focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2"
    style={{
      marginTop: 'min(8px, 2cqmin)',
      fontSize: `min(${15 * scale}px, ${4.5 * scale}cqmin)`,
      padding: 'min(8px, 2cqmin) min(14px, 3.5cqmin)',
      gap: 'min(6px, 1.5cqmin)',
      minHeight: '44px',
    }}
    {...rest}
  >
    <Icon
      aria-hidden="true"
      style={{ width: 'min(18px, 4.8cqmin)', height: 'min(18px, 4.8cqmin)' }}
    />
    {children}
  </button>
);
