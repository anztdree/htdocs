/**
 * resetCurLevel.js — Mine Reset Current Level Handler (DRAFT)
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * TUGAS (1 file, 1 action):
 *   Request:  { type:"mine", action:"resetCurLevel", userId, version:"1.0" }
 *   Response: { _model, _mineResetTimes, _mineBuyResetTimesCount,
 *               _changeInfo? (hanya jika paid reset) }
 *
 *   1. Tentukan free vs paid berdasarkan _mineResetTimes
 *   2. Free: decrement _mineResetTimes, tanpa cost
 *   3. Paid: lookup mineRestartBuy, deduct cost, increment BuyResetTimesCount
 *   4. Generate map BARU untuk _curLevel yang SAMA
 *   5. Simpan, return response
 *
 *   Client membaca dari response (L4511924):
 *     saveMineModel(t._model)
 *     ResetTimes = t._mineResetTimes
 *     BuyResetTimesCount = t._mineBuyResetTimesCount
 *     resetTtemsCallBack(t) → baca t._changeInfo._items (ABSOLUTE balance)
 *     updateUI() → reload map
 *     initTheWildAdventureUI() → refresh AP, chest, enemy, reset button
 *     getOnekeyBtnState() → cek one-key explore
 * ============================================================
 *
 * EVIDENCE DARI main.min(unminfy).js:
 *
 *   [PEMANGGILAN] L4511488-4512030 resetBtnTap():
 *     if (ResetTimes <= 0):
 *       o = mineRestartBuy[BuyResetTimesCount + 1]
 *       if (o) → buyTips(price, vip, costID, confirmCb)
 *       else → "can't buy more"
 *     else → openTipWindow("free reset confirm", yes, no, confirmCb)
 *
 *     confirmCb = function() {
 *       ts.processHandler({
 *         type:"mine", action:"resetCurLevel", userId, version:"1.0"
 *       }, successCb, failCb)
 *     }
 *
 *     Request TIDAK mengirim info free/paid — server tentukan sendiri.
 *
 *   [RESPONSE CONSUMER] L4511924:
 *     saveMineModel(t._model) → overwrite _MineModel
 *     ResetTimes = t._mineResetTimes
 *     BuyResetTimesCount = t._mineBuyResetTimesCount
 *     resetTtemsCallBack(t) → if(t._changeInfo) setItem(id, num)
 *     updateUI() → loadMapInfo() ulang
 *     initTheWildAdventureUI() → refresh semua UI
 *     getOnekeyBtnState()
 *
 *   [COST DEDUCTION PATTERN] dari shop/buy.js:
 *     savedData.totalProps._items[] → [{ _id, _num }, ...]
 *     getItemBalance(savedData, itemId) → baca
 *     setItemBalance(savedData, itemId, newBalance) → tulis
 *     Response _changeInfo._items = ABSOLUTE balance (BUKAN delta)
 *
 *   [ENTERGAME INIT] L2350541:
 *     void 0 != e._mineResetTimes && (ResetTimes = e._mineResetTimes)
 *     void 0 != e._mineBuyResetTimesCount && (BuyResetTimesCount = e._mineBuyResetTimesCount)
 *
 *   [CLIENT CONSTRUCTOR] L3319541:
 *     this._resetTimes = 0, this._buyResetTimesCount = 0, this._buyStepCount = 0
 *     Di-reset oleh enterGame response.
 *
 *   [DAILY RESET] constant.json[1]:
 *     mineRestartFree: 3 → jumlah free reset per hari
 *     resetTime: '6:00:00' → jam reset harian
 *     Daily reset dilakukan oleh enterGame, BUKAN handler ini.
 *
 *   [CONFIG] mineRestartBuy.json:
 *     { "1": { mineRestartCostID:101, mineRestartPrice:100, vipNeeded:3 },
 *       "2": { mineRestartCostID:101, mineRestartPrice:120, vipNeeded:6 }, ... }
 *     Index = BuyResetTimesCount + 1
 *     Total 7 tier (key 1-7)
 *
 *   [STORAGE]:
 *     savedData._mineResetTimes → free reset tersisa (harian, reset oleh enterGame)
 *     savedData._mineBuyResetTimesCount → total kali beli (kumulatif)
 *     savedData._mineModel → map & state
 * ============================================================
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    // ═══════════════════════════════════════════════════════════
    //  JSON LOADING
    // ═══════════════════════════════════════════════════════════

    var _jsonCache = {};

    function loadJson(name) {
        if (_jsonCache[name]) return _jsonCache[name];
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './resource/json/' + name + '.json', false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                var data = JSON.parse(xhr.responseText);
                _jsonCache[name] = data;
                return data;
            }
            log.error('MINE', 'loadJson ' + name + ' HTTP ' + xhr.status);
        } catch (e) {
            log.error('MINE', 'loadJson ' + name + ': ' + e.message);
        }
        return null;
    }

    var mineJson = loadJson('mine');
    var constantJson = loadJson('constant');
    var mineRestartBuyJson = loadJson('mineRestartBuy');

    // ═══════════════════════════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════════════════════════

    var ITEM_TYPE = {
        UNKNOW: 0, DOOR: 1, ENEMY: 2,
        SILVER_CHEST: 3, GOLDEN_CHEST: 4, BOSS: 5
    };

    var MAP_COLS = 7;  // x: 0..6
    var MAP_ROWS = 8;  // y: 0..7
    var START_X = 6, START_Y = 7;
    var BOSS_X = 0, BOSS_Y = 0;

    var MAX_AP = (constantJson && constantJson['1'])
        ? Number(constantJson['1'].mineActionPointMax) : 50;

    var RESTART_FREE = (constantJson && constantJson['1'])
        ? Number(constantJson['1'].mineRestartFree) : 3;

    // ═══════════════════════════════════════════════════════════
    //  ITEM BALANCE HELPERS (sama dengan shop/buy.js)
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
        if (!savedData.totalProps) savedData.totalProps = {};
        if (!savedData.totalProps._items) savedData.totalProps._items = [];
        var items = savedData.totalProps._items;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(itemId)) {
                items[i]._num = newBalance;
                return;
            }
        }
        items.push({ _id: Number(itemId), _num: newBalance });
    }

    // ═══════════════════════════════════════════════════════════
    //  MAP GENERATION (sama dengan getInfo.js)
    // ═══════════════════════════════════════════════════════════

    function generateMineModel(level, userId) {
        var cfg = mineJson ? mineJson[String(level)] : null;
        var silverNum = cfg ? Number(cfg.silverChestNum) : 4;
        var goldNum = cfg ? Number(cfg.goldenChestNum) : 1;

        var map = [];
        for (var x = 0; x < MAP_COLS; x++) {
            map[x] = [];
            for (var y = 0; y < MAP_ROWS; y++) {
                map[x][y] = [0];
            }
        }

        map[START_X][START_Y] = [1];
        map[BOSS_X][BOSS_Y] = [1, { _type: ITEM_TYPE.BOSS, _enemyId: 0, _userId: "" }];

        var avail = [];
        for (var x = 0; x < MAP_COLS; x++) {
            for (var y = 0; y < MAP_ROWS; y++) {
                if (x === START_X && y === START_Y) continue;
                if (x === BOSS_X && y === BOSS_Y) continue;
                avail.push({ x: x, y: y });
            }
        }

        for (var i = avail.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = avail[i]; avail[i] = avail[j]; avail[j] = tmp;
        }

        var idx = 0;

        for (var e = 0; e < 4; e++) {
            var p = avail[idx++];
            map[p.x][p.y] = [0, { _type: ITEM_TYPE.ENEMY, _enemyId: e, _userId: "" }];
        }

        for (var s = 0; s < silverNum; s++) {
            var p = avail[idx++];
            map[p.x][p.y] = [0, { _type: ITEM_TYPE.SILVER_CHEST, _enemyId: 0, _userId: "" }];
        }

        for (var g = 0; g < goldNum; g++) {
            var p = avail[idx++];
            map[p.x][p.y] = [0, { _type: ITEM_TYPE.GOLDEN_CHEST, _enemyId: 0, _userId: "" }];
        }

        // --- SPAWN REVEAL (kontrak changeCurrPos, main.min.js) ---
        // Manhattan <= 1 dari START (6,7) → tetangga in-bounds tepat 2:
        // (5,7) dan (6,6). Sama seperti getInfo.js generateMineModel.
        // Setelah penempatan item agar reveal tidak tertimpa.
        map[5][7][0] = 1;
        map[6][6][0] = 1;

        var now = Date.now();

        return {
            _id: userId + '_mine_' + now,
            _map: map,
            _curX: START_X,
            _curY: START_Y,
            _leftStep: MAX_AP,
            _stepRecoverTime: now,
            _curLevel: level
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN HANDLER
    // ═══════════════════════════════════════════════════════════

    function handle(data, callback) {

        var _logT0 = Date.now();
        
        console.groupCollapsed('%c⛏️ MINE resetCurLevel', 'color:#795548;font-weight:bold;font-size:12px;background:#EFEBE9;padding:4px 8px;border-radius:6px;border-left:4px solid #795548;');
        var userId = data.userId;

        // ═══ VALIDATION ═══
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');

        if (!userId) {
            console.warn('   ❌ Missing userId');
            console.groupEnd(); // close Validation
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (missing userId)');
            console.groupEnd();
            console.groupEnd(); // close MINE group
            
            log.error('MINE', 'resetCurLevel — missing userId');
            callback({}, 1);
            return;
        }
        console.log('   ✅ userId present: ' + userId);
        console.groupEnd(); // close Validation

        // ═══ RESET PROCESSING ═══
        console.groupCollapsed('%c⛏️ Reset Level Processing', 'color:#0277BD;font-weight:bold;');

        // ── 1. LOAD USER DATA ──
        var savedData = db._get('user:' + userId);
        if (!savedData) {
            console.warn('   ❌ No user data for userId=' + userId);
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (no user data)');
            console.groupEnd();
            console.groupEnd(); // close MINE group
            
            log.error('MINE', 'resetCurLevel — no user data for ' + userId);
            callback({}, 1);
            return;
        }
        console.log('   ✅ User data loaded');

        var model = savedData._mineModel;
        if (!model) {
            console.warn('   ❌ No mineModel for userId=' + userId);
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (no mineModel)');
            console.groupEnd();
            console.groupEnd(); // close MINE group
            
            log.error('MINE', 'resetCurLevel — no mineModel for ' + userId);
            callback({}, 1);
            return;
        }
        console.log('   ✅ MineModel loaded (level=' + (model._curLevel || '?') + ')');

        // ── 2. BACA RESET COUNTS ──
        // KONTRAK main.min.js — AllRefreshCount.initData(scheduleInfo) L1985807:
        //   void 0 != e._mineResetTimes && (ResetTimes = e._mineResetTimes)
        //   void 0 != e._mineBuyResetTimesCount && (BuyResetTimesCount = ...)
        // → ketiga counter mine hidup DI DALAM scheduleInfo (bukan top-level).
        //   enterGame buildDefaultScheduleInfo() menulis di sana; buyStep.js juga.
        // Default _mineResetTimes = mineRestartFree (3, constant.json[1]).
        if (!savedData.scheduleInfo) savedData.scheduleInfo = {};
        var resetTimes = (savedData.scheduleInfo._mineResetTimes !== undefined)
            ? Number(savedData.scheduleInfo._mineResetTimes) : RESTART_FREE;
        var buyResetTimesCount = (savedData.scheduleInfo._mineBuyResetTimesCount !== undefined)
            ? Number(savedData.scheduleInfo._mineBuyResetTimesCount) : 0;

        // ── 3. TENTUKAN FREE VS PAID ──
        var isFree = resetTimes > 0;
        var changeInfo = null;

        if (isFree) {
            // ── FREE RESET ──
            resetTimes -= 1;
            log.info('MINE', 'resetCurLevel — FREE reset user=' + userId +
                ' remaining=' + resetTimes);
        } else {
            // ── PAID RESET ──
            var tierKey = String(buyResetTimesCount + 1);
            var tierConfig = mineRestartBuyJson ? mineRestartBuyJson[tierKey] : null;

            if (!tierConfig) {
                console.warn('   ❌ No buy config for tier ' + tierKey);
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (no buy config)');
                console.groupEnd();
                console.groupEnd(); // close MINE group
                
                log.warn('MINE', 'resetCurLevel — no buy config for tier ' + tierKey +
                    ' user=' + userId);
                callback({}, 1);
                return;
            }

            var costID = Number(tierConfig.mineRestartCostID);
            var price = Number(tierConfig.mineRestartPrice);
            var currentBalance = getItemBalance(savedData, costID);

            if (currentBalance < price) {
                console.warn('   ❌ Not enough currency: have=' + currentBalance + ' need=' + price);
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (not enough currency)');
                console.groupEnd();
                console.groupEnd(); // close MINE group
                
                log.warn('MINE', 'resetCurLevel — not enough currency. item=' + costID +
                    ' have=' + currentBalance + ' need=' + price + ' user=' + userId);
                callback({}, 1);
                return;
            }

            // Deduct cost
            var newBalance = currentBalance - price;
            setItemBalance(savedData, costID, newBalance);
            buyResetTimesCount += 1;

            // Build _changeInfo dengan ABSOLUTE balance
            var changeItems = {};
            changeItems[String(costID)] = { _id: costID, _num: newBalance };
            changeInfo = { _items: changeItems };

            log.info('MINE', 'resetCurLevel — PAID reset user=' + userId +
                ' tier=' + tierKey + ' cost=' + price + ' item=' + costID +
                ' balance=' + currentBalance + '→' + newBalance);
        }

        // ── 4. GENERATE MAP BARU (level SAMA) ──
        var curLevel = model._curLevel || 1;
        var newModel = generateMineModel(curLevel, userId);

        // ── 5. SIMPAN ──
        savedData._mineModel = newModel;
        // Kontrak: simpan di scheduleInfo (AllRefreshCount.initData), bukan top-level.
        savedData.scheduleInfo._mineResetTimes = resetTimes;
        savedData.scheduleInfo._mineBuyResetTimesCount = buyResetTimesCount;

        // Sync timesInfo
        if (!savedData.timesInfo) savedData.timesInfo = {};
        savedData.timesInfo.mineSteps = newModel._leftStep;
        savedData.timesInfo.mineStepsRecover = newModel._stepRecoverTime;

        db._set('user:' + userId, savedData);

        // ── 6. LOG ──
        log.details('MINE', [
            ['action', 'resetCurLevel'],
            ['userId', userId],
            ['type', isFree ? 'free' : 'paid'],
            ['level', String(curLevel)],
            ['resetTimes', String(resetTimes)],
            ['buyResetTimesCount', String(buyResetTimesCount)]
        ]);

        // ── 7. RESPONSE ──
        var response = {
            _model: newModel,
            _mineResetTimes: resetTimes,
            _mineBuyResetTimesCount: buyResetTimesCount
        };

        // Hanya include _changeInfo untuk paid reset
        if (changeInfo) {
            response._changeInfo = changeInfo;
        }

        console.log('   ✅ Reset complete: type=' + (isFree ? 'free' : 'paid') + ' level=' + curLevel);
        console.groupEnd(); // close Reset Level Processing
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        var _elapsed = Date.now() - _logT0;
        console.log('   ⏱️ ' + _elapsed + 'ms | type=' + (isFree ? 'free' : 'paid') + ' level=' + curLevel + ' resetTimes=' + resetTimes);
        console.table({
            'Reset': { type: isFree ? 'free' : 'paid', level: curLevel, resetTimes: resetTimes, buyCount: buyResetTimesCount },
            'Cost': isFree ? { cost: 0 } : { costId: costID, price: price, newBal: newBalance || 'N/A' }
        });
        console.groupEnd();
        console.groupEnd(); // close MINE group

        callback(response);
    }

    // ═══════════════════════════════════════════════════════════
    //  REGISTER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('mine', 'resetCurLevel', handle);
})();