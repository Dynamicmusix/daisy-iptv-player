# Daisy IPTV (v1.0.0)

<p align="center">
  <img src="https://img.shields.io/badge/Daisy%20IPTV-v1.0.0-blue?style=for-the-badge" alt="Daisy IPTV Version" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/Platform-Web%20%7C%20Android%20TV%20%7C%20Apple%20TV%20%7C%20Mobile-orange?style=for-the-badge" alt="Platforms" />
  <img src="https://img.shields.io/badge/Deploy%20on-Vercel-black?style=for-the-badge&logo=vercel" alt="Vercel Ready" />
</p>

**Daisy IPTV** is an open, modern Set-Top Box (STB) & IPTV player engineered with an Apple TV / Liquid Glass UI/UX. It connects directly to Stalker / Ministra MAC portals to deliver live TV broadcasts, electronic program guides (EPG), and on-demand movies & series with real-time FFmpeg audio remuxing and server-side range seeking.

---

## 🌟 Key Features

### 1. Liquid Glass Interface
- **Apple TV Design System:** Translucent frosted glass pill top bar, dynamic artwork backdrops, white elevation focus highlights (`#f5f5f7`), and smooth spring curves (`cubic-bezier(0.22, 1.18, 0.42, 1)`).
- **Hero Showcase:** Full-bleed cinematic hero banner with IMDb rating badges, genres, plot description, and auto-cycling previews.
- **Home Live TV Genres Strip:** Live TV categories presented as interactive cards with instant one-click tuning.
- **Horizontal & Vertical Touch Scrolling:** 2D touch-screen drag navigation with velocity momentum and mouse-wheel support on all views and lists.

### 2. Live Broadcast & Playback Controls
- **Context-Aware Playback UI:**
  - **Live TV Mode:** Clean, unobstructed view showing only Aspect Ratio (`Auto`), Picture-in-Picture (`PIP`), Volume Slider with Mute (`🔊`), and Fullscreen (`⛶`). Unnecessary seek/rewind buttons are hidden.
  - **VOD & Series Mode:** Full interactive transport bar with `⏪ -30s`, `⏪ -15s`, `⏸ Pause / ▶ Play`, `⏩ +15s`, `⏩ +1m`, `Start Over`, and continuous timeline slider.
- **Volume Pill:** Dedicated Liquid Glass volume control with percentage readout and mute toggle across all pages.
- **Picture-in-Picture (PIP):** Native floating video player for multitasking.

### 3. Audio Remuxing & VOD Fast Seeking Engine
- **Zero-Transcode Video (`-c:v copy`):** Passthrough H.264 / AVC video streams with zero latency and zero CPU re-encoding overhead.
- **Dolby / DTS Audio Remuxing (`-c:a aac -ac 2`):** Real-time conversion of AC-3, EAC-3, MP2, and DTS audio to stereo AAC so every stream plays seamlessly in any web browser.
- **Fast HTTP Range Seeking (`-ss`):** Direct server-side seeking in VOD movies and series episodes with single-use token rotation (`/api/vod-source`), allowing instant scrubbing to any point in the media.

### 4. Profiles & Device Synchronization
- **Multi-Profile Manager:** Add, edit, duplicate, switch, and delete individual portal profiles (`Host URL`, `MAC Address`, `STB Type`, `Serial`, `Device ID 1/2`, `Signature`, `Hardware Version`).
- **Restoration Codes (`DAISY-...`):** Transfer all profiles, preferences, favorites, and genre filters across Smart TVs, phones, tablets, and browsers using a single code.
- **Privacy First:** Daisy IPTV includes no bundled channels or hardcoded credentials. Users enter their own authorized portal.

---

## 📁 Repository Structure

```
├── api/
│   ├── portal.js         # Vercel Serverless Function: STB API proxy with MAC & token headers
│   ├── stop-stream.js    # Vercel Serverless Function: Stream session cleanup
│   └── stream.js         # Vercel Serverless Function: Live & VOD stream proxy with FFmpeg remuxing
├── public/
│   ├── index.html        # Single-page Liquid Glass web application (APL-TV UI/UX)
│   └── mpegts.js         # Local MSE stream decoder for MPEG-TS playback
├── src/
│   ├── services/
│   │   └── PortalClient.ts # Shared TypeScript Stalker/Ministra API client
│   └── types/
│       └── stb.ts        # TypeScript data models and profile interfaces
├── package.json          # Node.js project manifest and dependencies
├── server.js             # Standalone local Node.js server (port 3080)
├── vercel.json           # Vercel deployment routes and serverless configuration
├── .gitignore            # Git exclusion rules
└── README.md             # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js:** v18.0.0 or higher
- **npm:** v9.0.0 or higher

### Local Development
1. Clone the repository:
   ```bash
   git clone https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git
   cd <YOUR_REPO>
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the local server:
   ```bash
   npm start
   ```
4. Open **http://localhost:3080** in your web browser.

---

## ☁️ Deploy to Vercel

Daisy IPTV is pre-configured for one-click deployment on **Vercel**:

1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "Daisy IPTV v1.0.0"
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git
   git push -u origin main
   ```
2. Go to **[vercel.com/new](https://vercel.com/new)** and import your repository.
3. Keep default settings (**Framework:** Other, **Root Directory:** `./`) and click **Deploy**.
4. Your Daisy IPTV web app will be live with full serverless API routing (`/api/portal`, `/api/stream`, `/api/stop-stream`).

---

## ⚙️ Configuration & First Run

1. On first launch, open **Settings** (`⚙️`) or click **Setup Portal** on the Home banner.
2. Enter your authorized portal details:
   - **Portal Host URL:** e.g., `http://your-portal-domain.com/c`
   - **MAC Address:** e.g., `00:1A:79:XX:XX:XX`
   - **STB Type:** Select your hardware model (`MAG250`, `MAG254`, `MAG256`, `MAG322`, `MAG420`, `MAG524`).
3. Click **Save & Connect**. Your categories, channels, movies, and series will load automatically.

---

## 🔒 Disclaimer

Daisy IPTV does not host, provide, or bundle any media content, live streams, or playlists. It is an open-source media player and protocol client. Users are solely responsible for supplying their own legally authorized IPTV subscriptions and portal credentials.
