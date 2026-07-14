import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import mime from 'mime-types';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const MAIN_DOMAIN = process.env.MAIN_DOMAIN || 'alfacomp.uz';

// Supabase admin client (service key)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Helper: get user from Bearer token ───────────────────────────────────────
async function getUser(authHeader: string | undefined) {
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

// ─── Helper: Render API for Custom Domains ───────────────────────────────────
async function addRenderCustomDomain(domainName: string) {
  const RENDER_API_KEY = process.env.RENDER_API_KEY;
  const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID;
  if (!RENDER_API_KEY || !RENDER_SERVICE_ID) return;

  try {
    const url = `https://api.render.com/v1/services/${RENDER_SERVICE_ID}/custom-domains`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RENDER_API_KEY}`
      },
      body: JSON.stringify({ name: domainName })
    });
    console.log(`Successfully requested Render to add domain: ${domainName}`);
  } catch (err) {
    console.error('Render API error (add):', err);
  }
}

async function removeRenderCustomDomain(domainName: string) {
  const RENDER_API_KEY = process.env.RENDER_API_KEY;
  const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID;
  if (!RENDER_API_KEY || !RENDER_SERVICE_ID) return;

  try {
    const url = `https://api.render.com/v1/services/${RENDER_SERVICE_ID}/custom-domains`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${RENDER_API_KEY}` }
    });
    if (!res.ok) return;
    const data = (await res.json()) as any[];
    const domainObj = data.find((d: any) => d.customDomain.name === domainName);
    
    if (domainObj) {
      await fetch(`${url}/${domainObj.customDomain.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${RENDER_API_KEY}` }
      });
      console.log(`Successfully requested Render to delete domain: ${domainName}`);
    }
  } catch (err) {
    console.error('Render API error (delete):', err);
  }
}

// ─── Wildcard subdomain middleware ────────────────────────────────────────────
app.use(async (req, res, next) => {
  const host = req.hostname;

  // Skip API routes and main domain
  if (req.path.startsWith('/api') || host === MAIN_DOMAIN || host === 'www.' + MAIN_DOMAIN) {
    return next();
  }

  // Extract subdomain
  let subdomain: string | null = null;
  if (host.endsWith('.' + MAIN_DOMAIN)) {
    subdomain = host.slice(0, -(MAIN_DOMAIN.length + 1));
  } else {
    // Local dev: e.g. myproject.localhost
    const parts = host.split('.');
    if (parts.length >= 2 && parts[parts.length - 1] === 'localhost') {
      subdomain = parts.slice(0, -1).join('.');
    }
  }

  if (!subdomain || subdomain === 'www') return next();

  // Check if subdomain exists
  const { data: sub } = await supabase
    .from('subdomains')
    .select('id')
    .eq('name', subdomain)
    .single();

  if (!sub) return next();

  // Resolve file path
  let filePath = req.path === '/' ? '/index.html' : req.path;
  const storagePath = `${subdomain}${filePath}`;

  // Download file from Supabase Storage
  const { data, error } = await supabase.storage.from('sites').download(storagePath);

  if (error || !data) {
    // SPA fallback: serve index.html
    const { data: indexData } = await supabase.storage.from('sites').download(`${subdomain}/index.html`);
    if (indexData) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(Buffer.from(await indexData.arrayBuffer()));
    }
    return res.status(404).send('<h1>404 - Page not found</h1><p>This subdomain has no files uploaded yet.</p>');
  }

  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  res.setHeader('Content-Type', mimeType as string);
  res.send(Buffer.from(await data.arrayBuffer()));
});

// ─── API: List user subdomains ────────────────────────────────────────────────
app.get('/api/subdomains', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data, error } = await supabase
    .from('subdomains')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ─── API: Create subdomain ────────────────────────────────────────────────────
app.post('/api/subdomains', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { name, description } = req.body;

  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(name)) {
    return res.status(400).json({ error: 'Subdomain must be 3–30 chars, lowercase letters/numbers/hyphens only.' });
  }

  const { data: existing } = await supabase.from('subdomains').select('id').eq('name', name).single();
  if (existing) return res.status(409).json({ error: 'This subdomain is already taken.' });

  const { data, error } = await supabase
    .from('subdomains')
    .insert({ name, description: description || '', user_id: user.id })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  
  // Call Render API to add domain
  await addRenderCustomDomain(`${name}.${MAIN_DOMAIN}`);
  
  res.status(201).json(data);
});

// ─── API: Delete subdomain ────────────────────────────────────────────────────
app.delete('/api/subdomains/:name', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { name } = req.params;

  const { error } = await supabase
    .from('subdomains')
    .delete()
    .eq('name', name)
    .eq('user_id', user.id);

  if (error) return res.status(500).json({ error: error.message });

  // Delete storage files
  const { data: fileList } = await supabase.storage.from('sites').list(name);
  if (fileList && fileList.length > 0) {
    await supabase.storage.from('sites').remove(fileList.map(f => `${name}/${f.name}`));
  }

  // Call Render API to delete domain
  await removeRenderCustomDomain(`${name}.${MAIN_DOMAIN}`);

  res.json({ success: true });
});

// ─── API: Upload files ────────────────────────────────────────────────────────
app.post('/api/subdomains/:name/upload', upload.array('files'), async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { name } = req.params;

  const { data: sub } = await supabase
    .from('subdomains')
    .select('id')
    .eq('name', name)
    .eq('user_id', user.id)
    .single();

  if (!sub) return res.status(403).json({ error: 'Forbidden' });

  const files = req.files as Express.Multer.File[];
  const results: { file: string; success: boolean; error?: string }[] = [];

  for (const file of files) {
    // If ZIP, extract and upload each file
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      try {
        const zip = await JSZip.loadAsync(file.buffer);
        for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
          if (zipEntry.dir) continue;
          // Strip top-level folder if all files are inside one
          const cleanPath = relativePath.replace(/^[^/]+\//, '');
          if (!cleanPath) continue;
          const content = await zipEntry.async('nodebuffer');
          const ct = mime.lookup(cleanPath) || 'application/octet-stream';
          const { error } = await supabase.storage
            .from('sites')
            .upload(`${name}/${cleanPath}`, content, { contentType: ct as string, upsert: true });
          results.push({ file: cleanPath, success: !error, error: error?.message });
        }
      } catch (e: any) {
        results.push({ file: file.originalname, success: false, error: e.message });
      }
    } else {
      const ct = file.mimetype || mime.lookup(file.originalname) || 'application/octet-stream';
      const { error } = await supabase.storage
        .from('sites')
        .upload(`${name}/${file.originalname}`, file.buffer, { contentType: ct as string, upsert: true });
      results.push({ file: file.originalname, success: !error, error: error?.message });
    }
  }

  res.json({ results });
});

// ─── API: List files in subdomain ─────────────────────────────────────────────
app.get('/api/subdomains/:name/files', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { name } = req.params;

  const { data: sub } = await supabase
    .from('subdomains')
    .select('id')
    .eq('name', name)
    .eq('user_id', user.id)
    .single();

  if (!sub) return res.status(403).json({ error: 'Forbidden' });

  const { data, error } = await supabase.storage.from('sites').list(name, {
    sortBy: { column: 'name', order: 'asc' },
  });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ─── API: Delete file ─────────────────────────────────────────────────────────
app.delete('/api/subdomains/:name/files/:filename', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { name, filename } = req.params;

  const { data: sub } = await supabase
    .from('subdomains')
    .select('id')
    .eq('name', name)
    .eq('user_id', user.id)
    .single();

  if (!sub) return res.status(403).json({ error: 'Forbidden' });

  const { error } = await supabase.storage.from('sites').remove([`${name}/${filename}`]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ─── Serve static frontend (production) ──────────────────────────────────────
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`\n🚀 SubLaunch server running on port ${PORT}`);
  console.log(`   Main domain: ${MAIN_DOMAIN}`);
  console.log(`   API: http://localhost:${PORT}/api\n`);
});
