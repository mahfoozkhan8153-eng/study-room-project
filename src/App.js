import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';

const BACKEND_URL = window.location.origin;
const socket = io(BACKEND_URL);

function App() {
  const [authMode, setAuthMode] = useState('login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [registerSuccessMsg, setRegisterSuccessMsg] = useState('');

  // Dashboard states
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [createdRoomInfo, setCreatedRoomInfo] = useState(null); 
  const [activeRoom, setActiveRoom] = useState(null);

  // Room workspace states
  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [files, setFiles] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [scores, setScores] = useState({});

  // Quiz states
  const [quiz, setQuiz] = useState(null);
  const [quizSubTab, setQuizSubTab] = useState('play'); 
  const [questionText, setQuestionText] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctOpt, setCorrectOpt] = useState('A');

  // Whiteboard refs & state
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastCoordRef = useRef({ x: 0, y: 0 });

  const fetchRooms = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/rooms`);
      const data = await response.json();
      if (data.success) {
        setRooms(data.rooms);
      }
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchRooms();
    }
  }, [isLoggedIn, fetchRooms]);

  const drawOnCanvas = useCallback((x0, y0, x1, y1, color, emit) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.closePath();

    if (emit && activeRoom) {
      socket.emit('drawing', { roomId: activeRoom.roomId, data: { x0, y0, x1, y1, color } });
    }
  }, [activeRoom]);

  useEffect(() => {
    if (!activeRoom) return;

    socket.emit('join-room', { roomId: activeRoom.roomId, username: fullName });

    socket.on('load-room-data', (data) => {
      setMessages(data.messages || []);
      setFiles(data.files || []);
      setQuiz(data.quiz || null);
      setScores(data.scores || {});
    });

    socket.on('receive-message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('receive-file', (file) => {
      setFiles((prev) => [...prev, file]);
    });

    socket.on('receive-quiz', (qData) => {
      setQuiz(qData ? { ...qData } : null);
    });

    socket.on('update-scores', (updatedScores) => {
      setScores(updatedScores || {});
    });

    socket.on('notification', (note) => {
      setNotifications((prev) => [...prev, note]);
    });

    socket.on('drawing', (data) => {
      drawOnCanvas(data.x0, data.y0, data.x1, data.y1, data.color, false);
    });

    socket.on('room-list-updated', (updatedRooms) => {
      setRooms(updatedRooms);
    });

    return () => {
      socket.off('load-room-data');
      socket.off('receive-message');
      socket.off('receive-file');
      socket.off('receive-quiz');
      socket.off('update-scores');
      socket.off('notification');
      socket.off('drawing');
      socket.off('room-list-updated');
    };
  }, [activeRoom, fullName, drawOnCanvas]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setRegisterSuccessMsg('');

    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    const payload = authMode === 'login' ? { email, password } : { fullName, email, password };

    try {
      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        if (authMode === 'login') {
          setFullName(data.username);
          setIsLoggedIn(true);
        } else {
          setRegisterSuccessMsg('✨ Account created successfully! Please sign in.');
          setAuthMode('login');
          setPassword('');
        }
      } else {
        setAuthError(data.message);
      }
    } catch (err) {
      setAuthError('Connection error occurred!');
    }
  };

  const createStudyGroup = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/create-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: newRoomName, username: fullName })
      });
      const data = await res.json();
      if (data.success) {
        setNewRoomName('');
        setCreatedRoomInfo(data.room);
        fetchRooms();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const joinGroupByCode = async (e) => {
    e.preventDefault();
    setJoinError('');
    if (!joinCodeInput.trim()) return;
    
    const foundRoom = rooms.find(r => r.roomCode && r.roomCode.toUpperCase() === joinCodeInput.trim().toUpperCase());
    if (foundRoom) {
      setJoinCodeInput('');
      setActiveRoom(foundRoom);
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/join-by-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: joinCodeInput })
      });
      const data = await res.json();
      if (data.success) {
        setJoinCodeInput('');
        setActiveRoom(data.room);
      } else {
        setJoinError('Invalid Room Code!');
      }
    } catch (err) {
      setJoinError('Failed to connect!');
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (messageInput.trim() && activeRoom) {
      socket.emit('send-message', { roomId: activeRoom.roomId, message: messageInput, username: fullName });
      setMessageInput('');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeRoom) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('roomId', activeRoom.roomId);
    formData.append('username', fullName);

    try {
      const response = await fetch(`${BACKEND_URL}/api/upload-file`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!data.success) {
        alert('Upload failed: ' + data.message);
      }
    } catch (err) {
      console.error('File upload error:', err);
      alert('Server connection failed during upload!');
    }

    e.target.value = null;
  };

  const handleCreateQuiz = (e) => {
    e.preventDefault();
    if (!questionText.trim() || !activeRoom) return;
    
    const quizData = {
      question: questionText,
      options: { A: optA, B: optB, C: optC, D: optD },
      correct: correctOpt,
      createdBy: fullName,
      submissions: {}
    };

    setQuiz(quizData);
    socket.emit('create-quiz', { roomId: activeRoom.roomId, quizData });

    setQuestionText('');
    setOptA(''); setOptB(''); setOptC(''); setOptD('');
    setQuizSubTab('play');
  };

  const handleAnswerSubmit = (optionKey) => {
    if (!activeRoom || !quiz) return;
    socket.emit('submit-quiz-answer', { roomId: activeRoom.roomId, username: fullName, selectedOption: optionKey });

    if (optionKey === quiz.correct) {
      const currentScore = scores[fullName] || 0;
      if (!quiz.submissions || quiz.submissions[fullName] !== quiz.correct) {
        const updatedScores = { ...scores, [fullName]: currentScore + 10 };
        setScores(updatedScores);
        socket.emit('update-leaderboard', { roomId: activeRoom.roomId, scores: updatedScores });
      }
    }
  };

  const startDrawing = (e) => {
    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    lastCoordRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawOnCanvas(lastCoordRef.current.x, lastCoordRef.current.y, x, y, '#14b8a6', true);
    lastCoordRef.current = { x, y };
  };

  const stopDrawing = () => setIsDrawing(false);

  const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    },
    card: {
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      border: '1px solid #334155',
      borderRadius: '16px',
      padding: '36px',
      width: '100%',
      maxWidth: '420px',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)'
    },
    title: {
      fontSize: '28px',
      fontWeight: '800',
      textAlign: 'center',
      color: '#2dd4bf',
      marginBottom: '4px',
      letterSpacing: '-0.5px'
    },
    subtitle: {
      fontSize: '12px',
      textAlign: 'center',
      color: '#94a3b8',
      marginBottom: '28px'
    },
    tabContainer: {
      display: 'flex',
      backgroundColor: '#090d16',
      padding: '4px',
      borderRadius: '10px',
      marginBottom: '24px',
      border: '1px solid #1e293b'
    },
    tabBtn: (isActive) => ({
      flex: 1,
      padding: '10px',
      borderRadius: '8px',
      border: 'none',
      background: isActive ? '#0d9488' : 'transparent',
      color: isActive ? '#ffffff' : '#94a3b8',
      fontWeight: '600',
      fontSize: '13px',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    }),
    inputGroup: {
      marginBottom: '18px'
    },
    label: {
      display: 'block',
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: '#94a3b8',
      marginBottom: '6px',
      fontWeight: '600'
    },
    input: {
      width: '100%',
      padding: '12px 14px',
      backgroundColor: '#090d16',
      border: '1px solid #334155',
      borderRadius: '10px',
      color: '#f8fafc',
      fontSize: '14px',
      outline: 'none',
      boxSizing: 'border-box',
      transition: 'border-color 0.2s'
    },
    primaryBtn: {
      width: '100%',
      padding: '12px',
      backgroundColor: '#0d9488',
      color: '#ffffff',
      border: 'none',
      borderRadius: '10px',
      fontWeight: '700',
      fontSize: '13px',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      cursor: 'pointer',
      marginTop: '10px',
      boxShadow: '0 4px 14px rgba(13, 148, 136, 0.4)',
      transition: 'background 0.2s'
    },
    errorBox: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      color: '#fca5a5',
      padding: '10px',
      borderRadius: '8px',
      fontSize: '12px',
      textAlign: 'center',
      marginBottom: '16px'
    },
    successBox: {
      backgroundColor: 'rgba(20, 184, 166, 0.1)',
      border: '1px solid rgba(20, 184, 166, 0.3)',
      color: '#5eead4',
      padding: '10px',
      borderRadius: '8px',
      fontSize: '12px',
      textAlign: 'center',
      marginBottom: '16px'
    }
  };

  if (!isLoggedIn) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>CampusConnect</h1>
          <p style={styles.subtitle}>Virtual Collaborative Learning Environment</p>

          <div style={styles.tabContainer}>
            <button 
              type="button" 
              onClick={() => { setAuthMode('login'); setAuthError(''); setRegisterSuccessMsg(''); }} 
              style={styles.tabBtn(authMode === 'login')}
            >
              Sign In
            </button>
            <button 
              type="button" 
              onClick={() => { setAuthMode('register'); setAuthError(''); setRegisterSuccessMsg(''); }} 
              style={styles.tabBtn(authMode === 'register')}
            >
              Register
            </button>
          </div>

          {registerSuccessMsg && <div style={styles.successBox}>{registerSuccessMsg}</div>}
          {authError && <div style={styles.errorBox}>{authError}</div>}

          <form onSubmit={handleAuth}>
            {authMode === 'register' && (
              <div style={styles.inputGroup}>
                <label style={styles.label}>Full Name</label>
                <input 
                  type="text" 
                  placeholder="Enter your full name" 
                  value={fullName} 
                  onChange={(e) => setFullName(e.target.value)} 
                  style={styles.input} 
                  required 
                />
              </div>
            )}
            <div style={styles.inputGroup}>
              <label style={styles.label}>Email Address</label>
              <input 
                type="email" 
                placeholder="name@university.edu" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                style={styles.input} 
                required 
              />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Password</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                style={styles.input} 
                required 
              />
            </div>
            <button type="submit" style={styles.primaryBtn}>
              {authMode === 'login' ? 'Access Dashboard' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (activeRoom) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif" }}>
        <header style={{ backgroundColor: '#1e293b', borderBottom: '1px solid #334155', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button onClick={() => setActiveRoom(null)} style={{ padding: '8px 14px', backgroundColor: '#334155', border: 'none', borderRadius: '8px', color: '#cbd5e1', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }}>← Exit Room</button>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#2dd4bf', margin: 0 }}>Room: {activeRoom.roomName}</h2>
            <span style={{ fontSize: '12px', backgroundColor: 'rgba(20, 184, 166, 0.1)', color: '#5eead4', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(20, 184, 166, 0.2)' }}>
              Code: <b style={{ fontFamily: 'monospace' }}>{activeRoom.roomCode}</b>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', backgroundColor: '#090d16', padding: '4px', borderRadius: '10px', border: '1px solid #1e293b' }}>
            {['chat', 'whiteboard', 'files', 'quiz', 'leaderboard'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', backgroundColor: activeTab === tab ? '#0d9488' : 'transparent', color: activeTab === tab ? '#fff' : '#94a3b8', fontSize: '12px', fontWeight: '600', cursor: 'pointer', textTransform: 'capitalize' }}>
                {tab === 'quiz' ? 'Quiz Hub' : tab === 'leaderboard' ? '🏆 Leaderboard' : tab}
              </button>
            ))}
          </div>
        </header>

        <main style={{ flex: 1, padding: '24px', maxWidth: '1000px', margin: '0 auto', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {notifications.length > 0 && (
            <div style={{ backgroundColor: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.2)', color: '#5eead4', padding: '12px', borderRadius: '10px', marginBottom: '16px', fontSize: '12px' }}>
              📢 <b>Notice:</b> {notifications[notifications.length - 1]}
            </div>
          )}

          {activeTab === 'chat' && (
            <div style={{ flex: 1, backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '500px' }}>
              <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {messages.map((m, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: m.username === fullName ? 'flex-end' : 'flex-start' }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>{m.username} • {m.time}</span>
                    <div style={{ padding: '10px 14px', borderRadius: '12px', maxWidth: '320px', fontSize: '13px', backgroundColor: m.username === fullName ? '#0d9488' : '#334155', color: '#fff' }}>
                      {m.message}
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={sendMessage} style={{ padding: '12px 16px', backgroundColor: '#0f172a', borderTop: '1px solid #334155', display: 'flex', gap: '10px' }}>
                <input type="text" placeholder="Type a message..." value={messageInput} onChange={(e) => setMessageInput(e.target.value)} style={{ flex: 1, backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px 14px', color: '#fff', fontSize: '13px', outline: 'none' }} />
                <button type="submit" style={{ padding: '0 20px', backgroundColor: '#0d9488', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>Send</button>
              </form>
            </div>
          )}

          {activeTab === 'whiteboard' && (
            <div style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid #334155', height: '500px' }}>
              <div style={{ backgroundColor: '#1e293b', padding: '10px 16px', fontSize: '12px', color: '#94a3b8', borderBottom: '1px solid #334155' }}>🎨 Interactive Whiteboard (Live Sync)</div>
              <canvas ref={canvasRef} width={950} height={420} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} style={{ width: '100%', flex: 1, cursor: 'crosshair', backgroundColor: '#fff' }} />
            </div>
          )}

          {activeTab === 'files' && (
            <div style={{ flex: 1, backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '24px', display: 'flex', flexDirection: 'column', height: '500px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', color: '#2dd4bf', margin: '0 0 4px 0' }}>Workspace Shared Files</h3>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Upload and download group resources securely from cloud storage.</p>
                </div>
                <label style={{ cursor: 'pointer', backgroundColor: '#0d9488', color: '#fff', padding: '10px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                  <span>+ Upload File</span>
                  <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {files.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', border: '2px dashed #334155', borderRadius: '10px', color: '#64748b', fontSize: '13px' }}>No files uploaded yet.</div>
                ) : (
                  files.map((f, i) => (
                    <div key={i} style={{ backgroundColor: '#0f172a', border: '1px solid #334155', padding: '14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>{f.fileName}</p>
                        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>Uploaded by {f.username} at {f.time}</p>
                      </div>
                      <a href={f.fileData} target="_blank" rel="noopener noreferrer" download={f.fileName} style={{ padding: '8px 14px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', fontSize: '12px', color: '#2dd4bf', textDecoration: 'none', fontWeight: '600' }}>Download / View</a>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'quiz' && (
            <div style={{ flex: 1, backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '24px', display: 'flex', flexDirection: 'column', height: '500px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '15px', color: '#2dd4bf', margin: 0 }}>Live Quiz Challenge Hub</h3>
                <div style={{ display: 'flex', gap: '6px', backgroundColor: '#0f172a', padding: '4px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <button onClick={() => setQuizSubTab('play')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: quizSubTab === 'play' ? '#0d9488' : 'transparent', color: quizSubTab === 'play' ? '#fff' : '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>Active Quiz</button>
                  <button onClick={() => setQuizSubTab('create')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: quizSubTab === 'create' ? '#0d9488' : 'transparent', color: quizSubTab === 'create' ? '#fff' : '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>Create Quiz</button>
                </div>
              </div>

              {quizSubTab === 'create' ? (
                <div style={{ backgroundColor: '#0f172a', padding: '24px', borderRadius: '12px', border: '1px solid #334155', maxWidth: '500px', margin: 'auto', width: '100%' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#2dd4bf', textTransform: 'uppercase' }}>Build Assessment</h4>
                  <form onSubmit={handleCreateQuiz} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <input type="text" placeholder="Enter question..." value={questionText} onChange={(e) => setQuestionText(e.target.value)} style={styles.input} required />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <input type="text" placeholder="Option A" value={optA} onChange={(e) => setOptA(e.target.value)} style={styles.input} required />
                      <input type="text" placeholder="Option B" value={optB} onChange={(e) => setOptB(e.target.value)} style={styles.input} required />
                      <input type="text" placeholder="Option C" value={optC} onChange={(e) => setOptC(e.target.value)} style={styles.input} required />
                      <input type="text" placeholder="Option D" value={optD} onChange={(e) => setOptD(e.target.value)} style={styles.input} required />
                    </div>
                    <select value={correctOpt} onChange={(e) => setCorrectOpt(e.target.value)} style={styles.input}>
                      <option value="A">Correct Answer: Option A</option>
                      <option value="B">Correct Answer: Option B</option>
                      <option value="C">Correct Answer: Option C</option>
                      <option value="D">Correct Answer: Option D</option>
                    </select>
                    <button type="submit" style={styles.primaryBtn}>Publish Quiz</button>
                  </form>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {!quiz ? (
                    <div style={{ textAlign: 'center', padding: '30px', backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #334155' }}>
                      <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '14px' }}>No active quiz running in this room right now.</p>
                      <button onClick={() => setQuizSubTab('create')} style={{ padding: '10px 20px', backgroundColor: '#0d9488', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>Create Quiz Now</button>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: '#0f172a', padding: '24px', borderRadius: '12px', border: '1px solid #334155', width: '100%', maxWidth: '600px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <span style={{ fontSize: '11px', backgroundColor: 'rgba(20, 184, 166, 0.1)', color: '#5eead4', padding: '4px 8px', borderRadius: '4px' }}>Author: {quiz.createdBy}</span>
                        <button onClick={() => setQuiz(null)} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '11px', cursor: 'pointer' }}>Clear Quiz</button>
                      </div>
                      <h4 style={{ fontSize: '15px', color: '#fff', marginBottom: '16px' }}>{quiz.question}</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                        {Object.entries(quiz.options).map(([key, val]) => {
                          const isSelected = quiz.submissions && quiz.submissions[fullName] === key;
                          return (
                            <button key={key} onClick={() => handleAnswerSubmit(key)} style={{ padding: '12px 16px', backgroundColor: isSelected ? '#0d9488' : '#1e293b', border: '1px solid #334155', borderRadius: '10px', color: '#fff', textAlign: 'left', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                              <span><b>{key}.</b> {val}</span>
                              {isSelected && <span style={{ fontSize: '11px', backgroundColor: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px' }}>Selected</span>}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ backgroundColor: '#1e293b', padding: '14px', borderRadius: '10px', border: '1px solid #334155' }}>
                        <h5 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#94a3b8' }}>Participant Responses ({Object.keys(quiz.submissions || {}).length})</h5>
                        {Object.entries(quiz.submissions || {}).map(([user, ans]) => (
                          <div key={user} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid #334155' }}>
                            <span style={{ color: '#cbd5e1' }}>{user}</span>
                            <span style={{ color: ans === quiz.correct ? '#34d399' : '#f87171', fontWeight: 'bold' }}>Answer: {ans} {ans === quiz.correct ? '✓' : '✗'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'leaderboard' && (
            <div style={{ flex: 1, backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '24px', display: 'flex', flexDirection: 'column', height: '500px' }}>
              <h3 style={{ fontSize: '15px', color: '#2dd4bf', margin: '0 0 6px 0' }}>🏆 Room Leaderboard</h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 20px 0' }}>Top scorers based on correct quiz submissions in this room.</p>
              
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Object.keys(scores).length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', border: '2px dashed #334155', borderRadius: '10px', color: '#64748b', fontSize: '13px' }}>No scores recorded yet. Participate in quizzes to score points!</div>
                ) : (
                  Object.entries(scores)
                    .sort(([, a], [, b]) => b - a)
                    .map(([user, score], index) => (
                      <div key={user} style={{ backgroundColor: '#0f172a', border: '1px solid #334155', padding: '14px 18px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', color: index === 0 ? '#facc15' : index === 1 ? '#94a3b8' : index === 2 ? '#b45309' : '#64748b' }}>#{index + 1}</span>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc' }}>{user} {user === fullName && '(You)'}</span>
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#2dd4bf', backgroundColor: 'rgba(20, 184, 166, 0.1)', padding: '6px 12px', borderRadius: '8px' }}>{score} pts</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={{ width: '100%', maxWidth: '800px' }}>
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', padding: '24px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.4)' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#2dd4bf', margin: '0 0 4px 0' }}>Welcome back, {fullName}!</h1>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Manage your study rooms or join existing collaborative hubs.</p>
          </div>
          <button onClick={() => setIsLoggedIn(false)} style={{ padding: '8px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Sign Out</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#2dd4bf', letterSpacing: '0.05em', marginBottom: '16px' }}>Create Study Room</h2>
              <form onSubmit={createStudyGroup} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input type="text" placeholder="Room Title (e.g. Physics Final)" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} style={styles.input} required />
                <button type="submit" style={styles.primaryBtn}>Initialize Room</button>
              </form>
            </div>
            {createdRoomInfo && (
              <div style={{ marginTop: '16px', backgroundColor: '#0f172a', padding: '14px', borderRadius: '10px', border: '1px solid rgba(20, 184, 166, 0.3)', textAlign: 'center' }}>
                <p style={{ color: '#5eead4', fontSize: '12px', margin: '0 0 6px 0', fontWeight: '600' }}>Room Created Successfully!</p>
                <div style={{ fontSize: '16px', fontFamily: 'monospace', fontWeight: 'bold', color: '#2dd4bf', margin: '8px 0', letterSpacing: '2px' }}>{createdRoomInfo.roomCode}</div>
                <button onClick={() => setActiveRoom(createdRoomInfo)} style={{ padding: '6px 14px', backgroundColor: '#0d9488', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Enter Now</button>
              </div>
            )}
          </div>

          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#2dd4bf', letterSpacing: '0.05em', marginBottom: '16px' }}>Join via Room Code</h2>
              <form onSubmit={joinGroupByCode} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input type="text" placeholder="Enter Code (e.g. A3F8K9)" value={joinCodeInput} onChange={(e) => setJoinCodeInput(e.target.value)} style={{ ...styles.input, textTransform: 'uppercase' }} required />
                <button type="submit" style={{ ...styles.primaryBtn, backgroundColor: '#334155', border: '1px solid #475569' }}>Join Hub</button>
              </form>
            </div>
            {joinError && <div style={{ ...styles.errorBox, marginTop: '14px', marginBottom: 0 }}>{joinError}</div>}
          </div>
        </div>

        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', padding: '24px', borderRadius: '16px' }}>
          <h2 style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#2dd4bf', letterSpacing: '0.05em', marginBottom: '16px' }}>Active Collaboration Rooms ({rooms.length})</h2>
          {rooms.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>No active study rooms available right now. Create one above!</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {rooms.map((r) => (
                <div key={r.roomId} style={{ backgroundColor: '#0f172a', border: '1px solid #334155', padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#f8fafc' }}>{r.roomName}</h3>
                    <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>Host: {r.createdBy} • <span style={{ color: '#2dd4bf', fontFamily: 'monospace' }}>{r.roomCode}</span></p>
                  </div>
                  <button onClick={() => setActiveRoom(r)} style={{ padding: '6px 14px', backgroundColor: '#0d9488', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Join</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;