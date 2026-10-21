import { api } from './api.js';
import { escapeHtml as e, list, unwrap, dateOf, formatDate, initials, badge, empty, icon, announce, toast, safeLink } from './ui.js';

const root = document.querySelector('#app');
const dialog = document.querySelector('#action-dialog');
const urgentDialog = document.querySelector('#alert-dialog');
const state = {
  user: null, patients: [], selected: null, patient: null, visits: [], appointments: [],
  messages: [], alerts: [], familyAlerts: {}, education: [], page: 'care', tab: 'visits',
  loading: false, error: '', resourceErrors: {}, connected: false,
};
let closeStream;
let loadVersion = 0;
let refreshVersion = 0;
let pendingAlert = null;
let sendingAlert = false;
let holdTimer;
let holdButton;
let holdStarted = 0;
let sessionVersion = 0;
let authBusy = false;
const pendingForms = new Set();
const pendingActions = new Set();
const alertChanges = new Map();
let alertRevision = 0;
let dialogReturnFocus = null;
const themeMedia = matchMedia('(prefers-color-scheme: dark)');
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Optional persistence. */ } },
};
let theme = storage.get('bedside-theme') || 'system';
function applyTheme() {
  document.documentElement.dataset.theme = theme === 'system' ? (themeMedia.matches ? 'dark' : 'light') : theme;
  document.querySelectorAll('[data-action="theme"]').forEach(button => {
    button.innerHTML = `${icon('moon')}<span>Theme: ${theme}</span>`;
    button.setAttribute('aria-label', `Color theme: ${theme}. Change theme`);
  });
}
themeMedia.addEventListener('change', applyTheme);
applyTheme();
const footer = () => '<footer class="footer"><span>Bedside</span><span>Demo data only. No real patient health information.</span></footer>';
const themeButton = () => `<button class="quiet-button theme-button" data-action="theme">${icon('moon')}<span>Theme: ${e(theme)}</span></button>`;
const family = () => state.user?.role === 'family';
const sameId = (a, b) => String(a) === String(b);
const patientIdOf = item => item.patientId ?? item.patient_id;
const isWaiting = alert => !['acknowledged', 'resolved'].includes(alert.status);
const alertsFor = value => state.alerts.filter(alert => sameId(patientIdOf(alert), value));
const patientName = value => state.patients.find(patient => sameId(patient.id, value))?.name || 'Assigned patient';
const sortNewest = items => [...items].sort((a, b) => new Date(dateOf(b)) - new Date(dateOf(a)));

function renderLogin(error = '') {
  cancelHold();
  root.innerHTML = `<div class="login-page">
    <header class="login-header"><a class="brand" href="/"><span class="brand-mark">b.</span>bedside</a>${themeButton()}</header>
    <main id="main" class="login-layout">
      <section class="welcome"><div class="welcome-art" aria-hidden="true"><div class="art-window"><span class="art-sun"></span><span class="art-hill"></span><span class="art-hill second"></span></div><span class="art-stem"></span><span class="art-leaf"></span><span class="art-leaf second"></span><span class="art-pot"></span></div>
        <h1>A little closer.<br>Even from here.</h1><p>Stay connected to your loved one’s care, wherever the day finds you.</p>
        <div class="welcome-note">${icon('shield')}<span>One place for care updates, conversations, and time together.</span></div>
      </section>
      <section class="login-panel" aria-labelledby="login-title"><span class="small-label">Welcome to Bedside</span><h2 id="login-title">Come on in.</h2><p class="muted">Sign in to your care space.</p>
        <form id="login-form"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="username" required placeholder="you@example.com">
        <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
        <p id="login-error" class="form-error" role="alert">${e(error)}</p><button class="button primary full" type="submit">Sign in ${icon('arrow')}</button></form>
        <div class="demo-choices"><p>Take a look around</p><span class="muted">Try the demo as…</span>
          <button class="button secondary full" data-action="demo" data-role="family">A family member ${icon('arrow')}</button>
          <button class="button secondary full" data-action="demo" data-role="clinician">A clinician ${icon('arrow')}</button>
          <small>Demo accounts use fictional people and care records.</small>
        </div>
      </section>
    </main>${footer()}</div>`;
  applyTheme();
}

function renderShell() {
  root.innerHTML = `<div class="app-layout ${family() ? 'family-layout' : 'clinician-layout'}">
    <aside class="sidebar"><a class="brand" href="/"><span class="brand-mark">b.</span>bedside</a>
      <div class="workspace-label">${family() ? 'Your family’s care space' : 'Clinical workspace'}</div>
      <nav aria-label="Main navigation"><button class="nav-item" data-action="page" data-page="care">${icon('home')}<span>${family() ? 'Care overview' : 'Patient triage'}</span></button><button class="nav-item" data-action="page" data-page="education">${icon('book')}<span>Care library</span></button></nav>
      <div class="sidebar-note">${icon('shield')}<p>${family() ? 'A shared space.<br>A little peace of mind.' : 'A clear view of who<br>needs you next.'}</p></div>
      <div class="sidebar-bottom">${themeButton()}<div class="user-card"><span class="avatar small">${e(initials(state.user.name || state.user.email))}</span><span><strong>${e(state.user.name || (family() ? 'Family member' : 'Clinician'))}</strong><small>${family() ? 'Family access' : 'Care team access'}</small></span></div><button class="quiet-button" data-action="logout">${icon('exit')}Sign out</button></div>
    </aside>
    <div class="workspace"><header class="topbar"><span>${family() ? 'Here with you' : 'Care team station'}</span><div class="connection" id="connection" role="status"></div><button class="quiet-button" data-action="refresh">Refresh</button></header>
      <main id="main" tabindex="-1"></main>${footer()}</div></div>`;
  renderMain();
  renderConnection();
  applyTheme();
}

function renderConnection() {
  const el = document.querySelector('#connection');
  if (el) {
    el.className = `connection ${state.connected ? 'online' : ''}`;
    el.textContent = state.connected ? 'Live updates on' : 'Reconnecting · refresh for updates';
  }
}

function renderMain(preserve = false) {
  cancelHold();
  const main = document.querySelector('#main');
  if (!main || !state.user) return;
  const drafts = preserve ? [...main.querySelectorAll('input, textarea, select')].map(el => [el.id, el.value]) : [];
  const focused = preserve && main.contains(document.activeElement) ? {
    id: document.activeElement.id, start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd,
  } : null;
  document.querySelectorAll('[data-action="page"]').forEach(button => {
    button.classList.toggle('active', button.dataset.page === state.page);
    if (button.dataset.page === state.page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (state.page === 'education') main.innerHTML = educationView();
  else {
    const heading = `<div class="page-heading"><div><p class="small-label">${family() ? 'Connected to what matters' : `${state.patients.length} assigned patients`}</p><h1>${family() ? 'Care, within reach.' : 'Your care queue.'}</h1><p class="muted">${family() ? 'The latest updates. The people who care. All together.' : 'See what needs attention and keep families in the loop.'}</p></div>${family() && state.patients.length > 1 ? `<div class="patient-picker"><label for="patient-picker">Your loved one</label><select id="patient-picker">${state.patients.map(p => `<option value="${e(p.id)}" ${sameId(p.id, state.selected) ? 'selected' : ''}>${e(p.name)}</option>`).join('')}</select></div>` : `<span class="today">${e(new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date()))}</span>`}</div>`;
    const body = state.error ? `<section class="error-panel" role="alert"><h2>Care information couldn’t load</h2><p>${e(state.error)}</p><button class="button secondary" data-action="refresh">Try again</button></section>` :
      !state.patients.length ? state.loading ? '<div class="loading-panel" role="status">Gathering the latest care updates…</div>' : empty('No patients linked yet', 'Your care team will connect your account to a patient. Refresh to check again.') :
      family() ? familyView() : clinicianView();
    main.innerHTML = `${heading}${body}`;
  }
  for (const [id, value] of drafts) {
    const el = id && document.getElementById(id);
    if (el) el.value = value;
  }
  main.querySelectorAll('form').forEach(form => {
    const busy = pendingForms.has(`${form.id}:${state.selected}`);
    form.querySelector('[type="submit"]').disabled = busy;
    form.setAttribute('aria-busy', String(busy));
  });
  restoreBusyActions();
  if (focused?.id) {
    const el = document.getElementById(focused.id);
    el?.focus({ preventScroll: true });
    if (typeof focused.start === 'number' && el?.setSelectionRange && ['TEXTAREA', 'INPUT'].includes(el.tagName)) {
      try { el.setSelectionRange(focused.start, focused.end); } catch { /* Date inputs have no selection. */ }
    }
  }
}
function restoreBusyActions() {
  document.querySelectorAll('[data-action][data-id]').forEach(button => {
    button.disabled = pendingActions.has(`${button.dataset.action}:${button.dataset.id}`);
  });
}

function hero(patient, compact = false) {
  return `<section class="patient-hero ${compact ? 'compact' : ''}" aria-label="Patient overview">
    <div class="hero-top"><span class="avatar">${e(initials(patient.name))}</span><div><p class="small-label">${family() ? 'Your loved one' : 'Patient record'}</p><h2>${e(patient.name)}</h2><p class="room">Room ${e(patient.room || 'not assigned')}</p></div>${badge(patient.status)}</div>
    <div class="hero-condition"><span class="small-label">Current care</span><p>${e(patient.condition || 'Your care team has not added a care overview yet.')}</p></div>
    <div class="hero-footer">${icon('shield')}<span>Last care update ${e(formatDate(patient.updatedAt || patient.updated_at))}</span></div>
  </section>`;
}

function familyView() {
  if (state.loading) return '<div class="loading-panel" role="status">Gathering the latest care updates…</div>';
  if (!state.patient) return empty('Choose a patient', 'Select your loved one to see their care updates.');
  const appointment = [...state.appointments].filter(a => !['declined'].includes(a.status)).sort((a, b) => new Date(a.scheduledAt || a.requestedAt) - new Date(b.scheduledAt || b.requestedAt)).find(a => new Date(a.scheduledAt || a.requestedAt) >= new Date()) || state.appointments.find(a => a.status === 'requested');
  return `<div class="family-grid"><div class="care-column">${hero(state.patient)}
    <section class="journal panel"><div class="section-heading"><div><p class="small-label">From the care team</p><h2>Your care journal</h2></div>${icon('book')}</div>${tabs()}${tabContent()}</section>
    </div><aside class="care-aside"><section class="visit-card"><span class="icon-tile">${icon('calendar')}</span><h2>Make time together.</h2><p>Plan a video call or an in-person visit with your loved one.</p>
      ${appointment ? `<div class="next-visit"><span class="small-label">Next visit</span><strong>${e(appointment.type === 'video' ? 'Video call' : 'In-person visit')}</strong><span>${e(formatDate(appointment.scheduledAt || appointment.requestedAt))}</span>${badge(appointment.status)}</div>` : '<p class="muted">A familiar face can make a difference.</p>'}
      <button class="button primary full" data-action="request-visit">Request a visit ${icon('arrow')}</button></section>
      <section class="emergency-card"><div class="section-heading"><h2>Need the team urgently?</h2>${icon('cross')}</div><p>Hold for 1.5 seconds, choose a reason, then confirm to notify the care team.</p>
        <button id="emergency-hold" class="button danger hold-button full" data-action="hold" aria-describedby="hold-help"><span>Send emergency alert</span><span class="hold-progress" aria-hidden="true"></span></button>
        <small id="hold-help">Press and hold, or hold Space or Enter. Release early to cancel.</small>${familyAlertView()}
        <p class="emergency-note">This demo does not contact emergency services. For a real emergency, contact hospital staff or local emergency services directly.</p></section>
      <a class="library-teaser" href="#library" data-action="library">${icon('book')}<span><strong>A little understanding helps.</strong><small>Explore the care library</small></span>${icon('arrow')}</a></aside></div>`;
}

function familyAlertView() {
  if (state.resourceErrors.familyAlerts) return `<div id="family-alert-status" class="error-panel" role="alert">Alert status could not refresh. ${e(state.resourceErrors.familyAlerts)} <button class="quiet-button" data-action="refresh">Retry</button></div>`;
  const alert = state.familyAlerts[state.selected];
  if (!alert) return '<div id="family-alert-status"></div>';
  const step = alert.status === 'resolved' ? 2 : alert.status === 'acknowledged' ? 1 : 0;
  return `<div id="family-alert-status" class="alert-progress" role="status"><strong>${['Your alert has been sent', 'The care team has acknowledged your alert', 'The care team has resolved your alert'][step]}</strong><ol aria-label="Emergency alert progress">${['Sent', 'Acknowledged', 'Resolved'].map((label, index) => `<li class="${index <= step ? 'complete' : ''}" ${index === step ? 'aria-current="step"' : ''}>${label}</li>`).join('')}</ol><p>${e(alert.reason || '')}</p><small>${step === 0 ? 'Waiting for the care team to acknowledge.' : step === 1 ? 'The team is aware. Updates will appear here.' : 'You can message the care team if you have questions.'}</small></div>`;
}

function clinicianView() {
  const sorted = [...state.patients].sort((a, b) => priority(b) - priority(a) || a.name.localeCompare(b.name));
  const waiting = state.alerts.filter(isWaiting);
  return `${state.resourceErrors.alerts ? `<div class="error-panel" role="alert">Emergency alerts could not load. ${e(state.resourceErrors.alerts)} <button class="quiet-button" data-action="refresh">Retry</button></div>` : ''}
    <div class="triage-summary"><span><strong>${waiting.length}</strong> awaiting acknowledgement</span><span><strong>${state.patients.filter(p => p.status === 'critical').length}</strong> critical</span><span><strong>${state.alerts.filter(a => a.status === 'acknowledged').length}</strong> alerts in progress</span></div>
    <div class="triage-grid"><section class="patient-queue" aria-label="Patient triage queue"><div class="queue-title"><h2>Assigned patients</h2><span>Priority order</span></div>${sorted.map(patient => {
      const alerts = alertsFor(patient.id);
      return `<button class="queue-patient ${sameId(patient.id, state.selected) ? 'selected' : ''}" data-action="patient" data-id="${e(patient.id)}" aria-pressed="${sameId(patient.id, state.selected)}"><span class="queue-patient-top"><strong>${e(patient.name)}</strong><span>Rm ${e(patient.room || '—')}</span></span><span class="queue-condition">${e(patient.condition || 'No care overview')}</span><span class="queue-patient-bottom">${badge(patient.status)}${alerts.length ? `<span class="alert-count">${alerts.length} open alert${alerts.length === 1 ? '' : 's'}</span>` : ''}</span></button>`;
    }).join('')}</section><div class="clinical-detail" aria-busy="${state.loading}">${state.loading ? '<div class="loading-panel" role="status">Loading patient record…</div>' : state.patient ? `${hero(state.patient, true)}${clinicalAlerts()}<section class="journal panel">${tabs()}${tabContent()}</section>` : empty('Select a patient', 'Choose a patient from the queue to review their care.')}</div></div>`;
}
function priority(patient) {
  const alerts = alertsFor(patient.id);
  return (alerts.some(isWaiting) ? 100 : alerts.length ? 50 : 0) + (patient.status === 'critical' ? 20 : patient.status === 'monitoring' ? 10 : 0);
}
function clinicalAlerts() {
  return alertsFor(state.selected).map(alert => `<section class="clinical-alert"><div><strong>${isWaiting(alert) ? 'Emergency alert' : 'Acknowledged · follow-up needed'}</strong><p>${e(alert.reason)}</p><small>${e(formatDate(dateOf(alert)))}</small></div><button class="button ${isWaiting(alert) ? 'danger' : 'secondary'}" data-action="${isWaiting(alert) ? 'acknowledge' : 'resolve'}" data-id="${e(alert.id)}">${isWaiting(alert) ? 'Acknowledge' : 'Mark resolved'}</button></section>`).join('');
}
function tabs() {
  return `<div class="tabs" role="tablist" aria-label="Patient care">${[['visits', 'Care updates'], ['messages', 'Messages'], ['appointments', 'Visits & calls']].map(([key, label]) => `<button id="tab-${key}" role="tab" aria-selected="${state.tab === key}" aria-controls="care-panel" tabindex="${state.tab === key ? '0' : '-1'}" data-action="tab" data-tab="${key}">${label}${key === 'messages' && state.messages.length ? `<span class="tab-count">${state.messages.length}</span>` : ''}</button>`).join('')}</div>`;
}
function tabContent() {
  const error = state.resourceErrors[state.tab];
  return `<div id="care-panel" role="tabpanel" tabindex="0" aria-labelledby="tab-${state.tab}">${error ? `<div class="error-panel" role="alert"><p>${e(error)}</p><button class="button secondary" data-action="refresh">Try again</button></div>` : state.tab === 'visits' ? visitsView() : state.tab === 'messages' ? messagesView() : appointmentsView()}</div>`;
}
function visitsView() {
  return `${!family() ? `<form id="summary-form" class="compose-summary"><label for="summary">Share a care update</label><textarea id="summary" name="summary" rows="3" required maxlength="10000" placeholder="A clear, plain-language summary for the family…"></textarea><div class="form-bottom"><small>Visible to this patient’s family.</small><button class="button primary" type="submit">Publish update</button></div><p class="form-error" role="alert"></p></form>` : ''}
    <div class="timeline">${state.visits.length ? sortNewest(state.visits).map(visit => `<article class="timeline-entry"><span class="timeline-marker" aria-hidden="true"></span><div class="entry-meta"><strong>${e(visit.clinicianName || visit.doctorName || visit.authorName || visit.author?.name || 'Care team')}</strong><time>${e(formatDate(dateOf(visit)))}</time></div><h3>${e(visit.title || 'An update on care')}</h3><p class="preserve-lines">${e(visit.summary)}</p></article>`).join('') : empty('The next update will be right here', family() ? 'Your care team will share visit summaries and progress here.' : 'Publish a care update to keep the family informed.')}</div>`;
}
function messagesView() {
  return `<div class="message-intro">${icon('message')}<p>A direct conversation with ${family() ? 'the care team' : 'the family'}. For urgent concerns, ${family() ? 'use the emergency alert' : 'review the emergency queue'}.</p></div>
    <div class="messages" aria-label="Conversation">${state.messages.length ? [...state.messages].sort((a, b) => new Date(dateOf(a)) - new Date(dateOf(b))).map(message => {
      const own = sameId(message.senderId ?? message.userId ?? message.sender_id, state.user.id) || (message.senderRole || message.role) === state.user.role;
      return `<article class="message ${own ? 'own' : ''}"><div class="entry-meta"><strong>${e(message.senderName || message.authorName || message.sender?.name || (own ? 'You' : 'Care conversation'))}</strong><time>${e(formatDate(dateOf(message)))}</time></div><p class="preserve-lines">${e(message.body)}</p></article>`;
    }).join('') : empty('Start a conversation', 'Ask a question or share something you’d like the care team to know.')}</div>
    <form id="message-form" class="message-form"><label for="message-body">Your message</label><textarea id="message-body" name="body" maxlength="2000" required rows="3" placeholder="Write a message…" aria-describedby="message-help"></textarea><div class="form-bottom"><small id="message-help">Up to 2,000 characters. Not for emergencies.</small><button class="button primary" type="submit">Send message ${icon('arrow')}</button></div><p class="form-error" role="alert"></p></form>`;
}
function appointmentsView() {
  return `<div class="section-heading appointment-heading"><h3>${family() ? 'Time with your loved one' : 'Family visit requests'}</h3>${family() ? '<button class="button secondary" data-action="request-visit">Request a visit</button>' : ''}</div>
    ${state.appointments.length ? [...state.appointments].sort((a, b) => new Date(b.requestedAt || dateOf(b)) - new Date(a.requestedAt || dateOf(a))).map(appointment => `<article class="appointment"><span class="icon-tile">${icon('calendar')}</span><div class="appointment-copy"><h3>${appointment.type === 'video' ? 'Video call' : 'In-person visit'}</h3><p>${e(formatDate(appointment.scheduledAt || appointment.requestedAt))}</p>${badge(appointment.status)}${appointment.note ? `<p class="preserve-lines">${e(appointment.note)}</p>` : ''}</div>${!family() && appointment.status === 'requested' ? `<div class="appointment-actions"><button class="button primary" data-action="confirm-appointment" data-id="${e(appointment.id)}">Confirm</button><button class="quiet-button" data-action="decline-appointment" data-id="${e(appointment.id)}">Decline</button></div>` : ''}</article>`).join('') : empty('No visits planned yet', family() ? 'Request a video call or an in-person visit. The care team will confirm a time.' : 'Family requests for video calls and in-person visits will appear here.')}`;
}
function educationView() {
  return `<div class="page-heading"><div><p class="small-label">A little understanding helps</p><h1>The care library.</h1><p class="muted">Information to help you feel more prepared for the conversations ahead.</p></div>${icon('book')}</div><div class="library-intro"><h2>Care is a shared conversation.</h2><p>Keep questions for your care team. They can explain what this information means for your loved one.</p></div>${state.resourceErrors.education ? `<div class="error-panel" role="alert"><p>${e(state.resourceErrors.education)}</p><button class="button secondary" data-action="refresh">Try again</button></div>` : `<div class="education-grid">${state.education.length ? state.education.map(article => `<article class="education-card"><span class="icon-tile">${icon('book')}</span><p class="small-label">${e(article.category || 'Understanding care')}</p><h2>${e(article.title)}</h2><p>${e(article.summary || article.description || '')}</p>${article.content || article.body ? `<details><summary>Read article</summary><div class="preserve-lines">${e(article.content || article.body)}</div></details>` : ''}${safeLink(article.url) ? `<a class="text-link" href="${safeLink(article.url)}" target="_blank" rel="noopener noreferrer">Read ${e(article.source || 'article')} <span class="sr-only">(opens in a new tab)</span>${icon('arrow')}</a>` : ''}</article>`).join('') : empty('The library is being prepared', 'Ask your care team about resources in the meantime.')}</div>`}`;
}

async function loadPatients() {
  const version = ++refreshVersion;
  const session = sessionVersion;
  const alertsAtRequest = alertRevision;
  try {
    const [patients, education, alerts] = await Promise.allSettled([
      api.patients(), api.education(), family() ? Promise.resolve([]) : api.alerts(),
    ]);
    if (version !== refreshVersion || session !== sessionVersion || !state.user) return;
    if (patients.status === 'rejected') throw patients.reason;
    state.patients = list(patients.value, 'patients');
    for (const [key, result] of [['education', education], ['alerts', alerts]]) {
      state.resourceErrors[key] = result.status === 'rejected' ? result.reason.message : '';
      if (result.status === 'fulfilled') {
        state[key] = list(result.value, key);
        if (key === 'alerts') {
          const merged = new Map(state.alerts.map(alert => [String(alert.id), alert]));
          for (const [id, change] of alertChanges) {
            if (change.revision > alertsAtRequest) merged.set(id, { ...merged.get(id), ...change.alert });
          }
          state.alerts = [...merged.values()].filter(alert => alert.status !== 'resolved');
        }
      }
    }
    state.error = '';
    if (!state.patients.some(p => sameId(p.id, state.selected))) {
      state.selected = [...state.patients].sort((a, b) => priority(b) - priority(a))[0]?.id ?? null;
    }
    if (state.selected !== null) await loadPatient(state.selected, true);
    else { state.loading = false; renderMain(); }
    showUrgent();
  } catch (error) {
    if (session !== sessionVersion) return;
    state.error = error.message;
    state.loading = false;
    renderMain();
  }
}
async function loadPatient(value, preserve = false) {
  const version = ++loadVersion;
  const session = sessionVersion;
  const alertsAtRequest = alertRevision;
  const changing = !sameId(state.selected, value) || !state.patient;
  state.selected = value;
  if (changing) {
    state.loading = true;
    state.patient = null;
    state.visits = []; state.messages = []; state.appointments = [];
    renderMain();
  }
  const results = await Promise.allSettled([
    api.patient(value), api.visits(value), api.messages(value), api.appointments(value),
    family() ? api.patientAlerts(value) : Promise.resolve(null),
  ]);
  if (version !== loadVersion || session !== sessionVersion || !state.user) return;
  state.loading = false;
  if (results[0].status === 'rejected') {
    state.error = results[0].reason.message;
  } else {
    state.error = '';
    state.patient = unwrap(results[0].value, 'patient');
    state.patients = state.patients.map(p => sameId(p.id, value) ? state.patient : p);
    for (const [index, key] of [[1, 'visits'], [2, 'messages'], [3, 'appointments']]) {
      const result = results[index];
      state.resourceErrors[key] = result.status === 'rejected' ? result.reason.message : '';
      if (result.status === 'fulfilled') state[key] = list(result.value, key);
    }
    if (family()) {
      const result = results[4];
      state.resourceErrors.familyAlerts = result.status === 'rejected' ? result.reason.message : '';
      if (result.status === 'fulfilled') {
        const merged = new Map(list(result.value, 'alerts').map(alert => [String(alert.id), alert]));
        for (const [id, change] of alertChanges) {
          if (change.revision > alertsAtRequest && sameId(patientIdOf(change.alert), value)) {
            merged.set(id, { ...merged.get(id), ...change.alert });
          }
        }
        const latest = [...merged.values()].sort((a, b) =>
          new Date(dateOf(b)) - new Date(dateOf(a)) || Number(b.id) - Number(a.id))[0];
        if (latest) state.familyAlerts[value] = latest;
        else delete state.familyAlerts[value];
        saveFamilyAlerts();
      }
    }
  }
  renderMain(preserve && !changing);
}

async function startSession(user) {
  if (!['family', 'clinician'].includes(user?.role)) throw new Error('This account does not have a supported care role.');
  sessionVersion++;
  state.user = user;
  state.error = '';
  state.resourceErrors = {};
  state.selected = null; state.patient = null; state.patients = [];
  state.loading = true;
  state.alerts = []; state.familyAlerts = {}; state.page = 'care'; state.tab = 'visits';
  alertChanges.clear();
  try { state.familyAlerts = JSON.parse(sessionStorage.getItem(`bedside-alerts-${user.id}`) || '{}'); } catch { /* Optional persistence. */ }
  history.replaceState(null, '', '/');
  renderShell();
  closeStream?.();
  closeStream = api.subscribe(handleEvent, connected => {
    const reconnect = connected && !state.connected;
    state.connected = connected;
    renderConnection();
    if (reconnect) loadPatients();
  });
  await loadPatients();
}
function saveFamilyAlerts() {
  try { sessionStorage.setItem(`bedside-alerts-${state.user.id}`, JSON.stringify(state.familyAlerts)); } catch { /* Optional persistence. */ }
}
async function handleEvent(type, payload) {
  if (!state.user) return;
  const item = payload[type] || payload;
  const patientId = payload.patientId ?? patientIdOf(item);
  if (type === 'alert') {
    rememberAlert({ ...item, patientId });
    if (family()) {
      const previous = state.familyAlerts[patientId];
      if (!previous || sameId(previous.id, item.id) || dateOf(item) >= dateOf(previous)) {
        state.familyAlerts[patientId] = { ...previous, ...item };
        saveFamilyAlerts();
      }
      announce(`Emergency alert update for ${patientName(patientId)}: ${item.status || 'sent'}.`);
    } else {
      const index = state.alerts.findIndex(alert => sameId(alert.id, item.id));
      if (item.status === 'resolved') state.alerts = state.alerts.filter(alert => !sameId(alert.id, item.id));
      else if (index >= 0) state.alerts[index] = { ...state.alerts[index], ...item, patientId };
      else state.alerts.push({ ...item, patientId });
      announce(`Emergency alert for ${patientName(patientId)}: ${item.status || 'sent'}.`);
      showUrgent();
    }
    renderMain(true);
  } else {
    announce(`${type === 'message' ? 'New message' : type === 'visit' ? 'New care update' : 'Visit request updated'} for ${patientName(patientId)}.`);
    if (sameId(patientId, state.selected)) await loadPatient(state.selected, true);
  }
}
function rememberAlert(alert) {
  alertChanges.set(String(alert.id), { revision: ++alertRevision, alert });
}

function openDialog(html) {
  if (!dialog.open) {
    const origin = document.activeElement;
    dialogReturnFocus = { id: origin.id, action: origin.dataset.action, item: origin.dataset.id };
  }
  dialog.innerHTML = html;
  if (!dialog.open) dialog.showModal();
}
const dialogHeader = (title, subtitle = '') => `<div class="dialog-header"><h2 id="dialog-title">${title}</h2><button class="icon-button" data-action="close-dialog" aria-label="Close dialog">×</button></div>${subtitle ? `<p class="muted">${subtitle}</p>` : ''}`;
function requestVisit() {
  openDialog(`${dialogHeader('A little time together.', 'Request a time that works for you. The care team will confirm availability.')}
    <form id="appointment-form"><fieldset><legend>How would you like to visit?</legend><div class="radio-options"><label><input type="radio" name="type" value="video" checked> Video call</label><label><input type="radio" name="type" value="in-person"> In person</label></div></fieldset>
      <label for="requested-at">Preferred date and time</label><input id="requested-at" name="requestedAt" type="datetime-local" required min="${localDateTime(new Date())}"><small>Times are shown in your local time zone.</small>
      <label for="appointment-note">Anything the team should know? <span class="muted">(optional)</span></label><textarea id="appointment-note" name="note" rows="3" maxlength="2000"></textarea><p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Request visit</button></div></form>`);
  dialog.dataset.patientId = state.selected;
}
function localDateTime(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function cancelHold() {
  clearTimeout(holdTimer);
  holdTimer = null;
  if (holdButton) {
    holdButton.classList.remove('holding');
    holdButton.querySelector('span').textContent = 'Send emergency alert';
  }
  holdButton = null;
}
function startHold(button) {
  if (holdTimer || dialog.open || !family() || sendingAlert) return;
  holdButton = button;
  holdStarted = performance.now();
  button.classList.add('holding');
  button.querySelector('span').textContent = 'Keep holding…';
  const completeHold = () => {
    const remaining = 1500 - (performance.now() - holdStarted);
    if (remaining > 0) { holdTimer = setTimeout(completeHold, remaining); return; }
    cancelHold();
    pendingAlert = { patientId: state.selected, patientName: state.patient.name };
    openDialog(`${dialogHeader('What’s concerning you?', `Choose a reason for notifying ${e(pendingAlert.patientName)}’s care team.`)}
      <form id="alert-reason-form"><label for="alert-reason">Reason for the alert</label><select id="alert-reason" name="reason" required><option value="">Choose a reason</option><option>Sudden change in condition</option><option>Breathing concern</option><option>Pain or discomfort</option><option>Need urgent help from the care team</option><option>Other urgent concern</option></select><label for="alert-details">More detail <span class="muted">(optional)</span></label><textarea id="alert-details" name="details" rows="3" maxlength="1000"></textarea><p class="emergency-note">Demo only. For a real emergency, contact hospital staff or local emergency services directly.</p><div class="dialog-actions"><button class="button secondary" type="button" data-action="close-dialog">Cancel</button><button class="button danger" type="submit">Review alert</button></div></form>`);
    announce('Hold complete. Choose an emergency alert reason.');
  };
  holdTimer = setTimeout(completeHold, 1500);
}

function showUrgent() {
  if (!state.user || family()) return;
  const alert = [...state.alerts].filter(isWaiting).sort((a, b) => new Date(dateOf(a)) - new Date(dateOf(b)))[0];
  if (!alert) { urgentDialog.close(); urgentDialog.innerHTML = ''; return; }
  if (urgentDialog.open && sameId(urgentDialog.dataset.alertId, alert.id)) return;
  if (dialog.open) dialog.close();
  urgentDialog.dataset.alertId = alert.id;
  urgentDialog.innerHTML = `<div class="urgent-symbol">${icon('cross')}</div><p class="small-label">Family emergency alert</p><h2 id="urgent-title">${e(patientName(patientIdOf(alert)))}</h2><p id="urgent-description" class="urgent-reason">${e(alert.reason)}</p><div class="waiting-clock"><span>Waiting for acknowledgement</span><strong data-waiting-since="${e(dateOf(alert) || new Date().toISOString())}">0:00</strong></div><p class="muted">Acknowledge this alert to let the family know the care team is aware.</p><p class="form-error" role="alert"></p><button class="button danger full" data-action="acknowledge" data-id="${e(alert.id)}">Acknowledge alert</button><small class="urgent-footnote">Acknowledging does not mark the alert as resolved.</small>`;
  if (!urgentDialog.open) urgentDialog.showModal();
  urgentDialog.querySelector('button').focus();
  restoreBusyActions();
  updateTimers();
}
function updateTimers() {
  document.querySelectorAll('[data-waiting-since]').forEach(el => {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(el.dataset.waitingSince).getTime()) / 1000)) || 0;
    el.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });
}
setInterval(updateTimers, 1000);
urgentDialog.addEventListener('cancel', event => event.preventDefault());
dialog.addEventListener('close', () => {
  pendingAlert = null;
  if (!urgentDialog.open && !dialog.open && dialogReturnFocus) {
    const target = dialogReturnFocus.id ? document.getElementById(dialogReturnFocus.id) :
      [...root.querySelectorAll('[data-action]')].find(el => el.dataset.action === dialogReturnFocus.action && el.dataset.id === dialogReturnFocus.item);
    target?.focus({ preventScroll: true });
  }
  dialogReturnFocus = null;
});

async function withForm(form, action) {
  const button = form.querySelector('[type="submit"]');
  const key = `${form.id}:${state.selected}`;
  if (button.disabled || pendingForms.has(key)) return;
  pendingForms.add(key);
  const error = form.querySelector('.form-error');
  if (error) error.textContent = '';
  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  try { await action(); } catch (err) {
    if (error && error.isConnected) error.textContent = err.message;
    else toast(err.message, true);
  } finally {
    pendingForms.delete(key);
    button.disabled = false;
    form.removeAttribute('aria-busy');
    const current = document.getElementById(form.id);
    if (current && `${form.id}:${state.selected}` === key) {
      current.querySelector('[type="submit"]').disabled = false;
      current.removeAttribute('aria-busy');
    }
  }
}

root.addEventListener('submit', async event => {
  const form = event.target;
  event.preventDefault();
  const data = new FormData(form);
  const patientId = state.selected;
  await withForm(form, async () => {
    if (form.id === 'login-form') {
      if (authBusy) return;
      authBusy = true;
      try { await startSession(unwrap(await api.login(data.get('email').trim(), data.get('password')), 'user')); }
      finally { authBusy = false; }
    } else if (form.id === 'message-form') {
      const body = data.get('body').trim();
      if (!body) throw new Error('Write a message before sending.');
      await api.sendMessage(patientId, body);
      form.reset();
      const current = sameId(patientId, state.selected) && document.getElementById('message-body');
      if (current?.value.trim() === body) current.value = '';
      toast('Message sent.');
      if (sameId(patientId, state.selected)) await loadPatient(patientId, true);
    } else if (form.id === 'summary-form') {
      const summary = data.get('summary').trim();
      if (!summary) throw new Error('Write a care update before publishing.');
      await api.addVisit(patientId, summary);
      form.reset();
      const current = sameId(patientId, state.selected) && document.getElementById('summary');
      if (current?.value.trim() === summary) current.value = '';
      toast('Care update shared with the family.');
      if (sameId(patientId, state.selected)) await loadPatient(patientId, true);
    }
  });
});

dialog.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  if (form.id === 'alert-reason-form') {
    if (!pendingAlert) return;
    pendingAlert.reason = `${data.get('reason')}${data.get('details').trim() ? `: ${data.get('details').trim()}` : ''}`;
    openDialog(`${dialogHeader('Send this emergency alert?')}<p>The care team for <strong>${e(pendingAlert.patientName)}</strong> will be notified.</p><blockquote>${e(pendingAlert.reason)}</blockquote><p class="form-error" role="alert"></p><div class="dialog-actions"><button class="button secondary" data-action="close-dialog">Cancel</button><button class="button danger" data-action="send-alert">Confirm & send alert</button></div>`);
    dialog.querySelector('[data-action="send-alert"]').focus();
    return;
  }
  await withForm(form, async () => {
    if (form.id === 'appointment-form') {
      const requested = new Date(data.get('requestedAt'));
      if (!Number.isFinite(requested.getTime()) || requested <= new Date()) throw new Error('Choose a date and time in the future.');
      const patientId = dialog.dataset.patientId;
      await api.requestAppointment(patientId, { type: data.get('type'), requestedAt: requested.toISOString(), note: data.get('note').trim() });
      dialog.close();
      toast('Visit requested. The care team will confirm a time.');
      if (sameId(patientId, state.selected)) await loadPatient(patientId, true);
    } else if (form.id === 'confirm-appointment-form') {
      const scheduled = new Date(data.get('scheduledAt'));
      if (!Number.isFinite(scheduled.getTime()) || scheduled <= new Date()) throw new Error('Choose a date and time in the future.');
      await api.updateAppointment(form.dataset.id, { status: 'confirmed', scheduledAt: scheduled.toISOString() });
      dialog.close();
      toast('Visit confirmed.');
      await loadPatient(state.selected, true);
    }
  });
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'theme') {
    theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    storage.set('bedside-theme', theme); applyTheme(); return;
  }
  if (action === 'hold') { event.preventDefault(); return; }
  if (action === 'close-dialog') { if (!sendingAlert) dialog.close(); return; }
  if (action === 'page' || action === 'library') {
    event.preventDefault(); state.page = button.dataset.page || 'education'; renderMain(); document.querySelector('#main').focus(); return;
  }
  if (action === 'tab') { state.tab = button.dataset.tab; renderMain(); document.querySelector(`#tab-${state.tab}`).focus(); return; }
  if (action === 'request-visit') { requestVisit(); return; }
  if (action === 'patient') { await loadPatient(button.dataset.id); return; }
  if (action === 'confirm-appointment') {
    const appointment = state.appointments.find(item => sameId(item.id, button.dataset.id));
    const requested = new Date(appointment.requestedAt);
    openDialog(`${dialogHeader('Confirm a visit')}<form id="confirm-appointment-form" data-id="${e(appointment.id)}"><label for="scheduled-at">Confirmed date and time</label><input type="datetime-local" id="scheduled-at" name="scheduledAt" required min="${localDateTime(new Date())}" value="${Number.isFinite(requested.getTime()) ? localDateTime(requested) : ''}"><small>Times are shown in your local time zone.</small><p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">Confirm visit</button></div></form>`);
    return;
  }
  const actionKey = `${action}:${button.dataset.id || ''}`;
  if (pendingActions.has(actionKey) || (action === 'demo' && authBusy)) return;
  pendingActions.add(actionKey);
  button.disabled = true;
  try {
    if (action === 'demo') {
      authBusy = true;
      root.querySelectorAll('[data-action="demo"], #login-form button').forEach(el => { el.disabled = true; });
      await startSession(unwrap(await api.login(`${button.dataset.role}@demo.test`, 'demo-password'), 'user'));
    } else if (action === 'logout') {
      await api.logout(); endSession();
    } else if (action === 'refresh') {
      await loadPatients();
    } else if (action === 'send-alert' && pendingAlert && !sendingAlert) {
      sendingAlert = true;
      const pending = { ...pendingAlert };
      dialog.querySelectorAll('[data-action="close-dialog"]').forEach(el => { el.disabled = true; });
      const alert = unwrap(await api.sendAlert(pending.patientId, pending.reason), 'alert');
      // An SSE acknowledgement can arrive before the POST response.
      const live = state.familyAlerts[pending.patientId];
      state.familyAlerts[pending.patientId] = live && sameId(live.id, alert.id) ? { ...alert, ...live } : { ...alert, reason: pending.reason };
      rememberAlert({ ...state.familyAlerts[pending.patientId], patientId: pending.patientId });
      saveFamilyAlerts();
      dialog.close(); renderMain(true); toast('Emergency alert sent to the care team.');
    } else if (action === 'acknowledge' || action === 'resolve') {
      const alert = state.alerts.find(item => sameId(item.id, button.dataset.id));
      const result = unwrap(await api.updateAlert(button.dataset.id, action === 'acknowledge' ? 'acknowledged' : 'resolved'), 'alert');
      rememberAlert({ ...alert, ...result, id: button.dataset.id, status: action === 'acknowledge' ? 'acknowledged' : 'resolved' });
      if (action === 'resolve') state.alerts = state.alerts.filter(item => !sameId(item.id, button.dataset.id));
      else state.alerts = state.alerts.map(item => sameId(item.id, button.dataset.id) ? { ...item, ...result, status: 'acknowledged' } : item);
      showUrgent(); renderMain(true);
      toast(action === 'acknowledge' ? 'Alert acknowledged. The family has been notified.' : 'Alert resolved.');
      if (alert && !sameId(patientIdOf(alert), state.selected)) await loadPatient(patientIdOf(alert));
    } else if (action === 'decline-appointment') {
      await api.updateAppointment(button.dataset.id, { status: 'declined' });
      toast('Visit request declined. The family has been notified.');
      await loadPatient(state.selected, true);
    }
  } catch (error) {
    const errorEl = urgentDialog.open ? urgentDialog.querySelector('.form-error') : dialog.open ? dialog.querySelector('.form-error') : document.querySelector('#login-error');
    if (errorEl) errorEl.textContent = error.message;
    else toast(error.message, true);
  } finally {
    if (action === 'demo') authBusy = false;
    pendingActions.delete(actionKey);
    restoreBusyActions();
    sendingAlert = false;
    button.disabled = false;
    root.querySelectorAll('[data-action="demo"], #login-form button').forEach(el => { el.disabled = false; });
    dialog.querySelectorAll('[data-action="close-dialog"]').forEach(el => { el.disabled = false; });
  }
});
document.addEventListener('change', event => {
  if (event.target.id === 'patient-picker') loadPatient(event.target.value);
});
document.addEventListener('pointerdown', event => {
  const button = event.target.closest('#emergency-hold');
  if (button && event.button === 0 && event.isPrimary) {
    event.preventDefault(); button.focus(); startHold(button);
  }
});
document.addEventListener('pointerup', cancelHold);
document.addEventListener('pointercancel', cancelHold);
document.addEventListener('pointerout', event => {
  if (holdButton && !holdButton.contains(event.relatedTarget)) cancelHold();
});
document.addEventListener('keydown', event => {
  if (event.target.id === 'emergency-hold' && [' ', 'Enter'].includes(event.key)) {
    event.preventDefault(); if (!event.repeat) startHold(event.target);
  }
  if (event.key === 'Escape') cancelHold();
  if (event.target.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const keys = ['visits', 'messages', 'appointments'];
    let next = keys.indexOf(state.tab) + (event.key === 'ArrowRight' ? 1 : -1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = 2;
    state.tab = keys[(next + keys.length) % keys.length];
    renderMain(); document.querySelector(`#tab-${state.tab}`).focus();
  }
});
document.addEventListener('keyup', event => {
  if ([' ', 'Enter'].includes(event.key)) cancelHold();
});
document.addEventListener('focusout', event => { if (event.target === holdButton) cancelHold(); });
window.addEventListener('blur', cancelHold);
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelHold(); });
dialog.addEventListener('cancel', event => { if (sendingAlert) event.preventDefault(); });
function endSession(message = '') {
  sessionVersion++; loadVersion++; refreshVersion++;
  closeStream?.(); closeStream = null;
  state.user = null; state.connected = false; state.familyAlerts = {}; state.alerts = [];
  dialog.close(); urgentDialog.close();
  history.replaceState(null, '', '/login/');
  renderLogin(message);
}
window.addEventListener('bedside:session-expired', () => {
  if (state.user) endSession('Your session has ended. Sign in again to continue.');
});
try {
  const result = await api.me();
  if (result?.user) await startSession(result.user);
  else renderLogin();
} catch (error) {
  renderLogin(error.status === 401 ? '' : error.message);
}
