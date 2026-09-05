/**
 * handlers/tower/getLocalRank.js — Karin Tower Rank server sendiri
 * Super Warrior Z — MAIN SERVER (Task 22b — tower audit)
 *
 * ============================================================
 *  KONTRAK main.min.js (evidence verbatim — PATEN):
 * ============================================================
 *  [REQUEST] pos 4719562 — JialintaRankPage.getRankData:
 *    ts.processHandler({type:"tower",action:"getLocalRank",userId:n,count:100,version:"1.0"},cb)
 *
 *  [RESPONSE CONSUMER] updateSelfServerRankList (pos 4727361):
 *    e._rank[] → new TowerRankItem; r.deserialize(n[a])
 *
 *  [ITEM FORMAT] TowerRankItem.deserialize (pos 3128321):
 *    this.isCommonType(n) && (this[t] = n)  →  KEY TANPA UNDERSCORE:
 *    {userId, headImage, nickName, grade, level}

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

    // ═══ ENEMY POOL & EVENT GENERATION (server discretion — konstanta config) ═══
    // robotPlayer.json type="karin" — 78 robot resmi Karin Tower (level 20–100)

    function karinRobots() {
        var rp = loadJson('robotPlayer');
        var out = [];
        if (rp) for (var k in rp) {
            if (rp.hasOwnProperty(k) && rp[k] && rp[k].type === 'karin') out.push(rp[k]);
        }
        return out;
    }

    function heroName(heroId) {
        var h = loadJson('hero');
        var d = h ? h[String(heroId)] : null;
        return (d && d.name) ? d.name : ('hero_' + heroId);
    }

    // Power ringkas (zPowerFormula A/B/D, para star-0 = 0.2) — untuk _totalPower display
    function heroPower(level) {
        var c = loadJson('constant');
        var r = (c && c['1']) ? c['1'] : {};
        var A = Number(r.zPowerFormulaParaA) || 100;
        var B = Number(r.zPowerFormulaParaB) || 5;
        var D = Number(r.zPowerFormulaParaD) || 35;
        var exponent = 1 + Math.ceil(level / 10) / D;
        return Math.floor((A + level * Math.pow(B, exponent)) * 0.2);
    }

    // KarinUserItem dari robot: teams KONTRAK client UI
    //   (L4690783: s._heroDisplayId, s._heroLevel, s._heroStar, s._skinId)
    function buildEnemyFromRobot(robot, myGrade) {
        var heroIds = String(robot.enemyList || '').split(',');
        var heroLevels = String(robot.enemyLevel || '').split(',');
        var teams = {};
        var totalPower = 0;
        for (var i = 0; i < heroIds.length; i++) {
            var hid = Number(heroIds[i]) || 0;
            if (hid <= 0) continue;
            var lvl = Number(heroLevels[i]) || 1;
            teams[String(i)] = {
                _heroDisplayId: hid,
                _heroLevel: lvl,
                _heroStar: 0,
                _skinId: 0
            };
            totalPower += heroPower(lvl);
        }
        var first = Number(heroIds[0]) || 1205;
        // Grade musuh disebar di sekitar grade player — BeatHigh(7)/Same(5)/Low(5) semua mungkin
        var spread = [-10, -5, 0, 5, 10];
        var grade = Math.max(0, (myGrade || 0) + spread[Math.floor(Math.random() * spread.length)]);
        return {
            id: String(robot.id),
            nickName: heroName(first),
            headImage: 'hero_icon_' + first,
            level: Number(robot.userLevel) || 20,
            teams: teams,
            superSkill: [],
            totalPower: totalPower,
            grade: grade
        };
    }

    function pickRobot(playerLevel) {
        var pool = karinRobots();
        if (!pool.length) return null;
        var fit = [];
        for (var i = 0; i < pool.length; i++) {
            if (Number(pool[i].userLevel) <= Math.max(playerLevel, 20)) fit.push(pool[i]);
        }
        if (!fit.length) fit = pool;
        fit.sort(function (a, b) {
            return Math.abs(a.userLevel - playerLevel) - Math.abs(b.userLevel - playerLevel);
        });
        var top = fit.slice(0, Math.min(10, fit.length));
        return top[Math.floor(Math.random() * top.length)];
    }

    // Hapus enemy event kadaluarsa (karinTowerEnemyExistTime = 1800 detik)
    function expireEnemies(sd) {
        var K = KC();
        var now = Date.now();
        var t = sd.tower;
        var keep = [];
        for (var i = 0; i < t.events.length; i++) {
            var e = t.events[i];
            if (e.type === 1 && (now - e.time) > K.ENEMY_EXIST * 1000) continue;
            keep.push(e);
        }
        t.events = keep;
    }

    // UI hanya menampilkan 2 musuh (getTowerFristEnemyEvents / getTowerSecondEnemyEvents)
    function ensureEnemyEvent(sd) {
        var t = sd.tower;
        var n = 0;
        for (var i = 0; i < t.events.length; i++) {
            if (t.events[i].type === 1) n++;
        }
        if (n >= 2) return;
        var robot = pickRobot(getPlayerLevel(sd));
        if (!robot) return;
        t.events.push({
            id: genEventId(), type: 1, time: Date.now(),
            battleFail: false,
            enemy: buildEnemyFromRobot(robot, t.grade)
        });
    }

    // Box event — reward dari karinTowerChest.json (satu-satunya tabel chest)
    function addBoxEvent(sd) {
        var ch = loadJson('karinTowerChest');
        var row = ch ? ch['1'] : null;
        if (!row) return;
        sd.tower.events.push({
            id: genEventId(), type: 2, time: Date.now(),
            reward: { id: Number(row.chestID1) || 134, num: Number(row.num1) || 20 }
        });
    }

    function addTimesEvent(sd) {
        sd.tower.events.push({ id: genEventId(), type: 3, time: Date.now() });
    }


    // ═══ RANK ═══ KONTRAK TowerRankItem.deserialize (pos 3128321):
    //   this.isCommonType(n) && (this[t] = n)  →  key TANPA underscore!
    //   {userId, headImage, nickName, grade, level}
    // Response: e._rank → updateSelfServerRankList / updateAllServerRankList

    function getTodayStr() {
        var d = new Date();
        var yyyy = d.getUTCFullYear();
        var mm = String(d.getUTCMonth() + 1);
        var dd = String(d.getUTCDate());
        if (mm.length < 2) mm = '0' + mm;
        if (dd.length < 2) dd = '0' + dd;
        return yyyy + '-' + mm + '-' + dd;
    }

    function hashStr(s) {
        var h = 2166136261;
        for (var i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h * 16777619) >>> 0;
        }
        return h >>> 0;
    }

    // ═══ SETTLE SIKLUS 24 JAM (Task 23 — override user fase "permulaan") ═══
    // Model asli main.min.js: Karin Tower = season — reset + reward rank tiap 2 hari.
    // Client hanya PREVIEW reward (JialintaRankAwardViewData @4726361 dari
    // karinTowerReward.json); distribusi = server-side. Override permulaan:
    // siklus 24 jam → saat tanggal berganti (boundary getTodayStr, UTC):
    //   1. rank self dihitung dari cache siklus lama + grade terakhir yang diraih
    //   2. reward = baris karinTowerReward.json (rankStart..rankEnd) → masuk bag
    //   3. menara direset untuk siklus baru: grade 0, events bersih
    function settleKarinCycle(sd, userId) {
        var tw = sd.tower;
        var prev = tw.rankCache;
        var all = prev.robots.slice();
        all.push({ userId: String(userId), grade: tw.grade || 0 });
        all.sort(function (a, b) { return b.grade - a.grade; });
        var selfRank = 1;
        for (var i = 0; i < all.length; i++) {
            if (String(all[i].userId) === String(userId)) { selfRank = i + 1; break; }
        }
        var rw = loadJson('karinTowerReward');
        var row = null;
        if (rw) for (var k in rw) {
            if (!rw.hasOwnProperty(k)) continue;
            var r = rw[k];
            if (selfRank >= Number(r.rankStart) && selfRank <= Number(r.rankEnd)) { row = r; break; }
        }
        var items = [];
        if (row) {
            for (var n = 1; n <= 3; n++) {
                var iid = Number(row['RankAward' + n]) || 0;
                var inum = Number(row['num' + n]) || 0;
                if (iid > 0 && inum > 0) {
                    grantReward(sd, {}, iid, inum);
                    items.push({ id: iid, num: inum });
                }
            }
        }
        tw.grade = 0;
        tw.events = [];
        tw.lastRankReward = { date: prev.date, rank: selfRank, items: items, time: Date.now() };
        log.info('TOWER', 'karin cycle settle — siklus=' + prev.date +
            ' rank=' + selfRank + ' reward=' + JSON.stringify(items) +
            ' → grade reset 0, events dibersihkan');
    }

    // Cache harian: 15 robot karin, grade deterministik di sekitar grade player
    function ensureRankCache(sd, userId) {
        var tw = sd.tower;
        var today = getTodayStr();
        if (tw.rankCache && tw.rankCache.date === today &&
            tw.rankCache.robots && tw.rankCache.robots.length) {
            return tw.rankCache;
        }
        // Siklus 24 jam (Task 23): tanggal berganti → settle reward rank siklus lama
        // (karinTowerReward.json) + reset menara (grade 0, events bersih) → cache baru.
        if (tw.rankCache && tw.rankCache.date !== today &&
            tw.rankCache.robots && tw.rankCache.robots.length) {
            settleKarinCycle(sd, userId);
        }
        var pool = karinRobots();
        var pl = getPlayerLevel(sd);
        var fit = [];
        for (var i = 0; i < pool.length; i++) {
            if (Number(pool[i].userLevel) <= Math.max(pl, 20)) fit.push(pool[i]);
        }
        if (fit.length < 15) fit = pool;
        fit.sort(function (a, b) {
            return Math.abs(a.userLevel - pl) - Math.abs(b.userLevel - pl);
        });
        fit = fit.slice(0, 30);
        var seed = hashStr(String(userId) + '|' + today);
        function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
        var picks = [];
        var copy = fit.slice();
        while (picks.length < 15 && copy.length) {
            picks.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
        }
        var robots = [];
        for (var j = 0; j < picks.length; j++) {
            var rb = picks[j];
            var first = Number(String(rb.enemyList).split(',')[0]) || 1205;
            var gOff = Math.floor(rnd() * 80) - 30;   // grade player -30 .. +49
            robots.push({
                userId: String(rb.id),
                headImage: 'hero_icon_' + first,
                nickName: heroName(first),
                grade: Math.max(0, (tw.grade || 0) + gOff),
                level: Number(rb.userLevel) || 20
            });
        }
        tw.rankCache = { date: today, robots: robots };
        return tw.rankCache;
    }

    // _rank + posisi self (1-based). SELF item ikut kontrak TowerRankItem.
    function buildRankList(sd, userId) {
        var tw = sd.tower;
        var cache = ensureRankCache(sd, userId);
        var self = {
            userId: String(userId),
            headImage: (sd.user && sd.user._headImage) ? sd.user._headImage : 'hero_icon_1205',
            nickName: (sd.user && sd.user._nickName) ? sd.user._nickName : 'Player',
            grade: tw.grade || 0,
            level: getPlayerLevel(sd)
        };
        var all = cache.robots.concat([self]);
        all.sort(function (a, b) { return b.grade - a.grade; });
        var selfRank = 1;
        for (var i = 0; i < all.length; i++) {
            if (all[i].userId === String(userId)) { selfRank = i + 1; break; }
        }
        return { list: all, selfRank: selfRank };
    }


    // ═══ MAIN HANDLER — tower/getLocalRank ═══
    function handleTowerGetLocalRank(request, callback) {
        var _t0 = Date.now();
        console.groupCollapsed('%c🗼 TOWER getLocalRank', 'color:#00695C;font-weight:bold;font-size:12px;background:#E0F2F1;padding:4px 8px;border-radius:6px;border-left:4px solid #00695C;');
        log.info('TOWER', 'tower/getLocalRank userId=' + (request && request.userId));

        var ctx = basicValidate(request, 'getLocalRank');
        if (!ctx) {
            console.warn('   ❌ validasi gagal (userId / savedData)');
            console.groupEnd();
            callback({}, 1);
            return;
        }
        try {
            var sd = ctx.sd;
            var count = Math.max(1, Number(request.count) || 100);
            var rank = buildRankList(sd, ctx.userId);
            var slice = rank.list.slice(0, count);
            db._set('user:' + ctx.userId, sd);   // persist rankCache harian bila baru dibuat

            console.log('   ✅ _rank=' + slice.length + ' item (selfRank=' + rank.selfRank + ')');
            console.groupEnd();
            log.details('TOWER', [['getLocalRank', 'userId=' + ctx.userId],
                ['count', String(slice.length)],
                ['selfRank', String(rank.selfRank)],
                ['elapsed', (Date.now() - _t0) + 'ms']]);

            // KONTRAK updateSelfServerRankList: e._rank → TowerRankItem.deserialize
            // (key TANPA underscore: userId, headImage, nickName, grade, level)
            callback({ _rank: slice });
        } catch (err) {
            console.error('   ❌ UNCAUGHT: ' + err.message);
            console.groupEnd();
            log.error('TOWER', 'getLocalRank error: ' + err.message);
            callback({}, 99);
        }
    }


    // ═══════════════════════════════════════════════════════════
    //  REGISTER HANDLER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('tower', 'getLocalRank', handleTowerGetLocalRank);

    window.MainServer = MainServer;
})();
