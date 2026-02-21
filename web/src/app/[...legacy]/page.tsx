import { notFound, redirect } from 'next/navigation';

type PageParams = {
  params: Promise<{ legacy: string[] }>;
};

const LEGACY_ROOTS = new Set([
  'attendance',
  'dashboard',
  'courses',
  'fees',
  'marks',
  'academics',
  'exams',
  'profile',
  'login',
  'src',
  '@vite',
  '@react-refresh',
]);

export default async function LegacyRoutePage({ params }: PageParams) {
  const { legacy } = await params;
  const first = String(legacy?.[0] || '').toLowerCase();
  if (LEGACY_ROOTS.has(first)) {
    redirect('/');
  }
  notFound();
}
