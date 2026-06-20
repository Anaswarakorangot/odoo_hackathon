import { Link } from 'react-router-dom';

export default function LandingPage() {
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

      <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-sm" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-4xl">
          <div className="inline-flex items-center justify-center rounded-full bg-slate-900/25 px-4 py-2 text-sm font-semibold tracking-wide text-emerald-300 ring-1 ring-emerald-400/20 mb-6">
            DriveForge Motors ERP Preview
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Automotive operations made simple.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
            Manage sales, purchasing, manufacturing, inventory and user access from one intelligent dashboard.
            Built for modern automotive teams that need speed, visibility, and operational control.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:-translate-y-0.5 hover:shadow-blue-500/40"
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-slate-900/40 transition hover:border-white/40 hover:bg-white/10"
            >
              Sign up
            </Link>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Real-time visibility', value: 'Track every order and inventory move' },
              { label: 'Role-based access', value: 'Secure, permission-driven workflows' },
              { label: 'Future-ready modules', value: 'Sales, purchase, manufacturing and inventory' },
            ].map((item) => (
              <div key={item.label} className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 text-left shadow-xl shadow-slate-950/20">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">{item.label}</p>
                <p className="mt-3 text-sm text-slate-200">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
