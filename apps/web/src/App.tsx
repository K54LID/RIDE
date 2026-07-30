import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError, type Me } from './lib/api';
import { useRoute } from './lib/router';
import { tg } from './lib/tg';
import BottomNav from './components/BottomNav';
import { Button, Skeleton, EmptyState } from './components/ui';
import Onboarding from './screens/Onboarding';
import Profile from './screens/Profile';
import { Home, Discover, MapTab, Messages, Alerts } from './screens/Placeholders';

type Phase = 'loading' | 'onboarding' | 'ready' | 'error';

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [tab, go] = useRoute();

  const load = useCallback(() => {
    setPhase('loading');
    apiFetch<Me>('/v1/me')
      .then((data) => { setMe(data); setPhase('ready'); })
      .catch((err: unknown) => {
        setPhase(
          err instanceof ApiError && err.code === 'ONBOARDING_REQUIRED'
            ? 'onboarding'
            : 'error',
        );
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
          title="Can't reach RIDE"
          body="The connection dropped. Check your network and try again."
          action={<Button onClick={load}>Try again</Button>}
        />
      </div>
    );
  }

  if (phase === 'onboarding') return <Onboarding onDone={load} />;

  return (
    <>
      {tab === 'home' && <Home />}
      {tab === 'discover' && <Discover />}
      {tab === 'map' && <MapTab />}
      {tab === 'messages' && <Messages />}
      {tab === 'alerts' && <Alerts />}
      {tab === 'profile' && me && <Profile me={me} />}
      <BottomNav tab={tab} onGo={go} />
    </>
  );
}
