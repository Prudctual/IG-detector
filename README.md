# Speed Test — Network Diagnostic and Research Dashboard

This is a university/educational project: a network diagnostic page that looks like a speed test, plus a map dashboard for reviewing captured IP and device metadata. It is intended for authorized research, classroom diagnostics, and similar educational use.

## Features

### Speed test interface

Visitors open the root URL (`/`) and run a network diagnostic presented as a speed test. During that interaction, the app records client metadata and stores it for later review.

### IP and device metadata

The capture includes:

- **IP information:** client IP, ISP, ASN, and organization metadata
- **WebRTC addresses:** local/private IPs that may appear even when a VPN or proxy is in use
- **Device identifiers:** Canvas, Audio, GPU, and hardware concurrency values
- **Environment:** platform, screen resolution, language, and timezone

### Location

- GPS coordinates and accuracy (in meters), when the browser grants location permission
- Approximate location from IP-API when GPS is unavailable
- A map of capture sessions

### Research dashboard

The dashboard at `/dashboard` is protected by cookie-based login. It provides:

- Leaflet.js map of captures
- Filters by device ID, IP, location, or capture type
- Counts for total captures, unique devices, and GPS hits
- Export to JSON or CSV

Set `ADMIN_USER` and `ADMIN_PASS` in the environment before using the dashboard. Do not rely on unconfigured defaults in production.

## Tech stack

- **Runtime:** Node.js (v18+)
- **Server:** Express.js
- **Frontend:** Vanilla JavaScript (ES6+), CSS Grid/Flexbox
- **Maps:** Leaflet.js
- **Storage:** JSONBlob cloud API (shared state across devices)
- **UI:** custom SVG assets and Google Fonts (Outfit, JetBrains Mono)

## Installation

### Local setup

```bash
git clone https://github.com/Prudctual/IG-detector.git
cd IG-detector
npm install
node server.js
```

### Environment variables

Configure these in a `.env` file or in the host environment:

- `ADMIN_USER` — dashboard username
- `ADMIN_PASS` — dashboard password
- `PORT` — server port (default `3000`)

### Vercel

The repo includes Vercel configuration. Connect the GitHub repository to a Vercel project and set `JSONBLOB_ID` (in `server.js` or as an environment variable).

## Usage

1. Open `/` to run the speed test / network diagnostic.
2. Metadata from that session is stored in the cloud database.
3. Open `/dashboard` and sign in with the credentials from `ADMIN_USER` / `ADMIN_PASS`.
4. Review captures on the map, inspect device metadata, and export or clear data as needed.

## Ethical disclosure

This software is for **authorized research, diagnostic, and educational purposes only**. Do not use it for unauthorized tracking or for anything that violates privacy law or third-party terms of service.

---

© 2026 Jasim Kareem
