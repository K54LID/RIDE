import type { Me } from '../lib/api';
import CourtCrest, { courtTier } from '../components/CourtCrest';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="num" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{value}</div>
      <div className="eyebrow" style={{ fontSize: '0.6rem' }}>{label}</div>
    </div>
  );
}

function TagRow({ label, items }: { label: string; items: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div className="chips">
        {items.map((i) => (
          <span key={i} className="chip" style={{ pointerEvents: 'none' }}>{i}</span>
        ))}
      </div>
    </div>
  );
}

function ageFrom(birth: string): number | null {
  const b = new Date(`${birth}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) a -= 1;
  return a;
}

export default function Profile({ me }: { me: Me }) {
  const age = ageFrom(me.birth_date);
  const tier = courtTier(me.court_value);
  const nextValue = me.court_value * 2;
  const isVip = me.vip_until !== null && new Date(me.vip_until) > new Date();

  return (
    <div className="screen">
      {/* Court Value leads the profile — it is the one number that
          ranks you, so it gets the position and the weight. */}
      <div className="card" style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <CourtCrest value={me.court_value} size={104} />
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Court value</div>
          <h1 style={{ fontSize: '1.4rem', margin: '2px 0 6px' }}>Tier {tier}</h1>
          <p style={{ fontSize: '0.85rem' }}>
            <span className="num">{nextValue}</span> coins to reach tier {tier + 1}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1>{me.display_name}{age !== null ? <span className="num" style={{ color: 'var(--muted)', fontWeight: 400 }}> {age}</span> : null}</h1>
          {me.verification === 'approved' ? (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="var(--verify)" aria-label="Verified">
              <path d="M12 2 14.9 4.6l3.8-.4.9 3.7 3.2 2.1-2 3.3 1.2 3.7-3.7 1.1-1.6 3.5-3.7-1-3.7 1-1.6-3.5-3.7-1.1L2.2 13.3.2 10l3.2-2.1.9-3.7 3.8.4L12 2z" />
              <path d="m8.5 12 2.4 2.4 4.6-4.9" stroke="var(--void)" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
          {isVip ? (
            <span className="chip" style={{
              pointerEvents: 'none', padding: '3px 10px', fontSize: '0.7rem',
              borderColor: 'var(--court)', color: 'var(--court-lit)',
              background: 'rgba(201,162,39,0.12)',
            }}>VIP</span>
          ) : null}
        </div>

        {me.handle ? <p className="num" style={{ fontSize: '0.9rem' }}>@{me.handle}</p> : null}
        {me.bio ? <p style={{ marginTop: 12, color: 'var(--ink)' }}>{me.bio}</p> : null}
      </div>

      <div className="card" style={{
        marginTop: 20, display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '16px 12px',
      }}>
        <Stat label="Woofs" value={me.woofs_received} />
        <Stat label="Gifts" value={me.gifts_received} />
        <Stat label="Followers" value={me.followers} />
        <Stat label="Following" value={me.following} />
      </div>

      <div className="card" style={{
        marginTop: 12, display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div className="eyebrow">Balance</div>
          <div className="num" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--court-lit)' }}>
            {me.coin_balance} coins
          </div>
        </div>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="var(--court)" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="5" stroke="var(--court)" strokeWidth="1.2" opacity="0.55" />
        </svg>
      </div>

      <TagRow label="Looking for" items={me.looking_for} />
      <TagRow label="Tribes" items={me.tribes} />
      <TagRow label="Interests" items={me.interests} />
      <TagRow label="Languages" items={me.languages} />

      {(me.gender || me.pronouns || me.orientation || me.relationship_status || me.height_cm || me.weight_kg) && (
        <div style={{ marginTop: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Details</div>
          <div className="card" style={{ display: 'grid', gap: 9, fontSize: '0.9rem' }}>
            {([
              ['Gender', me.gender],
              ['Pronouns', me.pronouns],
              ['Orientation', me.orientation],
              ['Relationship', me.relationship_status],
              ['Height', me.height_cm ? `${me.height_cm} cm` : null],
              ['Weight', me.weight_kg ? `${me.weight_kg} kg` : null],
            ] as const)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
