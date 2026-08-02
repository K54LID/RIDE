import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, type ProfilePhoto } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { useMediaUpload, uploadBlob } from '../lib/useMediaUpload';
import Media from './Media';
import CropSheet from './CropSheet';

const BASE = import.meta.env.VITE_API_BASE ?? 'https://api.ridethatbot.fun';

/**
 * Profile photo gallery: add, set primary, delete.
 *
 * Ordering is expressed as "make this the primary" rather than
 * drag-to-reorder — dragging inside a Telegram webview fights the
 * platform's own swipe gestures, and the primary photo is the only
 * position that actually carries meaning anywhere in the app.
 */
export default function PhotoManager() {
  const t = useT();
  const [photos, setPhotos] = useState<ProfilePhoto[] | null>(null);
  // Which photo is actually serving as the avatar — the lowest public
  // one, not whatever happens to sit at index 0.
  const primaryId = (photos ?? [])
    .filter((p) => !p.is_private)
    .sort((a, b) => a.position - b.position)[0]?.id;
  const [cropping, setCropping] = useState<{ photo: ProfilePhoto; src: string } | null>(null);
  const media = useMediaUpload(1);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    apiFetch<{ photos: ProfilePhoto[] }>('/v1/me/photos')
      .then((r) => setPhotos(r.photos))
      .catch(() => setPhotos([]));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (media.mediaIds.length === 0 || media.uploading) return;
    const mediaId = media.mediaIds[0]!;
    media.reset();
    void apiFetch('/v1/me/photos', {
      method: 'POST', body: JSON.stringify({ media_id: mediaId }),
    }).then(() => { tg.notify('success'); load(); })
      .catch(() => tg.notify('error'));
  }, [media, load]);

  const makePrimary = async (id: string) => {
    tg.tap('medium');
    try {
      await apiFetch(`/v1/me/photos/${id}/primary`, { method: 'POST' });
      load();
    } catch { tg.notify('error'); }
  };

  const togglePrivacy = async (photo: ProfilePhoto) => {
    tg.tap('light');
    setPhotos((cur) => cur?.map((p) =>
      p.id === photo.id ? { ...p, is_private: !p.is_private } : p) ?? cur);
    try {
      await apiFetch(`/v1/me/photos/${photo.id}/privacy`, {
        method: 'PATCH', body: JSON.stringify({ is_private: !photo.is_private }),
      });
      load();
    } catch { tg.notify('error'); load(); }
  };

  /**
   * Crop the primary photo. The existing bytes come back through the
   * authenticated media endpoint, get re-framed in the crop editor,
   * and the result is uploaded as a fresh photo that takes position 0;
   * the old one is deleted last so a failure never leaves the profile
   * photo-less.
   */
  const openCrop = async (photo: ProfilePhoto) => {
    tg.tap('light');
    try {
      const res = await fetch(`${BASE}/v1/media/${photo.media_id}`, {
        headers: { Authorization: `tma ${tg.initData()}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      const src = URL.createObjectURL(await res.blob());
      setCropping({ photo, src });
    } catch { tg.notify('error'); }
  };

  const saveCrop = async (blob: Blob) => {
    const old = cropping;
    if (!old) return;
    try {
      const mediaId = await uploadBlob(blob, 'avatar.jpg');
      const created = await apiFetch<{ id: string }>('/v1/me/photos', {
        method: 'POST', body: JSON.stringify({ media_id: mediaId }),
      });
      await apiFetch(`/v1/me/photos/${created.id}/primary`, { method: 'POST' });
      await apiFetch(`/v1/me/photos/${old.photo.id}`, { method: 'DELETE' });
      tg.notify('success');
      setCropping(null);
      URL.revokeObjectURL(old.src);
      load();
    } catch { tg.notify('error'); }
  };

  const remove = async (id: string) => {
    tg.tap('heavy');
    setPhotos((cur) => cur?.filter((p) => p.id !== id) ?? cur);
    try { await apiFetch(`/v1/me/photos/${id}`, { method: 'DELETE' }); load(); }
    catch { tg.notify('error'); load(); }
  };

  return (
    <>
      <input ref={input} type="file" accept="image/*" hidden
             onChange={(e) => { void media.add(e.target.files); e.target.value = ''; }} />

      {media.items.some((m) => m.error) ? (
        <p className="error">{media.items.find((m) => m.error)?.error}</p>
      ) : null}

      <div className="photo-grid">
        {(photos ?? []).map((p) => (
          <div key={p.id}
               className={`photo-cell ${p.id === primaryId ? 'primary' : ''} ${p.is_private ? 'private' : ''}`}>
            <Media id={p.media_id} kind="image" thumb />
            {p.id === primaryId ? <span className="photo-tag">{t('photos.primary')}</span> : null}
            <div className="photo-tools">
              {p.id === primaryId ? (
                <button onClick={() => void openCrop(p)} aria-label={t('photo.adjust')}>✂️</button>
              ) : null}
              <button onClick={() => togglePrivacy(p)}
                      aria-label={t('album.togglePhoto')}>{p.is_private ? '🔒' : '🌐'}</button>
              {p.position !== 0 && !p.is_private ? (
                <button onClick={() => makePrimary(p.id)} aria-label={t('photos.makePrimary')}>★</button>
              ) : null}
              <button onClick={() => remove(p.id)} aria-label={t('post.delete')}>✕</button>
            </div>
          </div>
        ))}

        {(photos?.length ?? 0) < 9 ? (
          <button className="photo-cell add"
                  disabled={media.uploading}
                  onClick={() => { tg.tap('light'); input.current?.click(); }}>
            {media.uploading ? <span className="num">{media.progress}%</span> : '+'}
          </button>
        ) : null}
      </div>

      {photos !== null && photos.length === 0 && !media.uploading ? (
        <p className="hint" style={{ marginTop: 8 }}>{t('photos.empty')}</p>
      ) : null}

      {cropping ? (
        <CropSheet
          src={cropping.src}
          onCancel={() => { URL.revokeObjectURL(cropping.src); setCropping(null); }}
          onSave={saveCrop}
        />
      ) : null}
    </>
  );
}
