import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type NotificationItem } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { EmptyState, Skeleton } from '../components/ui';
import Media from '../components/Media';
import Avatar from '../components/Avatar';

const GLYPH: Record<string, string> = {
  woof: '🐾', gift: '🎁', court: '👑', follow: '👤',
  friend_request: '🤝', friend_accepted: '🤝', comment: '💬',
  post_like: '❤️', achievement: '🏆', referral: '🎟️', featured: '⭐',
  message: '✉️', story_reply: '💬',
};

function ago(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

/**
 * Every notification is a doorway, not a caption: post events land on
 * the post (with a thumbnail of it right in the row), people events
 * land on the person, messages land in the chat. Opening the screen is
 * still the read event.
 */
export default function Alerts({ onBack, onOpenUser, onOpenPost, onOpenChat }: {
  onBack: () => void;
  onOpenUser: (accountId: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenChat: (conversationId: string) => void;
}) {
  const t = useT();
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  useEffect(() => tg.backButton(onBack), [onBack]);

  const load = useCallback(() => {
    apiFetch<{ notifications: NotificationItem[] }>('/v1/notifications')
      .then((r) => {
        setItems(r.notifications);
        // Opening the screen is the read event; no separate button.
        if (r.notifications.some((n) => n.read_at === null)) {
          void apiFetch('/v1/notifications/read', { method: 'POST' }).catch(() => undefined);
        }
      })
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  const line = (n: NotificationItem): string => {
    // Handles are the identifier everywhere outside the profile header
    // and the Discover grid, alerts included.
    const who = n.actor_handle ? `@${n.actor_handle}` : n.actor_name ?? 'Someone';
    switch (n.kind) {
      case 'woof': return `${who} ${t('notif.woofed')}`;
      case 'gift': return `${who} ${t('notif.gifted')}`;
      case 'court': return `${who} ${t('notif.courted')}`;
      case 'follow': return `${who} ${t('notif.followed')}`;
      case 'friend_request': return `${who} ${t('notif.friendRequest')}`;
      case 'friend_accepted': return `${who} ${t('notif.friendAccepted')}`;
      case 'comment': return `${who} ${t('notif.commented')}`;
      case 'post_like': return `${who} ${t('notif.likedPost')}`;
      case 'story_reply': return `${who} ${t('notif.storyReply')}`;
      case 'message': return `${who} ${t('notif.message')}`;
      case 'achievement': return t('notif.achievement');
      case 'referral': return `${who} ${t('notif.referred')}`;
      case 'featured': return t('notif.featured');
      // Unknown kinds degrade to something human rather than a raw
      // snake_case identifier on screen.
      default: return `${who} · ${n.kind.replace(/_/g, ' ')}`;
    }
  };

  /**
   * Where a tap lands. Post events go to the post; the rest go to the
   * person or the chat. Null means the row is informational only.
   */
  const destination = (n: NotificationItem): (() => void) | null => {
    if (n.post_id && (n.kind === 'post_like' || n.kind === 'comment')) {
      const id = n.post_id;
      return () => onOpenPost(id);
    }
    if (n.kind === 'message') {
      const conv = n.payload.conversation_id;
      if (typeof conv === 'string') return () => onOpenChat(conv);
    }
    if (n.actor_id) {
      const id = n.actor_id;
      return () => onOpenUser(id);
    }
    return null;
  };

  return (
    <div className="screen">
      <div className="head"><h1>{t('alerts.title')}</h1></div>

      {items === null ? (
        <><Skeleton h={56} mb={9} /><Skeleton h={56} mb={9} /><Skeleton h={56} /></>
      ) : items.length === 0 ? (
        <EmptyState title={t('alerts.empty')} body={t('alerts.empty.body')} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {items.map((n) => {
            const go = destination(n);
            return (
              <button key={n.id} className="notif-btn" data-unread={n.read_at === null}
                      disabled={!go}
                      onClick={() => { if (go) { tg.tap('light'); go(); } }}>
                {/* Face plus the kind-glyph as a small badge, rather
                    than a glyph alone — you should be able to tell who
                    it was without reading the sentence. */}
                {n.actor_id ? (
                  <span className="notif-face">
                    <Avatar name={n.actor_name ?? '?'}
                            mediaId={n.actor_avatar_media_id} size={38} radius={19} />
                    <span className="notif-badge">{GLYPH[n.kind] ?? '•'}</span>
                  </span>
                ) : (
                  <span className="notif-glyph">{GLYPH[n.kind] ?? '•'}</span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="notif-text">{line(n)}</span>
                  {n.post_id && !n.post_media_id && n.post_excerpt ? (
                    <span className="notif-excerpt">“{n.post_excerpt}”</span>
                  ) : null}
                </span>
                {n.post_media_id ? (
                  <span className="notif-thumb">
                    <Media id={n.post_media_id} kind="image" thumb />
                  </span>
                ) : null}
                <span className="notif-time num">{ago(n.created_at)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
