import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import LightRays from '../background/LightRays';
import BrandMark from '../brand/BrandMark';

interface AuthPageShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export default function AuthPageShell({ title, subtitle, children }: AuthPageShellProps) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0">
        <LightRays
          raysOrigin="top-center"
          raysColor="#ffffff"
          raysSpeed={1}
          lightSpread={0.5}
          rayLength={3}
          followMouse
          mouseInfluence={0.1}
          noiseAmount={0}
          distortion={0}
          pulsating={false}
          fadeDistance={1}
          saturation={1}
          className="absolute inset-0 h-full w-full"
        />
      </div>

      <div className="absolute inset-0 bg-slate-950/15" />
      <div className="absolute right-[-7rem] top-16 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute left-[-7rem] bottom-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-950/80 via-slate-950/20 to-transparent" />

      <div className="relative z-10 flex min-h-screen flex-col px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between rounded-full border border-white/10 bg-slate-950/35 px-4 py-3 shadow-2xl shadow-slate-950/20 backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark showTagline />
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              to="/login"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Sign up
            </Link>
            <Link
              to="/login/admin"
              className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:border-red-400/40 hover:bg-red-500/15"
            >
              Admin
            </Link>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-2 py-10 text-center sm:py-14">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-6xl pb-2 sm:pb-4 lg:pb-6">
          <div className="rounded-[2rem] border border-cyan-500/10 bg-slate-950/45 px-5 py-6 shadow-[0_0_0_1px_rgba(8,145,178,0.06)] backdrop-blur-sm sm:px-8 sm:py-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
