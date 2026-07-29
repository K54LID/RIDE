import { useEffect, useState } from 'react';
import { apiFetch } from './api.js';

type Me = { display_name: string; court_value: number; coin_balance: number };

/**
 * Deliberately unstyled boot shell. The RIDE visual identity is a
 * separate piece of work — shipping a half-designed placeholder here
 * would only have to be torn out.
 */
export default function App() {
  const [state, setState] = useState<'loading' | 'onboarding' | 'ready' | 'error'>('loading');
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    apiFetch<Me>('/v1/me')
      .then((data) => { setMe(data); setState('ready'); })
      .catch((err: Error) => {
        setState(err.message === 'ONBOARDING_REQUIRED' ? 'onboarding' : 'error');
      });
  }, []);

  if (state === 'loading') return <p>Loading…</p>;
  if (state === 'onboarding') return <p>Set up your profile to continue.</p>;
  if (state === 'error') return <p>Couldn't reach RIDE. Try again in a moment.</p>;

  return (
    <main>
      <h1>{me?.display_name}</h1>
      <p>Court value {me?.court_value} · {me?.coin_balance} coins</p>
    </main>
  );
}
