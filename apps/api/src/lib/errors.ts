/**
 * Typed HTTP errors with a stable machine-readable `code`.
 *
 * The earlier scaffold called `app.httpErrors.*`, which is provided by
 * @fastify/sensible — a plugin that was never installed. Rather than add
 * a dependency for four call sites, we own the error shape. That also
 * gives the client a contract it can branch on (`code`) instead of
 * string-matching human-readable messages.
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'HttpError';
  }
}

export const unauthorized = (code = 'UNAUTHORIZED', message?: string) =>
  new HttpError(401, code, message);

export const forbidden = (code = 'FORBIDDEN', message?: string) =>
  new HttpError(403, code, message);

export const notFound = (code = 'NOT_FOUND', message?: string) =>
  new HttpError(404, code, message);
