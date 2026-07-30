import type { Person } from '../lib/api';
import { VerifiedMark } from './VerifiedMark';

export default function PersonCard({ person }: { person: Person }) {
  const initial = person.display_name.trim().charAt(0).toUpperCase() || '?';
  const bits = [
    person.age !== null ? String(person.age) : null,
    person.gender,
    person.distance,
  ].filter(Boolean);

  return (
    <div className="person">
      <div className="person-avatar">{initial}</div>
      <div className="person-main">
        <div className="person-name">
          {person.online ? <span className="online-dot" /> : null}
          {person.display_name}
          {person.verified ? <VerifiedMark size={15} /> : null}
        </div>
        <div className="person-sub">
          {bits.length > 0 ? bits.join(' · ') : person.handle ? `@${person.handle}` : ''}
        </div>
      </div>
      <div className="num" style={{ color: 'var(--court-lit)', fontWeight: 700 }}>
        {person.court_value}
      </div>
    </div>
  );
}
