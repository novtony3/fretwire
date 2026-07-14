'use client';

import { Save } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import type {
  ConfigField,
  ConfigSource,
  PaymentsMode,
  ResolvedPaymentsConfig,
} from '@/lib/payments/types';

type Props = {
  initialEffective: ResolvedPaymentsConfig;
  initialSources: Record<ConfigField, ConfigSource>;
};

/** The five string fields, in display order. `mode` is a separate Select. */
const TEXT_FIELDS = [
  { key: 'apiUrl', label: 'API URL', placeholder: 'https://api.omnipayx.io' },
  { key: 'publicKey', label: 'Public key (client id)', placeholder: '' },
  { key: 'privateKey', label: 'Private key (secret)', placeholder: '' },
  { key: 'ipnSecret', label: 'IPN secret', placeholder: '' },
  { key: 'appUrl', label: 'Site / app URL', placeholder: 'http://localhost:3000' },
] as const satisfies ReadonlyArray<{ key: ConfigField; label: string; placeholder: string }>;

function SourceBadge({ source }: { source: ConfigSource }) {
  const override = source === 'override';
  return (
    <span
      className={
        override
          ? 'rounded-full bg-[color-mix(in_oklab,var(--color-amber)_18%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-amber)]'
          : 'rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-subtle)]'
      }
    >
      {override ? 'override' : 'env'}
    </span>
  );
}

export function DevConfigForm({ initialEffective, initialSources }: Props) {
  const { toast } = useToast();
  const [sources, setSources] = useState(initialSources);
  const [mode, setMode] = useState<PaymentsMode>(initialEffective.mode);
  // Env-sourced fields start empty (env value shown as placeholder hint); only
  // override-sourced fields are pre-filled. Typing sets an override; clearing a
  // field reverts it to env (an empty override falls back on the server).
  const [values, setValues] = useState<Record<(typeof TEXT_FIELDS)[number]['key'], string>>(() => {
    const seed = {} as Record<(typeof TEXT_FIELDS)[number]['key'], string>;
    for (const f of TEXT_FIELDS) {
      seed[f.key] = initialSources[f.key] === 'override' ? initialEffective[f.key] : '';
    }
    return seed;
  });
  const [saving, setSaving] = useState(false);

  const envHint = (key: (typeof TEXT_FIELDS)[number]['key'], fallback: string): string =>
    initialSources[key] === 'env' && initialEffective[key] ? initialEffective[key] : fallback;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/dev/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, ...values }),
      });
      if (!res.ok) throw new Error(`save failed [${res.status}]`);
      const data: { sources: Record<ConfigField, ConfigSource> } = await res.json();
      setSources(data.sources);
      toast('Config saved — applies to the next checkout/IPN.', 'success');
    } catch (err) {
      toast(`Save failed: ${String(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Gateway config</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Dev-only runtime override. A filled field wins over its env var; clear a field to fall
          back to env. Not available in production.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="cfg-mode">Payments mode</Label>
          <SourceBadge source={sources.mode} />
        </div>
        <Select
          id="cfg-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as PaymentsMode)}
        >
          <option value="mock">mock — offline, simulated IPN</option>
          <option value="http">http — real gateway</option>
        </Select>
      </div>

      {TEXT_FIELDS.map((f) => (
        <div key={f.key} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor={`cfg-${f.key}`}>{f.label}</Label>
            <SourceBadge source={sources[f.key]} />
          </div>
          <Input
            id={`cfg-${f.key}`}
            value={values[f.key]}
            placeholder={envHint(f.key, f.placeholder) || undefined}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
        </div>
      ))}

      <Button type="submit" disabled={saving} leftIcon={<Save className="h-4 w-4" />}>
        {saving ? 'Saving…' : 'Save config'}
      </Button>
    </form>
  );
}
