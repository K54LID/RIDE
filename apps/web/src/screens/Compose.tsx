import { useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Button } from '../components/ui';

type Visibility = 'public' | 'followers' | 'friends' | 'private';

const OPTIONS: Array<{ v: Visibility; key: 'compose.public' | 'compose.followers' | 'compose.friends' | 'compose.private' }> = [
  { v: 'public', key: 'compose.public' },
  { v: 'followers', key: 'compose.followers' },
  { v: 'friends', key: 'compose.friends' },
  { v: 'private', key: 'compose.private' },
];

const MAX = 2000;

export default function Compose({ onPosted, onCancel }: {
  onPosted: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/v1/posts', {
        method: 'POST',
        body: JSON.stringify({ body: body.trim(), visibility }),
      });
      tg.notify('success');
      setBody('');
      onPosted();
    } catch (err) {
      tg.notify('error');
      setError(err instanceof ApiError ? err.message : 'Could not publish');
    } finally {
      setBusy(false);
    }
  };

  const left = MAX - body.length;

  return (
    <>
      <h2 style={{ marginBottom: 14 }}>{t('compose.title')}</h2>

      <label className="field">
        <textarea
          value={body}
          rows={5}
          maxLength={MAX}
          autoFocus
          placeholder={t('compose.placeholder')}
          onChange={(e) => setBody(e.target.value)}
        />
        {left < 200 ? (
          <span className="hint num" style={{ textAlign: 'end' }}>{left}</span>
        ) : null}
      </label>

      {/* Media is deliberately visible but disabled: hiding it would
          imply text-only is the finished product. */}
      <button
        className="pack"
        disabled
        style={{ justifyContent: 'flex-start', gap: 12 }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
             stroke="var(--faint)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <circle cx="8.5" cy="10" r="1.6" />
          <path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" />
        </svg>
        <span style={{ textAlign: 'start' }}>
          <div style={{ fontSize: '0.9rem' }}>{t('compose.media')}</div>
          <div className="hint">{t('common.soon')}</div>
        </span>
      </button>

      <div className="eyebrow" style={{ margin: '18px 0 8px' }}>{t('compose.visibility')}</div>
      <div className="chips" style={{ marginBottom: 18 }}>
        {OPTIONS.map(({ v, key }) => (
          <button
            key={v}
            type="button"
            className="chip"
            aria-pressed={visibility === v}
            onClick={() => { tg.select(); setVisibility(v); }}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}

      <Button onClick={publish} disabled={busy || body.trim().length === 0}>
        {busy ? t('compose.publishing') : t('compose.publish')}
      </Button>
      <div style={{ height: 10 }} />
      <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
    </>
  );
}
