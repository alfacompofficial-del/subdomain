let container: HTMLElement;

export function initToast() {
  container = document.createElement('div');
  container.id = 'toast-container';
  document.body.appendChild(container);
}

export function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  if (!container) initToast();
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.4s'; setTimeout(() => el.remove(), 400); }, 3500);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function fileIcon(name: string, isFolder = false): string {
  if (isFolder) return '📁';
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    html: '🌐', css: '🎨', js: '⚡', ts: '🔷', json: '📋',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🎭',
    zip: '📦', md: '📝', txt: '📄',
  };
  return map[ext || ''] || '📄';
}
