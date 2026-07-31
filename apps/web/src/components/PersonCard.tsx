import type { Person } from '../lib/api';
import { VerifiedMark } from './VerifiedMark';
import Media from './Media';

/**
 * A single tile in Discover's photo grid.
 *
 * The previous version was a full-width row — an avatar initial, a
 * name, a line of "24 · Man · 3 km" text. That reads fine one at a
 * time but wastes most of the screen. This is a square tile with the
 * person's own photo filling it; name, age and the verified badge sit
 * in a gradient strip at the bottom, the way every photo-first
 * discovery grid works. No photo yet falls back to the initial letter
 * on a plain tile rather than leaving a blank square.
 */
export default function PersonCard({ person }: { person: Person }) {
  const initial = person.display_name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="tile">
      {person.avatar_media_id ? (
        <Media id={person.avatar_media_id} kind="image" thumb />
      ) : (
        <div className="tile-fallback">{initial}</div>
      )}

      {person.online ? <span className="tile-online" /> : null}

      <div className="tile-info">
        <span className="tile-name">
          {person.display_name}
          {person.age !== null ? <span className="tile-age">, {person.age}</span> : null}
        </span>
        {person.verified ? <VerifiedMark size={14} /> : null}
      </div>
      {person.distance ? <span className="tile-distance">{person.distance}</span> : null}
    </div>
  );
}
