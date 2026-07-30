/**
 * The Court Crest — RIDE's signature element.
 *
 * Court Value doubles: 1, 2, 4, 8, 16… so the interesting quantity is
 * not the number but the EXPONENT. The crest renders that exponent as
 * filled notches around a ring, turning value into a visible rank.
 * A user at 128 reads as "seven notches" from across a room; a raw
 * number would not.
 *
 * Rings hold 12 notches (value 4096). Beyond that the ring saturates
 * and the numeral carries it — by then the rank speaks for itself.
 */

const NOTCHES = 12;

export function courtTier(value: number): number {
  return Math.max(0, Math.floor(Math.log2(Math.max(1, value))));
}

export default function CourtCrest({
  value,
  size = 108,
}: {
  value: number;
  size?: number;
}) {
  const tier = Math.min(courtTier(value), NOTCHES);
  const c = size / 2;
  const rOuter = c - 4;
  const rInner = c - 15;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Court value ${value}, tier ${tier}`}
    >
      <defs>
        <linearGradient id="crestGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--court-lit)" />
          <stop offset="100%" stopColor="var(--court)" />
        </linearGradient>
        <filter id="crestGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {Array.from({ length: NOTCHES }, (_, i) => {
        // Start at 12 o'clock and fill clockwise.
        const angle = (i / NOTCHES) * Math.PI * 2 - Math.PI / 2;
        const lit = i < tier;
        const x1 = c + Math.cos(angle) * rInner;
        const y1 = c + Math.sin(angle) * rInner;
        const x2 = c + Math.cos(angle) * rOuter;
        const y2 = c + Math.sin(angle) * rOuter;
        return (
          <line
            key={i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={lit ? 'url(#crestGold)' : 'var(--hairline)'}
            strokeWidth={lit ? 4 : 2.5}
            strokeLinecap="round"
            filter={lit ? 'url(#crestGlow)' : undefined}
            style={{
              animation: lit ? `notch 0.4s var(--ease) ${i * 0.055}s both` : undefined,
            }}
          />
        );
      })}

      <circle cx={c} cy={c} r={rInner - 5} fill="var(--surface)" stroke="var(--hairline)" />
      <text
        x={c} y={c + 1}
        textAnchor="middle" dominantBaseline="middle"
        className="num"
        fontSize={value > 999 ? size * 0.2 : size * 0.26}
        fontWeight="700"
        fill="var(--court-lit)"
      >
        {value}
      </text>

      <style>{`@keyframes notch { from { opacity: 0; stroke-width: 1; } }`}</style>
    </svg>
  );
}
