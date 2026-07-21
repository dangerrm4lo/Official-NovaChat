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
const toastEl = document.getElementById('toast');
const chatListEl = document.getElementById('chatList');
const appEl = document.querySelector('.app');

const CHECK_SVG = '<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>';
const TICK_SINGLE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>';
const TICK_DOUBLE = '<svg viewBox="0 0 24 24" width="18" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L7 17l-5-5"></path><path d="M23 6L12 17l-1-1"></path></svg>';

let currentProfile = { displayName: '', handle: null, bio: '', avatar: null, verified: false, verifiedLabel: null };
let avatarValue = null;
let activeChat = { type: 'bot' };
let conversationsCache = [];
let currentViewedHandle = null;

function showToast(text){
  toastEl.textContent = text;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function formatTime(ts){
  const d = new Date(ts);
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
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
// ЗНАЧОК ВЕРИФИКАЦИИ
// ==========================================================
const popoverEl = document.getElementById('verifiedPopover');

function showPopover(targetEl, text){
  popoverEl.textContent = text;
  const rect = targetEl.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - 236);
  popoverEl.style.left = Math.max(left, 8) + 'px';
  popoverEl.style.top = (rect.bottom + 8) + 'px';
  popoverEl.classList.add('show');
}
function hidePopover(){ popoverEl.classList.remove('show'); }

function bindVerifiedBadge(btn){
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const text = btn.dataset.verifiedText || 'Подтверждённый аккаунт.';
    if(popoverEl.classList.contains('show') && popoverEl.dataset.owner === btn){
      hidePopover();
    } else {
      showPopover(btn, text);
      popoverEl.dataset.owner = btn;
    }
  });
}
document.addEventListener('click', (e) => {
  if(!popoverEl.contains(e.target)) hidePopover();
});

// ==========================================================
// МОБИЛЬНАЯ РАСКЛАДКА
// ==========================================================
function openChatOnMobile(){ appEl.classList.add('mobile-chat-open'); }
function backToListOnMobile(){ appEl.classList.remove('mobile-chat-open'); }
document.getElementById('mobileBackBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  backToListOnMobile();
});

// ==========================================================
// ШАПКА ДИАЛОГА
// ==========================================================
function updateConversationHeader(chat){
  const avatarEl = document.getElementById('chatHeaderAvatar');
  const nameEl = document.getElementById('chatHeaderName');
  nameEl.innerHTML = '';
  avatarEl.style.backgroundImage = 'none';
  avatarEl.textContent = '';

  if(chat.type === 'bot'){
    avatarEl.className = 'avatar avatar-sm avatar-bot';
    nameEl.appendChild(document.createTextNode('NovaAI'));
    appendVerifiedBadge(nameEl, 'Это подтверждённый бот NovaChat.');
  } else {
    avatarEl.className = 'avatar avatar-sm';
    if(chat.avatar){
      avatarEl.style.backgroundImage = `url(${chat.avatar})`;
    } else {
      avatarEl.textContent = (chat.displayName || '?').trim().charAt(0).toUpperCase();
    }
    nameEl.appendChild(document.createTextNode(chat.displayName || ''));
    if(chat.verified){
      appendVerifiedBadge(nameEl, chat.verifiedLabel || 'Подтверждённый аккаунт.');
    }
  }
}

function appendVerifiedBadge(container, text){
  const badge = document.createElement('button');
  badge.className = 'verified-badge';
  badge.setAttribute('data-verified-trigger', '');
  badge.title = 'Подтверждённый аккаунт';
  badge.dataset.verifiedText = text;
  badge.innerHTML = CHECK_SVG;
  container.appendChild(badge);
  bindVerifiedBadge(badge);
}

document.getElementById('conversationHeader').addEventListener('click', () => {
  if(activeChat.type === 'bot'){
    openViewProfile(BOT_PROFILE);
  } else {
    openViewProfile({ kind: 'user', ...activeChat });
  }
});

// ==========================================================
// СПИСОК ЧАТОВ (бот + реальные переписки)
// ==========================================================
function buildBotChatItem(){
  const item = document.createElement('div');
  item.className = 'chat-item';
  item.dataset.chatKey = 'bot';
  item.dataset.search = 'novaai novachat support бот нова помощь';

  const avatar = document.createElement('div');
  avatar.className = 'avatar avatar-bot';
  avatar.innerHTML = '<span class="status-dot"></span>';

  const body = document.createElement('div');
  body.className = 'chat-item-body';

  const top = document.createElement('div');
  top.className = 'chat-item-top';
  const nameEl = document.createElement('span');
  nameEl.className = 'chat-item-name';
  nameEl.appendChild(document.createTextNode('NovaAI'));
  appendVerifiedBadge(nameEl, 'Это подтверждённый бот NovaChat.');
  top.appendChild(nameEl);
  const timeEl = document.createElement('span');
  timeEl.className = 'chat-item-time';
  timeEl.id = 'sidebarTime';
  top.appendChild(timeEl);

  const bottom = document.createElement('div');
  bottom.className = 'chat-item-bottom';
  const preview = document.createElement('span');
  preview.className = 'chat-item-preview';
  preview.id = 'sidebarPreview';
  preview.textContent = 'Чем могу помочь?';
  bottom.appendChild(preview);

  body.appendChild(top);
  body.appendChild(bottom);
  item.appendChild(avatar);
  item.appendChild(body);

  item.addEventListener('click', () => switchToChat({ type: 'bot' }));
  return item;
}

function buildConversationItem(conv){
  const item = document.createElement('div');
  item.className = 'chat-item';
  item.dataset.chatKey = 'user:' + conv.id;
  item.dataset.search = (conv.handle + ' ' + conv.displayName).toLowerCase();

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if(conv.avatar){
    avatar.style.backgroundImage = `url(${conv.avatar})`;
  } else {
    avatar.textContent = (conv.displayName || '?').trim().charAt(0).toUpperCase();
  }

  const body = document.createElement('div');
  body.className = 'chat-item-body';

  const top = document.createElement('div');
  top.className = 'chat-item-top';
  const nameEl = document.createElement('span');
  nameEl.className = 'chat-item-name';
  nameEl.appendChild(document.createTextNode(conv.displayName || ''));
  if(conv.verified){
    appendVerifiedBadge(nameEl, conv.verifiedLabel || 'Подтверждённый аккаунт.');
  }
  top.appendChild(nameEl);
  const timeEl = document.createElement('span');
  timeEl.className = 'chat-item-time';
  timeEl.textContent = formatTime(conv.lastTs);
  top.appendChild(timeEl);
  const bottom = document.createElement('div');
  bottom.className = 'chat-item-bottom';
  const preview = document.createElement('span');
  preview.className = 'chat-item-preview';
  preview.textContent = (conv.lastFromMe ? 'Вы: ' : '') + conv.lastMessage;
  bottom.appendChild(preview);
  if(conv.unreadCount > 0){
    const unread = document.createElement('span');
    unread.className = 'unread-badge';
    unread.textContent = conv.unreadCount;
    bottom.appendChild(unread);
  }

  body.appendChild(top);
  body.appendChild(bottom);
  item.appendChild(avatar);
  item.appendChild(body);

  item.addEventListener('click', () => switchToChat({
    type: 'user',
    conversationId: conv.id,
    handle: conv.handle,
    displayName: conv.displayName,
    avatar: conv.avatar,
    verified: conv.verified,
    verifiedLabel: conv.verifiedLabel
  }));

  return item;
}

function renderChatList(){
  chatListEl.innerHTML = '';
  chatListEl.appendChild(buildBotChatItem());
  conversationsCache.forEach(conv => chatListEl.appendChild(buildConversationItem(conv)));
  updateActiveHighlight();
}

function updateActiveHighlight(){
  const key = activeChat.type === 'bot' ? 'bot' : 'user:' + activeChat.conversationId;
  document.querySelectorAll('#chatList > .chat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.chatKey === key);
  });
}

async function refreshConversations(){
  try{
    const res = await apiFetch('/api/conversations');
    const data = await res.json();
    conversationsCache = data.conversations;
    renderChatList();
  }catch(e){ /* тихо игнорируем */ }
}

// ==========================================================
// ПЕРЕКЛЮЧЕНИЕ АКТИВНОГО ЧАТА
// ==========================================================
async function switchToChat(chat){
  activeChat = chat;
  updateActiveHighlight();
  updateConversationHeader(chat);
  messagesEl.innerHTML = '';
  openChatOnMobile();

  if(chat.type === 'bot'){
    await loadHistory();
  } else {
    await loadConversationHistory(chat.conversationId);
    sendReadReceipt(chat.conversationId);
  }
}

// ==========================================================
// СООБЩЕНИЯ — общий рендер
// ==========================================================
function renderMessage(m){
  const row = document.createElement('div');
  row.className = 'msg-row ' + (m.who === 'me' ? 'me' : 'other');
  row.dataset.msgId = m.id || '';

  const avatar = document.createElement('div');
  avatar.className = 'avatar msg-avatar';
  if(m.who === 'me'){
    if(currentProfile.avatar){
      avatar.style.backgroundImage = `url(${currentProfile.avatar})`;
    } else {
      avatar.textContent = (currentProfile.displayName || '?').trim().charAt(0).toUpperCase();
    }
  } else if(activeChat.type === 'bot'){
    avatar.classList.add('avatar-bot');
  } else if(activeChat.avatar){
    avatar.style.backgroundImage = `url(${activeChat.avatar})`;
  } else {
    avatar.textContent = (activeChat.displayName || '?').trim().charAt(0).toUpperCase();
  }

  const content = document.createElement('div');
  content.className = 'msg-content';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = m.text;

  const timeRow = document.createElement('div');
  timeRow.className = 'msg-time';
  timeRow.textContent = formatTime(m.ts) + (m.edited ? ' · изменено' : '');
  if(m.who === 'me' && m.status){
    timeRow.appendChild(buildTicks(m.status));
  }

  content.appendChild(bubble);
  content.appendChild(timeRow);

  if(m.who === 'me'){
    row.appendChild(content);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(content);
  }

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return row;
}

function buildTicks(status){
  const span = document.createElement('span');
  span.className = 'msg-ticks' + (status === 'read' ? ' read' : '');
  span.innerHTML = status === 'sent' ? TICK_SINGLE : TICK_DOUBLE;
  return span;
}

function updateTicks(row, status){
  const timeEl = row.querySelector('.msg-time');
  if(!timeEl) return;
  let ticksEl = timeEl.querySelector('.msg-ticks');
  if(!ticksEl){
    ticksEl = document.createElement('span');
    timeEl.appendChild(ticksEl);
  }
  ticksEl.className = 'msg-ticks' + (status === 'read' ? ' read' : '');
  ticksEl.innerHTML = status === 'sent' ? TICK_SINGLE : TICK_DOUBLE;
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

// ==========================================================
// ЧАТ С БОТОМ
// ==========================================================
async function loadHistory(){
  try{
    const res = await apiFetch('/api/chat/history');
    const data = await res.json();
    data.messages.forEach(m => renderMessage({
      id: m.id, who: m.sender === 'user' ? 'me' : 'other', text: m.text, ts: m.ts, edited: m.edited
    }));
    updateBotSidebarPreview(data.messages);
  }catch(e){
    console.error('Не удалось загрузить историю', e);
  }
}

function updateBotSidebarPreview(messages){
  if(!messages.length) return;
  const last = messages[messages.length - 1];
  const preview = document.getElementById('sidebarPreview');
  const time = document.getElementById('sidebarTime');
  if(preview) preview.textContent = last.text;
  if(time) time.textContent = formatTime(last.ts);
}

async function sendMessageToBot(text){
  showTyping();
  try{
    const res = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    hideTyping();

    renderMessage({ id: data.userMessageId, who: 'me', text, ts: Date.now() });
    renderMessage({ id: data.replyId, who: 'other', text: data.reply, ts: data.replyTs || Date.now() });

    const preview = document.getElementById('sidebarPreview');
    const time = document.getElementById('sidebarTime');
    if(preview) preview.textContent = data.reply;
    if(time) time.textContent = formatTime(data.replyTs || Date.now());
  }catch(e){
    hideTyping();
    renderMessage({ who: 'other', text: 'NovaAI сейчас недоступен. Попробуйте позже.', ts: Date.now() });
  }
}

// ==========================================================
// РЕАЛЬНАЯ ПЕРЕПИСКА С ЧЕЛОВЕКОМ (адресация — по conversationId)
// ==========================================================
async function loadConversationHistory(id){
  try{
    const res = await apiFetch('/api/conversations/' + encodeURIComponent(id) + '/history');
    const data = await res.json();
    data.messages.forEach(m => renderMessage({
      id: m.id, who: m.sender === 'me' ? 'me' : 'other', text: m.text, ts: m.ts, status: m.status, edited: m.edited
    }));
  }catch(e){
    console.error('Не удалось загрузить переписку', e);
  }
}

function sendMessageToUser(conversationId, text){
  const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  renderMessage({ id: tempId, who: 'me', text, ts: Date.now(), status: 'sent' });

  if(ws && ws.readyState === WebSocket.OPEN){
    ws.send(JSON.stringify({ type: 'message', conversationId, text, tempId }));
  } else {
    showToast('Нет соединения с сервером. Переподключаемся…');
  }
}

function sendReadReceipt(conversationId){
  if(ws && ws.readyState === WebSocket.OPEN){
    ws.send(JSON.stringify({ type: 'read', conversationId }));
  }
  apiFetch('/api/conversations/' + encodeURIComponent(conversationId) + '/read', { method: 'POST' }).catch(() => {});
}

// ==========================================================
// ОТПРАВКА СООБЩЕНИЯ (общий вход для композера)
// ==========================================================
function sendMessage(){
  const text = messageInput.value.trim();
  if(!text) return;
  messageInput.value = '';
  if(activeChat.type === 'bot'){
    sendMessageToBot(text);
  } else {
    sendMessageToUser(activeChat.conversationId, text);
  }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter') sendMessage();
});

// ---------- контекстное меню (правая кнопка мыши) — только свои сообщения ----------
const msgContextMenu = document.getElementById('msgContextMenu');
let contextTargetRow = null;

messagesEl.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.msg-row.me');
  if(!row || !row.dataset.msgId || row.dataset.msgId.startsWith('temp-')) return;
  e.preventDefault();
  contextTargetRow = row;
  const x = Math.min(e.clientX, window.innerWidth - 190);
  const y = Math.min(e.clientY, window.innerHeight - 100);
  msgContextMenu.style.left = x + 'px';
  msgContextMenu.style.top = y + 'px';
  msgContextMenu.classList.add('show');
});
document.addEventListener('click', () => msgContextMenu.classList.remove('show'));

function messageEndpoint(id){
  return activeChat.type === 'bot'
    ? '/api/chat/message/' + encodeURIComponent(id)
    : '/api/conversations/' + encodeURIComponent(activeChat.conversationId) + '/message/' + encodeURIComponent(id);
}

msgContextMenu.querySelector('[data-action="edit"]').addEventListener('click', () => {
  if(contextTargetRow) startEditMessage(contextTargetRow);
});
msgContextMenu.querySelector('[data-action="delete"]').addEventListener('click', () => {
  if(contextTargetRow) deleteMessage(contextTargetRow);
});

function startEditMessage(row){
  const id = row.dataset.msgId;
  const bubble = row.querySelector('.bubble');
  const oldText = bubble.textContent;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-input';
  input.value = oldText;
  input.maxLength = 1000;

  bubble.replaceWith(input);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  let done = false;
  async function commit(){
    if(done) return;
    done = true;
    const newText = input.value.trim();

    if(!newText || newText === oldText){
      input.replaceWith(bubble);
      return;
    }
    try{
      const res = await apiFetch(messageEndpoint(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText })
      });
      const data = await res.json();
      if(res.ok){
        bubble.textContent = data.message.text;
        const timeEl = row.querySelector('.msg-time');
        if(timeEl){
          const ticks = timeEl.querySelector('.msg-ticks');
          timeEl.textContent = formatTime(data.message.ts) + ' · изменено';
          if(ticks) timeEl.appendChild(ticks);
        }
      }
    }catch(err){ /* оставляем как есть, если сервер недоступен */ }
    input.replaceWith(bubble);
  }

  input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); commit(); }
    if(e.key === 'Escape'){ input.value = oldText; commit(); }
  });
  input.addEventListener('blur', commit);
}

async function deleteMessage(row){
  const id = row.dataset.msgId;
  try{
    await apiFetch(messageEndpoint(id), { method: 'DELETE' });
  }catch(err){ /* анимация всё равно уберёт сообщение визуально */ }
  shatterRow(row);
}

// ---------- "эффект Таноса" — сообщение рассыпается на частицы ----------
function shatterRow(row){
  const bubble = row.querySelector('.bubble') || row.querySelector('.edit-input');
  if(!bubble){ row.remove(); return; }

  const rect = bubble.getBoundingClientRect();
  const style = getComputedStyle(bubble);
  const bgImage = style.backgroundImage;
  const bgColor = style.backgroundColor;

  const cols = 7, rows = 5;
  const pieceW = rect.width / cols;
  const pieceH = rect.height / rows;

  const container = document.createElement('div');
  container.className = 'shatter-container';
  container.style.left = rect.left + 'px';
  container.style.top = rect.top + 'px';
  container.style.width = rect.width + 'px';
  container.style.height = rect.height + 'px';

  for(let r = 0; r < rows; r++){
    for(let c = 0; c < cols; c++){
      const piece = document.createElement('span');
      piece.className = 'shatter-piece';
      piece.style.left = (c * pieceW) + 'px';
      piece.style.top = (r * pieceH) + 'px';
      piece.style.width = Math.ceil(pieceW) + 'px';
      piece.style.height = Math.ceil(pieceH) + 'px';

      if(bgImage && bgImage !== 'none'){
        piece.style.backgroundImage = bgImage;
        piece.style.backgroundSize = rect.width + 'px ' + rect.height + 'px';
        piece.style.backgroundPosition = (-c * pieceW) + 'px ' + (-r * pieceH) + 'px';
      } else {
        piece.style.background = bgColor;
      }

      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 70;
      const dx = (Math.cos(angle) * dist).toFixed(1) + 'px';
      const dy = (Math.sin(angle) * dist - 25).toFixed(1) + 'px';
      const rot = (Math.random() * 140 - 70).toFixed(0) + 'deg';
      piece.style.setProperty('--dx', dx);
      piece.style.setProperty('--dy', dy);
      piece.style.setProperty('--rot', rot);
      piece.style.animationDelay = Math.round(Math.random() * 150) + 'ms';

      container.appendChild(piece);
    }
  }

  document.body.appendChild(container);
  row.style.visibility = 'hidden';

  setTimeout(() => {
    container.remove();
    row.remove();
  }, 950);
}

// ==========================================================
// WEBSOCKET
// ==========================================================
let ws = null;
let wsReconnectTimer = null;

function connectWebSocket(){
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);

  ws.onopen = () => {
    clearTimeout(wsReconnectTimer);
  };

  ws.onmessage = (event) => {
    let data;
    try{ data = JSON.parse(event.data); }catch(e){ return; }

    if(data.type === 'ack'){
      const row = messagesEl.querySelector([`data-msg-id="${CSS.escape(data.tempId)}"`]);
      if(row){
        row.dataset.msgId = data.message.id;
        updateTicks(row, data.message.status);
      }
      refreshConversations();

    } else if(data.type === 'message'){
      if(activeChat.type === 'user' && activeChat.conversationId === data.conversationId){
        renderMessage({ id: data.message.id, who: 'other', text: data.message.text, ts: data.message.ts });
        sendReadReceipt(data.conversationId);
      } else {
        showToast((data.senderInfo ? data.senderInfo.displayName : 'Кто-то') + ': новое сообщение');
      }
      refreshConversations();

    } else if(data.type === 'status'){
      const row = messagesEl.querySelector([`data-msg-id="${CSS.escape(data.id)}"`]);
      if(row) updateTicks(row, data.status);

    } else if(data.type === 'read'){
      if(activeChat.type === 'user' && activeChat.conversationId === data.conversationId){
        messagesEl.querySelectorAll('.msg-row.me').forEach(row => updateTicks(row, 'read'));
      }

    } else if(data.type === 'edit'){
      if(activeChat.type === 'user' && activeChat.conversationId === data.conversationId){
        const row = messagesEl.querySelector([`data-msg-id="${CSS.escape(data.id)}"`]);
        if(row){
          const bubble = row.querySelector('.bubble');
          if(bubble) bubble.textContent = data.text;
        }
      }
      refreshConversations();

    } else if(data.type === 'delete'){
      if(activeChat.type === 'user' && activeChat.conversationId === data.conversationId){
        const row = messagesEl.querySelector([`data-msg-id="${CSS.escape(data.id)}"`]);
        if(row) shatterRow(row);
      }
      refreshConversations();
    }
  };

  ws.onclose = () => {
    wsReconnectTimer = setTimeout(connectWebSocket, 2000);
  };
  ws.onerror = () => { ws.close(); };
}

// ==========================================================
// ПОИСК
// ==========================================================
const chatSearchInput = document.getElementById('chatSearch');
const chatListEmpty = document.getElementById('chatListEmpty');
const searchResultsEl = document.getElementById('searchResults');
const searchSpinnerEl = document.getElementById('searchSpinner');
let searchDebounceTimer = null;

function createSearchResultRow(item){
  const row = document.createElement('div');
  row.className = 'chat-item search-result-item';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if(item.avatarImage === 'logo'){
    avatar.classList.add('avatar-bot');
  } else if(item.avatar){
    avatar.style.backgroundImage = `url(${item.avatar})`;
  } else {
    avatar.textContent = (item.displayName || '?').trim().charAt(0).toUpperCase();
  }

  const body = document.createElement('div');
  body.className = 'chat-item-body';

  const top = document.createElement('div');
  top.className = 'chat-item-top';

  const nameEl = document.createElement('span');
  nameEl.className = 'chat-item-name';
  nameEl.appendChild(document.createTextNode(item.displayName || ''));
  if(item.verified){
    appendVerifiedBadge(nameEl, item.verifiedLabel || 'Подтверждённый аккаунт.');
  }
  top.appendChild(nameEl);

  const bottom = document.createElement('div');
  bottom.className = 'chat-item-bottom';
  const preview = document.createElement('span');
  preview.className = 'chat-item-preview';
  const typeLabel = item.type === 'channel' ? 'Канал' : item.type === 'bot' ? 'Бот' : 'Пользователь';
  preview.textContent = item.handle ? '@' + item.handle : typeLabel;
  bottom.appendChild(preview);

  body.appendChild(top);
  body.appendChild(bottom);
  row.appendChild(avatar);
  row.appendChild(body);

  row.addEventListener('click', (e) => {
    if(e.target.closest('[data-verified-trigger]')) return;
    openViewProfile({
      kind: item.type,
      verified: item.verified,
      verifiedLabel: item.verifiedLabel,
      displayName: item.displayName,
      handle: item.handle,
      bio: item.bio,
      avatar: item.avatar,
      avatarImage: item.avatarImage || null
    });
  });

  return row;
}

chatSearchInput.addEventListener('input', (e) => {
  const raw = e.target.value.trim();
  const q = raw.toLowerCase().replace(/^@/, '');

  const items = document.querySelectorAll('#chatList > .chat-item');
  let localVisible = 0;
  items.forEach(item => {
    const haystack = item.dataset.search || '';
    const match = !q || haystack.includes(q);
    item.classList.toggle('hidden', !match);
    if(match) localVisible++;
  });

  clearTimeout(searchDebounceTimer);
  searchResultsEl.innerHTML = '';

  if(!q){
    searchSpinnerEl.classList.remove('show');
    chatListEmpty.classList.remove('show');
    return;
  }

  searchSpinnerEl.classList.add('show');

  searchDebounceTimer = setTimeout(async () => {
    try{
      const res = await apiFetch('/api/search?q=' + encodeURIComponent(q));
      const data = await res.json();
      searchSpinnerEl.classList.remove('show');
      searchResultsEl.innerHTML = '';
      data.results.forEach(item => searchResultsEl.appendChild(createSearchResultRow(item)));
      chatListEmpty.classList.toggle('show', localVisible === 0 && data.results.length === 0);
    }catch(err){
      searchSpinnerEl.classList.remove('show');
    }
  }, 350);
});

// ==========================================================
// ПРОФИЛЬ (своя учётка)
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

async function loadProfile(){
  try{
    const res = await apiFetch('/api/profile');
    currentProfile = await res.json();
    updateProfileButton(currentProfile);
  }catch(e){
    console.error('Не удалось загрузить профиль', e);
  }
}

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

document.getElementById('bioInput').addEventListener('input', (e) => {
  document.getElementById('bioCounter').textContent = e.target.value.length + ' / 200';
});

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
// ПРОСМОТР ПРОФИЛЯ
// ==========================================================
const BOT_PROFILE = {
  kind: 'bot',
  verified: true,
  verifiedLabel: 'Это подтверждённый бот NovaChat.',
  displayName: 'NovaAI',
  handle: 'NovaChat',
  bio: 'Официальный бот поддержки NovaChat. Отвечает на сообщения и помогает разобраться с сайтом.',
  avatar: null,
  avatarImage: 'logo'
};

const viewProfileModalOverlay = document.getElementById('viewProfileModalOverlay');
const viewProfileAvatar = document.getElementById('viewProfileAvatar');
const viewProfileName = document.getElementById('viewProfileName');
const viewProfileHandle = document.getElementById('viewProfileHandle');
const viewProfileBio = document.getElementById('viewProfileBio');
const viewProfileTabs = document.getElementById('viewProfileTabs');
const viewProfileFooter = document.getElementById('viewProfileFooter');
const viewChannelBlock = document.getElementById('viewChannelBlock');
const viewChannelCount = document.getElementById('viewChannelCount');
const channelSubscribeBtn = document.getElementById('channelSubscribeBtn');
const viewMessageBlock = document.getElementById('viewMessageBlock');
let currentChannelHandle = null;

function pluralizeSubscribers(n){
  const mod10 = n % 10, mod100 = n % 100;
  if(mod100 >= 11 && mod100 <= 14) return 'подписчиков';
  if(mod10 === 1) return 'подписчик';
  if(mod10 >= 2 && mod10 <= 4) return 'подписчика';
  return 'подписчиков';
}

function renderChannelSubscription(count, subscribed){
  viewChannelCount.textContent = count + ' ' + pluralizeSubscribers(count);
  channelSubscribeBtn.textContent = subscribed ? 'Отписаться' : 'Подписаться';
  channelSubscribeBtn.classList.toggle('btn-secondary', subscribed);
  channelSubscribeBtn.classList.toggle('btn-primary', !subscribed);
}

async function loadChannelSubscription(handle){
  currentChannelHandle = handle;
  viewChannelCount.textContent = 'Загрузка…';
  channelSubscribeBtn.disabled = true;
  try{
    const res = await apiFetch('/api/channel/' + encodeURIComponent(handle));
    const data = await res.json();
    renderChannelSubscription(data.subscriberCount, data.isSubscribed);
  }catch(e){
    viewChannelCount.textContent = '';
  }
  channelSubscribeBtn.disabled = false;
}

channelSubscribeBtn.addEventListener('click', async () => {
  if(!currentChannelHandle) return;
  const subscribed = channelSubscribeBtn.textContent.trim() === 'Отписаться';
  channelSubscribeBtn.disabled = true;
  try{
    const action = subscribed ? 'unsubscribe' : 'subscribe';
    const res = await apiFetch(`/api/channel/${encodeURIComponent(currentChannelHandle)}/${action}, { method: 'POST' }`);
    const data = await res.json();
    renderChannelSubscription(data.subscriberCount, data.isSubscribed);
  }catch(e){ /* сервер недоступен — оставляем как было */ }
  channelSubscribeBtn.disabled = false;
});

function openViewProfile(profile){
  const kind = profile.kind;

  viewProfileAvatar.classList.toggle('avatar-bot', profile.avatarImage === 'logo');
  if(profile.avatarImage === 'logo'){
    viewProfileAvatar.style.backgroundImage = '';
    viewProfileAvatar.textContent = '';
  } else if(profile.avatar){
    viewProfileAvatar.style.backgroundImage = `url(${profile.avatar})`;
    viewProfileAvatar.textContent = '';
  } else {
    viewProfileAvatar.style.backgroundImage = 'none';
    viewProfileAvatar.textContent = (profile.displayName || '?').trim().charAt(0).toUpperCase();
  }

  viewProfileName.innerHTML = '';
  viewProfileName.appendChild(document.createTextNode(profile.displayName || ''));
  if(profile.verified){
    appendVerifiedBadge(viewProfileName, profile.verifiedLabel || 'Подтверждённый аккаунт.');
  }

  viewProfileHandle.textContent = profile.handle ? '@' + profile.handle : '';
  viewProfileBio.textContent = profile.bio || '';

  viewProfileTabs.style.display = kind === 'self' ? 'flex' : 'none';
  viewProfileFooter.style.display = kind === 'self' ? '' : 'none';
  viewChannelBlock.style.display = kind === 'channel' ? 'flex' : 'none';
  viewMessageBlock.style.display = (kind === 'user' && profile.handle) ? 'flex' : 'none';

  if(kind === 'channel') loadChannelSubscription(profile.handle);
  if(kind === 'user') currentViewedHandle = profile.handle;

  viewProfileModalOverlay.classList.add('show');
}
function closeViewProfileModal(){
  viewProfileModalOverlay.classList.remove('show');
}

document.getElementById('profileBtn').addEventListener('click', () => {
  openViewProfile({ ...currentProfile, kind: 'self', avatarImage: null });
});

document.getElementById('closeViewProfileModal').addEventListener('click', closeViewProfileModal);
viewProfileModalOverlay.addEventListener('click', (e) => {
  if(e.target.id === 'viewProfileModalOverlay') closeViewProfileModal();
});

document.getElementById('editProfileFromView').addEventListener('click', () => {
  closeViewProfileModal();
  openProfileModal();
});
document.getElementById('logoutFromView').addEventListener('click', () => {
  localStorage.removeItem('novachat_token');
  localStorage.removeItem('novachat_username');
  window.location.href = 'index.html';
});
viewProfileTabs.querySelectorAll('.view-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    showToast(tab.dataset.tabName + ' — скоро будет доступно');
  });
});

document.getElementById('startConversationBtn').addEventListener('click', async () => {
  if(!currentViewedHandle) return;
  try{
    const res = await apiFetch('/api/conversations/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: currentViewedHandle })
    });
    const peer = await res.json();
    if(!res.ok){
      showToast(peer.error || 'Не удалось начать переписку');
      return;
    }
    closeViewProfileModal();
    await refreshConversations();
    switchToChat({
      type: 'user',
      conversationId: peer.id,
      handle: peer.handle,
      displayName: peer.displayName,
      avatar: peer.avatar,
      verified: peer.verified,
      verifiedLabel: peer.verifiedLabel
    });
  }catch(e){
    showToast('Сервер недоступен. Попробуйте позже.');
  }
});

// ==========================================================
// НАСТРОЙКИ
// ==========================================================
const settingsModalOverlay = document.getElementById('settingsModalOverlay');
const settingsMainView = document.getElementById('settingsMainView');
const settingsChatsView = document.getElementById('settingsChatsView');

function openSettingsModal(){
  settingsMainView.style.display = '';
  settingsChatsView.style.display = 'none';

  const avatarEl = document.getElementById('settingsAvatar');
  if(currentProfile.avatar){
    avatarEl.style.backgroundImage = `url(${currentProfile.avatar})`;
    avatarEl.textContent = '';
  } else {
    avatarEl.style.backgroundImage = 'none';
    avatarEl.textContent = (currentProfile.displayName || '?').trim().charAt(0).toUpperCase();
  }
  document.getElementById('settingsProfileName').textContent = currentProfile.displayName || '';
  document.getElementById('settingsProfileHandle').textContent = currentProfile.handle ? '@' + currentProfile.handle : 'Юзернейм не задан';

  settingsModalOverlay.classList.add('show');
}
function closeSettingsModal(){
  settingsModalOverlay.classList.remove('show');
}

document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
document.getElementById('closeSettingsModal').addEventListener('click', closeSettingsModal);
settingsModalOverlay.addEventListener('click', (e) => {
  if(e.target.id === 'settingsModalOverlay') closeSettingsModal();
});

document.getElementById('settingsProfileRow').addEventListener('click', () => {
  closeSettingsModal();
  openProfileModal();
});

document.querySelectorAll('.settings-row[data-action]').forEach(row => {
  row.addEventListener('click', () => {
    const action = row.dataset.action;
    if(action === 'account'){
      closeSettingsModal();
      openProfileModal();
    } else if(action === 'chats'){
      settingsMainView.style.display = 'none';
      settingsChatsView.style.display = '';
    } else if(action === 'placeholder'){
      showToast((row.dataset.label || 'Раздел') + ' — скоро будет доступно');
    }
  });
});

document.getElementById('backFromChatsSettings').addEventListener('click', () => {
  settingsChatsView.style.display = 'none';
  settingsMainView.style.display = '';
});

// ---------- переключатель темы ----------
const ICON_SUN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';

const themeToggle = document.getElementById('themeToggle');
const knob = themeToggle.querySelector('.knob');

function applyTheme(theme){
  document.body.classList.toggle('theme-dark', theme === 'dark');
  themeToggle.classList.toggle('dark', theme === 'dark');
  knob.innerHTML = theme === 'dark' ? ICON_MOON : ICON_SUN;
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
// ИНИЦИАЛИЗАЦИЯ
// ==========================================================
(async function init(){
  await loadProfile();
  renderChatList();
  await refreshConversations();
  await switchToChat({ type: 'bot' });
  connectWebSocket();
})();