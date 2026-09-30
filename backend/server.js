const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Static Folder for Uploads ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
app.use('/uploads', express.static(uploadDir));

// --- Multer Storage Configuration ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let users = []; 
let rooms = []; 

// --- REST API Endpoints ---
app.post('/api/register', (req, res) => {
  const { fullName, email, password } = req.body;
  if (!fullName || !email || !password) {
    return res.json({ success: false, message: 'All fields are required!' });
  }
  
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.json({ success: false, message: 'Email is already registered!' });
  }
  
  users.push({ fullName, email, password });
  return res.json({ success: true });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.json({ success: false, message: 'Invalid email or password!' });
  }
  return res.json({ success: true, username: user.fullName });
});

app.get('/api/rooms', (req, res) => {
  return res.json({ success: true, rooms });
});

app.post('/api/create-room', (req, res) => {
  const { roomName, username } = req.body;
  if (!roomName || !username) {
    return res.json({ success: false, message: 'Room name and username are required!' });
  }

  const roomId = 'room_' + Date.now();
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  const newRoom = {
    roomId,
    roomName,
    createdBy: username,
    roomCode,
    messages: [],
    files: [],
    quiz: null,
    scores: {} 
  };

  rooms.push(newRoom);
  io.emit('room-list-updated', rooms);
  return res.json({ success: true, room: newRoom });
});

app.post('/api/join-by-code', (req, res) => {
  const { roomCode } = req.body;
  if (!roomCode) {
    return res.json({ success: false, message: 'Room code is required!' });
  }

  const room = rooms.find(r => r.roomCode && r.roomCode.toUpperCase() === roomCode.trim().toUpperCase());
  if (!room) {
    return res.json({ success: false, message: 'Invalid Room Code!' });
  }
  return res.json({ success: true, room });
});

app.post('/api/upload-file', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, message: 'No file uploaded!' });
    }

    const roomId = req.body.roomId;
    const username = req.body.username || 'Anonymous';
    const room = rooms.find(r => r.roomId === roomId);

    if (!room) {
      return res.json({ success: false, message: 'Room not found!' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

    const fileObj = {
      fileName: req.file.originalname,
      fileData: fileUrl,
      username,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    room.files.push(fileObj);
    io.to(roomId).emit('receive-file', fileObj);

    return res.json({ success: true, file: fileObj });
  } catch (error) {
    console.error("File upload error:", error);
    return res.json({ success: false, message: 'File upload failed on server.' });
  }
});

// --- Socket.io Realtime Communication ---
io.on('connection', (socket) => {
  console.log('User Connected:', socket.id);

  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    const room = rooms.find(r => r.roomId === roomId);
    if (room) {
      if (!room.scores) {
        room.scores = {};
      }
      
      socket.emit('load-room-data', {
        messages: room.messages,
        files: room.files,
        quiz: room.quiz,
        scores: room.scores
      });
      socket.to(roomId).emit('notification', `${username || 'A user'} joined the study room.`);
    }
  });

  socket.on('send-message', ({ roomId, message, username }) => {
    const room = rooms.find(r => r.roomId === roomId);
    if (room && message) {
      const msgObj = {
        username,
        message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      room.messages.push(msgObj);
      io.to(roomId).emit('receive-message', msgObj);
    }
  });

  socket.on('create-quiz', ({ roomId, quizData }) => {
    const room = rooms.find(r => r.roomId === roomId);
    if (room) {
      room.quiz = quizData;
      io.to(roomId).emit('receive-quiz', quizData);
    }
  });

  socket.on('submit-quiz-answer', ({ roomId, username, selectedOption }) => {
    const room = rooms.find(r => r.roomId === roomId);
    if (room && room.quiz) {
      if (!room.quiz.submissions) {
        room.quiz.submissions = {};
      }
      room.quiz.submissions[username] = selectedOption;
      io.to(roomId).emit('receive-quiz', room.quiz);
    }
  });

  socket.on('update-leaderboard', ({ roomId, scores }) => {
    const room = rooms.find(r => r.roomId === roomId);
    if (room) {
      room.scores = scores;
      io.to(roomId).emit('update-scores', room.scores);
    }
  });

  socket.on('drawing', ({ roomId, data }) => {
    socket.to(roomId).emit('drawing', data);
  });

  socket.on('disconnect', () => {
    console.log('User Disconnected:', socket.id);
  });
});

// --- Serve React Frontend in Production (Updated for Root build) ---
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../', 'build', 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running smoothly on port ${PORT}`);
});