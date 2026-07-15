import './style.css';
import { supabase, MAIN_DOMAIN } from './supabase';
import {
  apiGetSubdomains, apiCreateSubdomain, apiDeleteSubdomain,
  apiGetFiles, apiDeleteFile, apiDeleteAllFiles, apiUploadFiles, apiImportGitHub,
  type Subdomain, type FileInfo
} from './api';
import { toast, initToast, formatDate, formatBytes, fileIcon } from './utils';
import type { User } from '@supabase/supabase-js';

// ── State ──────────────────────────────────────────────────────────────────
let user: User | null = null;
let page: 'landing' | 'dashboard' | 'upload' = 'landing';
let subdomains: Subdomain[] = [];
let activeSubdomain: Subdomain | null = null;
let activeFiles: FileInfo[] = [];
let pendingFiles: File[] = [];
let uploadProgress = 0;
let showAuth = false;
let authMode: 'login' | 'register' = 'login';
let showCreate = false;

const app = () => document.getElementById('app')!;

// ── Router ─────────────────────────────────────────────────────────────────
function navigate(p: typeof page, sub?: Subdomain) {
  page = p;
  activeSubdomain = sub || null;
  if (p === 'upload' && sub) loadFiles(sub.name);
  render();
}

// ── Auth ───────────────────────────────────────────────────────────────────
async function loadUser() {
  const { data } = await supabase.auth.getSession();
  user = data.session?.user ?? null;
}

async function handleLogin(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data } = await supabase.auth.getSession();
  user = data.session?.user ?? null;
  showAuth = false;
  page = 'dashboard';
  await loadSubdomains();
  render();
}

async function handleRegister(email: string, password: string) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  toast('Check your email to confirm registration!', 'success');
  authMode = 'login';
  render();
}

async function handleLogout() {
  await supabase.auth.signOut();
  user = null; page = 'landing'; subdomains = [];
  render();
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadSubdomains() {
  try { subdomains = await apiGetSubdomains(); } catch { subdomains = []; }
}

async function loadFiles(name: string) {
  try { activeFiles = await apiGetFiles(name); render(); } catch { activeFiles = []; }
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  app().innerHTML = header() + (
    page === 'landing' ? landing() :
    page === 'dashboard' ? dashboard() :
    upload()
  ) + (showAuth ? authModal() : '') + (showCreate ? createModal() : '');
  bindEvents();
}

function header() {
  return `<header class="header"><div class="container"><div class="header-inner">
    <a href="#" class="logo" id="logo">
      <div class="logo-icon">⚡</div>
      <span class="logo-text">SubLaunch</span>
    </a>
    <nav class="nav">
      ${user ? `
        <span class="nav-user"><div class="avatar">${user.email![0].toUpperCase()}</div><span>${user.email}</span></span>
        <button class="btn btn-ghost btn-sm" id="dashBtn">Dashboard</button>
        <button class="btn btn-ghost btn-sm" id="logoutBtn">Logout</button>
      ` : `
        <button class="btn btn-ghost btn-sm" id="loginBtn">Login</button>
        <button class="btn btn-primary btn-sm" id="startBtn">Get Started →</button>
      `}
    </nav>
  </div></div></header>`;
}

function landing() {
  return `<main>
    <section class="hero">
      <div class="hero-bg"><div class="blob blob-1"></div><div class="blob blob-2"></div><div class="grid-overlay"></div></div>
      <div class="container"><div class="hero-content">
        <div class="badge">🚀 Free subdomain hosting</div>
        <h1 class="hero-title">Host your site on<br><span class="gradient-text">your own subdomain</span></h1>
        <p class="hero-subtitle">Create a free subdomain on <code class="inline-code">${MAIN_DOMAIN}</code>, upload your HTML/CSS/JS, and go live in seconds.</p>
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" id="heroStart">Create your subdomain →</button>
          <a href="#features" class="btn btn-ghost btn-lg">Learn more ↓</a>
        </div>
        <div class="hero-demo">
          <div class="demo-bar">
            <div class="demo-dots"><span class="dot dot-red"></span><span class="dot dot-yellow"></span><span class="dot dot-green"></span></div>
            <div class="demo-url">🔒 myproject.${MAIN_DOMAIN}</div>
          </div>
          <div class="demo-content">
            <div class="demo-code"><span class="code-tag">&lt;html&gt;</span><br>&nbsp;&nbsp;<span class="code-tag">&lt;body&gt;</span><br>&nbsp;&nbsp;&nbsp;&nbsp;<span class="code-tag">&lt;h1&gt;</span><span class="code-text">Hello World!</span><span class="code-tag">&lt;/h1&gt;</span><br>&nbsp;&nbsp;<span class="code-tag">&lt;/body&gt;</span><br><span class="code-tag">&lt;/html&gt;</span></div>
            <div class="demo-arrow"><div class="arrow-line"></div><span>⚡ Deploy</span></div>
            <div class="demo-preview"><h2 style="color:#7c3aed;font-size:1.4rem;margin:0">Hello World!</h2><p style="color:#8888aa;margin:8px 0 0">Your site is live ✓</p></div>
          </div>
        </div>
      </div></div>
    </section>

    <section class="stats">
      <div class="container"><div class="stats-grid">
        <div class="stat-item"><div class="stat-number">Free</div><div class="stat-label">Forever plan</div></div>
        <div class="stat-item"><div class="stat-number">⚡ Instant</div><div class="stat-label">Deployment</div></div>
        <div class="stat-item"><div class="stat-number">∞</div><div class="stat-label">Subdomains</div></div>
        <div class="stat-item"><div class="stat-number">ZIP</div><div class="stat-label">Archive support</div></div>
      </div></div>
    </section>

    <section class="features" id="features">
      <div class="container">
        <div class="section-header"><h2 class="section-title">Everything you need</h2><p class="section-subtitle">Simple, powerful, completely free</p></div>
        <div class="features-grid">
          ${[
            ['🌐','Real Subdomains','Get a real subdomain like <code>mysite.'+MAIN_DOMAIN+'</code> — not a path-based URL'],
            ['📦','ZIP Upload','Upload your whole project as a ZIP. We extract and deploy everything automatically'],
            ['🔄','Instant Updates','Re-upload files anytime. Changes go live immediately'],
            ['🔒','Secure Auth','Projects protected by Supabase authentication. Only you can manage them'],
            ['🗂️','File Manager','View and delete individual files from your dashboard'],
            ['🆓','Always Free','No credit card. No hidden fees. Unlimited subdomains'],
          ].map(([icon,title,desc]) => `<div class="feature-card"><div class="feature-icon">${icon}</div><h3>${title}</h3><p>${desc}</p></div>`).join('')}
        </div>
      </div>
    </section>

    <section class="how-it-works" id="how-it-works">
      <div class="container">
        <div class="section-header"><h2 class="section-title">How it works</h2><p class="section-subtitle">Live in 3 steps</p></div>
        <div class="steps">
          <div class="step"><div class="step-num">01</div><h3>Create account</h3><p>Sign up with your email in under a minute</p></div>
          <div class="step"><div class="step-num">02</div><h3>Pick a subdomain</h3><p>Choose a unique name on ${MAIN_DOMAIN}</p></div>
          <div class="step"><div class="step-num">03</div><h3>Upload files</h3><p>Drag & drop HTML/CSS/JS or a ZIP archive</p></div>
        </div>
      </div>
    </section>

    <section class="cta"><div class="container">
      <div class="cta-card">
        <h2>Ready to launch?</h2>
        <p>Create your free subdomain now — no credit card required</p>
        <button class="btn btn-primary btn-lg" id="ctaStart">Get started for free →</button>
      </div>
    </div></section>

    <footer class="footer"><div class="container"><div class="footer-inner">
      <span>© 2025 SubLaunch · Built on alfacomp.uz</span>
      <span>Free subdomain hosting</span>
    </div></div></footer>
  </main>`;
}

function dashboard() {
  return `<section class="dashboard"><div class="container">
    <div class="page-header">
      <div><h1 class="page-title">My Subdomains</h1><p class="page-sub">Manage your hosted projects</p></div>
      <button class="btn btn-primary" id="createBtn">+ New Subdomain</button>
    </div>
    ${subdomains.length === 0 ? `
      <div class="empty-state">
        <div class="empty-icon">🌐</div>
        <h3>No subdomains yet</h3>
        <p>Create your first subdomain and start hosting</p>
        <button class="btn btn-primary" id="emptyCreateBtn">Create subdomain →</button>
      </div>
    ` : `
      <div class="subdomains-grid">
        ${subdomains.map(s => `
          <div class="subdomain-card">
            <div class="card-name">${s.name}</div>
            <div class="card-url">🔗 ${s.name}.${MAIN_DOMAIN}</div>
            <div class="card-desc">${s.description || 'No description'}</div>
            <div class="card-date">Created ${formatDate(s.created_at)}</div>
            <div class="card-actions">
              <a href="http://${s.name}.${MAIN_DOMAIN}" target="_blank" class="btn btn-success btn-sm">🌐 Visit</a>
              <button class="btn btn-ghost btn-sm upload-btn" data-name="${s.name}">📤 Upload</button>
              <button class="btn btn-danger btn-sm delete-btn" data-name="${s.name}">🗑️ Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  </div></section>`;
}

function upload() {
  const sub = activeSubdomain!;
  return `<section class="upload-page"><div class="container">
    <button class="back-btn" id="backBtn">← Back to Dashboard</button>
    <div class="page-header">
      <div>
        <h1 class="page-title">📤 ${sub.name}</h1>
        <p class="page-sub">Upload files to your subdomain</p>
      </div>
      <a href="http://${sub.name}.${MAIN_DOMAIN}" target="_blank" class="btn btn-success">🌐 View Site</a>
    </div>
    <div class="upload-grid">
      <div>
        <div class="upload-zone${pendingFiles.length ? ' has-files' : ''}" id="dropZone">
          <div class="upload-icon">📦</div>
          <h3>Drop files here</h3>
          <p>HTML, CSS, JS, images, or a <strong>ZIP archive</strong></p>
          <button class="btn btn-ghost" id="browseBtn">Browse Files</button>
          <input type="file" id="fileInput" multiple hidden>
        </div>
        ${pendingFiles.length ? `
          <div class="file-list" style="margin-top:16px">
            ${pendingFiles.map((f,i) => `
              <div class="file-item">
                <span class="file-icon">${fileIcon(f.name)}</span>
                <span class="file-name">${f.name}</span>
                <span class="file-size">${formatBytes(f.size)}</span>
                <button class="file-remove" data-idx="${i}">✕</button>
              </div>
            `).join('')}
          </div>
          ${uploadProgress > 0 && uploadProgress < 100 ? `
            <div class="progress-bar-wrap"><div class="progress-bar" style="width:${uploadProgress}%"></div></div>
            <p style="font-size:0.82rem;color:var(--text-muted);text-align:center">${uploadProgress}%</p>
          ` : ''}
          <div style="display:flex;gap:10px;margin-top:16px">
            <button class="btn btn-primary" id="uploadBtn" style="flex:1">⚡ Upload ${pendingFiles.length} file${pendingFiles.length>1?'s':''}</button>
            <button class="btn btn-ghost" id="clearBtn">Clear</button>
          </div>
        ` : ''}

        <div class="github-import" style="margin-top: 32px; padding: 24px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid var(--border);">
          <h3 style="margin: 0 0 8px; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
            <svg height="24" width="24" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path></svg>
            Import from GitHub
          </h3>
          <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 16px;">Instantly deploy a public GitHub repository. We will download the main branch and deploy it.</p>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="githubUrl" class="form-input" placeholder="https://github.com/username/repo" style="flex: 1;">
            <button class="btn btn-primary" id="githubImportBtn">Import</button>
          </div>
        </div>
      </div>

      <div class="upload-sidebar">
        <div class="info-card">
          <h4>📋 Site Info</h4>
          <div class="info-row"><span class="info-key">Subdomain</span><span class="info-val">${sub.name}</span></div>
          <div class="info-row"><span class="info-key">Domain</span><span class="live-url">${sub.name}.${MAIN_DOMAIN}</span></div>
          <div class="info-row"><span class="info-key">Created</span><span class="info-val">${formatDate(sub.created_at)}</span></div>
        </div>
        <div class="info-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h4 style="margin:0;">📁 Uploaded Files (${activeFiles.length})</h4>
            ${activeFiles.length > 0 ? `<button class="btn btn-danger btn-sm" id="deleteAllFilesBtn">Delete All</button>` : ''}
          </div>
          ${activeFiles.length === 0 ? '<p style="color:var(--text-muted);font-size:0.82rem;margin-top:12px;">No files yet</p>' : `
            <div class="files-list">
              ${activeFiles.map(f => {
                const isFolder = !f.id && !f.metadata?.size;
                return `
                <div class="managed-file">
                  <span>${fileIcon(f.name, isFolder)}</span>
                  <span class="managed-file-name">${f.name}</span>
                  <span style="font-size:0.75rem;color:var(--text-dim)">${isFolder ? 'Folder' : formatBytes(f.metadata?.size ?? 0)}</span>
                  <button class="file-remove del-file-btn" data-file="${f.name}" title="Delete">🗑️</button>
                </div>
              `}).join('')}
            </div>
          `}
        </div>
      </div>
    </div>
  </div></section>`;
}

function authModal() {
  return `<div class="modal-overlay" id="modalOverlay">
    <div class="modal">
      <button class="modal-close" id="closeAuth">✕</button>
      <div class="modal-header">
        <div class="logo-icon" style="margin:0 auto 12px;width:48px;height:48px;font-size:24px">⚡</div>
        <div class="modal-title">${authMode === 'login' ? 'Welcome back' : 'Create account'}</div>
        <div class="modal-sub">${authMode === 'login' ? 'Sign in to manage your subdomains' : 'Start hosting for free today'}</div>
      </div>
      <div class="modal-tabs">
        <button class="tab-btn ${authMode==='login'?'active':''}" id="tabLogin">Login</button>
        <button class="tab-btn ${authMode==='register'?'active':''}" id="tabRegister">Register</button>
      </div>
      <form id="authForm">
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" id="authEmail" placeholder="you@example.com" required></div>
        <div class="form-group"><label class="form-label">Password</label><input class="form-input" type="password" id="authPass" placeholder="••••••••" required></div>
        <div class="form-error" id="authError"></div>
        <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px" id="authSubmit">
          ${authMode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  </div>`;
}

function createModal() {
  return `<div class="modal-overlay" id="createOverlay">
    <div class="modal create-modal">
      <button class="modal-close" id="closeCreate">✕</button>
      <div class="modal-header">
        <div class="modal-title">🌐 New Subdomain</div>
        <div class="modal-sub">Choose a unique name for your project</div>
      </div>
      <form id="createForm">
        <div class="form-group">
          <label class="form-label">Subdomain name</label>
          <div class="subdomain-input-wrap">
            <span class="subdomain-suffix" style="border-right:1px solid var(--border);border-left:none;padding-left:14px">https://</span>
            <input class="subdomain-input-inner" type="text" id="subName" placeholder="myproject" pattern="[a-z0-9-]+" required>
            <span class="subdomain-suffix">.${MAIN_DOMAIN}</span>
          </div>
          <div class="form-error" id="createError"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Description <span style="color:var(--text-dim)">(optional)</span></label>
          <input class="form-input" type="text" id="subDesc" placeholder="My awesome project">
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%" id="createSubmit">Create Subdomain →</button>
      </form>
    </div>
  </div>`;
}

// ── Event Binding ──────────────────────────────────────────────────────────
function bindEvents() {
  on('logo', 'click', e => { e.preventDefault(); page='landing'; render(); });
  on('loginBtn', 'click', () => { authMode='login'; showAuth=true; render(); });
  on('startBtn', 'click', () => { authMode='register'; showAuth=true; render(); });
  on('heroStart', 'click', () => { authMode='register'; showAuth=true; render(); });
  on('ctaStart', 'click', () => { authMode='register'; showAuth=true; render(); });
  on('dashBtn', 'click', async () => { await loadSubdomains(); navigate('dashboard'); });
  on('logoutBtn', 'click', handleLogout);

  // Auth modal
  on('closeAuth', 'click', () => { showAuth=false; render(); });
  on('modalOverlay', 'click', e => { if ((e.target as HTMLElement).id==='modalOverlay') { showAuth=false; render(); } });
  on('tabLogin', 'click', () => { authMode='login'; render(); });
  on('tabRegister', 'click', () => { authMode='register'; render(); });
  on('authForm', 'submit', async e => {
    e.preventDefault();
    const email = (document.getElementById('authEmail') as HTMLInputElement).value;
    const pass = (document.getElementById('authPass') as HTMLInputElement).value;
    const errEl = document.getElementById('authError')!;
    const btn = document.getElementById('authSubmit') as HTMLButtonElement;
    btn.disabled = true; btn.textContent = 'Please wait...';
    try {
      if (authMode === 'login') await handleLogin(email, pass);
      else await handleRegister(email, pass);
    } catch(err: any) {
      errEl.textContent = err.message; errEl.classList.add('show');
      btn.disabled = false; btn.textContent = authMode === 'login' ? 'Sign in' : 'Create account';
    }
  });

  // Dashboard
  on('createBtn', 'click', () => { showCreate=true; render(); });
  on('emptyCreateBtn', 'click', () => { showCreate=true; render(); });
  document.querySelectorAll<HTMLButtonElement>('.upload-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const sub = subdomains.find(s => s.name === btn.dataset.name)!;
      pendingFiles = []; uploadProgress = 0;
      navigate('upload', sub);
    })
  );
  document.querySelectorAll<HTMLButtonElement>('.delete-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name!;
      if (!confirm(`Delete "${name}.${MAIN_DOMAIN}"? This cannot be undone.`)) return;
      btn.disabled = true;
      try {
        await apiDeleteSubdomain(name);
        subdomains = subdomains.filter(s => s.name !== name);
        toast(`Deleted ${name}`, 'success'); render();
      } catch(err: any) { toast(err.message, 'error'); btn.disabled = false; }
    })
  );

  // Create modal
  on('closeCreate', 'click', () => { showCreate=false; render(); });
  on('createOverlay', 'click', e => { if ((e.target as HTMLElement).id==='createOverlay') { showCreate=false; render(); } });
  on('createForm', 'submit', async e => {
    e.preventDefault();
    const name = (document.getElementById('subName') as HTMLInputElement).value.toLowerCase().trim();
    const desc = (document.getElementById('subDesc') as HTMLInputElement).value;
    const errEl = document.getElementById('createError')!;
    const btn = document.getElementById('createSubmit') as HTMLButtonElement;
    btn.disabled = true; btn.textContent = 'Creating...';
    try {
      const sub = await apiCreateSubdomain(name, desc);
      subdomains.unshift(sub); showCreate = false;
      toast(`✅ ${name}.${MAIN_DOMAIN} is ready!`, 'success');
      pendingFiles = []; uploadProgress = 0;
      navigate('upload', sub);
    } catch(err: any) {
      errEl.textContent = err.message; errEl.classList.add('show');
      btn.disabled = false; btn.textContent = 'Create Subdomain →';
    }
  });

  // Upload page
  on('backBtn', 'click', async () => { await loadSubdomains(); navigate('dashboard'); });

  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput') as HTMLInputElement | null;

  on('browseBtn', 'click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    if (fileInput.files) { addFiles(Array.from(fileInput.files)); fileInput.value = ''; }
  });
  dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone?.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    if (e.dataTransfer?.files) addFiles(Array.from(e.dataTransfer.files));
  });

  document.querySelectorAll<HTMLButtonElement>('.file-remove[data-idx]').forEach(btn =>
    btn.addEventListener('click', () => {
      pendingFiles.splice(Number(btn.dataset.idx), 1); render();
    })
  );
  on('clearBtn', 'click', () => { pendingFiles = []; uploadProgress = 0; render(); });
  on('uploadBtn', 'click', doUpload);
  on('githubImportBtn', 'click', doGithubImport);

  document.querySelectorAll<HTMLButtonElement>('.del-file-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      const filename = btn.dataset.file!;
      if (!confirm(`Delete "${filename}"?`)) return;
      try {
        await apiDeleteFile(activeSubdomain!.name, filename);
        toast(`Deleted ${filename}`, 'success');
        await loadFiles(activeSubdomain!.name);
      } catch(err: any) { toast(err.message, 'error'); }
    })
  );

  on('deleteAllFilesBtn', 'click', async () => {
    if (!activeSubdomain) return;
    if (!confirm(`Are you sure you want to delete ALL files and stop any running backend for "${activeSubdomain.name}"? This cannot be undone.`)) return;
    const btn = document.getElementById('deleteAllFilesBtn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    try {
      await apiDeleteAllFiles(activeSubdomain.name);
      toast('All files deleted successfully', 'success');
      await loadFiles(activeSubdomain.name);
    } catch(err: any) { 
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Delete All';
    }
  });
}

function addFiles(files: File[]) {
  files.forEach(f => { if (!pendingFiles.find(x => x.name === f.name)) pendingFiles.push(f); });
  render();
}

async function doUpload() {
  if (!pendingFiles.length || !activeSubdomain) return;
  const btn = document.getElementById('uploadBtn') as HTMLButtonElement;
  btn.disabled = true; btn.textContent = 'Uploading...';
  uploadProgress = 1; render();
  try {
    const results = await apiUploadFiles(activeSubdomain.name, pendingFiles, pct => {
      uploadProgress = pct; const bar = document.querySelector<HTMLElement>('.progress-bar');
      if (bar) bar.style.width = pct + '%';
    });
    const ok = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success);
    if (ok) toast(`✅ Uploaded ${ok} file${ok>1?'s':''}`, 'success');
    if (fail.length) fail.forEach(f => toast(`❌ ${f.file}: ${f.error}`, 'error'));
    pendingFiles = []; uploadProgress = 0;
    await loadFiles(activeSubdomain.name);
  } catch(err: any) {
    toast(err.message, 'error');
    btn.disabled = false; btn.textContent = `⚡ Upload ${pendingFiles.length} file${pendingFiles.length>1?'s':''}`;
    uploadProgress = 0; render();
  }
}

async function doGithubImport() {
  if (!activeSubdomain) return;
  const input = document.getElementById('githubUrl') as HTMLInputElement;
  const btn = document.getElementById('githubImportBtn') as HTMLButtonElement;
  const url = input.value.trim();
  
  if (!url || !url.startsWith('https://github.com/')) {
    toast('Please enter a valid GitHub URL', 'error');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Importing...';
  
  try {
    const results = await apiImportGitHub(activeSubdomain.name, url);
    const ok = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success);
    if (ok) toast(`✅ Imported ${ok} file${ok>1?'s':''} from GitHub`, 'success');
    if (fail.length) fail.forEach(f => toast(`❌ ${f.file}: ${f.error}`, 'error'));
    input.value = '';
    await loadFiles(activeSubdomain.name);
  } catch(err: any) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import';
    render();
  }
}

function on(id: string, ev: string, fn: EventListener) {
  document.getElementById(id)?.addEventListener(ev, fn);
}

// ── Boot ───────────────────────────────────────────────────────────────────
async function boot() {
  initToast();
  await loadUser();
  supabase.auth.onAuthStateChange((_ev, session) => { user = session?.user ?? null; });
  if (user) { page = 'dashboard'; await loadSubdomains(); }
  render();
}

boot();
