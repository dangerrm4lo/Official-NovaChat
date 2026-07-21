// ==========================================================
// offline.js — периодически проверяем, не заработал ли сервер снова
// ==========================================================

async function checkServerOnline(){
  try{
    const res = await fetch('/health', { cache: 'no-store' });
    if(res.ok){
      window.location.href = 'index.html';
    }
  }catch(e){
    // сервер всё ещё недоступен — просто попробуем ещё раз позже
  }
}

setTimeout(checkServerOnline, 2000);
setInterval(checkServerOnline, 5000);