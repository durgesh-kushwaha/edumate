import type { ReactNode } from 'react';

type SectionCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export default function SectionCard({ title, subtitle, children, actions }: SectionCardProps) {
  return (
    <section className="surface-card rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
