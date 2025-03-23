 // Удаление preloader после загрузки страницы
 window.addEventListener('load', function () {
    var preloader = document.getElementById('preloader');
    preloader.style.display = 'none';
});


// Получаем элементы кнопки-триггера и боковой панели
var sidebarToggle = document.getElementById('sidebar-toggle');
var sidebar = document.getElementById('sidebar');

// Обработчик клика по кнопке-триггеру
sidebarToggle.addEventListener('click', function() {
  sidebar.classList.toggle('active');
});
// Скрытие боковой панели при клике вне её области
document.addEventListener('click', function (event) {
    const isClickInsideSidebar = sidebar.contains(event.target);
    const isClickOnToggle = sidebarToggle.contains(event.target);

    if (!isClickInsideSidebar && !isClickOnToggle) {
        sidebar.classList.remove('active');
    }
});


var headers = document.querySelectorAll('.accordion-header');
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



function toggleFullscreen(img) {
    if (!document.fullscreenElement) {
        img.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}



// Кнопка "Наверх"
var backToTop = document.getElementById('back-to-top');
window.addEventListener('scroll', function () {
    if (window.pageYOffset > 300) {
        backToTop.style.display = 'block';
    } else {
        backToTop.style.display = 'none';
    }
});
backToTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Хранение всех YouTube плееров
var players = [];

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

// Подключение YouTube API
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);



const SERVER_IP = "192.168.1.123";   // IP сервера
const WS_PORT = 8765;
let ws;

function sendControl(command) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command }));
        console.log("✅ Команда отправлена через WebSocket:", command);
    } else {
        console.error("❌ WebSocket не подключён");
    }
}

function connectWebSocket() {
    ws = new WebSocket(`ws://${SERVER_IP}:${WS_PORT}`);

    ws.onopen = () => {
        console.log("🔌 WebSocket подключён");
        updateStatus(true); 
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log("📨 Получено сообщение от сервера:", data);
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

window.addEventListener("load", () => {
    connectWebSocket();

    const buttons = document.querySelectorAll(".sidebar-btn");
    const commands = ["sync", "android", "webos", "tizen"];
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

function updateStatus(connected) {
    const statusEl = document.getElementById("ws-status");
    if (!statusEl) return;

    if (connected) {
        statusEl.textContent = "✅ Подключено к серверу";
        statusEl.classList.remove("disconnected");
        statusEl.classList.add("connected");
    } else {
        statusEl.textContent = "❌ Нет подключения к серверу";
        statusEl.classList.remove("connected");
        statusEl.classList.add("disconnected");
    }
}
