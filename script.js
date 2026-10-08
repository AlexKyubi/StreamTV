
// Заставка убирается, как только готова разметка (не ждём видео и картинок; без интернета тоже)
function hidePreloader() {
    var preloader = document.getElementById('preloader');
    if (preloader) preloader.style.display = 'none';
}
document.addEventListener('DOMContentLoaded', hidePreloader);

// Высота шапки — пульт открывается сразу под ней
function syncNavHeight() {
    var nav = document.querySelector('nav');
    if (nav) document.documentElement.style.setProperty('--nav-h', nav.offsetHeight + 'px');
}
document.addEventListener('DOMContentLoaded', syncNavHeight);
window.addEventListener('resize', syncNavHeight);
setTimeout(hidePreloader, 1500);

var headers = document.querySelectorAll('.accordion-header');

// Видео YouTube грузятся только когда нужны: главное — после открытия страницы, остальные — при открытии
// своего раздела. При закрытии раздела видео выгружается (останавливается и освобождает память телефона).
function loadVideos(root) {
    root.querySelectorAll('iframe[data-src]').forEach(function (frame) {
        if (!frame.src || frame.src === 'about:blank') frame.src = frame.dataset.src;
    });
}
function unloadVideos(root) {
    root.querySelectorAll('iframe[data-src]').forEach(function (frame) {
        if (frame.src && frame.src !== 'about:blank') frame.src = 'about:blank';
    });
}
window.addEventListener('load', function () {
    setTimeout(function () { loadVideos(document.querySelector('.video-section')); }, 800);
});



// Получаем элементы кнопки-триггера и боковой панели
var sidebarToggle = document.getElementById('sidebar-toggle');
var sidebar = document.getElementById('sidebar');
// Для обработки свайпов на мобильных устройствах
let touchStartX = 0;
let touchEndX = 0;

// Открытие/закрытие боковой панели по кнопке
function openSidebar(open) {
    sidebar.classList.toggle('active', open);
    if (open) {
        // анимированный логотип (5,8 МБ) грузим только когда пульт открыт
        var logo = sidebar.querySelector('img[data-src]');
        if (logo && !logo.src) logo.src = logo.dataset.src;
    }
}
sidebarToggle.addEventListener('click', function () {
    openSidebar(!sidebar.classList.contains('active'));
});

// Жесты: открыть — свайп слева направо, начатый в левой половине экрана; закрыть — свайп влево.
// Не только от самого края: там жест «назад» телефона забирает касание себе. Вертикальная прокрутка не мешает.
let touchStartY = 0;
document.addEventListener('touchstart', function (event) {
    touchStartX = event.changedTouches[0].clientX;
    touchStartY = event.changedTouches[0].clientY;
}, { passive: true });

document.addEventListener('touchend', function (event) {
    touchEndX = event.changedTouches[0].clientX;
    const dy = Math.abs(event.changedTouches[0].clientY - touchStartY);
    const dx = touchEndX - touchStartX;
    if (Math.abs(dx) < 60 || dy * 1.5 > Math.abs(dx)) return;    // короткое движение или прокрутка
    if (dx > 0 && touchStartX < window.innerWidth / 2) openSidebar(true);
    else if (dx < 0 && sidebar.classList.contains('active')) openSidebar(false);
}, { passive: true });

// Закрытие панели при клике вне её области
document.addEventListener('click', function (event) {
    const isClickInsideSidebar = sidebar.contains(event.target);
    const isClickOnToggle = sidebarToggle.contains(event.target);

    const isClickInSheet = document.getElementById('tv-sheet').contains(event.target);
    if (!isClickInsideSidebar && !isClickOnToggle && !isClickInSheet) {
        sidebar.classList.remove('active');
    }
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
                unloadVideos(h.nextElementSibling);
            }
        });

        if (!isActive) {
            header.classList.add('active');
            // Открываем блок
            var content = header.nextElementSibling;
            loadVideos(content);
            unloadVideos(document.querySelector('.video-section'));
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
            unloadVideos(header.nextElementSibling);
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



// ====================================================================
//  Пульт. Работает и со страницы программы (http://IP:4040), и с опубликованного сайта:
//  тогда сам находит StreamTV в локальной сети (сохранённый адрес → 192.168.1.200 → перебор подсети).
//  Данные: GET /api/status, команды: POST /api/command (без WebSocket — он недоступен с https-сайта).
// ====================================================================
const UI_PORT = 4040;
const STAGES = {
    healthy: 'играет', page_confirmed: 'играет', playing: 'играет', rejoined: 'играет',
    queued: 'ожидает', opening: 'открывается', loading_hls: 'загрузка', connecting: 'подключение',
    discovering: 'поиск', resolving: 'поиск', waking: 'включается', ip_changed: 'адрес обновлён',
    recovery_needed: 'восстановление', retry_wait: 'повтор', blocked: 'нужно вмешательство', stopped: 'остановлен'
};
const PLAYING = { healthy: 1, page_confirmed: 1, playing: 1, rejoined: 1 };
const TROUBLE = { blocked: 1, retry_wait: 1, recovery_needed: 1 };
const BRANCHES = { browser: 'браузер', dlna: 'DLNA', cast: 'Cast' };
const GROUPS = [['tizen', 'Samsung'], ['webos', 'LG'], ['android', 'Android']];
const onServer = location.port === String(UI_PORT);          // страница открыта с самой программы
let remote = { tvs: [], managed: false, stream: false, current: null, base: null, lastOk: 0, seenLog: 0, scanning: false };

function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (e) { } }

// fetch с таймаутом; для адресов локальной сети — пометка targetAddressSpace (Chrome спросит разрешение)
function api(base, path, options, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout || 4000);
    const init = Object.assign({ cache: 'no-store', signal: controller.signal }, options || {});
    if (base) init.targetAddressSpace = 'local';
    return fetch((base || '') + path, init)
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .finally(() => clearTimeout(timer));
}

function setConnection(state, text) {
    const el = document.getElementById('ws-status');
    el.className = 'ws-status ' + (state === 'on' ? 'connected' : 'disconnected');
    el.textContent = text;
    document.getElementById('r-connect').hidden = state !== 'off';
}

// ---------- поиск сервера в локальной сети
function probe(host) {
    const base = `http://${host}:${UI_PORT}`;
    return api(base, '/api/ping', {}, 1500).then(data => data && data.app === 'StreamTV' ? base : Promise.reject());
}

async function findServer() {
    if (onServer) { remote.base = ''; return ''; }
    if (remote.scanning) return null;
    remote.scanning = true;
    try {
        const saved = lsGet('stv_server');
        const first = [saved, '192.168.1.200'].filter(Boolean);
        for (const host of first) {
            setConnection('wait', `🔎 Проверяю ${host}…`);
            try { const base = await probe(host); return remember(base, host); } catch (e) { }
        }
        const hosts = [];
        ['192.168.1', '192.168.0'].forEach(net => { for (let i = 1; i < 255; i++) hosts.push(`${net}.${i}`); });
        let done = 0, found = null;
        const worker = async () => {
            while (!found && hosts.length) {
                const host = hosts.shift();
                try { found = found || await probe(host); if (found) remember(found, host); } catch (e) { }
                done++;
                if (done % 16 === 0) setConnection('wait', `🔎 Поиск сервера в сети… ${Math.round(done * 100 / 508)}%`);
            }
        };
        await Promise.all(Array.from({ length: 24 }, worker));
        return found;
    } finally {
        remote.scanning = false;
    }
}

function remember(base, host) {
    remote.base = base;
    lsSet('stv_server', host);
    document.getElementById('r-host').value = host;
    return base;
}

async function connectServer() {
    const base = await findServer();
    if (base === null) {
        remote.base = null;
        const host = lsGet('stv_server') || '192.168.1.200';
        document.getElementById('r-host').value = host;
        setConnection('off', '📡 Нет соединения с сервером');
        document.getElementById('r-state').textContent = 'Сервер StreamTV не найден';
        document.getElementById('r-summary').textContent =
            'Телефон должен быть в сети магазина, трансляция — запущена. Можно открыть пульт прямо с сервера.';
        return;
    }
    pollStatus();
}

// ---------- состояние
function pollStatus() {
    if (remote.base === null) return;
    api(remote.base, '/api/status', {}, 5000)
        .then(data => { remote.lastOk = Date.now(); setConnection('on', '🌐 Подключено к серверу'); renderStatus(data); })
        .catch(() => {
            if (Date.now() - remote.lastOk > 12000) {     // связь потеряна: ищем сервер заново
                remote.base = onServer ? '' : null;
                if (!onServer) connectServer();
                else setConnection('off', '📡 Нет соединения с сервером');
            }
        });
}

function tvName(tv) {
    let n = (tv.name || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    n = n.replace(/^\[LG\]\s*/, '').replace(/^webOS TV\s*/, '').replace(/^\[TV\]\s*/, '').trim();
    return n || tv.model || tv.host;
}

function renderStatus(data) {
    remote.stream = !!data.stream;
    remote.managed = !!data.managed;
    remote.tvs = data.tvs || [];
    const o = data.overview || {};
    const active = (o.total || 0) - (o.paused || 0);
    document.getElementById('r-state').textContent = remote.stream ? 'Трансляция идёт' : 'Трансляция остановлена';
    document.getElementById('r-summary').textContent = remote.stream
        ? `Играют ${o.playing || 0} из ${active} ТВ · браузер ${o.browser || 0}, DLNA ${o.dlna || 0}, Cast ${o.cast || 0}`
          + (o.paused ? ` · на паузе ${o.paused}` : '')
        : 'Запустите трансляцию в программе на компьютере.';
    const trouble = document.getElementById('r-trouble');
    trouble.hidden = !(remote.stream && o.trouble);
    trouble.textContent = `Требуют внимания: ${o.trouble || 0}`;
    document.getElementById('r-manage').textContent = remote.managed ? 'Приостановить управление ТВ' : 'Возобновить управление ТВ';
    (data.log || []).forEach(([at, text]) => {               // ответы программы на команды
        if (at > remote.seenLog) { remote.seenLog = at; addLogEntry(text); }
    });

    const box = document.getElementById('r-tvs');
    box.innerHTML = '';
    GROUPS.forEach(([platform, label]) => {
        const tvs = remote.tvs.filter(t => t.platform === platform).sort((a, b) => tvName(a).localeCompare(tvName(b)));
        if (!tvs.length) return;
        const title = document.createElement('div');
        title.className = 'r-group';
        title.textContent = `${label} · ${tvs.filter(t => PLAYING[t.stage]).length}/${tvs.length}`;
        box.appendChild(title);
        tvs.forEach(tv => {
            const row = document.createElement('button');
            row.className = 'r-tv';
            const dot = PLAYING[tv.stage] ? 'ok' : TROUBLE[tv.stage] ? 'bad' : tv.stage ? 'wait' : '';
            const state = tv.paused ? 'пауза' : (STAGES[tv.stage] || (remote.stream ? 'нет данных' : '—'));
            const extra = [tv.host, BRANCHES[tv.branch], tv.cache != null ? `кэш ${tv.cache}%` : ''].filter(Boolean).join(' · ');
            row.innerHTML = `<span class="r-dot ${dot}"></span><span class="r-name"></span><span class="r-st"></span><span class="r-meta"></span>`;
            row.querySelector('.r-name').textContent = tvName(tv);
            row.querySelector('.r-st').textContent = state;
            row.querySelector('.r-meta').textContent = extra;
            row.addEventListener('click', () => openTv(tv));
            box.appendChild(row);
        });
    });
}

// ---------- команды
function sendControl(command, extra) {
    if (remote.base === null) { addLogEntry('Нет соединения с сервером'); return false; }
    api(remote.base, '/api/command', {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ command }, extra || {}))
    }, 5000)
        .then(() => setTimeout(pollStatus, 700))
        .catch(() => addLogEntry('Команда не доставлена'));
    return true;
}

function openTv(tv) {
    remote.current = tv;
    document.getElementById('tv-sheet-title').textContent = tvName(tv);
    document.getElementById('tv-sheet-info').textContent =
        [tv.model, tv.host, tv.branch ? 'показ: ' + BRANCHES[tv.branch] : '', tv.reason || ''].filter(Boolean).join(' · ');
    document.getElementById('act-pause').hidden = !!tv.paused;
    document.getElementById('act-resume').hidden = !tv.paused;
    document.querySelectorAll('#tv-sheet [data-mode]').forEach(b => b.classList.toggle('on', (tv.mode || 'auto') === b.dataset.mode));
    document.getElementById('tv-sheet').hidden = false;
}

function setupRemote() {
    document.querySelectorAll('.sidebar-btn[data-cmd]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.dataset.cmd;
            if (cmd === 'sync') {
                const mm = Math.max(0, Math.min(59, parseInt(document.getElementById('r-mm').value, 10) || 0));
                const ss = Math.max(0, Math.min(59, parseInt(document.getElementById('r-ss').value, 10) || 0));
                sendControl('sync', { seconds: mm * 60 + ss });
            } else if (cmd === 'reload') {
                if (confirm('Перезапустить показ на всех ТВ?')) sendControl('reload');
            } else if (cmd === 'manage') {
                sendControl('manage', { action: remote.managed ? 'pause' : 'resume' });
            } else {
                sendControl(cmd);
            }
        });
    });
    document.querySelectorAll('#tv-sheet [data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
            const act = btn.dataset.act;
            if (act !== 'close' && remote.current) sendControl('tv', { action: act, key: remote.current.key });
            document.getElementById('tv-sheet').hidden = true;
        });
    });
    document.querySelectorAll('#tv-sheet [data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (remote.current) sendControl('tv', { action: 'mode', key: remote.current.key, mode: btn.dataset.mode });
            document.getElementById('tv-sheet').hidden = true;
        });
    });
    document.getElementById('tv-sheet').addEventListener('click', event => {
        if (event.target.id === 'tv-sheet') event.currentTarget.hidden = true;
    });
    document.getElementById('r-retry').addEventListener('click', () => {
        const host = document.getElementById('r-host').value.trim();
        if (host) lsSet('stv_server', host);
        connectServer();
    });
    document.getElementById('r-open').addEventListener('click', () => {
        const host = document.getElementById('r-host').value.trim() || '192.168.1.200';
        lsSet('stv_server', host);
        location.href = `http://${host}:${UI_PORT}/`;        // пульт прямо с программы: работает в любом браузере
    });
    connectServer();
    setInterval(pollStatus, 3000);
}

window.addEventListener('load', setupRemote);

// Адрес инструкции в тексте: сайт, с которого её открыли, или основной адрес (если открыта с самой программы)
const SITE_ADDRESS = 'stv.alexkyubi.com';
document.addEventListener('DOMContentLoaded', () => {
    const site = /alexkyubi\.com$/.test(location.hostname) ? location.hostname : SITE_ADDRESS;
    document.querySelectorAll('.site-address').forEach(el => { el.textContent = site; });
    document.querySelectorAll('.site-link').forEach(el => { el.href = 'https://' + site + '/'; });
});

// Добавление сообщения в лог консоли для пользователя
function addLogEntry(message) {
    const logContainer = document.getElementById("command-log");
    if (!logContainer) return;
    const entry = document.createElement("div");
    entry.textContent = ">_ " + message;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
    if (logContainer.children.length > 10) logContainer.removeChild(logContainer.firstChild);
}
