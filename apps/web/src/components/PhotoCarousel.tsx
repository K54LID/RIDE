import { useRef, useState } from 'react';
import type { ProfilePhoto } from '../lib/api';
import Media from './Media';
import { useT } from '../i18n';

/**
 * Swipeable photo carousel.
 *
 * Native scroll-snap rather than a JS slider: it inherits momentum,
 * rubber-banding and accessibility from the platform, and can't fight
 * Telegram's own horizontal gestures the way a drag handler would. The
 * dots track scroll position instead of driving it.
 */
export default function PhotoCarousel({ photos, lockedCount = 0 }: {
  photos: ProfilePhoto[];
  lockedCount?: number;
}) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement | null>(null);

  if (photos.length === 0) return null;

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  };

  return (
    <div className="carousel">
      <div className="carousel-track" ref={track} onScroll={onScroll}>
        {photos.map((p) => (
          <div key={p.id} className="carousel-slide">
            <Media id={p.media_id} kind="image" />
            {p.is_private ? <span className="carousel-lock">🔒</span> : null}
          </div>
        ))}
      </div>

      {photos.length > 1 ? (
        <div className="carousel-dots">
          {photos.map((p, i) => <span key={p.id} className={i === index ? 'on' : ''} />)}
        </div>
      ) : null}

      {lockedCount > 0 ? (
        <span className="carousel-lock">🔒 {lockedCount}</span>
      ) : null}

      <span className="sr-only">{t('profile.photos')}</span>
    </div>
  );
}
