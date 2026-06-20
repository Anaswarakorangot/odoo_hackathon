import type { ReactNode } from 'react';

interface AuthPageShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export default function AuthPageShell({ title, subtitle, children }: AuthPageShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
        src="/landing.mp4"
      />

      <div className="absolute inset-0 bg-slate-950/15 backdrop-blur-sm" />
      <div className="absolute right-[-7rem] top-20 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
      <div className="absolute left-[-7rem] bottom-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-slate-950/70 via-slate-950/10 to-transparent" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 shadow-2xl shadow-slate-950/50 backdrop-blur-xl">
          <div className="text-center mb-8">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-emerald-500 text-white shadow-xl shadow-blue-500/20">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
            <p className="mt-3 text-sm text-slate-300 sm:text-base">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
