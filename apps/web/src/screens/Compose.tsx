import { useRef, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Button } from '../components/ui';
import { useMediaUpload } from '../lib/useMediaUpload';

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
  const media = useMediaUpload(10);
  const fileInput = useRef<HTMLInputElement>(null);

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/v1/posts', {
        method: 'POST',
        body: JSON.stringify({
          body: body.trim() || undefined,
          media_ids: media.mediaIds.length ? media.mediaIds : undefined,
          visibility,
        }),
      });
      tg.notify('success');
      setBody('');
      media.reset();
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

      {media.items.length > 0 ? (
        <div className="media-strip">
          {media.items.map((m) => (
            <div key={m.localId}
                 className={`media-thumb ${m.mediaId === null && !m.error ? 'pending' : ''}`}>
              {m.kind === 'video'
                ? <video src={m.previewUrl} muted playsInline />
                : <img src={m.previewUrl} alt="" />}
              <button className="remove" aria-label={t('common.close')}
                      onClick={() => { tg.tap('light'); media.remove(m.localId); }}>×</button>
            </div>
          ))}
        </div>
      ) : null}

      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => { void media.add(e.target.files); e.target.value = ''; }}
      />

      <button
        className="pack"
        style={{ justifyContent: 'flex-start', gap: 12 }}
        disabled={media.items.length >= 10}
        onClick={() => { tg.tap('light'); fileInput.current?.click(); }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
             stroke="var(--muted)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <circle cx="8.5" cy="10" r="1.6" />
          <path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" />
        </svg>
        <span style={{ textAlign: 'start' }}>
          <div style={{ fontSize: '0.9rem' }}>{t('compose.addMedia')}</div>
          <div className="hint">
            {media.uploading
              ? `${t('compose.uploading')} ${media.progress}%`
              : `${media.items.length}/10`}
          </div>
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

      <Button
        onClick={publish}
        disabled={busy || media.uploading ||
                  (body.trim().length === 0 && media.mediaIds.length === 0)}
      >
        {busy ? t('compose.publishing') : t('compose.publish')}
      </Button>
      <div style={{ height: 10 }} />
      <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
    </>
  );
}
