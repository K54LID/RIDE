import { useState } from 'react';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import Page from '../components/Page';
import type { T } from '../i18n/strings';

/**
 * How everything works.
 *
 * Half the mechanics here are invented — court value, woofs, tiers,
 * private albums, the coin economy — so nobody arrives already knowing
 * them. Left unexplained they read as arbitrary, and a leaderboard
 * whose rules are a mystery mostly generates resentment. Every question
 * below states the rule and the one thing that changes the outcome.
 *
 * Accordion rather than a wall of text: fourteen answers in a row is
 * something people scroll past, not read.
 */

const SECTIONS: Array<{ q: keyof T; a: keyof T }> = [
  { q: 'faq.what.q', a: 'faq.what.a' },
  { q: 'faq.username.q', a: 'faq.username.a' },
  { q: 'faq.woof.q', a: 'faq.woof.a' },
  { q: 'faq.court.q', a: 'faq.court.a' },
  { q: 'faq.courtMoney.q', a: 'faq.courtMoney.a' },
  { q: 'faq.coins.q', a: 'faq.coins.a' },
  { q: 'faq.gifts.q', a: 'faq.gifts.a' },
  { q: 'faq.ranks.q', a: 'faq.ranks.a' },
  { q: 'faq.discover.q', a: 'faq.discover.a' },
  { q: 'faq.location.q', a: 'faq.location.a' },
  { q: 'faq.private.q', a: 'faq.private.a' },
  { q: 'faq.stories.q', a: 'faq.stories.a' },
  { q: 'faq.verify.q', a: 'faq.verify.a' },
  { q: 'faq.ghost.q', a: 'faq.ghost.a' },
  { q: 'faq.block.q', a: 'faq.block.a' },
  { q: 'faq.report.q', a: 'faq.report.a' },
  { q: 'faq.delete.q', a: 'faq.delete.a' },
];

export default function Faq({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Page title={t('settings.faq')} onClose={onClose}>
      <p className="hint" style={{ marginBottom: 14 }}>{t('faq.intro')}</p>

      {SECTIONS.map(({ q, a }) => {
        const isOpen = open === q;
        return (
          <div key={q} className="faq-item">
            <button className="faq-q" aria-expanded={isOpen}
                    onClick={() => { tg.tap('light'); setOpen(isOpen ? null : q); }}>
              <span>{t(q)}</span>
              <span className="faq-caret" aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen ? <p className="faq-a">{t(a)}</p> : null}
          </div>
        );
      })}
    </Page>
  );
}
