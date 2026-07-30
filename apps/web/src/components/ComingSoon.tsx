import type { ReactNode } from 'react';

/**
 * The surface shown wherever a feature isn't built yet.
 *
 * It exists so unbuilt areas look intentional instead of broken. It says
 * plainly that the thing is coming and what it will do — no mock content,
 * because fake feeds photograph well and mislead anyone actually testing.
 *
 * The mark is the Court Crest's notch ring, hollow: the app's own shape,
 * drawn as an outline waiting to be filled.
 */
export default function ComingSoon({
  title, body, action,
}: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="soon">
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true" className="soon-mark">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          return (
            <line
              key={i}
              x1={44 + Math.cos(a) * 28} y1={44 + Math.sin(a) * 28}
              x2={44 + Math.cos(a) * 40} y2={44 + Math.sin(a) * 40}
              stroke="var(--hairline)" strokeWidth="2.5" strokeLinecap="round"
              style={{ animation: `soonPulse 2.6s ease-in-out ${i * 0.11}s infinite` }}
            />
          );
        })}
        <circle cx="44" cy="44" r="23" fill="none" stroke="var(--hairline)" strokeDasharray="3 5" />
      </svg>

      <span className="soon-tag">Coming soon</span>
      <h2>{title}</h2>
      <p>{body}</p>
      {action ? <div style={{ marginTop: 20 }}>{action}</div> : null}
    </div>
  );
}
