import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { tg } from '../lib/tg';
import { useI18n, LOCALES, type Locale } from '../i18n';
import { Button, Skeleton } from '../components/ui';
import Sheet from '../components/Sheet';
import Page from '../components/Page';
import Avatar from '../components/Avatar';
import Legal from './Legal';
import { useMediaUpload } from '../lib/useMediaUpload';

type Vis = 'everyone' | 'members' | 'friends' | 'nobody';

interface SettingsState {
  locale: string | null;
  profile_visibility: Vis;
  story_visibility: Vis;
  show_online: boolean;
  show_last_seen: boolean;
  ghost_mode: boolean;
  verification: 'none' | 'pending' | 'approved' | 'rejected';
  notifications: Record<string, boolean>;
  blocked: Array<{ blocked_id: string; display_name: string; handle: string;
                   avatar_media_id: string | null }>;
  role: 'user' | 'moderator' | 'admin';
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="switch" role="switch" aria-checked={on}
            onClick={() => { tg.select(); onChange(!on); }} />
  );
}

function Row({ label, sub, right, onClick, danger }: {
  label: string; sub?: string; right?: React.ReactNode;
  onClick?: () => void; danger?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`set-row ${danger ? 'danger' : ''}`} onClick={onClick}>
      <span>
        <div className="set-row-label">{label}</div>
        {sub ? <div className="set-row-sub">{sub}</div> : null}
      </span>
      {right}
    </Tag>
  );
}

export default function Settings({ onBack, onAdmin }: {
  onBack: () => void;
  onAdmin: () => void;
}) {
  const { t, locale, setLocale } = useI18n();
  const [s, setS] = useState<SettingsState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [verifyIntro, setVerifyIntro] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null);
  /** Which support form is open, if any. */
  const [writing, setWriting] = useState<'support' | 'bug' | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const selfie = useMediaUpload(1);
  const selfieInput = useRef<HTMLInputElement>(null);

  useEffect(() => tg.backButton(onBack), [onBack]);

  const load = useCallback(() => {
    apiFetch<SettingsState>('/v1/settings').then(setS).catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  /** Optimistic: toggles must feel instant; reconcile on failure. */
  const patch = async (body: Record<string, unknown>) => {
    setS((cur) => (cur ? { ...cur, ...body } as SettingsState : cur));
    try {
      await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify(body) });
    } catch {
      tg.notify('error');
      load();
    }
  };

  const patchNotif = (key: string, value: boolean) => {
    setS((cur) => (cur ? { ...cur, notifications: { ...cur.notifications, [key]: value } } : cur));
    apiFetch('/v1/settings', {
      method: 'PATCH',
      body: JSON.stringify({ notifications: { [key]: value } }),
    }).catch(() => { tg.notify('error'); load(); });
  };

  /**
   * A verification request carries a selfie when one is picked — the
   * reviewer needs something to compare against. Without a photo it
   * still queues, so the flow is never blocked by a camera problem.
   */
  /**
   * Explain first, then open the camera. Previously tapping Request
   * opened a file picker with no context, so nobody knew a selfie was
   * being asked for or who would see it.
   */
  const requestVerification = () => {
    tg.tap('medium');
    setVerifyIntro(true);
  };

  useEffect(() => {
    if (selfie.mediaIds.length === 0 || selfie.uploading) return;
    const mediaId = selfie.mediaIds[0]!;
    selfie.reset();
    void apiFetch('/v1/verification', {
      method: 'POST', body: JSON.stringify({ media_id: mediaId }),
    }).then(() => { tg.notify('success'); setVerifySent(true); load(); })
      .catch(() => tg.notify('error'));
  }, [selfie, load]);

  /**
   * Both support buttons used to open https://t.me/ — a link to
   * Telegram's home page. Whatever anyone typed went nowhere, so the
   * app has been shipping with no way to reach its own operator. This
   * stores the message for the admin panel and pushes it to every staff
   * account's Telegram with the sender and the text in it.
   */
  const sendSupport = async () => {
    const message = draft.trim();
    if (!message || !writing) return;
    setSending(true);
    setSendError(null);
    try {
      await apiFetch('/v1/support', {
        method: 'POST',
        body: JSON.stringify({ kind: writing, message }),
      });
      tg.notify('success');
      setWriting(null);
      setDraft('');
      setSent(true);
    } catch (err) {
      tg.notify('error');
      setSendError(err instanceof Error ? err.message : t('common.offline.body'));
    } finally {
      setSending(false);
    }
  };

  const deleteAccount = async () => {
    try {
      await apiFetch('/v1/settings/delete-account', { method: 'POST' });
      window.location.reload();
    } catch {
      tg.notify('error');
    }
  };

  if (!s) {
    return (
      <div className="screen">
        <div className="head"><h1>{t('settings.title')}</h1></div>
        <Skeleton h={140} mb={16} /><Skeleton h={140} />
      </div>
    );
  }

  const isStaff = s.role === 'admin' || s.role === 'moderator';
  const notif = s.notifications ?? {};

  return (
    <div className="screen">
      {/* Telegram's own back button is registered too, but it is not
          reliable to lean on alone: any overlay opened from this screen
          used to hide it on the way out and leave Settings with no way
          back at all. An in-screen control cannot be taken away by
          something else's cleanup. */}
      <div className="head">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="page-back" aria-label={t('common.back')}
                  onClick={() => { tg.tap('light'); onBack(); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                 strokeLinejoin="round">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {t('settings.title')}
          {isStaff ? <span className="staff-tag">{s.role}</span> : null}
        </h1>
      </div>

      {/* Staff entry point lives here and nowhere else, so a normal
          account never sees a door it cannot open. */}
      {isStaff ? (
        <div className="set-group">
          <div className="eyebrow" style={{ marginBottom: 8 }}>{t('settings.staff')}</div>
          <div className="set-list">
            <Row label={t('settings.adminPanel')} sub={t('settings.adminPanel.sub')}
                 onClick={() => { tg.tap('light'); onAdmin(); }}
                 right={<span style={{ color: 'var(--faint)' }}>›</span>} />
          </div>
        </div>
      ) : null}

      <div className="set-group">
        <div className="eyebrow" style={{ marginBottom: 8 }}>{t('settings.notifications')}</div>
        <div className="set-list">
          <Row label={t('settings.notif.all')}
               right={<Switch on={notif.all !== false} onChange={(v) => patchNotif('all', v)} />} />
          <Row label={t('settings.notif.chats')}
               right={<Switch on={notif.chats !== false} onChange={(v) => patchNotif('chats', v)} />} />
          <Row label={t('settings.notif.stories')}
               right={<Switch on={notif.stories !== false} onChange={(v) => patchNotif('stories', v)} />} />
          <Row label={t('settings.notif.woofs')}
               right={<Switch on={notif.woofs !== false} onChange={(v) => patchNotif('woofs', v)} />} />
          <Row label={t('settings.notif.comments')}
               right={<Switch on={notif.comments !== false} onChange={(v) => patchNotif('comments', v)} />} />
          <Row label={t('settings.notif.gifts')}
               right={<Switch on={notif.gifts !== false} onChange={(v) => patchNotif('gifts', v)} />} />
        </div>
      </div>

      <div className="set-group">
        <div className="eyebrow" style={{ marginBottom: 8 }}>{t('settings.privacy')}</div>
        <div className="set-list">
          <Row label={t('settings.ghost')} sub={t('settings.ghost.sub')}
               right={<Switch on={s.ghost_mode} onChange={(v) => patch({ ghost_mode: v })} />} />
          <Row label={t('settings.showOnline')}
               right={<Switch on={s.show_online} onChange={(v) => patch({ show_online: v })} />} />
          <Row label={t('settings.showLastSeen')}
               right={<Switch on={s.show_last_seen} onChange={(v) => patch({ show_last_seen: v })} />} />
          {/* The list used to spill out underneath this row, so the
              row's own ">" pointed at nothing and the blocked people
              sat loose in the privacy group. It opens a page now. */}
          <Row label={t('settings.blocked')}
               sub={`${s.blocked.length}`}
               onClick={() => { tg.tap('light'); setBlockedOpen(true); }}
               right={<span style={{ color: 'var(--faint)' }}>›</span>} />
        </div>
      </div>

      <div className="set-group">
        <input ref={selfieInput} type="file" accept="image/*" capture="user" hidden
               onChange={(e) => { void selfie.add(e.target.files); e.target.value = ''; }} />
        <div className="eyebrow" style={{ marginBottom: 8 }}>{t('settings.verification')}</div>
        <div className="set-list">
          <Row
            label={t('settings.verification')}
            sub={
              s.verification === 'approved' ? t('settings.verify.approved')
              : s.verification === 'pending' ? t('settings.verify.pending')
              : s.verification === 'rejected' ? t('settings.verify.rejected')
              : t('settings.verify.none')
            }
            right={
              s.verification === 'none' || s.verification === 'rejected'
                ? <button className="chip" onClick={requestVerification}>{t('settings.verify.request')}</button>
                : undefined
            }
          />
        </div>
      </div>

      <div className="set-group">
        <div className="eyebrow" style={{ marginBottom: 8 }}>{t('settings.language')}</div>
        <div className="chips">
          {(Object.entries(LOCALES) as Array<[Locale, string]>).map(([code, name]) => (
            <button key={code} type="button" className="chip" aria-pressed={locale === code}
                    onClick={() => { tg.select(); setLocale(code); patch({ locale: code }); }}>
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="set-group">
        <div className="eyebrow" style={{ marginBottom: 8 }}>{t('settings.support')}</div>
        <div className="set-list">
          <Row label={t('settings.contact')}
               onClick={() => { tg.tap('light'); setSendError(null); setWriting('support'); }}
               right={<span style={{ color: 'var(--faint)' }}>›</span>} />
          <Row label={t('settings.bug')}
               onClick={() => { tg.tap('light'); setSendError(null); setWriting('bug'); }}
               right={<span style={{ color: 'var(--faint)' }}>›</span>} />
          <Row label={t('settings.terms')}
               onClick={() => { tg.tap('light'); setLegal('terms'); }}
               right={<span style={{ color: 'var(--faint)' }}>›</span>} />
          <Row label={t('settings.privacyPolicy')}
               onClick={() => { tg.tap('light'); setLegal('privacy'); }}
               right={<span style={{ color: 'var(--faint)' }}>›</span>} />
        </div>
      </div>

      <div className="set-group">
        <div className="eyebrow" style={{ marginBottom: 8 }}>{t('settings.account')}</div>
        <div className="set-list">
          <Row danger label={t('settings.deleteAccount')} sub={t('settings.deleteAccount.sub')}
               onClick={() => { tg.tap('heavy'); setConfirmDelete(true); }} />
        </div>
      </div>

      {/* Overlays, not page-bottom cards. The old cards appended below
          the delete-account group, off-screen from the button the
          person just pressed — tapping "Request" appeared to do
          nothing. A sheet rises over the current view instead. */}
      {blockedOpen ? (
        <Page title={t('settings.blocked')} onClose={() => setBlockedOpen(false)}>
          {s.blocked.length === 0 ? (
            <p className="hint" style={{ textAlign: 'center', padding: 32 }}>
              {t('settings.blocked.empty')}
            </p>
          ) : (
            <div>
              {/* Face and handle: a list of bare names is useless for
                  deciding who you actually want to unblock. */}
              {s.blocked.map((b) => (
                <div key={b.blocked_id} className="follow-row">
                  <div className="follow-id" style={{ cursor: 'default' }}>
                    <Avatar name={b.display_name} mediaId={b.avatar_media_id} size={44} radius={22} />
                    <span className="person-name num" style={{ fontSize: '0.9rem' }}>
                      @{b.handle}
                    </span>
                  </div>
                  <button className="chip" onClick={async () => {
                    tg.tap('light');
                    try {
                      await apiFetch('/v1/settings/unblock', {
                        method: 'POST', body: JSON.stringify({ account_id: b.blocked_id }),
                      });
                      tg.notify('success');
                    } catch { tg.notify('error'); }
                    load();
                  }}>{t('settings.unblock')}</button>
                </div>
              ))}
            </div>
          )}
        </Page>
      ) : null}

      {legal ? <Legal kind={legal} onClose={() => setLegal(null)} /> : null}

      <Sheet center open={writing !== null} onClose={() => setWriting(null)}>
        <h2 style={{ marginBottom: 4 }}>
          {writing === 'bug' ? t('settings.bug') : t('settings.contact')}
        </h2>
        <p className="hint" style={{ marginBottom: 12 }}>{t('support.hint')}</p>
        <label className="field">
          <textarea rows={5} maxLength={2000} value={draft} autoFocus
                    placeholder={t('support.placeholder')}
                    onChange={(e) => setDraft(e.target.value)} />
        </label>
        {sendError ? <p className="error">{sendError}</p> : null}
        <Button onClick={sendSupport} disabled={sending || draft.trim().length === 0}>
          {sending ? t('common.loading') : t('support.send')}
        </Button>
        <div style={{ height: 10 }} />
        <Button variant="ghost" onClick={() => setWriting(null)}>{t('common.cancel')}</Button>
      </Sheet>

      <Sheet center open={sent} onClose={() => setSent(false)}>
        <h2 style={{ marginBottom: 8 }}>{t('support.sentTitle')}</h2>
        <p style={{ marginBottom: 16 }}>{t('support.sentBody')}</p>
        <Button variant="ghost" onClick={() => setSent(false)}>{t('common.done')}</Button>
      </Sheet>

      <Sheet center open={verifySent} onClose={() => setVerifySent(false)}>
        <h2 style={{ marginBottom: 8 }}>{t('verify.sentTitle')}</h2>
        <p style={{ marginBottom: 16 }}>{t('verify.sentBody')}</p>
        <Button variant="ghost" onClick={() => setVerifySent(false)}>{t('common.done')}</Button>
      </Sheet>

      <Sheet center open={verifyIntro} onClose={() => setVerifyIntro(false)}>
        <h2 style={{ marginBottom: 8 }}>{t('verify.title')}</h2>
        <p style={{ marginBottom: 6 }}>{t('verify.step1')}</p>
        <p style={{ marginBottom: 6 }}>{t('verify.step2')}</p>
        <p style={{ marginBottom: 16 }}>{t('verify.step3')}</p>
        <Button onClick={() => { setVerifyIntro(false); selfieInput.current?.click(); }}>
          {t('verify.takeSelfie')}
        </Button>
        <div style={{ height: 10 }} />
        <Button variant="ghost" onClick={() => setVerifyIntro(false)}>{t('common.cancel')}</Button>
      </Sheet>

      <Sheet center open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <h2 style={{ marginBottom: 8 }}>{t('settings.deleteConfirm')}</h2>
        <p style={{ marginBottom: 16 }}>{t('settings.deleteConfirm.body')}</p>
        <Button onClick={deleteAccount}>{t('settings.deleteAccount')}</Button>
        <div style={{ height: 10 }} />
        <Button variant="ghost" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
      </Sheet>
    </div>
  );
}
