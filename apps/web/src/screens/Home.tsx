import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type Post } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Button, EmptyState, Skeleton } from '../components/ui';
import { VerifiedMark } from '../components/VerifiedMark';
import Media from '../components/Media';

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

function PostCard({ post, onLike }: { post: Post; onLike: (id: string) => void }) {
  return (
    <article className="post">
      <div className="post-head">
        <div className="person-avatar" style={{ width: 36, height: 36, borderRadius: 11, fontSize: '0.9rem' }}>
          {post.author_name.trim().charAt(0).toUpperCase() || '?'}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="person-name" style={{ fontSize: '0.94rem' }}>
            {post.author_name}
            {post.author_verified ? <VerifiedMark size={14} /> : null}
          </div>
          <div className="person-sub">
            {post.place_name ? `${post.place_name} · ` : ''}{timeAgo(post.created_at)}
          </div>
        </div>
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
      </div>
    </article>
  );
}

export default function Home({ onCompose, onAlerts }: {
  onCompose: () => void;
  onAlerts: () => void;
}) {
  const t = useT();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    apiFetch<{ posts: Post[] }>('/v1/feed')
      .then((r) => setPosts(r.posts))
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  const like = async (id: string) => {
    tg.tap('light');
    // Optimistic: the round trip is short but the tap should feel instant.
    setPosts((cur) =>
      cur?.map((p) =>
        p.id === id
          ? { ...p, liked: !p.liked, like_count: p.like_count + (p.liked ? -1 : 1) }
          : p,
      ) ?? cur,
    );
    try {
      await apiFetch(`/v1/posts/${id}/like`, { method: 'POST' });
    } catch {
      load(); // reconcile against the server rather than guessing
    }
  };

  return (
    <div className="screen">
      <div className="head">
        <h1>{t('home.title')}</h1>
        <button className="icon-btn" aria-label={t('alerts.title')} onClick={() => { tg.tap('light'); onAlerts(); }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a6 6 0 0 0-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 0 0-6-6zM10.5 20a1.8 1.8 0 0 0 3 0" />
          </svg>
        </button>
      </div>

      {/* Stories rail sits above the feed, where it will live for real. */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>{t('home.stories')}</div>
        <p style={{ fontSize: '0.85rem' }}>{t('soon.stories.body')}</p>
      </div>

      {failed ? (
        <EmptyState title={t('common.offline')} body={t('common.offline.body')}
                    action={<Button onClick={load}>{t('common.retry')}</Button>} />
      ) : posts === null ? (
        <>
          <Skeleton h={96} mb={12} />
          <Skeleton h={96} mb={12} />
          <Skeleton h={96} />
        </>
      ) : posts.length === 0 ? (
        <EmptyState title={t('home.empty')} body={t('home.empty.body')}
                    action={<Button onClick={onCompose}>{t('home.first')}</Button>} />
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} onLike={like} />)
      )}
    </div>
  );
}
