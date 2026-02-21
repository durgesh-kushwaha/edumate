export default function Loader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
      <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
      {label}
    </div>
  );
}
