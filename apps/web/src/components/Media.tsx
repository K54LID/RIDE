import { useEffect, useState } from 'react';
import { tg } from '../lib/tg';

const BASE = import.meta.env.VITE_API_BASE ?? 'https://api.ridethatbot.fun';

/**
 * Media is served from an authenticated endpoint, so a plain <img src>
 * won't work — the browser sends no Authorization header. We fetch the
 * bytes and hand the element an object URL instead.
 */
export default function Media({ id, kind, alt = '' }: {
  id: string;
  kind: string;
  alt?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    fetch(`${BASE}/v1/media/${id}`, {
      headers: { Authorization: `tma ${tg.initData()}` },
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setFailed(true));

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (failed) return <div className="skel" style={{ aspectRatio: '4/3', animation: 'none' }} />;
  if (!url) return <div className="skel" style={{ aspectRatio: '4/3' }} />;
  if (kind === 'video') return <video src={url} controls playsInline preload="metadata" />;
  return <img src={url} alt={alt} loading="lazy" />;
}
