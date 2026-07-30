import { useT } from '../i18n';
import ComingSoon from '../components/ComingSoon';

export default function Chats() {
  const t = useT();
  return (
    <div className="screen">
      <div className="head"><h1>{t('chats.title')}</h1></div>
      <ComingSoon title={t('soon.chats')} body={t('soon.chats.body')} />
    </div>
  );
}
