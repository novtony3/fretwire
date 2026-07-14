import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DevConfigForm } from '@/components/dev-config-form';
import { getConfigWithSources } from '@/lib/payments/config';

export const metadata: Metadata = { title: 'Dev · Config', robots: { index: false } };

/** Dev-only gateway config editor. Hidden (404) in production builds. */
export default async function DevConfigPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const { effective, sources } = await getConfigWithSources();
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <DevConfigForm initialEffective={effective} initialSources={sources} />
    </main>
  );
}
