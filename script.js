
// Удаление preloader после загрузки страницы
window.addEventListener('load', function () {
    var preloader = document.getElementById('preloader');
    preloader.style.display = 'none';
});




//
var headers = document.querySelectorAll('.accordion-header');

// Хранение всех YouTube плееров
var players = [];


// Подключение YouTube API
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);


// Подключение к WebSocket
const WS_PORT = 8765;
const WS_HOST = location.hostname;
// WebSocket соединение
let ws;

// Получаем элементы кнопки-триггера и боковой панели
var sidebarToggle = document.getElementById('sidebar-toggle');
var sidebar = document.getElementById('sidebar');
// Для обработки свайпов на мобильных устройствах
let touchStartX = 0;
let touchEndX = 0;

// Открытие/закрытие боковой панели по кнопке
sidebarToggle.addEventListener('click', function () {
    sidebar.classList.toggle('active');
});

// Жесты для мобильных устройств
document.addEventListener('touchstart', function (event) {
    touchStartX = event.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', function (event) {
    touchEndX = event.changedTouches[0].screenX;
    handleSwipe();
}, { passive: true });

function handleSwipe() {
    if (touchEndX - touchStartX > 50) {
        // Свайп вправо - открываем
        sidebar.classList.add('active');
    } else if (touchStartX - touchEndX > 50) {
        // Свайп влево - закрываем
        sidebar.classList.remove('active');
    }
}

// Закрытие панели при клике вне её области
document.addEventListener('click', function (event) {
    const isClickInsideSidebar = sidebar.contains(event.target);
    const isClickOnToggle = sidebarToggle.contains(event.target);

    if (!isClickInsideSidebar && !isClickOnToggle) {
        sidebar.classList.remove('active');
    }
});



// Подключение к WebSocket при загрузке страницы
window.addEventListener("load", () => {
    connectWebSocket();

    const buttons = document.querySelectorAll(".sidebar-btn");
    const commands = ["sync", "reload", "android", "webos", "tizen"];
    buttons.forEach((btn, index) => {
        btn.addEventListener("click", () => {
            if (commands[index]) {
                sendControl(commands[index]);
            } else {
                console.log("Нет команды для кнопки", index);
            }
        });
    });
});




// Обработчик клика по заголовкам аккордеона
headers.forEach(function (header) {
    header.addEventListener('click', function () {
        var isActive = header.classList.contains('active');
        // Если нужно закрыть остальные
        headers.forEach(function (h) {
            if (h !== header) {
                h.classList.remove('active');
                h.nextElementSibling.style.maxHeight = "0px";
                h.nextElementSibling.style.opacity = 0;
                h.nextElementSibling.style.transform = 'scaleY(0)';
            }
        });

        if (!isActive) {
            header.classList.add('active');
            // Открываем блок
            var content = header.nextElementSibling;
            content.style.maxHeight = content.scrollHeight + "px";
            content.style.opacity = 1;
            content.style.transform = 'scaleY(1)';

            // Ждём окончания анимации раскрытия (transition по max-height)
            content.addEventListener('transitionend', function handler(e) {
                if (e.propertyName === "max-height") {
                    var navHeight = document.querySelector("nav").offsetHeight;
                    var headerTop = header.getBoundingClientRect().top + window.pageYOffset;
                    window.scrollTo({
                        top: headerTop - navHeight,
                        behavior: "smooth"
                    });
                    content.removeEventListener('transitionend', handler);
                }
            });
        } else {
            header.classList.remove('active');
            // Закрываем блок
            header.nextElementSibling.style.maxHeight = "0px";
            header.nextElementSibling.style.opacity = 0;
            header.nextElementSibling.style.transform = 'scaleY(0)';
            stopAllVideosExcept(-1);
        }
    });
});


// Переключение полноэкранного режима img
function toggleFullscreen(img) {
    if (!document.fullscreenElement) {
        img.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}



// Инициализация YouTube API
function onYouTubeIframeAPIReady() {
    var iframes = document.querySelectorAll("iframe");
    iframes.forEach(function (iframe, index) {
        if (iframe.src.includes("youtube.com/embed")) {
            var videoId = iframe.src.split("/embed/")[1].split("?")[0];
            players[index] = new YT.Player(iframe, {
                events: {
                    'onStateChange': function (event) {
                        if (event.data === YT.PlayerState.PLAYING) {
                            stopAllVideosExcept(index);
                        }
                    }
                }
            });
        }
    });
}

// Остановка всех видео, кроме активного
function stopAllVideosExcept(activeIndex) {
    players.forEach(function (player, index) {
        if (index !== activeIndex && player) {
            player.pauseVideo();
        }
    });
}





// Обрабртчик команд через WebSocket
function sendControl(command) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command }));
        console.log("✅ Команда отправлена через WebSocket:", command);
    } else {
        console.error("❌ WebSocket не подключён");
    }
}
// Подключение к WebSocket
function connectWebSocket() {
    const isLocal = location.hostname.startsWith("192.168.") || location.hostname === "localhost";

    // Если сайт открыт по HTTPS и ты не в локальной сети — не подключаемся
    if (location.protocol === "https:" && !isLocal) {
        console.warn("⛔ WebSocket не подключён: вы не в локальной сети");
        updateStatus(false);
        return;
    }

    const wsURL = `ws://${WS_HOST}:${WS_PORT}`;
    ws = new WebSocket(wsURL);

    ws.onopen = () => {
        console.log("🔌 WebSocket подключён");
        updateStatus(true);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log("📨 Получено сообщение от сервера:", data);
            if (data.response) {
                addLogEntry(data.response);
            }

        } catch (e) {
            console.warn("⚠️ Ошибка разбора WebSocket-сообщения:", e);
        }
    };

    ws.onerror = (e) => {
        console.error("❌ WebSocket ошибка:", e);
    };

    ws.onclose = () => {
        console.warn("⚠️ WebSocket отключён, переподключение через 5 сек...");
        updateStatus(false);
        setTimeout(connectWebSocket, 5000);
    };
}
// Добавление сообщения в лог консоли для пользователя
function addLogEntry(message) {
    const logContainer = document.getElementById("command-log");
    if (!logContainer) return;

    const entry = document.createElement("div");
    entry.textContent = ">_ " + message;
    logContainer.appendChild(entry);

    // Прокрутка вниз
    logContainer.scrollTop = logContainer.scrollHeight;

    // Очистка через 10 сообщений (опционально)
    if (logContainer.children.length > 10) {
        logContainer.removeChild(logContainer.firstChild);
    }
}

// Обновление статуса подключения к WebSocket
function updateStatus(connected) {
    const statusEl = document.getElementById("ws-status");
    if (!statusEl) return;

    if (connected) {
        statusEl.textContent = "🌐 Подключено к серверу";
        statusEl.classList.remove("disconnected");
        statusEl.classList.add("connected");
    } else {
        statusEl.textContent = "📡 Нет подключения к серверу";
        statusEl.classList.remove("connected");
        statusEl.classList.add("disconnected");
    }
}
