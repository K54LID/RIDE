import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from './api';

type Me = {
  display_name: string;
  court_value: number;
  coin_balance: number;
  bio: string | null;
};

type Phase = 'loading' | 'onboarding' | 'ready' | 'error';

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const load = useCallback(() => {
    setPhase('loading');
    apiFetch<Me>('/v1/me')
      .then((data) => {
        setMe(data);
        setPhase('ready');
      })
      .catch((err: unknown) => {
        const onboarding = err instanceof ApiError && err.code === 'ONBOARDING_REQUIRED';
        setPhase(onboarding ? 'onboarding' : 'error');
      });
  }, []);

  useEffect(load, [load]);

  if (phase === 'loading') return <main><p>Loading…</p></main>;
  if (phase === 'error')
    return <main><p>Couldn't reach RIDE. Try again in a moment.</p></main>;
  if (phase === 'onboarding') return <Onboarding onDone={load} />;

  return (
    <main>
      <h1>{me?.display_name}</h1>
      {me?.bio ? <p>{me.bio}</p> : null}
      <p>
        <span className="stat">Court value {me?.court_value}</span>
        {' · '}
        <span className="stat">{me?.coin_balance} coins</span>
      </p>
    </main>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/v1/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          display_name: displayName,
          birth_date: birthDate,
          bio: bio || undefined,
        }),
      });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNDERAGE') {
        setError('RIDE is for adults 18 and over.');
      } else if (err instanceof ApiError && err.code === 'INVALID_BODY') {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const valid = displayName.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(birthDate);

  return (
    <main>
      <h1>Welcome to RIDE</h1>
      <p>Set up your profile to get started.</p>
      {/* No <form>: Telegram's webview intercepts submit navigation. */}
      <form onSubmit={(e) => e.preventDefault()}>
        <label>
          Display name
          <input
            value={displayName}
            maxLength={50}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How should people see you?"
          />
        </label>
        <label>
          Birthday
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </label>
        <label>
          Bio (optional)
          <textarea
            value={bio}
            maxLength={500}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A few words about you"
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button disabled={!valid || busy} onClick={submit}>
          {busy ? 'Creating…' : 'Create profile'}
        </button>
      </form>
    </main>
  );
}
