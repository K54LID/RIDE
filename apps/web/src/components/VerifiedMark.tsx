import { useT } from '../i18n';
export function VerifiedMark({ size = 17 }: { size?: number }) {
  const t = useT();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--verify)" aria-label={t('common.verified')}>
      <path d="M12 2 14.9 4.6l3.8-.4.9 3.7 3.2 2.1-2 3.3 1.2 3.7-3.7 1.1-1.6 3.5-3.7-1-3.7 1-1.6-3.5-3.7-1.1L2.2 13.3.2 10l3.2-2.1.9-3.7 3.8.4L12 2z" />
      <path d="m8.5 12 2.4 2.4 4.6-4.9" stroke="var(--void)" strokeWidth="1.9"
            fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
