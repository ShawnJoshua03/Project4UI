 // doctorLog.js
// Mock data simulating doctor’s visits
const visitNotifications = document.getElementById('visit-notifications');
const visits = [
  { time: 'Today 9:00 AM', summary: 'Doctor performed a routine check, patient stable.' },
  { time: 'Yesterday 3:00 PM', summary: 'Discussed changing medication schedule.' }
];

visits.forEach(v => {
  const div = document.createElement('div');
  div.classList.add('visit-entry');
  div.innerHTML = `<h3>${v.time}</h3><p>${v.summary}</p>`;
  visitNotifications.appendChild(div);
});

