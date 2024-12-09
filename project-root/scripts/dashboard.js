// dashboard.js
// Dashboard logic for family members: activities, messaging simulation, chat panel toggling.

const activityList = document.getElementById('activity-list');
const activities = [
  { time: '10:00 AM', detail: 'Vitals Check: All normal' },
  { time: '11:30 AM', detail: 'Blood Test Results: Pending' },
  { time: '1:00 PM', detail: 'Lunch delivered' }
];

activities.forEach(act => {
  const li = document.createElement('li');
  li.textContent = `${act.time}: ${act.detail}`;
  activityList.appendChild(li);
});

// Messaging simulation
const messageList = document.getElementById('message-list');
const messageInput = document.getElementById('message-input');
document.getElementById('send-message').addEventListener('click', () => {
  const msg = messageInput.value.trim();
  if (msg) {
    const div = document.createElement('div');
    div.classList.add('message');
    div.textContent = 'You: ' + msg;
    messageList.appendChild(div);
    messageInput.value = '';
    // Simulate doctor response
    setTimeout(() => {
      const reply = document.createElement('div');
      reply.classList.add('message', 'doctor-msg');
      reply.textContent = 'Doctor: Received your message. Will update soon.';
      messageList.appendChild(reply);
    }, 2000);
  }
});

// Start Video Call (mock)
document.getElementById('start-video-call').addEventListener('click', () => {
  alert('Starting video call (mock)...');
});

// Chat panel logic
const toggleChatPanelBtn = document.getElementById('toggle-chat-panel');
const chatPanel = document.getElementById('chat-panel');
const closeChatPanel = document.getElementById('close-chat-panel');
const chatPanelInput = document.getElementById('chat-panel-input');
const chatPanelMessages = document.getElementById('chat-panel-messages');
const chatPanelSend = document.getElementById('chat-panel-send');

toggleChatPanelBtn.addEventListener('click', () => {
  chatPanel.classList.add('open');
});

closeChatPanel.addEventListener('click', () => {
  chatPanel.classList.remove('open');
});

chatPanelSend.addEventListener('click', () => {
  const msg = chatPanelInput.value.trim();
  if (msg) {
    const p = document.createElement('p');
    p.innerHTML = `<strong>You:</strong> ${msg}`;
    chatPanelMessages.appendChild(p);
    chatPanelInput.value = '';
  }
});
