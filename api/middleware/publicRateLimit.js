/**
 * Simple in-memory rate limit for unauthenticated public endpoints.
 * Not a substitute for nginx/fail2ban; enough to stop form spam in a demo/pilot.
 */
function publicRateLimit({ windowMs = 15 * 60 * 1000, max = 8 } = {}) {
  const hits = new Map();

  function prune(now) {
    for (const [key, stamps] of hits) {
      const next = stamps.filter((t) => now - t < windowMs);
      if (next.length) hits.set(key, next);
      else hits.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (hits.size > 5000) prune(now);
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
      .split(',')[0]
      .trim();
    const stamps = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (stamps.length >= max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({
        error: 'Too many booking requests from this network. Please try again later.',
      });
    }
    stamps.push(now);
    hits.set(ip, stamps);
    next();
  };
}

module.exports = publicRateLimit;
