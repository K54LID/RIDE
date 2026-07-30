import type { RankEntryMini } from '../lib/api';

const GLYPH: Record<RankEntryMini['board'], string> = {
  court: '♛', woofs: '🐾', likes: '❤️', gifts: '🎁', followers: '👤',
};

/** Only ranks worth bragging about make the cut. */
const HIGH_RANK = 100;
const MAX_CHIPS = 4;

/**
 * A profile's leaderboard standings as compact chips: "♛ #1 · 🐾 #4".
 *
 * At most four, best first, and only boards where the person actually
 * ranks high — #4192 is not a decoration, so it stays off the profile.
 */
export default function RankChips({ ranks }: { ranks: RankEntryMini[] }) {
  const shown = ranks
    .filter((r) => r.rank <= HIGH_RANK)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_CHIPS);

  if (shown.length === 0) return null;

  return (
    <div className="rank-chips">
      {shown.map((r) => (
        <span key={r.board} className={`rank-chip ${r.rank <= 3 ? 'top' : ''}`}>
          <span aria-hidden="true">{GLYPH[r.board]}</span>
          <b className="num">#{r.rank}</b>
        </span>
      ))}
    </div>
  );
}
