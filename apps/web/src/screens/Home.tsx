import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, type Post, type StoryAuthor } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Button, EmptyState, Skeleton } from '../components/ui';
import { VerifiedMark } from '../components/VerifiedMark';
import Avatar from '../components/Avatar';
import Media from '../components/Media';
import Sheet from '../components/Sheet';
import CommentSheet from '../components/CommentSheet';
import StoriesRail from '../components/StoriesRail';
import StoryViewer from '../components/StoryViewer';
import { botUrl, botStartUrl } from '../lib/appInfo';

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export function PostCard({ post, meId, onLike, onComment, onMenu, onSave, onAuthor }: {
  post: Post;
  meId: string;
  onLike: (id: string) => void;
  onComment: (p: Post) => void;
  onMenu: (p: Post) => void;
  onSave: (p: Post) => void;
  onAuthor?: (accountId: string) => void;
}) {
  return (
    <article className="post">
      <div className="post-head">
        {/* The whole author block is the tap target — a 36px avatar
            alone is a miss on a phone. */}
        <button className="post-author" disabled={!onAuthor}
                onClick={() => { if (onAuthor) { tg.tap('light'); onAuthor(post.author_id); } }}>
          <Avatar name={post.author_name} mediaId={post.author_avatar_media_id} size={36} radius={11} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="person-name num" style={{ fontSize: '0.94rem' }}>
              @{post.author_handle}
              {post.author_verified ? <VerifiedMark size={14} /> : null}
            </div>
            <div className="person-sub">
              {post.place_name ? `${post.place_name} · ` : ''}{timeAgo(post.created_at)}
              {post.edited ? ' · ✎' : ''}
            </div>
          </div>
        </button>
        <button className="post-more" aria-label="⋯"
                onClick={() => { tg.tap('light'); onMenu(post); }}>⋯</button>
      </div>

      {post.body ? <div className="post-body">{post.body}</div> : null}

      {post.media.length > 0 ? (
        <div className={`post-media ${post.media.length === 2 ? 'two' : post.media.length > 2 ? 'many' : ''}`}>
          {(post.media as Array<{ id: string; kind: string }>).map((m) => (
            <Media key={m.id} id={m.id} kind={m.kind} />
          ))}
        </div>
      ) : null}

      <div className="post-actions">
        <button aria-pressed={post.liked} onClick={() => onLike(post.id)}>
          <svg width="17" height="17" viewBox="0 0 24 24"
               fill={post.liked ? 'currentColor' : 'none'}
               stroke="currentColor" strokeWidth="1.8">
            <path d="M12 20C12 20 3.5 14.5 3.5 8.9A4.4 4.4 0 0 1 12 6.9a4.4 4.4 0 0 1 8.5 2c0 5.6-8.5 11.1-8.5 11.1z"
                  strokeLinejoin="round" />
          </svg>
          {post.like_count > 0 ? <span className="num">{post.like_count}</span> : null}
        </button>
        <button onClick={() => { tg.tap('light'); onComment(post); }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M4 5h16v11H8l-4 3.5V5z" />
          </svg>
          {post.comment_count > 0 ? <span className="num">{post.comment_count}</span> : null}
        </button>
        {/* Save is now a direct action on the post — it used to be one
            tap deeper, in the ⋯ menu, which is not where people looked
            for it. */}
        <button className="save" aria-pressed={post.saved} onClick={() => onSave(post)}>
          <svg width="17" height="17" viewBox="0 0 24 24"
               fill={post.saved ? 'currentColor' : 'none'}
               stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M6 4h12v16l-6-4.2L6 20V4z" />
          </svg>
        </button>
      </div>
    </article>
  );
}

/**
 * Home: stories rail, feed with pull-to-refresh and infinite scroll,
 * comments, and a per-post menu (edit/delete for yours, save/share/
 * report for everyone's).
 */
export default function Home({ meId, meName, meAvatar, onCompose, onAlerts, onOpenUser }: {
  meId: string;
  meName: string;
  meAvatar: string | null;
  onCompose: () => void;
  onAlerts: () => void;
  onOpenUser: (accountId: string) => void;
}) {
  const t = useT();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [unread, setUnread] = useState(0);

  const [authors, setAuthors] = useState<StoryAuthor[]>([]);
  const [viewerAt, setViewerAt] = useState<number | null>(null);

  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [menuPost, setMenuPost] = useState<Post | null>(null);
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [editBody, setEditBody] = useState('');
  const [reportDone, setReportDone] = useState(false);

  const [pull, setPull] = useState(0);
  const pullStart = useRef<number | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const loadStories = useCallback(() => {
    apiFetch<{ authors: StoryAuthor[] }>('/v1/stories')
      .then((r) => setAuthors(r.authors))
      .catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    setFailed(false);
    apiFetch<{ posts: Post[]; next_cursor: string | null }>('/v1/feed')
      .then((r) => { setPosts(r.posts); setCursor(r.next_cursor); })
      .catch(() => setFailed(true));
    loadStories();
    apiFetch<{ unread: number }>('/v1/notifications')
      .then((r) => setUnread(r.unread))
      .catch(() => undefined);
  }, [loadStories]);

  useEffect(load, [load]);

  // Infinite scroll: fetch the next page when the sentinel enters view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !cursor) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || loadingMore) return;
      setLoadingMore(true);
      apiFetch<{ posts: Post[]; next_cursor: string | null }>(
        `/v1/feed?before=${encodeURIComponent(cursor)}`)
        .then((r) => {
          setPosts((cur) => [...(cur ?? []), ...r.posts]);
          setCursor(r.next_cursor);
        })
        .catch(() => undefined)
        .finally(() => setLoadingMore(false));
    }, { rootMargin: '600px' });
    io.observe(node);
    return () => io.disconnect();
  }, [cursor, loadingMore]);

  const like = async (id: string) => {
    tg.tap('light');
    setPosts((cur) =>
      cur?.map((p) => p.id === id
        ? { ...p, liked: !p.liked, like_count: p.like_count + (p.liked ? -1 : 1) }
        : p) ?? cur);
    try { await apiFetch(`/v1/posts/${id}/like`, { method: 'POST' }); }
    catch { load(); }
  };

  const toggleSave = async (p: Post) => {
    tg.tap('light');
    setMenuPost(null);
    setPosts((cur) => cur?.map((x) => x.id === p.id ? { ...x, saved: !x.saved } : x) ?? cur);
    try { await apiFetch(`/v1/posts/${p.id}/save`, { method: 'POST' }); }
    catch { load(); }
  };

  const share = (p: Post) => {
    tg.tap('light');
    setMenuPost(null);
    // "Check out @user 's post on <bot link>" — the link has to be a
    // link to the bot, not bare text, or nobody can act on the share.
    const link = botStartUrl();
    const text = `Check out @${p.author_handle} 's post on ${link}\n\n`
      + `${p.author_name} on RIDE: ${(p.body ?? '').slice(0, 120)}`;
    // The bot link opens RIDE inside Telegram. The old website URL sent
    // people to a web page that is not the app.
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(botUrl())}&text=${encodeURIComponent(text)}`,
      '_blank');
  };

  const report = async (p: Post) => {
    try {
      await apiFetch('/v1/report', {
        method: 'POST',
        body: JSON.stringify({ subject_type: 'post', subject_id: p.id, reason: 'post_report' }),
      });
      // A ✓ that vanished after 900ms left people unsure anything had
      // happened. Say plainly where the report went.
      setMenuPost(null);
      setReportDone(true);
      tg.notify('success');
    } catch { tg.notify('error'); }
  };

  const remove = async (p: Post) => {
    tg.tap('heavy');
    setMenuPost(null);
    setPosts((cur) => cur?.filter((x) => x.id !== p.id) ?? cur);
    try { await apiFetch(`/v1/posts/${p.id}`, { method: 'DELETE' }); }
    catch { load(); }
  };

  const saveEdit = async () => {
    if (!editPost) return;
    const body = editBody.trim();
    try {
      await apiFetch(`/v1/posts/${editPost.id}`, {
        method: 'PATCH', body: JSON.stringify({ body }),
      });
      setPosts((cur) => cur?.map((x) => x.id === editPost.id ? { ...x, body, edited: true } : x) ?? cur);
      setEditPost(null);
      tg.notify('success');
    } catch { tg.notify('error'); }
  };

  // Pull-to-refresh: overscroll at the top drags a spinner into view.
  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0) pullStart.current = e.touches[0]!.clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (pullStart.current === null) return;
    const dy = e.touches[0]!.clientY - pullStart.current;
    if (dy > 0 && window.scrollY <= 0) setPull(Math.min(90, dy * 0.5));
  };
  const onTouchEnd = () => {
    if (pull > 55) { tg.tap('medium'); load(); }
    setPull(0);
    pullStart.current = null;
  };

  return (
    <div className="screen"
         onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {pull > 0 ? (
        <div className="ptr" style={{ height: pull, opacity: pull / 70 }}>
          <span className={pull > 55 ? 'spin' : ''}>↻</span>
        </div>
      ) : null}

      <div className="head">
        <h1>{t('home.title')}</h1>
        <div style={{ display: 'flex', gap: 6 }}>
        <button className="icon-btn sm" aria-label={t('common.retry')}
                onClick={() => { tg.tap('medium'); load(); }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
          </svg>
        </button>
        <button className="icon-btn sm" aria-label={t('alerts.title')}
                onClick={() => { tg.tap('light'); onAlerts(); }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a6 6 0 0 0-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 0 0-6-6zM10.5 20a1.8 1.8 0 0 0 3 0" />
          </svg>
          {unread > 0 ? <span className="badge num">{unread > 9 ? '9+' : unread}</span> : null}
        </button>
        </div>
      </div>

      <StoriesRail authors={authors} meId={meId} meName={meName} meAvatar={meAvatar}
                   onOpen={(i) => setViewerAt(i)} onPosted={loadStories} />

      {failed ? (
        <EmptyState title={t('common.offline')} body={t('common.offline.body')}
                    action={<Button onClick={load}>{t('common.retry')}</Button>} />
      ) : posts === null ? (
        <><Skeleton h={96} mb={12} /><Skeleton h={96} mb={12} /><Skeleton h={96} /></>
      ) : posts.length === 0 ? (
        <EmptyState title={t('home.empty')} body={t('home.empty.body')}
                    action={<Button onClick={onCompose}>{t('home.first')}</Button>} />
      ) : (
        <>
          {posts.map((p) => (
            <PostCard key={p.id} post={p} meId={meId}
                      onLike={like} onComment={setCommentPost} onMenu={setMenuPost}
                      onSave={toggleSave}
                      onAuthor={p.author_id === meId ? undefined : onOpenUser} />
          ))}
          <div ref={sentinel} />
          {loadingMore ? <Skeleton h={96} /> : null}
        </>
      )}

      {viewerAt !== null ? (
        <StoryViewer authors={authors} startIndex={viewerAt} meId={meId}
                     onClose={() => { setViewerAt(null); loadStories(); }}
                     onOpenUser={(id) => { setViewerAt(null); loadStories(); onOpenUser(id); }} />
      ) : null}

      <Sheet open={commentPost !== null} onClose={() => setCommentPost(null)}>
        {commentPost ? (
          <CommentSheet postId={commentPost.id} meId={meId}
                        onAuthor={(id) => { setCommentPost(null); onOpenUser(id); }}
                        onCountChange={(d) => setPosts((cur) =>
                          cur?.map((x) => x.id === commentPost.id
                            ? { ...x, comment_count: Math.max(0, x.comment_count + d) } : x) ?? cur)} />
        ) : null}
      </Sheet>

      <Sheet center open={menuPost !== null} onClose={() => setMenuPost(null)}>
        {menuPost ? (
          <div className="set-list">
            {menuPost.author_id === meId ? (
              <>
                <button className="set-row" onClick={() => {
                  setEditBody(menuPost.body ?? '');
                  setEditPost(menuPost);
                  setMenuPost(null);
                }}>
                  <span className="set-row-label">{t('post.edit')}</span>
                </button>
                <button className="set-row danger" onClick={() => remove(menuPost)}>
                  <span className="set-row-label">{t('post.delete')}</span>
                </button>
              </>
            ) : (
              <>
                <button className="set-row" onClick={() => toggleSave(menuPost)}>
                  <span className="set-row-label">
                    {menuPost.saved ? t('post.unsave') : t('post.save')}
                  </span>
                </button>
                <button className="set-row" onClick={() => share(menuPost)}>
                  <span className="set-row-label">{t('post.share')}</span>
                </button>
                <button className="set-row danger" onClick={() => report(menuPost)}>
                  <span className="set-row-label">{t('post.report')}</span>
                </button>
              </>
            )}
          </div>
        ) : null}
      </Sheet>

      <Sheet center open={reportDone} onClose={() => setReportDone(false)}>
        <h2 style={{ marginBottom: 8 }}>{t('report.sentTitle')}</h2>
        <p style={{ marginBottom: 16 }}>{t('report.sentBody')}</p>
        <Button variant="ghost" onClick={() => setReportDone(false)}>{t('common.done')}</Button>
      </Sheet>

      <Sheet center open={editPost !== null} onClose={() => setEditPost(null)}>
        <h2 style={{ marginBottom: 12 }}>{t('post.edit')}</h2>
        <label className="field">
          <textarea rows={4} maxLength={2000} value={editBody}
                    onChange={(e) => setEditBody(e.target.value)} />
        </label>
        <Button onClick={saveEdit}>{t('common.save')}</Button>
      </Sheet>
    </div>
  );
}
