/**
 * handlers/tower/startBattle.js — Karin Tower Start Battle vs musuh menara
 * Super Warrior Z — MAIN SERVER (Task 22b — tower audit)
 *
 * ============================================================
 *  KONTRAK main.min.js (evidence verbatim — PATEN):
 * ============================================================
 *  [REQUEST] pos 2173644 — BattleCallBack.jialintaBattle:
 *    guard client @4692578: AllRefreshCount.karinBattleTimes<=0 → block.
 *    ts.processHandler({type:"tower",action:"startBattle",userId,eventId:n,
 *      team:e,"super":t,version:"1.0",battleField:KARINTOWER},cb)
 *
 *  [RESPONSE CONSUMER] pos 2173400-2173600:
 *    p → setKarinTowerModelData(p)        (refresh event list)
 *    r = p._rightTeam                     (tim musuh utk battle render)
 *    i = p._rightSuper                    (super musuh)
 *    d = p._battleResult; 0!=d → setEnemyBattleFailTrue(eventId)
 *    UserInfoSingleton.battleId = p._battleId
 *    battle render pakai p._rand (seed array 100 float)
 *    CLIENT-SIDE: AllRefreshCount.karinBattleTimes -= 1
 *
 *  [GRADE GAIN] successLayerUp @4724775:
 *    enemy.grade > my → karinTowerBeatHighClimb(7); == → BeatSame(5); < → BeatLow(5)
 *
 *  [BYPASS WIN] Konvensi arena/startBattle v4: hasil diputuskan server SEBELUM
 *    animasi; simulasi server sederhana ≠ engine Egret → _battleResult = 0 (WIN).
 *
 *  [ROBOT] robotPlayer.json type="karin" (id 5301+): enemyList/enemyLevel/
 *    difficultyHp/difficultyAttack → buildBattleHeroEntry (copy pola arena).

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


    // ═══ BUILD BATTLE HERO ENTRY (_rightTeam) ═══
    // Copy verbatim pola arena/startBattle.js buildBattleHeroEntry (sudah tervalidasi):
    //   hero.json + heroLevelAttr.json → _attrs._items (42 attr) + _skills
    //   Robot: star 0, tanpa equip, tanpa passive, skill level 1
    function buildBattleHeroEntry(heroDisplayId, heroLevel, difficultyHp, difficultyAttack) {
        heroDisplayId = Number(heroDisplayId) || 0;
        if (heroDisplayId <= 0) return null;
        heroLevel = Number(heroLevel) || 1;

        var hc = loadJson('hero');
        var heroData = hc ? hc[String(heroDisplayId)] : null;
        if (!heroData) {
            log.warn('TOWER', 'heroDisplayId ' + heroDisplayId + ' not in hero.json');
            return null;
        }

        var star = 0;   // robot polos — sama arena

        var levelAttrCfg = loadJson('heroLevelAttr');
        var lvlData = levelAttrCfg ? levelAttrCfg[String(heroLevel)] : null;
        if (!lvlData) {
            lvlData = (levelAttrCfg ? levelAttrCfg['1'] : null) || { hp: 1240, attack: 125, armor: 205 };
        }

        var laHp = Number(lvlData.hp) || 1240;
        var laAttack = Number(lvlData.attack) || 125;
        var laArmor = Number(lvlData.armor) || 205;

        var heroType = heroData.heroType || heroData.type || 'strength';
        var typeCategory;
        if (heroType === 'critical' || heroType === 'criticalSingle' || heroType === 'hit') {
            typeCategory = 'ATK';
        } else if (heroType === 'body' || heroType === 'block' || heroType === 'dodge' ||
                   heroType === 'armor' || heroType === 'armorS' || heroType === 'bodyDamage') {
            typeCategory = 'TANK';
        } else {
            typeCategory = 'SKL';
        }

        var hpBase;
        if (typeCategory === 'SKL') {
            hpBase = Math.floor(laHp / 2 - 240);
        } else if (typeCategory === 'ATK') {
            hpBase = Math.floor(laHp / 2 - 14 * heroLevel - 290);
        } else {
            hpBase = Math.floor(laHp / 2 + 412);
        }

        var atkBase;
        if (typeCategory === 'SKL') {
            atkBase = 13 * heroLevel + 47;
        } else if (typeCategory === 'ATK') {
            atkBase = Math.round(12.25 * heroLevel + 51);
        } else {
            atkBase = Math.round(9 * heroLevel + 1);
        }

        difficultyHp = Number(difficultyHp) || 1;
        difficultyAttack = Number(difficultyAttack) || 1;

        var finalHp = hpBase * difficultyHp;
        var finalAtk = atkBase * difficultyAttack;
        var finalArmor = laArmor - 21;

        var speed = Number(heroData.speed) || 180;
        var energyMax = Number(heroData.energyMax) || 100;
        var hit, crit, critDmg, dodge, block, blockEffect, critResist;
        var armorBreak = 0, damageReduce = 0, trueDamage = 0;
        var superDamage = 0, healPlus = 0, healerPlus = 0, shielderPlus = 0;
        var damageUp = 0, damageDown = 0;
        var superDamageResist = 0, criticalDamageResist = 0, blockThrough = 0;

        if (typeCategory === 'SKL') {
            hit = heroLevel / 14000;
            crit = hit * 2.5;
            critDmg = crit * 1.5;
            dodge = 0; block = 0; blockEffect = 0; critResist = 0;
        } else if (typeCategory === 'ATK') {
            hit = heroLevel / 2000;
            crit = hit * 0.5;
            critDmg = 0.3;
            dodge = 0; block = 0; blockEffect = 0; critResist = 0;
        } else {
            hit = heroLevel / 3043;
            crit = hit * 0.5;
            critDmg = hit;
            dodge = heroLevel / 2500;
            block = heroLevel / 8000;
            blockEffect = 0;
            critResist = heroLevel / 6667;
        }

        var balancePower = Number(heroData.balancePower) || 1;
        var ATK_WEIGHTS = {
            'critical': 20, 'criticalSingle': 20, 'hit': 20,
            'skill': 15, 'body': 15, 'block': 15, 'armor': 15,
            'armorDamage': 15, 'armorS': 15, 'bodyDamage': 15,
            'dodge': 15, 'strength': 15, 'dot': 15
        };
        var atkWeight = ATK_WEIGHTS[heroType] || 15;
        var power = Math.floor(finalHp * balancePower + finalAtk * atkWeight + finalArmor);

        var skills = {};
        if (heroData.normal) {
            var nId = String(heroData.normal);
            skills[nId] = { _type: 0, _id: heroData.normal, _level: 1 };
        }
        if (heroData.skill) {
            var sId = String(heroData.skill);
            skills[sId] = { _type: 1, _id: heroData.skill, _level: 1 };
        }

        var items = {};
        items['0']  = { _id: 0,  _num: finalHp };
        items['1']  = { _id: 1,  _num: finalAtk };
        items['2']  = { _id: 2,  _num: finalArmor };
        items['3']  = { _id: 3,  _num: speed };
        items['4']  = { _id: 4,  _num: hit };
        items['5']  = { _id: 5,  _num: dodge };
        items['6']  = { _id: 6,  _num: block };
        items['7']  = { _id: 7,  _num: blockEffect };
        items['8']  = { _id: 8,  _num: 0 };
        items['9']  = { _id: 9,  _num: crit };
        items['10'] = { _id: 10, _num: critResist };
        items['11'] = { _id: 11, _num: critDmg };
        items['12'] = { _id: 12, _num: armorBreak };
        items['13'] = { _id: 13, _num: damageReduce };
        items['14'] = { _id: 14, _num: 0 };
        items['15'] = { _id: 15, _num: trueDamage };
        items['16'] = { _id: 16, _num: 50 };
        items['21'] = { _id: 21, _num: power };
        items['22'] = { _id: 22, _num: finalHp };
        items['23'] = { _id: 23, _num: superDamage };
        items['24'] = { _id: 24, _num: healPlus };
        items['25'] = { _id: 25, _num: healerPlus };
        items['26'] = { _id: 26, _num: 0 };
        items['28'] = { _id: 28, _num: damageUp };
        items['29'] = { _id: 29, _num: damageDown };
        items['31'] = { _id: 31, _num: superDamageResist };
        items['36'] = { _id: 36, _num: criticalDamageResist };
        items['37'] = { _id: 37, _num: blockThrough };
        items['41'] = { _id: 41, _num: energyMax };

        return {
            _heroDisplayId: heroDisplayId,
            _heroLevel: heroLevel,
            _heroStar: star,
            _skinId: 0,
            _weaponHaloId: 0,
            _weaponHaloLevel: 0,
            _skills: skills,
            _attrs: { _items: items }
        };
    }

    function generateRandArray(count) {
        var arr = [];
        for (var i = 0; i < count; i++) {
            arr.push(Math.round(1E5 * Math.random()) / 1E5);
        }
        return arr;
    }

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }


    // ═══ MAIN HANDLER — tower/startBattle ═══
    function handleTowerStartBattle(request, callback) {
        var _t0 = Date.now();
        console.groupCollapsed('%c🗼 TOWER startBattle', 'color:#00695C;font-weight:bold;font-size:12px;background:#E0F2F1;padding:4px 8px;border-radius:6px;border-left:4px solid #00695C;');
        log.info('TOWER', 'tower/startBattle userId=' + (request && request.userId) +
            ' eventId=' + (request && request.eventId) +
            ' battleField=' + (request && request.battleField));

        var ctx = basicValidate(request, 'startBattle');
        if (!ctx) {
            console.warn('   ❌ validasi gagal (userId / savedData)');
            console.groupEnd();
            callback({}, 1);
            return;
        }
        try {
            var sd = ctx.sd;
            var K = KC();
            var eventId = String(request.eventId || '');
            var idx = -1, ev = null;
            for (var i = 0; i < sd.tower.events.length; i++) {
                if (String(sd.tower.events[i].id) === eventId && sd.tower.events[i].type === 1) {
                    idx = i; ev = sd.tower.events[i]; break;
                }
            }
            if (!ev) {
                console.warn('   ❌ enemy event tidak ditemukan: ' + eventId);
                console.groupEnd();
                log.warn('TOWER', 'startBattle — enemy event not found: ' + eventId);
                callback({}, 1);
                return;
            }

            // Client guard @4692578: karinBattleTimes<=0 → block. Mirror server-side.
            if (sd.tower.battleTimes <= 0) {
                console.warn('   ❌ battleTimes habis');
                console.groupEnd();
                log.warn('TOWER', 'startBattle — battleTimes exhausted for userId=' + ctx.userId);
                callback({}, 1);
                return;
            }
            sd.tower.battleTimes -= 1;

            // ── BUILD _rightTeam dari robot (kontrak jialintaBattle) ──
            var robot = null;
            var rp = loadJson('robotPlayer');
            if (rp && ev.enemy && ev.enemy.id) robot = rp[String(ev.enemy.id)];
            var rightTeam = {};
            var heroCount = 0;
            if (robot) {
                var heroIds = String(robot.enemyList).split(',');
                var heroLevels = String(robot.enemyLevel).split(',');
                var diffHp = String(robot.difficultyHp).split(',');
                var diffAtk = String(robot.difficultyAttack).split(',');
                for (var h = 0; h < heroIds.length; h++) {
                    var entry = buildBattleHeroEntry(
                        Number(heroIds[h]), Number(heroLevels[h]),
                        Number(diffHp[h]), Number(diffAtk[h]));
                    if (entry) { rightTeam[String(h)] = entry; heroCount++; }
                }
            }
            if (heroCount === 0) {
                // Fallback: rebuild dari data teams tersimpan (level saja, difficulty 1)
                var teams = (ev.enemy && ev.enemy.teams) || {};
                for (var tk in teams) {
                    if (teams.hasOwnProperty(tk)) {
                        var te = teams[tk];
                        var e2 = buildBattleHeroEntry(te._heroDisplayId, te._heroLevel, 1, 1);
                        if (e2) { rightTeam[tk] = e2; heroCount++; }
                    }
                }
            }

            // ── BYPASS WIN (konvensi arena/startBattle v4) ──
            // Server pre-decide hasil SEBELUM animasi (client L...: _battleResult dipakai
            // sebelum battle render); simulasi server sederhana ≠ engine Egret → WIN.
            var battleResult = 0;

            // Grade naik sesuai perbandingan (KONTRAK successLayerUp @4724775):
            //   enemy.grade > my → BeatHigh(7); == → BeatSame(5); < → BeatLow(5)
            var oldGrade = sd.tower.grade;
            var enemyGrade = (ev.enemy && Number(ev.enemy.grade)) || 0;
            var gain = (enemyGrade > oldGrade) ? K.BEAT_HIGH
                     : (enemyGrade === oldGrade) ? K.BEAT_SAME : K.BEAT_LOW;
            sd.tower.grade = oldGrade + gain;

            // Musuh kalah → event dihapus; peluang drop event baru
            sd.tower.events.splice(idx, 1);
            if (Math.random() < K.WIN_CHEST) addBoxEvent(sd);     // karinTowerWinGainChest=0.3
            if (Math.random() < K.WIN_TIMES) addTimesEvent(sd);   // karinTowerWinGainBattleTimes=0.2
            ensureEnemyEvent(sd);

            var rank = buildRankList(sd, ctx.userId);
            syncKarinCounters(sd);
            db._set('user:' + ctx.userId, sd);

            var randArray = generateRandArray(100);
            var battleId = generateUUID();

            console.log('   ✅ WIN — grade ' + oldGrade + ' → ' + sd.tower.grade +
                ' (+' + gain + ') battleTimes=' + sd.tower.battleTimes +
                ' enemyHeroes=' + heroCount + ' battleId=' + battleId);
            console.groupEnd();
            log.details('TOWER', [['startBattle', 'eventId=' + eventId],
                ['robot', ev.enemy ? ev.enemy.id : '?'],
                ['grade', oldGrade + '→' + sd.tower.grade + ' (+' + gain + ')'],
                ['battleTimes', String(sd.tower.battleTimes)],
                ['elapsed', (Date.now() - _t0) + 'ms']]);

            // KONTRAK jialintaBattle: _tower, _rightTeam, _rightSuper, _battleResult,
            // _battleId, _rand + opsional _selfRank
            callback(towerResponse(sd, {
                _rightTeam: rightTeam,
                _rightSuper: [],
                _battleResult: battleResult,
                _battleId: battleId,
                _rand: randArray,
                _selfRank: rank.selfRank
            }));
        } catch (err) {
            console.error('   ❌ UNCAUGHT: ' + err.message);
            console.groupEnd();
            log.error('TOWER', 'startBattle error: ' + err.message);
            callback({}, 99);
        }
    }


    // ═══════════════════════════════════════════════════════════
    //  REGISTER HANDLER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('tower', 'startBattle', handleTowerStartBattle);

    window.MainServer = MainServer;
})();
