// ==========================================================
// server.js — backend NovaChat
// Express + JWT-авторизация + хранение данных в JSON-файлах
// ==========================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ в реальном проекте вынесите секрет в переменную окружения (.env)
const JWT_SECRET = process.env.JWT_SECRET || 'novachat_dev_secret_change_me';

const USERS_FILE = path.join(__dirname, 'users.json');
const CHATS_FILE = path.join(__dirname, 'chats.json');

// юзернеймы, которые нельзя занять обычному пользователю (зарезервированы за ботом/системой)
const RESERVED_HANDLES = ['novachat', 'novaai', 'admin', 'support', 'system'];

// увеличенный лимит — нужен, чтобы прошла base64-картинка аватарки
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- вспомогательные функции для чтения/записи JSON ----------
function loadJSON(file, fallback){
  try{
    if(!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf-8');
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){
    console.error('Ошибка чтения', file, e);
    return fallback;
  }
}

function saveJSON(file, data){
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------- заполняем новые поля профиля значениями по умолчанию ----------
// (нужно, чтобы пользователи, зарегистрированные до этого обновления, не ломали код)
function normalizeUser(user){
  return {
    username: user.username,
    passwordHash: user.passwordHash,
    displayName: user.displayName || user.username,
    handle: user.handle || null,
    bio: typeof user.bio === 'string' ? user.bio : '',
    avatar: user.avatar || null
  };
}

function publicProfile(user){
  return {
    displayName: user.displayName,
    handle: user.handle,
    bio: user.bio,
    avatar: user.avatar
  };
}

function isValidHandle(handle){
  return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(handle);
}

// ---------- middleware проверки токена ----------
function authMiddleware(req, res, next){
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if(!token){
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try{
    const payload = jwt.verify(token, JWT_SECRET);
    req.username = payload.username;
    next();
  }catch(e){
    return res.status(401).json({ error: 'Сессия недействительна, войдите снова' });
  }
}

// ==========================================================
// РЕГИСТРАЦИЯ
// ==========================================================
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};

  if(!username || !password){
    return res.status(400).json({ error: 'Укажите никнейм и пароль' });
  }
  if(username.length < 3){
    return res.status(400).json({ error: 'Никнейм должен быть не короче 3 символов' });
  }
  if(password.length < 6){
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
  }

  const users = loadJSON(USERS_FILE, []);
  const exists = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if(exists){
    return res.status(409).json({ error: 'Такой никнейм уже занят' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  users.push({
    username,
    passwordHash,
    displayName: username,
    handle: null,
    bio: '',
    avatar: null
  });
  saveJSON(USERS_FILE, users);

  res.json({ success: true });
});

// ==========================================================
// ВХОД
// ==========================================================
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};

  if(!username || !password){
    return res.status(400).json({ error: 'Укажите никнейм и пароль' });
  }

  const users = loadJSON(USERS_FILE, []);
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if(!user){
    return res.status(401).json({ error: 'Неверный никнейм или пароль' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if(!match){
    return res.status(401).json({ error: 'Неверный никнейм или пароль' });
  }

  const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// ==========================================================
// ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ (для проверки сессии на фронте)
// ==========================================================
app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ username: req.username });
});

// ==========================================================
// ПРОФИЛЬ — получение
// ==========================================================
app.get('/api/profile', authMiddleware, (req, res) => {
  const users = loadJSON(USERS_FILE, []);
  const user = users.find(u => u.username === req.username);
  if(!user){
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  res.json(publicProfile(normalizeUser(user)));
});

// ==========================================================
// ПРОФИЛЬ — проверка доступности юзернейма (на лету, пока печатает)
// ==========================================================
app.get('/api/check-handle/:handle', authMiddleware, (req, res) => {
  const handle = (req.params.handle || '').toLowerCase();

  if(!isValidHandle(handle)){
    return res.json({ available: false, reason: 'Только буквы, цифры и _, от 5 до 32 символов' });
  }
  if(RESERVED_HANDLES.includes(handle)){
    return res.json({ available: false, reason: 'Этот юзернейм зарезервирован' });
  }

  const users = loadJSON(USERS_FILE, []);
  const taken = users.some(u =>
    u.username !== req.username && (u.handle || '').toLowerCase() === handle
  );

  res.json({ available: !taken, reason: taken ? 'Юзернейм уже занят' : null });
});

// ==========================================================
// ПРОФИЛЬ — сохранение (имя, юзернейм, био, аватар)
// ==========================================================
app.put('/api/profile', authMiddleware, (req, res) => {
  const { displayName, handle, bio, avatar } = req.body || {};

  const users = loadJSON(USERS_FILE, []);
  const index = users.findIndex(u => u.username === req.username);
  if(index === -1){
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  const user = normalizeUser(users[index]);

  // ---- имя ----
  const trimmedName = (displayName || '').trim();
  if(!trimmedName){
    return res.status(400).json({ error: 'Введите имя' });
  }
  if(trimmedName.length > 40){
    return res.status(400).json({ error: 'Имя слишком длинное (макс. 40 символов)' });
  }
  user.displayName = trimmedName;

  // ---- юзернейм (необязателен) ----
  const trimmedHandle = (handle || '').trim().toLowerCase();
  if(trimmedHandle){
    if(!isValidHandle(trimmedHandle)){
      return res.status(400).json({ error: 'Юзернейм: только буквы, цифры и _, от 5 до 32 символов' });
    }
    if(RESERVED_HANDLES.includes(trimmedHandle)){
      return res.status(400).json({ error: 'Этот юзернейм зарезервирован' });
    }
    const taken = users.some((u, i) => i !== index && (u.handle || '').toLowerCase() === trimmedHandle);
    if(taken){
      return res.status(409).json({ error: 'Юзернейм уже занят' });
    }
    user.handle = trimmedHandle;
  } else {
    user.handle = null;
  }

  // ---- био ----
  const trimmedBio = (bio || '').trim();
  if(trimmedBio.length > 200){
    return res.status(400).json({ error: 'Био слишком длинное (макс. 200 символов)' });
  }
  user.bio = trimmedBio;

  // ---- аватар (base64 data URL или null для удаления) ----
  if(avatar !== undefined){
    user.avatar = avatar || null;
  }

  users[index] = user;
  saveJSON(USERS_FILE, users);

  res.json(publicProfile(user));
});

// ==========================================================
// ИСТОРИЯ ЧАТА
// ==========================================================
app.get('/api/chat/history', authMiddleware, (req, res) => {
  const chats = loadJSON(CHATS_FILE, {});

  if(!chats[req.username]){
    chats[req.username] = [
      { sender: 'bot', text: 'Привет! Я NovaAI, ваш помощник поддержки. Чем могу помочь?', ts: Date.now() }
    ];
    saveJSON(CHATS_FILE, chats);
  }

  res.json({ messages: chats[req.username] });
});

// ==========================================================
// ОТПРАВКА СООБЩЕНИЯ + ОТВЕТ NovaAI
// ==========================================================
app.post('/api/chat', authMiddleware, (req, res) => {
  const { text } = req.body || {};
  if(!text || !text.trim()){
    return res.status(400).json({ error: 'Пустое сообщение' });
  }

  const chats = loadJSON(CHATS_FILE, {});
  if(!chats[req.username]) chats[req.username] = [];

  chats[req.username].push({ sender: 'user', text: text.trim(), ts: Date.now() });

  const reply = getNovaAIReply(text.trim());
  chats[req.username].push({ sender: 'bot', text: reply, ts: Date.now() });

  saveJSON(CHATS_FILE, chats);
  res.json({ reply });
});

// ==========================================================
// NovaAI — простой бот на правилах.
// Замените эту функцию на вызов настоящего AI API
// (например, Anthropic Claude API или OpenAI), если нужно.
// ==========================================================
function getNovaAIReply(message){
  const text = message.toLowerCase();

  if(/привет|здравств|хай|добрый/.test(text)){
    return 'Привет! Рад вас видеть 👋 Расскажите, с чем помочь?';
  }
  if(/спасибо|благодар/.test(text)){
    return 'Всегда пожалуйста! Обращайтесь, если понадобится ещё что-то.';
  }
  if(/пока|до свидан/.test(text)){
    return 'До встречи! Хорошего дня 🙂';
  }
  if(text.includes('?')){
    return 'Хороший вопрос! Пока я работаю в тестовом режиме на простых правилах, но скоро научусь отвечать умнее. Можете переформулировать чуть проще?';
  }
  if(/помощь|помоги|как /.test(text)){
    return 'Я на связи и постараюсь помочь. Опишите, пожалуйста, подробнее, что нужно сделать.';
  }

  const fallbacks = [
    'Понял вас! Пока я тестовый бот, но записал ваше сообщение.',
    'Интересно! Расскажите чуть подробнее?',
    'Принято. Чем ещё могу быть полезен?',
    'Хм, дайте мне подумать над этим 🤔'
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ==========================================================
// ПОИСК ПОЛЬЗОВАТЕЛЕЙ, КАНАЛОВ И БОТОВ
// ==========================================================
app.get('/api/search', authMiddleware, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase().replace(/^@/, '');
  if (!q) return res.json({ users: [], channels: [], bots: [] });

  const users = loadJSON(USERS_FILE, []);
  
  // Ищем пользователей
  const matchedUsers = users
    .filter(u => u.username !== req.username)
    .filter(u => 
      u.username.toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q) 
      (u.handle || '').toLowerCase().includes(q)
    )
    .map(u => ({
      username: u.username,
      displayName: u.displayName || u.username,
      handle: u.handle || null,
      avatar: u.avatar || null,
      type: 'user'
    }))
    .slice(0, 10);

  // Ищем каналы (из chats.json, где isChannel = true)
  const chats = loadJSON(CHATS_FILE, {});
  const matchedChannels = Object.keys(chats)
    .filter(key => key.startsWith('channel_'))
    .map(key => ({ id: key, ...chats[key] }))
    .filter(ch => (ch.name || '').toLowerCase().includes(q)  (ch.handle || '').toLowerCase().includes(q))
    .map(ch => ({
      id: ch.id,
      name: ch.name || ch.id,
      handle: ch.handle || null,
      type: 'channel'
    }))
    .slice(0, 10);

  // Боты (захардкоженные или из специального файла)
  const bots = [
    { name: 'NovaAI', handle: 'novachat', description: 'Официальный бот поддержки', type: 'bot' }
  ].filter(b => 
    b.name.toLowerCase().includes(q) || 
    b.handle.toLowerCase().includes(q) ||
    (b.description || '').toLowerCase().includes(q)
  );

  res.json({ users: matchedUsers, channels: matchedChannels, bots });
});

// ==========================================================
// УДАЛЕНИЕ СООБЩЕНИЯ
// ==========================================================
app.delete('/api/messages/:index', authMiddleware, (req, res) => {
  const index = parseInt(req.params.index);
  if (isNaN(index) || index < 0) {
    return res.status(400).json({ error: 'Неверный индекс сообщения' });
  }

  const chats = loadJSON(CHATS_FILE, {});
  if (!chats[req.username]) {
    return res.status(404).json({ error: 'Чат не найден' });
  }

  if (index >= chats[req.username].length) {
    return res.status(404).json({ error: 'Сообщение не найдено' });
  }

  // Проверяем, что сообщение принадлежит пользователю (нельзя удалить чужое)
  if (chats[req.username][index].sender !== 'user') {
    return res.status(403).json({ error: 'Нельзя удалить чужое сообщение' });
  }

  // Помечаем как удалённое (soft delete) или удаляем полностью
  // Для анимации "танос" лучше просто удалить
  chats[req.username].splice(index, 1);
  saveJSON(CHATS_FILE, chats);

  res.json({ success: true });
});

// ==========================================================
// РЕДАКТИРОВАНИЕ СООБЩЕНИЯ
// ==========================================================
app.put('/api/messages/:index', authMiddleware, (req, res) => {
  const index = parseInt(req.params.index);
  const { text } = req.body;

  if (isNaN(index) || index < 0) {
    return res.status(400).json({ error: 'Неверный индекс сообщения' });
  }
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Текст не может быть пустым' });
  }

  const chats = loadJSON(CHATS_FILE, {});
  if (!chats[req.username]) {
    return res.status(404).json({ error: 'Чат не найден' });
  }

  if (index >= chats[req.username].length) {
    return res.status(404).json({ error: 'Сообщение не найдено' });
  }

  if (chats[req.username][index].sender !== 'user') {
    return res.status(403).json({ error: 'Нельзя редактировать чужое сообщение' });
  }

  chats[req.username][index].text = text.trim();
  chats[req.username][index].edited = true;
  saveJSON(CHATS_FILE, chats);

  res.json({ success: true, message: chats[req.username][index] });
});

app.listen(PORT, () => {
  console.log(`NovaChat запущен: http://localhost:${PORT}`);
});