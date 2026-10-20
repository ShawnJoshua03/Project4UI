// scripts/appointments.js

document.addEventListener('DOMContentLoaded', () => {
    const appointmentsTable = document.querySelector('#appointments-table tbody');
    const requestBtn = document.getElementById('request-appointment');
    const modalOverlay = document.getElementById('appointment-modal');
    const cancelAppointmentBtn = document.getElementById('cancel-appointment');
    const appointmentForm = document.getElementById('appointment-form');
  
    // Mock data for existing appointments
    const appointments = [
      { date: '2024-01-10', time: '10:00 AM', doctor: 'Dr. Smith', specialization: 'Cardiology' },
      { date: '2024-01-15', time: '2:00 PM', doctor: 'Dr. Johnson', specialization: 'Orthopedics' }
    ];
  
    // Function to render appointments
    function renderAppointments() {
      appointmentsTable.innerHTML = '';
      appointments.forEach(app => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${app.date}</td>
          <td>${app.time}</td>
          <td>${app.doctor}</td>
          <td>${app.specialization || 'General'}</td>
        `;
        appointmentsTable.appendChild(row);
      });
    }
  
    // Initially render existing appointments
    renderAppointments();
  
    // Show the modal when request button is clicked
    requestBtn.addEventListener('click', () => {
      modalOverlay.classList.add('active');
    });
  
    // Close the modal on cancel
    cancelAppointmentBtn.addEventListener('click', () => {
      modalOverlay.classList.remove('active');
      appointmentForm.reset();
    });
  
    // Form submission - add appointment to the list
    appointmentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const date = document.getElementById('appointment-date').value;
      const time = document.getElementById('appointment-time').value;
      const doctor = document.getElementById('appointment-doctor').value;
      const reason = document.getElementById('appointment-reason').value;
  
      // In a real app, you'd send this data to the server.
      // Here, we just add it to the local list as a "requested" appointment.
      appointments.push({
        date,
        time,
        doctor,
        specialization: 'N/A (Requested)' // Indicate this is requested
      });
  
      // Re-render appointments and close the modal
      renderAppointments();
      modalOverlay.classList.remove('active');
      appointmentForm.reset();
  
      alert('Your appointment request has been submitted.');
    });
  });
  