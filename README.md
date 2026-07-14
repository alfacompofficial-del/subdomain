# SubLaunch — Free Subdomain Hosting

Host your HTML/CSS/JS projects on a real subdomain of `alfacomp.uz`.

## Features
- 🌐 Real wildcard subdomains (e.g. `myproject.alfacomp.uz`)
- 📦 ZIP archive upload with auto-extraction
- 🔄 Instant file updates
- 🔒 Supabase authentication
- 🗂️ File manager per subdomain

## Stack
- **Frontend**: Vite + TypeScript (vanilla)
- **Backend**: Express + TypeScript
- **Database & Auth**: Supabase
- **Storage**: Supabase Storage

## Setup

### 1. Clone & Install
```bash
git clone https://github.com/alfacompofficial-del/subdomain.git
cd subdomain
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

### 3. Setup Supabase Database
Run `supabase/schema.sql` in your Supabase SQL Editor.

### 4. DNS Configuration (Production)
Add a **wildcard DNS record** in your domain provider:
```
Type: A
Name: *
Value: <your-server-IP>
```

### 5. Run Development
```bash
# Frontend only
npm run dev:frontend

# Server only  
npm run dev:server

# Both together
npm run dev
```

Frontend: `http://localhost:5173`  
API Server: `http://localhost:3001`

## Production Deploy (Render)

1. Build command: `npm run build`
2. Start command: `npm start`
3. Set all environment variables from `.env.example`
4. Set `MAIN_DOMAIN=alfacomp.uz`
5. Configure wildcard DNS `*.alfacomp.uz` → your Render server IP

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (server only) |
| `SUPABASE_ANON_KEY` | Anon key |
| `MAIN_DOMAIN` | Your root domain |
| `PORT` | Server port (default: 3001) |
| `VITE_SUPABASE_URL` | Same as SUPABASE_URL (for frontend) |
| `VITE_SUPABASE_ANON_KEY` | Same as anon key (for frontend) |
| `VITE_API_URL` | Backend API URL |
| `VITE_MAIN_DOMAIN` | Same as MAIN_DOMAIN (for frontend) |
