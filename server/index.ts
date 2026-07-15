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
import { simpleGit } from 'simple-git';
import { exec } from 'child_process';
import util from 'util';
import getFolderSize from 'get-folder-size';
import pm2 from 'pm2';
import { createProxyMiddleware } from 'http-proxy-middleware';

const execAsync = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const MAIN_DOMAIN = process.env.MAIN_DOMAIN || 'alfacomp.uz';

// Tracking running backends
const activeBackends = new Map<string, number>();
let nextPort = 4000;

pm2.connect(err => {
  if (err) {
    console.error('Error connecting to PM2:', err);
    return;
  }
  pm2.list((err, list) => {
    if (!err && list) {
      list.forEach(process => {
        if (process.name && process.name.startsWith('sub-')) {
          const subdomain = process.name.slice(4);
          const pm2Env = process.pm2_env as any;
          const port = pm2Env?.env?.PORT || pm2Env?.PORT;
          if (port) {
            activeBackends.set(subdomain, parseInt(port as string));
            nextPort = Math.max(nextPort, parseInt(port as string) + 1);
          }
        }
      });
    }
  });
});

const dangerousKeywords = [
  'child_process', 'exec(', 'spawn(', 'fs.rmSync', 'fs.rmdirSync', 'eval('
];

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      if (file === 'node_modules' || file === '.git') return;
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });
  return arrayOfFiles;
}

function scanDirectory(dir: string): boolean {
  try {
    const files = getAllFiles(dir);
    for (const fullPath of files) {
      if (fullPath.endsWith('.js') || fullPath.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const keyword of dangerousKeywords) {
          if (content.includes(keyword)) {
             console.warn(`Dangerous keyword found: ${keyword} in ${fullPath}`);
             return false;
          }
        }
      }
    }
    return true;
  } catch (err) {
    console.error('Error scanning directory:', err);
    return false;
  }
}

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

  // If backend is running, proxy to it
  if (activeBackends.has(subdomain)) {
    const target = `http://localhost:${activeBackends.get(subdomain)}`;
    return createProxyMiddleware({ target, changeOrigin: true, ws: true })(req, res, next);
  }

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

  if (activeBackends.has(name)) {
    await new Promise((resolve) => pm2.delete(`sub-${name}`, resolve));
    activeBackends.delete(name);
  }
  
  const appDir = path.join(__dirname, '../apps', name);
  if (fs.existsSync(appDir)) {
    fs.rmSync(appDir, { recursive: true, force: true });
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
        
        // Find if all files share a single root folder
        const filePaths = Object.keys(zip.files).filter(p => !zip.files[p].dir);
        let commonPrefix = '';
        if (filePaths.length > 0) {
          const firstParts = filePaths[0].split('/');
          if (firstParts.length > 1) {
            const potentialPrefix = firstParts[0] + '/';
            if (filePaths.every(p => p.startsWith(potentialPrefix))) {
              commonPrefix = potentialPrefix;
            }
          }
        }

        for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
          if (zipEntry.dir) continue;
          
          let cleanPath = relativePath;
          if (commonPrefix && cleanPath.startsWith(commonPrefix)) {
            cleanPath = cleanPath.slice(commonPrefix.length);
          }
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

// ─── API: Import from GitHub ────────────────────────────────────────────────
app.post('/api/subdomains/:name/github', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { name } = req.params;
  const { repoUrl } = req.body;

  if (!repoUrl || !repoUrl.startsWith('https://github.com/')) {
    return res.status(400).json({ error: 'Invalid GitHub URL. Must start with https://github.com/' });
  }

  const { data: sub } = await supabase
    .from('subdomains')
    .select('id')
    .eq('name', name)
    .eq('user_id', user.id)
    .single();

  if (!sub) return res.status(403).json({ error: 'Forbidden' });

  const appsDir = path.join(__dirname, '../apps');
  if (!fs.existsSync(appsDir)) fs.mkdirSync(appsDir);
  const appDir = path.join(appsDir, name);

  try {
    if (fs.existsSync(appDir)) {
      fs.rmSync(appDir, { recursive: true, force: true });
    }

    const git = simpleGit();
    await git.clone(repoUrl, appDir);

    const folderSize = await getFolderSize.loose(appDir);
    if (folderSize > 50 * 1024 * 1024) { // 50MB
      fs.rmSync(appDir, { recursive: true, force: true });
      return res.status(400).json({ error: 'Repository exceeds 50MB limit.' });
    }

    if (!scanDirectory(appDir)) {
      fs.rmSync(appDir, { recursive: true, force: true });
      return res.status(400).json({ error: 'Security Violation: Suspicious code found. For security, certain functions are disabled.' });
    }

    const pkgPath = path.join(appDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      
      if (activeBackends.has(name)) {
        await new Promise((resolve) => pm2.delete(`sub-${name}`, resolve));
        activeBackends.delete(name);
      }

      await execAsync('npm install', { cwd: appDir });

      if (pkg.scripts && pkg.scripts.build) {
        await execAsync('npm run build', { cwd: appDir });
      }

      if (pkg.scripts && pkg.scripts.start) {
        const port = nextPort++;
        await new Promise<void>((resolve, reject) => {
          pm2.start({
            name: `sub-${name}`,
            script: 'npm',
            args: 'start',
            cwd: appDir,
            env: { PORT: port.toString() }
          }, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        activeBackends.set(name, port);
        return res.json({ results: [{ file: 'Backend Server started on port ' + port, success: true }] });
      } else {
        // Upload static files from output dir
        const outDirs = ['dist', 'build', 'out'];
        let uploadDir = appDir;
        for (const dir of outDirs) {
          if (fs.existsSync(path.join(appDir, dir))) {
            uploadDir = path.join(appDir, dir);
            break;
          }
        }
        
        const filesToUpload = getAllFiles(uploadDir);
        const results: { file: string; success: boolean; error?: string }[] = [];
        for (const fullPath of filesToUpload) {
           const relativePath = path.relative(uploadDir, fullPath).replace(/\\/g, '/');
           const content = fs.readFileSync(fullPath);
           const ct = mime.lookup(relativePath) || 'application/octet-stream';
           const { error } = await supabase.storage.from('sites').upload(`${name}/${relativePath}`, content, { contentType: ct as string, upsert: true });
           results.push({ file: relativePath, success: !error, error: error?.message });
        }
        fs.rmSync(appDir, { recursive: true, force: true });
        return res.json({ results });
      }
    } else {
      // Just HTML files (no package.json)
      const filesToUpload = getAllFiles(appDir);
      const results: { file: string; success: boolean; error?: string }[] = [];
      for (const fullPath of filesToUpload) {
         if (fullPath.includes('.git')) continue;
         const relativePath = path.relative(appDir, fullPath).replace(/\\/g, '/');
         const content = fs.readFileSync(fullPath);
         const ct = mime.lookup(relativePath) || 'application/octet-stream';
         const { error } = await supabase.storage.from('sites').upload(`${name}/${relativePath}`, content, { contentType: ct as string, upsert: true });
         results.push({ file: relativePath, success: !error, error: error?.message });
      }
      fs.rmSync(appDir, { recursive: true, force: true });
      return res.json({ results });
    }
  } catch (error: any) {
    const appsDir = path.join(__dirname, '../apps');
    const appDir = path.join(appsDir, name);
    if (fs.existsSync(appDir)) {
      try { fs.rmSync(appDir, { recursive: true, force: true }); } catch (e) {}
    }
    res.status(500).json({ error: error.message || 'Failed to process GitHub repository' });
  }
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

// ─── API: Delete file or folder ───────────────────────────────────────────────
app.delete('/api/subdomains/:name/files/*', async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const name = req.params.name;
  const filename = (req.params as any)[0];

  const { data: sub } = await supabase
    .from('subdomains')
    .select('id')
    .eq('name', name)
    .eq('user_id', user.id)
    .single();

  if (!sub) return res.status(403).json({ error: 'Forbidden' });

  const fullPath = `${name}/${filename}`;

  async function deleteRecursive(prefix: string) {
    const { data, error } = await supabase.storage.from('sites').list(prefix, { limit: 500 });
    if (error || !data || data.length === 0) return;
    
    const files = [];
    for (const item of data) {
      if (item.id === null) {
        await deleteRecursive(`${prefix}/${item.name}`);
      } else {
        files.push(`${prefix}/${item.name}`);
      }
    }
    if (files.length > 0) {
      await supabase.storage.from('sites').remove(files);
    }
  }

  // 1. Try to delete as a single file
  await supabase.storage.from('sites').remove([fullPath]);
  
  // 2. Try to delete recursively as a folder
  await deleteRecursive(fullPath);

  res.json({ success: true });
});

// ─── API: Delete all files ────────────────────────────────────────────────────
app.delete('/api/subdomains/:name/files', async (req, res) => {
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

  // Recursive delete helper
  async function deleteRecursive(prefix: string) {
    const { data, error } = await supabase.storage.from('sites').list(prefix, { limit: 500 });
    if (error || !data || data.length === 0) return;
    
    const files = [];
    for (const item of data) {
      if (item.id === null) {
        await deleteRecursive(`${prefix}/${item.name}`);
      } else {
        files.push(`${prefix}/${item.name}`);
      }
    }
    if (files.length > 0) {
      await supabase.storage.from('sites').remove(files);
    }
  }

  // Delete all storage files recursively
  await deleteRecursive(name);

  if (activeBackends.has(name)) {
    await new Promise((resolve) => pm2.delete(`sub-${name}`, resolve));
    activeBackends.delete(name);
  }
  
  const appDir = path.join(__dirname, '../apps', name);
  if (fs.existsSync(appDir)) {
    try { fs.rmSync(appDir, { recursive: true, force: true }); } catch (e) {}
  }

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
