// auth.js
// Updated to accept any login credentials and redirect based on basic conditions.
// This is for demonstration purposes only. In a real system, you would implement secure, server-side checks.

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

// On login submission, just log in regardless of input:
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  // For demonstration, we accept anything. Let's assume:
  // If the email contains "doctor" or ends with "@hospital.com", redirect to the doctor dashboard.
  // Otherwise, redirect to the family member dashboard.
  if (email.toLowerCase().includes('doctor') || email.toLowerCase().endsWith('@hospital.com')) {
    window.location.href = 'doctor-dashboard.html';
  } else {
    window.location.href = 'dashboard.html';
  }
});

// On signup, just show an alert and instruct the user to login:
signupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  alert('Sign Up Successful (mock)! Please go to the login form and sign in using your new credentials.');
});
