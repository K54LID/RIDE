import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError, type Me } from '../lib/api';
import { tg } from '../lib/tg';
import { ageFrom } from '../lib/age';
import { useT } from '../i18n';
import { Button, ChipGroup, ChipPick, Field } from '../components/ui';
import PhotoManager from '../components/PhotoManager';

/**
 * No "Woman" and no "Straight": this is a gay men's app, so those
 * options describe people it is not for. Trans men and non-binary
 * people stay — they are part of the audience.
 */
const GENDERS = ['Man', 'Trans man', 'Non-binary', 'Prefer not to say'] as const;
const PRONOUNS = ['he/him', 'she/her', 'they/them', 'any'] as const;
const ORIENTATIONS = ['Gay', 'Bi', 'Queer', 'Pan', 'Asexual', 'Questioning'] as const;
const STATUS = ['Single', 'Dating', 'Partnered', 'Open', 'Married', "It's complicated"] as const;
const LOOKING = ['Friends', 'Chat', 'Dates', 'Relationship', 'Networking', 'Events'] as const;
const TRIBES = ['Bear', 'Twink', 'Otter', 'Jock', 'Daddy', 'Geek', 'Leather', 'Trans', 'Discreet'] as const;
const INTERESTS = ['Gaming', 'Fitness', 'Travel', 'Music', 'Movies', 'Photography', 'Cooking', 'Art', 'Tech', 'Sports', 'Pets', 'Nightlife', 'Reading', 'Fashion'] as const;
const LANGS = ['English', 'Русский', 'Türkçe', 'Español', 'Deutsch', 'Français', 'العربية', 'Azərbaycan'] as const;

export default function EditProfile({ me, onSaved, onBack }: {
  me: Me;
  onSaved: () => void;
  onBack: () => void;
}) {
  const t = useT();

  const [displayName, setDisplayName] = useState(me.display_name);
  const [handle, setHandle] = useState(me.handle);
  // Trimmed to the date part: /v1/me sends a full ISO timestamp because
  // postgres.js decodes date columns as Date objects, and an <input
  // type="date"> only accepts YYYY-MM-DD.
  const [birthDate, setBirthDate] = useState(String(me.birth_date ?? '').slice(0, 10));
  const [bio, setBio] = useState(me.bio ?? '');
  const [gender, setGender] = useState(me.gender);
  const [pronouns, setPronouns] = useState(me.pronouns);
  const [orientation, setOrientation] = useState(me.orientation);
  const [status, setStatus] = useState(me.relationship_status);
  const [looking, setLooking] = useState<string[]>(me.looking_for ?? []);
  const [tribes, setTribes] = useState<string[]>(me.tribes ?? []);
  const [interests, setInterests] = useState<string[]>(me.interests ?? []);
  const [languages, setLanguages] = useState<string[]>(me.languages ?? []);
  const [heightCm, setHeightCm] = useState(me.height_cm ? String(me.height_cm) : '');
  const [weightKg, setWeightKg] = useState(me.weight_kg ? String(me.weight_kg) : '');

  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // A handle is required now — it is how everyone is addressed.
  const handleValid = /^[a-zA-Z0-9_]{1,24}$/.test(handle);

  /**
   * Same live availability check as registration. Changing your handle
   * here hit the same wall from the other side: you only learned the
   * name was taken after pressing Save, by which point the rest of the
   * form had already been sent and rejected with it.
   *
   * Your own current handle is always "free" — otherwise editing your
   * bio while leaving the handle alone would flag your own name as
   * taken and disable Save.
   */
  const [handleState, setHandleState] =
    useState<'idle' | 'checking' | 'free' | 'taken' | 'error'>('idle');
  const handleSeq = useRef(0);

  useEffect(() => {
    if (!handleValid || handle.toLowerCase() === me.handle.toLowerCase()) {
      setHandleState('idle');
      return;
    }
    setHandleState('checking');
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
  }, [handle, handleValid, me.handle]);

  /** Today minus 18 years — the latest date that can be an adult. */
  const maxBirthDate = (() => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 18);
    return d.toISOString().slice(0, 10);
  })();
  const birthAge = ageFrom(birthDate);

  const payload = useCallback(() => ({
    display_name: displayName.trim(),
    handle,
    // Sent only when it parses and clears the gate; an in-progress date
    // must not fire a rejected autosave on every keystroke.
    birth_date: /^\d{4}-\d{2}-\d{2}$/.test(birthDate)
      && (ageFrom(birthDate) ?? 0) >= 18 ? birthDate : undefined,
    bio: bio.trim() || undefined,
    gender: gender ?? undefined,
    pronouns: pronouns ?? undefined,
    orientation: orientation ?? undefined,
    relationship_status: status ?? undefined,
    looking_for: looking,
    tribes,
    interests,
    languages,
    height_cm: heightCm ? Number(heightCm) : undefined,
    weight_kg: weightKg ? Number(weightKg) : undefined,
  }), [displayName, handle, birthDate, bio, gender, pronouns, orientation, status,
       looking, tribes, interests, languages, heightCm, weightKg]);

  /**
   * Autosave.
   *
   * Every edit persists on its own — a second after you stop typing,
   * and again on the way out via the back button. There is no state
   * where a change is visible on screen but not stored, which is the
   * whole point: leaving the screen should never be how you lose work.
   *
   * `saved` is the last payload written. Comparing against it means a
   * re-render with identical values does not fire another PATCH, and a
   * failed save stays dirty so the next tick retries it.
   */
  const saved = useRef(JSON.stringify(payload()));
  /**
   * The write currently in flight, if any.
   *
   * This used to be a boolean, and `persist` returned immediately when
   * it was set. Leaving the screen mid-write therefore skipped the
   * final save *and* navigated away, so the last thing typed was lost —
   * exactly the case autosave exists to prevent. Holding the promise
   * lets the exit path wait for the write instead of abandoning it.
   */
  const inFlight = useRef<Promise<void> | null>(null);

  const persist = useCallback(async (opts?: { silent?: boolean }): Promise<void> => {
    // Let any write already running finish before deciding what is
    // still unsaved, or the comparison below reads a stale baseline.
    if (inFlight.current) {
      try { await inFlight.current; } catch { /* handled by its own caller */ }
    }

    const next = JSON.stringify(payload());
    if (next === saved.current) return;
    // An invalid username would be rejected; keep the edit on screen
    // rather than nagging on every keystroke.
    if (!/^[a-zA-Z0-9_]{1,24}$/.test(handle)) return;

    const run = (async () => {
      try {
        await apiFetch('/v1/me', { method: 'PATCH', body: next });
        saved.current = next;
        setError(null);
        if (!opts?.silent) setJustSaved(Date.now());
      } catch (err) {
        // Every failure surfaces. Swallowing anything but HANDLE_TAKEN
        // meant a rejected field looked exactly like a successful save,
        // which is the worst possible outcome for an autosaving form.
        if (err instanceof ApiError && err.code === 'HANDLE_TAKEN') {
          setHandleState('taken');
          setError('That username is not available. Try another one.');
        } else {
          setError(err instanceof ApiError ? err.message : 'Could not save. Check your connection.');
        }
      } finally {
        inFlight.current = null;
      }
    })();

    inFlight.current = run;
    await run;
  }, [payload, handle]);

  // Debounced: one write per pause, not one per keystroke.
  useEffect(() => {
    const id = setTimeout(() => { void persist(); }, 1000);
    return () => clearTimeout(id);
  }, [persist]);

  // Back is a save, not a discard.
  /**
   * Back saves, then leaves — in that order. Navigating first would
   * unmount the component and cancel the write with it.
   */
  const leave = useCallback(async () => {
    await persist({ silent: true });
    onBack();
  }, [persist, onBack]);

  useEffect(() => tg.backButton(() => { void leave(); }), [leave]);

  /**
   * Closing the Mini App outright is a third way out, and it fires no
   * back handler. Flush on the way to hidden so work is not lost by
   * swiping the app away mid-edit.
   */
  useEffect(() => {
    const flush = () => { if (document.hidden) void persist({ silent: true }); };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [persist]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/v1/me', {
        method: 'PATCH',
        body: JSON.stringify({
          display_name: displayName.trim(),
          handle,
          bio: bio.trim() || undefined,
          gender: gender ?? undefined,
          pronouns: pronouns ?? undefined,
          orientation: orientation ?? undefined,
          relationship_status: status ?? undefined,
          looking_for: looking,
          tribes,
          interests,
          languages,
          height_cm: heightCm ? Number(heightCm) : undefined,
          weight_kg: weightKg ? Number(weightKg) : undefined,
        }),
      });
      tg.notify('success');
      onSaved();
    } catch (err) {
      tg.notify('error');
      if (err instanceof ApiError && err.code === 'HANDLE_TAKEN') {
        setHandleState('taken');
        setError('That username is not available. Try another one.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not save');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="head"><h1>{t('profile.edit')}</h1></div>

      {/* Photos first — it's the change people come here to make. */}
      <div className="eyebrow tight" style={{ marginTop: 0 }}>{t('profile.photos')}</div>
      <PhotoManager />
      <div style={{ height: 18 }} />

      <Field label={t('profile.displayName')}>
        <input value={displayName} maxLength={50}
               onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
      <Field label={t('profile.handle')}
             hint={
               !handleValid ? 'Letters, numbers and underscores only, 1–24 characters.'
               : handleState === 'checking' ? 'Checking availability…'
               : handleState === 'taken' ? '✕ That username is not available — try another one.'
               : handleState === 'free' ? '✓ Available.'
               : undefined
             }>
        <input value={handle} maxLength={24} autoCapitalize="none" autoCorrect="off"
               onChange={(e) => setHandle(e.target.value.replace(/\s/g, ''))} />
      </Field>
      <Field label={t('profile.bio')}>
        <textarea value={bio} rows={4} maxLength={500}
                  onChange={(e) => setBio(e.target.value)} />
      </Field>

      {/* Editable now: people mistype this at signup and were stuck
          with a wrong age forever. The server re-checks 18+, so a
          correction cannot become a way around the gate. */}
      <Field label={t('profile.age')}
             hint={birthAge === null ? t('profile.birthHint')
               : birthAge < 18 ? t('profile.under18')
               : `${birthAge}`}>
        <input className="input" type="date" value={birthDate} max={maxBirthDate}
               onChange={(e) => setBirthDate(e.target.value)} />
      </Field>

      <Field label={t('profile.gender')}><ChipPick options={GENDERS} value={gender} onChange={setGender} /></Field>
      <Field label={t('profile.pronouns')}><ChipPick options={PRONOUNS} value={pronouns} onChange={setPronouns} /></Field>
      <Field label={t('profile.orientation')}><ChipPick options={ORIENTATIONS} value={orientation} onChange={setOrientation} /></Field>
      <Field label={t('profile.relationship')}><ChipPick options={STATUS} value={status} onChange={setStatus} /></Field>
      <Field label={t('profile.lookingFor')}><ChipGroup options={LOOKING} selected={looking} onChange={setLooking} /></Field>
      <Field label={t('profile.tribes')}><ChipGroup options={TRIBES} selected={tribes} onChange={setTribes} max={4} /></Field>
      <Field label={t('profile.interests')}><ChipGroup options={INTERESTS} selected={interests} onChange={setInterests} max={8} /></Field>
      <Field label={t('profile.languages')}><ChipGroup options={LANGS} selected={languages} onChange={setLanguages} /></Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={t('profile.height')}>
          <input type="number" inputMode="numeric" min={100} max={250} value={heightCm}
                 placeholder="—" onChange={(e) => setHeightCm(e.target.value)} />
        </Field>
        <Field label={t('profile.weight')}>
          <input type="number" inputMode="numeric" min={30} max={300} value={weightKg}
                 placeholder="—" onChange={(e) => setWeightKg(e.target.value)} />
        </Field>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <Button onClick={save}
              disabled={busy || !handleValid || handleState === 'taken'
                        || displayName.trim().length === 0}>
        {busy ? t('common.loading') : t('common.save')}
      </Button>
      <div style={{ height: 10 }} />
      {/* Leaving saves. This used to be Cancel, which discarded — but
          the screen autosaves as you type, so "cancel" was a promise it
          could not keep. It writes anything still pending and exits. */}
      <Button variant="ghost"
              onClick={() => { void leave(); }}>
        {t('common.back')}
      </Button>
    </div>
  );
}
