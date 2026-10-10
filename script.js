
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
document.addEventListener('DOMContentLoaded', function () {
    syncNavHeight();
    if (window.ResizeObserver) new ResizeObserver(syncNavHeight).observe(document.querySelector('nav'));
});
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
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
        if (!document.querySelector('.accordion-header.active')) loadVideos(document.querySelector('.video-section'));
    }, 800);
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







// Keep expanded content natural-sized after the transition: images/fonts and rotation may resize it.
function closeSection(header) {
    var content = header.nextElementSibling;
    content.style.maxHeight = content.scrollHeight + 'px';
    content.offsetHeight; // Establish the current height before collapsing from an auto-sized section.
    header.classList.remove('active');
    content.style.maxHeight = '0px';
    content.style.opacity = '0';
    unloadVideos(content);
}
headers.forEach(function (header) {
    header.addEventListener('click', function () {
        if (header.classList.contains('active')) {
            closeSection(header);
            loadVideos(document.querySelector('.video-section'));
            return;
        }
        headers.forEach(function (other) {
            if (other !== header && other.classList.contains('active')) closeSection(other);
        });
        var content = header.nextElementSibling;
        header.classList.add('active');
        loadVideos(content);
        unloadVideos(document.querySelector('.video-section'));
        content.style.maxHeight = content.scrollHeight + 'px';
        content.style.opacity = '1';
        setTimeout(function () {
            if (!header.classList.contains('active')) return;
            content.style.maxHeight = 'none';
            var navHeight = document.querySelector('nav').offsetHeight;
            window.scrollTo({ top: header.getBoundingClientRect().top + window.pageYOffset - navHeight - 8,
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }, 550);
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
const GROUPS_NAME = Object.fromEntries(GROUPS);
const onServer = location.port === String(UI_PORT);          // страница открыта с самой программы
let remote = { tvs: [], contents: [], managed: false, stream: false, current: null, base: null, lastOk: 0, seenLog: 0, scanning: false,
               codes: [], codeKeys: '', found: [], scan: {}, foundOpen: false, scanSeen: null };

// сопряжение и способы браузера Android (как в программе)
const PAIRING = { paired: 'сопряжён', waiting: 'не сопряжён', gave_up: 'не сопряжён',
                  cast_waiting: 'ждёт разрешения Cast на ТВ', cast_gave_up: 'Cast не разрешён' };
const WAYS = { adb: 'ADB 5555', adb_wifi: 'ADB по Wi-Fi', cast: 'DashCast' };

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
    remote.contents = data.contents || [];
    renderCodes(data.codes || []);
    renderFound(data.found || [], data.scan || {});
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
    const manage = document.getElementById('r-manage');
    manage.querySelector('span').textContent = remote.managed ? 'Пауза управления' : 'Возобновить управление';
    manage.querySelector('i').className = 'fas ' + (remote.managed ? 'fa-pause' : 'fa-play');
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
            const unpaired = tv.pairing === 'waiting' || tv.pairing === 'gave_up' ? 'не сопряжён' : '';
            const extra = [tv.host, BRANCHES[tv.branch], contentName(tv), tv.cache != null ? `кэш ${tv.cache}%` : '', unpaired]
                .filter(Boolean).join(' · ');
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

// каналы контента ТВ: пустой выбор — все каналы подряд (так по умолчанию)
function tvSelection(tv) {
    const ids = remote.contents.map(c => c.id);
    const own = (tv.selection || []).filter(id => ids.includes(id));
    return own.length ? own : ids;
}

function contentName(tv) {
    const sel = tvSelection(tv);
    if (!remote.contents.length || sel.length === remote.contents.length) return '';
    return '«' + remote.contents.filter(c => sel.includes(c.id)).map(c => c.name).join(' + ') + '»';
}

// ТВ, ждущие код с экрана: одна плашка на ТВ; пока что-то вводят, плашки не перерисовываются
function renderCodes(codes) {
    remote.codes = codes;
    const box = document.getElementById('r-codes');
    const keys = codes.map(c => c.key).join('|');
    box.hidden = !codes.length;
    if (keys === remote.codeKeys) return;
    remote.codeKeys = keys;
    box.innerHTML = '';
    if (codes.length) document.getElementById('tv-sheet').hidden = true;      // the code comes first
    codes.slice(0, 1).forEach(c => {
        const card = document.createElement('div');
        card.className = 'r-code';
        card.innerHTML = '<b></b><div class="r-small"></div><input type="text" maxlength="6" autocomplete="off">' +
                         '<div class="r-code-btns"><button class="sidebar-btn">Отправить код</button>' +
                         '<button class="sidebar-btn">Отмена</button></div>';
        card.querySelector('b').textContent = `${c.name || c.host} ждёт код`;
        card.querySelector('.r-small').textContent = c.wireless
            ? 'На этом ТВ откройте: Настройки → Для разработчиков → Отладка по Wi-Fi → «Подключить устройство с кодом». ' +
              'Введите 6 цифр с экрана ТВ. Окно с кодом на ТВ не закрывайте.'
            : 'Введите 6 символов, которые показывает экран ТВ.';
        const input = card.querySelector('input');
        input.inputMode = c.wireless ? 'numeric' : 'text';
        input.placeholder = c.wireless ? '6 цифр' : '6 символов';
        const [send, cancel] = card.querySelectorAll('button');
        send.addEventListener('click', () => {
            const code = input.value.replace(/\s/g, '');
            if (!/^[0-9A-Fa-f]{6}$/.test(code)) { addLogEntry('Код — 6 символов с экрана ТВ'); return; }
            sendControl('tv', { action: 'code', key: c.key, code });
            remote.codeKeys = '';
        });
        cancel.addEventListener('click', () => { sendControl('tv', { action: 'code', key: c.key, code: 'cancel' }); remote.codeKeys = ''; });
        input.addEventListener('keydown', event => { if (event.key === 'Enter') send.click(); });
        box.appendChild(card);
        setTimeout(() => input.focus(), 50);
    });
}

// the logo takes half of a phone screen: hidden once the remote is used (until the page is reloaded)
function compactRemote() {
    document.getElementById('sidebar').classList.add('compact');
}

// найденные поиском, но не добавленные ТВ
function renderFound(found, scan) {
    remote.found = found;
    remote.scan = scan;
    const state = document.getElementById('r-scan-state');
    const button = document.getElementById('r-scan');
    button.disabled = !!scan.running;
    button.querySelector('span').textContent = scan.running ? 'Идёт поиск…' : 'Найти новые ТВ';
    // a search finished since the page last looked: show what it found
    if (scan.at && !scan.running && remote.scanSeen !== null && scan.at !== remote.scanSeen) remote.foundOpen = true;
    remote.scanSeen = scan.at || 0;
    state.hidden = !(scan.running || scan.at || found.length);
    state.textContent = scan.running ? 'Ищу телевизоры в сети, это до минуты…'
        : scan.error ? 'Поиск не удался, повторите'
        : !found.length ? 'Новых ТВ нет'
        : `Новых ТВ: ${found.length} — ` + (remote.foundOpen ? 'скрыть ▴' : 'показать ▾');
    const box = document.getElementById('r-found');
    box.hidden = !found.length || !remote.foundOpen;
    box.innerHTML = '';
    found.forEach(tv => {
        const row = document.createElement('button');
        row.className = 'r-tv r-new';
        row.innerHTML = '<span class="r-dot"></span><span class="r-name"></span><span class="r-st">добавить</span><span class="r-meta"></span>';
        row.querySelector('.r-name').textContent = tv.name || tv.model || tv.host;
        row.querySelector('.r-meta').textContent = [tv.host, GROUPS_NAME[tv.platform], (tv.ways || []).join(', ')]
            .filter(Boolean).join(' · ');
        row.addEventListener('click', () => {
            if (confirm(`Добавить ${tv.name || tv.host} в список? Начнётся сопряжение — подтвердите его на экране ТВ.`))
                sendControl('add_tv', { key: tv.key });
        });
        box.appendChild(row);
    });
}

// ---------- настройки ТВ: строки «название — значение ›», выбор в списке снизу
const MODE_NAMES = { auto: 'Авто', browser: 'Браузер', dlna: 'DLNA', cast: 'Cast' };

function settingRow(box, title, value, open) {
    const row = document.createElement('button');
    row.className = 'r-setting';
    row.innerHTML = '<span class="r-setting-name"></span><span class="r-setting-value"></span><span class="r-setting-go">›</span>';
    row.querySelector('.r-setting-name').textContent = title;
    row.querySelector('.r-setting-value').textContent = value;
    row.addEventListener('click', open);
    box.appendChild(row);
}

// options: [{id, text, disabled}]; one choice -> sent at once; several -> «Готово» sends one command
function openPicker({ title, hint, options, chosen, multi, apply }) {
    const sheet = document.getElementById('r-picker');
    const list = document.getElementById('r-picker-list');
    let picked = chosen.slice();
    document.getElementById('r-picker-title').textContent = title;
    document.getElementById('r-picker-hint').textContent = hint || '';
    document.getElementById('r-picker-done').hidden = !multi;
    list.classList.toggle('multi', !!multi);              // square boxes: several can be ticked
    const draw = () => {
        list.innerHTML = '';
        options.forEach(opt => {
            const item = document.createElement('button');
            item.className = 'r-option' + (picked.includes(opt.id) ? ' on' : '');
            item.disabled = !!opt.disabled;
            item.innerHTML = '<span class="r-check"></span><span></span>';
            item.lastChild.textContent = opt.text + (opt.disabled ? ' — нет у ТВ' : '');
            item.addEventListener('click', () => {
                if (!multi) { sheet.hidden = true; apply(opt.id); return; }
                picked = opt.toggle(picked);
                draw();
            });
            list.appendChild(item);
        });
    };
    document.getElementById('r-picker-done').onclick = () => { sheet.hidden = true; apply(picked); };
    draw();
    sheet.hidden = false;
}

function renderSettings(tv) {
    const box = document.getElementById('tv-settings');
    box.innerHTML = '';
    const close = () => { document.getElementById('tv-sheet').hidden = true; };
    // способ показа
    const mode = tv.mode || 'auto';
    settingRow(box, 'Способ показа', MODE_NAMES[mode] || mode, () => openPicker({
        title: 'Способ показа', hint: 'Авто: браузер, при сбое DLNA, затем Cast.', chosen: [mode],
        options: Object.keys(MODE_NAMES).map(id => ({ id, text: MODE_NAMES[id],
            disabled: id !== 'auto' && Array.isArray(tv.modes) && !tv.modes.includes(id) })),
        apply: id => { sendControl('tv', { action: 'mode', key: tv.key, mode: id }); close(); },
    }));
    // контент: «Все каналы» или несколько каналов
    if (remote.contents.length > 1) {
        const ids = remote.contents.map(c => c.id);
        const sel = tvSelection(tv);
        const all = sel.length === ids.length;
        const toChosen = list => list.length === ids.length ? ['all'] : list;
        settingRow(box, 'Контент', all ? 'Все каналы' : contentName(tv).replace(/[«»]/g, ''), () => openPicker({
            title: 'Контент', hint: 'Отметьте каналы и нажмите «Готово».', multi: true, chosen: toChosen(sel),
            options: [{ id: 'all', text: 'Все каналы', toggle: () => ['all'] }].concat(remote.contents.map(c => ({
                id: c.id, text: c.name,
                toggle: picked => {
                    const cur = picked.includes('all') ? [] : picked;
                    const next = cur.includes(c.id) ? cur.filter(x => x !== c.id) : cur.concat(c.id);
                    return next.length ? toChosen(ids.filter(x => next.includes(x))) : ['all'];
                },
            }))),
            apply: picked => {
                const chosen = picked.includes('all') ? 'all' : picked.join('+');
                sendControl('tv', { action: 'content', key: tv.key, content: chosen });
                close();
            },
        }));
    }
    // браузер Android
    const ways = tv.ways || [];
    if (tv.platform === 'android' && ways.length) {
        const via = tv.via || 'auto';
        settingRow(box, 'Браузер', via === 'auto' ? 'Авто' : (WAYS[via] || via), () => openPicker({
            title: 'Браузер', hint: 'Авто: ADB 5555, затем отладка по Wi-Fi, затем DashCast.', chosen: [via],
            options: [{ id: 'auto', text: 'Авто' }].concat(ways.map(w => ({ id: w, text: WAYS[w] || w }))),
            apply: id => { sendControl('tv', { action: 'browser', key: tv.key, via: id }); close(); },
        }));
    }
}

function openTv(tv) {
    remote.current = tv;
    document.getElementById('tv-sheet-title').textContent = tvName(tv);
    document.getElementById('tv-sheet-info').textContent =
        [tv.model !== tvName(tv) ? tv.model : '', tv.host, tv.branch ? 'показ: ' + BRANCHES[tv.branch] : '',
         PAIRING[tv.pairing] || '', tv.reason || '']
            .filter(Boolean).join(' · ');
    document.getElementById('act-pause').hidden = !!tv.paused;
    document.getElementById('act-resume').hidden = !tv.paused;
    renderSettings(tv);
    // pairing: an outlined call to action only when the TV is not paired
    const unpaired = tv.pairing === 'waiting' || tv.pairing === 'gave_up';
    const pair = document.getElementById('act-pair');
    pair.classList.toggle('warn', unpaired);
    pair.hidden = tv.pairing === 'not_needed';
    pair.querySelector('span').textContent = unpaired ? 'Запросить сопряжение' : 'Сопрячь заново';
    document.getElementById('tv-sheet').hidden = false;
}

function setupRemote() {
    // the reply log is one line; a tap shows the last few
    document.getElementById('command-log').addEventListener('click', event => event.currentTarget.classList.toggle('open'));
    document.getElementById('sidebar').addEventListener('click', compactRemote);
    document.getElementById('tv-sheet').addEventListener('click', compactRemote);
    document.querySelectorAll('#sidebar [data-cmd]').forEach(btn => {
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
    document.getElementById('r-picker-cancel').addEventListener('click', () => { document.getElementById('r-picker').hidden = true; });
    document.getElementById('r-picker').addEventListener('click', event => {
        if (event.target.id === 'r-picker') event.currentTarget.hidden = true;
    });
    document.getElementById('r-scan-state').addEventListener('click', () => {
        remote.foundOpen = !remote.foundOpen;
        renderFound(remote.found, remote.scan);
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

document.addEventListener('DOMContentLoaded', setupRemote);

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
    entry.textContent = "› " + message;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
    if (logContainer.children.length > 10) logContainer.removeChild(logContainer.firstChild);
}
