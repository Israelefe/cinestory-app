# 🎬 CineStory.ai — Standalone AI Photo Story SaaS

A complete standalone platform that turns photoshoot pictures into interactive, music-synced, Spotify Wrapped-style cinematic premiere reels.

---

## 🚀 Quick Start (Local Development)

### 1. Start the Backend Server
```bash
cd StoryApp/server
npm install
cp .env.example .env
# Edit .env with your MongoDB URI & OpenRouter Key
npm run dev
```
Backend runs at `http://localhost:5000`.

### 2. Start the Frontend Web App
```bash
cd StoryApp/client
npm install
npm run dev
```
Frontend runs at `http://localhost:5173`.

---

## 📁 Project Architecture

```
StoryApp/
├── client/                     # React + Vite + Tailwind PWA
│   ├── src/
│   │   ├── components/         # Navbar, Footer, AuthModal, Cards
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx # Public marketing page & feature showcase
│   │   │   ├── Dashboard.jsx   # Creator dashboard ("My Stories" + Analytics)
│   │   │   ├── CreateStory.jsx # 3-step AI Director Studio
│   │   │   └── StoryViewer.jsx # Full-screen interactive kinetic story viewer
│   │   ├── constants/          # 16 themes & 100 curated soundtracks
│   │   └── services/           # Axios API client
└── server/                     # Node.js + Express + MongoDB API
    ├── src/
    │   ├── models/             # User & PhotoStory Mongoose Schemas
    │   ├── routes/             # Auth & Story Endpoints + Audio Proxy
    │   ├── controllers/        # Business logic & Database operations
    │   └── services/           # OpenRouter AI Director Prompt Engine
```

---

## 🌐 Deployment Guide

1. **Frontend (Vercel / Netlify):**
   - Root Directory: `StoryApp/client`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Env Variable: `VITE_API_URL=https://your-backend-api.onrender.com/api`

2. **Backend (Render / Railway):**
   - Root Directory: `StoryApp/server`
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Add environment variables from `.env.example`.
