import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { api, login, startServer } from './helpers.js';

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
  ]) {
    const response = await api(server.baseUrl, familyCookie, path);
    assert.ok(response.status === 403 || response.status === 404,
      `${path} should hide or deny an unlinked patient (got ${response.status})`);
  }
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
