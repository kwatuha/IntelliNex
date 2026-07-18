/**
 * Daily.co REST API — https://docs.daily.co/reference/rest-api
 * Create rooms server-side; never expose DAILY_API_KEY to the browser.
 */
const DAILY_API_BASE = 'https://api.daily.co/v1';

function isDailyConfigured() {
  return !!String(process.env.DAILY_API_KEY || '').trim();
}

function dailyApiKey() {
  return String(process.env.DAILY_API_KEY || '').trim();
}

/**
 * @param {string} name
 * @returns {string} Daily-safe room name (alphanumeric + hyphen)
 */
function sanitizeRoomName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || `hmis-${Date.now()}`;
}

async function dailyRequest(method, path, body) {
  if (!isDailyConfigured()) {
    throw new Error('Daily.co is not configured (set DAILY_API_KEY).');
  }
  const res = await fetch(`${DAILY_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${dailyApiKey()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      data?.error ||
      data?.info ||
      data?.message ||
      `Daily API HTTP ${res.status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.dailyResponse = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Create a Daily Prebuilt room for a telemedicine session.
 * @param {{ sessionUuid?: string, name?: string, expHours?: number }} opts
 * @returns {Promise<{ id: string, name: string, url: string, privacy: string }>}
 */
async function createDailyRoom(opts = {}) {
  const expHours = Number(opts.expHours) > 0 ? Number(opts.expHours) : 24;
  const name = sanitizeRoomName(
    opts.name || (opts.sessionUuid ? `hmis-${String(opts.sessionUuid).replace(/-/g, '')}` : `hmis-${Date.now()}`)
  );
  const exp = Math.floor(Date.now() / 1000) + Math.round(expHours * 3600);

  const data = await dailyRequest('POST', '/rooms', {
    name,
    privacy: 'public',
    properties: {
      exp,
      enable_chat: true,
      enable_screenshare: true,
      start_video_off: false,
      start_audio_off: false,
      eject_at_room_exp: true,
    },
  });

  if (!data?.url) {
    throw new Error('Daily room created but no join URL was returned.');
  }

  console.log('[dailyVideo] room created', { name: data.name, url: data.url });
  return {
    id: data.id,
    name: data.name,
    url: data.url,
    privacy: data.privacy,
  };
}

/** Lightweight health check (list domain config). */
async function getDailyDomain() {
  return dailyRequest('GET', '/');
}

module.exports = {
  isDailyConfigured,
  sanitizeRoomName,
  createDailyRoom,
  getDailyDomain,
};
