// Проверяем каждые 5 секунд, появился ли сайт снова.
setInterval(async () => {
    try {
        const response = await fetch("/", {
            method: "HEAD",
            cache: "no-store"
        });

        if (response.ok) {
            location.reload();
        }
    } catch (e) {
        // Сайт всё ещё недоступен.
    }
}, 5000);