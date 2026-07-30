import { Redis } from 'ioredis';
import { config } from '../config.js';

/**
 * Redis is used only for ephemera (typing indicators). If it's down,
 * those features silently degrade rather than taking requests with
 * them — hence lazyConnect and swallowed errors at call sites.
 */
export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => Math.min(times * 500, 5000),
});

redis.on('error', () => {
  /* logged once by ioredis; typing indicators just go quiet */
});
