// ==========================================================
// auth.js — NovaChat (Modern UI)
// ==========================================================

const tabs = document.querySelectorAll('.auth-tab');

const forms = {
  register: document.getElementById('registerForm'),
  login: document.getElementById('loginForm')
};

const authHint = document.getElementById('authHint');

function animateForm(form){

  form.animate([
    {
      opacity:0,
      transform:'translateX(18px)'
    },
    {
      opacity:1,
      transform:'translateX(0)'
    }
  ],{
    duration:280,
    easing:'ease'
  });

}

function setActiveTab(name){

  tabs.forEach(tab=>{
    tab.classList.toggle('active',tab.dataset.tab===name);
  });

  forms.register.classList.remove('active');
  forms.login.classList.remove('active');

  requestAnimationFrame(()=>{

    const form=name==='register'
      ?forms.register
      :forms.login;

    form.classList.add('active');
    animateForm(form);

  });

  if(name==="register"){

    authHint.innerHTML=
      'Уже есть аккаунт? <button type="button" id="hintSwitch">Войти</button>';

  }else{

    authHint.innerHTML=
      'Ещё нет аккаунта? <button type="button" id="hintSwitch">Зарегистрироваться</button>';

  }

  document
    .getElementById('hintSwitch')
    .onclick=()=>setActiveTab(
      name==="register"
      ?"login"
      :"register"
    );

}

tabs.forEach(tab=>{

  tab.addEventListener("click",()=>{

    if(tab.classList.contains("active")) return;

    setActiveTab(tab.dataset.tab);

  });

});

document
.getElementById("hintSwitch")
.addEventListener("click",()=>{

  setActiveTab("login");

});

function setLoading(button,loading){

  if(loading){

    button.disabled=true;

    button.dataset.text=button.textContent;

    button.textContent="Подождите...";

  }else{

    button.disabled=false;

    button.textContent=button.dataset.text;

  }

}

function showError(el,text){

  el.textContent=text;

  el.animate([
    {
      opacity:0,
      transform:'translateY(-6px)'
    },
    {
      opacity:1,
      transform:'translateY(0)'
    }
  ],{
    duration:220
  });

}

// ==========================================================
// Регистрация
// ==========================================================

document.getElementById("registerForm").addEventListener("submit", async (e)=>{

  e.preventDefault();

  const username=document.getElementById("regUsername").value.trim();
  const password=document.getElementById("regPassword").value;

  const error=document.getElementById("registerError");
  const button=e.target.querySelector(".auth-submit");

  error.textContent="";

  if(password.length<6){

    showError(error,"Пароль должен быть не короче 6 символов");

    return;

  }

  setLoading(button,true);

  try{

    const res=await fetch("/api/register",{

      method:"POST",

      headers:{
        "Content-Type":"application/json"
      },

      body:JSON.stringify({
        username,
        password
      })

    });

    const data=await res.json();

    if(!res.ok){

      showError(
        error,
        data.error||"Не удалось зарегистрироваться"
      );

      return;

    }

    button.textContent="✓ Аккаунт создан";

    await new Promise(r=>setTimeout(r,700));

    setActiveTab("login");

    document.getElementById("loginUsername").value=username;

    document.getElementById("loginPassword").focus();

  }catch{

    showError(
      error,
      "Сервер недоступен. Попробуйте позже."
    );

  }finally{

    setLoading(button,false);

  }

});

// ==========================================================
// Вход
// ==========================================================

document.getElementById("loginForm").addEventListener("submit",async(e)=>{

  e.preventDefault();

  const username=document.getElementById("loginUsername").value.trim();
  const password=document.getElementById("loginPassword").value;

  const error=document.getElementById("loginError");
  const button=e.target.querySelector(".auth-submit");

  error.textContent="";

  setLoading(button,true);

  try{

    const res=await fetch("/api/login",{

      method:"POST",

      headers:{
        "Content-Type":"application/json"
      },

      body:JSON.stringify({
        username,
        password
      })

    });

    const data=await res.json();

    if(!res.ok){

      showError(
        error,
        data.error||"Не удалось войти"
      );

      return;

    }

    localStorage.setItem(
      "novachat_token",
      data.token
    );

    localStorage.setItem(
      "novachat_username",
      username
    );

    button.textContent="✓ Успешный вход";

    await new Promise(r=>setTimeout(r,450));

    document.body.animate([
      {
        opacity:1,
        transform:"scale(1)"
      },
      {
        opacity:0,
        transform:"scale(.985)"
      }
    ],{
      duration:260,
      easing:"ease"
    });

    setTimeout(()=>{

      window.location.href="chat.html";

    },240);

  }catch{

    showError(
      error,
      "Сервер недоступен. Попробуйте позже."
    );

  }finally{

    setLoading(button,false);

  }

});

// ==========================================================
// Проверка существующей сессии
// ==========================================================

(async function(){

  const token=localStorage.getItem("novachat_token");

  if(!token) return;

  try{

    const res=await fetch("/api/me",{

      headers:{
        Authorization:"Bearer "+token
      }

    });

    if(res.ok){

      document.body.style.opacity="0";

      setTimeout(()=>{

        window.location.href="chat.html";

      },150);

    }

  }catch{}

})();