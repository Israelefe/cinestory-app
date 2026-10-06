# Standalone CineStory App — Complete Infrastructure Setup Guide

This master guide details **every single external service, database, cloud bucket, email provider, and SuperAdmin portal setup** required to run this app completely independently from IDEAS Media Company.

---

## Master Checklist Overview

- [ ] **1. Dedicated MongoDB Database** (MongoDB Atlas)
- [ ] **2. Dedicated Cloud Storage** (Cloudflare R2)
- [ ] **3. AI model provider** (Groq primary, Alibaba fallback)
- [ ] **4. Transactional Email API** (Resend)
- [ ] **5. SuperAdmin Account Setup** (Creator Master Control)
- [ ] **6. Dedicated Brand Domain & DNS** (Namecheap / Porkbun)
- [ ] **7. Backend Server Deployment** (Render / Railway)
- [ ] **8. Frontend Hosting & Global CDN** (Vercel / Netlify)
- [ ] **9. Payment Gateways** (Paystack & Stripe)
- [ ] **10. Google 1-Click Login** (Google Cloud Console)

---

## 1. Dedicated Database Setup (MongoDB Atlas)
*Do NOT use the IDEAS Media database so customer data is 100% separated.*

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas) and sign in.
2. Click **"New Project"** -> Name it `CineStory-Production`.
3. Click **"Create a Database"** -> Choose the **M0 Free Tier** (or M10 dedicated cluster).
4. **Database Access:** Create a new database user:
   - Username: `cinestory_admin`
   - Password: `[Generate a secure 24-character password]`
5. **Network Access:** Add IP Address -> `0.0.0.0/0` (Allow cloud servers to connect).
6. **Get Connection String:** Click *Connect* -> *Drivers* -> Copy connection string:
   ```env
   MONGODB_URI=mongodb+srv://cinestory_admin:<password>@cinestory.mongodb.net/cinestory_db?retryWrites=true&w=majority
   ```

---

## 2. Dedicated Media Storage (Cloudflare R2)
*Veylo keeps library photos, camera RAW originals, delivery media, stories, profile images, portfolio media and Content Studio files in a private R2 bucket.*

Follow [the R2 storage setup and migration guide](server/docs/r2-storage-setup.md). Create a private bucket and a bucket-scoped S3 API token, then set these server variables:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

The browser receives short-lived signed upload links; storage credentials stay on the server. Existing Cloudinary files need the documented one-time migration before the Cloudinary-free build is deployed.

---

## 3. AI provider setup (Groq primary, Alibaba fallback)
*Groq handles Veylo creative direction, delivery tasks, photo analysis, captions, Veylo Help, and brief assistance. Alibaba Model Studio is the fallback.*

1. Create a Groq API key in the [Groq Console](https://console.groq.com/keys).
2. Add these server environment variables:
   ```env
   GROQ_API_KEY=your_groq_api_key
   GROQ_MODEL=qwen/qwen3.8-27b
   ALIBABA_FALLBACK_MODEL=deepseek-v4.1-flash
   ALIBABA_MODEL_STUDIO_API_KEY=your_alibaba_api_key
   ALIBABA_WORKSPACE_ID=your_alibaba_workspace_id
   ```
3. Keep both API keys on the server. Groq is the default; configure Alibaba credentials to enable automatic fallback.

---

## 4. Transactional Email API (Resend)
*Delivers welcome emails, receipts, and story-ready alerts to clients.*

1. Go to [Resend](https://resend.com/) and create an account.
2. Go to **Domains** -> Click **"Add Domain"** -> Enter your domain (e.g. `cinestory.app`).
3. Add the provided **DKIM, SPF, and MX DNS records** in your domain registrar (Namecheap / Porkbun).
4. Go to **API Keys** -> Create an API key named `CineStory-Production`.
5. Copy environment variables:
   ```env
   RESEND_API_KEY=re_123456789abcdef
   RESEND_FROM_EMAIL=CineStory AI <notifications@cinestory.app>
   ```

---

## 5. SuperAdmin Creator Account Setup
*Your personal master control center to oversee all users, view platform metrics, and delete content.*

1. Register an account on the app with your personal email (e.g. `admin@cinestory.app`).
2. Open your MongoDB Atlas database collection -> `users`.
3. Find your user document and update:
   ```json
   {
     "role": "admin",
     "plan": "studio"
   }
   ```
4. When you log in, you will see a purple **"Admin"** badge in the navbar leading to `https://cinestory.app/admin`.
5. Inside the SuperAdmin panel, you can:
   - View total users, stories, platform views, and estimated MRR.
   - Delete abusive or unwanted stories with 1 click.
   - Upgrade/downgrade any user's subscription plan.

---

## 6. Custom Brand Domain & DNS Setup
*Give the app its own standalone web address (e.g., `cinestory.app` or `myphotostory.com`).*

1. Purchase a domain from [Namecheap](https://www.namecheap.com/) or [Porkbun](https://porkbun.com/).
2. Plan your DNS records:
   - **Frontend App:** `cinestory.app` -> CNAME to Vercel (`cname.vercel-dns.com`)
   - **Backend API:** `api.cinestory.app` -> CNAME to Render (`your-service.onrender.com`)

---

## 7. Backend Server Deployment (Render / Railway)

1. Go to [Render](https://render.com/) -> Click **"New Web Service"**.
2. Connect your Git repository.
3. Configure settings:
   - **Name:** `cinestory-api`
   - **Root Directory:** `StoryApp/server`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Add **Environment Variables** in Render Dashboard:
   ```env
   NODE_ENV=production
   PORT=5000
   MONGODB_URI=mongodb+srv://cinestory_admin:password@...
   JWT_SECRET=your_super_secret_jwt_random_hash_here
   GROQ_API_KEY=your_groq_api_key
   GROQ_MODEL=qwen/qwen3.8-27b
   ALIBABA_FALLBACK_MODEL=deepseek-v4.1-flash
   ALIBABA_MODEL_STUDIO_API_KEY=your_alibaba_api_key
   ALIBABA_WORKSPACE_ID=your_alibaba_workspace_id
   R2_ACCOUNT_ID=your_cloudflare_account_id
   R2_ACCESS_KEY_ID=your_bucket_scoped_access_key
   R2_SECRET_ACCESS_KEY=your_bucket_scoped_secret
   R2_BUCKET_NAME=veylo-media
   RESEND_API_KEY=re_...
   RESEND_FROM_EMAIL=CineStory AI <notifications@cinestory.app>
   CLIENT_URL=https://cinestory.app
   ```

---

## 8. Frontend Hosting & Global CDN (Vercel)

1. Go to [Vercel](https://vercel.com/) -> Click **"Add New Project"**.
2. Select your Git repository.
3. Configure settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `StoryApp/client`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Add **Environment Variables** in Vercel Dashboard:
   ```env
   VITE_API_URL=https://api.cinestory.app/api
   VITE_APP_URL=https://cinestory.app
   ```

---

## 9. Payment Gateways Setup (Paystack & Stripe)

* **Paystack (Nigeria & Africa):** Set `PAYSTACK_PUBLIC_KEY` & `PAYSTACK_SECRET_KEY`.
* **Stripe (Global USD/EUR):** Set `STRIPE_PUBLISHABLE_KEY` & `STRIPE_SECRET_KEY`.

---

## 10. Google 1-Click Login (OAuth)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) -> Create project.
2. Credentials -> OAuth 2.0 Client ID -> Web Application.
3. Authorized Origins: `https://cinestory.app` & `http://localhost:5173`.
4. Copy `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`.
