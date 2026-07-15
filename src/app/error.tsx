"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="text-sm text-slate-500">Please try again.</p>
      <button onClick={reset} className="btn-primary mt-2">
        Try again
      </button>
    </div>
  );
}
