 // server.js
// A simple Express server serving static files and simulating an API.

const express = require('express');
const app = express();
const path = require('path');

app.use(express.static(path.join(__dirname, '/')));

// Mock API endpoints (for demonstration only)
app.get('/api/patient-info', (req, res) => {
  res.json({name: 'John Doe', condition: 'Stable'});
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});

