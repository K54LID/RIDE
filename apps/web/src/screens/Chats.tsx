import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, type ChatSummary } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { EmptyState, Skeleton, Button } from '../components/ui';
import Avatar from '../components/Avatar';
import Sheet from '../components/Sheet';
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
 *
 * Each row carries a ⋯ menu: pin the person to the top, or delete the
 * chat (clears it for you; the other person keeps their copy).
 */
export default function Chats({ meId, onOpen, onOpenUser }: {
  meId: string;
  onOpen: (conversationId: string) => void;
  onOpenUser: (accountId: string) => void;
}) {
  const t = useT();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [deleteChat_, setDeleteChat] = useState<ChatSummary | null>(null);
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

  const togglePin = async (c: ChatSummary) => {
    tg.tap('medium');
    // Optimistic: flip and re-sort locally the way the server will.
    setChats((cur) => {
      if (!cur) return cur;
      const next = cur.map((x) => x.id === c.id ? { ...x, pinned: !x.pinned } : x);
      return next.sort((a, b) =>
        Number(b.pinned) - Number(a.pinned)
        || new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
    });
    try { await apiFetch(`/v1/chats/${c.id}/pin`, { method: 'POST' }); }
    catch { tg.notify('error'); load(); }
  };

  const deleteChat = async (c: ChatSummary) => {
    tg.tap('heavy');
    setDeleteChat(null);
    setChats((cur) => cur?.filter((x) => x.id !== c.id) ?? cur);
    try { await apiFetch(`/v1/chats/${c.id}`, { method: 'DELETE' }); }
    catch { tg.notify('error'); load(); }
  };

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
            {/* Avatar → profile; the rest of the row → the chat. */}
            <span role="button" aria-label={c.peer_name}
                  style={{ position: 'relative', flex: 'none' }}
                  onClick={(e) => { e.stopPropagation(); tg.tap('light'); onOpenUser(c.peer_id); }}>
              <Avatar name={c.peer_name} mediaId={c.peer_avatar_media_id} size={48} />
              {c.peer_online ? <span className="chat-online" /> : null}
            </span>
            <div className="chat-main">
              <div className="person-name">
                {c.pinned ? <span className="chat-pin" aria-label={t('chat.pin')}>📌</span> : null}
                {c.peer_name}
                {c.peer_verified ? <VerifiedMark size={14} /> : null}
              </div>
              <div className="chat-preview">{preview(c)}</div>
            </div>
            <div className="chat-meta">
              <span className="num">{ago(c.last_message_at)}</span>
              {c.unread > 0 ? <span className="chat-unread num">{c.unread}</span> : null}
            </div>
            {/* Always-visible per-row actions: pin to top, delete.
                Hiding them behind a menu made both invisible in
                practice. */}
            <span className="chat-acts" onClick={(e) => e.stopPropagation()}>
              <span role="button" className="chat-act" aria-pressed={c.pinned}
                    aria-label={c.pinned ? t('chat.unpin') : t('chat.pin')}
                    onClick={() => togglePin(c)}>
                <svg width="15" height="15" viewBox="0 0 24 24"
                     fill={c.pinned ? 'currentColor' : 'none'}
                     stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                  <path d="M9 4h6l-1 6 3 3v2h-4v5l-1 1-1-1v-5H7v-2l3-3-1-6z" />
                </svg>
              </span>
              <span role="button" className="chat-act danger"
                    aria-label={t('chat.deleteChat')}
                    onClick={() => { tg.tap('light'); setDeleteChat(c); }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
                </svg>
              </span>
            </span>
          </button>
        ))
      )}

      <Sheet open={deleteChat_ !== null} onClose={() => setDeleteChat(null)}>
        {deleteChat_ ? (
          <>
            <h2 style={{ marginBottom: 8 }}>{t('chat.deleteChat')}</h2>
            <p style={{ marginBottom: 16 }}>{t('chat.deleteChat.body')}</p>
            <Button onClick={() => deleteChat(deleteChat_)}>{t('chat.deleteChat')}</Button>
            <div style={{ height: 10 }} />
            <Button variant="ghost" onClick={() => setDeleteChat(null)}>{t('common.cancel')}</Button>
          </>
        ) : null}
      </Sheet>
    </div>
  );
}
