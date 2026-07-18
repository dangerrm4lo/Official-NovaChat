// ==========================================================
// chat.js — логика страницы чатов
// ==========================================================

const token = localStorage.getItem('novachat_token');

if(!token){
  window.location.href = 'index.html';
}

const messagesEl = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const sidebarPreview = document.getElementById('sidebarPreview');
const toastEl = document.getElementById('toast');

let currentProfile = { displayName: '', handle: null, bio: '', avatar: null };
let avatarValue = null; // значение аватарки, редактируемое в модалке (до сохранения)

function showToast(text){
  toastEl.textContent = text;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function formatTime(ts){
  const d = new Date(ts);
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function updateSidebarTime(ts){
  const el = document.getElementById('sidebarTime');
  if(el) el.textContent = formatTime(ts);
}

async function apiFetch(url, options = {}){
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': 'Bearer ' + token
    }
  });
  if(res.status === 401){
    localStorage.removeItem('novachat_token');
    window.location.href = 'index.html';
    throw new Error('unauthorized');
  }
  return res;
}

// ==========================================================
// СООБЩЕНИЯ
// ==========================================================
function renderMessage(msg){
  const row = document.createElement('div');
  row.className = 'msg-row ' + (msg.sender === 'user' ? 'user' : 'bot');

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = msg.text;

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = formatTime(msg.ts);

  row.appendChild(bubble);
  row.appendChild(time);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showTyping(){
  const typing = document.createElement('div');
  typing.className = 'typing';
  typing.id = 'typingIndicator';
  typing.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideTyping(){
  const el = document.getElementById('typingIndicator');
  if(el) el.remove();
}

(async function loadHistory(){
  try{
    const res = await apiFetch('/api/chat/history');
    const data = await res.json();
    data.messages.forEach(renderMessage);
    if(data.messages.length){
      const last = data.messages[data.messages.length - 1];
      sidebarPreview.textContent = last.text;
      updateSidebarTime(last.ts);
    }
  }catch(e){
    console.error('Не удалось загрузить историю', e);
  }
})();

async function sendMessage(){
  const text = messageInput.value.trim();
  if(!text) return;

  const userTs = Date.now();
  renderMessage({ sender: 'user', text, ts: userTs });
  sidebarPreview.textContent = text;
  updateSidebarTime(userTs);
  messageInput.value = '';
  showTyping();

  try{
    const res = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    hideTyping();
    const botTs = Date.now();
    renderMessage({ sender: 'bot', text: data.reply, ts: botTs });
    sidebarPreview.textContent = data.reply;
    updateSidebarTime(botTs);
  }catch(e){
    hideTyping();
    renderMessage({ sender: 'bot', text: 'NovaAI сейчас недоступен. Попробуйте позже.', ts: Date.now() });
  }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter') sendMessage();
});

// ==========================================================
// ПОИСК ПО ЧАТАМ
// ==========================================================
const chatSearchInput = document.getElementById('chatSearch');
const chatListEmpty = document.getElementById('chatListEmpty');

chatSearchInput.addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase().replace(/^@/, '');
  const items = document.querySelectorAll('.chat-item');
  let visibleCount = 0;

  items.forEach(item => {
    const haystack = item.dataset.search || '';
    const match = !q || haystack.includes(q);
    item.classList.toggle('hidden', !match);
    if(match) visibleCount++;
  });

  chatListEmpty.classList.toggle('show', visibleCount === 0);
});

// ==========================================================
// ЗНАЧОК ВЕРИФИКАЦИИ — всплывающая подсказка
// ==========================================================
const popoverEl = document.getElementById('verifiedPopover');

function showPopover(targetEl){
  const rect = targetEl.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - 236);
  popoverEl.style.left = Math.max(left, 8) + 'px';
  popoverEl.style.top = (rect.bottom + 8) + 'px';
  popoverEl.classList.add('show');
}
function hidePopover(){
  popoverEl.classList.remove('show');
}

function bindVerifiedBadge(btn){
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if(popoverEl.classList.contains('show')){
      hidePopover();
    } else {
      showPopover(btn);
    }
  });
}

document.querySelectorAll('[data-verified-trigger]').forEach(bindVerifiedBadge);

document.addEventListener('click', (e) => {
  if(!popoverEl.contains(e.target)) hidePopover();
});

// ==========================================================
// ПЕРЕКЛЮЧАТЕЛЬ ТЕМЫ
// ==========================================================
const themeToggle = document.getElementById('themeToggle');
const knob = themeToggle.querySelector('.knob');

function applyTheme(theme){
  document.body.classList.toggle('theme-dark', theme === 'dark');
  themeToggle.classList.toggle('dark', theme === 'dark');
  knob.innerHTML = theme === 'dark'
  ? 'svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
  : 'svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>';
}

const savedTheme = localStorage.getItem('novachat_theme') || 'light';
applyTheme(savedTheme);

themeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.contains('theme-dark');
  const next = isDark ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('novachat_theme', next);
});

// ==========================================================
// НАСТРОЙКИ (пока заглушка)
// ==========================================================
document.getElementById('settingsBtn').addEventListener('click', () => {
  showToast('Настройки скоро будут добавлены!')
});

// ==========================================================
// ПРОФИЛЬ
// ==========================================================
function updateProfileButton(profile){
  const btn = document.getElementById('profileBtn');
  const initialEl = document.getElementById('profileBtnInitial');
  if(profile.avatar){
    btn.style.backgroundImage = `url(${profile.avatar})`;
    initialEl.style.display = 'none';
  } else {
    btn.style.backgroundImage = 'none';
    initialEl.style.display = 'block';
    initialEl.textContent = (profile.displayName || '?').trim().charAt(0).toUpperCase();
  }
}

function applyAvatarPreview(url, fallbackName){
  const el = document.getElementById('avatarPreview');
  if(url){
    el.style.backgroundImage = `url(${url})`;
    el.textContent = '';
  } else {
    el.style.backgroundImage = 'none';
    el.textContent = (fallbackName || currentProfile.displayName || '?').trim().charAt(0).toUpperCase();
  }
}

(async function loadProfile(){
  try{
    const res = await apiFetch('/api/profile');
    currentProfile = await res.json();
    updateProfileButton(currentProfile);
  }catch(e){
    console.error('Не удалось загрузить профиль', e);
  }
})();

function openProfileModal(){
  document.getElementById('profileError').textContent = '';
  document.getElementById('displayNameInput').value = currentProfile.displayName || '';
  document.getElementById('handleInput').value = currentProfile.handle || '';
  document.getElementById('bioInput').value = currentProfile.bio || '';
  document.getElementById('bioCounter').textContent = (currentProfile.bio || '').length + ' / 200';

  const statusEl = document.getElementById('handleStatus');
  statusEl.textContent = '';
  statusEl.className = 'handle-status';
  document.getElementById('handleSpinner').classList.remove('show');

  avatarValue = currentProfile.avatar || null;
  applyAvatarPreview(avatarValue, currentProfile.displayName);

  document.getElementById('profileModalOverlay').classList.add('show');
}

function closeProfileModal(){
  document.getElementById('profileModalOverlay').classList.remove('show');
}

document.getElementById('closeProfileModal').addEventListener('click', closeProfileModal);
document.getElementById('cancelProfileBtn').addEventListener('click', closeProfileModal);
document.getElementById('profileModalOverlay').addEventListener('click', (e) => {
  if(e.target.id === 'profileModalOverlay') closeProfileModal();
});

// ---------- аватар: выбор и изменение размера файла ----------
function resizeImageFile(file, size = 200){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

document.getElementById('avatarEditBtn').addEventListener('click', () => {
  document.getElementById('avatarInput').click();
});

document.getElementById('avatarInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const errorEl = document.getElementById('profileError');
  errorEl.textContent = '';

  if(!file.type.startsWith('image/')){
    errorEl.textContent = 'Выберите файл изображения';
    return;
  }
  if(file.size > 4 * 1024 * 1024){
    errorEl.textContent = 'Файл слишком большой (максимум 4 МБ)';
    return;
  }

  try{
    const dataUrl = await resizeImageFile(file, 200);
    avatarValue = dataUrl;
    applyAvatarPreview(dataUrl);
  }catch(err){
    errorEl.textContent = 'Не удалось обработать изображение';
  }
});

document.getElementById('avatarRemoveBtn').addEventListener('click', () => {
  avatarValue = null;
  applyAvatarPreview(null, document.getElementById('displayNameInput').value);
});

// ---------- юзернейм: проверка доступности на лету ----------
let handleDebounceTimer = null;

document.getElementById('handleInput').addEventListener('input', (e) => {
  const val = e.target.value.replace(/^@+/, '').toLowerCase();
  e.target.value = val;

  const statusEl = document.getElementById('handleStatus');
  const spinnerEl = document.getElementById('handleSpinner');
  clearTimeout(handleDebounceTimer);

  if(!val){
    statusEl.textContent = '';
    statusEl.className = 'handle-status';
    spinnerEl.classList.remove('show');
    return;
  }
  if(val === (currentProfile.handle || '')){
    statusEl.textContent = 'Это ваш текущий юзернейм';
    statusEl.className = 'handle-status';
    spinnerEl.classList.remove('show');
    return;
  }
  if(!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(val)){
    statusEl.textContent = 'Только буквы, цифры и _, от 5 до 32 символов, начиная с буквы';
    statusEl.className = 'handle-status bad';
    spinnerEl.classList.remove('show');
    return;
  }

  statusEl.textContent = '';
  statusEl.className = 'handle-status';
  spinnerEl.classList.add('show');

  handleDebounceTimer = setTimeout(async () => {
    try{
      const res = await apiFetch('/api/check-handle/' + encodeURIComponent(val));
      const data = await res.json();
      spinnerEl.classList.remove('show');
      if(data.available){
        statusEl.textContent = 'Свободно';
        statusEl.className = 'handle-status ok';
      } else {
        statusEl.textContent = data.reason || 'Занято';
        statusEl.className = 'handle-status bad';
      }
    }catch(err){
      spinnerEl.classList.remove('show');
    }
  }, 450);
});

// ---------- био: счётчик символов ----------
document.getElementById('bioInput').addEventListener('input', (e) => {
  document.getElementById('bioCounter').textContent = e.target.value.length + ' / 200';
});

// ---------- сохранение профиля ----------
document.getElementById('saveProfileBtn').addEventListener('click', async () => {
  const displayName = document.getElementById('displayNameInput').value.trim();
  const handle = document.getElementById('handleInput').value.trim();
  const bio = document.getElementById('bioInput').value.trim();
  const errorEl = document.getElementById('profileError');
  errorEl.textContent = '';

  if(!displayName){
    errorEl.textContent = 'Введите имя';
    return;
  }

  try{
    const res = await apiFetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, handle, bio, avatar: avatarValue })
    });
    const data = await res.json();

    if(!res.ok){
      errorEl.textContent = data.error || 'Не удалось сохранить профиль';
      return;
    }

    currentProfile = data;
    updateProfileButton(currentProfile);
    closeProfileModal();
    showToast('Профиль обновлён');
  }catch(err){
    errorEl.textContent = 'Сервер недоступен. Попробуйте позже.';
  }
});

// ==========================================================
// ПРОСМОТР ПРОФИЛЯ (свой профиль или профиль бота)
// ==========================================================
const BOT_PROFILE = {
  isBot: true,
  verified: true,
  displayName: 'NovaAI',
  handle: 'NovaChat',
  bio: 'Официальный бот поддержки NovaChat. Отвечает на сообщения и помогает разобраться с сайтом.',
  avatar: null
};

const viewProfileModalOverlay = document.getElementById('viewProfileModalOverlay');
const viewProfileAvatar = document.getElementById('viewProfileAvatar');
const viewProfileName = document.getElementById('viewProfileName');
const viewProfileHandle = document.getElementById('viewProfileHandle');
const viewProfileBio = document.getElementById('viewProfileBio');
const viewProfileTabs = document.getElementById('viewProfileTabs');
const viewProfileFooter = document.getElementById('viewProfileFooter');

function openViewProfile(profile){
  viewProfileAvatar.classList.toggle('avatar-bot', !!profile.isBot);

  if(profile.isBot){
    viewProfileAvatar.style.backgroundImage = '';
    viewProfileAvatar.textContent = '';
  } else if(profile.avatar){
    viewProfileAvatar.style.backgroundImage = `url(${profile.avatar})`;
    viewProfileAvatar.textContent = '';
  } else {
    viewProfileAvatar.style.backgroundImage = 'none';
    viewProfileAvatar.textContent = (profile.displayName || '?').trim().charAt(0).toUpperCase();
  };
}