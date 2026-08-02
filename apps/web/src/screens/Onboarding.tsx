import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { tg } from '../lib/tg';
import { Button, ChipGroup, ChipPick, Field } from '../components/ui';
import { useT } from '../i18n';

/**
 * Four steps, one theme each. Splitting it up matters more than it
 * looks: a single 14-field form is the fastest way to lose someone on
 * their first thirty seconds in the app. Only step 1 is required —
 * everything after can be skipped and filled in later from the profile.
 */

const GENDERS = ['Man', 'Woman', 'Non-binary', 'Trans man', 'Trans woman', 'Prefer not to say'] as const;
const PRONOUNS = ['he/him', 'she/her', 'they/them', 'any'] as const;
const ORIENTATIONS = ['Gay', 'Bi', 'Queer', 'Pan', 'Straight', 'Asexual', 'Questioning'] as const;
const LOOKING_FOR = ['Friends', 'Chat', 'Dates', 'Relationship', 'Networking', 'Events', 'Right now'] as const;
const STATUS = ['Single', 'Dating', 'Partnered', 'Open', 'Married', "It's complicated"] as const;
const TRIBES = ['Bear', 'Twink', 'Otter', 'Jock', 'Daddy', 'Geek', 'Leather', 'Trans', 'Poz', 'Discreet'] as const;
const INTERESTS = ['Gaming', 'Fitness', 'Travel', 'Music', 'Movies', 'Photography', 'Cooking', 'Art', 'Tech', 'Sports', 'Pets', 'Nightlife', 'Reading', 'Fashion'] as const;
const LANGUAGES = ['English', 'Русский', 'Türkçe', 'Español', 'Deutsch', 'Français', 'العربية', 'Azərbaycan'] as const;

const STEPS = 4;

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Handle availability, checked against the database as they type.
   * Finding out the handle was taken only after filling in four steps
   * and pressing the final button — and being thrown back to step 1 —
   * is a bad way to learn it.
   */
  const [handleState, setHandleState] =
    useState<'idle' | 'checking' | 'free' | 'taken' | 'error'>('idle');
  const handleSeq = useRef(0);

  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [pronouns, setPronouns] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [tribes, setTribes] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');

  // Telegram's own back button drives step navigation — the platform
  // affordance rather than a second in-app control.
  useEffect(() => {
    if (step === 0) return tg.backButton(null);
    return tg.backButton(() => setStep((s) => Math.max(0, s - 1)));
  }, [step]);

  const handleValid = /^[a-zA-Z0-9_]{1,24}$/.test(handle);

  useEffect(() => {
    if (!handleValid) { setHandleState('idle'); return; }
    setHandleState('checking');
    // Sequence number, not just a cleared timer: an in-flight response
    // for an older handle must never overwrite the newer verdict.
    const seq = ++handleSeq.current;
    const id = setTimeout(() => {
      apiFetch<{ available: boolean }>(
        `/v1/handles/available?handle=${encodeURIComponent(handle)}`)
        .then((r) => {
          if (seq !== handleSeq.current) return;
          setHandleState(r.available ? 'free' : 'taken');
        })
        .catch(() => { if (seq === handleSeq.current) setHandleState('error'); });
    }, 400);
    return () => clearTimeout(id);
  }, [handle, handleValid]);

  const age = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
    const b = new Date(`${birthDate}T00:00:00Z`);
    if (Number.isNaN(b.getTime())) return null;
    const now = new Date();
    let a = now.getUTCFullYear() - b.getUTCFullYear();
    const m = now.getUTCMonth() - b.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) a -= 1;
    return a;
  }, [birthDate]);

  // Required: the handle is how this person is addressed everywhere
  // except their own profile header and the Discover grid. A handle
  // known to be taken blocks the step; a check still in flight or one
  // that failed for network reasons does not, because the server
  // rejects duplicates anyway and a dead spinner should not trap
  // someone in step 1.
  const step0Valid = displayName.trim().length > 0 && age !== null && age >= 18
    && handleValid && handleState !== 'taken';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/v1/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          display_name: displayName.trim(),
          handle,
          birth_date: birthDate,
          bio: bio.trim() || undefined,
          gender: gender ?? undefined,
          pronouns: pronouns ?? undefined,
          orientation: orientation ?? undefined,
          relationship_status: status ?? undefined,
          looking_for: lookingFor.length ? lookingFor : undefined,
          tribes: tribes.length ? tribes : undefined,
          interests: interests.length ? interests : undefined,
          languages: languages.length ? languages : undefined,
          height_cm: heightCm ? Number(heightCm) : undefined,
          weight_kg: weightKg ? Number(weightKg) : undefined,
        }),
      });
      tg.notify('success');
      onDone();
    } catch (err) {
      tg.notify('error');
      if (err instanceof ApiError) {
        if (err.code === 'UNDERAGE') setError('RIDE is for adults 18 and over.');
        else if (err.code === 'HANDLE_TAKEN') {
          setError('That username is not available. Try another one.');
          setHandleState('taken');
          setStep(0);
        }
        else if (err.code === 'NETWORK') setError('No connection. Check your network and try again.');
        else setError(err.message);
      } else {
        setError('Something went wrong. Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const next = () => { tg.tap('medium'); setStep((s) => s + 1); };
  const back = () => { tg.tap('light'); setStep((s) => Math.max(0, s - 1)); };

  /**
   * Steps 2–4 are all optional, so "skip" means: submit what exists and
   * let them finish from Edit profile whenever they like. It is not
   * offered on step 1 — a display name, an age and a handle are the
   * minimum an account can exist with, and the handle in particular is
   * how everyone else addresses them.
   */
  const skip = () => { tg.tap('light'); void submit(); };

  /**
   * Back / Skip under each optional step. A value, not a nested
   * component: a component declared inside another is a fresh type on
   * every render, which remounts its subtree and trips the hooks check.
   */
  const stepNav = (
    <div className="onb-nav">
      <button type="button" className="chip" onClick={back}>Back</button>
      <button type="button" className="chip" onClick={skip} disabled={busy}>
        {busy ? 'Saving…' : 'Skip for now'}
      </button>
    </div>
  );

  return (
    <div className="screen">
      <div className="eyebrow">Step {step + 1} of {STEPS}</div>
      <div style={{ display: 'flex', gap: 5, margin: '10px 0 26px' }}>
        {Array.from({ length: STEPS }, (_, i) => (
          <div key={i} style={{
            height: 3, flex: 1, borderRadius: 2,
            background: i <= step ? 'var(--pulse)' : 'var(--hairline)',
            transition: 'background 0.3s var(--ease)',
          }} />
        ))}
      </div>

      {step === 0 && (
        <>
          <h1>Who are you here as?</h1>
          <p style={{ marginBottom: 26 }}>Your username is how people see you across RIDE. Your name shows on your profile and in Discover. Neither is your Telegram username.</p>
          <Field label="Display name">
            <input value={displayName} maxLength={50} placeholder="What people call you"
                   onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field
            label="Username"
            hint={
              !handleValid ? 'Required. Letters, numbers and underscores only, 1–24 characters.'
              : handleState === 'checking' ? 'Checking availability…'
              : handleState === 'taken' ? '✕ That username is not available — try another one.'
              : handleState === 'free' ? '✓ Available.'
              : '1–24 letters, numbers or underscores.'
            }
          >
            <input value={handle} maxLength={24} placeholder="ride_handle"
                   autoCapitalize="none" autoCorrect="off"
                   onChange={(e) => setHandle(e.target.value.replace(/\s/g, ''))} />
          </Field>
          <Field label="Birthday" hint={age !== null && age < 18 ? 'RIDE is 18+.' : 'Shown as your age. You cannot change this later.'}>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
          {error ? <p className="error">{error}</p> : null}
          <Button onClick={next} disabled={!step0Valid}>Continue</Button>
        </>
      )}

      {step === 1 && (
        <>
          <h1>How should people read you?</h1>
          <p style={{ marginBottom: 26 }}>All optional. Skip anything you'd rather keep to yourself.</p>
          <Field label="Gender"><ChipPick options={GENDERS} value={gender} onChange={setGender} /></Field>
          <Field label="Pronouns"><ChipPick options={PRONOUNS} value={pronouns} onChange={setPronouns} /></Field>
          <Field label="Orientation"><ChipPick options={ORIENTATIONS} value={orientation} onChange={setOrientation} /></Field>
          <Field label="Relationship"><ChipPick options={STATUS} value={status} onChange={setStatus} /></Field>
          <Button onClick={next}>Continue</Button>
          {stepNav}
        </>
      )}

      {step === 2 && (
        <>
          <h1>What are you here for?</h1>
          <p style={{ marginBottom: 26 }}>This shapes who RIDE puts in front of you.</p>
          <Field label="Looking for"><ChipGroup options={LOOKING_FOR} selected={lookingFor} onChange={setLookingFor} /></Field>
          <Field label="Tribes"><ChipGroup options={TRIBES} selected={tribes} onChange={setTribes} max={4} /></Field>
          <Field label="Interests" hint="Pick up to 8.">
            <ChipGroup options={INTERESTS} selected={interests} onChange={setInterests} max={8} />
          </Field>
          <Field label="Languages"><ChipGroup options={LANGUAGES} selected={languages} onChange={setLanguages} /></Field>
          <Button onClick={next}>Continue</Button>
          {stepNav}
        </>
      )}

      {step === 3 && (
        <>
          <h1>Anything else?</h1>
          <p style={{ marginBottom: 26 }}>Last step. You can edit all of this from your profile.</p>
          <Field label="Bio">
            <textarea value={bio} maxLength={500} rows={4} placeholder="A few words about you"
                      onChange={(e) => setBio(e.target.value)} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Height (cm)">
              <input type="number" inputMode="numeric" min={100} max={250} value={heightCm}
                     placeholder="—" onChange={(e) => setHeightCm(e.target.value)} />
            </Field>
            <Field label="Weight (kg)">
              <input type="number" inputMode="numeric" min={30} max={300} value={weightKg}
                     placeholder="—" onChange={(e) => setWeightKg(e.target.value)} />
            </Field>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <Button onClick={submit} disabled={busy}>
            {busy ? t('common.loading') : 'Enter RIDE'}
          </Button>
          {stepNav}
        </>
      )}
    </div>
  );
}
