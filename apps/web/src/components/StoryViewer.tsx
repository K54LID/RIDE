import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, type Story, type StoryAuthor } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import Media from './Media';
import Avatar from './Avatar';
import Sheet from './Sheet';


/**
 * Full-screen story player.
 *
 * Gesture map follows the convention every social app trained people
 * on: tap right = next, tap left = previous, hold = pause, swipe down =
 * close. Progress is one bar per story, the active one animating.
 *
 * Nothing advances on its own; every move is a deliberate tap, so a
 * 9-second clip gets its nine seconds.
 */
export default function StoryViewer({
  authors, startIndex, meId, onClose, onOpenUser,
}: {
  authors: StoryAuthor[];
  startIndex: number;
  meId: string;
  onClose: () => void;
  onOpenUser?: (accountId: string) => void;
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
    viewers: Array<{ viewer_id: string; display_name: string; handle: string;
                     avatar_media_id: string | null; woofed: boolean }>;
    replies: Array<{ body: string; display_name: string; handle: string;
                     sender_id: string; avatar_media_id: string | null }>;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const lastTouch = useRef(0);
  const holdTimer = useRef<number | null>(null);
  const wasHold = useRef(false);

  const author = authors[authorIdx];
  const story = stories?.[storyIdx] ?? null;
  const isMine = author?.author_id === meId;

  useEffect(() => tg.backButton(onClose), [onClose]);

  // The tab bar disappears while a story owns the screen — a nav
  // floating over full-bleed media reads as a rendering glitch.
  useEffect(() => {
    document.body.classList.add('story-open');
    return () => document.body.classList.remove('story-open');
  }, []);

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

    /**
     * Stories no longer advance on a timer. A story used to disappear
     * mid-read after a fixed delay, and a video jumped to the next
     * moment it ended — you could not finish looking at something
     * without holding a finger down. Movement is now entirely
     * deliberate: tap the right third to go forward, the left third to
     * go back. Videos loop instead of ending the story.
     */
    return undefined;
  }, [story]);

  // Hold-to-pause still applies to video; images have nothing to pause.
  useEffect(() => {
    if (!story || story.kind === 'image') return;
    const v = videoRef.current;
    if (v) { if (paused) v.pause(); else void v.play().catch(() => undefined); }
  }, [paused, story]);

  const onTouchStart = (e: React.TouchEvent) => {
    const tch = e.touches[0]!;
    touchStart.current = { x: tch.clientX, y: tch.clientY };
    wasHold.current = false;
    holdTimer.current = window.setTimeout(() => {
      wasHold.current = true;
      setPaused(true);
    }, 220);
  };

  /**
   * Desktop fallback: Telegram Desktop sends clicks, not touches, and
   * the viewer was navigable only by keyboard-less prayer there. A
   * click within 500ms of a touch is the same gesture echoed by the
   * browser and is ignored.
   */
  const onStageClick = (e: React.MouseEvent) => {
    if (viewersOpen) return;
    if (Date.now() - lastTouch.current < 500) return;
    if (e.clientX < window.innerWidth / 3) retreat(); else advance();
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    lastTouch.current = Date.now();
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
         onClick={onStageClick}
         onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
         onTouchCancel={() => { if (holdTimer.current) clearTimeout(holdTimer.current); setPaused(false); }}>
      <div className="story-progress">
        {(stories ?? []).map((s, i) => (
          <div key={s.id} className="story-bar">
            {/* Position, not elapsed time: nothing advances on its own
                any more, so an animated fill would be promising a
                transition that never comes. */}
            <span className={i < storyIdx ? 'full' : i === storyIdx ? 'current' : ''} />
          </div>
        ))}
      </div>

      <div className="story-head"
           onClick={(e) => e.stopPropagation()}
           onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
        <button className="story-name-btn" disabled={isMine || !onOpenUser}
                onClick={() => { if (onOpenUser) { tg.tap('light'); onOpenUser(author.author_id); } }}>
          <Avatar name={author.display_name} mediaId={author.avatar_media_id}
                  size={30} radius={15} />
          <span className="story-name">
            @{author.handle}
          </span>
        </button>
        <div style={{ display: 'flex', gap: 14 }} onTouchStart={(e) => e.stopPropagation()}>
          {isMine
            ? (
              <button className="story-tool" onClick={deleteStory} aria-label={t('story.delete')}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
                </svg>
              </button>
            )
            : <button className="story-tool" onClick={report}>{t('story.report')}</button>}
          <button className="story-tool" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
      </div>

      <div className="story-stage">
        {!story ? <div className="skel" style={{ position: 'absolute', inset: 0 }} /> :
          story.kind === 'video' ? (
            <StoryVideo key={story.id} mediaId={story.media_id} videoRef={videoRef} />
          ) : (
            <Media key={story.id} id={story.media_id} kind="image" />
          )}
      </div>

      <div className="story-foot" onClick={(e) => e.stopPropagation()}
           onTouchStart={(e) => e.stopPropagation()}>
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

      <Sheet center open={viewersOpen} onClose={() => setViewersOpen(false)}>
        <h2 style={{ marginBottom: 12 }}>{t('story.viewers')}</h2>
        {!viewers ? <div className="skel" style={{ height: 60 }} /> : (
          <>
            {viewers.replies.length > 0 ? (
              <>
                <div className="eyebrow" style={{ marginBottom: 8 }}>{t('story.replies')}</div>
                {viewers.replies.map((r, i) => (
                  <div key={i} className="viewer-row">
                    <button className="viewer-id"
                            onClick={() => { setViewersOpen(false); onOpenUser?.(r.sender_id); }}>
                      <Avatar name={r.display_name} mediaId={r.avatar_media_id} size={34} radius={17} />
                      <span className="person-name num" style={{ fontSize: '0.88rem' }}>
                        @{r.handle}
                      </span>
                    </button>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)', flexBasis: '100%' }}>
                      {r.body}
                    </div>
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
                <div key={v.viewer_id} className="viewer-row">
                  <button className="viewer-id"
                          onClick={() => { setViewersOpen(false); onOpenUser?.(v.viewer_id); }}>
                    <Avatar name={v.display_name} mediaId={v.avatar_media_id} size={34} radius={17} />
                    <span className="person-name num" style={{ fontSize: '0.9rem' }}>@{v.handle}</span>
                  </button>
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
function StoryVideo({ mediaId, videoRef }: {
  mediaId: string;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
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
  return <video ref={videoRef} src={url} playsInline loop />;
}
