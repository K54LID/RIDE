import type { RankEntryMini } from '../lib/api';
import type { T } from '../i18n/strings';
import { useT } from '../i18n';

const ORDER: Array<[RankEntryMini['board'], string, keyof T]> = [
  ['court', '♛', 'profile.courtValue'],
  ['woofs', '🐾', 'profile.woofs'],
  ['likes', '❤️', 'ranks.likes'],
  ['gifts', '🎁', 'profile.gifts'],
  ['followers', '👤', 'profile.followers'],
];

/**
 * Every board spelled out in words: court value, woofs, likes, gifts,
 * followers — each with the person's score and their position on that
 * board. RankChips (the "♛ #1 · 🐾 #4" badges) only shows the ones
 * worth bragging about; this is the full picture underneath it, so a
 * profile answers "where do I actually stand" without a trip to Ranks.
 */
export default function RankStandings({ ranks }: { ranks: RankEntryMini[] }) {
  const t = useT();
  if (ranks.length === 0) return null;

  const by = new Map(ranks.map((r) => [r.board, r]));

  return (
    <div className="card compact standings">
      {ORDER.map(([board, glyph, key]) => {
        const r = by.get(board);
        if (!r) return null;
        return (
          <div key={board} className="standing-row">
            <span className="standing-glyph" aria-hidden="true">{glyph}</span>
            <span className="standing-label">{t(key)}</span>
            <span className="standing-score num">{r.score}</span>
            <span className={`standing-rank num ${r.rank <= 3 ? 'top' : ''}`}>#{r.rank}</span>
          </div>
        );
      })}
    </div>
  );
}
