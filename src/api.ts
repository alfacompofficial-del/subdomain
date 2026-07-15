import { supabase, API_URL } from './supabase';

export interface Subdomain {
  id: string;
  name: string;
  user_id: string;
  description: string;
  created_at: string;
}

export interface FileInfo {
  name: string;
  id: string | null;
  updated_at: string;
  metadata?: { size: number; mimetype: string } | null;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGetSubdomains(): Promise<Subdomain[]> {
  const r = await fetch(`${API_URL}/api/subdomains`, { headers: await authHeader() });
  if (!r.ok) throw new Error((await r.json()).error);
  return r.json();
}

export async function apiCreateSubdomain(name: string, description: string): Promise<Subdomain> {
  const r = await fetch(`${API_URL}/api/subdomains`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...await authHeader() },
    body: JSON.stringify({ name, description }),
  });
  if (!r.ok) throw new Error((await r.json()).error);
  return r.json();
}

export async function apiDeleteSubdomain(name: string): Promise<void> {
  const r = await fetch(`${API_URL}/api/subdomains/${name}`, {
    method: 'DELETE',
    headers: await authHeader(),
  });
  if (!r.ok) throw new Error((await r.json()).error);
}

export async function apiGetFiles(name: string): Promise<FileInfo[]> {
  const r = await fetch(`${API_URL}/api/subdomains/${name}/files`, { headers: await authHeader() });
  if (!r.ok) throw new Error((await r.json()).error);
  return r.json();
}

export async function apiDeleteFile(subdomain: string, filename: string): Promise<void> {
  const r = await fetch(`${API_URL}/api/subdomains/${subdomain}/files/${filename}`, {
    method: 'DELETE',
    headers: await authHeader(),
  });
  if (!r.ok) throw new Error((await r.json()).error);
}

export async function apiDeleteAllFiles(subdomain: string): Promise<void> {
  const r = await fetch(`${API_URL}/api/subdomains/${subdomain}/files`, {
    method: 'DELETE',
    headers: await authHeader(),
  });
  if (!r.ok) throw new Error((await r.json()).error);
}

export async function apiUploadFiles(
  subdomain: string,
  files: File[],
  onProgress?: (pct: number) => void
): Promise<{ file: string; success: boolean; error?: string }[]> {
  const form = new FormData();
  files.forEach(f => form.append('files', f));
  const headers = await authHeader();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/subdomains/${subdomain}/upload`);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText).results);
      } else {
        reject(new Error(JSON.parse(xhr.responseText).error));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(form);
  });
}

export async function apiImportGitHub(subdomain: string, repoUrl: string): Promise<{ file: string; success: boolean; error?: string }[]> {
  const r = await fetch(`${API_URL}/api/subdomains/${subdomain}/github`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...await authHeader() },
    body: JSON.stringify({ repoUrl }),
  });
  if (!r.ok) throw new Error((await r.json()).error);
  return (await r.json()).results;
}
