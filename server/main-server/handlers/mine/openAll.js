/**
 * openAll.js — Mine One-Key Explore Handler
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * TUGAS (1 file, 1 action):
 *   Request:  { type:"mine", action:"openAll", userId, version:"1.0" }
 *   Response: { _curX, _curY, _leftStep, _stepRecoverTime,
 *               _changeInfo?: { _items: { [itemId]: { _id, _num } } } }
 *
 *   1. Validasi: mineModel ada, effectiveAP >= mineActionPointConsume
 *   2. Deduct AP (mineActionPointConsume = 24), stepRecoverTime = now
 *   3. Reveal SEMUA tile ([0]=1) — mirror client changeMapItemData()
 *   4. Buka SEMUA chest: reward mineChest.json[_curLevel], hapus item
 *      dari cell (splice index 1), akumulasi _changeInfo._items ABSOLUTE
 *   5. Enemy/BOSS TIDAK disentuh (butuh battle via startBattle)
 *   6. Simpan, return response
 * ============================================================
 *
 * EVIDENCE DARI main.min.js:
 *
 *   [PEMANGGILAN] oneKeyExploreBtnTap():
 *     n = constant[1].mineActionPointConsume;  o = stepNumber
 *     if (n > o) → addcountBtnTap() (beli AP dulu)
 *     ts.processHandler({ type:"mine", action:"openAll", userId, version:"1.0" },
 *       function(t) {
 *         e.openAllGrassMap(t),                              ← t = response
 *         TheWildAdventureManager.changeStepRecoverTime(t._stepRecoverTime),
 *         TheWildAdventureManager.changeLeftStep(t._leftStep),
 *         e.initTheWildAdventureUI(), e.getOnekeyBtnState()
 *       }, failCb)
 *
 *   [openAllGrassMap(t)] — TIDAK membaca t._map:
 *     a = getMineModel(); r = a._curX; i = a._curY     ← posisi LAMA (capture)
 *     changeMapItemData()                               ← client reveal semua lokal
 *       → t[n][o][0]=1, t[n][o][10]=1, boxCount=0
 *     changeCurrPos(t._curX, t._curY)                   ← ← BACA response._curX/_curY!
 *     iterasi s._map (model client) → showMapItemInfo(..., skipAnim)
 *     cell[1] SILVER/GOLDEN_CHEST → openAllBoxTween (animasi buka box)
 *     playTransferEffect(r, i, t)
 *       → akhir: openCongratulationObtain(t) → t._changeInfo._items (ABSOLUTE)
 *         L56637: if(!_changeInfo) return → response TANPA _changeInfo = aman
 *
 *   [KONTRAK FIELD RESPONSE]:
 *     _curX, _curY       → changeCurrPos (WAJIB — posisi teleport player)
 *     _leftStep          → changeLeftStep
 *     _stepRecoverTime   → changeStepRecoverTime
 *     _changeInfo._items → openCongratulationObtain (opsional; key String,
 *                          value {_id:Number, _num: ABSOLUTE balance})
 *
 *   [CATATAN STRUKTUR — JANGAN kirim cell bertanda [10]]:
 *     Client set [10]=1 lokal (changeMapItemData) untuk ikon box terbuka.
 *     Server TIDAK perlu (chest di-splice — cell jadi [1] polos).
 *     Cell sparse (index 2..9 null via JSON) → setMineModelInfo for-in
 *     akses ._type pada null → CRASH. Karena itu chest DIHAPUS, bukan
 *     ditandai [10]=1.
 *
 *   [UNLOCK — checkOneKeyIsOpen()]:
 *     userLevel >= mineActionPointPlayerLevel (200) || vipLevel >=
 *     mineActionPointPlayerVIP (10). Validasi AP saja di server
 *     (client pre-check AP sebelum kirim; unlock = gating UI button).
 *
 *   [STORAGE]: savedData._mineModel (di dalam user:{userId})
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
            log.error('MINE_OA', 'loadJson ' + name + ' HTTP ' + xhr.status);
        } catch (e) {
            log.error('MINE_OA', 'loadJson ' + name + ': ' + e.message);
        }
        return null;
    }

    var constantJson = loadJson('constant');
    var mineChestJson = loadJson('mineChest');

    // ═══════════════════════════════════════════════════════════
    //  CONSTANTS (dari constant.json[1])
    // ═══════════════════════════════════════════════════════════

    var MAX_STEPS = (constantJson && constantJson['1'])
        ? Number(constantJson['1'].mineActionPointMax) : 50;

    var REFRESH_SEC = (constantJson && constantJson['1'])
        ? Number(constantJson['1'].mineActionPointRefreshTime) : 1800;

    var REFRESH_MS = REFRESH_SEC * 1000;

    var AP_CONSUME = (constantJson && constantJson['1'])
        ? Number(constantJson['1'].mineActionPointConsume) : 24;

    var ITEM_TYPE = {
        UNKNOW: 0, DOOR: 1, ENEMY: 2,
        SILVER_CHEST: 3, GOLDEN_CHEST: 4, BOSS: 5
    };

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
    //  MAIN HANDLER
    // ═══════════════════════════════════════════════════════════

    function handle(data, callback) {

        var _logT0 = Date.now();

        console.groupCollapsed('%c⛏️ MINE openAll', 'color:#795548;font-weight:bold;font-size:12px;background:#EFEBE9;padding:4px 8px;border-radius:6px;border-left:4px solid #795548;');
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

            log.error('MINE_OA', 'openAll — missing userId');
            callback({}, 1);
            return;
        }
        console.log('   ✅ userId present: ' + userId);
        console.groupEnd(); // close Validation

        // ═══ OPEN ALL PROCESSING ═══
        console.groupCollapsed('%c⛏️ Open All Processing', 'color:#0277BD;font-weight:bold;');

        var savedData = db._get('user:' + userId);
        if (!savedData) {
            console.warn('   ❌ No user data for userId=' + userId);
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (no user data)');
            console.groupEnd();
            console.groupEnd(); // close MINE group

            log.error('MINE_OA', 'openAll — no user data for ' + userId);
            callback({}, 1);
            return;
        }
        console.log('   ✅ User data loaded');

        var model = savedData._mineModel;
        if (!model || !model._map) {
            console.warn('   ❌ No mineModel for userId=' + userId);
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (no mineModel)');
            console.groupEnd();
            console.groupEnd(); // close MINE group

            log.error('MINE_OA', 'openAll — no mineModel for ' + userId);
            callback({}, 1);
            return;
        }
        console.log('   ✅ MineModel loaded (level=' + (model._curLevel || '?') + ')');

        // ── 1. VALIDASI & DEDUCT AP ──
        // Client pre-check: if (mineActionPointConsume > stepNumber) → buy AP.
        var now = Date.now();
        var elapsed = Math.max(now - model._stepRecoverTime, 0);
        var recovered = Math.floor(elapsed / REFRESH_MS);
        var effectiveAP = Math.min(model._leftStep + recovered, MAX_STEPS);

        if (effectiveAP < AP_CONSUME) {
            console.warn('   ❌ Not enough AP: have=' + effectiveAP + ' need=' + AP_CONSUME);
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (not enough AP)');
            console.groupEnd();
            console.groupEnd(); // close MINE group

            log.warn('MINE_OA', 'openAll — not enough AP. have=' + effectiveAP +
                ' need=' + AP_CONSUME + ' user=' + userId);
            callback({}, 1);
            return;
        }

        model._leftStep = effectiveAP - AP_CONSUME;
        model._stepRecoverTime = now; // cash out recovery → no double count

        // ── 2. REVEAL SEMUA + BUKA SEMUA CHEST ──
        var level = model._curLevel || 1;
        var chestCfg = mineChestJson ? mineChestJson[String(level)] : null;
        var changeItems = {};
        var chestOpened = 0;

        // Reward final balance per item — ABSOLUTE (client setItem absolute)
        function grantReward(itemId, num) {
            var currentBalance = getItemBalance(savedData, itemId);
            var newBalance = currentBalance + num;
            setItemBalance(savedData, itemId, newBalance);
            // Key String, _id Number, _num ABSOLUTE final balance
            changeItems[String(itemId)] = { _id: itemId, _num: newBalance };
        }

        function grantChestRewards(chestType) {
            if (!chestCfg) return;
            if (chestType === ITEM_TYPE.SILVER_CHEST) {
                var sId = Number(chestCfg.silverAward1);
                var sNum = Number(chestCfg.silverNum1);
                if (sId > 0 && sNum > 0) grantReward(sId, sNum);
            } else if (chestType === ITEM_TYPE.GOLDEN_CHEST) {
                var g1 = Number(chestCfg.goldenAward1);
                var n1 = Number(chestCfg.goldenNum1);
                if (g1 > 0 && n1 > 0) grantReward(g1, n1);
                var g2 = Number(chestCfg.goldenAward2);
                var n2 = Number(chestCfg.goldenNum2);
                if (g2 > 0 && n2 > 0) grantReward(g2, n2);
            }
        }

        var map = model._map;
        for (var x = 0; x < map.length; x++) {
            for (var y = 0; y < map[x].length; y++) {
                var cellArr = map[x][y];

                // Reveal semua tile (mirror client changeMapItemData [0]=1)
                cellArr[0] = 1;

                // Chest → grant reward + hapus item (splice index 1).
                // Enemy/BOSS dibiarkan (butuh battle via startBattle).
                if (cellArr.length > 1 && cellArr[1]) {
                    var t = cellArr[1]._type;
                    if (t === ITEM_TYPE.SILVER_CHEST || t === ITEM_TYPE.GOLDEN_CHEST) {
                        grantChestRewards(t);
                        cellArr.splice(1, 1);
                        chestOpened++;
                    }
                }
            }
        }

        // ── 3. SIMPAN ──
        savedData._mineModel = model;

        // Sync timesInfo agar enterGame konsisten
        if (!savedData.timesInfo) savedData.timesInfo = {};
        savedData.timesInfo.mineSteps = model._leftStep;
        savedData.timesInfo.mineStepsRecover = model._stepRecoverTime;

        db._set('user:' + userId, savedData);

        // ── 4. LOG ──
        log.details('MINE_OA', [
            ['action', 'openAll'],
            ['userId', userId],
            ['level', String(level)],
            ['AP', model._leftStep + '/' + MAX_STEPS + ' (-' + AP_CONSUME + ')'],
            ['chestsOpened', String(chestOpened)],
            ['items', String(Object.keys(changeItems).length)]
        ]);

        // ── 5. RESPONSE ──
        // Client openAllGrassMap(t): changeCurrPos(t._curX, t._curY),
        // changeStepRecoverTime(t._stepRecoverTime), changeLeftStep(t._leftStep),
        // openCongratulationObtain(t) → t._changeInfo._items.
        // Posisi player TIDAK berubah (openAll bukan move) → kirim posisi saat ini.
        var response = {
            _curX: model._curX,
            _curY: model._curY,
            _leftStep: model._leftStep,
            _stepRecoverTime: model._stepRecoverTime
        };
        // _changeInfo HANYA jika ada item (openCongratulationObtain: if(!_changeInfo) return)
        if (Object.keys(changeItems).length > 0) {
            response._changeInfo = { _items: changeItems };
        }

        console.log('   ✅ OpenAll complete: chests=' + chestOpened + ' AP=' + model._leftStep);
        console.groupEnd(); // close Open All Processing
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        var _elapsed = Date.now() - _logT0;
        console.log('   ⏱️ ' + _elapsed + 'ms | level=' + level + ' chests=' + chestOpened + ' AP=' + model._leftStep + '/' + MAX_STEPS);
        console.table({
            'OpenAll': { level: level, chestsOpened: chestOpened, apLeft: model._leftStep },
            'Position': { x: model._curX, y: model._curY }
        });
        console.groupEnd();
        console.groupEnd(); // close MINE group

        callback(response);
    }

    // ═══════════════════════════════════════════════════════════
    //  REGISTER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('mine', 'openAll', handle);
})();
