import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type Post } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { EmptyState, Skeleton } from '../components/ui';
import { PostCard } from './Home';

export default function Saved({ meId, onBack }: { meId: string; onBack: () => void }) {
  const t = useT();
  const [posts, setPosts] = useState<Post[] | null>(null);

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
    setPosts((cur) => cur?.filter((x) => x.id !== p.id) ?? cur);
    try { await apiFetch(`/v1/posts/${p.id}/save`, { method: 'POST' }); } catch { load(); }
  };

  return (
    <div className="screen">
      <div className="head"><h1>{t('saved.title')}</h1></div>
      {posts === null ? (
        <><Skeleton h={96} mb={12} /><Skeleton h={96} /></>
      ) : posts.length === 0 ? (
        <EmptyState title={t('saved.empty')} body={t('saved.empty.body')} />
      ) : (
        posts.map((p) => (
          <PostCard key={p.id} post={p} meId={meId}
                    onLike={like} onComment={() => undefined} onMenu={unsave} />
        ))
      )}
    </div>
  );
}
