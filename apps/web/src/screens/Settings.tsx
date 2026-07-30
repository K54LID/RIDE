import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { tg } from '../lib/tg';
import { useI18n, LOCALES, type Locale } from '../i18n';
import { Button, Skeleton } from '../components/ui';
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
  blocked: Array<{ blocked_id: string; display_name: string; handle: string | null }>;
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
  const [verifySent, setVerifySent] = useState(false);
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
      <div className="head">
        <h1>
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
          <Row label={t('settings.blocked')}
               sub={`${s.blocked.length}`}
               right={<span style={{ color: 'var(--faint)' }}>›</span>} />
        </div>
        {s.blocked.length > 0 ? (
          <div className="set-list" style={{ marginTop: 8 }}>
            {s.blocked.map((b) => (
              <Row key={b.blocked_id} label={b.display_name}
                   sub={b.handle ? `@${b.handle}` : undefined}
                   right={
                     <button className="chip" onClick={async () => {
                       tg.tap('light');
                       await apiFetch('/v1/settings/unblock', {
                         method: 'POST', body: JSON.stringify({ account_id: b.blocked_id }),
                       });
                       load();
                     }}>{t('settings.unblock')}</button>
                   } />
            ))}
          </div>
        ) : null}
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
          <Row label={t('settings.contact')} onClick={() => window.open('https://t.me/', '_blank')}
               right={<span style={{ color: 'var(--faint)' }}>›</span>} />
          <Row label={t('settings.bug')} onClick={() => window.open('https://t.me/', '_blank')}
               right={<span style={{ color: 'var(--faint)' }}>›</span>} />
          <Row label={t('settings.terms')} onClick={() => window.open('https://ridethatbot.fun/terms', '_blank')}
               right={<span style={{ color: 'var(--faint)' }}>›</span>} />
          <Row label={t('settings.privacyPolicy')} onClick={() => window.open('https://ridethatbot.fun/privacy', '_blank')}
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

      {verifySent ? (
        <div className="card" style={{ marginTop: 16, borderColor: 'var(--verify)' }}>
          <h2 style={{ marginBottom: 8 }}>{t('verify.sentTitle')}</h2>
          <p style={{ marginBottom: 16 }}>{t('verify.sentBody')}</p>
          <Button variant="ghost" onClick={() => setVerifySent(false)}>{t('common.done')}</Button>
        </div>
      ) : null}

      {verifyIntro ? (
        <div className="card" style={{ marginTop: 16, borderColor: 'var(--verify)' }}>
          <h2 style={{ marginBottom: 8 }}>{t('verify.title')}</h2>
          <p style={{ marginBottom: 6 }}>{t('verify.step1')}</p>
          <p style={{ marginBottom: 6 }}>{t('verify.step2')}</p>
          <p style={{ marginBottom: 16 }}>{t('verify.step3')}</p>
          <Button onClick={() => { setVerifyIntro(false); selfieInput.current?.click(); }}>
            {t('verify.takeSelfie')}
          </Button>
          <div style={{ height: 10 }} />
          <Button variant="ghost" onClick={() => setVerifyIntro(false)}>{t('common.cancel')}</Button>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="card" style={{ marginTop: 16, borderColor: 'var(--pulse)' }}>
          <h2 style={{ marginBottom: 8 }}>{t('settings.deleteConfirm')}</h2>
          <p style={{ marginBottom: 16 }}>{t('settings.deleteConfirm.body')}</p>
          <Button onClick={deleteAccount}>{t('settings.deleteAccount')}</Button>
          <div style={{ height: 10 }} />
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
        </div>
      ) : null}
    </div>
  );
}
