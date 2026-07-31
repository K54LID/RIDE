import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError, type Me } from './lib/api';
import { useRoute, type Route } from './lib/router';
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

export default function App() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [{ route, chatId }, go, openChat] = useRoute();
  const [feedKey, setFeedKey] = useState(0);
  const [viewingUser, setViewingUser] = useState<string | null>(null);
  const [viewingPost, setViewingPost] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<Me>('/v1/me')
      .then((data) => { setMe(data); setPhase('ready'); })
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
    return <Onboarding onDone={() => { setPhase('loading'); load(); }} />;
  }

  const meId = me?.account_id ?? '';
  const meName = me?.display_name ?? '';
  const meAvatar = me?.avatar_media_id ?? null;

  // A chat thread owns the whole screen — the bar would fight the composer.
  // A person's profile overlays whatever is beneath it, so it works
  // identically from Discover, a chat header, or the feed.
  const userOverlay = viewingUser ? (
    <UserProfile
      accountId={viewingUser}
      balance={me?.coin_balance ?? 0}
      onClose={() => setViewingUser(null)}
      onBalanceChange={load}
      onOpenChat={(id) => { setViewingUser(null); setViewingPost(null); openChat(id); }}
      onOpenUser={setViewingUser}
    />
  ) : null;

  // A post overlay sits beneath the profile overlay in the DOM, so
  // tapping a name inside the post stacks the person on top of it.
  const postOverlay = viewingPost ? (
    <PostView
      postId={viewingPost}
      meId={meId}
      onClose={() => setViewingPost(null)}
      onOpenUser={setViewingUser}
    />
  ) : null;

  if (chatId) {
    return (
      <>
        <ChatThread conversationId={chatId} meId={meId}
                    onBack={() => go('chats')} onOpenUser={setViewingUser} />
        {postOverlay}
        {userOverlay}
      </>
    );
  }

  if (route === 'alerts') {
    return (
      <>
        <Alerts onBack={() => go('home')}
                onOpenUser={setViewingUser}
                onOpenPost={setViewingPost}
                onOpenChat={openChat} />
        {postOverlay}
        {userOverlay}
      </>
    );
  }
  if (route === 'saved') {
    return (
      <>
        <Saved meId={meId} onBack={() => go('you')} onOpenUser={setViewingUser} />
        {postOverlay}
        {userOverlay}
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
              onOpenUser={setViewingUser} />
      )}
      {tab === 'achievements' && <Achievements />}
      {tab === 'chats' && <Chats meId={meId} onOpen={openChat} onOpenUser={setViewingUser} />}
      {tab === 'discover' && <Discover onOpenUser={setViewingUser} />}
      {tab === 'ranks' && <Ranks onOpenUser={setViewingUser} />}
      {tab === 'you' && me && (
        <Profile me={me} onEdit={() => go('edit')} onWallet={() => go('wallet')}
                 onSettings={() => go('settings')} onSaved={() => go('saved')} />
      )}

      <BottomNav route={route} onGo={go} />

      {postOverlay}
      {userOverlay}

      <Sheet center open={route === 'create'} onClose={() => go('home')}>
        <Compose
          onCancel={() => go('home')}
          onPosted={() => { setFeedKey((k) => k + 1); go('home'); }}
        />
      </Sheet>
    </>
  );
}
