import { useEffect, useState } from 'react';
import { apiFetch, ApiError, type Me } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Button, ChipGroup, ChipPick, Field } from '../components/ui';
import PhotoManager from '../components/PhotoManager';

const GENDERS = ['Man', 'Woman', 'Non-binary', 'Trans man', 'Trans woman', 'Prefer not to say'] as const;
const PRONOUNS = ['he/him', 'she/her', 'they/them', 'any'] as const;
const ORIENTATIONS = ['Gay', 'Bi', 'Queer', 'Pan', 'Straight', 'Asexual', 'Questioning'] as const;
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
  useEffect(() => tg.backButton(onBack), [onBack]);

  const [displayName, setDisplayName] = useState(me.display_name);
  const [handle, setHandle] = useState(me.handle);
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
  const [error, setError] = useState<string | null>(null);

  // A handle is required now — it is how everyone is addressed.
  const handleValid = /^[a-zA-Z0-9_]{3,24}$/.test(handle);

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
        setError('That handle is taken. Try another.');
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
             hint={handleValid ? undefined : 'Letters, numbers and underscores only, 3–24 characters.'}>
        <input value={handle} maxLength={24} autoCapitalize="none" autoCorrect="off"
               onChange={(e) => setHandle(e.target.value.replace(/\s/g, ''))} />
      </Field>
      <Field label={t('profile.bio')}>
        <textarea value={bio} rows={4} maxLength={500}
                  onChange={(e) => setBio(e.target.value)} />
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

      <Button onClick={save} disabled={busy || !handleValid || displayName.trim().length === 0}>
        {busy ? t('common.loading') : t('common.save')}
      </Button>
      <div style={{ height: 10 }} />
      <Button variant="ghost" onClick={onBack}>{t('common.cancel')}</Button>
    </div>
  );
}
