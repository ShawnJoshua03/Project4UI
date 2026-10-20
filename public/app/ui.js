export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
export const list = (value, key) => Array.isArray(value) ? value : value?.[key] || [];
export const unwrap = (value, key) => value?.[key] || value;
export const dateOf = item => item.createdAt || item.created_at || item.updatedAt || item.updated_at;
export const formatDate = (value, options = {}) => {
  if (!value) return 'Time not provided';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time not provided' : new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...options,
  }).format(date);
};
export const initials = name => String(name || 'Patient').split(/\s+/).slice(0, 2).map(word => word[0]).join('');
export const statusLabel = value => ({
  stable: 'Stable', monitoring: 'Being monitored', critical: 'Critical',
  requested: 'Requested', confirmed: 'Confirmed', declined: 'Declined',
  sent: 'Sent', pending: 'Sent', acknowledged: 'Acknowledged', resolved: 'Resolved',
}[value] || value || 'Not available');
export const badge = value => `<span class="badge ${['stable', 'monitoring', 'critical', 'requested', 'confirmed', 'declined', 'sent', 'pending', 'acknowledged', 'resolved'].includes(value) ? value : ''}"><span aria-hidden="true" class="status-dot"></span>${escapeHtml(statusLabel(value))}</span>`;
export const empty = (title, body) => `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">○</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></div>`;
export const icon = name => {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    book: '<path d="M12 5v16M12 5C9 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-7-1-10 1Z"/>',
    moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/>',
    message: '<path d="M21 15a3 3 0 0 1-3 3H8l-5 3V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/><path d="M7 8h10M7 12h7"/>',
    shield: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6Z"/><path d="m8 12 3 3 5-6"/>',
    cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
    exit: '<path d="M9 3H3v18h6m6-15 6 6-6 6m-8-6h14"/>',
  };
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.home}</svg>`;
};
export function announce(message) {
  const el = document.querySelector('#announcer');
  el.textContent = '';
  window.setTimeout(() => { el.textContent = message; }, 30);
}
export function toast(message, isError = false) {
  const el = document.createElement('div');
  el.className = `toast${isError ? ' toast-error' : ''}`;
  el.textContent = message;
  document.querySelector('#toasts').append(el);
  window.setTimeout(() => el.remove(), isError ? 10000 : 6000);
}
export function safeLink(value) {
  try {
    const url = new URL(value, location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : '';
  } catch { return ''; }
}
