# Daisy IPTV (v1.0.0)

**Daisy IPTV** is a universal Set-Top Box & IPTV Player application designed with a unified look, settings, and feature set across:
- **Web & Cloud (Vercel Serverless + CDN)**
- **Android TV / Google TV / Fire TV** (`LEANBACK_LAUNCHER` + Remote D-Pad spatial focus)
- **Android Mobile** (Phones & Tablets)
- **iOS / iPadOS** (iPhone & iPad)
- **Apple TV (`tvOS`)** (`react-native-tvos` + Siri Remote focus navigation)

---

## 1. Repository File Inventory

| File / Directory | Purpose |
| :--- | :--- |
| [vercel.json](file:///c:/Users/User/OneDrive/Documents/STB/vercel.json) | Vercel routing and Serverless Function configuration (`/api/portal`, `/api/stream`, `/api/stop-stream`). |
| [package.json](file:///c:/Users/User/OneDrive/Documents/STB/package.json) | Project manifest (`daisy-iptv` `v1.0.0`) with `ffmpeg-static` for live stream remuxing. |
| [api/portal.js](file:///c:/Users/User/OneDrive/Documents/STB/api/portal.js) | Vercel Serverless Function for `/api/portal` (proxies portal API calls with STB headers & MAC cookies). |
| [api/stream.js](file:///c:/Users/User/OneDrive/Documents/STB/api/stream.js) | Vercel Serverless Function for `/api/stream` (follows 302 edge redirects and remuxes H.264 + AAC via `ffmpeg-static`). |
| [api/stop-stream.js](file:///c:/Users/User/OneDrive/Documents/STB/api/stop-stream.js) | Vercel Serverless Function for `/api/stop-stream`. |
| [public/index.html](file:///c:/Users/User/OneDrive/Documents/STB/public/index.html) | Universal Daisy IPTV interface supporting TV 10-Foot Mode, Tablet Mode, and Mobile Phone Mode. |
| [public/mpegts.js](file:///c:/Users/User/OneDrive/Documents/STB/public/mpegts.js) | Local `mpegts.js` MSE decoder for live MPEG-TS playback. |
| [server.js](file:///c:/Users/User/OneDrive/Documents/STB/server.js) | Local & LAN Node.js server (`node server.js` on `http://localhost:3080`). |
| [app.json](file:///c:/Users/User/OneDrive/Documents/STB/app.json) & [App.tsx](file:///c:/Users/User/OneDrive/Documents/STB/App.tsx) | Universal React Native / Expo entry for Android Mobile, Android TV, iOS, and Apple TV. |
| [src/types/stb.ts](file:///c:/Users/User/OneDrive/Documents/STB/src/types/stb.ts) & [src/services/PortalClient.ts](file:///c:/Users/User/OneDrive/Documents/STB/src/services/PortalClient.ts) | Shared TypeScript data models and portal protocol client. |
| [.gitignore](file:///c:/Users/User/OneDrive/Documents/STB/.gitignore) & [.npmrc](file:///c:/Users/User/OneDrive/Documents/STB/.npmrc) | Git ignore rules and npm configuration. |

---

## 2. Core Features

1. **Multi-Profile Portal Manager (`New Portal Configuration`):**
   * Users configure their own Portal Host URL (e.g. `http://your-portal-domain.com/c`) and authorized MAC address (`00:1A:79:00:00:00`).
   * Includes **Advanced Settings** for `STB Type` (`MAG250`, `MAG254`, `MAG256`, `MAG322`, `MAG420`, `MAG524`), `Serial`, `Device ID 1/2`, `Signature`, `Hardware Version`, and custom request parameters.
2. **Live TV Player & Real-Time FFmpeg Engine:**
   * Category sidebar, channel search, `★ FAV` favorites filter, `↕️ EDIT` channel reordering (`Move To Top`), `🔴 REC` stream recording, `📅 EPG` timeline grid with time-zone offset, and `⏪ Catch-Up TV`.
   * Dedicated transport bar below the video player (`⏪ -15s`, `⏯ PLAY/PAUSE`, `⏩ +15s`, seek slider, `00:00 / LIVE` timer, volume control) plus unobstructed native video controls and one-click `▶ Open in VLC`.
   * Real-time FFmpeg remuxer (`-c:v copy -c:a aac`) converts AC-3 Dolby Digital, EAC-3, MP2, and DTS audio tracks into browser-compatible Stereo AAC while copying H.264 video packets with zero re-encoding lag.
3. **VOD Movies & Series / Shows:**
   * Poster Grid / List toggle, Sort by `Added`, `Name`, or `Rating`, Search, pagination (`＋ Load More`), IMDb metadata view, Season & Episode selector, and instant stream resolution.
4. **Cross-Device Restoration Code (`DAISY-...`):**
   * Export and restore all profiles, preferences, favorites, and genre filters across TV, tablet, phone, and web browser using a single Restoration Code.

---

## 3. Run Locally or Deploy to Vercel

### Run Locally
```powershell
npm install
npm start
```
Open **http://localhost:3080** in your browser and enter your portal URL and MAC address in the **New Portal Configuration** dialog.

### Push to GitHub & Deploy on Vercel
```powershell
git add .
git commit -m "Daisy IPTV v1.0.0"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git
git push -u origin main
```
Then import the repository at **[vercel.com/new](https://vercel.com/new)** with default settings (**Root Directory:** `./`) and click **Deploy**.
