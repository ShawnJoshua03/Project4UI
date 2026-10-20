// main.js
// Handles shared functionality: accessibility, dark mode toggle, notifications, patient lists for doctors.

const accessibilityBtn = document.getElementById('accessibility-btn');
if (accessibilityBtn) {
  accessibilityBtn.addEventListener('click', () => {
    document.body.classList.toggle('high-contrast');
  });
}

// Dark mode toggle
const darkModeToggle = document.getElementById('dark-mode-toggle');
if (darkModeToggle) {
  darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
  });
}

// Notifications mock data
const notificationList = document.getElementById('notification-list');
const notificationBtn = document.getElementById('notification-btn');
const notificationDropdown = document.getElementById('notification-dropdown');
if (notificationList && notificationBtn && notificationDropdown) {
  const notifications = [
    'Doctor visited patient at 2:00 PM',
    'New lab results added at 3:30 PM',
    'Medication schedule updated'
  ];

  notifications.forEach(n => {
    const li = document.createElement('li');
    li.textContent = n;
    notificationList.appendChild(li);
  });

  let notifOpen = false;
  notificationBtn.addEventListener('click', () => {
    notifOpen = !notifOpen;
    notificationDropdown.style.display = notifOpen ? 'block' : 'none';
  });

  document.addEventListener('click', (e) => {
    if (!notificationDropdown.contains(e.target) && e.target !== notificationBtn) {
      notificationDropdown.style.display = 'none';
      notifOpen = false;
    }
  });
}

// If on doctor-dashboard.html, populate patients
const doctorPatientTable = document.getElementById('doctor-patient-table');
if (doctorPatientTable) {
  const mockPatients = [
    { name: 'John Doe', condition: 'Stable', lastCheck: '1 hour ago' },
    { name: 'Jane Smith', condition: 'Under observation', lastCheck: '30 mins ago' }
  ];

  mockPatients.forEach(p => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${p.name}</td>
      <td>${p.condition}</td>
      <td>${p.lastCheck}</td>
      <td><button class="btn-update">Update Notes</button></td>
    `;
    doctorPatientTable.appendChild(row);
  });
}
