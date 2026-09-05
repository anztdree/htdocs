/**
 * handlers/trial/vipBuy.js — Temple Trial VipBuy Handler
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * TUGAS HANDLER INI:
 * ============================================================
 * 1. Validasi request (userId)
 * 2. Load savedData + trialState
 * 3. Validasi: _buyCount < templeTestTimesCanBuy (6)
 * 4. Lookup dungeonTimesBuy[_buyCount + 1] → cek VIP & harga
 * 5. Validasi: VIP level cukup
 * 6. Validasi: balance item 101 (diamond) >= harga
 * 7. Deduct item 101, tambah _haveTimes, increment _buyCount
 * 8. Save + response { _model, _changeInfo._items }
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    // ═══════════════════════════════════════════════════════════
    //  CONSTANTS
    // ═════════════════════════════════════════════════════════

    var DIAMOND_ID = 101;
    var VIP_LEVEL_ID = 106;

    // ═════════════════════════════════════════════════════════
    //  RESOURCE CACHE & CONFIG LOADER
    // ═════════════════════════════════════════════════════════

    var _resourceCache = {};

    function loadJson(name) {
        if (_resourceCache[name]) return _resourceCache[name];
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './resource/json/' + name + '.json', false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                var data = JSON.parse(xhr.responseText);
                _resourceCache[name] = data;
                return data;
            }
        } catch (e) {
            log.error('TRIAL_VIPBUY', 'Failed to load ' + name + '.json: ' + e.message);
        }
        return null;
    }

    // ═════════════════════════════════════════════════════════
    //  ITEM BALANCE HELPERS
    // ═══════════════════════════════════════════════════════

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
        var found = false;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(itemId)) {
                items[i]._num = newBalance;
                found = true;
                break;
            }
        }
        if (!found) {
            items.push({ _id: itemId, _num: newBalance });
        }
    }

    // ═════════════════════════════════════════════════════════
    //  HANDLER: trial/vipBuy
    // ═════════════════════════════════════════════════════════

    function handleTrialVipBuy(request, callback) {

        var _logT0 = Date.now();
        
        console.groupCollapsed('%c🏛️ TRIAL vipBuy', 'color:#6A1B9A;font-weight:bold;font-size:12px;background:#F3E5F5;padding:4px 8px;border-radius:6px;border-left:4px solid #6A1B9A;');
        var userId = request.userId;

        log.info('TRIAL_VIPBUY', 'Processing trial/vipBuy');
        log.details('TRIAL_VIPBUY', [
            ['userId', userId || '-'],
            ['version', request.version || '-']
        ]);

        // ═══ VALIDATION ═══
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');

        // ── STEP 1: Validate userId ──
        if (!userId) {
            console.warn('   ❌ Missing userId');
            console.groupEnd(); // close Validation
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (missing userId)');
            console.groupEnd();
            console.groupEnd(); // close TRIAL group
            
            log.warn('TRIAL_VIPBUY', 'Missing userId');
            callback({}, 1);
            return;
        }
        console.log('   ✅ userId present: userId=' + userId);
        console.groupEnd(); // close Validation

        // ═══ VIP BUY PROCESSING ═══
        console.groupCollapsed('%c🏛️ VIP Buy Processing', 'color:#0277BD;font-weight:bold;');

        // ── STEP 2: Load savedData ──
        var storageKey = 'user:' + userId;
        var savedData = db._get(storageKey);
        if (!savedData) {
            console.warn('   ❌ No savedData for userId=' + userId);
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (no user data)');
            console.groupEnd();
            console.groupEnd(); // close TRIAL group
            
            log.warn('TRIAL_VIPBUY', 'No savedData for userId=' + userId);
            callback({}, 1);
            return;
        }
        console.log('   ✅ User data loaded');

        // ── STEP 3: Ensure trialState exists ──
        if (!savedData.trialState) {
            console.warn('   ❌ trialState not found for userId=' + userId);
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (no trialState)');
            console.groupEnd();
            console.groupEnd(); // close TRIAL group
            
            log.warn('TRIAL_VIPBUY', 'trialState not found for userId=' + userId);
            callback({}, 1);
            return;
        }
        console.log('   ✅ trialState loaded');

        var ts = savedData.trialState;
        var buyIndex = (ts._buyCount || 0) + 1;

        // ── STEP 4: Load configs ──
        var constant = loadJson('constant');
        if (!constant || !constant[1]) {
            console.error('   ❌ constant.json not found');
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (config error)');
            console.groupEnd();
            console.groupEnd(); // close TRIAL group
            
            log.error('TRIAL_VIPBUY', 'constant.json not found');
            callback({}, 1);
            return;
        }

        var maxBuyCount = Number(constant[1].templeTestTimesCanBuy) || 6;
        var timesPerBuy = Number(constant[1].templeTestTimesBuy) || 5;

        var dungeonTimesBuy = loadJson('dungeonTimesBuy');
        if (!dungeonTimesBuy) {
            console.error('   ❌ dungeonTimesBuy.json not found');
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (config error)');
            console.groupEnd();
            console.groupEnd(); // close TRIAL group
            
            log.error('TRIAL_VIPBUY', 'dungeonTimesBuy.json not found');
            callback({}, 1);
            return;
        }

        // ── STEP 5: Validate buy count ──
        if (ts._buyCount >= maxBuyCount) {
            console.warn('   ❌ Buy limit reached: buyCount=' + ts._buyCount + ' max=' + maxBuyCount);
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (buy limit reached)');
            console.groupEnd();
            console.groupEnd(); // close TRIAL group
            
            log.warn('TRIAL_VIPBUY', 'Buy limit reached: buyCount=' + ts._buyCount + ' max=' + maxBuyCount);
            callback({}, 1);
            return;
        }
        console.log('   ✅ buyIndex=' + buyIndex + ' (count=' + ts._buyCount + '/' + maxBuyCount + ')');

        var buyConfig = dungeonTimesBuy[String(buyIndex)];
        if (!buyConfig || !buyConfig.templeTestCostID) {
            console.warn('   ❌ No buy config for index=' + buyIndex);
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (no tier config)');
            console.groupEnd();
            console.groupEnd(); // close TRIAL group
            
            log.warn('TRIAL_VIPBUY', 'No buy config for index=' + buyIndex);
            callback({}, 1);
            return;
        }

        var costItemId = Number(buyConfig.templeTestCostID);
        var price = Number(buyConfig.templeTestPrice) || 0;
        var vipNeeded = Number(buyConfig.vipNeeded) || 0;

        console.log('   ✅ Tier config: costId=' + costItemId + ' price=' + price + ' vipNeeded=' + vipNeeded);

        // ── STEP 6: Validate VIP level ──
        var userVipLevel = getItemBalance(savedData, VIP_LEVEL_ID) || 0;
        if (userVipLevel < vipNeeded) {
            console.warn('   ❌ VIP too low: user=' + userVipLevel + ' needed=' + vipNeeded);
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (VIP too low)');
            console.groupEnd();
            console.groupEnd(); // close TRIAL group
            
            log.warn('TRIAL_VIPBUY', 'VIP too low: user=' + userVipLevel + ' needed=' + vipNeeded);
            callback({}, 1);
            return;
        }
        console.log('   ✅ VIP OK: level=' + userVipLevel);

        // ── STEP 7: Validate diamond balance ──
        var currentDiamond = getItemBalance(savedData, costItemId);
        if (currentDiamond < price) {
            console.warn('   ❌ Diamond not enough: have=' + currentDiamond + ' need=' + price);
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (not enough diamonds)');
            console.groupEnd();
            console.groupEnd(); // close TRIAL group
            
            log.warn('TRIAL_VIPBUY', 'Diamond not enough: have=' + currentDiamond + ' need=' + price);
            callback({}, 1);
            return;
        }
        console.log('   ✅ Diamond OK: balance=' + currentDiamond);

        // ═══ ALL VALIDATIONS PASSED — EXECUTE BUY ═══
        console.log('   ✅ All validations passed — executing purchase...');

        // Deduct diamond
        var newDiamond = currentDiamond - price;
        setItemBalance(savedData, costItemId, newDiamond);

        // Add times
        ts._haveTimes = (ts._haveTimes || 0) + timesPerBuy;

        // Increment buy count
        ts._buyCount = buyIndex;

        log.info('TRIAL_VIPBUY', 'Buy success userId=' + userId +
            ' buyIndex=' + buyIndex +
            ' price=' + price +
            ' diamond ' + currentDiamond + '→' + newDiamond +
            ' haveTimes+=' + timesPerBuy + ' -> ' + ts._haveTimes);

        // ── STEP 8: Save ──
        db._set(storageKey, savedData);

        // ── STEP 9: Build response ──
        var resp = {
            _model: {
                _id: ts._id || userId,
                _haveTimes: ts._haveTimes,
                _timesStartRecover: ts._timesStartRecover || 0,
                _lastLess: ts._lastLess || 0,
                _lastTime: ts._lastTime || 0,
                _buyFund: !!ts._buyFund,
                _haveGotFundReward: ts._haveGotFundReward || {}
            },
            _changeInfo: {
                _items: {}
            }
        };

        // Diamond balance (absolute) for resetTtemsCallBack
        resp._changeInfo._items[String(costItemId)] = {
            _id: costItemId,
            _num: newDiamond
        };

        console.groupEnd(); // close VIP Buy Processing
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        var _elapsed = Date.now() - _logT0;
        console.log('   ⏱️ ' + _elapsed + 'ms | tier=' + buyIndex + ' cost=' + price + ' diamonds=' + newDiamond);
        console.table({
            'Purchase': { tier: buyIndex, costId: costItemId, price: price, oldBal: currentDiamond, newBal: newDiamond },
            'Result': { haveTimes: ts._haveTimes, timesAdded: timesPerBuy }
        });
        console.groupEnd();
        console.groupEnd(); // close TRIAL group

        callback(resp);
    }

    // ═══════════════════════════════════════════════════════════
    //  REGISTER HANDLER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('trial', 'vipBuy', handleTrialVipBuy);

    window.MainServer = MainServer;
})();
