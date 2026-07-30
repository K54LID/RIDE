import { useEffect } from 'react';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { EmptyState } from '../components/ui';

export default function Alerts({ onBack }: { onBack: () => void }) {
  const t = useT();
  useEffect(() => tg.backButton(onBack), [onBack]);

  return (
    <div className="screen">
      <div className="head"><h1>{t('alerts.title')}</h1></div>
      <EmptyState title={t('alerts.empty')} body={t('alerts.empty.body')} />
    </div>
  );
}
