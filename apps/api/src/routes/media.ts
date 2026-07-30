import type { FastifyPluginAsync } from 'fastify';
import { sql } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';
import { uploadToTelegram, resolveFileUrl } from '../lib/telegramStorage.js';

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 45 * 1024 * 1024;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

/**
 * Multipart parsing without @fastify/multipart.
 *
 * Node 22 bundles undici, whose Response implements formData(). Handing
 * it the raw body plus the original content-type header (which carries
 * the boundary) gets a fully parsed form with real File objects — the
 * same parser a fetch() call would use.
 *
 * Zero dependencies, so the committed lockfile stays valid.
 */
async function readUpload(
  body: unknown,
  contentType: string | undefined,
): Promise<{ buffer: Buffer; filename: string; mimetype: string }> {
  if (!Buffer.isBuffer(body)) throw new HttpError(400, 'NO_FILE');
  if (!contentType?.startsWith('multipart/form-data')) {
    throw new HttpError(415, 'EXPECTED_MULTIPART');
  }

  let form: FormData;
  try {
    form = await new Response(body, { headers: { 'content-type': contentType } }).formData();
  } catch {
    throw new HttpError(400, 'MALFORMED_MULTIPART');
  }

  // Accept the conventional field name, or the first file in the form —
  // clients disagree about naming and this costs nothing to tolerate.
  let file = form.get('file');
  if (!(file instanceof File)) {
    for (const value of form.values()) {
      if (value instanceof File) { file = value; break; }
    }
  }
  if (!(file instanceof File)) throw new HttpError(400, 'NO_FILE');

  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name || 'upload',
    mimetype: file.type || 'application/octet-stream',
  };
}

const mediaRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Raw-body parser for uploads. Registered on this plugin instance, so
   * JSON parsing elsewhere is untouched.
   */
  app.addContentTypeParser(
    'multipart/form-data',
    { parseAs: 'buffer', bodyLimit: MAX_VIDEO + 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );

  /**
   * POST /v1/media — one file per request.
   *
   * Uploading and attaching are separate steps: a slow upload never
   * blocks the compose form, and an abandoned upload is an orphan row
   * rather than a half-created post.
   */
  app.post('/v1/media', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { buffer, filename, mimetype } = await readUpload(
      req.body,
      req.headers['content-type'],
    );

    const isImage = IMAGE_TYPES.has(mimetype);
    const isVideo = VIDEO_TYPES.has(mimetype);
    if (!isImage && !isVideo) {
      throw new HttpError(415, 'UNSUPPORTED_TYPE', `${mimetype} is not accepted`);
    }

    const limit = isImage ? MAX_IMAGE : MAX_VIDEO;
    if (buffer.byteLength > limit) {
      throw new HttpError(413, 'FILE_TOO_LARGE',
        `Max ${Math.round(limit / 1024 / 1024)} MB for this type`);
    }

    let stored;
    try {
      stored = await uploadToTelegram(buffer, filename, mimetype, isImage ? 'image' : 'video');
    } catch (err) {
      req.log.error({ err }, 'media upload failed');
      throw new HttpError(502, 'UPLOAD_FAILED', 'Storage rejected the file');
    }

    const [row] = await sql<{ id: string }[]>`
      INSERT INTO media (owner_id, kind, storage, file_ref, thumb_ref,
                         width, height, duration_ms, bytes)
      VALUES (${req.accountId}, ${isImage ? 'image' : 'video'}, 'telegram',
              ${stored.fileId}, ${stored.thumbId},
              ${stored.width}, ${stored.height}, ${stored.durationMs}, ${stored.bytes})
      RETURNING id
    `;

    reply.code(201);
    return {
      id: row!.id,
      kind: isImage ? 'image' : 'video',
      width: stored.width,
      height: stored.height,
      url: `/v1/media/${row!.id}`,
    };
  });

  /**
   * GET /v1/media/:id — streams bytes.
   *
   * A proxy rather than a redirect: Telegram's download URL contains the
   * bot token, and a redirect would hand it to the browser.
   */
  app.get('/v1/media/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const wantThumb = (req.query as { thumb?: string }).thumb === '1';

    const [row] = await sql<{ file_ref: string; thumb_ref: string | null; kind: string }[]>`
      SELECT file_ref, thumb_ref, kind::text AS kind FROM media WHERE id = ${id}
    `;
    if (!row) throw new HttpError(404, 'MEDIA_NOT_FOUND');

    const ref = wantThumb && row.thumb_ref ? row.thumb_ref : row.file_ref;

    let url: string;
    try {
      url = await resolveFileUrl(ref);
    } catch (err) {
      req.log.error({ err }, 'resolveFileUrl failed');
      throw new HttpError(502, 'MEDIA_UNAVAILABLE');
    }

    const upstream = await fetch(url);
    if (!upstream.ok || !upstream.body) throw new HttpError(502, 'MEDIA_UNAVAILABLE');

    // Immutable: a media id always maps to the same bytes.
    reply.header('Cache-Control', 'private, max-age=86400, immutable');
    reply.header('Content-Type',
      upstream.headers.get('content-type') ?? (row.kind === 'image' ? 'image/jpeg' : 'video/mp4'));
    const len = upstream.headers.get('content-length');
    if (len) reply.header('Content-Length', len);

    return reply.send(upstream.body);
  });

  app.delete('/v1/media/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await sql`
      DELETE FROM media WHERE id = ${id} AND owner_id = ${req.accountId} RETURNING id
    `;
    if (rows.length === 0) throw new HttpError(404, 'MEDIA_NOT_FOUND');
    reply.code(204);
  });
};

export default mediaRoutes;