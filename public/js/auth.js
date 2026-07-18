// ==========================================================
// auth.js — логика страницы входа / регистрации
// ==========================================================

const tabs = document.querySelectorAll('.auth-tab');
const forms = {
  register: document.getElementById('registerForm'),
  login: document.getElementById('loginForm'),
};
const authHint = document.getElementById('authHint');
const hintSwitch = document.getElementById('hintSwitch');

function setActiveTab(name){
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  forms.register.classList.toggle('active', name === 'register');
  forms.login.classList.toggle('active', name === 'login');

  if(name === 'register'){
    authHint.innerHTML = 'Уже есть аккаунт? <button type="button" id="hintSwitch">Войти</button>';
  } else {
    authHint.innerHTML = 'Ещё нет аккаунта? <button type="button" id="hintSwitch">Зарегистрироваться</button>';
  }
  // пересоздаём обработчик, т.к. кнопка внутри hint была перерисована
  document.getElementById('hintSwitch').addEventListener('click', () => {
    setActiveTab(name === 'register' ? 'login' : 'register');
  });
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
});
hintSwitch.addEventListener('click', () => setActiveTab('login'));

// ---------- регистрация ----------
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const errorEl = document.getElementById('registerError');
  errorEl.textContent = '';

  if(password.length < 6){
    errorEl.textContent = 'Пароль должен быть не короче 6 символов';
    return;
  }

  try{
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if(!res.ok){
      errorEl.textContent = data.error || 'Не удалось зарегистрироваться';
      return;
    }

    // после успешной регистрации — переключаемся на вкладку входа
    setActiveTab('login');
    document.getElementById('loginUsername').value = username;
    document.getElementById('loginPassword').focus();

  }catch(err){
    errorEl.textContent = 'Сервер недоступен. Попробуйте позже.';
  }
});

// ---------- вход ----------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  try{
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if(!res.ok){
      errorEl.textContent = data.error || 'Не удалось войти';
      return;
    }

    localStorage.setItem('novachat_token', data.token);
    localStorage.setItem('novachat_username', username);
    window.location.href = 'chat.html';

  }catch(err){
    errorEl.textContent = 'Сервер недоступен. Попробуйте позже.';
  }
});

// ---------- если уже залогинен — сразу перекинуть в чат ----------
(async function checkExistingSession(){
  const token = localStorage.getItem('novachat_token');
  if(!token) return;
  try{
    const res = await fetch('/api/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if(res.ok) window.location.href = 'chat.html';
  }catch(e){ /* сервер недоступен — остаёмся на странице входа */ }
})();