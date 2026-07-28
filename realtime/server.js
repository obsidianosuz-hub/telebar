require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure CORS for local development ports
const io = new Server(server, {
  cors: {
    origin: '*', // Allows cashier POS and admin dashboard to connect from any local address
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Express REST endpoint for Laravel webhook triggers
app.post('/api/telemetry', (req, res) => {
  const { event, data } = req.body;

  if (!event || !data) {
    return res.status(400).json({ error: 'Sarlavha yoki ma\'lumotlar to\'liq emas (event and data are required)' });
  }

  console.log(`[Telemetry Event] Broadcasted: "${event}"`, data);

  // Broadcast the telemetry packet to all connected sockets (cashiers, admins)
  io.emit(event, data);

  // Also broadcast a generic metrics refresh message to keep dashboards synchronized
  io.emit('telemetry:refresh', {
    triggeredBy: event,
    timestamp: new Date().toISOString()
  });

  return res.status(200).json({ success: true, message: 'Telemetry packet streamed successfully' });
});

// Socket.io connection pipeline
io.on('connection', (socket) => {
  console.log(`[Socket Connected] Socket Client ID: ${socket.id}`);

  // Emit initial welcome handshake
  socket.emit('handshake', {
    status: 'connected',
    message: 'Telebar real-time telemetry pipeline established'
  });

  // Telemetry custom ping check
  socket.on('telemetry:ping', (data) => {
    console.log(`[Ping] Received from Client ID: ${socket.id}`, data);
    socket.emit('telemetry:pong', { timestamp: new Date().toISOString() });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] Client ID: ${socket.id}`);
  });
});

// Port configuration
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  Telebar Real-Time Telemetry running on port ${PORT}`);
  console.log(`  Express HTTP endpoint: http://localhost:${PORT}/api/telemetry`);
  console.log(`  Socket.io path: ws://localhost:${PORT}`);
  console.log(`==================================================`);
});
