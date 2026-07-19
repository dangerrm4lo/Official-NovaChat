// ==========================================================
// offline.js — логика для страницы "Сервис временно недоступен"
// ==========================================================

(function() {
  'use strict';

  // ===== АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ ВРЕМЕНИ =====
  function updateAdminTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const dateStr = now.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const el = document.getElementById('adminTime');
    if (el) {
      el.textContent = 'Последнее обновление: ' + dateStr + ', ' + timeStr;
    }
  }

  // Обновляем сразу и каждые 30 секунд
  updateAdminTime();
  setInterval(updateAdminTime, 30000);

  // ===== СООБЩЕНИЯ АДМИНИСТРАТОРА =====
  var adminMessages = [
    'Провожу технические работы. Обновление будет опубликовано в ближайшее время.',
    'Обновление серверов. Скоро всё заработает!',
    'Готовим новый функционал. Зайдите через час.',
    'Устраняем неполадки. Приносим извинения за неудобства.'
  ];

  // Случайный выбор сообщения
  var msgEl = document.getElementById('adminMessage');
  if (msgEl && adminMessages.length > 0) {
    var randomIndex = Math.floor(Math.random() * adminMessages.length);
    // Можно оставить как есть или заменить
    // msgEl.textContent = adminMessages[randomIndex];
  }

  // ===== ПРОВЕРКА СОЕДИНЕНИЯ (автоматическая перезагрузка) =====
  var reloadAttempts = 0;
  var maxReloadAttempts = 5;

  function checkConnection() {
    fetch('/api/me', {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache'
      }
    })
    .then(function(response) {
      if (response.ok) {
        console.log('Соединение восстановлено! Перезагрузка...');
        window.location.reload();
      }
    })
    .catch(function() {
      reloadAttempts++;
      if (reloadAttempts < maxReloadAttempts) {
        console.log('Попытка ' + reloadAttempts + '/' + maxReloadAttempts + '...');
        setTimeout(checkConnection, 15000);
      } else {
        console.log('Достигнут лимит попыток. Обновление вручную.');
      }
    });
  }

  // Запускаем проверку через 5 секунд после загрузки страницы
  setTimeout(checkConnection, 5000);

  // ===== КНОПКА ПЕРЕЗАГРУЗКИ С АНИМАЦИЕЙ =====
  var retryBtn = document.querySelector('.offline-retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', function(e) {
      this.textContent = 'Загрузка...';
      this.disabled = true;
      setTimeout(function() {
        window.location.reload();
      }, 600);
    });
  }

})();