/**
 * index.js — Main Server Foundation
 * Super Warrior Z — MAIN SERVER (Port 8001)
 *
 * File utama main-server. Semua handler logic ada di handlers/{type}/{action}.js.
 *
 * STRUKTUR:
 *   index.js                    — File ini: socket, router, db, config, TEA verify, io.connect
 *                                 (Logger v2 Client-Journey sudah INLINE di file ini)
 *   handlers/{type}/{action}.js — Handler files (lazy loaded on-demand)
 *
 * SERVER TIME:
 *   - serverTime  = Date.now() (UTC ms perangkat = UTC ms server)
 *   - server0Time = -25200000 (60 * (-420) * 1000, UTC+7 timezone offset)
 *   - Hasil: getServerLocalDate() = waktu perangkat untuk UTC+7
 *
 * SERVER OPEN DATE:
 *   - Format: unix timestamp ms
 *   - Digunakan: VIP gating, temple trial, arena first-day check
 *
 * DAILY RESET:
 *   - RESET_HOUR = 6 (jam 06:00 server local time)
 *   - Jam 00:00-05:59 masih dianggap hari sebelumnya
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════
    //  BASE PATH
    // ═══════════════════════════════════════════════════════

    var basePath = (function () {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
            var src = scripts[i].src || '';
            if (src.indexOf('main-server/index.js') !== -1) {
                return src.replace('index.js', '');
            }
        }
        return './server/main-server/';
    })();

    // ═══════════════════════════════════════════════════════
    //  TEA (self-contained, key="verification")
    // ═══════════════════════════════════════════════════════

    var _TEA_Utf8 = (function () {
        function e() {}
        e.encode = function (e) {
            var t = e.replace(/[\u0080-\u07ff]/g, function (e) {
                var t = e.charCodeAt(0);
                return String.fromCharCode(192 | t >> 6, 128 | 63 & t);
            });
            return t = t.replace(/[\u0800-\uffff]/g, function (e) {
                var t = e.charCodeAt(0);
                return String.fromCharCode(224 | t >> 12, 128 | t >> 6 & 63, 128 & 63 & t);
            });
        };
        e.decode = function (e) {
            var t = e.replace(/[\u00e0-\u00ef][\u0080-\u00bf][\u0080-\u00bf]/g, function (e) {
                var t = (15 & e.charCodeAt(0)) << 12 | (63 & e.charCodeAt(1)) << 6 | 63 & e.charCodeAt(2);
                return String.fromCharCode(t);
            });
            return t = t.replace(/[\u00c0-\u00df][\u0080-\u00bf]/g, function (e) {
                var t = (31 & e.charCodeAt(0)) << 6 | 63 & e.charCodeAt(1);
                return String.fromCharCode(t);
            });
        };
        return e;
    })();

    var _TEA_Base64 = (function () {
        function e() {}
        e.code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        e.encode = function (t) {
            var n, o, a, r, i, s, l, u, c, p, d, g = [], m = "", h = e.code;
            p = t;
            c = p.length % 3;
            if (c > 0) {
                while (c++ < 3) { m += "="; p += "\x00"; }
            }
            for (c = 0; c < p.length; c += 3) {
                n = p.charCodeAt(c); o = p.charCodeAt(c + 1); a = p.charCodeAt(c + 2);
                r = n << 16 | o << 8 | a;
                i = r >> 18 & 63; s = r >> 12 & 63; l = r >> 6 & 63; u = 63 & r;
                g[c / 3] = h.charAt(i) + h.charAt(s) + h.charAt(l) + h.charAt(u);
            }
            d = g.join("");
            d = d.slice(0, d.length - m.length) + m;
            return d;
        };
        e.decode = function () {};
        return e;
    })();

    _TEA_Base64.decode = function (input) {
        var n, o, a, r, i, s, l, u, c, d = [], g = _TEA_Base64.code;
        for (var m = 0; m < input.length; m += 4) {
            r = g.indexOf(input.charAt(m));
            i = g.indexOf(input.charAt(m + 1));
            s = g.indexOf(input.charAt(m + 2));
            l = g.indexOf(input.charAt(m + 3));
            u = r << 18 | i << 12 | s << 6 | l;
            n = u >>> 16 & 255; o = u >>> 8 & 255; a = 255 & u;
            d[m / 4] = String.fromCharCode(n, o, a);
            if (64 == l) { d[m / 4] = String.fromCharCode(n, o); }
            if (64 == s) { d[m / 4] = String.fromCharCode(n); }
        }
        return d.join("");
    };

    var _TEA = (function () {
        function e() {}
        e.prototype.strToLongs = function (e) {
            var t = new Array(Math.ceil(e.length / 4));
            for (var n = 0; n < t.length; n++) {
                t[n] = e.charCodeAt(4 * n) + (e.charCodeAt(4 * n + 1) << 8) + (e.charCodeAt(4 * n + 2) << 16) + (e.charCodeAt(4 * n + 3) << 24);
            }
            return t;
        };
        e.prototype.longsToStr = function (e) {
            var t = new Array(e.length);
            for (var n = 0; n < e.length; n++) {
                t[n] = String.fromCharCode(255 & e[n], e[n] >>> 8 & 255, e[n] >>> 16 & 255, e[n] >>> 24 & 255);
            }
            return t.join("");
        };
        e.prototype.encrypt = function (plaintext, key) {
            if (0 === plaintext.length) return "";
            var n = this.strToLongs(_TEA_Utf8.encode(plaintext));
            n.length <= 1 && (n[1] = 0);
            for (var o, a, r = this.strToLongs(_TEA_Utf8.encode(key).slice(0, 16)),
                     i = n.length, s = n[i - 1], l = n[0],
                     u = 2654435769, c = Math.floor(6 + 52 / i), p = 0; c-- > 0;) {
                p += u; a = p >>> 2 & 3;
                for (var d = 0; i > d; d++) {
                    l = n[(d + 1) % i];
                    o = (s >>> 5 ^ l << 2) + (l >>> 3 ^ s << 4) ^ (p ^ l) + (r[3 & d ^ a] ^ s);
                    s = n[d] += o;
                }
            }
            return _TEA_Base64.encode(this.longsToStr(n));
        };
        e.prototype.decrypt = function (ciphertext, key) {
            if (0 === ciphertext.length) return "";
            for (var n, o, a = this.strToLongs(_TEA_Base64.decode(ciphertext)),
                     r = this.strToLongs(_TEA_Utf8.encode(key).slice(0, 16)),
                     i = a.length, s = a[i - 1], l = a[0],
                     u = 2654435769, c = Math.floor(6 + 52 / i), p = c * u; 0 !== p;) {
                o = p >>> 2 & 3;
                for (var d = i - 1; d >= 0; d--) {
                    s = a[d > 0 ? d - 1 : i - 1];
                    n = (s >>> 5 ^ l << 2) + (l >>> 3 ^ s << 4) ^ (p ^ l) + (r[3 & d ^ o] ^ s);
                    l = a[d] -= n;
                }
                p -= u;
            }
            var g = this.longsToStr(a);
            g = g.replace(/\0+$/, "");
            return _TEA_Utf8.decode(g);
        };
        return e;
    })();

    // ═══════════════════════════════════════════════════════
    //  LOGGER
    // ═══════════════════════════════════════════════════════

    var Logger = (function () {

        var PRIORITY = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 99 };
        var STORE_KEY = 'MS_LOG_LEVEL';
        var currentLevel = 'INFO';
        try { currentLevel = localStorage.getItem(STORE_KEY) || 'INFO'; } catch (e) {}
        var minPrio = PRIORITY[currentLevel] !== undefined ? PRIORITY[currentLevel] : 1;

        function shouldLog(level) {
            var p = PRIORITY[level];
            return p !== undefined && p >= minPrio;
        }

        var counts = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, NOTIFY: 0 };

        var SERVER_TAG = '[MAIN-SERVER]';

        var COLORS = {
            INFO:  '#37474F',   // gelap kontras ala login-server — pill kuning jadi bintang
            WARN:  '#EF6C00',
            ERROR: '#C62828',
            DEBUG: '#90A4AE'
        };

        // ═══ PATEN (user) — gaya login-server, TIDAK diubah lagi: ═══
        // pill SERVER = BIRU MUDA besar (ala pill hijau login-server)
        var PILL_TAG = 'background:#42A5F5;color:#fff;padding:3px 12px;border-radius:12px;font-weight:bold;font-size:11px;';
        // pill KATEGORI = KUNING (ala pill action login-server) — SEMUA kategori
        var PILL_CAT = 'background:#FFC107;color:#000;padding:3px 10px;border-radius:10px;font-weight:bold;font-size:11px;';

        var DETAIL_CLR = 'color:#004D40;opacity:0.85;padding-left:8px;';

        // PATEN (user): TIDAK ADA timestamp di judul — login-server juga tidak punya
        // timestamp di baris tag-nya (⚪ LOGIN-SERVER  💠 action). Judul = pill + pill. TITIK.

        var CTX_EMOJI = {
            // ── Infra (index.js internal) ──
            startup:   '🚀', storage:  '🗄', handler:  '🔀', database: '💾',
            connection:'🔌', encryption:'🍵', network: '🌐', register:'📝',
            loader:    '📦', callback: '⚡', notification:'🔔', resource:'📁',
            heroStats: '💪', inspect: '🔍', emit:    '📤', admin:   '🛡',
            broadcast: '📢', bulletin:'📢', response:'📤',
            // ── Handler types (server/main-server/handlers/*, 34 type) ──
            user:      '👤', userMsg: '📨', hero:    '🦸', heroImage:'🖼',
            equip:     '🗡', weapon:  '🔫', backpack:'🎒', summon:  '🎰',
            checkin:   '📅', dungeon: '🏰', tower:   '🗼', trial:   '⛰',
            arena:     '🏟', guild:   '🏯', friend:  '🤝', mail:    '📬',
            shop:      '🏪', market:  '📈', vipMarket:'💠', monthCard:'🎫',
            recharge:  '💳', gift:    '🎁', task:    '📋', activity:'🎉',
            hangup:    '⏳', guide:   '🧭', snake:   '🐍', cellgame:'🧬',
            superSkill:'✨', entrust: '🧾', timeMachine:'⏰', mine: '⛏',
            battle:    '⚔', buryPoint:'🪦', enterGame:'🎮'
        };

        // Legacy UPPERCASE contexts (belum dimigrasi semua file handler)
        var _LEGACY_EMOJI = {
            HANDLER: '🎮', META: '🗄', ROUTE: '🔀', DB: '💾', SOCK: '🔌',
            TEA: '🍵', IO: '🌐', REG: '📝', LOAD: '📦', CB: '⚡',
            NTFY: '🔔', RESOURCE: '📁', HERO_ATTR: '⚔', HERO_STATS: '💪',
            TASK: '📋', USER: '👤', CHAT: '💬', FRIEND: '🤝',
            HERO_IMG: '🖼', DUNGEON: '🏰', HERO: '🦸', ITEM: '💎',
            GUILD: '🏯', SUMMON: '🎰', ARENA: '🏟', NOTIFY: '🔔',
            INSPECT: '🔍', EMIT: '📤', BROADCAST: '📢', BULLETIN: '📢', ADMIN: '🛡',
            ARENA_DAILY: '🏟', ARENA_JOIN: '🏟', ARENA_SELECT: '🏟', ARENA_SETTEAM: '🏟',
            ARENA_START: '🏟', ARENA_TASK: '🏟', ACTIVE_RING: '💍', AUTO_RING_LVUP: '💍',
            RING_EVOLVE: '💍', BPACK_OPENBOX: '📦', OPENBOX: '📦', RANDSUMMONS: '🎰',
            BUYFUND: '💸', BUYLF: '🎓', GETLFR: '🎓', CARD: '🃏',
            CELLGAME: '🧬', CELLGAME_RESULT: '🧬', CELLGAME_START: '🧬',
            CHAPTER_REWARD: '📖', DUNGEON_RESULT: '🏰', DUNGEON_START: '🏰', DUNGEON_SWEEP: '🏰',
            EQUIP_ACTIVE: '🗡', WEAPON_MERGE: '🔧', WEAPON_STRENGTHEN: '🔨',
            WEAPON_UPGRADE: '⬆️', WEAPON_WEAR: '🗡', WEARAUTO: '🗡', MERGE: '🔧',
            FB: '🤝', FB_SIM: '🤝', FRIEND_DEF: '🤝', APPLYFRIEND: '🤝', GETFRIENDS: '🤝',
            GAIN: '💰', HERO_HELP: '🙋', HERO_SPLIT: '✂️', 'IMPRINT-FILTER': '🔖',
            INIT: '🚀', LEVELREWARD: '🎖', LEVELUP: '⬆️', MINE_SB: '⛏',
            NORMAL_LUCK: '🍀', ONLINEGIFT: '🎁', QUEST: '📜', REBORN: '♻️',
            REWARD: '🎁', REWARDINFO: '🎁', SIM: '🎮', STARTGENERAL: '🚩',
            SUMMON_ENERGY: '⚡', TAB2_TIER: '🗂', TM_BOSS: '⏰', TM_RESULT: '⏰',
            TM_START: '⏰', TM_TASK: '⏰', TRIAL_RESULT: '⛰', TRIAL_START: '⛰',
            TRIAL_STATE: '⛰', TRIAL_VIPBUY: '⛰', VIP: '👑'
        };

        function _ctxEmoji(ctx) {
            var c = ctx || '';
            // 1) exact match (camelCase keys + infra)
            if (CTX_EMOJI[c]) return CTX_EMOJI[c];
            // 2) route "type/action" → emoji type segment
            var seg = c.split('/')[0].toLowerCase();
            if (CTX_EMOJI[seg]) return CTX_EMOJI[seg];
            // 3) uppercase legacy
            var up = c.toUpperCase();
            if (_LEGACY_EMOJI[up]) return _LEGACY_EMOJI[up];
            return '⚪';
        }

        // Display name mapping: transforms old UPPERCASE to natural camelCase for log output
        var DISPLAY_NAME = {
            'BOOT': 'startup', 'META': 'storage', 'ROUTE': 'handler', 'DB': 'database',
            'SOCK': 'connection', 'TEA': 'encryption', 'IO': 'network', 'REG': 'register',
            'LOAD': 'loader', 'CB': 'callback', 'NTFY': 'notification',
            'RESOURCE': 'resource', 'HERO_ATTR': 'heroStats'
        };

        function _displayName(ctx) {
            var upper = (ctx || '').toUpperCase();
            return DISPLAY_NAME[upper] || ctx;
        }

        // ═══════════════════════════════════════════════════
        //  CATEGORY COLOR — warna per type (dipakai grup ▶ REQUEST)
        // ═══════════════════════════════════════════════════

        var CATEGORY_COLOR = {
            startup: '#4CAF50', database: '#42A5F5', connection: '#26C6DA', encryption: '#8D6E63',
            network: '#5C6BC0', register: '#78909C', loader: '#FFA726', handler: '#EC407A',
            callback: '#FFD54F', notification: '#AB47BC', resource: '#8D6E63', storage: '#90A4AE',
            heroStats: '#EF5350', inspect: '#26A69A', emit: '#66BB6A', admin: '#E57373',
            user: '#42A5F5', userMsg: '#64B5F6', hero: '#EF5350', heroImage: '#F06292',
            equip: '#FFB74D', weapon: '#FF8A65', backpack: '#A1887F', summon: '#AB47BC',
            checkin: '#66BB6A', dungeon: '#7E57C2', tower: '#5C6BC0', trial: '#8D6E63',
            arena: '#FF7043', guild: '#26A69A', friend: '#4DB6AC', mail: '#FFD54F',
            shop: '#4FC3F7', market: '#81C784', vipMarket: '#BA68C8', monthCard: '#F06292',
            recharge: '#4CAF50', gift: '#E57373', task: '#90CAF9', activity: '#FFB74D',
            hangup: '#9575CD', guide: '#AED581', snake: '#81C784', cellgame: '#4DD0E1',
            superSkill: '#FDD835', entrust: '#FF8A65', timeMachine: '#7986CB', mine: '#A1887F',
            battle: '#E57373', buryPoint: '#90A4AE', enterGame: '#42A5F5'
        };

        function _ctxColor(ctx) {
            var c = (ctx || '').toLowerCase();
            if (CATEGORY_COLOR[c]) return CATEGORY_COLOR[c];
            var seg = c.split('/')[0];
            return CATEGORY_COLOR[seg] || '#4CAF50';
        }

        // ═══════════════════════════════════════════════════
        //  ENRICHMENT — tabel game (lazy, pola sama dgn loadJsonSync()
        //  di file handler: sync XHR ke ./resource/json/{name}.json)
        // ═══════════════════════════════════════════════════

        var _tableCache = {};

        function loadGameTable(name) {
            if (_tableCache.hasOwnProperty(name)) return _tableCache[name];
            var out = null;
            try {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', './resource/json/' + name + '.json', false);
                xhr.send();
                if (xhr.status === 200) out = JSON.parse(xhr.responseText);
            } catch (e) { out = null; }
            _tableCache[name] = out;
            return out;
        }

        // errorDefine.json: 365 kode resmi — {id, hintType, isKick, isNotShow,
        // errorType, errorDescription}. Client: ShowErrorTips(ret) pakai tabel ini.
        function errorInfo(ret) {
            var t = loadGameTable('errorDefine');
            return t ? (t[String(ret)] || null) : null;
        }

        // thingsID.json: 1636 item — nameGM/keyName utk nama tampilan reward
        function thingName(itemId) {
            var t = loadGameTable('thingsID');
            var row = t ? t[String(itemId)] : null;
            return (row && (row.nameGM || row.keyName)) ? (row.nameGM || row.keyName) : ('things#' + itemId);
        }

        // CLIENT_NEXT — langkah client SETELAH respons (grounded main.min.js):
        // ret===0 → processHandler lanjut flow scene/UI sesuai route;
        // ret!==0 → ShowErrorTips(ret) + LoadingPanel hide (guard 10s).
        // chain   → request berikutnya yang client kirim otomatis (urut).
        // Sumber: main.min.js — processHandler callbacks, runScene/openWindow,
        // UserDataParser.saveUserData, registChat loop, ErrorHandler.
        var CLIENT_NEXT = {
            // ── user ──
            'user/enterGame':        { ok: 'saveUserData (100+ field) · updateServerTime · runScene("OverScene") · listener Notify aktif',
                                       fail: 'tetap di LoginScene · LoadingPanel hide (guard 10s) — koneksi main-server gagal total',
                                       chain: 'user/registChat (loop 3dtk) → User/SaveUserEnterInfo (login) → heroImage/getAll → hero/getAttrs → userMsg/getMsgList → entrust/getInfo → chat/login → dungeon connect (myTeamServerSocketUrl)' },
            'user/registChat':       { ok: '_success=true → simpan _chatServerUrl/_worldRoomId/_guildRoomId/_teamDungeonChatRoom/_teamChatRoom · stop loop 3dtk',
                                       fail: 'loop poll 3 dtk LANJUT (bukan fatal) — chat-server & dungeon tidak connect sampai sukses',
                                       chain: 'chat/login (chat-server) → chat/joinRoom ×4 (world/guild/teamDungeon/team)' },
            'user/clickSystem':      { ok: 'simpan statistik klik sistem (red-dot state)' },
            'user/getBulletinBrief': { ok: 'bandingkan _bulletinVersions → tampil pengumuman bila versi baru' },
            'user/readBulletin':     { ok: 'tandai bulletin dibaca · red dot hilang' },
            // ── hero ──
            'hero/getAttrs':         { ok: 'isi window detail hero — attr final (HP/ATK/DEF/speed) + power' },
            'hero/autoLevelUp':      { ok: 'animasi level-up · power refresh', chain: 'hero/getAttrs (window terbuka) · task/queryTask (progress)' },
            'hero/evolve':           { ok: 'animasi evolve · quality naik · refresh kartu hero', chain: 'hero/getAttrs · task/queryTask' },
            'hero/wakeUp':           { ok: 'animasi star-up · refresh UI hero', chain: 'hero/getAttrs' },
            'hero/reborn':           { ok: 'hero reset → level 1 · resource kembali (popup)' },
            'hero/resolve':          { ok: 'hero dipecah → popup reward pieces/gold', chain: 'task/queryTask' },
            'hero/splitHero':        { ok: 'split hero → popup reward' },
            'hero/activeSkill':      { ok: 'slot skill aktif · refresh UI skill hero' },
            // ── summon ──
            'summon/summonOne':      { ok: 'window SummonResult · reveal hero + animasi', chain: 'task/queryTask · refresh currency UI' },
            'summon/summonOneFree':  { ok: 'window SummonResult (free) · timer free refresh', chain: 'task/queryTask' },
            'summon/summonTen':      { ok: 'window SummonResult ×10 · reveal berurutan', chain: 'task/queryTask · refresh currency UI' },
            'summon/summonEnergy':   { ok: 'tukar energy → popup hasil' },
            // ── backpack ──
            'backpack/openBox':      { ok: 'animasi buka box · popup reward (thingsID)' },
            'backpack/randSummons':  { ok: 'animasi summon · reveal hero · refresh backpack' },
            // ── dungeon ──
            'dungeon/startBattle':   { ok: 'play battleRecordData (replay server-authoritative)' },
            'dungeon/checkBattleResult': { ok: 'window hasil battle + loot · refresh UI dungeon', chain: 'task/queryTask' },
            'dungeon/sweep':         { ok: 'popup reward sweep · refresh sisa count', chain: 'task/queryTask' },
            'dungeon/buyCount':      { ok: 'refresh jumlah battle tersisa' },
            // ── hangup (idle) ──
            'hangup/gain':           { ok: 'collect reward idle · timer chapter reset' },
            'hangup/nextChapter':    { ok: 'chapter baru · refresh stage UI' },
            'hangup/checkBattleResult': { ok: 'verifikasi stage → chapter berikutnya terbuka' },
            'hangup/getChapterReward':  { ok: 'popup reward chapter' },
            'hangup/getLessonFundReward': { ok: 'popup reward lesson fund' },
            'hangup/buyLessonFund':  { ok: 'fund aktif · refresh UI fund' },
            'hangup/startGeneral':   { ok: 'general hangup mulai · refresh UI' },
            'hangup/saveGuideTeam':  { ok: 'formasi guide tersimpan' },
            // ── arena ──
            'arena/join':            { ok: 'refresh 3 lawan matchmaking (ArenaScene)' },
            'arena/select':          { ok: 'lawan terpilih · tombol battle aktif' },
            'arena/startBattle':     { ok: 'play battleRecordData arena' },
            'arena/setTeam':         { ok: 'formasi defense tersimpan' },
            'arena/getDailyReward':  { ok: 'popup reward harian arena' },
            // ── equip / weapon ──
            'equip/activeRing':      { ok: 'slot ring aktif · attr hero berubah', chain: 'hero/getAttrs (window hero terbuka)' },
            'equip/activeWeapon':    { ok: 'slot weapon aktif · attr hero berubah', chain: 'hero/getAttrs (window hero terbuka)' },
            'equip/merge':           { ok: 'equip merger · popup hasil' },
            'equip/ringEvolve':      { ok: 'ring evolve · refresh UI equip', chain: 'hero/getAttrs' },
            'equip/autoRingLevelUp': { ok: 'ring level-up beruntun · popup hasil', chain: 'hero/getAttrs' },
            'equip/wearAuto':        { ok: 'rekomendasi terpasang otomatis · refresh attr', chain: 'hero/getAttrs' },
            'weapon/merge':          { ok: 'weapon merger · popup hasil' },
            'weapon/upgrade':        { ok: 'weapon level naik · refresh UI', chain: 'hero/getAttrs' },
            'weapon/strengthen':     { ok: 'weapon strengthen · refresh UI', chain: 'hero/getAttrs' },
            'weapon/autoStrengthen': { ok: 'strengthen beruntun · popup hasil', chain: 'hero/getAttrs' },
            'weapon/wear':           { ok: 'weapon terpasang · refresh attr', chain: 'hero/getAttrs' },
            // ── task / mail / msg ──
            'task/queryTask':        { ok: 'render daftar task + progress bar' },
            'task/getReward':        { ok: 'popup reward task · task berikutnya aktif · red dot refresh' },
            'mail/getMailList':      { ok: 'render list mail · red dot per unread' },
            'userMsg/getMsgList':    { ok: 'render list pesan pribadi · red dot' },
            // ── shop / market / vipMarket ──
            'shop/getInfo':          { ok: 'render grid shop + timer refresh' },
            'shop/buy':              { ok: 'popup reward · stock berkurang', chain: 'task/queryTask' },
            'shop/refresh':          { ok: 'grid baru · refresh timer · currency berkurang' },
            'shop/readNew':          { ok: 'tandai goods "NEW" dibaca' },
            'market/getInfo':        { ok: 'render grid market' },
            'market/buy':            { ok: 'popup reward · slot kosong', chain: 'task/queryTask' },
            'market/refresh':        { ok: 'grid baru · refresh timer' },
            'vipMarket/getInfo':     { ok: 'render vip market (gated level VIP)' },
            'vipMarket/buy':         { ok: 'popup reward · slot kosong' },
            'vipMarket/refresh':     { ok: 'grid baru · refresh timer' },
            // ── gift / monthCard / recharge / checkin ──
            'gift/getRewardInfo':    { ok: 'render daftar klaim (level/vip/online/fund/first-recharge) + red dot' },
            'gift/getLevelReward':   { ok: 'popup reward · refresh list gift' },
            'gift/getVipReward':     { ok: 'popup reward VIP · refresh list' },
            'gift/getOnlineGift':    { ok: 'popup reward online · timer berikutnya' },
            'gift/getFrisetRechargeReward': { ok: 'popup first recharge reward' },
            'gift/buyGold':          { ok: 'popup gold didapat · currency refresh' },
            'gift/buyFund':          { ok: 'fund aktif · refresh UI fund' },
            'monthCard/buyCard':     { ok: 'month card aktif · reward harian mulai' },
            'monthCard/getReward':   { ok: 'popup reward harian card' },
            'recharge/recharge':     { ok: 'popup top-up sukses · VIP exp naik', chain: 'gift/getRewardInfo (first recharge state)' },
            'checkin/checkin':       { ok: 'popup reward checkin · refresh kalender bulan ini' },
            // ── guild ──
            'guild/createGuild':     { ok: 'buka UI guild baru · broadcast guild dibuat' },
            'guild/getGuildList':    { ok: 'render daftar guild (search/join)' },
            'guild/getGuildDetail':  { ok: 'render detail guild' },
            'guild/getMembers':      { ok: 'render list member + kontribusi' },
            'guild/getGuildLog':     { ok: 'render log guild' },
            'guild/requestGuild':    { ok: 'aplikasi terkirim → tunggu approve captain' },
            'guild/guildSign':       { ok: 'popup reward sign · poin guild naik' },
            'guild/upgradeTech':     { ok: 'tech level naik · attr member naik' },
            'guild/getTreasureInfo': { ok: 'buka UI treasure/boss guild' },
            // ── friend ──
            'friend/getFriends':     { ok: 'render list teman + heart' },
            'friend/applyFriend':    { ok: 'aplikasi terkirim · popup' },
            'friend/getApplyList':   { ok: 'render daftar aplikasi teman' },
            'friend/recommendFriend':{ ok: 'render rekomendasi teman' },
            'friend/autoGiveGetHeart': { ok: 'heart dibagikan otomatis · refresh list' },
            'friend/friendBattle':   { ok: 'play battleRecordData friend battle' },
            'friend/friendServerAction': { ok: 'aksi sosial dieksekusi (cross-user)' },
            'friend/getFriendArenaDefenceTeam': { ok: 'render formasi defense teman' },
            // ── battle/trial/tower/timeMachine/snake/mine/cellGame ──
            'battle/getRandom':      { ok: 'susun tim lawan random · mulai battle' },
            'trial/getState':        { ok: 'render state trial (temple/gravity)' },
            'trial/startBattle':     { ok: 'play battleRecordData trial' },
            'trial/checkBattleResult': { ok: 'window hasil trial' },
            'trial/vipBuy':          { ok: 'kesempatan +1 · refresh count' },
            'tower/getFeetInfo':     { ok: 'render menara karin (feet info)' },
            'timeMachine/start':     { ok: 'play battleRecordData time machine' },
            'timeMachine/startBoss': { ok: 'play battleRecordData boss time machine' },
            'timeMachine/checkBattleResult': { ok: 'window hasil time machine' },
            'snake/getSnakeInfo':    { ok: 'render papan ular (SnakeScene)' },
            'snake/getEnemyInfo':    { ok: 'render info musuh di papan' },
            'snake/startBattle':     { ok: 'play battleRecordData snake' },
            'snake/sweep':           { ok: 'popup reward sweep snake' },
            'snake/awardBox':        { ok: 'popup reward box papan' },
            'snake/recoverHero':     { ok: 'hero pulih · refresh papan' },
            'mine/getInfo':          { ok: 'render papan tambang' },
            'mine/move':             { ok: 'posisi bergerak · render ulang papan' },
            'mine/buyStep':          { ok: 'langkah +N · refresh count' },
            'mine/getChest':         { ok: 'popup reward chest' },
            'mine/startBattle':      { ok: 'play battleRecordData mine' },
            'mine/resetCurLevel':    { ok: 'level reset · papan baru' },
            'cellGame/getInfo':      { ok: 'render papan cell game (formasi musuh)' },
            'cellGame/setTeam':      { ok: 'formasi cell tersimpan' },
            'cellGame/startBattle':  { ok: 'play battleRecordData cell game' },
            'cellGame/checkBattleResult': { ok: 'window hasil + chest cell' },
            // ── superSkill / heroImage / guide / activity / buryPoint ──
            'superSkill/levelUpSuperSkill': { ok: 'super skill naik level · refresh UI' },
            'superSkill/activeSuperSkill':  { ok: 'super skill aktif · refresh UI' },
            'heroImage/getAll':      { ok: 'render galeri hero image' },
            'heroImage/getComments': { ok: 'render komentar galeri' },
            'heroImage/readHeroVersion': { ok: 'bandingkan versi galeri (cache invalidate)' },
            'guide/saveGuide':       { ok: 'id guide tersimpan · tutorial lanjut step' },
            'activity/getActivityBrief': { ok: 'render daftar aktivitas + red dot' },
            'activity/getActivityDetail': { ok: 'buka window aktivitas (actId) — runScene ActNewHeroChallenge dst' },
            'activity/heroHelpBuy':  { ok: 'tiket hero-help dibeli · refresh UI' },
            'activity/normalLuck':   { ok: 'animasi lucky wheel · popup reward' },
            'buryPoint/guideBattle': { ok: 'progres tutorial battle tercatat (tanpa UI)' }
        };

        function clientNextFor(route, ret) {
            var m = CLIENT_NEXT[route];
            if (ret === 0) return (m && m.ok) || 'callback → client lanjut flow UI';
            var base = (m && m.fail) || 'ShowErrorTips(' + ret + ')';
            var ed = errorInfo(ret);
            if (ed && ed.isKick === 1) base += ' · ⚠ isKick=1 → kick ke LoginScene';
            // ret khusus processHandler (acuan main.min.js):
            if (ret === 22) base += ' · 📊 client → reportBattleLog (kirim battle record)';
            if (ret === 38) base += ' · 🔄 client → auto reload halaman';
            return base;
        }

        function clientChainFor(route, ret) {
            if (ret !== 0) return null;   // gagal → tidak ada rantai, client hanya error tips
            var m = CLIENT_NEXT[route];
            return (m && m.chain) || null;
        }

        // ── format helpers ──

        function maskToken(v) {
            var s = String(v);
            if (s.length <= 8) return '***';
            return s.substring(0, 4) + '***(' + s.length + ' chars)';
        }

        function formatBytes(n) {
            if (n === undefined || n === null) return '?';
            if (n < 1024) return n + 'B';
            return (n / 1024).toFixed(1) + 'KB';
        }

        function formatRewardList(items) {
            if (!items) return '(kosong)';
            var arr = Array.isArray(items) ? items : [items];
            var parts = [];
            for (var i = 0; i < Math.min(arr.length, 6); i++) {
                var it = arr[i] || {};
                var id = it.itemId || it.id || it.type || '?';
                var n = (it.num !== undefined) ? it.num : (it.count !== undefined ? it.count : '');
                parts.push(thingName(id) + (n !== '' ? ' ×' + n : ''));
            }
            var s = parts.join(', ');
            if (arr.length > 6) s += ' … +' + (arr.length - 6) + ' lainnya';
            return s;
        }

        // ═══════════════════════════════════════════════════
        //  CLIENT-JOURNEY GROUP — ▶ REQUEST … 📤 RESPONSE
        //  dispatch() membuka grup, executeHandler() menutup via envelope().
        // ═══════════════════════════════════════════════════

        var _openReq = null;
        var _reqSeq = 0;
        var _watchdogTimer = null;
        var _dbWrites = {};   // buffer key yang handler simpan ke db selama request ini

        function _clearWatchdog() {
            if (_watchdogTimer) { clearTimeout(_watchdogTimer); _watchdogTimer = null; }
        }

        function requestGroup(route, request) {
            var em = _ctxEmoji(route);
            var seq = ++_reqSeq;
            console.groupCollapsed(
                '%c▶ REQUEST #' + seq + ' %c' + em + ' ' + route,
                'background:#FF9800;color:#fff;padding:2px 10px;border-radius:10px;font-weight:bold;font-size:11px;',
                PILL_CAT
            );
            var entries = [];
            if (request && typeof request === 'object') {
                for (var k in request) {
                    if (!request.hasOwnProperty(k)) continue;
                    if (k === 'type' || k === 'action') continue;
                    var v = request[k];
                    if (typeof v === 'function' || v === undefined) continue;
                    var disp = (k === 'loginToken' && v) ? maskToken(v) : _safeValue(v, 80);
                    // 🔎 enrich: field ID-item/box/goods → nama tampilan dari thingsID.json
                    if (typeof v === 'number' && /item|thing|goods|box|chest/i.test(k)) {
                        disp += ' (' + thingName(v) + ')';
                    }
                    entries.push([k, disp]);
                }
            }
            var show = entries.slice(0, 12);
            for (var i = 0; i < show.length; i++) {
                var conn = (i < show.length - 1 || entries.length > 12) ? '├' : '└';
                detailLine(conn, '🏷', show[i][0], show[i][1]);
            }
            if (entries.length > 12) detailLine('└', '🏷', '…', '+' + (entries.length - 12) + ' field lainnya');
            if (entries.length === 0) detailLine('└', '🏷', 'fields', '(kosong)');
            _openReq = route;
            _dbWrites = {};   // reset buffer persistsi utk request ini
            // ⏰ WATCHDOG — client main.min.js punya LoadingPanel guard 10s:
            // handler yang tidak memanggil callback membuat loading client
            // menggantung lalu ditutup paksa (respons dibuang). Mirror di sini
            // supaya grup ▶ REQUEST tidak menggantung tanpa jejak di log.
            _clearWatchdog();
            _watchdogTimer = setTimeout(function () {
                if (_openReq === route) {
                    console.log('%c  ⏰ WATCHDOG: "' + route + '" tidak membalas dalam 10 dtk — client LoadingPanel guard akan menutup loading & respons dibuang (perubahan state handler hilang)',
                        'color:#C62828;font-weight:bold;');
                }
            }, 10000);
        }

        function envelopeSummary(route, env, ms, issues) {
            env = env || {};
            _clearWatchdog();
            // ⚠ handler sync — eksekusi > 150ms patut dicurigai (blocking main thread)
            if (ms > 150) {
                issues = (issues || []).concat([{ type: 'WARN', msg: 'eksekusi lambat: ' + ms + 'ms — handler sync, target < 150ms' }]);
            }
            var isSuccess = (env.ret === 0);

            // hitung field count + size (decompress bila perlu) + simpan parsed utk breakdown
            var fieldCount = 0, sizeBytes = 0, isLZ = !!env.compress, parsedTop = null;
            try {
                sizeBytes = env.data ? String(env.data).length : 0;
                var rawData = env.data;
                if (isLZ && typeof LZString !== 'undefined' && typeof LZString.decompressFromUTF16 === 'function') {
                    rawData = LZString.decompressFromUTF16(rawData);
                }
                var parsed = null;
                if (typeof rawData === 'string' && rawData.length > 0) parsed = JSON.parse(rawData);
                else if (rawData && typeof rawData === 'object') parsed = rawData;
                parsedTop = parsed;
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    for (var k in parsed) { if (parsed.hasOwnProperty(k)) fieldCount++; }
                }
            } catch (e) {}

            var head;
            if (isSuccess) {
                head = '📤 ✅ ' + ms + 'ms · ret=0 · ' + fieldCount + ' fields · ' + formatBytes(sizeBytes) + (isLZ ? ' · LZ ✓' : '');
            } else {
                var ed = errorInfo(env.ret);
                var eType = (ed && ed.errorType) ? ed.errorType : ('ret=' + env.ret);
                var hint = (ed && ed.hintType) ? ' · ' + ed.hintType : '';
                var kick = (ed && ed.isKick === 1) ? ' · ⚠ KICK' : '';
                // hindari "ret=22 · ret=22" bila errorDefine tidak punya entri utk ret ini
                var eSeg = (eType === ('ret=' + env.ret)) ? ('ret=' + env.ret) : ('ret=' + env.ret + ' · ' + eType);
                head = '📤 ❌ ' + ms + 'ms · ' + eSeg + hint + kick;
                // ret khusus processHandler (acuan main.min.js):
                if (env.ret === 22) head += ' · 📊 reportBattleLog';
                if (env.ret === 38) head += ' · 🔄 auto-reload';
            }
            console.log('%c  ' + head, isSuccess ? 'color:#2E7D32;font-weight:bold;' : 'color:#C62828;font-weight:bold;');

            // ── 🔎 BREAKDOWN RESPONS — field top-level yang akan dibaca client
            //    (acuan: processHandler callback + UserDataParser.saveUserData) ──
            if (isSuccess && parsedTop && typeof parsedTop === 'object' && !Array.isArray(parsedTop)) {
                // 💰 highlight currency (paling sering dicek saat debugging)
                if (parsedTop.currency && typeof parsedTop.currency === 'object' && !Array.isArray(parsedTop.currency)) {
                    var curParts = [];
                    for (var ck in parsedTop.currency) {
                        if (parsedTop.currency.hasOwnProperty(ck) && curParts.length < 8) {
                            curParts.push(ck + '=' + _safeValue(parsedTop.currency[ck], 20));
                        }
                    }
                    if (curParts.length > 0) console.log('%c  💰 currency: ' + curParts.join(' · '), 'color:#FFB300;font-weight:bold;');
                }
                // 🦸 highlight heros
                if (Array.isArray(parsedTop.heros)) {
                    console.log('%c  🦸 heros: ' + parsedTop.heros.length + ' unit', 'color:#EF5350;font-weight:bold;');
                }
                // 🎁 auto-detect field reward top-level (pola {itemId,num} → thingsID.json)
                //    berlaku utk SEMUA handler tanpa perlu log.reward manual
                var RW_KEYS = ['reward', 'rewards', 'rewardList', 'dropList', 'firstReward', 'extraReward', 'items', 'goods'];
                for (var ri = 0; ri < RW_KEYS.length; ri++) {
                    var rv = parsedTop[RW_KEYS[ri]];
                    if (Array.isArray(rv) && rv.length > 0 && rv[0] && typeof rv[0] === 'object') {
                        console.log('%c  🎁 ' + RW_KEYS[ri] + '[' + rv.length + ']: ' + formatRewardList(rv), 'color:#2E7D32;font-weight:bold;');
                        break;
                    }
                }
                // 📦 breakdown 10 field teratas (nama field + tipe/ukuran)
                var keys = [];
                for (var fk in parsedTop) { if (parsedTop.hasOwnProperty(fk)) keys.push(fk); }
                var showF = keys.slice(0, 10);
                for (var fi2 = 0; fi2 < showF.length; fi2++) {
                    var fv = parsedTop[showF[fi2]], desc;
                    if (fv === null) desc = 'null';
                    else if (Array.isArray(fv)) desc = 'Array(' + fv.length + ')';
                    else if (typeof fv === 'object') {
                        var n2 = 0; for (var z in fv) { if (fv.hasOwnProperty(z)) n2++; }
                        desc = '{' + n2 + ' keys}';
                    } else desc = _safeValue(fv, 40);
                    var mean = FIELD_MEANING[showF[fi2]];
                    var conn2 = (fi2 < showF.length - 1 || keys.length > 10) ? '├' : '└';
                    detailLine(conn2, '📦', showF[fi2], desc + (mean ? '  — ' + mean : ''));
                }
                if (keys.length > 10) detailLine('└', '📦', '…', '+' + (keys.length - 10) + ' field lagi');
                // 💡 saran kompresi
                if (!isLZ && sizeBytes > 40000) {
                    console.log('%c  💡 respons >40KB tanpa LZ — buildEnvelope otomatis LZ hanya utk ret=0; cek path respons', 'color:#7E57C2;font-style:italic;');
                }
            }

            if (issues && issues.length > 0) {
                for (var i = 0; i < issues.length; i++) {
                    var iss = issues[i];
                    console.log('%c  ' + (iss.type === 'ERROR' ? '❌ ' : '⚠ ') + iss.msg,
                        'color:' + (iss.type === 'ERROR' ? '#C62828' : '#F57F17') + ';');
                }
            }

            // data="70001" → processHandler main.min.js memicu reportBattleLog
            // (errors tidak dikompres buildEnvelope, jadi raw compare valid)
            if (!isSuccess && (env.data === '70001' || parsedTop === '70001')) {
                console.log('%c  📊 data="70001" → client reportBattleLog (kirim battle record ke server)', 'color:#5C6BC0;font-style:italic;');
            }

            // 💾 apa yang handler simpan ke db selama request ini
            var dwKeys = [];
            for (var dk in _dbWrites) { if (_dbWrites.hasOwnProperty(dk)) dwKeys.push(dk); }
            if (dwKeys.length > 0) {
                var dwParts = [];
                for (var di = 0; di < dwKeys.length && di < 6; di++) dwParts.push(dwKeys[di] + ' (' + formatBytes(_dbWrites[dwKeys[di]]) + ')');
                console.log('%c  💾 persistsi db: ' + dwParts.join(' · ') + (dwKeys.length > 6 ? ' … +' + (dwKeys.length - 6) + ' key' : ''), 'color:#00695C;font-weight:bold;');
                _dbWrites = {};
            }

            var next = clientNextFor(route, env.ret);
            if (next) console.log('%c  ⏭️ client-next: ' + next, 'color:#5C6BC0;font-style:italic;');
            var chain = clientChainFor(route, env.ret);
            if (chain) console.log('%c  🔗 rantai: ' + chain, 'color:#00897B;font-style:italic;');

            console.groupEnd();
            _openReq = null;
        }

        // log.fail — dipakai handler saat menolak request (di dalam grup)
        function fail(ret, detail, routeName) {
            var ed = errorInfo(ret);
            var eType = (ed && ed.errorType) ? ed.errorType : '?';
            var hint = (ed && ed.hintType) ? ed.hintType : '?';
            var kick = (ed && ed.isKick === 1) ? ' · ⚠ KICK' : '';
            console.log('%c  ❌ FAIL ret=' + ret + ' · ' + eType + ' (' + hint + ')' + kick + (detail ? ' — ' + detail : ''),
                'color:#C62828;font-weight:bold;');
            var nxt = clientNextFor(routeName || _openReq || '', ret);
            if (nxt) console.log('%c  ⏭️ client-next: ' + nxt, 'color:#5C6BC0;font-style:italic;');
        }

        // log.step — tahapan di dalam grup
        function step(emoji, msg) {
            console.log('%c  ' + (emoji || '📌') + ' ' + msg, 'color:#00695C;');
        }

        // log.route — fallback header handler (jika grup belum dibuka dispatch)
        function routeHeader(routeName, fields) {
            if (_openReq === routeName) return;  // grup sudah terbuka → field sudah dicetak
            var em = _ctxEmoji(routeName);
            // ATURAN (user): emoji ▶ KHUSUS dropdown yang bisa diklik (groupCollapsed).
            // Baris fallback ini BUKAN dropdown → 📥 = request masuk (sama dgn 📥 Request Data login).
            console.log('%c📥 %c' + em + ' ' + routeName,
                'color:#78909C;font-weight:bold;font-size:11px;',
                PILL_CAT);
            if (fields && typeof fields === 'object') {
                var entries = [];
                for (var k in fields) {
                    if (!fields.hasOwnProperty(k)) continue;
                    var v = fields[k];
                    if (typeof v === 'function' || v === undefined) continue;
                    entries.push([k, (k === 'loginToken' && v) ? maskToken(v) : _safeValue(v, 80)]);
                }
                for (var i = 0; i < entries.length; i++) {
                    detailLine(i < entries.length - 1 ? '├' : '└', '🏷', entries[i][0], entries[i][1]);
                }
            }
        }

        // log.reward — daftar reward dgn nama thingsID.json
        function reward(items) {
            console.log('%c  🎁 Reward: ' + formatRewardList(items), 'color:#2E7D32;font-weight:bold;');
        }

        // ═══════════════════════════════════════════════════
        //  emit — flat, consistent with login-server
        // ═══════════════════════════════════════════════════

        function emit(level, context, message) {
            if (!shouldLog(level)) return;
            counts[level]++;
            var em = _ctxEmoji(context);
            var color = COLORS[level] || '#78909C';
            var display = _displayName(context);
            // PATEN (user): judul persis tag() login-server — pill + pill, TANPA timestamp,
            // tanpa kurung, tanpa padding kolom, tanpa segitiga. CSS pill = COPY mentah
            // dari login-server, jadi ukuran baris identik. Pesan polos setelah pill.
            //   login :  ⚪ LOGIN-SERVER   💠 saveHistory
            //   main  :  🖥️ MAIN-SERVER   👤 enterGame   pesan
            console.log(
                '%c🖥️ MAIN-SERVER  %c' + em + ' ' + display + '  %c' + message,
                PILL_TAG,
                PILL_CAT,
                'color:' + color + ';font-size:11px;'
            );
        }

        // ═══════════════════════════════════════════════════
        //  Detail lines
        // ═══════════════════════════════════════════════════

        function safe(v) {
            if (v === null) return 'null';
            if (v === undefined) return 'undefined';
            if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return '[Object]'; } }
            return String(v);
        }

        function _safeValue(v, maxLen) {
            if (v === null) return 'null';
            if (v === undefined) return 'undefined';
            if (typeof v === 'function') return '[Function]';
            if (typeof v === 'object') {
                if (Array.isArray(v)) {
                    if (v.length > 0 && v[0] && typeof v[0] === 'object') {
                        var ak = Object.keys(v[0]).slice(0, 4).join(',');
                        return '[Array(' + v.length + ') {' + ak + '}]';
                    }
                    return '[Array(' + v.length + ')]';
                }
                try { var s = JSON.stringify(v); if (s && maxLen && s.length > maxLen) return s.substring(0, maxLen) + '...'; return s || '{}'; } catch (e) { return '[Object]'; }
            }
            if (typeof v === 'string' && maxLen && v.length > maxLen) return v.substring(0, maxLen) + '...';
            return String(v);
        }

        function detailLine(connector, emoji, key, value) {
            if (!shouldLog('INFO')) return;
            console.log('%c  ' + connector + ' ' + emoji + ' ' + key + ' : ' + value, DETAIL_CLR);
        }

        // ═══════════════════════════════════════════════════
        //  Notify system
        // ═══════════════════════════════════════════════════

        function buildNotifyEnvelope(payload) {
            var dataStr;
            try { dataStr = JSON.stringify(payload !== undefined && payload !== null ? payload : {}); } catch (e) { dataStr = '{}'; }
            var compress = false;
            if (typeof LZString !== 'undefined' && typeof LZString.compressToUTF16 === 'function') {
                try { dataStr = LZString.compressToUTF16(dataStr); compress = true; } catch (e) {}
            }
            return { ret: 'SUCCESS', data: dataStr, compress: compress };
        }

        function pushNotify(action, payload) {
            var socket = window.MainServer && window.MainServer.currentSocket;
            if (!socket || !socket.connected) return false;
            var data = payload ? JSON.parse(JSON.stringify(payload)) : {};
            if (!data.action) data.action = action;
            var envelope = buildNotifyEnvelope(data);
            socket._fire('Notify', envelope);
            return true;
        }

        // ═══════════════════════════════════════════════════
        //  Auto-inspect
        // ═══════════════════════════════════════════════════

        function scanStateZero(data, path) {
            var results = [];
            if (!data || typeof data !== 'object' || Array.isArray(data)) return results;
            for (var k in data) {
                if (!data.hasOwnProperty(k)) continue;
                var v = data[k];
                var p = path ? path + '.' + k : k;

                // ═══════════════════════════════════════════════════
                //  SKIP: Paths where _state=0 is NORMAL (not incomplete)
                //  These are FALSE POSITIVE suppressions — _state=0 means
                //  "not started yet" which is valid initial state.
                // ═══════════════════════════════════════════════════
                
                // Achievements default to _state=0 until player starts them
                if (p.indexOf('_achievements') !== -1) continue;
                // Daily tasks reset to _state=0 each day
                if (p.indexOf('_daily') !== -1) continue;
                // Weekly tasks default to _state=0
                if (p.indexOf('_weekly') !== -1) continue;
                // Main task chain — _state=0 means not started (valid)
                if (p.indexOf('curMainTask') !== -1) continue;
                // Achievement category keys at any level
                if (k === '_achievements' || k === '_daily' || k === '_weekly') continue;

                if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                    if ('_state' in v && v._state === 0) results.push(p);
                    var sub = scanStateZero(v, p);
                    for (var i = 0; i < sub.length; i++) results.push(sub[i]);
                }
            }
            return results;
        }

        function autoInspect(route, envelope, parsedData) {
            var issues = [];
            if (envelope.ret === 0) {
                if (!envelope.data || envelope.data === 'null' || envelope.data === 'undefined' || envelope.data === '{}') {
                    issues.push({ type: 'WARN', msg: 'ret=0 but response data is empty (' + (envelope.data || '(empty)') + ')' });
                }
            }
            if (envelope.ret === 0 && parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData)) {
                var undefFields = [];
                for (var k in parsedData) { if (parsedData.hasOwnProperty(k) && parsedData[k] === undefined) undefFields.push(k); }
                if (undefFields.length > 0) issues.push({ type: 'WARN', msg: undefFields.length + ' undefined field(s): ' + undefFields.join(', ') });
            }
            if (parsedData && typeof parsedData === 'object') {
                var stateZero = scanStateZero(parsedData, '');
                // ── Flow-context: tag with [Post-Handler Audit] for traceability ──
                if (stateZero.length > 0) {
                    // Summary line (not flooding each field)
                    issues.push({ type: 'WARN', msg: '[Post-Handler Audit] ⚠ ' + stateZero.length + ' field(s) with _state=0 (potentially incomplete):' });
                    // Show up to 5 examples, then truncate
                    var showCount = Math.min(stateZero.length, 5);
                    for (var i = 0; i < showCount; i++) {
                        issues.push({ type: 'WARN', msg: '  └─ ' + stateZero[i] + '._state = 0' });
                    }
                    if (stateZero.length > 5) {
                        issues.push({ type: 'WARN', msg: '  └─ ... and ' + (stateZero.length - 5) + ' more (suppressed)' });
                    }
                }
            }
            return issues;
        }

        // ═══════════════════════════════════════════════════
        //  handlerResult — 1 line success, 2+ lines failure
        // ═══════════════════════════════════════════════════

        function handlerResult(opts) {
            var route = opts.route || '???';
            var envelope = opts.envelope || {};
            var ms = opts.ms || 0;
            var issues = opts.inspect || [];
            var isSuccess = (envelope.ret === 0);

            var fieldCount = 0;
            try {
                var rawData = envelope.data;
                if (envelope.compress && typeof LZString !== 'undefined' && typeof LZString.decompressFromUTF16 === 'function') {
                    rawData = LZString.decompressFromUTF16(rawData);
                }
                var parsed = null;
                if (typeof rawData === 'string' && rawData.length > 0) parsed = JSON.parse(rawData);
                else if (rawData && typeof rawData === 'object') parsed = rawData;
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    for (var k in parsed) { if (parsed.hasOwnProperty(k)) fieldCount++; }
                }
            } catch (e) {}

            if (isSuccess && issues.length === 0) {
                emit('INFO', route, '✅ ' + ms + 'ms  ' + fieldCount + ' fields');
            } else {
                emit(isSuccess ? 'WARN' : 'ERROR', route, '❌ ' + ms + 'ms  ret=' + envelope.ret + (fieldCount > 0 ? '  ' + fieldCount + ' fields' : ''));
                for (var i = 0; i < issues.length; i++) {
                    var iss = issues[i];
                    emit(iss.type === 'ERROR' ? 'ERROR' : 'WARN', route, (iss.type === 'ERROR' ? '❌' : '⚠') + ' ' + iss.msg);
                }
            }
        }

        // ═══════════════════════════════════════════════════
        //  FIELD MEANING — arti field top-level respons
        //  (acuan: UserDataParser.saveUserData + processHandler main.min.js)
        //  Dicetak di breakdown 📦 → isi log per-request lebih lengkap.
        // ═══════════════════════════════════════════════════

        var FIELD_MEANING = {
            serverTime: 'waktu server (UTC ms) → updateServerTime client',
            server0Time: 'offset TZ server (-25200000 = UTC+7)',
            serverOpenDate: 'basis hari ke-N — gating VIP/temple/arena',
            serverVersion: 'versi server (cache/compat client)',
            myTeamServerSocketUrl: 'alamat dungeon-server utk co-op (io.connect)',
            scheduleInfo: 'counter daily reset jam 06:00 (checkin/task/mail)',
            currency: 'dompet: gold/diamond/energy/… (UI kanan-atas)',
            heros: 'roster hero — sumber getAttrs/power',
            hangup: 'state idle AFK (chapter, reward, timer)',
            summon: 'state gacha (tiket, pity, timer free)',
            backpack: 'tas item (_items per kategori)',
            equip: 'equip terpasang per hero (ring/armor)',
            sign: 'state checkin bulanan',
            checkin: 'state checkin bulanan',
            monthCard: 'status month card (sisa hari)',
            vip: 'level & exp VIP',
            guide: 'progress tutorial (id step)',
            task: 'progress task harian/main',
            tasks: 'daftar task + progress',
            _mails: 'daftar mail (unread → red dot)',
            mailList: 'daftar mail (unread → red dot)',
            friends: 'daftar teman + heart',
            arena: 'state arena (rank, tiket, lawan)',
            reward: 'reward diterima (popup)',
            rewards: 'reward diterima (popup)',
            items: 'daftar item (nama via thingsID.json)',
            goods: 'daftar goods (shop/market)',
            count: 'jumlah tersisa / kesempatan',
            state: 'status tahapan (0=belum, 1=proses, 2=klaim)',
            success: 'flag sukses aksi',
            list: 'daftar data utama respons',
            info: 'data detail utama respons'
        };

        // ═══════════════════════════════════════════════════
        //  Return Logger object
        // ═══════════════════════════════════════════════════

        return {
            info: function (ctx, msg) { emit('INFO', ctx, msg); },
            warn: function (ctx, msg) { emit('WARN', ctx, msg); },
            error: function (ctx, msg) { emit('ERROR', ctx, msg); },
            debug: function (ctx, msg) { emit('DEBUG', ctx, msg); },
            detail: function (key, value) { detailLine('└', '📋', key, safe(value)); },
            details: function (context, pairs) {
                if (Array.isArray(context) && !pairs) pairs = context;
                if (!shouldLog('INFO') || !Array.isArray(pairs)) return;
                for (var i = 0; i < pairs.length; i++) {
                    var conn = (i < pairs.length - 1) ? '├' : '└';
                    detailLine(conn, '📋', pairs[i][0], safe(pairs[i][1]));
                }
            },
            alwaysDetails: function (pairs) {
                if (!shouldLog('INFO') || !Array.isArray(pairs)) return;
                for (var i = 0; i < pairs.length; i++) {
                    var conn = (i < pairs.length - 1) ? '├' : '└';
                    console.log('%c  ' + conn + ' ' + pairs[i][0] + ' : ' + safe(pairs[i][1]), DETAIL_CLR);
                }
            },
            importantDetails: function (ctx, pairs) {
                if (!shouldLog('INFO') || !Array.isArray(pairs)) return;
                emit('INFO', ctx, '');
                for (var i = 0; i < pairs.length; i++) {
                    var conn = (i < pairs.length - 1) ? '├' : '└';
                    console.log('%c  ' + conn + ' ' + pairs[i][0] + ' : ' + safe(pairs[i][1]), DETAIL_CLR);
                }
            },
            arrow: function (text) { if (!shouldLog('INFO')) return; console.log('%c  ➡️ %c' + text, 'color:#4DB6AC;', 'color:#B0BEC5;'); },
            notify: function (action, payload) {
                var pushed = pushNotify(action, payload);
                if (pushed) {
                    counts.NOTIFY++;
                    // 🔔 detail payload push (field count + size + socket target)
                    var nF = 0, szN = 0;
                    try {
                        szN = JSON.stringify(payload || {}).length;
                        if (payload && typeof payload === 'object') for (var nk in payload) { if (payload.hasOwnProperty(nk)) nF++; }
                    } catch (e) {}
                    var sockId = (window.MainServer && window.MainServer.currentSocket) ? window.MainServer.currentSocket.id : '?';
                    emit('INFO', 'NTFY', '"' + action + '" → socket ' + sockId + ' · ' + nF + ' field · ' + formatBytes(szN));
                    // preview isi payload (120 char pertama)
                    try {
                        var pv = JSON.stringify(payload || {});
                        if (pv && pv.length > 120) pv = pv.substring(0, 120) + '…';
                        detailLine('└', '📤', 'payload', pv || '{}');
                    } catch (pe) {}
                } else { emit('WARN', 'NTFY', 'Cannot push "' + action + '" — no socket'); }
            },
            buildNotifyEnvelope: function (payload) { return buildNotifyEnvelope(payload); },
            // ── Logger v2 API (client-journey) ──
            route: function (routeName, fields) { routeHeader(routeName, fields); },
            step: function (emoji, msg) { step(emoji, msg); },
            reward: function (items) { reward(items); },
            fail: function (ret, detail, routeName) { fail(ret, detail, routeName); },
            requestGroup: function (routeName, request) { requestGroup(routeName, request); },
            envelope: function (routeName, env, ms, issues) { envelopeSummary(routeName, env, ms, issues); },
            getCategory: function (name) {
                var c = name || '';
                return (CTX_EMOJI[c] || CTX_EMOJI[c.split('/')[0].toLowerCase()])
                    ? { emoji: _ctxEmoji(c), color: _ctxColor(c) } : null;
            },
            categoryCount: function () {
                var n = 0;
                for (var k in CTX_EMOJI) { if (CTX_EMOJI.hasOwnProperty(k)) n++; }
                return n;
            },
            clientNextFor: function (routeName, ret) { return clientNextFor(routeName, ret); },
            clientChainFor: function (routeName, ret) { return clientChainFor(routeName, ret); },
            errorInfo: function (ret) { return errorInfo(ret); },
            thingName: function (itemId) { return thingName(itemId); },
            autoInspect: autoInspect,
            scanStateZero: scanStateZero,
            handlerResult: handlerResult,
            dbWrite: function (key, bytes) { _dbWrites[key] = bytes; },
            clientNextCount: function () { var n = 0; for (var k in CLIENT_NEXT) { if (CLIENT_NEXT.hasOwnProperty(k)) n++; } return n; },
            setLevel: function (level) {
                if (PRIORITY[level] !== undefined) {
                    currentLevel = level; minPrio = PRIORITY[level];
                    try { localStorage.setItem(STORE_KEY, level); } catch (e) {}
                    console.log('%c' + SERVER_TAG + ' Log level → ' + level, PILL_TAG);
                }
            },
            getLevel: function () { return currentLevel; },
            getCounts: function () { return { DEBUG: counts.DEBUG, INFO: counts.INFO, WARN: counts.WARN, ERROR: counts.ERROR, NOTIFY: counts.NOTIFY }; },
            resetCounts: function () { counts.DEBUG = 0; counts.INFO = 0; counts.WARN = 0; counts.ERROR = 0; counts.NOTIFY = 0; }
        };
    })();


    // ═══════════════════════════════════════════════════════
    //  EXPOSE LOGGER
    // ═══════════════════════════════════════════════════════

    window.MainServerLogger = Logger;
    var log = Logger;
    window.Log_Clean = true;

    // ═══════════════════════════════════════════════════════
    //  GLOBAL ERROR HOOK — PR1 hardening
    //  Menangkap SyntaxError/runtime error dari script server mana pun
    //  (kasus nyata: saveHistory.js) supaya tidak tampil telanjang.
    // ═══════════════════════════════════════════════════════

    window.addEventListener('error', function (ev) {
        try {
            if (ev && ev.target && ev.target.src) {
                console.log('%c🧨 [MAIN-SERVER] Resource gagal dimuat: ' + ev.target.src, 'color:#C62828;font-weight:bold;');
                return;
            }
            var msg = (ev && ev.message) ? ev.message : '(unknown)';
            var file = (ev && ev.filename) ? String(ev.filename).split('/').pop() : '?';
            var pos = (ev && ev.lineno) ? (' @ ' + file + ':' + ev.lineno + (ev.colno ? ':' + ev.colno : '')) : '';
            console.log('%c🧨 [MAIN-SERVER] UNCAUGHT: ' + msg + pos, 'color:#C62828;font-weight:bold;');
            if (ev && ev.error && ev.error.stack) {
                console.log('%c   ' + String(ev.error.stack).split('\n')[0], 'color:#E57373;');
            }
            console.log('%c   └─ script server kemungkinan gagal parse/load — fitur terkait tidak akan jalan sampai file diperbaiki', 'color:#90A4AE;font-style:italic;');
        } catch (e) {}
    }, true);

    window.addEventListener('unhandledrejection', function (ev) {
        try {
            var r = ev && ev.reason;
            var msg = r && r.message ? r.message : String(r || '');
            // ATURAN (user): spam error resource gambar (Egret) → senyapkan total.
            // '文件加载失败' = file load gagal (1001) · '尝试释放不存在的资源' = release resource hantu.
            if (/文件加载失败|尝试释放不存在的资源/.test(msg)) {
                if (ev && ev.preventDefault) ev.preventDefault();
                return;
            }
            console.log('%c💥 [MAIN-SERVER] Unhandled promise rejection: ' + msg, 'color:#C62828;font-weight:bold;');
            // 🔎 reason sering falsy / tanpa message (Promise.reject() tanpa argumen —
            // umumnya dari client game/SDK, bukan script server). Cetak tipe + frame
            // stack pertama supaya sumbernya bisa dilacak pada kejadian berikutnya.
            if (!msg) {
                console.log('%c   └─ reason: ' + (r === null ? 'null' : typeof r) + (r && r.stack ? ' · ' + String(r.stack).split('\n')[0] : ''), 'color:#E57373;');
            } else if (r && r.stack) {
                console.log('%c   └─ ' + String(r.stack).split('\n')[0], 'color:#E57373;');
            }
        } catch (e) {}
    });

    //  CATATAN: loader eksternal "logger.js" dihapus — file itu tidak pernah
    //  ada (Logger v2 sudah inline lengkap di atas) → setiap reload menimbulkan
    //  404 "Resource gagal dimuat: .../logger.js" yang menyesatkan.

    // ═══════════════════════════════════════════════════════
    //  SERVER TIME CONSTANTS
    // ═══════════════════════════════════════════════════════
    //  PR3 FIX: blok ini dipindah KE ATAS (sebelum CONFIG) — sebelumnya
    //  config.serverOpenDate membaca var sebelum diinisialisasi (hoisting)
    //  → undefined selamanya → "hari ke-NaN" di boot banner.
    //
    //  serverTime  = Date.now() (UTC ms)
    //  server0Time = 60 * (-420) * 1000 = -25200000 (UTC+7)
    //  RESET_HOUR  = 6 (jam 00:00-05:59 masih dianggap hari sebelumnya)

    var SERVER_TZ_HOURS = 7;
    var SERVER0_TIME = 60 * (-SERVER_TZ_HOURS * 60) * 1000;
    var SERVER_OPEN_DATE = new Date(2026, 5, 15, 0, 0, 0, 0).getTime(); // 2026-06-15 00:00 local
    var RESET_HOUR = 6;

    // ═══════════════════════════════════════════════════════
    //  CONFIG + MAINSERVER OBJECT
    // ═══════════════════════════════════════════════════════

    var MainServer = {
        config: {
            mainServerUrl: 'http://127.0.0.1:8001',
            chatServerUrl: 'http://127.0.0.1:8002',
            dungeonServerUrl: 'http://127.0.0.1:8004',
            teaKey: 'verification',
            verifyEnable: true,
            delayMin: 30,
            delayMax: 120,
            serverTzHours: SERVER_TZ_HOURS,
            server0Time: SERVER0_TIME,
            serverOpenDate: SERVER_OPEN_DATE,
            resetHour: RESET_HOUR
        },
        handlers: {},
        _handlerNames: [],
        _loadedHandlers: {},
        currentSocket: null,
        log: log
    };

    // ═══════════════════════════════════════════════════════
    //  SERVER TIME HELPERS
    // ═══════════════════════════════════════════════════════

    MainServer.getServerTime = function () {
        return Date.now();
    };

    MainServer.getServerLocalDate = function () {
        return new Date(Date.now());
    };

    MainServer.getServerOpenDate = function () {
        return MainServer.config.serverOpenDate;
    };

    MainServer.setServerOpenDate = function (ts) {
        if (typeof ts === 'number' && ts > 0) {
            MainServer.config.serverOpenDate = ts;
            log.info('storage', 'serverOpenDate updated → ' + new Date(ts).toISOString());
        }
    };

    MainServer.getDaysSinceOpen = function () {
        return Math.floor((Date.now() - MainServer.config.serverOpenDate) / 86400000) + 1;
    };

    MainServer.generateRetrieveDay = function (dateObj) {
        var d = dateObj || MainServer.getServerLocalDate();
        var h = d.getHours();
        if (RESET_HOUR > h) {
            d = new Date(d.valueOf() - 86400000);
        }
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    };

    MainServer.getServerLocalZeroClockTime = function () {
        var d = MainServer.getServerLocalDate();
        var y = d.getFullYear();
        var m = d.getMonth() + 1;
        var day = d.getDate();
        return new Date(y + '/' + m + '/' + day).getTime();
    };

    MainServer.isAfterReset = function (dateObj) {
        var d = dateObj || MainServer.getServerLocalDate();
        return d.getHours() >= RESET_HOUR;
    };

    MainServer.getNextResetTime = function () {
        var d = MainServer.getServerLocalDate();
        if (d.getHours() >= RESET_HOUR) {
            // Sudah lewat reset hari ini → reset berikutnya = besok RESET_HOUR:00:00
            d.setDate(d.getDate() + 1);
        }
        d.setHours(RESET_HOUR, 0, 0, 0);
        return d.getTime();
    };

    MainServer.getResetCountdown = function () {
        var next = MainServer.getNextResetTime();
        var now = MainServer.getServerLocalDate().getTime();
        return Math.max(0, Math.floor((next - now) / 1000));
    };

    MainServer.randomDelay = function () {
        return Math.floor(Math.random() * (MainServer.config.delayMax - MainServer.config.delayMin + 1)) + MainServer.config.delayMin;
    };

    MainServer.generateChallenge = function () {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var result = '';
        for (var i = 0; i < 16; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    };

    // ═══════════════════════════════════════════════════════
    //  BUILD ENVELOPE
    // ═══════════════════════════════════════════════════════
    //  (SERVER TIME CONSTANTS kini di atas CONFIG — lihat PR3 FIX)

    MainServer.buildEnvelope = function (responseData, retCode) {
        var ret = (typeof retCode === 'number' && retCode !== 0) ? retCode : 0;
        var dataStr;
        try { dataStr = JSON.stringify(responseData !== undefined && responseData !== null ? responseData : {}); } catch (e) { dataStr = '{}'; }
        var compress = false;
        if (ret === 0 && typeof LZString !== 'undefined' && typeof LZString.compressToUTF16 === 'function') {
            try { dataStr = LZString.compressToUTF16(dataStr); compress = true; } catch (e) {}
        }
        return {
            ret: ret,
            data: dataStr,
            compress: compress,
            serverTime: Date.now(),
            server0Time: SERVER0_TIME
        };
    };

    // ═══════════════════════════════════════════════════════
    //  NOTIFY
    // ═══════════════════════════════════════════════════════

    MainServer.notify = function (data) {
        MainServer.log.notify(data && data.action, data);
    };

    // ═══════════════════════════════════════════════════════
    //  ONLINE TRACKER (untuk friend: _online / _offlineTime)
    // ═══════════════════════════════════════════════════════
    //  Kontrak client (main.min.js):
    //    ViewCommon.setUserOnLineState(online, offlineTime, ...)
    //      → online=true  : badge "Online"
    //      → online=false : text = getStrintTime(getServerTime() - offlineTime)
    //    FriendlistInfoModel default: _online=!0 (true), _offlineTime=0
    //  Basis waktu: serverTime = Date.now() (buildEnvelope di atas) —
    //  jadi offlineTime juga epoch ms perangkat.
    //  Threshold "dianggap online": 5 menit sejak aktivitas terakhir.
    //  Persist throttled 60s → aman utk refresh (offlineTime tetap ada).

    var ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
    var ONLINE_PERSIST_INTERVAL_MS = 60 * 1000;
    MainServer._lastActive = {};      // { userId: epochMs } in-memory
    MainServer._lastActivePersist = {}; // { userId: epochMs } throttle penulisan DB

    MainServer.trackUserActive = function (userId) {
        if (!userId) return;
        var now = Date.now();
        MainServer._lastActive[userId] = now;
        try {
            var lastPersist = MainServer._lastActivePersist[userId] || 0;
            if (now - lastPersist >= ONLINE_PERSIST_INTERVAL_MS) {
                MainServer._lastActivePersist[userId] = now;
                MainServer.db.save('lastActive:' + userId, now);
            }
        } catch (e) {}
    };

    /**
     * getUserOnlineState(userId) → { online:boolean, offlineTime:epochMs }
     * - Ada data & segar (<= 5 menit)  → online=true,  offlineTime=lastActive
     * - Ada data & sudah lewat          → online=false, offlineTime=lastActive
     * - Tidak ada data sama sekali      → JANGAN set field apa pun (return null)
     *   → client pakai default modelnya (_online=true, _offlineTime=0),
     *     persis perilaku main.min.js sebelum ada data.
     */
    MainServer.getUserOnlineState = function (userId) {
        if (!userId) return null;
        var now = Date.now();
        var lastActive = MainServer._lastActive[userId];
        if (typeof lastActive !== 'number') {
            try { lastActive = MainServer.db.get('lastActive:' + userId); } catch (e) { lastActive = null; }
            if (typeof lastActive === 'number') {
                MainServer._lastActive[userId] = lastActive; // promote ke memory cache
            }
        }
        if (typeof lastActive !== 'number' || lastActive <= 0) return null;
        return {
            online: (now - lastActive) < ONLINE_THRESHOLD_MS,
            offlineTime: lastActive
        };
    };

    window.MainServer = MainServer;

    // ═══════════════════════════════════════════════════════
    //  DATABASE — In-Memory Cache + IndexedDB Persistence
    // ═══════════════════════════════════════════════════════

    var _dbEngine = (function () {
        var memory = {};
        var idb = null;
        var ready = false;
        var useIDB = false;
        var pendingWrites = [];
        var writesDuringLoad = {};
        var DB_NAME = 'main-server';
        var DB_VERSION = 1;
        var STORE = 'userData';

        function get(key) {
            if (memory.hasOwnProperty(key)) return memory[key];
            return undefined;
        }

        function set(key, data) {
            memory[key] = data;
            if (!ready) {
                writesDuringLoad[key] = true;
            }
            if (idb) {
                writeIDB(key, data);
            } else if (!ready) {
                pendingWrites.push({ key: key, data: data });
            }
        }

        function remove(key) {
            delete memory[key];
            if (idb) deleteIDB(key);
        }

        function keys() { return Object.keys(memory); }

        function init() {
            log.info('database', 'Opening database — db="' + DB_NAME + '" store="' + STORE + '" version=' + DB_VERSION);
            if (window.indexedDB) {
                try {
                    var request = indexedDB.open(DB_NAME, DB_VERSION);
                    request.onupgradeneeded = function (e) {
                        var db = e.target.result;
                        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
                        log.info('database', 'Object store created — "' + STORE + '"');
                    };

                    request.onsuccess = function (e) {
                        idb = e.target.result;
                        useIDB = true;
                        log.info('database', 'IndexedDB connection established — db="' + DB_NAME + '"');

                        loadAllFromIDB(function (idbKeys) {
                            if (idbKeys.length > 0) {
                                log.info('database', 'Persisted data loaded — ' + idbKeys.length + ' key(s) from "' + STORE + '"');
                            } else {
                                log.info('database', 'No persisted data found — starting fresh');
                            }

                            // flush pending writes
                            if (pendingWrites.length > 0) {
                                log.info('database', 'Flushing ' + pendingWrites.length + ' pending write(s) queued before DB was ready');
                                for (var i = 0; i < pendingWrites.length; i++) {
                                    writeIDB(pendingWrites[i].key, pendingWrites[i].data);
                                }
                                pendingWrites = [];
                            }

                            if (Object.keys(writesDuringLoad).length > 0) {
                                log.info('database', 'Skipped ' + Object.keys(writesDuringLoad).length + ' key(s) overwritten during load (writesDuringLoad)');
                            }
                            writesDuringLoad = {};
                            ready = true;
                            log.info('database', 'Database ready — engine=IndexedDB, keys=' + Object.keys(memory).length);
                        });
                    };

                    request.onerror = function (e) {
                        ready = true;
                        log.warn('database', 'IndexedDB open failed (db="' + DB_NAME + '") — falling back to memory-only mode');
                        log.info('database', 'Database ready — engine=memory (fallback), keys=' + Object.keys(memory).length);
                    };

                    request.onblocked = function () {
                        log.warn('database', 'IndexedDB open blocked (db="' + DB_NAME + '") — another tab may be using it, retrying...');
                    };

                } catch (err) {
                    ready = true;
                    log.warn('database', 'IndexedDB not usable — ' + (err.message || err.name || 'unknown error') + ' — falling back to memory-only mode');
                    log.info('database', 'Database ready — engine=memory (fallback), keys=' + Object.keys(memory).length);
                }
            } else {
                ready = true;
                log.warn('database', 'IndexedDB not supported by this browser — falling back to memory-only mode');
                log.info('database', 'Database ready — engine=memory (fallback), keys=' + Object.keys(memory).length);
            }
        }

        function loadAllFromIDB(callback) {
            if (!idb) { callback([]); return; }
            try {
                var tx = idb.transaction(STORE, 'readonly');
                var store = tx.objectStore(STORE);
                var request = store.openCursor();
                var loaded = [];

                request.onsuccess = function (e) {
                    var cursor = e.target.result;
                    if (cursor) {
                        if (!writesDuringLoad[cursor.key]) {
                            memory[cursor.key] = cursor.value;
                        }
                        loaded.push(cursor.key);
                        cursor.continue();
                    } else {
                        callback(loaded);
                    }
                };
                request.onerror = function () {
                    log.error('database', 'Failed to load from IndexedDB');
                    callback([]);
                };
            } catch (ex) {
                log.error('database', 'loadAllFromIDB error: ' + ex.message);
                callback([]);
            }
        }

        function writeIDB(key, data) {
            if (!idb) return;
            try {
                var tx = idb.transaction(STORE, 'readwrite');
                var store = tx.objectStore(STORE);
                store.put(data, key);
            } catch (ex) { log.error('database', 'writeIDB error: ' + ex.message); }
        }

        function deleteIDB(key) {
            if (!idb) return;
            try {
                var tx = idb.transaction(STORE, 'readwrite');
                var store = tx.objectStore(STORE);
                store.delete(key);
            } catch (ex) { log.error('database', 'deleteIDB error: ' + ex.message); }
        }

        return {
            init: init, get: get, set: set, remove: remove, keys: keys,
            isReady: function () { return ready; },
            isUsingIDB: function () { return useIDB; },
            getMemorySize: function () { return Object.keys(memory).length; }
        };
    })();

    _dbEngine.init();
    //  PR3 FIX: dulu log "Init complete — engine=memory" dicetak sinkron
    //  SEBELUM IndexedDB (async) selesai → kontradiktif dgn log "Database ready
    //  — engine=IndexedDB" belakangan. Sekarang: status jujur + satu sumber
    //  kebenaran ("Database ready" di callback async).
    log.info('database', 'Open requested — engine dikonfirmasi saat IndexedDB siap (async)');

    MainServer.db = {
        _prefix: '',
        save: function (key, data) {
            try {
                _dbEngine.set(this._prefix + key, data);
                // 💾 catat utk breakdown persistsi di grup request berjalan
                try { if (typeof log.dbWrite === 'function') log.dbWrite(this._prefix + key, JSON.stringify(data).length); } catch (le) {}
                return true;
            } catch (e) { log.error('database', 'Save failed: ' + key + ' — ' + e.message); return false; }
        },
        get: function (key, defaultVal) { try { var val = _dbEngine.get(this._prefix + key); return val !== undefined ? val : (defaultVal !== undefined ? defaultVal : null); } catch (e) { log.error('database', 'Get failed: ' + key + ' — ' + e.message); return defaultVal !== undefined ? defaultVal : null; } },
        remove: function (key) { try { _dbEngine.remove(this._prefix + key); } catch (e) {} },
        keys: function () { var prefix = this._prefix; var allKeys = _dbEngine.keys(); var result = []; for (var i = 0; i < allKeys.length; i++) { if (allKeys[i].indexOf(prefix) === 0) result.push(allKeys[i].substring(prefix.length)); } return result; }
    };

    // ═══════════════════════════════════════════════════════
    //  MainServerDB
    // ═══════════════════════════════════════════════════════

    var _loginTokens = {};

    // _loginTokens: in-memory cache, populated on successful IDB reads
    // (no preload — token is written by login-server AFTER this script loads)

    window.MainServerDB = {
        _get: function (key) { return MainServer.db.get(key); },
        _set: function (key, data) { return MainServer.db.save(key, data); },
        /**
         * _getAllKeys() — daftar semua key DB (sudah tanpa prefix).
         * Dipakai friend/recommendFriend untuk scan seluruh akun 'user:{id}'
         * (main.min.js: client kirim oldUids, server balas _recommendFriends).
         * Sumber data: MainServer.db.keys() — engine DB yang sama dengan _get/_set.
         */
        _getAllKeys: function () {
            try { return MainServer.db.keys(); } catch (e) { return []; }
        },
        nowSeconds: function () { return Math.floor(Date.now() / 1000); },
        /**
         * validateLoginToken(userId, callback) — ASYNC
         * Reads directly from IndexedDB at call time (not startup cache).
         * Login-server writes token to login-server/loginInfo AFTER user logs in,
         * so a startup preload would always miss it on fresh browsers.
         */
        validateLoginToken: function (userId, callback) {
            // Cache hit → instant
            if (_loginTokens[userId]) {
                callback({ valid: true, token: { loginToken: _loginTokens[userId], userId: userId } });
                return;
            }
            // Read from IndexedDB (where login-server SaveHistory writes)
            try {
                var req = indexedDB.open('login-server');
                req.onupgradeneeded = function () {};
                req.onsuccess = function (e) {
                    var idb = e.target.result;
                    try {
                        var tx = idb.transaction('loginInfo', 'readonly');
                        var store = tx.objectStore('loginInfo');
                        var cursor = store.openCursor();
                        cursor.onsuccess = function (ev) {
                            var c = ev.target.result;
                            if (c) {
                                if (c.value && c.value.userId === userId && c.value.loginToken) {
                                    _loginTokens[userId] = c.value.loginToken;
                                    idb.close();
                                    callback({ valid: true, token: { loginToken: c.value.loginToken, userId: userId } });
                                    return;
                                }
                                c.continue();
                            } else {
                                idb.close();
                                callback({ valid: false, reason: 'token_not_found' });
                            }
                        };
                        cursor.onerror = function () { idb.close(); callback({ valid: false, reason: 'db_read_error' }); };
                    } catch (ex) { idb.close(); callback({ valid: false, reason: 'db_exception' }); }
                };
                req.onerror = function () { callback({ valid: false, reason: 'db_open_error' }); };
            } catch (ex) { callback({ valid: false, reason: 'exception' }); }
        }
    };

    // ═══════════════════════════════════════════════════════
    //  HANDLER REGISTRY + LAZY LOADER
    // ═══════════════════════════════════════════════════════

    MainServer._pendingCallbacks = {};

    MainServer.registerHandler = function (type, action, handlerFn) {
        var key = type + '/' + action;
        MainServer.handlers[key] = handlerFn;
        if (MainServer._handlerNames.indexOf(key) === -1) MainServer._handlerNames.push(key);
        if (MainServer._pendingCallbacks && MainServer._pendingCallbacks[key]) {
            var cbs = MainServer._pendingCallbacks[key];
            delete MainServer._pendingCallbacks[key];
            for (var i = 0; i < cbs.length; i++) cbs[i]();
        }
        log.debug('register', key + ' — handler function registered');
    };

    MainServer.loadHandlerScript = function (type, action, onReady) {
        var key = type + '/' + action;

        if (MainServer._loadedHandlers[key] === 'registered') {
            log.debug('loader', key + ' — already cached');
            onReady(); return;
        }

        if (MainServer._loadedHandlers[key] === 'loading') {
            log.debug('loader', key + ' — already loading, queuing callback');
            if (!MainServer._pendingCallbacks[key]) MainServer._pendingCallbacks[key] = [];
            MainServer._pendingCallbacks[key].push(onReady);
            return;
        }

        MainServer._loadedHandlers[key] = 'loading';
        log.debug('loader', key + ' — loading script: handlers/' + type + '/' + action + '.js');

        // ── CASE-SENSITIVE HOSTING FALLBACK ──────────────────────────
        //  Hosting Linux case-sensitive: client kirim type:"cellGame"
        //  tapi folder fisik "cellgame/", action "getInfo" vs "getinfo".
        //  Susun kandidat URL: [original, lowercase] untuk folder & file,
        //  coba berurutan sampai handler ter-register.
        var folders = [type];
        if (type.toLowerCase() !== type) folders.push(type.toLowerCase());
        var files = [action];
        if (action.toLowerCase() !== action) files.push(action.toLowerCase());

        var _candidates = [];
        for (var fi = 0; fi < folders.length; fi++) {
            for (var ai = 0; ai < files.length; ai++) {
                _candidates.push(folders[fi] + '/' + files[ai] + '.js');
            }
        }
        var _candIdx = 0;
        var bustV = Date.now();

        function tryLoadNext() {
            if (_candIdx >= _candidates.length) {
                // Semua varian casing gagal — benar-benar tidak ada file-nya
                delete MainServer._loadedHandlers[key];
                log.warn('loader', key + ' — script file not found (404, tried ' + _candidates.length + ' casing variants) — will retry on next request');
                onReady();
                return;
            }
            var relPath = _candidates[_candIdx++];
            var script = document.createElement('script');
            script.src = basePath + 'handlers/' + relPath + '?t=' + bustV;
            script.async = false;
            script.onload = function () {
                if (typeof MainServer.handlers[key] === 'function') {
                    MainServer._loadedHandlers[key] = 'registered';
                    if (relPath !== type + '/' + action + '.js') {
                        log.info('loader', key + ' — loaded via case-fallback: handlers/' + relPath);
                    }
                } else {
                    // File ada tapi tidak register (mungkin register dgn key lain) → coba kandidat berikutnya
                    delete MainServer._loadedHandlers[key];
                    log.warn('loader', key + ' — loaded handlers/' + relPath + ' but handler did NOT call registerHandler — trying next variant');
                    script.parentNode && script.parentNode.removeChild(script);
                    tryLoadNext();
                    return;
                }
                onReady();
                script.parentNode && script.parentNode.removeChild(script);
            };
            script.onerror = function () {
                script.parentNode && script.parentNode.removeChild(script);
                tryLoadNext();
            };
            (document.head || document.documentElement).appendChild(script);
        }

        tryLoadNext();
    };

    // ═══════════════════════════════════════════════════════
    //  ROUTER
    // ═══════════════════════════════════════════════════════

    var _stats = { total: 0, unknown: 0, lazy: 0, errors: 0 };

    function dispatch(request, originalCallback) {
        var type = request.type || '';
        var action = request.action || '';
        var key = type + '/' + action;
        _stats.total++;

        // 🟢 Online tracker — setiap request ber-userId = aktivitas terakhir user
        if (request && request.userId) MainServer.trackUserActive(request.userId);

        log.debug('handler', 'incoming → ' + (key || '(empty)'));

        if (!type || !action) {
            _stats.unknown++;
            // ── Logger v2: grup dibuka + langsung ditutup dgn envelope error ──
            log.requestGroup(key || '(invalid)', request);
            log.envelope(key || '(invalid)',
                { ret: 1, data: '{}', compress: false }, 0,
                [{ type: 'ERROR', msg: 'Missing type atau action — type="' + type + '" action="' + action + '"' }]);
            originalCallback(MainServer.buildEnvelope({ error: 'missing_type_or_action' }, 1));
            return;
        }

        var handler = MainServer.handlers[key];
        if (typeof handler === 'function') {
            log.debug('handler', key + ' → handler cached, executing');
            executeHandler(key, handler, request, originalCallback);
        } else {
            _stats.lazy++;
            // ── Logger v2: grup ▶ REQUEST dibuka SEKARANG supaya proses
            //    lazy-load + eksekusi handler + respons semuanya satu grup ──
            log.requestGroup(key, request);
            log.step('📦', 'handler belum tercache — lazy-load: handlers/' + key + '.js');
            MainServer.loadHandlerScript(type, action, function () {
                var h = MainServer.handlers[key];
                if (typeof h === 'function') {
                    executeHandler(key, h, request, originalCallback, true);
                } else {
                    _stats.unknown++;
                    log.envelope(key,
                        { ret: 1, data: '{}', compress: false }, 0,
                        [{ type: 'ERROR', msg: 'Handler NOT FOUND: ' + key }]);
                    originalCallback(MainServer.buildEnvelope({ error: 'handler_not_found', type: type, action: action }, 1));
                }
            });
        }
    }

    function executeHandler(key, handler, request, originalCallback, groupOpen) {
        if (!groupOpen) log.requestGroup(key, request);  // grup dibuka di sini utk handler cached
        var t0 = Date.now();
        try {
            handler(request, function (responseData, retCode) {
                var ms = Date.now() - t0;
                var envelope = MainServer.buildEnvelope(responseData, retCode);
                var parsedData = null;
                try {
                    var rawData = envelope.data;
                    if (envelope.compress && typeof LZString !== 'undefined' && typeof LZString.decompressFromUTF16 === 'function') {
                        rawData = LZString.decompressFromUTF16(rawData);
                    }
                    if (typeof rawData === 'string' && rawData.length > 0) parsedData = JSON.parse(rawData);
                    else if (rawData && typeof rawData === 'object') parsedData = rawData;
                } catch (e) {}
                var issues = log.autoInspect(key, envelope, parsedData);
                // ── Logger v2: 📤 RESPONSE + client-next + tutup grup ──
                log.envelope(key, envelope, ms, issues);
                if (typeof originalCallback === 'function') {
                    try { originalCallback(envelope); }
                    catch (cbErr) {
                        log.error('callback', 'Route: ' + key + ' — ' + (cbErr.name || 'Error') + ': ' + cbErr.message);
                        if (cbErr.stack) console.error(cbErr.stack);
                        
                    }
                }
            });
        } catch (err) {
            _stats.errors++;
            var ms = Date.now() - t0;
            log.envelope(key,
                { ret: 1, data: '{}', compress: false }, ms,
                [{ type: 'ERROR', msg: 'EXCEPTION: ' + err.name + ' — ' + err.message }]);
            originalCallback(MainServer.buildEnvelope({ error: 'handler_exception', action: key, errorName: err.name, errorMessage: err.message }, 1));
        }
    }

    MainServer.router = {
        dispatch: dispatch,
        getStats: function () { return { total: _stats.total, unknown: _stats.unknown, lazy: _stats.lazy, errors: _stats.errors }; }
    };

    // ═══════════════════════════════════════════════════════
    //  MAINSOCKET
    // ═══════════════════════════════════════════════════════

    var _sockCounter = 0;

    function _generateSocketId() {
        var chars = '0123456789abcdef';
        var id = '';
        for (var i = 0; i < 20; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
        return id;
    }

    function MainSocket() {
        _sockCounter++;
        this.id = _generateSocketId();
        this.connected = false;
        this.disconnected = false;
        this._listeners = {};
        this._emitCount = 0;
        this._challenge = '';
        this._verified = false;

        var self = this;
        var delay = MainServer.randomDelay();
        var sockId = this.id;

        log.info('connection', '#' + _sockCounter + ' (' + sockId + ') connecting... (delay ~' + delay + 'ms)');

        setTimeout(function () {
            if (self.disconnected) { log.warn('connection', '#' + _sockCounter + ' (' + sockId + ') disconnected before connect completed'); return; }
            self.connected = true;
            self._fire('connect');
            log.info('connection', '#' + _sockCounter + ' (' + sockId + ') connected — ' + delay + 'ms latency');

            if (MainServer.config.verifyEnable) {
                log.info('encryption', '#' + _sockCounter + ' (' + sockId + ') starting TEA challenge...');
                setTimeout(function () {
                    if (self.disconnected || !self.connected) { log.warn('connection', '#' + _sockCounter + ' (' + sockId + ') disconnected before verify could start'); return; }
                    self._startVerify();
                }, 50);
            } else {
                self._verified = true;
                log.info('encryption', '#' + _sockCounter + ' (' + sockId + ') verify disabled — marking as verified');
            }
        }, delay);
    }

    MainSocket.prototype._startVerify = function () {
        var challenge = MainServer.generateChallenge();
        this._challenge = challenge;
        log.info('encryption', '#' + _sockCounter + ' (' + this.id + ') challenge sent → client must encrypt with key="' + MainServer.config.teaKey + '"');
        log.details('TEA', [
            ['socketId', this.id],
            ['challenge', challenge]
        ]);
        this._fire('verify', challenge);
    };

    MainSocket.prototype._verifyResponse = function (encrypted, callback) {
        var sockId = this.id;
        if (!this._challenge) {
            log.warn('encryption', '#' + _sockCounter + ' (' + sockId + ') verify response received but no challenge was stored — rejecting');
            if (typeof callback === 'function') callback({ ret: 1 });
            return;
        }
        try {
            var tea = new _TEA();
            var decrypted = tea.decrypt(encrypted, MainServer.config.teaKey);
            log.details('TEA', [
                ['socketId', sockId],
                ['cipher', (encrypted ? String(encrypted).length : 0) + ' chars (base64)'],
                ['challenge', this._challenge.length + ' chars'],
                ['dekripsi', (decrypted === this._challenge) ? 'MATCH' : 'MISMATCH (' + (decrypted ? decrypted.length : 0) + ' chars)']
            ]);
            if (decrypted === this._challenge) {
                this._verified = true;
                log.info('encryption', '#' + _sockCounter + ' (' + sockId + ') verify SUCCESS — decryption matched challenge');
                if (typeof callback === 'function') callback({ ret: 0 });
            } else {
                log.warn('encryption', '#' + _sockCounter + ' (' + sockId + ') verify FAILED — decrypted value does not match challenge');
                if (typeof callback === 'function') callback({ ret: 1 });
            }
        } catch (err) {
            log.error('encryption', '#' + _sockCounter + ' (' + sockId + ') decrypt error — ' + (err.name || 'Error') + ': ' + err.message);
            if (typeof callback === 'function') callback({ ret: 1 });
        }
    };

    MainSocket.prototype.on = function (event, handler) {
        if (typeof handler !== 'function') return;
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
    };

    MainSocket.prototype.off = function (event, handler) {
        if (!this._listeners[event]) return;
        if (handler) {
            var list = this._listeners[event];
            for (var i = list.length - 1; i >= 0; i--) { if (list[i] === handler) list.splice(i, 1); }
        } else { delete this._listeners[event]; }
    };

    MainSocket.prototype.emit = function (event, data, callback) {
        this._emitCount++;
        if (event === 'verify' && !this._verified) { this._verifyResponse(data, callback); return; }
        if (event === 'handler.process') {
            var routeName = (data && data.type && data.action) ? (data.type + '/' + data.action) : '(unknown)';
            if (!this._verified && MainServer.config.verifyEnable) {
                log.warn('connection', '(' + this.id + ') handler.process received before TEA verify — rejected (route: ' + routeName + ')');
                return;
            }
            var self = this;
            var delay = MainServer.randomDelay();
            log.debug('handler', '(' + this.id + ') handler.process → ' + routeName + ' (delay ~' + delay + 'ms)');
            setTimeout(function () {
                if (!self.connected) { log.warn('connection', '(' + self.id + ') socket disconnected before handler could execute (route: ' + routeName + ')'); return; }
                if (!data || typeof data !== 'object') { log.warn('connection', '(' + self.id + ') handler.process received invalid payload — expected object, got ' + typeof data + ' (event=handler.process)'); return; }
                MainServer.currentSocket = self;
                dispatch(data, function (envelope) {
                    var route = data.type + '/' + data.action;
                    // trackEnvelope dipanggil SEKALI di executeHandler (dgn durasi ms)
                    // — duplikasi di sini dulu menghitung dobel & tanpa ms
                    if (typeof callback === 'function') {
                        try { callback(envelope); }
                        catch (cbErr) {
                            log.error('callback', 'Emit route: ' + route + ' — ' + (cbErr.name || 'Error') + ': ' + cbErr.message);
                            if (cbErr.stack) console.error(cbErr.stack);
                            
                        }
                    }
                });
            }, delay);
            return;
        }
        log.debug('EMIT', 'Unhandled: ' + event);
    };

    MainSocket.prototype.disconnect = function () {
        log.info('connection', '(' + this.id + ') disconnecting (source: client)');
        this.connected = false;
        this.disconnected = true;
        this._verified = false;
        this._fire('disconnect', 'client');
    };

    MainSocket.prototype.destroy = function () {
        this.connected = false;
        this.disconnected = true;
        this._verified = false;
        this._listeners = {};
    };

    MainSocket.prototype._fire = function (event) {
        var list = this._listeners[event];
        if (!list || list.length === 0) return;
        var args = Array.prototype.slice.call(arguments, 1);
        for (var i = 0; i < list.length; i++) {
            try { list[i].apply(this, args); }
            catch (e) { log.error('connection', 'Listener error "' + event + '": ' + e.message); }
        }
    };

    // ═══════════════════════════════════════════════════════
    //  IO.CONNECT ROUTER
    // ═══════════════════════════════════════════════════════
    //  :8001 → MainSocket  |  :8002 → ServerSocket (chat)
    //  :8004 → ServerSocket (dungeon)  |  lainnya → passthrough

    var _installed = false;

    function getServerType(url) {
        if (!url) return false;
        if (url.indexOf(':8001') !== -1) return 'main';
        if (url.indexOf(':8002') !== -1) return 'chat';
        if (url.indexOf(':8004') !== -1) return 'dungeon';
        return false;
    }

    function ServerSocket() {
        this.id = _generateSocketId();
        this.connected = true;
        this.disconnected = false;
        this._listeners = {};
        this._challenge = '';
        var self = this;
        setTimeout(function () {
            self._fire('connect');
            setTimeout(function () {
                if (self.disconnected) return;
                var challenge = MainServer.generateChallenge();
                self._challenge = challenge;
                self._fire('verify', challenge);
            }, 50);
        }, MainServer.randomDelay());
    }
    ServerSocket.prototype.on = function (event, handler) {
        if (typeof handler !== 'function') return;
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
    };
    ServerSocket.prototype.off = function (event, handler) {
        if (!this._listeners[event]) return;
        if (handler) { var list = this._listeners[event]; for (var i = list.length - 1; i >= 0; i--) { if (list[i] === handler) list.splice(i, 1); } }
        else { delete this._listeners[event]; }
    };
    ServerSocket.prototype.emit = function (event, data, callback) {
        if (event === 'handler.process') {
            var self = this;
            setTimeout(function () {
                if (typeof callback === 'function') {
                    callback({ ret: 0, data: '{}', compress: false, serverTime: Date.now(), server0Time: SERVER0_TIME });
                }
            }, MainServer.randomDelay());
            return;
        }
        if (event === 'verify') {
            var self = this;
            setTimeout(function () {
                if (!self._challenge || typeof callback !== 'function') return;
                try {
                    var tea = new _TEA();
                    var decrypted = tea.decrypt(data, MainServer.config.teaKey);
                    callback(decrypted === self._challenge ? { ret: 0 } : { ret: 1 });
                } catch (err) {
                    callback({ ret: 1 });
                }
            }, 10);
            return;
        }
    };
    ServerSocket.prototype.disconnect = function () {
        log.info('connection', '(' + this.id + ') disconnecting (source: io server disconnect)');
        this.connected = false;
        this.disconnected = true;
        this._fire('disconnect', 'io server disconnect');
    };
    ServerSocket.prototype.destroy = function () {
        this.connected = false;
        this.disconnected = true;
        this._listeners = {};
    };
    ServerSocket.prototype._fire = function (event) {
        var list = this._listeners[event];
        if (!list || list.length === 0) return;
        var args = Array.prototype.slice.call(arguments, 1);
        for (var i = 0; i < list.length; i++) {
            try { list[i].apply(this, args); }
            catch (e) {}
        }
    };

    function installSocketRouter() {
        if (_installed) return false;
        if (!window.io || typeof window.io.connect !== 'function') return false;
        var originalConnect = window.io.connect;
        _installed = true;
        window.io.connect = function (url, options) {
            var serverType = getServerType(url);
            if (serverType === 'main') {
                log.info('network', 'io.connect("' + url + '") → routed to MainSocket (port 8001)');
                return new MainSocket();
            }
            if (serverType === 'chat' || serverType === 'dungeon') {
                log.info('network', 'io.connect("' + url + '") → routed to ServerSocket (' + serverType + ', port ' + (serverType === 'chat' ? '8002' : '8004') + ')');
                return new ServerSocket();
            }
            log.debug('network', 'io.connect("' + url + '") → passthrough to original io.connect (unrecognized port)');
            return originalConnect.call(window.io, url, options);
        };
        log.info('network', 'Socket router installed — routing ports: 8001 (main), 8002 (chat), 8004 (dungeon)');
        return true;
    }

    // ═══════════════════════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════════════════════

    function init() {
        MainServer.MainSocket = MainSocket;
        MainServer.ServerSocket = ServerSocket;
        MainServer._TEA = _TEA;
        window.MainServer = MainServer;

        // ── Load heroStats.js (shared compute engine) BEFORE any handler ──
        // Handlers are lazy-loaded but heroStats must be available globally
        (function loadHeroStats() {
            var s = document.createElement('script');
            s.src = basePath + 'heroStats.js';
            s.async = false;
            document.head.appendChild(s);
        })();

        var _observer = null;

        var pollCount = 0;
        var pollTimer = setInterval(function () {
            if (_installed) {
                clearInterval(pollTimer);
                if (_observer) { _observer.disconnect(); _observer = null; }
                return;
            }
            if (++pollCount > 300) {
                clearInterval(pollTimer);
                if (_observer) { _observer.disconnect(); _observer = null; }
                log.error('network', 'window.io NOT found after 30s — socket routing cannot be installed, io.connect calls will use original behavior');
                return;
            }
            if (pollCount % 50 === 0) log.debug('network', 'waiting for io... (' + (pollCount * 100) + 'ms)');
            if (installSocketRouter()) {
                clearInterval(pollTimer);
                if (_observer) { _observer.disconnect(); _observer = null; }
            }
        }, 100);

        if (typeof MutationObserver !== 'undefined') {
            _observer = new MutationObserver(function () {
                if (!_installed && window.io && typeof window.io.connect === 'function') {
                    installSocketRouter();
                    clearInterval(pollTimer);
                    _observer.disconnect();
                    _observer = null;
                }
            });
            _observer.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(function () {
                if (_observer) { _observer.disconnect(); _observer = null; }
            }, 60000);
        }

        // ═══════════════════════════════════════════════════════
        //  🚀 BOOT BANNER — satu-satunya banner (PR3: dulu 3 log bertumpuk)
        // ═══════════════════════════════════════════════════════

        var _bootDay = Math.floor((Date.now() - SERVER_OPEN_DATE) / 86400000) + 1;
        if (_bootDay < 1) _bootDay = 0; // clock skew / belum dibuka
        var _openD = new Date(SERVER_OPEN_DATE);
        var _openStr = _openD.getFullYear() + '-' + (_openD.getMonth() + 1 < 10 ? '0' : '') + (_openD.getMonth() + 1) + '-' + (_openD.getDate() < 10 ? '0' : '') + _openD.getDate();
        var _cd = MainServer.getResetCountdown();
        var _cdStr = Math.floor(_cd / 3600) + 'j ' + Math.floor((_cd % 3600) / 60) + 'm';

        console.log('');
        console.log('%c🚀 MAIN SERVER BOOT ═══════════════════════════', 'color:#4CAF50;font-weight:bold;font-size:13px;');
        log.alwaysDetails([
            ['🍵 TEA', MainServer.config.verifyEnable ? 'ON (key="' + MainServer.config.teaKey + '")' : 'OFF'],
            ['🗄 Database', 'IndexedDB "main-server"/"userData" (fallback: memory)'],
            ['📅 Open date', _openStr + ' · hari ke-' + _bootDay],
            ['⏰ Reset', RESET_HOUR + ':00 (server time) · berikutnya ' + _cdStr],
            ['📦 Handlers', MainServer._handlerNames.length + ' aktif · lazy-load on demand · 34 type'],
            ['🔗 Client-next', log.clientNextCount() + ' route dipetakan dari main.min.js (ok/fail + chain)'],
            ['🏷 Kategori', log.categoryCount() + ' type → emoji + warna'],
            ['📊 LogLevel', log.getLevel() + ' · .setLevel("DEBUG") utk detail infra (loader/socket/register)'],
            ['🔌 Router', _installed ? 'installed' : 'menunggu window.io']
        ]);
        console.log('');
    }

    init();

})();