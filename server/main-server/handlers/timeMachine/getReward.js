/**
 * handlers/timeMachine/getReward.js — Time Machine COLLECT Reward Handler (AUDIT v2)
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 *  TUGAS & TANGGUNG JAWAB FILE INI:
 * ============================================================
 *
 *  Handler ini menangani KLAIM reward COLLECT setelah time travel
 *  selesai DAN boss battle dimenangkan (checkBattleResult WIN).
 *  Sebelumnya handler ini TIDAK ADA → machine Complete tidak bisa
 *  diklaim selamanya (ret error → modal gagal) dan reward akhir
 *  (piece hero sendiri + award1-4) tak pernah diberikan.
 *
 *  TUGAS UTAMA:
 *    1. VALIDASI request (userId, machineId) — TANPA field version
 *    2. LOAD slot → gate checkFinish (serverTime >= finishTime)
 *    3. RESOLVE piece hero sendiri:
 *         pieceId   = heroPiece[].belongTo == _heroDisplayId → .id
 *                     (ToolCommon.getPieceIdWithHeroId @1745970)
 *         heroColor = colorToHeroColor(hero.json[_heroDisplayId].quality)
 *         count     = weighted roll timeTravelHeroSelf[heroSelfKey]
 *                     filter quality == heroColor (getMachineByType @5533924)
 *       → inilah "masuk time machine goku → reward goku":
 *         piece yang diberikan adalah piece MILIK HERO yang dikirim,
 *         BUKAN piece lain (cell) atau random.
 *    4. RESOLVE award1-4: timeTravel[level].awardN → timeTravelAward
 *         object → {goodsID1, num1} langsung
 *         array  → weighted roll {goodsID1, num1, random}
 *         (getMachineReward @5544030 — preview COLLECT)
 *    5. UPDATE totalProps._items ABSOLUTE + db._set
 *    6. NULL-kan slot (setMachineEmpty — persist di server; client
 *       hanya setMachineEmpty in-memory @5542568)
 *    7. RESPONSE: { _changeInfo: { _items: { itemId: {_id, _num ABS} } } }
 *       → openCongratulationObtain butuh _changeInfo._items ABSOLUTE
 *         (@1947345 — tanpa itu → "没有任何东西")
 *
 *  TUGAS YANG BUKAN MILIK FILE INI:
 *    - Start time travel (itu tugas timeMachine/start)
 *    - Boss battle start (itu tugas timeMachine/startBoss)
 *    - Boss battle reward (itu tugas timeMachine/checkBattleResult →
 *      timeTravelBOSSReward — BUKAN award1-4)
 *    - Daily task timeTravelEnd 6122 (di checkBattleResult WIN)
 *
 * ============================================================
 *  TRACE EVIDENCE (main.min.js):
 * ============================================================
 *
 *  CLIENT REQUEST — @5542568 (TimeLeapMain.getRewardRequest):
 *    ts.processHandler({type:"timeMachine", action:"getReward",
 *      userId: UserInfoSingleton.getInstance().userId, machineId: e},
 *      function(o){
 *        UIWindowManager.openCongratulationObtain(o),
 *        TimeLeapSingleton.getInstance().setMachineEmpty(e),
 *        n.createEffect(), n.setTimeMachine(),
 *        n.setChooseState(t, TimeLeapState.Complete)
 *      })
 *    → TIDAK ADA field version. Response HANYA dibaca oleh
 *      openCongratulationObtain → wajib _changeInfo._items ABSOLUTE.
 *
 *  getMachineReward (preview COLLECT — @5544030, TimeLeapMainViewData):
 *    var n = currentState[e].level, o = timeTravel[n],
 *        a = timeTravelAward;
 *    t.push(ToolCommon.getPieceIdWithHeroId(currentState[e].heroDisplayId));
 *    for(var r=1; 6>r; r++){
 *      var i = "award"+r; if(!o[i]) break;
 *      var s = o[i];
 *      Array.isArray(a[s]) ? t.push(a[s][0].goodsID1) : t.push(a[s].goodsID1)
 *    }
 *    → Reward COLLECT = [piece(heroDisplayId)] + award1..4.
 *
 *  getPieceIdWithHeroId (@1745970, ToolCommon):
 *    var t = heroPiece; for(var n in t) if(t[n].belongTo==e) return t[n].id
 *    → heroPiece.json: belongTo == heroDisplayId → id piece.
 *      Contoh: Goku displayId 1319 → piece 2319 (孙悟空).
 *
 *  getMachineByType (roll count piece — @5533924, TimeLeapChooseAdressViewData):
 *    var o = timeTravelHeroSelf, a = HerosManager.getHero(heroId),
 *        r = getPieceIdWithHeroId(a.heroDisplayId),
 *        u = a.heroQuality;
 *    l = heroSelf6h / heroSelf12h / heroSelf24h  (per timeType)
 *    c = o[l];
 *    if(Array.isArray(c)) for(p=0;p<c.length;p++){
 *      var d = c[p].quality;
 *      if(u == getHeroColorWithString(d)){
 *        var g = c[p].num; g>s&&(s=g), i>g&&(i=g)
 *      }
 *    }
 *    return {id:r, minCount:i, maxCount:s}
 *    → Filter quality EXACT match (u == colorOf(d)), lalu rentang num.
 *      timeTravelHeroSelf[key] = [{quality, num, random}, ...]
 *      → AKTUAL: weighted roll by "random" di antara entry yang
 *        lolos filter; winner.num = jumlah piece.
 *
 *  HERO_COLOR / colorToHeroColor (@1501238 + HeroCommon):
 *    White=1, Green=2, Blue=3, Purple=4, Orange=5,
 *    flickerOrange→SilverOrange=6, superOrange→SuperOrange=7
 *    → heroQuality = colorToHeroColor(hero.json[displayId].quality)
 *      (pola deserialize client: o.heroQuality = colorToHeroColor(r.quality))
 *
 *  TIME_MACHINE_TIME_TYPE (@2107384): UNKNOWN=0, HOUR_6=1, HOUR_12=2, HOUR_24=3
 *
 *  timeTravel.json: heroSelf6h=3001, heroSelf12h=3101, heroSelf24h=3201,
 *  award1-4 per lesson; timeTravelTime.json {quality,can6h,can12h,can24h}
 *  = gate pilihan durasi per warna hero (client-gated, bukan tugas server).
 *
 * ============================================================
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    // ── Config ──

    var TIME_MACHINE_TIME_TYPE = {
        UNKNOWN: 0,
        HOUR_6: 1,
        HOUR_12: 2,
        HOUR_24: 3
    };

    // colorToHeroColor (HeroCommon) — mapping paten string config → enum
    var HERO_COLOR = {
        White: 1, Green: 2, Blue: 3, Purple: 4,
        Orange: 5, SilverOrange: 6, SuperOrange: 7
    };

    function colorToHeroColor(str) {
        switch (String(str)) {
            case 'white':         return HERO_COLOR.White;
            case 'green':         return HERO_COLOR.Green;
            case 'blue':          return HERO_COLOR.Blue;
            case 'purple':        return HERO_COLOR.Purple;
            case 'orange':        return HERO_COLOR.Orange;
            case 'flickerOrange': return HERO_COLOR.SilverOrange;
            case 'superOrange':   return HERO_COLOR.SuperOrange;
            default:              return HERO_COLOR.White;
        }
    }

    // ── Resource Loader (cached sync XHR — sama dengan start.js) ──

    var _resCache = {};

    function loadJson(name) {
        if (_resCache[name]) return _resCache[name];
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './resource/json/' + name + '.json', false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                var data = JSON.parse(xhr.responseText);
                _resCache[name] = data;
                return data;
            }
            log.warn('TM_GETREWARD', 'loadJson ' + name + ' HTTP ' + xhr.status);
        } catch (e) {
            log.error('TM_GETREWARD', 'loadJson ' + name + ' error: ' + e.message);
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  ITEM BALANCE HELPERS (pola paten checkBattleResult.js)
    // ═══════════════════════════════════════════════════════════

    function getItemBalance(savedData, itemId) {
        if (!savedData || !savedData.totalProps || !savedData.totalProps._items) return 0;
        var items = savedData.totalProps._items;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(itemId)) {
                return Number(items[i]._num) || 0;
            }
        }
        return 0;
    }

    function setItemBalance(savedData, itemId, newBalance) {
        if (!savedData.totalProps) {
            savedData.totalProps = { _items: [] };
        }
        if (!savedData.totalProps._items) {
            savedData.totalProps._items = [];
        }
        var items = savedData.totalProps._items;
        var found = false;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(itemId)) {
                items[i]._num = newBalance;
                found = true;
                break;
            }
        }
        if (!found) {
            items.push({ _id: Number(itemId), _num: newBalance });
        }
    }

    function addRewardItem(savedData, changeItems, itemId, amount) {
        if (!itemId || amount <= 0) return;
        itemId = Number(itemId);
        amount = Number(amount);

        var currentBalance = getItemBalance(savedData, itemId);
        var newBalance = currentBalance + amount;
        setItemBalance(savedData, itemId, newBalance);

        changeItems[String(itemId)] = {
            _id: itemId,
            _num: newBalance
        };

        log.details('TM_GETREWARD', [
            ['item', String(itemId)],
            ['amount', String(amount)],
            ['oldBalance', String(currentBalance)],
            ['newBalance', String(newBalance)]
        ]);
    }

    // ═══════════════════════════════════════════════════════════
    //  PIECE RESOLVER (kontrak getPieceIdWithHeroId @1745970)
    // ═══════════════════════════════════════════════════════════
    //
    //  heroPiece.json: for (n in heroPiece) if (belongTo == heroDisplayId) return id
    //

    function getPieceIdWithHeroId(heroDisplayId) {
        var heroPiece = loadJson('heroPiece');
        if (!heroPiece || !heroDisplayId) return 0;
        for (var k in heroPiece) {
            if (!heroPiece.hasOwnProperty(k)) continue;
            var entry = heroPiece[k];
            if (entry && Number(entry.belongTo) === Number(heroDisplayId)) {
                return Number(entry.id) || 0;
            }
        }
        return 0;
    }

    // ═══════════════════════════════════════════════════════════
    //  PIECE COUNT ROLL (kontrak getMachineByType @5533924)
    // ═══════════════════════════════════════════════════════════
    //
    //  timeTravelHeroSelf[heroSelfKey] = [{quality, num, random}, ...]
    //  filter: colorToHeroColor(entry.quality) === heroColor  (EXACT match)
    //  lalu WEIGHTED ROLL by "random" → winner.num
    //

    function rollPieceCount(heroSelfKey, heroColor) {
        var selfConfig = loadJson('timeTravelHeroSelf');
        if (!selfConfig) return 0;
        var entries = selfConfig[String(heroSelfKey)];
        if (!Array.isArray(entries)) return 0;

        var matched = [];
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e) continue;
            if (colorToHeroColor(e.quality) === heroColor) {
                matched.push(e);
            }
        }
        if (matched.length === 0) return 0;

        var totalWeight = 0;
        for (var j = 0; j < matched.length; j++) {
            totalWeight += Number(matched[j].random) || 0;
        }
        if (totalWeight <= 0) return 0;

        var roll = Math.random() * totalWeight;
        var cumulative = 0;
        for (var m = 0; m < matched.length; m++) {
            cumulative += Number(matched[m].random) || 0;
            if (roll < cumulative) {
                return Number(matched[m].num) || 0;
            }
        }
        return Number(matched[matched.length - 1].num) || 0;
    }

    // ═══════════════════════════════════════════════════════════
    //  AWARD RESOLVER (kontrak getMachineReward award1..4 @5544030)
    // ═══════════════════════════════════════════════════════════
    //
    //  timeTravelAward[awardId]:
    //    object → { goodsID1, num1 } langsung
    //    array  → [{ goodsID1, num1, random }, ...] weighted roll
    //  catatan: entry bisa ber-num1 0 (mis. 1201: 10% 1珠, 90% kosong)
    //  → hasil num 0 dilewati (bukan reward).
    //

    function resolveAwardEntry(awardEntry) {
        if (!awardEntry) return null;

        if (Array.isArray(awardEntry)) {
            var totalWeight = 0;
            for (var i = 0; i < awardEntry.length; i++) {
                totalWeight += Number(awardEntry[i].random) || 0;
            }
            if (totalWeight <= 0) return null;

            var roll = Math.random() * totalWeight;
            var cumulative = 0;
            for (var j = 0; j < awardEntry.length; j++) {
                cumulative += Number(awardEntry[j].random) || 0;
                if (roll < cumulative) {
                    return {
                        goodsID: Number(awardEntry[j].goodsID1),
                        num: Number(awardEntry[j].num1) || 0
                    };
                }
            }
            var last = awardEntry[awardEntry.length - 1];
            return {
                goodsID: Number(last.goodsID1),
                num: Number(last.num1) || 0
            };
        }

        return {
            goodsID: Number(awardEntry.goodsID1),
            num: Number(awardEntry.num1) || 0
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN HANDLER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('timeMachine', 'getReward', function (request, callback) {

        var _logT0 = Date.now();

        var userId    = request.userId || '';
        var machineId = request.machineId;

        // ── VALIDATION GROUP ──
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var _valChecks = [];

        if (!userId) {
            _valChecks.push({ '#': 1, Check: 'userId', Status: '❌ MISSING' });
            console.warn('   ⚠ missing userId');
        } else {
            _valChecks.push({ '#': 1, Check: 'userId', Status: '✅ OK' });
        }

        if (machineId === undefined || machineId === null) {
            _valChecks.push({ '#': 2, Check: 'machineId', Status: '❌ MISSING' });
            console.warn('   ⚠ missing machineId');
        } else {
            _valChecks.push({ '#': 2, Check: 'machineId', Status: '✅ ' + machineId });
        }

        console.table(_valChecks);
        console.groupEnd();

        // ═══════════════════════════════════════════════════════
        //  1. VALIDASI REQUEST
        // ═══════════════════════════════════════════════════════

        if (!userId) {
            log.warn('TM_GETREWARD', 'missing userId');
            callback({}, 1);
            return;
        }

        if (machineId === undefined || machineId === null) {
            log.warn('TM_GETREWARD', 'missing machineId');
            callback({}, 1);
            return;
        }

        // ═══════════════════════════════════════════════════════
        //  2. LOAD USER DATA + SLOT
        // ═══════════════════════════════════════════════════════

        var storageKey = 'user:' + userId;
        var savedData = db._get(storageKey);
        if (!savedData) {
            log.warn('TM_GETREWARD', 'user data not found: ' + storageKey);
            callback({}, 1);
            return;
        }

        var slotKey = String(machineId);
        var slot = null;
        if (savedData.timeMachine && savedData.timeMachine._items) {
            slot = savedData.timeMachine._items[slotKey] || null;
        }

        if (!slot || typeof slot !== 'object') {
            log.warn('TM_GETREWARD', 'slot empty/not found for machineId=' + machineId);
            callback({}, 1);
            return;
        }

        // ═══════════════════════════════════════════════════════
        //  3. GATE checkFinish — kontrak client (TimeLeapState):
        //     checkFinish = serverTime >= finishTime → Complete
        //     COLLECT hanya muncul saat state Complete.
        // ═══════════════════════════════════════════════════════

        var finishTime = Number(slot._finishTime) || 0;
        var now = Date.now();
        if (finishTime > 0 && now < finishTime) {
            log.warn('TM_GETREWARD', 'travel not finished yet: finishTime=' + finishTime + ' > now=' + now);
            callback({}, 1);
            return;
        }

        var slotLevel = Number(slot._level) || 0;
        var heroDisplayId = Number(slot._heroDisplayId) || 0;
        var timeType = Number(slot._timeType) || 0;

        if (slotLevel < 1 || slotLevel > 10) {
            log.warn('TM_GETREWARD', 'invalid slot level=' + slotLevel + ' for machineId=' + machineId);
            callback({}, 1);
            return;
        }

        // ═══════════════════════════════════════════════════════
        //  4. LOAD CONFIGS
        // ═══════════════════════════════════════════════════════

        var timeTravelConfig = loadJson('timeTravel');
        if (!timeTravelConfig || !timeTravelConfig[String(slotLevel)]) {
            log.warn('TM_GETREWARD', 'timeTravel config not found for level=' + slotLevel);
            callback({}, 1);
            return;
        }
        var travelEntry = timeTravelConfig[String(slotLevel)];

        var awardConfig = loadJson('timeTravelAward');
        if (!awardConfig) {
            log.warn('TM_GETREWARD', 'timeTravelAward.json not found');
            callback({}, 1);
            return;
        }

        var changeItems = {};

        // ═══════════════════════════════════════════════════════
        //  5. PIECE HERO SENDIRI (kontrak getMachineReward +
        //     getMachineByType) — "masuk time machine goku →
        //     reward goku", BUKAN hero lain / random.
        // ═══════════════════════════════════════════════════════

        if (heroDisplayId > 0) {
            var pieceId = getPieceIdWithHeroId(heroDisplayId);
            if (pieceId > 0) {
                // heroColor dari config hero.json (pola deserialize client)
                var heroColor = HERO_COLOR.White;
                var heroInfo = loadJson('hero');
                var heroCfg = heroInfo ? heroInfo[String(heroDisplayId)] : null;
                if (heroCfg && heroCfg.quality) {
                    heroColor = colorToHeroColor(heroCfg.quality);
                }

                // heroSelfKey per timeType (kontrak getMachineByType)
                var heroSelfKey = 0;
                if (timeType === TIME_MACHINE_TIME_TYPE.HOUR_6) {
                    heroSelfKey = Number(travelEntry.heroSelf6h) || 0;
                } else if (timeType === TIME_MACHINE_TIME_TYPE.HOUR_12) {
                    heroSelfKey = Number(travelEntry.heroSelf12h) || 0;
                } else if (timeType === TIME_MACHINE_TIME_TYPE.HOUR_24) {
                    heroSelfKey = Number(travelEntry.heroSelf24h) || 0;
                }

                var pieceNum = rollPieceCount(heroSelfKey, heroColor);
                if (pieceId > 0 && pieceNum > 0) {
                    addRewardItem(savedData, changeItems, pieceId, pieceNum);
                } else {
                    log.warn('TM_GETREWARD', 'piece roll empty: pieceId=' + pieceId +
                        ' heroSelfKey=' + heroSelfKey + ' heroColor=' + heroColor);
                }
            } else {
                log.warn('TM_GETREWARD', 'no heroPiece for heroDisplayId=' + heroDisplayId);
            }
        } else {
            log.warn('TM_GETREWARD', 'slot has no heroDisplayId (legacy slot?) — skip piece');
        }

        // ═══════════════════════════════════════════════════════
        //  6. AWARD1-4 (kontrak getMachineReward @5544030:
        //     loop r=1..5, break saat key tidak ada)
        // ═══════════════════════════════════════════════════════

        for (var r = 1; r < 6; r++) {
            var awardKey = 'award' + r;
            var awardId = travelEntry[awardKey];
            if (awardId === undefined || awardId === null) break;

            var awardEntry = awardConfig[String(awardId)];
            if (!awardEntry) {
                log.warn('TM_GETREWARD', 'timeTravelAward entry not found: ' + awardId);
                continue;
            }

            var resolved = resolveAwardEntry(awardEntry);
            if (resolved && resolved.goodsID && resolved.num > 0) {
                addRewardItem(savedData, changeItems, resolved.goodsID, resolved.num);
            }
        }

        // ═══════════════════════════════════════════════════════
        //  7. NULL-KAN SLOT (setMachineEmpty — persist server;
        //     client hanya in-memory @5542568) + SAVE DB
        //     → wajib, kalau tidak enterGame deepMerge saved-wins
        //       menghidupkan kembali machine Complete saat re-login.
        // ═══════════════════════════════════════════════════════

        if (!savedData.timeMachine || typeof savedData.timeMachine !== 'object') {
            savedData.timeMachine = { _items: {} };
        }
        if (!savedData.timeMachine._items || typeof savedData.timeMachine._items !== 'object') {
            savedData.timeMachine._items = {};
        }
        savedData.timeMachine._items[slotKey] = null;

        db._set(storageKey, savedData);

        // ═══════════════════════════════════════════════════════
        //  8. RESPONSE — openCongratulationObtain (@1947345)
        //     butuh _changeInfo._items ABSOLUTE
        // ═══════════════════════════════════════════════════════

        var response = {
            _changeInfo: {
                _items: changeItems
            }
        };

        log.info('TM_GETREWARD', 'OK userId=' + userId +
            ' machineId=' + machineId +
            ' level=' + slotLevel +
            ' heroDisplayId=' + heroDisplayId +
            ' timeType=' + timeType +
            ' rewards=' + Object.keys(changeItems).length);

        log.details('TM_GETREWARD', [
            ['userId', userId],
            ['machineId', String(machineId)],
            ['slotLevel', String(slotLevel)],
            ['heroDisplayId', String(heroDisplayId)],
            ['timeType', String(timeType)],
            ['finishTime', String(finishTime)],
            ['rewardCount', String(Object.keys(changeItems).length)]
        ]);

        // ── RESPONSE BUILD & AUDIT ──
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        var _respElapsed = Date.now() - _logT0;
        console.log('   ⏱️ Total: ' + _respElapsed + 'ms');
        console.table([
            { Field: 'machineId', Value: machineId, Note: 'time machine slot' },
            { Field: 'slotLevel', Value: slotLevel, Note: 'lesson level' },
            { Field: 'heroDisplayId', Value: heroDisplayId, Note: 'travel hero' },
            { Field: 'timeType', Value: timeType, Note: 'duration type' },
            { Field: 'rewards', Value: Object.keys(changeItems).length, Note: 'reward items (piece + award1-4)' },
            { Field: 'slotAfter', Value: 'null', Note: 'setMachineEmpty persisted' },
            { Field: 'ret', Value: 0, Note: 'success' }
        ]);
        console.groupEnd();

        callback(response);
    });

    window.MainServer = MainServer;
})();
