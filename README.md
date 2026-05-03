# 🛡️ Speed Test — Advanced Forensic Diagnostic Workspace

[![Status: Production](https://img.shields.io/badge/Status-Production-success?style=flat-square)](#)
[![Stack: Node.js/Express](https://img.shields.io/badge/Stack-Node.js%20%7C%20Express-blue?style=flat-square)](#)
[![Design: Premium Cyberpunk](https://img.shields.io/badge/Design-Premium%20Cyberpunk-red?style=flat-square)](#)

A high-performance, professional-grade diagnostic platform designed for network research, device fingerprinting, and high-precision forensic data collection. This project combines a seamless "Speed Test" user experience with a powerful, secure back-office for data analysis and geographic tracking.

---

## 🌟 Key Features

### 🕵️‍♂️ Stealth Forensic Capture
*   **IP Intelligence:** Deep resolution of client IP, including ISP, ASN, and organizational metadata.
*   **WebRTC Leak Detection:** Identify real local/private IPs behind VPNs or proxies.
*   **Hardware Fingerprinting:** Multi-layered device identification using Canvas, Audio, GPU, and Hardware concurrency metrics.
*   **Environment Analysis:** Capture platform, screen resolution, language, and timezone settings.

### 📍 Precision Geolocation
*   **Sensor Fusion:** Real-time GPS tracking with accuracy metrics (meters).
*   **Fallback Triangulation:** Geographic estimation via IP-API when GPS is unavailable.
*   **Live Calibration:** Interactive map interface for visualizing capture sessions in real-time.

### 📊 Secure Research Dashboard
*   **Data Visualization:** Integrated Leaflet.js maps with custom dark-themed tiles.
*   **Advanced Filtering:** Sort and filter captures by device ID, IP, location, or capture type.
*   **Analytics Overview:** Real-time stats on total captures, unique devices, and GPS hits.
*   **Export Ready:** One-click data export to **JSON** or **CSV** formats for external analysis.

### 🔐 Enterprise-Grade Security
*   **Session Auth:** Secure, cookie-based authentication system for dashboard access.
*   **Cyberpunk UI:** Custom, premium login interface with glassmorphism and parallax effects.
*   **Environment Guard:** Credentials configurable via environment variables (`ADMIN_USER`, `ADMIN_PASS`).

---

## 🛠 Tech Stack

*   **Runtime:** Node.js (v18+)
*   **Framework:** Express.js
*   **Frontend:** Vanilla JavaScript (ES6+), CSS3 Grid/Flexbox
*   **Mapping:** Leaflet.js
*   **Database:** Synchronized JSONBlob Cloud API (Synchronous cross-device state)
*   **Icons/UI:** Custom SVG assets & Google Fonts (Outfit, JetBrains Mono)

---

## 🚀 Installation & Deployment

### 1. Local Setup
```bash
# Clone the repository
git clone https://github.com/Prudctual/IG-detector.git
cd IG-detector

# Install dependencies
npm install

# Start the server
node server.js
```

### 2. Environment Variables
To customize access, create a `.env` file or set the following environment variables:
*   `ADMIN_USER`: The username for dashboard access (Default: `Jassim99x`).
*   `ADMIN_PASS`: The password for dashboard access (Default: `Jassim99x`).
*   `PORT`: The port to run the server on (Default: `3000`).

### 3. Vercel Deployment
The project is pre-configured for Vercel. Simply push the code to a GitHub repository and link it to your Vercel account. Ensure `JSONBLOB_ID` is configured in `server.js` or passed as a variable.

---

## 📖 Usage Guide

1.  **Client Entry:** Users visit the root URL (`/`) to perform a network diagnostic (Speed Test).
2.  **Silent Capture:** Upon interaction, forensic metadata is captured and synced to the cloud database.
3.  **Dashboard Access:** Navigate to `/dashboard`. You will be prompted for credentials.
4.  **Data Management:** View real-time captures on the map, analyze device fingerprints, and clear or export data as needed.

---

## ⚖️ Ethical Disclosure
This software is intended for **authorized research, diagnostic, and educational purposes only**. The developers do not condone the use of this tool for unauthorized tracking or any activities that violate privacy laws or terms of service of third-party platforms.

---
**© 2026 Jasim Kareem / Articles for Free Minds.**  
*Crafted with precision for analytical minds.*
