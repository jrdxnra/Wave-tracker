'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 px-6">
      <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-300">Wave Tracker</p>
        <h1 className="mt-4 text-4xl font-bold text-white">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          The page you were looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-400"
        >
          Return home
        </Link>
      </div>
    </main>
  );
}