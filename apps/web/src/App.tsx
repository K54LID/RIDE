import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError, type Me } from './lib/api';
import { useRoute, type Route } from './lib/router';
import { setBotUrl } from './lib/appInfo';
import { tg } from './lib/tg';
import { useT } from './i18n';
import BottomNav from './components/BottomNav';
import Sheet from './components/Sheet';
import { Button, Skeleton, EmptyState } from './components/ui';
import Onboarding from './screens/Onboarding';
import Home from './screens/Home';
import Chats from './screens/Chats';
import ChatThread from './screens/ChatThread';
import Discover from './screens/Discover';
import FollowList from './screens/FollowList';
import Ranks from './screens/Ranks';
import Profile from './screens/Profile';
import EditProfile from './screens/EditProfile';
import Alerts from './screens/Alerts';
import Wallet from './screens/Wallet';
import Compose from './screens/Compose';
import Achievements from './screens/Achievements';
import SettingsScreen from './screens/Settings';
import Admin from './screens/Admin';
import Saved from './screens/Saved';
import UserProfile from './screens/UserProfile';
import PostView from './screens/PostView';

type Phase = 'loading' | 'onboarding' | 'ready' | 'error';

/** One frame of the overlay stack. */
type Overlay =
  | { kind: 'user'; accountId: string }
  | { kind: 'follows'; accountId: string; mode: 'followers' | 'following' }
  | { kind: 'post'; postId: string };

export default function App() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [{ route, chatId }, go, openChat] = useRoute();
  const [feedKey, setFeedKey] = useState(0);
  /**
   * Overlays are a stack, not three single slots.
   *
   * They used to be `viewingUser`, `viewingPost` and `followList`, one
   * of each. Opening a person from a follower list overwrote the person
   * already there, and tapping *their* followers replaced the list that
   * was rendered underneath the profile — so the second list opened
   * behind the profile covering it and the app looked like it refused
   * to go any deeper. Followers of followers of followers now works to
   * any depth, because each push is a new frame rather than a
   * replacement.
   *
   * Must be declared here with the other hooks, NOT further down beside
   * the overlays it feeds. Everything below is preceded by three
   * conditional early returns (loading / error / onboarding), so a hook
   * declared there is skipped on the first render and called on the
   * second — React counts hooks per render, sees the count change when
   * phase flips loading → ready, and tears the whole tree down. That is
   * a blank screen showing nothing but the background colour.
   */
  const [stack, setStack] = useState<Overlay[]>([]);
  const [unreadChats, setUnreadChats] = useState(0);

  const push = useCallback((o: Overlay) => setStack((cur) => [...cur, o]), []);
  const openUser = useCallback(
    (accountId: string) => push({ kind: 'user', accountId }), [push]);
  const openPost = useCallback(
    (postId: string) => push({ kind: 'post', postId }), [push]);
  /** Close this frame and everything above it. */
  const popTo = useCallback((i: number) => setStack((cur) => cur.slice(0, i)), []);
  const clearStack = useCallback(() => setStack([]), []);

  /**
   * Poll the chat list for unread count so the Chat tab can carry a
   * badge. Cheap query, and it is the only signal that a message is
   * waiting now that messages no longer appear in Alerts.
   */
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    let alive = true;
    const tick = () => {
      apiFetch<{ total_unread: number }>('/v1/chats')
        .then((r) => { if (alive) setUnreadChats(r.total_unread ?? 0); })
        .catch(() => undefined);
    };
    tick();
    // 6s, not 20s. This is the only signal that a message has arrived
    // while you are anywhere other than the chat list, and a badge that
    // takes twenty seconds reads as "nothing happened" — which is why
    // messages appeared only after a manual refresh.
    const id = setInterval(tick, 6000);
    return () => { alive = false; clearInterval(id); };
  }, [phase, route]);

  const load = useCallback(() => {
    apiFetch<Me>('/v1/me')
      .then((data) => { setBotUrl(data.bot_url); setMe(data); setPhase('ready'); })
      .catch((err: unknown) => {
        setPhase(err instanceof ApiError && err.code === 'ONBOARDING_REQUIRED'
          ? 'onboarding' : 'error');
      });
  }, []);

  useEffect(() => { tg.init(); load(); }, [load]);

  if (phase === 'loading') {
    return (
      <div className="screen">
        <Skeleton h={104} mb={24} />
        <Skeleton h={30} w="55%" />
        <Skeleton h={16} w="35%" mb={24} />
        <Skeleton h={74} />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="screen">
        <EmptyState
          title={t('common.offline')}
          body={t('common.offline.body')}
          action={<Button onClick={() => { setPhase('loading'); load(); }}>{t('common.retry')}</Button>}
        />
      </div>
    );
  }

  if (phase === 'onboarding') {
    /**
     * Finishing onboarding lands on Home, explicitly.
     *
     * The route is read from the URL hash, and the Telegram webview
     * keeps that hash across sessions. Someone who had been on
     * #/settings before — including anyone who just deleted an account
     * and signed up again, since deletion is reached from Settings —
     * finished registration and was dropped straight back into
     * Settings. Nothing in onboarding chose that; it was simply the
     * last route the hash remembered.
     */
    return <Onboarding onDone={() => { go('home'); setPhase('loading'); load(); }} />;
  }

  const meId = me?.account_id ?? '';
  const meName = me?.display_name ?? '';
  const meAvatar = me?.avatar_media_id ?? null;

  // A chat thread owns the whole screen — the bar would fight the composer.
  // A person's profile overlays whatever is beneath it, so it works
  // identically from Discover, a chat header, or the feed.
  //
  // Rendered in stack order: each frame is a fixed, full-screen portal,
  // so the last one painted is the one on top, and closing it reveals
  // exactly what was underneath. Frames below stay mounted and keep
  // their scroll position and loaded data.
  const overlays = stack.map((frame, i) => {
    const close = () => popTo(i);
    if (frame.kind === 'user') {
      return (
        <UserProfile
          key={`user:${i}:${frame.accountId}`}
          accountId={frame.accountId}
          balance={me?.coin_balance ?? 0}
          onClose={close}
          onBalanceChange={load}
          onOpenChat={(id) => { clearStack(); openChat(id); }}
          onOpenUser={openUser}
          onFollows={(mode) => push({ kind: 'follows', accountId: frame.accountId, mode })}
        />
      );
    }
    if (frame.kind === 'follows') {
      return (
        <FollowList
          key={`follows:${i}:${frame.accountId}:${frame.mode}`}
          accountId={frame.accountId}
          mode={frame.mode}
          meId={meId}
          onClose={close}
          onOpenUser={openUser}
        />
      );
    }
    return (
      <PostView
        key={`post:${i}:${frame.postId}`}
        postId={frame.postId}
        meId={meId}
        onClose={close}
        onOpenUser={openUser}
      />
    );
  });

  if (chatId) {
    return (
      <>
        <ChatThread conversationId={chatId} meId={meId}
                    onBack={() => go('chats')} onOpenUser={openUser} />
        {overlays}
      </>
    );
  }

  if (route === 'alerts') {
    return (
      <>
        <Alerts onBack={() => go('home')}
                onOpenUser={openUser}
                onOpenPost={openPost}
                onOpenChat={openChat} />
        {overlays}
      </>
    );
  }
  if (route === 'saved') {
    return (
      <>
        <Saved meId={meId} onBack={() => go('you')} onOpenUser={openUser} />
        {overlays}
      </>
    );
  }
  if (route === 'wallet') return <Wallet onBack={() => go('you')} onBalanceChange={load} />;
  if (route === 'settings') {
    return <SettingsScreen onBack={() => go('you')} onAdmin={() => go('admin')} />;
  }
  if (route === 'admin') return <Admin onBack={() => go('settings')} />;
  if (route === 'edit' && me) {
    return <EditProfile me={me} onBack={() => go('you')}
                        onSaved={() => { load(); go('you'); }} />;
  }

  const tab: Route = route === 'create' ? 'home' : route;

  return (
    <>
      {tab === 'home' && (
        <Home key={feedKey} meId={meId} meName={meName} meAvatar={meAvatar}
              onCompose={() => go('create')} onAlerts={() => go('alerts')}
              onOpenUser={openUser} />
      )}
      {tab === 'achievements' && <Achievements />}
      {tab === 'chats' && <Chats meId={meId} onOpen={openChat} onOpenUser={openUser} />}
      {tab === 'discover' && <Discover onOpenUser={openUser} />}
      {tab === 'ranks' && <Ranks onOpenUser={openUser} />}
      {tab === 'you' && me && (
        <Profile me={me} onEdit={() => go('edit')} onWallet={() => go('wallet')}
                 onSettings={() => go('settings')} onSaved={() => go('saved')}
                 onFollows={(mode) => push({ kind: 'follows', accountId: meId, mode })}
                 onOpenUser={openUser} />
      )}

      <BottomNav route={route} onGo={go} unreadChats={unreadChats} />

      {overlays}

      <Sheet center open={route === 'create'} onClose={() => go('home')}>
        <Compose
          onCancel={() => go('home')}
          onPosted={() => { setFeedKey((k) => k + 1); go('home'); }}
        />
      </Sheet>
    </>
  );
}
