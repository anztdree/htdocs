/**
 * handlers/gift/buyGold.js
 *
 * Client call (main.min.js L155426-155431):
 *   ts.processHandler({ type:"gift", action:"buyGold", userId, version:"1.0" }, callback)
 *
 * Callback (L155432-155433):
 *   var o = t._changeInfo._items;
 *   WelfareInfoManager.getInstance().setGoldBuyCount(n + 1)
 *   ItemsCommonSingleton.getInstance().openCommonItemGetTips(o)
 *
 * Flow:
 *   n = getGoldBuyCount()  →  o = goldBuy[n + 1]
 *   costNum <= 0 → gratis: gold = floor(goldBuyFree * goldPrice[userLevel].price * o.times)
 *   costNum >  0 → bayar: gold = floor(o.costNum * goldPrice[userLevel].price * o.times)
 *     kurangi diamond (item 101) sebanyak o.costNum
 *     tambah gold (item 102) sebanyak gold hasil hitung
 *
 * State: scheduleInfo._goldBuyCount (bukan giftInfo!)
 * Config: goldBuy.json, goldPrice.json, constant.json (goldBuyFree=20)
 */
(function () {
    'use strict';

    var MainServer = window.MainServer;
    var db = window.MainServerDB;

    if (!MainServer.handlers.gift) MainServer.handlers.gift = {};

    var _cache = {};
    function loadJson(name) {
        if (_cache[name]) return _cache[name];
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './resource/json/' + name + '.json', false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                _cache[name] = JSON.parse(xhr.responseText);
                return _cache[name];
            }
        } catch (e) {}
        return null;
    }

    function getBal(sd, id) {
        var items = sd && sd.totalProps && sd.totalProps._items;
        if (!items) return 0;
        for (var i = 0; i < items.length; i++)
            if (Number(items[i]._id) === Number(id)) return Number(items[i]._num) || 0;
        return 0;
    }

    function setBal(sd, id, val) {
        if (!sd.totalProps) sd.totalProps = { _items: [] };
        if (!sd.totalProps._items) sd.totalProps._items = [];
        var items = sd.totalProps._items;
        for (var i = 0; i < items.length; i++)
            if (Number(items[i]._id) === Number(id)) { items[i]._num = val; return; }
        items.push({ _id: id, _num: val });
    }

    MainServer.registerHandler('gift', 'buyGold', function (request, callback) {
        var _logT0 = Date.now();
        
        var userId = request.userId;

        // ═══════════════════════════════════════════════════════════
        //  ✅ VALIDATION
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var _validationChecks = [];

        if (!userId) {
            _validationChecks.push({ check: 'userId', result: '❌ MISSING' });
        } else {
            _validationChecks.push({ check: 'userId', result: '✅ OK' });
        }

        console.table(_validationChecks);
        console.groupEnd();

        if (!userId) {
            var _elapsed = Date.now() - _logT0;
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            console.log('   ⚠️ Early exit — missing userId');
            console.log('   ⏱️ Elapsed: ' + _elapsed + 'ms');
            console.groupEnd();
            callback({}, 1);
            return;
        }

        // ═══════════════════════════════════════════════════════════
        //  📦 GOLD PURCHASE PROCESSING
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c📦 Gold Purchase Processing', 'color:#0277BD;font-weight:bold;');
        var _processSteps = [];

        var savedData = db._get('user:' + userId);
        if (!savedData) { 
            _processSteps.push({ step: 'loadSavedData', status: '❌ FAIL' });
            console.table(_processSteps);
            console.groupEnd();
            var _errElapsed = Date.now() - _logT0;
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            console.log('   ⚠️ Early exit — user data not found');
            console.log('   ⏱️ Elapsed: ' + _errElapsed + 'ms');
            console.groupEnd();
            callback({}, 1); return; 
        }
        _processSteps.push({ step: 'loadSavedData', status: '✅ OK' });

        // 1. Read buy count state (lives in scheduleInfo, NOT giftInfo)
        if (!savedData.scheduleInfo) savedData.scheduleInfo = {};
        var buyCount = Number(savedData.scheduleInfo._goldBuyCount) || 0;

        // 2. Load goldBuy config for next tier
        var goldBuy = loadJson('goldBuy');
        if (!goldBuy) { 
            _processSteps.push({ step: 'loadConfig', status: '❌ FAIL', detail: 'goldBuy.json not found' });
            console.table(_processSteps);
            console.groupEnd();
            var _cfgElapsed = Date.now() - _logT0;
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            console.log('   ⚠️ Early exit — config not found');
            console.log('   ⏱️ Elapsed: ' + _cfgElapsed + 'ms');
            console.groupEnd();
            callback({}, 1); return; 
        }
        _processSteps.push({ step: 'loadConfig', status: '✅ OK' });
        var tier = goldBuy[String(buyCount + 1)];
        if (!tier) { 
            _processSteps.push({ step: 'findTier', status: '❌ FAIL', detail: 'No tier for buyCount=' + (buyCount+1) });
            console.table(_processSteps);
            console.groupEnd();
            var _tierElapsed = Date.now() - _logT0;
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            console.log('   ⚠️ Early exit — no tier config');
            console.log('   ⏱️ Elapsed: ' + _tierElapsed + 'ms');
            console.groupEnd();
            callback({}, 1); return; 
        }
        _processSteps.push({ step: 'findTier', status: '✅ OK', detail: 'tier=' + (buyCount+1) });

        // 3. Validate VIP level
        var playerVipLevel = getBal(savedData, 106);
        if (playerVipLevel < Number(tier.VIPNeeded)) { 
            _processSteps.push({ step: 'validateVip', status: '❌ FAIL', detail: playerVipLevel + ' < ' + tier.VIPNeeded });
            console.table(_processSteps);
            console.groupEnd();
            var _vipElapsed = Date.now() - _logT0;
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            console.log('   ⚠️ Early exit — VIP level too low');
            console.log('   ⏱️ Elapsed: ' + _vipElapsed + 'ms');
            console.groupEnd();
            callback({}, 1); return; 
        }
        _processSteps.push({ step: 'validateVip', status: '✅ OK', detail: 'vip=' + playerVipLevel });

        // 4. Load goldPrice by user level
        var goldPrice = loadJson('goldPrice');
        var constant = loadJson('constant');
        var userLevel = Number(getBal(savedData, 100)) || 1; // item 100 = userLevel
        var priceEntry = goldPrice && goldPrice[String(userLevel)];
        if (!priceEntry) priceEntry = goldPrice[String(constant && constant[1] && constant[1].maxUserLevel || 300)];
        if (!priceEntry) priceEntry = goldPrice['1'];
        var price = Number(priceEntry.price) || 0;

        // 5. Calculate gold reward
        var goldBuyFree = constant && constant[1] && Number(constant[1].goldBuyFree) || 20;
        var costNum = Number(tier.costNum) || 0;
        var times = Number(tier.times) || 1;
        var goldGain;
        if (costNum <= 0) {
            // Free purchase
            goldGain = Math.floor(goldBuyFree * price * times);
        } else {
            // Paid purchase — check diamond balance
            var diamondBal = getBal(savedData, 101);
            if (diamondBal < costNum) { 
                _processSteps.push({ step: 'checkDiamond', status: '❌ FAIL', detail: diamondBal + ' < ' + costNum });
                console.table(_processSteps);
                console.groupEnd();
                var _diaElapsed = Date.now() - _logT0;
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                console.log('   ⚠️ Early exit — insufficient diamonds');
                console.log('   ⏱️ Elapsed: ' + _diaElapsed + 'ms');
                console.groupEnd();
                callback({}, 1); return; 
            }
            _processSteps.push({ step: 'checkDiamond', status: '✅ OK', detail: 'balance=' + diamondBal + ', cost=' + costNum });
            // Deduct diamond
            setBal(savedData, 101, diamondBal - costNum);
            goldGain = Math.floor(costNum * price * times);
        }

        // 6. Add gold (item 102)
        var oldGold = getBal(savedData, 102);
        var newGold = oldGold + goldGain;
        setBal(savedData, 102, newGold);

        // 7. Update buy count
        savedData.scheduleInfo._goldBuyCount = buyCount + 1;
        _processSteps.push({ step: 'updateCount', status: '✅ OK', detail: 'newCount=' + (buyCount+1) });

        // 8. Persist
        db._set('user:' + userId, savedData);
        _processSteps.push({ step: 'persist', status: '✅ OK' });

        console.table(_processSteps);
        console.groupEnd();

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        var _respElapsed = Date.now() - _logT0;
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');

        // 9. Response — _changeInfo._items (OBJECT format, ABSOLUTE balance)
        var changeItems = {};
        changeItems['102'] = { _id: 102, _num: newGold };
        if (costNum > 0) {
            changeItems['101'] = { _id: 101, _num: getBal(savedData, 101) };
        }

        callback({ _changeInfo: { _items: changeItems } });

        console.log('   ✅ Gold purchase response built');
        console.log('   📊 goldGain: ' + goldGain);
        console.log('   📊 newGoldBalance: ' + newGold);
        console.log('   📊 buyCount: ' + (buyCount + 1));
        console.log('   ⏱️  Total elapsed: ' + _respElapsed + 'ms');
        console.groupEnd();
    });

    window.MainServer = MainServer;
})();