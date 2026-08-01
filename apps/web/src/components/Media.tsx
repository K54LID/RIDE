import { useCallback, useEffect, useRef, useState } from 'react';
import { tg } from '../lib/tg';

const BASE = import.meta.env.VITE_API_BASE ?? 'https://api.ridethatbot.fun';

/** Fetch an authenticated media blob and return an object URL. */
async function loadBlobUrl(id: string, thumb: boolean): Promise<string> {
  const res = await fetch(`${BASE}/v1/media/${id}${thumb ? '?thumb=1' : ''}`, {
    headers: { Authorization: `tma ${tg.initData()}` },
  });
  if (!res.ok) throw new Error(String(res.status));
  return URL.createObjectURL(await res.blob());
}

/**
 * Media is served from an authenticated endpoint, so a plain <img src>
 * won't work — the browser sends no Authorization header. We fetch the
 * bytes and hand the element an object URL instead.
 *
 * Video is deliberately two-stage: only the poster frame loads with the
 * feed, and the video itself is not requested until someone taps play.
 * Autoplaying would pull every clip down as you scrolled past, and even
 * `preload="metadata"` costs a request per video — neither is
 * reasonable over mobile data. The tap is the gesture that says "this
 * one", and it doubles as the user gesture browsers require to play.
 */
export default function Media({ id, kind, alt = '', thumb = false }: {
  id: string;
  kind: string;
  alt?: string;
  thumb?: boolean;
}) {
  const isVideo = kind === 'video';

  // For video this is the poster frame; for images, the image itself.
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [failed, setFailed] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let alive = true;
    let created: string | null = null;

    // Video always requests the thumb here — that IS its poster.
    loadBlobUrl(id, isVideo ? true : thumb)
      .then((u) => {
        if (!alive) { URL.revokeObjectURL(u); return; }
        created = u;
        setPosterUrl(u);
      })
      .catch(() => {
        if (!alive) return;
        // A video with no stored poster is not a broken video: the API
        // 404s the thumb precisely so we don't stream the whole clip.
        // Show the play button over an empty tile instead of failing.
        if (isVideo) setPosterUrl(null); else setFailed(true);
      });

    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id, thumb, isVideo]);

  // The video blob outlives the poster effect, so it is revoked apart.
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  const play = useCallback(async () => {
    if (videoUrl || loadingVideo) return;
    tg.tap('light');
    setLoadingVideo(true);
    try {
      const u = await loadBlobUrl(id, false);
      setVideoUrl(u);
      requestAnimationFrame(() => { void videoRef.current?.play().catch(() => undefined); });
    } catch {
      // Most often a clip stored before the 19 MB limit existed:
      // uploaded fine, but the Bot API will not download it back.
      setVideoError(true);
    } finally {
      setLoadingVideo(false);
    }
  }, [id, videoUrl, loadingVideo]);

  if (failed) return <div className="skel" style={{ aspectRatio: '4/3', animation: 'none' }} />;

  if (isVideo) {
    if (videoUrl) {
      return <video ref={videoRef} src={videoUrl} controls playsInline autoPlay />;
    }
    return (
      <button type="button" className="video-poster" onClick={play}
              aria-label={alt || 'Play video'}>
        {posterUrl
          ? <img src={posterUrl} alt={alt} loading="lazy" />
          : (
            /* No stored poster — the API 404s that case rather than
               streaming the whole clip to build one. A deliberate
               placeholder beats a blank rectangle. */
            <div className="video-blank" style={{ aspectRatio: '4/3' }} />
          )}
        {videoError ? <span className="video-failed">Video unavailable</span> : null}
        <span className={`video-play ${loadingVideo ? 'loading' : ''}`} aria-hidden="true">
          {loadingVideo ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13l11-6.5-11-6.5z" />
            </svg>
          )}
        </span>
      </button>
    );
  }

  if (!posterUrl) return <div className="skel" style={{ aspectRatio: '4/3' }} />;
  return <img src={posterUrl} alt={alt} loading="lazy" />;
}
