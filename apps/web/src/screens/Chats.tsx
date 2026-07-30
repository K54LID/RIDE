import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, type ChatSummary } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { EmptyState, Skeleton } from '../components/ui';
import Avatar from '../components/Avatar';
import { VerifiedMark } from '../components/VerifiedMark';

function ago(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

/**
 * Conversation list. Polls every 5s while mounted — cheap enough at
 * this scale, and it keeps unread badges honest without a socket.
 */
export default function Chats({ meId, onOpen }: {
  meId: string;
  onOpen: (conversationId: string) => void;
}) {
  const t = useT();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(() => {
    apiFetch<{ chats: ChatSummary[] }>('/v1/chats')
      .then((r) => setChats(r.chats))
      .catch(() => setChats([]));
  }, []);

  useEffect(() => {
    load();
    timer.current = window.setInterval(load, 5000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  const preview = (c: ChatSummary): string => {
    if (c.last_deleted) return t('chat.deleted');
    if (c.last_kind === 'image') return '📷';
    if (c.last_kind === 'video') return '🎬';
    if (!c.last_body) return t('chats.empty');
    return (c.last_sender_id === meId ? `${t('chat.you')}: ` : '') + c.last_body;
  };

  return (
    <div className="screen">
      <div className="head"><h1>{t('chats.title')}</h1></div>

      {chats === null ? (
        <><Skeleton h={64} mb={9} /><Skeleton h={64} mb={9} /><Skeleton h={64} /></>
      ) : chats.length === 0 ? (
        <EmptyState title={t('chats.empty')} body={t('chats.empty.body')} />
      ) : (
        chats.map((c) => (
          <button key={c.id} className="chat-row"
                  onClick={() => { tg.tap('light'); onOpen(c.id); }}>
            <div style={{ position: 'relative', flex: 'none' }}>
              <Avatar name={c.peer_name} mediaId={c.peer_avatar_media_id} size={48} />
              {c.peer_online ? <span className="chat-online" /> : null}
            </div>
            <div className="chat-main">
              <div className="person-name">
                {c.peer_name}
                {c.peer_verified ? <VerifiedMark size={14} /> : null}
              </div>
              <div className="chat-preview">{preview(c)}</div>
            </div>
            <div className="chat-meta">
              <span className="num">{ago(c.last_message_at)}</span>
              {c.unread > 0 ? <span className="chat-unread num">{c.unread}</span> : null}
            </div>
          </button>
        ))
      )}
    </div>
  );
}
