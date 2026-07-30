import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type Post } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { EmptyState, Skeleton } from '../components/ui';
import Sheet from '../components/Sheet';
import CommentSheet from '../components/CommentSheet';
import { PostCard } from './Home';

export default function Saved({ meId, onBack, onOpenUser }: {
  meId: string; onBack: () => void; onOpenUser: (accountId: string) => void;
}) {
  const t = useT();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [menuPost, setMenuPost] = useState<Post | null>(null);

  useEffect(() => tg.backButton(onBack), [onBack]);

  const load = useCallback(() => {
    apiFetch<{ posts: Post[] }>('/v1/saved')
      .then((r) => setPosts(r.posts))
      .catch(() => setPosts([]));
  }, []);
  useEffect(load, [load]);

  const like = async (id: string) => {
    tg.tap('light');
    setPosts((cur) => cur?.map((p) => p.id === id
      ? { ...p, liked: !p.liked, like_count: p.like_count + (p.liked ? -1 : 1) } : p) ?? cur);
    try { await apiFetch(`/v1/posts/${id}/like`, { method: 'POST' }); } catch { load(); }
  };

  const unsave = async (p: Post) => {
    tg.tap('light');
    setMenuPost(null);
    setPosts((cur) => cur?.filter((x) => x.id !== p.id) ?? cur);
    try { await apiFetch(`/v1/posts/${p.id}/save`, { method: 'POST' }); } catch { load(); }
  };

  const share = (p: Post) => {
    tg.tap('light');
    setMenuPost(null);
    const text = `${p.author_name} on RIDE: ${(p.body ?? '').slice(0, 120)}`;
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent('https://ridethatbot.fun')}&text=${encodeURIComponent(text)}`,
      '_blank');
  };

  return (
    <div className="screen">
      <div className="head">
        {/* Telegram's own back button also works, but it isn't visible
            in every client — an on-screen arrow leaves no doubt. */}
        <button className="icon-btn sm" aria-label={t('common.back')}
                onClick={() => { tg.tap('light'); onBack(); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 style={{ flex: 1 }}>{t('saved.title')}</h1>
      </div>

      {posts === null ? (
        <><Skeleton h={96} mb={12} /><Skeleton h={96} /></>
      ) : posts.length === 0 ? (
        <EmptyState title={t('saved.empty')} body={t('saved.empty.body')} />
      ) : (
        posts.map((p) => (
          <PostCard key={p.id} post={p} meId={meId}
                    onLike={like} onComment={setCommentPost} onMenu={setMenuPost}
                    onAuthor={p.author_id === meId ? undefined : onOpenUser} />
        ))
      )}

      <Sheet open={commentPost !== null} onClose={() => setCommentPost(null)}>
        {commentPost ? (
          <CommentSheet
            postId={commentPost.id}
            meId={meId}
            onAuthor={(id) => { setCommentPost(null); onOpenUser(id); }}
            onCountChange={(d) => setPosts((cur) => cur?.map((x) =>
              x.id === commentPost.id
                ? { ...x, comment_count: Math.max(0, x.comment_count + d) } : x) ?? cur)}
          />
        ) : null}
      </Sheet>

      {/* The ⋯ opens a menu here too. Previously it silently unsaved,
          which is a destructive action behind an ambiguous affordance. */}
      <Sheet open={menuPost !== null} onClose={() => setMenuPost(null)}>
        {menuPost ? (
          <div className="set-list">
            <button className="set-row" onClick={() => share(menuPost)}>
              <span className="set-row-label">{t('post.share')}</span>
            </button>
            <button className="set-row danger" onClick={() => unsave(menuPost)}>
              <span className="set-row-label">{t('post.unsave')}</span>
            </button>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
