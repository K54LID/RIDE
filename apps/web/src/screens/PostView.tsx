import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type Post } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import Page from '../components/Page';
import Sheet from '../components/Sheet';
import CommentSheet from '../components/CommentSheet';
import { Button, Skeleton } from '../components/ui';
import { PostCard } from './Home';
import { botUrl, botStartUrl } from '../lib/appInfo';

/**
 * One post, full screen — the destination when someone taps "X liked
 * your post" in Alerts. Like, comments and the ⋯ menu behave exactly
 * as they do in the feed, so arriving here never feels like a dead end.
 */
export default function PostView({ postId, meId, onClose, onOpenUser }: {
  postId: string;
  meId: string;
  onClose: () => void;
  onOpenUser: (accountId: string) => void;
}) {
  const t = useT();
  const [post, setPost] = useState<Post | null>(null);
  const [gone, setGone] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  const load = useCallback(() => {
    apiFetch<{ post: Post }>(`/v1/posts/${postId}`)
      .then((r) => setPost(r.post))
      .catch(() => setGone(true));
  }, [postId]);
  useEffect(load, [load]);

  const like = async () => {
    if (!post) return;
    tg.tap('light');
    setPost((p) => p ? {
      ...p, liked: !p.liked, like_count: p.like_count + (p.liked ? -1 : 1),
    } : p);
    try { await apiFetch(`/v1/posts/${postId}/like`, { method: 'POST' }); }
    catch { load(); }
  };

  const toggleSave = async () => {
    if (!post) return;
    tg.tap('light');
    setMenuOpen(false);
    setPost((p) => p ? { ...p, saved: !p.saved } : p);
    try { await apiFetch(`/v1/posts/${postId}/save`, { method: 'POST' }); }
    catch { load(); }
  };

  const share = () => {
    if (!post) return;
    tg.tap('light');
    setMenuOpen(false);
    // "Check out @user 's post on <bot link>" — the link has to be a
    // link to the bot, not bare text, or nobody can act on the share.
    const link = botStartUrl();
    const text = `Check out @${post.author_handle} 's post on ${link}\n\n`
      + `${post.author_name} on RIDE: ${(post.body ?? '').slice(0, 120)}`;
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(botUrl())}&text=${encodeURIComponent(text)}`,
      '_blank');
  };

  const report = async () => {
    try {
      await apiFetch('/v1/report', {
        method: 'POST',
        body: JSON.stringify({ subject_type: 'post', subject_id: postId, reason: 'post_report' }),
      });
      tg.notify('success');
      setMenuOpen(false);
      setReportDone(true);
    } catch { tg.notify('error'); }
  };

  const remove = async () => {
    tg.tap('heavy');
    setMenuOpen(false);
    try {
      await apiFetch(`/v1/posts/${postId}`, { method: 'DELETE' });
      onClose();
    } catch { tg.notify('error'); }
  };

  return (
    <Page title={t('common.post')} onClose={onClose}>
      {gone ? (
        <p style={{ textAlign: 'center', padding: 40 }}>{t('post.gone')}</p>
      ) : !post ? (
        <Skeleton h={140} />
      ) : (
        <PostCard
          post={post}
          meId={meId}
          onLike={like}
          onComment={() => setCommentsOpen(true)}
          onMenu={() => setMenuOpen(true)}
          onSave={toggleSave}
          onAuthor={post.author_id === meId ? undefined : onOpenUser}
        />
      )}

      <Sheet open={commentsOpen} onClose={() => setCommentsOpen(false)}>
        {post ? (
          <CommentSheet
            postId={post.id}
            meId={meId}
            onAuthor={(id) => { setCommentsOpen(false); onOpenUser(id); }}
            onCountChange={(d) => setPost((p) => p
              ? { ...p, comment_count: Math.max(0, p.comment_count + d) } : p)}
          />
        ) : null}
      </Sheet>

      <Sheet center open={reportDone} onClose={() => setReportDone(false)}>
        <h2 style={{ marginBottom: 8 }}>{t('report.sentTitle')}</h2>
        <p style={{ marginBottom: 16 }}>{t('report.sentBody')}</p>
        <Button variant="ghost" onClick={() => setReportDone(false)}>{t('common.done')}</Button>
      </Sheet>

      <Sheet center open={menuOpen} onClose={() => setMenuOpen(false)}>
        {post ? (
          <div className="set-list">
            {post.author_id === meId ? (
              <button className="set-row danger" onClick={remove}>
                <span className="set-row-label">{t('post.delete')}</span>
              </button>
            ) : (
              <>
                <button className="set-row" onClick={toggleSave}>
                  <span className="set-row-label">
                    {post.saved ? t('post.unsave') : t('post.save')}
                  </span>
                </button>
                <button className="set-row" onClick={share}>
                  <span className="set-row-label">{t('post.share')}</span>
                </button>
                <button className="set-row danger" onClick={report}>
                  <span className="set-row-label">{t('post.report')}</span>
                </button>
              </>
            )}
          </div>
        ) : null}
      </Sheet>

      {post === null && !gone ? null : (
        <div style={{ marginTop: 16 }}>
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
        </div>
      )}
    </Page>
  );
}
