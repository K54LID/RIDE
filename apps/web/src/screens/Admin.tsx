import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Button, EmptyState, Skeleton } from '../components/ui';
import Media from '../components/Media';

interface Overview {
  users_active: number; users_total: number; active_24h: number; new_7d: number;
  banned: number; posts: number; pending_verifications: number;
  open_reports: number; stars_revenue: number; coins_outstanding: number;
  online_now: number; new_24h: number; gifts_sent: number;
  messages_sent: number; stories_live: number; woofs_24h: number;
}

interface AdminUser {
  id: string; status: string; role: string; display_name: string;
  handle: string | null; court_value: number; balance: number;
  verification: string;
}

interface VerificationReq {
  id: string; account_id: string; display_name: string;
  handle: string | null; created_at: string;
  selfie_media_id: string | null;
}

type Pane = 'overview' | 'users' | 'verify' | 'storage' | 'log';

export default function Admin({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [pane, setPane] = useState<Pane>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [verifs, setVerifs] = useState<VerificationReq[] | null>(null);
  const [log, setLog] = useState<Array<Record<string, unknown>> | null>(null);
  const [q, setQ] = useState('');
  const [denied, setDenied] = useState(false);
  const [storage, setStorage] = useState<Array<{ step: string; ok: boolean; detail: string }> | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => tg.backButton(onBack), [onBack]);

  const load = useCallback(() => {
    apiFetch<Overview>('/v1/admin/overview')
      .then(setOverview)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) setDenied(true);
      });
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (pane === 'users') {
      apiFetch<{ users: AdminUser[] }>(`/v1/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        .then((r) => setUsers(r.users)).catch(() => undefined);
    }
    if (pane === 'verify') {
      apiFetch<{ requests: VerificationReq[] }>('/v1/admin/verifications')
        .then((r) => setVerifs(r.requests)).catch(() => undefined);
    }
    if (pane === 'log') {
      apiFetch<{ entries: Array<Record<string, unknown>> }>('/v1/admin/log')
        .then((r) => setLog(r.entries)).catch(() => undefined);
    }
  }, [pane, q]);

  const act = async (path: string, body?: unknown) => {
    tg.tap('medium');
    try {
      await apiFetch(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      tg.notify('success');
      load();
      setPane((p) => p); // refresh current pane
      if (pane === 'users') {
        apiFetch<{ users: AdminUser[] }>('/v1/admin/users').then((r) => setUsers(r.users));
      }
      if (pane === 'verify') {
        apiFetch<{ requests: VerificationReq[] }>('/v1/admin/verifications')
          .then((r) => setVerifs(r.requests));
      }
    } catch (err) {
      tg.notify('error');
      if (err instanceof ApiError && err.code === 'MISSING_PERMISSION') {
        alert(err.message);
      }
    }
  };

  if (denied) {
    return (
      <div className="screen">
        <div className="head"><h1>{t('admin.title')}</h1></div>
        <EmptyState title={t('admin.denied')} body={t('admin.denied.body')} />
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="head"><h1>{t('admin.title')}</h1></div>

      <div className="seg">
        {(['overview', 'users', 'verify', 'storage', 'log'] as Pane[]).map((p) => (
          <button key={p} aria-pressed={pane === p} onClick={() => { tg.select(); setPane(p); }}>
            {t(`admin.${p}` as 'admin.overview')}
          </button>
        ))}
      </div>

      {pane === 'overview' && (
        !overview ? <><Skeleton h={70} mb={10} /><Skeleton h={70} /></> : (
          <>
            <div className="admin-grid">
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.usersTotal')}</div>
                <div className="num">{overview.users_total}</div>
              </div>
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.active24')}</div>
                <div className="num">{overview.active_24h}</div>
              </div>
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.new7')}</div>
                <div className="num">{overview.new_7d}</div>
              </div>
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.posts')}</div>
                <div className="num">{overview.posts}</div>
              </div>
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.revenue')}</div>
                <div className="num" style={{ color: 'var(--court-lit)' }}>{overview.stars_revenue}</div>
              </div>
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.coinsOut')}</div>
                <div className="num">{overview.coins_outstanding}</div>
              </div>
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.pendingVerify')}</div>
                <div className="num" style={{ color: overview.pending_verifications > 0 ? 'var(--pulse)' : undefined }}>
                  {overview.pending_verifications}
                </div>
              </div>
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.openReports')}</div>
                <div className="num" style={{ color: overview.open_reports > 0 ? 'var(--pulse)' : undefined }}>
                  {overview.open_reports}
                </div>
              </div>
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.onlineNow')}</div>
                <div className="num" style={{ color: '#37D27A' }}>{overview.online_now}</div>
              </div>
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.new24')}</div>
                <div className="num">{overview.new_24h}</div>
              </div>
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.giftsSent')}</div>
                <div className="num">{overview.gifts_sent}</div>
              </div>
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.messagesSent')}</div>
                <div className="num">{overview.messages_sent}</div>
              </div>
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.storiesLive')}</div>
                <div className="num">{overview.stories_live}</div>
              </div>
              <div className="admin-stat">
                <div className="eyebrow">{t('admin.woofs24')}</div>
                <div className="num">{overview.woofs_24h}</div>
              </div>
            </div>
            <Button variant="ghost" onClick={load}>{t('common.retry')}</Button>
          </>
        )
      )}

      {pane === 'users' && (
        <>
          <label className="field">
            <input value={q} placeholder={t('common.search')} autoCapitalize="none"
                   onChange={(e) => setQ(e.target.value)} />
          </label>
          {!users ? <Skeleton h={70} /> : users.map((u) => (
            <div key={u.id} className="person" style={{ flexWrap: 'wrap' }}>
              <div className="person-avatar">{u.display_name.charAt(0).toUpperCase()}</div>
              <div className="person-main">
                <div className="person-name">{u.display_name}</div>
                <div className="person-sub num">
                  {u.status} · {u.role} · {u.balance} coins
                </div>
              </div>
              <div className="chips" style={{ width: '100%', marginTop: 8 }}>
                {u.status === 'active' ? (
                  <>
                    <button className="chip" onClick={() => act(`/v1/admin/users/${u.id}/suspend`, { days: 7 })}>
                      {t('admin.suspend7')}
                    </button>
                    <button className="chip" style={{ color: 'var(--pulse)' }}
                            onClick={() => act(`/v1/admin/users/${u.id}/ban`, {})}>
                      {t('admin.ban')}
                    </button>
                  </>
                ) : (
                  <button className="chip" onClick={() => act(`/v1/admin/users/${u.id}/restore`)}>
                    {t('admin.restore')}
                  </button>
                )}
                <button className="chip" onClick={() => act(`/v1/admin/users/${u.id}/credit`, { amount: 100 })}>
                  {t('admin.credit100')}
                </button>
                <button className="chip" onClick={() => act(`/v1/admin/users/${u.id}/credit`, { amount: -100 })}>
                  {t('admin.debit100')}
                </button>
                <button className="chip"
                        onClick={() => act(`/v1/admin/users/${u.id}/verification`,
                                           { verified: u.verification !== 'approved' })}>
                  {u.verification === 'approved' ? t('admin.unverify') : t('admin.grantVerify')}
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {pane === 'verify' && (
        !verifs ? <Skeleton h={70} /> :
        verifs.length === 0 ? <EmptyState title={t('admin.noVerify')} body={t('admin.noVerify.body')} /> :
        verifs.map((v) => (
          <div key={v.id} className="person" style={{ flexWrap: 'wrap' }}>
            {v.selfie_media_id
              ? <div className="avatar-img" style={{ width: 48, height: 48, borderRadius: 14 }}>
                  <Media id={v.selfie_media_id} kind="image" thumb />
                </div>
              : <div className="person-avatar">{v.display_name.charAt(0).toUpperCase()}</div>}
            <div className="person-main">
              <div className="person-name">{v.display_name}</div>
              {v.handle ? <div className="person-sub num">@{v.handle}</div> : null}
            </div>
            <div className="chips" style={{ width: '100%', marginTop: 8 }}>
              <button className="chip" onClick={() => act(`/v1/admin/verifications/${v.id}`, { approve: true })}>
                {t('admin.approve')}
              </button>
              <button className="chip" style={{ color: 'var(--pulse)' }}
                      onClick={() => act(`/v1/admin/verifications/${v.id}`, { approve: false })}>
                {t('admin.reject')}
              </button>
            </div>
          </div>
        ))
      )}

      {pane === 'storage' && (
        <>
          <p style={{ fontSize: '0.88rem', marginBottom: 14 }}>
            Verifies the bot token, the storage channel, a real upload and a
            download URL — in that order, so a failure names its own cause.
          </p>
          <Button disabled={checking} onClick={async () => {
            setChecking(true); setStorage(null); tg.tap('medium');
            try {
              const r = await apiFetch<{ steps: Array<{ step: string; ok: boolean; detail: string }> }>(
                '/v1/admin/storage-check');
              setStorage(r.steps);
            } catch { tg.notify('error'); }
            finally { setChecking(false); }
          }}>{checking ? t('common.loading') : t('admin.storageCheck')}</Button>

          {storage ? (
            <div className="set-list" style={{ marginTop: 16 }}>
              {storage.map((st) => (
                <div key={st.step} className="set-row">
                  <span>
                    <div className="set-row-label">
                      {st.ok ? '✓' : '✕'} {st.step}
                    </div>
                    <div className="set-row-sub">{st.detail}</div>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}

      {pane === 'log' && (
        !log ? <Skeleton h={70} /> : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {log.map((e, i) => (
              <div key={i} className="rank" style={{ padding: '11px 14px', display: 'block' }}>
                <div style={{ fontSize: '0.88rem' }}>
                  <strong>{String(e.actor_name ?? '—')}</strong> {String(e.action)}
                  {e.target_name ? <> → <strong>{String(e.target_name)}</strong></> : null}
                </div>
                {e.reason ? <div className="person-sub">{String(e.reason)}</div> : null}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
