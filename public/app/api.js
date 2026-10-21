// All transport lives here. No demo data or production fallback is synthesized.
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method, signal, credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(method !== 'GET' ? { 'X-Requested-With': 'bedside' } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach Bedside. Check your connection and try again.', 0);
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/me') {
      window.dispatchEvent(new Event('bedside:session-expired'));
    }
    throw new ApiError(data?.error || (response.status === 429
      ? 'Too many sign-in attempts. Please wait a minute and try again.'
      : `Unable to complete this request (${response.status}). Please try again.`), response.status);
  }
  if (data === null && response.status !== 204) {
    throw new ApiError('Bedside returned an unreadable response. Please try again.', response.status);
  }
  return data;
}

const id = value => encodeURIComponent(value);
const patientPath = value => `/patients/${id(value)}`;
export const api = {
  me: () => request('/me'),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  patients: () => request('/patients'),
  patient: value => request(patientPath(value)),
  visits: value => request(`${patientPath(value)}/visits`),
  addVisit: (value, summary) => request(`${patientPath(value)}/visits`, { method: 'POST', body: { summary } }),
  appointments: value => request(`${patientPath(value)}/appointments`),
  requestAppointment: (value, body) => request(`${patientPath(value)}/appointments`, { method: 'POST', body }),
  updateAppointment: (value, body) => request(`/appointments/${id(value)}`, { method: 'PATCH', body }),
  messages: value => request(`${patientPath(value)}/messages`),
  sendMessage: (value, body) => request(`${patientPath(value)}/messages`, { method: 'POST', body: { body } }),
  sendAlert: (value, reason) => request(`${patientPath(value)}/alerts`, { method: 'POST', body: { reason } }),
  alerts: () => request('/alerts'),
  updateAlert: (value, status) => request(`/alerts/${id(value)}`, { method: 'PATCH', body: { status } }),
  education: () => request('/education'),
  subscribe(onEvent, onConnection) {
    const stream = new EventSource('/api/stream');
    stream.onopen = () => onConnection(true);
    stream.onerror = () => onConnection(false);
    for (const type of ['message', 'alert', 'appointment', 'visit']) {
      stream.addEventListener(type, event => {
        try { onEvent(type, JSON.parse(event.data)); }
        catch { onConnection(false); }
      });
    }
    return () => stream.close();
  },
};
