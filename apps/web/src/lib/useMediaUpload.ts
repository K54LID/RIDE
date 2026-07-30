import { useCallback, useRef, useState } from 'react';
import { tg } from './tg';

const BASE = import.meta.env.VITE_API_BASE ?? 'https://api.ridethatbot.fun';

export interface Pending {
  localId: string;
  previewUrl: string;
  kind: 'image' | 'video';
  mediaId: string | null;   // set once the server accepts it
  error: string | null;
}

/**
 * Uploads happen as soon as a file is picked, not on publish. By the
 * time someone finishes typing a caption the bytes are usually already
 * stored, so the publish tap feels instant.
 *
 * XHR rather than fetch because fetch still can't report upload
 * progress, and a silent 30-second video upload feels broken.
 */
export function useMediaUpload(max = 10) {
  const [items, setItems] = useState<Pending[]>([]);
  const [progress, setProgress] = useState(0);
  const counter = useRef(0);

  const add = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const room = max - items.length;
    const batch = Array.from(files).slice(0, Math.max(0, room));

    for (const file of batch) {
      const localId = `l${counter.current++}`;
      const kind: 'image' | 'video' = file.type.startsWith('video') ? 'video' : 'image';
      const previewUrl = URL.createObjectURL(file);
      setItems((cur) => [...cur, { localId, previewUrl, kind, mediaId: null, error: null }]);

      try {
        const mediaId = await new Promise<string>((resolve, reject) => {
          const form = new FormData();
          form.append('file', file);
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${BASE}/v1/media`);
          xhr.setRequestHeader('Authorization', `tma ${tg.initData()}`);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve((JSON.parse(xhr.responseText) as { id: string }).id);
            } else {
              // Name the cause where we can: a 502 here almost always
              // means the storage channel is misconfigured, which is
              // fixable but invisible from a generic 'upload failed'.
              let msg = 'Upload failed';
              try {
                const b = JSON.parse(xhr.responseText) as { message?: string; error?: string };
                msg = b.message ?? b.error ?? msg;
                if (xhr.status === 502) msg = 'Media storage is not reachable. Ask an admin to run the storage check.';
                if (xhr.status === 413) msg = 'That file is too large.';
                if (xhr.status === 415) msg = 'That file type is not supported.';
              } catch { /* keep default */ }
              reject(new Error(msg));
            }
          };
          xhr.onerror = () => reject(new Error('Upload failed'));
          xhr.send(form);
        });

        setItems((cur) => cur.map((i) => (i.localId === localId ? { ...i, mediaId } : i)));
      } catch (err) {
        setItems((cur) => cur.map((i) =>
          i.localId === localId
            ? { ...i, error: err instanceof Error ? err.message : 'Upload failed' }
            : i));
        tg.notify('error');
      } finally {
        setProgress(0);
      }
    }
  }, [items.length, max]);

  const remove = useCallback((localId: string) => {
    setItems((cur) => {
      const gone = cur.find((i) => i.localId === localId);
      // Release the blob or the webview leaks it for the session.
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return cur.filter((i) => i.localId !== localId);
    });
  }, []);

  const reset = useCallback(() => {
    setItems((cur) => {
      cur.forEach((i) => URL.revokeObjectURL(i.previewUrl));
      return [];
    });
  }, []);

  return {
    items,
    progress,
    add,
    remove,
    reset,
    mediaIds: items.map((i) => i.mediaId).filter((v): v is string => v !== null),
    uploading: items.some((i) => i.mediaId === null && i.error === null),
  };
}

/**
 * One-shot blob upload outside the hook — for programmatic images like
 * the cropped avatar, where there's no <input type=file> in sight.
 */
export function uploadBlob(blob: Blob, filename = 'photo.jpg'): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const form = new FormData();
    form.append('file', blob, filename);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/v1/media`);
    xhr.setRequestHeader('Authorization', `tma ${tg.initData()}`);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((JSON.parse(xhr.responseText) as { id: string }).id);
      } else {
        reject(new Error('Upload failed'));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(form);
  });
}
