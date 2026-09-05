/**
 * handlers/tower/openBox.js — Karin Tower Open Box Event (klik peti di menara)
 * Super Warrior Z — MAIN SERVER (Task 22b — tower audit)
 *
 * ============================================================
 *  KONTRAK main.min.js (evidence verbatim — PATEN):
 * ============================================================
 *  [REQUEST] pos 4698149 — eventTapAction TOWER_BOX:
 *    ts.processHandler({type:"tower",action:"openBox",userId:a,eventId:n,version:"1.0"},cb)
 *
 *  [RESPONSE CONSUMER]:
 *    t._changeInfo._items → openCommonItemGetTips (setelah animasi)
 *    t → setKarinTowerModelData(t) (refresh event list)
 *
 *  [BOX FORMAT] TowerBoxEventItem: _reward = AttrItem {_id, _num}
 *    Sumber reward: karinTowerChest.json (chestID1=134, num1=20)

 *
 * ============================================================
 *  STORAGE:
 *    savedData.tower = {
 *      grade: number                — meter/lantai (UI setBgGroup: 360px/grade)
 *      events: [{id,type,time,...}] — event aktif di menara
 *      battleTimes: number          — sisa kesempatan battle (start 5 / max 10 / +1 per 7200s)
 *      battleTimesRecover: ms       — timestamp recovery battle times
 *      buyBattleTimesCount: number  — pembelian battle times (index harga)
 *      buyFeetCount: number         — pembelian feet (index harga)
 *      rankCache: {date, robots[]}  — cache rank harian (deterministik)
 *    }
 *    savedData.timesInfo.karinFeet/karinFeetRecover — feet (maks 5, recover 2 jam)
 * ============================================================
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    if (!MainServer.handlers.tower) MainServer.handlers.tower = {};

    // ── Config loader (sync XHR + cache) ──
    var _cfgCache = {};
    function loadJson(name) {
        if (_cfgCache[name]) return _cfgCache[name];
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './resource/json/' + name + '.json', false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                _cfgCache[name] = JSON.parse(xhr.responseText);
            }
        } catch (e) {}
        return _cfgCache[name] || null;
    }

    // ── Konstanta Karin Tower (constant.json["1"]) ──
    function KC() {
        var c = loadJson('constant');
        var r = (c && c['1']) ? c['1'] : {};
        return {
            FEET_MAX: Number(r.karinTowerFeet) || 5,
            FEET_REFRESH: Number(r.karinTowerFeetRefresh) || 7200,
            TIMES_START: Number(r.karinTowerTimesStart) || 5,
            TIMES_MAX: Number(r.karinTowerTimesMax) || 10,
            TIMES_EVERY: Number(r.karinTowerTimesEvery) || 7200,
            FEET_CLIMB: Number(r.karinTowerFeetClimb) || 20,
            ENEMY_EXIST: Number(r.karinTowerEnemyExistTime) || 1800,
            WIN_CHEST: Number(r.karinTowerWinGainChest) || 0.3,
            WIN_TIMES: Number(r.karinTowerWinGainBattleTimes) || 0.2,
            CLIMB_GAIN_TIMES: Number(r.karinTowerClimbGainBattleTimes) || 0.2,
            BEAT_HIGH: Number(r.karinTowerBeatHighClimb) || 7,
            BEAT_SAME: Number(r.karinTowerBeatSameClimb) || 5,
            BEAT_LOW: Number(r.karinTowerBeatLowClimb) || 5,
            OPEN: String(r.karinTowerOpen || '12:00:00'),
            END: String(r.karinTowerEnd || '20:00:00')
        };
    }

    // ── Level player (item 104 — main.min.js L62464 getUserLevel) ──
    function getPlayerLevel(sd) {
        if (sd.totalProps && sd.totalProps._items) {
            var items = sd.totalProps._items;
            for (var k = 0; k < items.length; k++) {
                if (Number(items[k]._id) === 104) return Number(items[k]._num) || 1;
            }
        }
        return 1;
    }

    // ── Item balance (pola getReward/arena: _num = ABSOLUTE balance) ──
    function getBal(sd, id) {
        var items = sd && sd.totalProps && sd.totalProps._items;
        if (!items) return 0;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(id)) return Number(items[i]._num) || 0;
        }
        return 0;
    }
    function setBal(sd, id, val) {
        if (!sd.totalProps) sd.totalProps = { _items: [] };
        if (!sd.totalProps._items) sd.totalProps._items = [];
        var items = sd.totalProps._items;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(id)) { items[i]._num = val; return val; }
        }
        items.push({ _id: id, _num: val });
        return val;
    }
    function grantReward(sd, changeItems, itemId, amount) {
        if (!itemId || itemId <= 0 || !amount || amount <= 0) return 0;
        var nb = getBal(sd, itemId) + amount;
        setBal(sd, itemId, nb);
        changeItems[String(itemId)] = { _id: itemId, _num: nb };
        log.details('TOWER', ['grant', 'item=' + itemId, '+' + amount, '=' + nb]);
        return nb;
    }

    // ── Tower state (savedData.tower) — init guarded + recovery battle times ──
    function ensureTower(sd) {
        var K = KC();
        if (!sd.tower || typeof sd.tower !== 'object') sd.tower = {};
        var t = sd.tower;
        if (typeof t.grade !== 'number') t.grade = 0;
        if (!t.events) t.events = [];
        if (typeof t.battleTimes !== 'number') t.battleTimes = K.TIMES_START;
        if (typeof t.battleTimesRecover !== 'number') t.battleTimesRecover = 0;
        if (typeof t.buyBattleTimesCount !== 'number') t.buyBattleTimesCount = 0;
        if (typeof t.buyFeetCount !== 'number') t.buyFeetCount = 0;
        var now = Date.now();
        if (t.battleTimes >= K.TIMES_MAX) {
            t.battleTimesRecover = 0;
        } else if (!t.battleTimesRecover) {
            t.battleTimesRecover = now;
        } else {
            var rec = Math.floor(Math.max(0, now - t.battleTimesRecover) / (K.TIMES_EVERY * 1000));
            if (rec > 0) {
                var nt = Math.min(t.battleTimes + rec, K.TIMES_MAX);
                t.battleTimesRecover = (nt >= K.TIMES_MAX) ? 0 : t.battleTimesRecover + rec * K.TIMES_EVERY * 1000;
                t.battleTimes = nt;
            }
        }
        return t;
    }

    // ── Feet recovery (timesInfo.karinFeet) — formula identik getFeetInfo/enterGame ──
    function recoverFeet(sd) {
        var K = KC();
        if (!sd.timesInfo || typeof sd.timesInfo !== 'object') sd.timesInfo = {};
        var ti = sd.timesInfo;
        if (typeof ti.karinFeet !== 'number') ti.karinFeet = K.FEET_MAX;
        if (typeof ti.karinFeetRecover !== 'number') ti.karinFeetRecover = 0;
        var now = Date.now();
        if (ti.karinFeet >= K.FEET_MAX) { ti.karinFeetRecover = 0; return; }
        if (!ti.karinFeetRecover) { ti.karinFeetRecover = now; return; }
        var rec = Math.floor(Math.max(0, now - ti.karinFeetRecover) / 1000 / K.FEET_REFRESH);
        if (rec > 0) {
            var nf = Math.min(ti.karinFeet + rec, K.FEET_MAX);
            ti.karinFeetRecover = (nf >= K.FEET_MAX) ? 0 : ti.karinFeetRecover + rec * K.FEET_REFRESH * 1000;
            ti.karinFeet = nf;
        }
    }

    // ── Jendela tower hari ini (12:00–20:00, frame UTC — konsisten getTodayStr) ──
    function getKarinWindow() {
        var K = KC();
        var po = K.OPEN.split(':'), pe = K.END.split(':');
        var d = new Date();
        var day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        var start = day0 + (Number(po[0]) * 3600 + Number(po[1]) * 60 + Number(po[2] || 0)) * 1000;
        var end = day0 + (Number(pe[0]) * 3600 + Number(pe[1]) * 60 + Number(pe[2] || 0)) * 1000;
        var now = Date.now();
        return { start: start, end: end, open: (now >= start && now <= end) };
    }

    // ── Serialisasi events → format client ══ KONTRAK deserialize ══
    // TowerDataModel.deserialize: _enemyInfo ada → TowerEnemyEventItem;
    // _reward ada → TowerBoxEventItem; selainnya → TowerEventItem.
    // TOWER_EVENT_TYPE: NULL=0, ENEMY=1, BOX=2, TIMES=3.
    function buildEnemyInfo(en) {
        // KarinUserItem.deserialize: _teams raw-copy, _superSkill array, sisanya common
        return {
            _id: en.id, _nickName: en.nickName, _headImage: en.headImage,
            _level: en.level, _serverId: 0, _oriServerId: 0, _guildName: '',
            _teams: en.teams, _superSkill: en.superSkill || [],
            _totalPower: en.totalPower, _grade: en.grade
        };
    }
    function serializeEvents(events) {
        var out = [];
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            var o = { _id: e.id, _type: e.type, _time: e.time };
            if (e.type === 1) {
                o._battleFail = !!e.battleFail;
                o._enemyInfo = buildEnemyInfo(e.enemy);
            } else if (e.type === 2) {
                o._reward = { _id: e.reward.id, _num: e.reward.num };
            }
            out.push(o);
        }
        return out;
    }

    // ── Response builder — KONTRAK setKarinTowerModelData: {_tower, _selfRank?} ──
    // TowerDataModel fields: {_feetTimes, _feetStartRecover, _grade, _events}
    function towerResponse(sd, extra) {
        var t = sd.tower;
        var r = {
            _tower: {
                _feetTimes: sd.timesInfo.karinFeet,
                _feetStartRecover: sd.timesInfo.karinFeetRecover,
                _grade: t.grade,
                _events: serializeEvents(t.events)
            }
        };
        if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) r[k] = extra[k];
        return r;
    }

    // ── Mirror counters ke scheduleInfo (client AllRefreshCount baca saat enterGame) ──
    function syncKarinCounters(sd) {
        if (sd.scheduleInfo && sd.tower) {
            sd.scheduleInfo._karinBattleTimes = sd.tower.battleTimes;
            sd.scheduleInfo._karinBuyBattleTimesCount = sd.tower.buyBattleTimesCount;
            sd.scheduleInfo._karinBuyFeetCount = sd.tower.buyFeetCount;
        }
    }

    // ── Event id unik ──
    function genEventId() {
        return 'ev' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
    }

    // ── Validasi dasar bersama ──
    function basicValidate(request, action) {
        var userId = request && request.userId;
        if (!userId || (typeof userId !== 'string' && typeof userId !== 'number')) {
            log.warn('TOWER', action + ' — missing/invalid userId');
            return null;
        }
        var sd = db._get('user:' + userId);
        if (!sd) {
            log.warn('TOWER', action + ' — no savedData for userId=' + userId);
            return null;
        }
        ensureTower(sd);
        recoverFeet(sd);
        return { userId: userId, sd: sd };
    }

    // ═════════════════════════ HELPER BLOCKS ═════════════════════════


    // ═══ MAIN HANDLER — tower/openBox ═══
    function handleTowerOpenBox(request, callback) {
        var _t0 = Date.now();
        console.groupCollapsed('%c🗼 TOWER openBox', 'color:#00695C;font-weight:bold;font-size:12px;background:#E0F2F1;padding:4px 8px;border-radius:6px;border-left:4px solid #00695C;');
        log.info('TOWER', 'tower/openBox userId=' + (request && request.userId) +
            ' eventId=' + (request && request.eventId));

        var ctx = basicValidate(request, 'openBox');
        if (!ctx) {
            console.warn('   ❌ validasi gagal (userId / savedData)');
            console.groupEnd();
            callback({}, 1);
            return;
        }
        try {
            var sd = ctx.sd;
            var eventId = String(request.eventId || '');
            var idx = -1, ev = null;
            for (var i = 0; i < sd.tower.events.length; i++) {
                if (String(sd.tower.events[i].id) === eventId && sd.tower.events[i].type === 2) {
                    idx = i; ev = sd.tower.events[i]; break;
                }
            }
            if (!ev) {
                console.warn('   ❌ box event tidak ditemukan: ' + eventId);
                console.groupEnd();
                log.warn('TOWER', 'openBox — box event not found: ' + eventId);
                callback({}, 1);
                return;
            }

            // Grant reward box → _changeInfo._items (ABSOLUTE balance)
            var changeItems = {};
            grantReward(sd, changeItems, Number(ev.reward.id), Number(ev.reward.num));

            sd.tower.events.splice(idx, 1);
            syncKarinCounters(sd);
            db._set('user:' + ctx.userId, sd);

            console.log('   ✅ box dibuka: item ' + ev.reward.id + ' +' + ev.reward.num +
                ' sisa events=' + sd.tower.events.length);
            console.groupEnd();
            log.details('TOWER', [['openBox', 'eventId=' + eventId],
                ['reward', ev.reward.id + ' x' + ev.reward.num],
                ['elapsed', (Date.now() - _t0) + 'ms']]);

            var resp = towerResponse(sd, { _changeInfo: { _items: changeItems } });
            callback(resp);
        } catch (err) {
            console.error('   ❌ UNCAUGHT: ' + err.message);
            console.groupEnd();
            log.error('TOWER', 'openBox error: ' + err.message);
            callback({}, 99);
        }
    }


    // ═══════════════════════════════════════════════════════════
    //  REGISTER HANDLER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('tower', 'openBox', handleTowerOpenBox);

    window.MainServer = MainServer;
})();
