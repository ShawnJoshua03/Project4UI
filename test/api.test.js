import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { api, login, startServer, openStream } from './helpers.js';

let server;
let familyCookie;
let clinicianCookie;
let patientId;
let otherPatientId;

before(async () => {
  server = await startServer();
  const family = await login(server.baseUrl, 'family@demo.test');
  const clinician = await login(server.baseUrl, 'clinician@demo.test');
  assert.equal(family.response.status, 200, 'demo family account can sign in');
  assert.equal(clinician.response.status, 200, 'demo clinician account can sign in');
  familyCookie = family.cookie;
  clinicianCookie = clinician.cookie;
  const list = await api(server.baseUrl, familyCookie, '/api/patients');
  assert.equal(list.status, 200);
  const patients = await list.json();
  assert.ok(patients.length > 0, 'demo family is linked to a patient');
  patientId = patients[0].id;
  const clinicianList = await api(server.baseUrl, clinicianCookie, '/api/patients');
  assert.equal(clinicianList.status, 200);
  const clinicianPatients = await clinicianList.json();
  otherPatientId = clinicianPatients.find(patient => patient.id !== patientId)?.id;
  assert.ok(otherPatientId, 'seed includes a second patient not linked to the family account');
});

after(() => server?.stop());

test('unauthenticated requests are denied', async () => {
  const response = await api(server.baseUrl, null, '/api/patients');
  assert.equal(response.status, 401);
});

test('family sees only their linked patient', async () => {
  const response = await api(server.baseUrl, familyCookie, '/api/patients');
  assert.equal(response.status, 200);
  const patients = await response.json();
  assert.ok(patients.some(patient => patient.id === patientId));
  assert.equal(patients.length, 1);
});

test('family cannot access another patient by guessing an id', async () => {
  for (const path of [
    `/api/patients/${otherPatientId}`,
    `/api/patients/${otherPatientId}/visits`,
    `/api/patients/${otherPatientId}/appointments`,
    `/api/patients/${otherPatientId}/messages`,
    `/api/patients/${otherPatientId}/alerts`,
  ]) {
    const response = await api(server.baseUrl, familyCookie, path);
    assert.ok(response.status === 403 || response.status === 404,
      `${path} should hide or deny an unlinked patient (got ${response.status})`);
  }
});

test('emergency lifecycle is persisted and broadcast to both roles', async t => {
  const familyStream = await openStream(server.baseUrl, familyCookie);
  const clinicianStream = await openStream(server.baseUrl, clinicianCookie);
  t.after(() => { familyStream.close(); clinicianStream.close(); });
  const sent = await api(server.baseUrl, familyCookie, `/api/patients/${patientId}/alerts`, {
    method: 'POST', body: { reason: 'Please check on Sam' },
  });
  assert.equal(sent.status, 201);
  let { alert } = await sent.json();
  assert.equal(alert.status, 'sent');
  assert.ok(alert.createdBy);
  for (const stream of [familyStream, clinicianStream]) {
    const event = await stream.next();
    assert.equal(event.type, 'alert');
    assert.equal(event.data.alert.id, alert.id);
  }
  const premature = await api(server.baseUrl, clinicianCookie, `/api/alerts/${alert.id}`, {
    method: 'PATCH', body: { status: 'resolved' },
  });
  assert.equal(premature.status, 409);
  for (const status of ['acknowledged', 'resolved']) {
    const updated = await api(server.baseUrl, clinicianCookie, `/api/alerts/${alert.id}`, {
      method: 'PATCH', body: { status },
    });
    assert.equal(updated.status, 200);
    ({ alert } = await updated.json());
    assert.equal(alert.status, status);
    assert.ok(alert.acknowledgedAt);
    if (status === 'resolved') assert.ok(alert.resolvedAt);
    for (const stream of [familyStream, clinicianStream]) {
      assert.equal((await stream.next()).data.alert.status, status);
    }
  }
  const history = await api(server.baseUrl, familyCookie, `/api/patients/${patientId}/alerts`);
  assert.equal((await history.json()).alerts[0].status, 'resolved');
  const queue = await api(server.baseUrl, clinicianCookie, '/api/alerts');
  assert.ok(!(await queue.json()).alerts.some(item => item.id === alert.id));
});

test('alert routes enforce roles, patient access and input validation', async () => {
  for (const [cookie, path, method, body, expected] of [
    [familyCookie, '/api/alerts', 'GET', undefined, 403],
    [familyCookie, '/api/alerts/1', 'PATCH', { status: 'acknowledged' }, 403],
    [clinicianCookie, `/api/patients/${patientId}/alerts`, 'POST', { reason: 'test' }, 403],
    [familyCookie, `/api/patients/${otherPatientId}/alerts`, 'POST', { reason: 'test' }, 404],
    [familyCookie, `/api/patients/${patientId}/alerts`, 'POST', { reason: '  ' }, 400],
    [familyCookie, `/api/patients/${patientId}/alerts`, 'POST', { reason: 'x'.repeat(2001) }, 400],
    [clinicianCookie, '/api/alerts/99999', 'PATCH', { status: 'acknowledged' }, 404],
    [clinicianCookie, '/api/alerts/1e0', 'PATCH', { status: 'acknowledged' }, 404],
    [clinicianCookie, '/api/alerts/1', 'PATCH', { status: 'invalid' }, 400],
  ]) {
    const response = await api(server.baseUrl, cookie, path, { method, body });
    assert.equal(response.status, expected, `${method} ${path}`);
  }
});

test('SSE filters another patient while delivering linked patient updates', async t => {
  const stream = await openStream(server.baseUrl, familyCookie);
  t.after(stream.close);
  for (const id of [otherPatientId, patientId]) {
    const response = await api(server.baseUrl, clinicianCookie, `/api/patients/${id}/visits`, {
      method: 'POST', body: { summary: `Update for patient ${id}` },
    });
    assert.equal(response.status, 201);
  }
  const event = await stream.next();
  assert.equal(event.type, 'visit');
  assert.equal(event.data.patientId, patientId);
});

test('appointments support request, confirmation and decline with role restrictions', async () => {
  const requestedAt = new Date(Date.now() + 86400000).toISOString();
  const response = await api(server.baseUrl, familyCookie, `/api/patients/${patientId}/appointments`, {
    method: 'POST', body: { type: 'video', requestedAt, note: 'Afternoon please' },
  });
  assert.equal(response.status, 201);
  const appointment = await response.json();
  assert.equal(appointment.status, 'requested');
  const denied = await api(server.baseUrl, familyCookie, `/api/appointments/${appointment.id}`, {
    method: 'PATCH', body: { status: 'confirmed' },
  });
  assert.equal(denied.status, 403);
  const confirmed = await api(server.baseUrl, clinicianCookie, `/api/appointments/${appointment.id}`, {
    method: 'PATCH', body: { status: 'confirmed', scheduledAt: requestedAt },
  });
  assert.equal((await confirmed.json()).scheduledAt, requestedAt);
  const declined = await api(server.baseUrl, clinicianCookie, `/api/appointments/${appointment.id}`, {
    method: 'PATCH', body: { status: 'declined' },
  });
  assert.equal((await declined.json()).scheduledAt, null);
});

test('invalid message/date input and family-authored care updates are rejected', async () => {
  for (const [path, body, expected] of [
    ['messages', { body: 'x'.repeat(2001) }, 400],
    ['messages', { body: ' ' }, 400],
    ['appointments', { type: 'video', requestedAt: '2026-02-30T12:00:00Z' }, 400],
    ['visits', { summary: 'Not a clinician' }, 403],
  ]) {
    const response = await api(server.baseUrl, familyCookie, `/api/patients/${patientId}/${path}`, {
      method: 'POST', body,
    });
    assert.equal(response.status, expected);
  }
});

test('static UI is served with CSP and demo-data disclaimer', async () => {
  const response = await fetch(server.baseUrl);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await response.text(), /Bedside/);
  const script = await fetch(`${server.baseUrl}/app/main.js`);
  assert.match(await script.text(), /Demo data only/);
});

test('logout revokes the session and stops its existing SSE stream', async t => {
  const session = await login(server.baseUrl, 'family@demo.test');
  assert.equal(session.response.status, 200);
  const cookieHeader = session.response.headers.get('set-cookie');
  assert.match(cookieHeader, /HttpOnly/i);
  assert.match(cookieHeader, /SameSite=Lax/i);
  const stream = await openStream(server.baseUrl, session.cookie);
  t.after(stream.close);
  await api(server.baseUrl, session.cookie, '/api/auth/logout', { method: 'POST' });
  const me = await api(server.baseUrl, session.cookie, '/api/me');
  assert.equal(me.status, 401);
  await api(server.baseUrl, clinicianCookie, `/api/patients/${patientId}/messages`, {
    method: 'POST', body: { body: 'Must not reach logged-out client' },
  });
  assert.equal(await stream.next(), null);
});

test('login rejects incorrect passwords and throttles repeated attempts', async t => {
  const isolated = await startServer();
  t.after(isolated.stop);
  for (let count = 0; count < 5; count++) {
    const result = await login(isolated.baseUrl, 'family@demo.test', 'wrong');
    assert.equal(result.response.status, 401);
  }
  const limited = await login(isolated.baseUrl, 'family@demo.test');
  assert.equal(limited.response.status, 429);
  assert.ok(Number(limited.response.headers.get('retry-after')) > 0);
});

test('non-GET requests require the CSRF header', async () => {
  const response = await fetch(`${server.baseUrl}/api/patients/${patientId}/messages`, {
    method: 'POST', headers: { cookie: familyCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ body: 'Missing CSRF header' }),
  });
  assert.equal(response.status, 403);
});

test('family can send a message and clinician can read it', async () => {
  const body = `Smoke message ${Date.now()}`;
  const sent = await api(server.baseUrl, familyCookie, `/api/patients/${patientId}/messages`, {
    method: 'POST', body: { body },
  });
  assert.ok([200, 201].includes(sent.status));
  const messages = await api(server.baseUrl, clinicianCookie, `/api/patients/${patientId}/messages`);
  assert.equal(messages.status, 200);
  assert.ok((await messages.json()).some(message => message.body === body));
});
