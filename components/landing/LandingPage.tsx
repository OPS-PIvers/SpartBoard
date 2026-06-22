/**
 * Public landing page — what signed-out visitors see at `/`.
 *
 * Phase 1 of docs/wide-distro-plan.md: replaces the bare LoginScreen for the
 * root route so future external users see what SpartBoard is before being
 * asked to sign in. Internal (orono.k12.mn.us) teachers keep their flow: the
 * sign-in button is the hero CTA, and signed-in users never see this page.
 *
 * The "Bring SpartBoard to your district" CTA points at the /request form
 * (Phase 2).
 *
 * English-only by design (public marketing surface, like /privacy + /terms).
 */
import { APP_NAME } from '@/config/constants';
import React from 'react';
// Local inline-SVG icons (lucide paths, no per-icon forwardRef/merge overhead)
// — see landingIcons.tsx. Pixel-identical to the former lucide-react imports.
import {
  LogIn,
  Loader2,
  LayoutDashboard,
  Timer,
  ListChecks,
  Users,
  ShieldCheck,
  School,
  Sparkles,
  ArrowRight,
} from './landingIcons';
import { useAuth } from '@/context/useAuth';

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: 'Classroom dashboards',
    body: 'Build boards from dozens of widgets — schedules, announcements, seating charts, soundboards, drawing tools — and switch between them per class.',
  },
  {
    icon: Timer,
    title: 'Daily classroom tools',
    body: 'Timers, randomizers, noise meters, Next Up queues, and more. Everything a teacher reaches for during a lesson, in one place on the projector.',
  },
  {
    icon: ListChecks,
    title: 'Quizzes & activities',
    body: 'Run live quizzes, video activities, and guided learning sets. Students join in seconds; you watch progress in real time and review results after.',
  },
  {
    icon: Users,
    title: 'Built for schools',
    body: 'Per-building defaults, admin-managed feature permissions, substitute sharing, and PLC collaboration — designed by a district, for districts.',
  },
] as const;

const TIERS = [
  {
    icon: Sparkles,
    title: 'Try it free',
    body: 'Sign in with any Google account and start building dashboards and running activities. No installs, nothing to configure.',
  },
  {
    icon: School,
    title: 'Pilot it at your school',
    body: 'Want your team to try the full feature set, including Google Drive, Sheets, and Classroom integration? Request a pilot and we will set you up.',
  },
  {
    icon: ShieldCheck,
    title: 'Roll out district-wide',
    body: 'Bring SpartBoard to your whole district with domain-based sign-in, building-level admin controls, and student rostering.',
  },
] as const;

const NAV = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/support', label: 'Support' },
];

export const LandingPage: React.FC = () => {
  const { signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = React.useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Login failed:', error);
      setSigningIn(false);
    }
  };

  const signInButton = (
    <button
      onClick={handleSignIn}
      disabled={signingIn}
      className="group relative inline-flex items-center justify-center gap-3 rounded-2xl bg-brand-blue-primary px-8 py-4 font-bold text-white shadow-lg shadow-brand-blue-primary/25 transition-all duration-200 hover:bg-brand-blue-dark hover:shadow-brand-blue-primary/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
    >
      {signingIn ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <>
          <LogIn className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
          Sign in with Google
        </>
      )}
    </button>
  );

  return (
    // The app locks `body { overflow: hidden }` for the dashboard, so this
    // page is its own viewport-height scroll container (same trick as
    // LegalPageLayout).
    <div className="relative flex h-screen flex-col overflow-y-auto bg-slate-50 font-sans text-slate-800">
      {/* Subtle radial dotted background, matching the login screen */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-50" />

      <header className="relative z-10 border-b border-slate-200/70 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <img src="/favicon.png" alt="" className="h-8 w-8 rounded" />
            <span className="text-lg font-bold text-slate-900">{APP_NAME}</span>
          </div>
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-brand-blue-primary transition hover:bg-brand-blue-primary/10 disabled:opacity-70"
          >
            {signingIn ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            Sign in
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pt-16 pb-14 text-center sm:pt-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
            Your classroom, on one board.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg font-medium text-slate-500">
            {APP_NAME} is a classroom dashboard for teachers — daily tools, live
            activities, and quizzes your students join in seconds. Built by
            educators at Orono Public Schools.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            {signInButton}
            <a
              href="/request"
              className="group inline-flex items-center gap-2 rounded-2xl px-6 py-4 font-bold text-slate-600 transition hover:text-slate-900"
            >
              Bring {APP_NAME} to your district
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </section>

        {/* Feature grid */}
        <section className="mx-auto max-w-5xl px-6 pb-16">
          <div className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-3xl border border-slate-100/60 bg-white/80 p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 backdrop-blur"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-blue-primary to-brand-blue-dark shadow-lg shadow-brand-blue-primary/20">
                  <feature.icon className="h-5 w-5 text-white" />
                </div>
                <h2 className="mb-2 text-lg font-bold text-slate-900">
                  {feature.title}
                </h2>
                <p className="leading-relaxed text-slate-600">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Paths in */}
        <section className="border-t border-slate-200/70 bg-white/60 backdrop-blur">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-center text-2xl font-black tracking-tight text-slate-900">
              Three ways to get started
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {TIERS.map((tier) => (
                <div key={tier.title} className="text-center sm:text-left">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue-primary/10 sm:mx-0">
                    <tier.icon className="h-5 w-5 text-brand-blue-primary" />
                  </div>
                  <h3 className="mb-1 font-bold text-slate-900">
                    {tier.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-600">
                    {tier.body}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-10 text-center text-sm text-slate-500">
              Pilots and district rollouts:{' '}
              <a
                className="font-semibold text-brand-blue-primary underline hover:text-brand-blue-dark"
                href="/request"
              >
                request access
              </a>{' '}
              or email{' '}
              <a
                className="font-semibold text-brand-blue-primary underline hover:text-brand-blue-dark"
                href="mailto:spartboard@orono.k12.mn.us"
              >
                spartboard@orono.k12.mn.us
              </a>
              .
            </p>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Orono Public Schools</span>
          <nav className="flex gap-5">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="transition hover:text-slate-900"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
