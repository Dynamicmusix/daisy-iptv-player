# About Daisy IPTV

## Project Overview
**Daisy IPTV** is an open-source, universal Set-Top Box (STB) emulation and IPTV streaming client designed with an Apple TV / Liquid Glass user experience. It unifies live television, electronic program guides, and on-demand media playback across modern web browsers, smart TVs, and mobile devices.

---

## 🎨 Design Philosophy
1. **Liquid Glass Aesthetic:** Uses dynamic translucent surfaces (`backdrop-filter: blur(24px)`), ambient gradient backdrops, and spring-physics focus navigation inspired by modern tvOS and macOS design languages.
2. **Lean & Unobtrusive:** Video content is treated as the primary hero surface. In live broadcast mode, all non-essential scrubbing and timeline controls are automatically hidden to give the viewer a true television experience.
3. **Touch & D-Pad Parity:** All pages and lists feature 2D momentum touch-screen dragging as well as spatial 10-foot keyboard / remote D-Pad navigation.

---

## ⚙️ Technical Architecture

### 1. Protocol Emulation
Daisy IPTV communicates natively with Stalker / Ministra middleware using standard Set-Top Box handshake, profile exchange, and authenticated API commands:
- **Handshake & Session:** Secure token acquisition via `/api/portal?type=stb&action=handshake`.
- **Profile Negotiation:** Exchanges hardware properties (`stb_type`, `image_version`, `video_out`, `hw_version`) to authorize access.
- **Link Creation:** Dynamically generates fresh single-use playback links with stream identifiers intact.

### 2. Audio Remuxing & VOD Fast Seeking
- **H.264 Passthrough:** Video packets are passed directly to the browser media engine (`-c:v copy`) without CPU overhead.
- **Dolby / DTS Transcoding:** Real-time FFmpeg audio conversion (`-c:a aac -ac 2`) converts multi-channel AC-3, EAC-3, and DTS audio tracks to stereo AAC, ensuring universal browser compatibility.
- **Smart Range Proxy:** The local serverless gateway handles HTTP `Range` requests and rotates single-use tokens automatically during fast forward and rewind.

### 3. Serverless & Standalone Dual Runtime
- **Vercel Serverless:** Deploys as a lightweight zero-maintenance website via `/api/portal.js` and `/api/stream.js`.
- **Local Node.js Daemon:** Runs on any local server, home media PC, or Raspberry Pi using `node server.js` on port `3080`.

---

## 🔒 Privacy & Compliance
- **Zero Content Bundled:** Daisy IPTV is purely a protocol client and media player. No channels, servers, or copyrighted materials are hosted or included.
- **No Telemetry / Data Harvesting:** Profiles, favorites, and settings remain strictly stored in local device storage (`localStorage`).
- **Open Standards:** Built with standard web technologies (HTML5, CSS3, JavaScript ES2022, TypeScript, Node.js).
