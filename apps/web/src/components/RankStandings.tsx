import type { RankEntryMini } from '../lib/api';
import { useT } from '../i18n';

/** Board order is fixed: court first, then the four tallies. */
const ORDER: Array<[RankEntryMini['board'], string]> = [
  ['court', '👑'],
  ['woofs', '🐾'],
  ['likes', '❤️'],
  ['gifts', '🎁'],
  ['followers', '👤'],
];

/**
 * All five positions on one line.
 *
 * This was a five-row table with labels and scores, which is a lot of
 * vertical space to say "you are #2 at four things". A rank is a glance,
 * not a report — the glyph carries the board and the number carries the
 * standing, so the whole thing fits in the height of one former row and
 * the details below it stay above the fold.
 */
export default function RankStandings({ ranks }: { ranks: RankEntryMini[] }) {
  const t = useT();
  if (ranks.length === 0) return null;

  const by = new Map(ranks.map((r) => [r.board, r]));

  return (
    <div className="rank-strip">
      {ORDER.map(([board, glyph]) => {
        const r = by.get(board);
        if (!r) return null;
        return (
          <span key={board} className="rank-pill"
                title={`${t(board === 'likes' ? 'ranks.likes'
                  : board === 'court' ? 'profile.courtValue'
                  : board === 'woofs' ? 'profile.woofs'
                  : board === 'gifts' ? 'profile.gifts'
                  : 'profile.followers')}: ${r.score}`}>
            <span className="rank-pill-glyph" aria-hidden="true">{glyph}</span>
            <span className={`num rank-pill-num ${r.rank <= 3 ? 'top' : ''}`}>#{r.rank}</span>
          </span>
        );
      })}
    </div>
  );
}
