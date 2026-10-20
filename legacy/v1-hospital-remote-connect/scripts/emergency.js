// scripts/emergency.js

document.addEventListener('DOMContentLoaded', () => {
    const emergencyAlertButton = document.getElementById('emergency-alert');
  
    // Handle emergency alert
    emergencyAlertButton.addEventListener('click', () => {
      alert('Emergency alert sent to hospital staff!');
      console.log('Emergency alert triggered at:', new Date().toLocaleString());
  
      // Example: send alert to backend
      // fetch('/api/emergency-alerts', { method: 'POST', body: JSON.stringify({ alert: 'Emergency' }) })
      //   .then(response => response.json())
      //   .then(data => console.log(data))
      //   .catch(error => console.error('Error:', error));
    });
  });
  