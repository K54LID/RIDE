import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type Comment } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Skeleton } from './ui';
import Avatar from './Avatar';
import { VerifiedMark } from './VerifiedMark';

export default function CommentSheet({ postId, meId, onCountChange, onAuthor }: {
  postId: string;
  meId: string;
  onCountChange: (delta: number) => void;
  onAuthor?: (accountId: string) => void;
}) {
  const t = useT();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch<{ comments: Comment[] }>(`/v1/posts/${postId}/comments`)
      .then((r) => setComments(r.comments))
      .catch(() => setComments([]));
  }, [postId]);
  useEffect(load, [load]);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/posts/${postId}/comments`, {
        method: 'POST', body: JSON.stringify({ body: text }),
      });
      setBody('');
      onCountChange(1);
      load();
      tg.tap('light');
    } catch { tg.notify('error'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    tg.tap('light');
    try {
      await apiFetch(`/v1/comments/${id}`, { method: 'DELETE' });
      setComments((cur) => cur?.filter((c) => c.id !== id) ?? cur);
      onCountChange(-1);
    } catch { tg.notify('error'); }
  };

  return (
    <>
      <h2 style={{ marginBottom: 12 }}>{t('comments.title')}</h2>

      {comments === null ? (
        <><Skeleton h={48} mb={8} /><Skeleton h={48} /></>
      ) : comments.length === 0 ? (
        <p style={{ fontSize: '0.88rem', marginBottom: 12 }}>{t('comments.empty')}</p>
      ) : (
        <div style={{ maxHeight: '46vh', overflowY: 'auto', marginBottom: 12 }}>
          {comments.map((c) => (
            <div key={c.id} className="comment">
              {/* Face + name are one tap target into the profile. */}
              <button
                className="comment-author-btn"
                disabled={!onAuthor || c.author_id === meId}
                onClick={() => { if (onAuthor) { tg.tap('light'); onAuthor(c.author_id); } }}
              >
                <Avatar name={c.author_name} mediaId={c.author_avatar_media_id}
                        size={30} radius={10} />
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <button
                  className="comment-author-btn"
                  disabled={!onAuthor || c.author_id === meId}
                  onClick={() => { if (onAuthor) { tg.tap('light'); onAuthor(c.author_id); } }}
                >
                  <span className="comment-author num">
                    @{c.author_handle}
                    {c.author_verified ? <VerifiedMark size={12} /> : null}
                  </span>
                </button>
                <span className="comment-body"> {c.body}</span>
              </div>
              {c.author_id === meId ? (
                <button className="comment-del" onClick={() => remove(c.id)}
                        aria-label={t('post.delete')}>✕</button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="comment-input">
        <input
          value={body}
          maxLength={1000}
          placeholder={t('comments.placeholder')}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
        />
        <button disabled={busy || body.trim().length === 0} onClick={send}>↑</button>
      </div>
    </>
  );
}
