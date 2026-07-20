// ==========================================================
// server.js — backend NovaChat
// Express + JWT-авторизация + хранение данных в JSON-файлах
// ==========================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ⚠️ в реальном проекте вынесите секрет в переменную окружения (.env)
const JWT_SECRET = process.env.JWT_SECRET || 'novachat_dev_secret_change_me';

const USERS_FILE = path.join(__dirname, 'users.json');
const CHATS_FILE = path.join(__dirname, 'chats.json');
const CHANNELS_FILE = path.join(__dirname, 'channels.json');
const CONVERSATIONS_FILE = path.join(__dirname, 'conversations.json');

// юзернеймы, которые нельзя занять обычному пользователю (зарезервированы за ботом/каналом/системой)
const RESERVED_HANDLES = ['novachat', 'novaai', 'nc_official', 'admin', 'support', 'system'];

// ---------- создатели/администраторы сайта ----------
// Пока это просто список логинов/юзернеймов, которым присваивается
// статус "создатель" (галочка верификации + отдельный текст в подсказке).
// Если нужно больше одного уровня прав (модераторы и т.д.) — дай знать,
// вынесем в отдельный файл admins.json с ролями.
const CREATOR_LOGINS = ['admin1', 'dangerrm4lo'];

// ---------- верифицированные друзья/аккаунты ----------
// Сюда добавляй логин или юзернейм человека, которому нужна синяя галочка,
// но без статуса "создатель". Просто впиши в кавычках через запятую, например:
// const VERIFIED_LOGINS = ['friend_login', 'friend_handle'];
const VERIFIED_LOGINS = [];

function isCreator(user){
  const u = (user.username || '').toLowerCase();
  const h = (user.handle || '').toLowerCase();
  return CREATOR_LOGINS.includes(u) || CREATOR_LOGINS.includes(h);
}

function isVerifiedFriend(user){
  const u = (user.username || '').toLowerCase();
  const h = (user.handle || '').toLowerCase();
  return VERIFIED_LOGINS.includes(u) || VERIFIED_LOGINS.includes(h);
}

function verificationInfo(user){
  if(isCreator(user)){
    return { verified: true, verifiedLabel: 'Это создатель NovaChat - знакомьтесь!' };
  }
  if(isVerifiedFriend(user)){
    return { verified: true, verifiedLabel: 'Подтверждённый аккаунт NovaChat.' };
  }
  return { verified: false, verifiedLabel: null };
}

// увеличенный лимит — нужен, чтобы прошла base64-картинка аватарки
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// лёгкий эндпоинт для проверки "жив ли сервер" (используется offline.html)
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

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
  const v = verificationInfo(user);
  return {
    displayName: user.displayName,
    handle: user.handle,
    bio: user.bio,
    avatar: user.avatar,
    verified: v.verified,
    verifiedLabel: v.verifiedLabel
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

  const trimmedName = (displayName || '').trim();
  if(!trimmedName){
    return res.status(400).json({ error: 'Введите имя' });
  }
  if(trimmedName.length > 40){
    return res.status(400).json({ error: 'Имя слишком длинное (макс. 40 символов)' });
  }
  user.displayName = trimmedName;

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

  const trimmedBio = (bio || '').trim();
  if(trimmedBio.length > 200){
    return res.status(400).json({ error: 'Био слишком длинное (макс. 200 символов)' });
  }
  user.bio = trimmedBio;

  if(avatar !== undefined){
    user.avatar = avatar || null;
  }

  users[index] = user;
  saveJSON(USERS_FILE, users);

  res.json(publicProfile(user));
});

// ==========================================================
// ПОИСК — пользователи, бот, канал
// ==========================================================
const BOT_SEARCH_ENTRY = {
  type: 'bot',
  displayName: 'NovaAI',
  handle: 'NovaChat',
  bio: 'Официальный бот поддержки NovaChat.',
  verified: true,
  verifiedLabel: 'Это подтверждённый бот NovaChat.',
  avatar: null,
  avatarImage: 'logo'
};

const CHANNEL_SEARCH_ENTRY = {
  type: 'channel',
  displayName: 'NC Official',
  handle: 'NC_Official',
  bio: 'Официальный канал новостей NovaChat.',
  verified: true,
  verifiedLabel: 'Это официальный канал NovaChat.',
  avatar: null,
  avatarImage: null
};

app.get('/api/search', authMiddleware, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase().replace(/^@/, '');
  if(!q){
    return res.json({ results: [] });
  }

  const results = [];

  if(BOT_SEARCH_ENTRY.handle.toLowerCase().includes(q) || BOT_SEARCH_ENTRY.displayName.toLowerCase().includes(q)){
    results.push(BOT_SEARCH_ENTRY);
  }
  if(CHANNEL_SEARCH_ENTRY.handle.toLowerCase().includes(q) || CHANNEL_SEARCH_ENTRY.displayName.toLowerCase().includes(q)){
    results.push(CHANNEL_SEARCH_ENTRY);
  }

  const users = loadJSON(USERS_FILE, []);
  users.forEach(raw => {
    if(raw.username === req.username) return;
    const u = normalizeUser(raw);
    const matchesHandle = u.handle && u.handle.toLowerCase().includes(q);
    const matchesName = u.displayName && u.displayName.toLowerCase().includes(q);
    if(matchesHandle || matchesName){
      const v = verificationInfo(u);
      results.push({
        type: 'user',
        displayName: u.displayName,
        handle: u.handle,
        bio: u.bio,
        avatar: u.avatar,
        avatarImage: null,
        verified: v.verified,
        verifiedLabel: v.verifiedLabel
      });
    }
  });

  res.json({ results: results.slice(0, 30) });
});

// ==========================================================
// КАНАЛ — подписка / отписка / данные о канале
// Пока сайт поддерживает один канал (@NC_Official). Если понадобится
// несколько каналов — здесь нужно будет добавить их список и создание.
// ==========================================================
function getChannelsData(){
  return loadJSON(CHANNELS_FILE, {});
}

function ensureChannel(channels, handle){
  if(!channels[handle]){
    channels[handle] = { subscribers: [] };
  }
  return channels[handle];
}

app.get('/api/channel/:handle', authMiddleware, (req, res) => {
  const handle = req.params.handle;
  if(handle.toLowerCase() !== CHANNEL_SEARCH_ENTRY.handle.toLowerCase()){
    return res.status(404).json({ error: 'Канал не найден' });
  }
  const channels = getChannelsData();
  const channel = ensureChannel(channels, handle);
  res.json({
    ...CHANNEL_SEARCH_ENTRY,
    subscriberCount: channel.subscribers.length,
    isSubscribed: channel.subscribers.includes(req.username)
  });
});

app.post('/api/channel/:handle/subscribe', authMiddleware, (req, res) => {
  const handle = req.params.handle;
  if(handle.toLowerCase() !== CHANNEL_SEARCH_ENTRY.handle.toLowerCase()){
    return res.status(404).json({ error: 'Канал не найден' });
  }
  const channels = getChannelsData();
  const channel = ensureChannel(channels, handle);
  if(!channel.subscribers.includes(req.username)){
    channel.subscribers.push(req.username);
    saveJSON(CHANNELS_FILE, channels);
  }
  res.json({ subscriberCount: channel.subscribers.length, isSubscribed: true });
});

app.post('/api/channel/:handle/unsubscribe', authMiddleware, (req, res) => {
  const handle = req.params.handle;
  if(handle.toLowerCase() !== CHANNEL_SEARCH_ENTRY.handle.toLowerCase()){
    return res.status(404).json({ error: 'Канал не найден' });
  }
  const channels = getChannelsData();
  const channel = ensureChannel(channels, handle);
  channel.subscribers = channel.subscribers.filter(u => u !== req.username);
  saveJSON(CHANNELS_FILE, channels);
  res.json({ subscriberCount: channel.subscribers.length, isSubscribed: false });
});

// ==========================================================
// ИСТОРИЯ ЧАТА
// ==========================================================
app.get('/api/chat/history', authMiddleware, (req, res) => {
  const chats = loadJSON(CHATS_FILE, {});

  if(!chats[req.username]){
    chats[req.username] = [
      { id: crypto.randomUUID(), sender: 'bot', text: 'Привет! Я NovaAI, ваш помощник поддержки. Чем могу помочь?', ts: Date.now() },
      { id: crypto.randomUUID(), sender: 'bot', text: 'Следите за новостями на нашем официальном канале @NC_Official', ts: Date.now() + 1 }
    ];
    saveJSON(CHATS_FILE, chats);
  } else {
    // миграция: у старых сообщений может не быть id — добавляем на лету
    let changed = false;
    chats[req.username].forEach(m => {
      if(!m.id){ m.id = crypto.randomUUID(); changed = true; }
    });
    if(changed) saveJSON(CHATS_FILE, chats);
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

  const userMsg = { id: crypto.randomUUID(), sender: 'user', text: text.trim(), ts: Date.now() };
  chats[req.username].push(userMsg);

  const replyText = getNovaAIReply(text.trim());
  const botMsg = { id: crypto.randomUUID(), sender: 'bot', text: replyText, ts: Date.now() };
  chats[req.username].push(botMsg);

  saveJSON(CHATS_FILE, chats);
  res.json({ userMessageId: userMsg.id, reply: botMsg.text, replyId: botMsg.id, replyTs: botMsg.ts });
});

// ==========================================================
// РЕДАКТИРОВАНИЕ своего сообщения
// ==========================================================
app.put('/api/chat/message/:id', authMiddleware, (req, res) => {
  const { text } = req.body || {};
  if(!text || !text.trim()){
    return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  }

  const chats = loadJSON(CHATS_FILE, {});
  const list = chats[req.username] || [];
  const msg = list.find(m => m.id === req.params.id);
  if(!msg || msg.sender !== 'user'){
    return res.status(404).json({ error: 'Сообщение не найдено' });
  }

  msg.text = text.trim();
  msg.edited = true;
  saveJSON(CHATS_FILE, chats);

  res.json({ message: msg });
});

// ==========================================================
// УДАЛЕНИЕ своего сообщения
// ==========================================================
app.delete('/api/chat/message/:id', authMiddleware, (req, res) => {
  const chats = loadJSON(CHATS_FILE, {});
  const list = chats[req.username] || [];
  const index = list.findIndex(m => m.id === req.params.id);

  if(index === -1 || list[index].sender !== 'user'){
    return res.status(404).json({ error: 'Сообщение не найдено' });
  }

  list.splice(index, 1);
  chats[req.username] = list;
  saveJSON(CHATS_FILE, chats);

  res.json({ success: true });
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
// РЕАЛЬНАЯ ПЕРЕПИСКА МЕЖДУ ПОЛЬЗОВАТЕЛЯМИ
// Адресация запуска диалога — по публичному юзернейму (@handle).
// Но сам диалог и все дальнейшие действия (история/чтение/правка/удаление)
// адресуются по стабильному conversationId — он не ломается, даже если
// человек потом сменит или уберёт юзернейм.
// ==========================================================

function findUserByHandle(handle){
  if(!handle) return null;
  const users = loadJSON(USERS_FILE, []);
  return users.find(u => (u.handle || '').toLowerCase() === handle.toLowerCase()) || null;
}

function conversationKey(userA, userB){
  return [userA, userB].sort().join('__');
}

function loadConversations(){
  const data = loadJSON(CONVERSATIONS_FILE, {});
  let changed = false;
  Object.keys(data).forEach(key => {
    // миграция: раньше значением был просто массив сообщений — оборачиваем в { id, messages }
    if(Array.isArray(data[key])){
      data[key] = { id: crypto.randomUUID(), messages: data[key] };
      changed = true;
    } else if(!data[key].id){
      data[key].id = crypto.randomUUID();
      changed = true;
    }
  });
  if(changed) saveConversations(data);
  return data;
}
function saveConversations(data){
  saveJSON(CONVERSATIONS_FILE, data);
}

function peerUsernameFromKey(key, me){
  const parts = key.split('__');
  return parts[0] === me ? parts[1] : parts[0];
}

// находим диалог по его стабильному id — но только среди диалогов текущего пользователя
function findConversationById(conversations, id, username){
  const key = Object.keys(conversations).find(k =>
    conversations[k].id === id && k.split('__').includes(username)
  );
  if(!key) return null;
  return { key, entry: conversations[key], peerUsername: peerUsernameFromKey(key, username) };
}

function publicPeer(user){
  const normalized = normalizeUser(user);
  const v = verificationInfo(normalized);
  return {
    handle: normalized.handle,
    displayName: normalized.displayName,
    avatar: normalized.avatar,
    verified: v.verified,
    verifiedLabel: v.verifiedLabel
  };
}

// ---------- список диалогов (для сайдбара) ----------
app.get('/api/conversations', authMiddleware, (req, res) => {
  const conversations = loadConversations();
  const users = loadJSON(USERS_FILE, []);
  const me = req.username;

  const list = [];
  Object.keys(conversations).forEach(key => {
    const parts = key.split('__');
    if(!parts.includes(me)) return;
    const peerUsername = peerUsernameFromKey(key, me);
    const peerUser = users.find(u => u.username === peerUsername);
    if(!peerUser) return;

    const entry = conversations[key];
    const messages = entry.messages;
    if(!messages.length) return;
    const last = messages[messages.length - 1];
    const unreadCount = messages.filter(m => m.sender === peerUsername && m.status !== 'read').length;

    list.push({
      id: entry.id,
      ...publicPeer(peerUser),
      lastMessage: last.text,
      lastTs: last.ts,
      lastFromMe: last.sender === me,
      lastStatus: last.status,
      unreadCount
    });
  });

  list.sort((a, b) => b.lastTs - a.lastTs);
  res.json({ conversations: list });
});

// ---------- начать диалог с пользователем по его юзернейму ----------
app.post('/api/conversations/start', authMiddleware, (req, res) => {
  const { handle } = req.body || {};
  const targetUser = findUserByHandle(handle);
  if(!targetUser){
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  if(targetUser.username === req.username){
    return res.status(400).json({ error: 'Нельзя написать самому себе' });
  }

  const key = conversationKey(req.username, targetUser.username);
  const conversations = loadConversations();
  if(!conversations[key]){
    conversations[key] = { id: crypto.randomUUID(), messages: [] };
    saveConversations(conversations);
  }

  res.json({ id: conversations[key].id, ...publicPeer(targetUser) });
});

// ---------- история переписки по id диалога ----------
app.get('/api/conversations/:id/history', authMiddleware, (req, res) => {
  const conversations = loadConversations();
  const found = findConversationById(conversations, req.params.id, req.username);
  if(!found){
    return res.status(404).json({ error: 'Диалог не найден' });
  }
  const users = loadJSON(USERS_FILE, []);
  const peerUser = users.find(u => u.username === found.peerUsername);

  res.json({
    peer: peerUser ? publicPeer(peerUser) : null,
    messages: found.entry.messages.map(m => ({
      id: m.id,
      sender: m.sender === req.username ? 'me' : 'them',
      text: m.text,
      ts: m.ts,
      status: m.status,
      edited: !!m.edited
    }))
  });
});

// ---------- отметить входящие сообщения в этом диалоге как прочитанные ----------
app.post('/api/conversations/:id/read', authMiddleware, (req, res) => {
  const conversations = loadConversations();
  const found = findConversationById(conversations, req.params.id, req.username);
  if(!found){
    return res.status(404).json({ error: 'Диалог не найден' });
  }

  let changed = false;
  found.entry.messages.forEach(m => {
    if(m.sender === found.peerUsername && m.status !== 'read'){
      m.status = 'read';
      changed = true;
    }
  });
  if(changed){
    saveConversations(conversations);
    notifyUser(found.peerUsername, { type: 'read', conversationId: found.entry.id });
  }
  res.json({ success: true });
});

// ---------- редактирование своего сообщения в диалоге ----------
app.put('/api/conversations/:id/message/:msgId', authMiddleware, (req, res) => {
  const { text } = req.body || {};
  if(!text || !text.trim()){
    return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  }
  const conversations = loadConversations();
  const found = findConversationById(conversations, req.params.id, req.username);
  if(!found){
    return res.status(404).json({ error: 'Диалог не найден' });
  }
  const msg = found.entry.messages.find(m => m.id === req.params.msgId);
  if(!msg || msg.sender !== req.username){
    return res.status(404).json({ error: 'Сообщение не найдено' });
  }
  msg.text = text.trim();
  msg.edited = true;
  saveConversations(conversations);

  notifyUser(found.peerUsername, { type: 'edit', id: msg.id, text: msg.text, conversationId: found.entry.id });

  res.json({ message: { id: msg.id, sender: 'me', text: msg.text, ts: msg.ts, status: msg.status, edited: true } });
});

// ---------- удаление своего сообщения в диалоге ----------
app.delete('/api/conversations/:id/message/:msgId', authMiddleware, (req, res) => {
  const conversations = loadConversations();
  const found = findConversationById(conversations, req.params.id, req.username);
  if(!found){
    return res.status(404).json({ error: 'Диалог не найден' });
  }
  const index = found.entry.messages.findIndex(m => m.id === req.params.msgId);
  if(index === -1 || found.entry.messages[index].sender !== req.username){
    return res.status(404).json({ error: 'Сообщение не найдено' });
  }
  found.entry.messages.splice(index, 1);
  saveConversations(conversations);

  notifyUser(found.peerUsername, { type: 'delete', id: req.params.msgId, conversationId: found.entry.id });

  res.json({ success: true });
});

// ==========================================================
// WEBSOCKET — доставка сообщений и статусов в реальном времени
// ==========================================================
const onlineClients = new Map(); // username -> Set<ws>

function registerClient(username, ws){
  if(!onlineClients.has(username)) onlineClients.set(username, new Set());
  onlineClients.get(username).add(ws);
}
function unregisterClient(username, ws){
  const set = onlineClients.get(username);
  if(!set) return;
  set.delete(ws);
  if(set.size === 0) onlineClients.delete(username);
}
function notifyUser(username, payload){
  const set = onlineClients.get(username);
  if(!set) return;
  const json = JSON.stringify(payload);
  set.forEach(client => {
    if(client.readyState === client.OPEN) client.send(json);
  });
}

// при подключении — все ранее отправленные (но ещё не доставленные) сообщения
// для этого пользователя считаются доставленными, отправителям летит уведомление
function markPendingAsDelivered(username){
  const conversations = loadConversations();
  let changed = false;

  Object.keys(conversations).forEach(key => {
    if(!key.split('__').includes(username)) return;
    const entry = conversations[key];
    entry.messages.forEach(m => {
      if(m.sender !== username && m.status === 'sent'){
        m.status = 'delivered';
        changed = true;
        notifyUser(m.sender, { type: 'status', conversationId: entry.id, id: m.id, status: 'delivered' });
      }
    });
  });

  if(changed) saveConversations(conversations);
}

function handleIncomingMessage(fromUsername, data, ws){
  const conversations = loadConversations();
  const found = findConversationById(conversations, data.conversationId, fromUsername);
  if(!found){
    ws.send(JSON.stringify({ type: 'error', tempId: data.tempId, error: 'Диалог не найден' }));
    return;
  }
  const text = (data.text || '').trim();
  if(!text) return;

  const delivered = onlineClients.has(found.peerUsername);
  const msg = {
    id: crypto.randomUUID(),
    sender: fromUsername,
    text,
    ts: Date.now(),
    status: delivered ? 'delivered' : 'sent'
  };
  found.entry.messages.push(msg);
  saveConversations(conversations);

  // подтверждение отправителю (заменяет временное сообщение на настоящее, с id и статусом)
  ws.send(JSON.stringify({
    type: 'ack',
    tempId: data.tempId,
    message: { id: msg.id, sender: 'me', text: msg.text, ts: msg.ts, status: msg.status }
  }));

  const users = loadJSON(USERS_FILE, []);
  const senderUser = users.find(u => u.username === fromUsername);

  notifyUser(found.peerUsername, {
    type: 'message',
    conversationId: found.entry.id,
    message: { id: msg.id, sender: 'them', text: msg.text, ts: msg.ts, status: msg.status },
    senderInfo: senderUser ? publicPeer(senderUser) : null
  });
}

function handleReadReceipt(username, data){
  const conversations = loadConversations();
  const found = findConversationById(conversations, data.conversationId, username);
  if(!found) return;

  let changed = false;
  found.entry.messages.forEach(m => {
    if(m.sender === found.peerUsername && m.status !== 'read'){
      m.status = 'read';
      changed = true;
    }
  });
  if(changed){
    saveConversations(conversations);
    notifyUser(found.peerUsername, { type: 'read', conversationId: found.entry.id });
  }
}

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  let username = null;
  try{
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const payload = jwt.verify(token, JWT_SECRET);
    username = payload.username;
  }catch(e){
    ws.close(4001, 'unauthorized');
    return;
  }

  registerClient(username, ws);
  markPendingAsDelivered(username);

  ws.on('message', (raw) => {
    let data;
    try{ data = JSON.parse(raw); }catch(e){ return; }

    if(data.type === 'message'){
      handleIncomingMessage(username, data, ws);
    } else if(data.type === 'read'){
      handleReadReceipt(username, data);
    }
  });

  ws.on('close', () => unregisterClient(username, ws));
});

server.listen(PORT, () => {
  console.log(`NovaChat запущен: http://localhost:${PORT}`);
});