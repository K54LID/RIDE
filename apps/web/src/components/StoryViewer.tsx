import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, type Story, type StoryAuthor } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import Media from './Media';
import Sheet from './Sheet';

const IMAGE_MS = 5000;

/**
 * Full-screen story player.
 *
 * Gesture map follows the convention every social app trained people
 * on: tap right = next, tap left = previous, hold = pause, swipe down =
 * close. Progress is one bar per story, the active one animating.
 *
 * Videos advance on their own `ended` event rather than a timer, so a
 * 9-second clip gets its nine seconds.
 */
export default function StoryViewer({
  authors, startIndex, meId, onClose,
}: {
  authors: StoryAuthor[];
  startIndex: number;
  meId: string;
  onClose: () => void;
}) {
  const t = useT();
  const [authorIdx, setAuthorIdx] = useState(startIndex);
  const [stories, setStories] = useState<Story[] | null>(null);
  const [storyIdx, setStoryIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState('');
  const [woofed, setWoofed] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<{
    viewers: Array<{ viewer_id: string; display_name: string; woofed: boolean }>;
    replies: Array<{ body: string; display_name: string }>;
  } | null>(null);

  const timerRef = useRef<number | null>(null);
  const startedAt = useRef(0);
  const remaining = useRef(IMAGE_MS);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const wasHold = useRef(false);

  const author = authors[authorIdx];
  const story = stories?.[storyIdx] ?? null;
  const isMine = author?.author_id === meId;

  useEffect(() => tg.backButton(onClose), [onClose]);

  // Load the author's stories; jump to their first unseen.
  useEffect(() => {
    if (!author) return;
    setStories(null);
    apiFetch<{ stories: Story[] }>(`/v1/stories/author/${author.author_id}`)
      .then((r) => {
        setStories(r.stories);
        const firstUnseen = r.stories.findIndex((s) => !s.seen);
        setStoryIdx(firstUnseen >= 0 ? firstUnseen : 0);
      })
      .catch(onClose);
  }, [author, onClose]);

  const advance = useCallback(() => {
    if (!stories) return;
    if (storyIdx + 1 < stories.length) {
      setStoryIdx((i) => i + 1);
    } else if (authorIdx + 1 < authors.length) {
      setAuthorIdx((i) => i + 1);
    } else {
      onClose();
    }
  }, [stories, storyIdx, authorIdx, authors.length, onClose]);

  const retreat = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx((i) => i - 1);
    } else if (authorIdx > 0) {
      setAuthorIdx((i) => i - 1);
    }
  }, [storyIdx, authorIdx]);

  // Mark viewed + arm the image timer for each story.
  useEffect(() => {
    if (!story) return;
    setWoofed(false);
    setReply('');
    void apiFetch(`/v1/stories/${story.id}/view`, { method: 'POST' }).catch(() => undefined);

    if (story.kind === 'image') {
      remaining.current = IMAGE_MS;
      startedAt.current = Date.now();
      timerRef.current = window.setTimeout(advance, IMAGE_MS);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
    return undefined;
  }, [story, advance]);

  // Pause/resume: freeze the timer's remaining budget or the video.
  useEffect(() => {
    if (!story) return;
    if (story.kind === 'image') {
      if (paused && timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        remaining.current -= Date.now() - startedAt.current;
      } else if (!paused && timerRef.current === null) {
        startedAt.current = Date.now();
        timerRef.current = window.setTimeout(advance, Math.max(300, remaining.current));
      }
    } else {
      const v = videoRef.current;
      if (v) { if (paused) v.pause(); else void v.play().catch(() => undefined); }
    }
  }, [paused, story, advance]);

  const onTouchStart = (e: React.TouchEvent) => {
    const tch = e.touches[0]!;
    touchStart.current = { x: tch.clientX, y: tch.clientY };
    wasHold.current = false;
    holdTimer.current = window.setTimeout(() => {
      wasHold.current = true;
      setPaused(true);
    }, 220);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    const start = touchStart.current;
    touchStart.current = null;

    if (wasHold.current) { setPaused(false); return; }
    if (!start) return;

    const end = e.changedTouches[0]!;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;

    if (dy > 70 && Math.abs(dy) > Math.abs(dx)) { onClose(); return; }
    if (dx < -60) {
      if (authorIdx + 1 < authors.length) setAuthorIdx((i) => i + 1); else onClose();
      return;
    }
    if (dx > 60) { if (authorIdx > 0) setAuthorIdx((i) => i - 1); return; }

    // Plain tap: left third back, rest forward.
    if (start.x < window.innerWidth / 3) retreat(); else advance();
  };

  const woof = async () => {
    if (!story || woofed) return;
    tg.tap('medium');
    setWoofed(true);
    try { await apiFetch(`/v1/stories/${story.id}/react`, { method: 'POST' }); }
    catch { setWoofed(false); }
  };

  const sendReply = async () => {
    if (!story || reply.trim().length === 0) return;
    const text = reply.trim();
    setReply('');
    try {
      await apiFetch(`/v1/stories/${story.id}/reply`, {
        method: 'POST', body: JSON.stringify({ body: text }),
      });
      tg.notify('success');
    } catch { tg.notify('error'); }
  };

  const openViewers = async () => {
    if (!story) return;
    setViewersOpen(true);
    setViewers(null);
    try {
      setViewers(await apiFetch(`/v1/stories/${story.id}/viewers`));
    } catch { setViewers({ viewers: [], replies: [] }); }
  };

  const deleteStory = async () => {
    if (!story) return;
    tg.tap('heavy');
    try {
      await apiFetch(`/v1/stories/${story.id}`, { method: 'DELETE' });
      onClose();
    } catch { tg.notify('error'); }
  };

  const report = async () => {
    if (!story) return;
    try {
      await apiFetch('/v1/report', {
        method: 'POST',
        body: JSON.stringify({ subject_type: 'story', subject_id: story.id, reason: 'story_report' }),
      });
      tg.notify('success');
    } catch { tg.notify('error'); }
  };

  if (!author) return null;

  return (
    <div className="story-viewer"
         onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
         onTouchCancel={() => { if (holdTimer.current) clearTimeout(holdTimer.current); setPaused(false); }}>
      <div className="story-progress">
        {(stories ?? []).map((s, i) => (
          <div key={s.id} className="story-bar">
            <span
              className={i < storyIdx ? 'full' : i === storyIdx && !paused ? 'live' : ''}
              style={i === storyIdx && story?.kind === 'image'
                ? { animationDuration: `${IMAGE_MS}ms` } : undefined}
            />
          </div>
        ))}
      </div>

      <div className="story-head">
        <span className="story-name">{author.display_name}</span>
        <div style={{ display: 'flex', gap: 14 }}>
          {isMine
            ? <button className="story-tool" onClick={deleteStory}>{t('story.delete')}</button>
            : <button className="story-tool" onClick={report}>{t('story.report')}</button>}
          <button className="story-tool" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
      </div>

      <div className="story-stage">
        {!story ? <div className="skel" style={{ position: 'absolute', inset: 0 }} /> :
          story.kind === 'video' ? (
            <StoryVideo key={story.id} mediaId={story.media_id}
                        videoRef={videoRef} onEnded={advance} />
          ) : (
            <Media key={story.id} id={story.media_id} kind="image" />
          )}
      </div>

      <div className="story-foot" onTouchStart={(e) => e.stopPropagation()}>
        {isMine ? (
          <button className="story-viewers" onClick={openViewers}>
            👁 <span className="num">{story?.view_count ?? 0}</span>
            {story && story.reply_count > 0
              ? <> · 💬 <span className="num">{story.reply_count}</span></> : null}
          </button>
        ) : (
          <>
            <input
              value={reply}
              placeholder={t('story.replyPlaceholder')}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void sendReply(); }}
            />
            {reply.trim()
              ? <button className="story-send" onClick={sendReply}>↑</button>
              : (
                <button className={`story-woof ${woofed ? 'on' : ''}`} onClick={woof}>
                  🐾
                </button>
              )}
          </>
        )}
      </div>

      <Sheet open={viewersOpen} onClose={() => setViewersOpen(false)}>
        <h2 style={{ marginBottom: 12 }}>{t('story.viewers')}</h2>
        {!viewers ? <div className="skel" style={{ height: 60 }} /> : (
          <>
            {viewers.replies.length > 0 ? (
              <>
                <div className="eyebrow" style={{ marginBottom: 8 }}>{t('story.replies')}</div>
                {viewers.replies.map((r, i) => (
                  <div key={i} className="person" style={{ display: 'block' }}>
                    <div className="person-name" style={{ fontSize: '0.9rem' }}>{r.display_name}</div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>{r.body}</div>
                  </div>
                ))}
              </>
            ) : null}
            <div className="eyebrow" style={{ margin: '10px 0 8px' }}>
              {t('story.viewers')} · {viewers.viewers.length}
            </div>
            {viewers.viewers.length === 0
              ? <p style={{ fontSize: '0.88rem' }}>{t('story.noViewers')}</p>
              : viewers.viewers.map((v) => (
                <div key={v.viewer_id} className="person">
                  <div className="person-main">
                    <div className="person-name" style={{ fontSize: '0.92rem' }}>{v.display_name}</div>
                  </div>
                  {v.woofed ? <span>🐾</span> : null}
                </div>
              ))}
          </>
        )}
      </Sheet>
    </div>
  );
}

/**
 * Video needs the blob URL (auth header), then plays. Autoplay with
 * sound is often refused by webviews — the catch falls back to muted,
 * which is the accepted convention.
 */
function StoryVideo({ mediaId, videoRef, onEnded }: {
  mediaId: string;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  onEnded: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let dead = false;
    const BASE = import.meta.env.VITE_API_BASE ?? 'https://api.ridethatbot.fun';
    fetch(`${BASE}/v1/media/${mediaId}`, { headers: { Authorization: `tma ${tg.initData()}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => { if (!dead) { objectUrl = URL.createObjectURL(b); setUrl(objectUrl); } })
      .catch(() => undefined);
    return () => { dead = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [mediaId]);

  useEffect(() => {
    const v = videoRef.current;
    if (v && url) {
      v.play().catch(() => { v.muted = true; void v.play().catch(() => undefined); });
    }
  }, [url, videoRef]);

  if (!url) return <div className="skel" style={{ position: 'absolute', inset: 0 }} />;
  return <video ref={videoRef} src={url} playsInline onEnded={onEnded} />;
}
