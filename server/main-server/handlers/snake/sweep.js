/**
 * handlers/snake/sweep.js — Snake Dungeon Sweep Handler
 * Super Warrior Z — MAIN SERVER
 *
 * ═══════════════════════════════════════════════════════════════════════
 * HANDLER: snake/sweep
 * ═══════════════════════════════════════════════════════════════════════
 *
 * TUGAS UTAMA:
 *   Sweep (quick clear) snake dungeon. User bayar diamond untuk auto-clear
 *   semua stage yang sudah di-pass, dapat semua reward + box dalam 1 klik.
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    var ITEM_DIAMOND = 101;

    function userStorageKey(userId) {
        return 'user:' + userId;
    }

    function loadSnakeState(savedData) {
        if (!savedData.snake) {
            savedData.snake = {
                _id: '', _curLess: 1, _passLess: 0,
                _allTeam: {}, _gotRewardBox: []
            };
        }
        if (!savedData.snake._gotRewardBox) savedData.snake._gotRewardBox = [];
        return savedData.snake;
    }

    var _resourceCache = {};
    function loadJsonSync(name) {
        if (_resourceCache[name]) return _resourceCache[name];
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './resource/json/' + name + '.json', false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                _resourceCache[name] = JSON.parse(xhr.responseText);
                return _resourceCache[name];
            }
        } catch (e) {}
        return null;
    }

    function getSnakeDungeonConfig() { return loadJsonSync('snakeDungeon'); }
    function getSnakeChestConfig() { return loadJsonSync('snakeChest'); }
    function getSnakeWipeConfig() { return loadJsonSync('snakeWipe'); }

    function getItemBalance(savedData, itemId) {
        if (!savedData.totalProps || !savedData.totalProps._items) return 0;
        var items = savedData.totalProps._items;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(itemId)) return Number(items[i]._num) || 0;
        }
        return 0;
    }

    function setItemBalance(savedData, itemId, newBalance) {
        if (!savedData.totalProps) savedData.totalProps = {};
        if (!savedData.totalProps._items) savedData.totalProps._items = [];
        var items = savedData.totalProps._items;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(itemId)) { items[i]._num = newBalance; return; }
        }
        items.push({ _id: itemId, _num: newBalance });
    }

    function handleSweep(request, callback) {

        var _logT0 = Date.now();
        
        console.groupCollapsed('%c🐍 SNAKE sweep', 'color:#2E7D32;font-weight:bold;font-size:12px;background:#E8F5E9;padding:4px 8px;border-radius:6px;border-left:4px solid #2E7D32;');
        var userId = request && request.userId;

        log.info('SNAKE', 'snake/sweep START — userId=' + (userId || '-'));

        try {

            // ═══ VALIDATION ═══
            console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');

            if (!userId) {
                console.warn('   ❌ Missing userId');
                console.groupEnd(); // close Validation
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (missing userId)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                callback({}, 1); return;
            }
            console.log('   ✅ userId present: ' + userId);
            console.groupEnd(); // close Validation

            // ═══ SWEEP PROCESSING ═══
            console.groupCollapsed('%c🐍 Sweep Processing', 'color:#0277BD;font-weight:bold;');

            var storageKey = userStorageKey(userId);
            var savedData = db._get(storageKey);
            if (!savedData) {
                console.warn('   ❌ User data not found');
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (no user data)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                callback({}, 1); return;
            }

            var snake = loadSnakeState(savedData);
            var passLess = snake._passLess || 0;

            // Must have passed at least 1 stage
            if (passLess < 1) {
                console.warn('   ❌ No stages passed yet (passLess=' + passLess + ')');
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=0 (no stages passed)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                log.warn('SNAKE', 'sweep — no stages passed yet (passLess=' + passLess + ')');
                callback({});
                return;
            }

            // Load configs
            var dungeonConfig = getSnakeDungeonConfig();
            var chestConfig = getSnakeChestConfig();
            if (!dungeonConfig || !chestConfig) {
                console.error('   ❌ Configs not found');
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (config error)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                callback({}, 1); return;
            }

            // ── Calculate rewards ──
            var rewards = {};

            for (var s = 1; s <= passLess; s++) {
                var stage = dungeonConfig[String(s)];
                if (!stage) continue;
                var awardId = Number(stage.award1) || 113;
                var awardNum = Number(stage.num1) || 10;
                rewards[awardId] = (rewards[awardId] || 0) + awardNum;
            }

            // Add all chest box rewards
            for (var b in chestConfig) {
                if (!chestConfig.hasOwnProperty(b)) continue;
                var box = chestConfig[b];
                var lessonNeeded = Number(box.lessonNeeded) || 0;
                if (lessonNeeded <= passLess) {
                    var boxAwardId = Number(box.award1) || 113;
                    var boxAwardNum = Number(box.num1) || 0;
                    rewards[boxAwardId] = (rewards[boxAwardId] || 0) + boxAwardNum;
                }
            }

            // ── Deduct diamond cost ──
            var wipeConfig = getSnakeWipeConfig();
            var wipePrice = 200;
            if (wipeConfig) {
                var wipeEntry = wipeConfig['1'];
                if (wipeEntry) wipePrice = Number(wipeEntry.snakeWipePrice) || 200;
            }

            var diamondBalance = getItemBalance(savedData, ITEM_DIAMOND);
            if (diamondBalance < wipePrice) {
                console.warn('   ❌ Not enough diamonds: have=' + diamondBalance + ' need=' + wipePrice);
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=0 (not enough diamonds)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                log.warn('SNAKE', 'sweep — not enough diamonds: have=' + diamondBalance + ' need=' + wipePrice);
                callback({});
                return;
            }

            var newDiamondBalance = diamondBalance - wipePrice;
            setItemBalance(savedData, ITEM_DIAMOND, newDiamondBalance);

            // ── Add rewards to inventory ──
            var changeItems = {};
            changeItems[String(ITEM_DIAMOND)] = { _id: ITEM_DIAMOND, _num: newDiamondBalance };

            for (var itemId in rewards) {
                if (!rewards.hasOwnProperty(itemId)) continue;
                var amount = rewards[itemId];
                var currentBal = getItemBalance(savedData, Number(itemId));
                var newBal = currentBal + amount;
                setItemBalance(savedData, Number(itemId), newBal);
                changeItems[String(itemId)] = { _id: Number(itemId), _num: newBal };
            }

            // ── Reset snake state ──
            snake._curLess = 1;
            snake._allTeam = {};
            snake._gotRewardBox = [];

            // ── Persist ──
            db._set(storageKey, savedData);

            console.log('   ✅ Sweep complete: diamond=' + diamondBalance + '→' + newDiamondBalance + ' rewards=' + Object.keys(rewards).length);

            log.info('SNAKE', 'sweep SUCCESS — passLess=' + passLess
                + ', diamond=' + diamondBalance + '→' + newDiamondBalance
                + ', rewards=[' + Object.keys(rewards).join(', ') + ']'
                + ', snake reset to curLess=1 passLess=0');

            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | passLess=' + passLess + ' cost=' + wipePrice + 'diamonds');
            console.table({
                'Sweep': { passLess: passLess, diamondCost: wipePrice, oldBal: diamondBalance, newBal: newDiamondBalance },
                'Rewards': { types: Object.keys(rewards).length }
            });
            console.groupEnd();
            console.groupEnd(); // close SNAKE group

            var response = {
                _changeInfo: { _items: changeItems }
            };

            callback(response);

        } catch (err) {
            console.error('   ❌ UNCAUGHT ERROR: ' + err.message);
            console.groupEnd(); // close any open groups
            console.groupEnd(); // close SNAKE group
            
            log.error('SNAKE', 'sweep UNCAUGHT ERROR — '
                + (err && err.name) + ': ' + (err && err.message));
            callback({}, 1);
        }
    }

    MainServer.registerHandler('snake', 'sweep', handleSweep);
})();
