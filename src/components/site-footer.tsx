import { SITE } from '@/lib/site';

import { FretRail } from './fret-rail';
import { Logo } from './logo';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--color-border)]">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <FretRail className="mb-8" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p className="text-xs text-[var(--color-subtle)]">
            {SITE.tagline} · Demo guitar store — crypto checkout via OMNIPAYX.
          </p>
        </div>
      </div>
    </footer>
  );
}
