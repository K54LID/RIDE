/**
 * Capture a still frame from a video file, in the browser, before upload.
 *
 * Telegram generates a thumbnail for most videos, but not all — it
 * depends on the container and codec it was handed, and when it returns
 * none the clip renders as a blank tile in the feed with only a play
 * button on it. Rather than depend on that, the client grabs its own
 * frame and sends it alongside the upload; the server uses it only if
 * Telegram gave nothing.
 *
 * Seeks a little way in rather than taking frame zero: the first frame
 * of a phone recording is very often black or a blur of the camera
 * still settling, which is a worse preview than none.
 *
 * Never throws. A missing poster is a cosmetic loss and must not be
 * able to fail an upload.
 */
export async function captureVideoPoster(file: File): Promise<Blob | null> {
  if (!file.type.startsWith('video/')) return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      const fail = () => reject(new Error('metadata'));
      video.onloadedmetadata = () => resolve();
      video.onerror = fail;
      setTimeout(fail, 8000);
    });

    // One second in, or the midpoint of anything shorter.
    const target = Number.isFinite(video.duration) && video.duration > 0
      ? Math.min(1, video.duration / 2)
      : 0;

    await new Promise<void>((resolve, reject) => {
      const fail = () => reject(new Error('seek'));
      video.onseeked = () => resolve();
      video.onerror = fail;
      setTimeout(fail, 8000);
      video.currentTime = target;
    });

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;

    // Cap the long edge. This is a preview, not the video — a 4K frame
    // would cost more to upload than the thumbnail saves.
    const MAX_EDGE = 1280;
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82);
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}
