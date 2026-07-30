import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type NotificationItem } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { EmptyState, Skeleton } from '../components/ui';

const GLYPH: Record<string, string> = {
  woof: '🐾', gift: '🎁', court: '♛', follow: '👤',
  friend_request: '🤝', friend_accepted: '🤝', comment: '💬',
  post_like: '❤️', achievement: '🏆', referral: '🎟️', featured: '⭐',
};

function ago(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

export default function Alerts({ onBack }: { onBack: () => void }) {
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
    const who = n.actor_name ?? 'Someone';
    switch (n.kind) {
      case 'woof': return `${who} ${t('notif.woofed')}`;
      case 'gift': return `${who} ${t('notif.gifted')}`;
      case 'court': return `${who} ${t('notif.courted')}`;
      case 'follow': return `${who} ${t('notif.followed')}`;
      case 'friend_request': return `${who} ${t('notif.friendRequest')}`;
      case 'friend_accepted': return `${who} ${t('notif.friendAccepted')}`;
      case 'comment': return `${who} ${t('notif.commented')}`;
      case 'referral': return `${who} ${t('notif.referred')}`;
      case 'featured': return t('notif.featured');
      default: return n.kind;
    }
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
          {items.map((n) => (
            <div key={n.id} className="notif" data-unread={n.read_at === null}>
              <span className="notif-glyph">{GLYPH[n.kind] ?? '•'}</span>
              <span className="notif-text">{line(n)}</span>
              <span className="notif-time num">{ago(n.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
