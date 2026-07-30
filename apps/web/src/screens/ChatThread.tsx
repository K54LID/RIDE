import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, type ChatMessage } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Skeleton } from '../components/ui';
import { useMediaUpload } from '../lib/useMediaUpload';
import Media from '../components/Media';
import Sheet from '../components/Sheet';

const REACTIONS = ['❤️', '🔥', '😂', '😮', '😢', '🐾'];
const POLL_MS = 2500;

/**
 * A conversation.
 *
 * Polls with an `after` cursor so each tick transfers only new
 * messages. Sending is optimistic — the bubble appears immediately with
 * a pending flag and reconciles when the server assigns a real id.
 */
export default function ChatThread({ conversationId, meId, onBack }: {
  conversationId: string;
  meId: string;
  onBack: () => void;
}) {
  const t = useT();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [peerRead, setPeerRead] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null);
  const [editMsg, setEditMsg] = useState<ChatMessage | null>(null);
  const [editBody, setEditBody] = useState('');

  const media = useMediaUpload(1);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const lastId = useRef<number>(0);
  const poll = useRef<number | null>(null);
  const typingSent = useRef(0);

  useEffect(() => tg.backButton(onBack), [onBack]);

  const scrollDown = () => {
    requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: 'end' }));
  };

  // Initial page.
  useEffect(() => {
    apiFetch<{ messages: ChatMessage[]; peer_last_read_at: string | null; peer_typing: boolean }>(
      `/v1/chats/${conversationId}/messages`)
      .then((r) => {
        setMessages(r.messages);
        setPeerRead(r.peer_last_read_at);
        lastId.current = r.messages.length ? r.messages[r.messages.length - 1]!.id : 0;
        scrollDown();
        void apiFetch(`/v1/chats/${conversationId}/read`, { method: 'POST' }).catch(() => undefined);
      })
      .catch(() => setMessages([]));
  }, [conversationId]);

  // Delta poll.
  const tick = useCallback(() => {
    apiFetch<{ messages: ChatMessage[]; peer_last_read_at: string | null; peer_typing: boolean }>(
      `/v1/chats/${conversationId}/messages?after=${lastId.current}`)
      .then((r) => {
        setPeerRead(r.peer_last_read_at);
        setPeerTyping(r.peer_typing);
        if (r.messages.length === 0) return;
        lastId.current = r.messages[r.messages.length - 1]!.id;
        setMessages((cur) => [...(cur ?? []), ...r.messages]);
        scrollDown();
        void apiFetch(`/v1/chats/${conversationId}/read`, { method: 'POST' }).catch(() => undefined);
      })
      .catch(() => undefined);
  }, [conversationId]);

  useEffect(() => {
    poll.current = window.setInterval(tick, POLL_MS);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [tick]);

  // Publish a story-style media message as soon as the upload lands.
  useEffect(() => {
    if (media.mediaIds.length === 0 || media.uploading) return;
    const mediaId = media.mediaIds[0]!;
    media.reset();
    void apiFetch<{ id: number }>(`/v1/chats/${conversationId}/messages`, {
      method: 'POST', body: JSON.stringify({ media_id: mediaId }),
    }).then(() => tick()).catch(() => tg.notify('error'));
  }, [media, conversationId, tick]);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setBody('');
    const reply = replyTo;
    setReplyTo(null);

    // Optimistic bubble with a negative id — never collides with a real one.
    const temp: ChatMessage = {
      id: -Date.now(), sender_id: meId, kind: 'text', body: text,
      media_id: null, reply_to_id: reply?.id ?? null,
      edited_at: null, deleted_at: null, created_at: new Date().toISOString(),
      reply_body: reply?.body ?? null, reply_author: null,
      reactions: null, my_reaction: null,
    };
    setMessages((cur) => [...(cur ?? []), temp]);
    scrollDown();

    try {
      await apiFetch(`/v1/chats/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: text, reply_to_id: reply?.id ?? undefined }),
      });
      setMessages((cur) => cur?.filter((m) => m.id !== temp.id) ?? cur);
      tick();
    } catch {
      setMessages((cur) => cur?.filter((m) => m.id !== temp.id) ?? cur);
      setBody(text);
      tg.notify('error');
    }
  };

  const onType = (v: string) => {
    setBody(v);
    // Throttle: the server TTL is 4s, so one ping every 3s is enough.
    const now = Date.now();
    if (now - typingSent.current > 3000) {
      typingSent.current = now;
      void apiFetch(`/v1/chats/${conversationId}/typing`, { method: 'POST' }).catch(() => undefined);
    }
  };

  const react = async (m: ChatMessage, emoji: string) => {
    tg.tap('light');
    setMenuMsg(null);
    try {
      await apiFetch(`/v1/messages/${m.id}/react`, {
        method: 'POST', body: JSON.stringify({ emoji }),
      });
      tick();
      setMessages((cur) => cur?.map((x) => x.id === m.id
        ? { ...x, my_reaction: x.my_reaction === emoji ? null : emoji } : x) ?? cur);
    } catch { tg.notify('error'); }
  };

  const remove = async (m: ChatMessage) => {
    setMenuMsg(null);
    setMessages((cur) => cur?.map((x) => x.id === m.id
      ? { ...x, deleted_at: new Date().toISOString(), body: null, media_id: null } : x) ?? cur);
    try { await apiFetch(`/v1/messages/${m.id}`, { method: 'DELETE' }); }
    catch { tg.notify('error'); }
  };

  const saveEdit = async () => {
    if (!editMsg) return;
    const text = editBody.trim();
    try {
      await apiFetch(`/v1/messages/${editMsg.id}`, {
        method: 'PATCH', body: JSON.stringify({ body: text }),
      });
      setMessages((cur) => cur?.map((x) => x.id === editMsg.id
        ? { ...x, body: text, edited_at: new Date().toISOString() } : x) ?? cur);
      setEditMsg(null);
    } catch { tg.notify('error'); }
  };

  const lastMine = messages?.filter((m) => m.sender_id === meId).at(-1);
  const seen = lastMine && peerRead
    ? new Date(peerRead) >= new Date(lastMine.created_at) : false;

  return (
    <div className="screen chat-screen">
      <div className="thread">
        {messages === null ? (
          <><Skeleton h={40} mb={10} /><Skeleton h={40} mb={10} /><Skeleton h={40} /></>
        ) : messages.length === 0 ? (
          <p className="chat-hint">{t('chat.start')}</p>
        ) : messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className={`bubble-row ${mine ? 'mine' : ''}`}>
              <div
                className={`bubble ${mine ? 'mine' : ''} ${m.id < 0 ? 'pending' : ''}`}
                onClick={() => { if (m.deleted_at === null && m.id > 0) setMenuMsg(m); }}
              >
                {m.reply_body ? (
                  <div className="bubble-reply">
                    {m.reply_author ? <b>{m.reply_author}</b> : null}
                    <span>{m.reply_body.slice(0, 90)}</span>
                  </div>
                ) : null}

                {m.deleted_at ? (
                  <em className="bubble-deleted">{t('chat.deleted')}</em>
                ) : (
                  <>
                    {m.media_id ? (
                      <div className="bubble-media">
                        <Media id={m.media_id} kind={m.kind} />
                      </div>
                    ) : null}
                    {m.body ? <span>{m.body}</span> : null}
                  </>
                )}

                {m.reactions && Object.keys(m.reactions).length > 0 ? (
                  <div className="bubble-reactions">
                    {Object.entries(m.reactions).map(([e, n]) => (
                      <span key={e}>{e}{n > 1 ? <b className="num">{n}</b> : null}</span>
                    ))}
                  </div>
                ) : null}

                {m.edited_at && !m.deleted_at ? <i className="bubble-edited">✎</i> : null}
              </div>
            </div>
          );
        })}

        {peerTyping ? (
          <div className="bubble-row">
            <div className="bubble typing"><span /><span /><span /></div>
          </div>
        ) : null}

        {lastMine && !peerTyping ? (
          <div className="receipt">{seen ? t('chat.seen') : t('chat.delivered')}</div>
        ) : null}

        <div ref={bottom} />
      </div>

      <div className="composer">
        {replyTo ? (
          <div className="composer-reply">
            <span>{(replyTo.body ?? '').slice(0, 60)}</span>
            <button onClick={() => setReplyTo(null)}>✕</button>
          </div>
        ) : null}
        <div className="composer-row">
          <input ref={fileInput} type="file" accept="image/*,video/*" hidden
                 onChange={(e) => { void media.add(e.target.files); e.target.value = ''; }} />
          <button className="composer-attach"
                  onClick={() => { tg.tap('light'); fileInput.current?.click(); }}>
            {media.uploading ? <span className="num">{media.progress}%</span> : '＋'}
          </button>
          <input
            value={body}
            placeholder={t('chat.placeholder')}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
          />
          <button className="composer-send" disabled={body.trim().length === 0} onClick={send}>↑</button>
        </div>
      </div>

      <Sheet open={menuMsg !== null} onClose={() => setMenuMsg(null)}>
        {menuMsg ? (
          <>
            <div className="react-row">
              {REACTIONS.map((e) => (
                <button key={e} className={menuMsg.my_reaction === e ? 'on' : ''}
                        onClick={() => react(menuMsg, e)}>{e}</button>
              ))}
            </div>
            <div className="set-list">
              <button className="set-row" onClick={() => { setReplyTo(menuMsg); setMenuMsg(null); }}>
                <span className="set-row-label">{t('chat.reply')}</span>
              </button>
              {menuMsg.sender_id === meId && menuMsg.kind === 'text' ? (
                <button className="set-row" onClick={() => {
                  setEditBody(menuMsg.body ?? ''); setEditMsg(menuMsg); setMenuMsg(null);
                }}>
                  <span className="set-row-label">{t('post.edit')}</span>
                </button>
              ) : null}
              {menuMsg.sender_id === meId ? (
                <button className="set-row danger" onClick={() => remove(menuMsg)}>
                  <span className="set-row-label">{t('post.delete')}</span>
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </Sheet>

      <Sheet open={editMsg !== null} onClose={() => setEditMsg(null)}>
        <h2 style={{ marginBottom: 12 }}>{t('post.edit')}</h2>
        <label className="field">
          <input value={editBody} onChange={(e) => setEditBody(e.target.value)} />
        </label>
        <button className="btn" onClick={saveEdit}>{t('common.save')}</button>
      </Sheet>
    </div>
  );
}
