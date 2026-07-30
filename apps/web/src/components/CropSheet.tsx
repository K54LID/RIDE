import { useEffect, useRef, useState } from 'react';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { Button } from './ui';

const OUT_PX = 640;   // exported square edge

/**
 * Crop editor for the primary photo.
 *
 * The avatar renders as a circle everywhere, so what matters is which
 * square of the photo ends up inside that circle. Drag to move, slider
 * to zoom, and the circular mask previews exactly what the avatar will
 * show. Export re-draws the same geometry onto a 640px canvas — the
 * preview IS the output, just smaller.
 */
export default function CropSheet({ src, onCancel, onSave }: {
  src: string;
  onCancel: () => void;
  onSave: (blob: Blob) => void | Promise<void>;
}) {
  const t = useT();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [viewPx, setViewPx] = useState(300);

  useEffect(() => tg.backButton(onCancel), [onCancel]);

  useEffect(() => {
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = src;
  }, [src]);

  useEffect(() => {
    const el = viewRef.current;
    if (el) setViewPx(el.clientWidth);
  }, [img]);

  if (!img) {
    return (
      <div className="crop-overlay">
        <div className="skel" style={{ width: '70%', aspectRatio: 1 }} />
      </div>
    );
  }

  // Base scale covers the viewport; zoom multiplies on top.
  const s0 = Math.max(viewPx / img.naturalWidth, viewPx / img.naturalHeight);
  const dispW = img.naturalWidth * s0 * zoom;
  const dispH = img.naturalHeight * s0 * zoom;
  const maxX = Math.max(0, (dispW - viewPx) / 2);
  const maxY = Math.max(0, (dispH - viewPx) / 2);
  const clamp = (v: number, m: number) => Math.min(m, Math.max(-m, v));
  const x = clamp(pan.x, maxX);
  const y = clamp(pan.y, maxY);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: x, py: y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setPan({
      x: clamp(d.px + (e.clientX - d.x), maxX),
      y: clamp(d.py + (e.clientY - d.y), maxY),
    });
  };
  const onPointerUp = () => { drag.current = null; };

  const save = () => {
    setBusy(true);
    const canvas = document.createElement('canvas');
    canvas.width = OUT_PX;
    canvas.height = OUT_PX;
    const ctx = canvas.getContext('2d')!;
    // Same geometry as the preview, scaled to the output edge.
    const r = OUT_PX / viewPx;
    ctx.drawImage(
      img,
      OUT_PX / 2 - (dispW * r) / 2 + x * r,
      OUT_PX / 2 - (dispH * r) / 2 + y * r,
      dispW * r,
      dispH * r,
    );
    canvas.toBlob(async (blob) => {
      if (!blob) { setBusy(false); tg.notify('error'); return; }
      try { await onSave(blob); }
      finally { setBusy(false); }
    }, 'image/jpeg', 0.9);
  };

  return (
    <div className="crop-overlay" role="dialog" aria-modal="true">
      <h2 style={{ marginBottom: 14 }}>{t('crop.title')}</h2>

      <div
        ref={viewRef}
        className="crop-view"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            width: dispW, height: dispH, maxWidth: 'none',
            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
          }}
        />
        {/* Everything outside the circle is what the avatar crops away. */}
        <div className="crop-mask" aria-hidden="true" />
      </div>

      <label className="crop-zoom">
        <span className="eyebrow">{t('crop.zoom')}</span>
        <input
          type="range" min={1} max={3} step={0.01} value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </label>

      <Button disabled={busy} onClick={save}>{t('common.save')}</Button>
      <div style={{ height: 10 }} />
      <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
    </div>
  );
}
