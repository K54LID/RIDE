import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type FollowPerson } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import Page from '../components/Page';
import Avatar from '../components/Avatar';
import { EmptyState, Skeleton } from '../components/ui';
import { VerifiedMark } from '../components/VerifiedMark';

/**
 * Followers / following, with the follow button on the row.
 *
 * The server returns `i_follow` per person, so the button is correct on
 * first paint — otherwise every row would need its own request just to
 * decide what to say. Toggling is optimistic and reverts on failure;
 * the row stays in the list either way, because a list that removed
 * people as you unfollowed them would move the rows under your finger.
 */
export default function FollowList({
  accountId, mode, meId, onClose, onOpenUser,
}: {
  accountId: string;
  mode: 'followers' | 'following';
  meId: string;
  onClose: () => void;
  onOpenUser: (accountId: string) => void;
}) {
  const t = useT();
  const [people, setPeople] = useState<FollowPerson[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    apiFetch<{ people: FollowPerson[] }>(`/v1/users/${accountId}/${mode}`)
      .then((r) => setPeople(r.people))
      .catch(() => setFailed(true));
  }, [accountId, mode]);
  useEffect(load, [load]);

  const toggle = async (p: FollowPerson) => {
    tg.tap('light');
    const next = !p.i_follow;
    setPeople((cur) => cur?.map((x) =>
      x.account_id === p.account_id ? { ...x, i_follow: next } : x) ?? cur);
    try {
      const r = await apiFetch<{ following: boolean }>(
        `/v1/users/${p.account_id}/follow`, { method: 'POST' });
      setPeople((cur) => cur?.map((x) =>
        x.account_id === p.account_id ? { ...x, i_follow: r.following } : x) ?? cur);
    } catch {
      tg.notify('error');
      setPeople((cur) => cur?.map((x) =>
        x.account_id === p.account_id ? { ...x, i_follow: !next } : x) ?? cur);
    }
  };

  return (
    <Page title={t(mode === 'followers' ? 'profile.followers' : 'profile.following')}
          onClose={onClose}>
      {failed ? (
        <EmptyState title={t('common.offline')} body={t('common.offline.body')} />
      ) : people === null ? (
        <><Skeleton h={56} mb={8} /><Skeleton h={56} mb={8} /><Skeleton h={56} /></>
      ) : people.length === 0 ? (
        <EmptyState
          title={t(mode === 'followers' ? 'follow.noFollowers' : 'follow.noFollowing')}
          body=""
        />
      ) : (
        people.map((p) => (
          <div key={p.account_id} className="follow-row">
            <button className="follow-id"
                    onClick={() => { tg.tap('light'); onOpenUser(p.account_id); }}>
              <Avatar name={p.display_name} mediaId={p.avatar_media_id} size={44} radius={22} />
              <span className="person-name num" style={{ fontSize: '0.9rem' }}>
                @{p.handle}
                {p.verified ? <VerifiedMark size={13} /> : null}
              </span>
            </button>
            {p.account_id === meId ? null : (
              <button className="chip" aria-pressed={p.i_follow} onClick={() => toggle(p)}>
                {p.i_follow ? t('action.following') : t('action.follow')}
              </button>
            )}
          </div>
        ))
      )}
    </Page>
  );
}
