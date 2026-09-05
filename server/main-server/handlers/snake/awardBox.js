/**
 * handlers/snake/awardBox.js — Snake Dungeon Award Box Handler
 * Super Warrior Z — MAIN SERVER
 *
 * ═══════════════════════════════════════════════════════════════════════
 * HANDLER: snake/awardBox
 * ═══════════════════════════════════════════════════════════════════════
 *
 * TUGAS UTAMA:
 *   Claim reward box di snake dungeon. User tap box reward → server
 *   validasi → kasih reward → update _gotRewardBox.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CLIENT CALL SITE (L135803)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   ts.processHandler({
 *       type: "snake", action: "awardBox",
 *       userId: <userId>,
 *       boxId: e,              // box ID (1-4)
 *       version: "1.0"
 *   }, function(e) {
 *       SnakeManager.getInstance().setRewardBoxGot(e);  // e._gotRewardBox
 *       ItemsCommonSingleton.getInstance().openCommonItemGetTips(e._changeInfo._items, [], n)
 *   })
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RESPONSE FORMAT (verified L135809 + setRewardBoxGot L86476)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   callback({
 *       _changeInfo: {
 *           _items: { "<itemId>": { _id, _num } }   // ABSOLUTE balance
 *       },
 *       _gotRewardBox: [<number>, ...]   // array of ALL claimed box IDs
 *   })
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

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

    function getSnakeChestConfig() { return loadJsonSync('snakeChest'); }

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

    function handleAwardBox(request, callback) {

        var _logT0 = Date.now();
        
        console.groupCollapsed('%c🐍 SNAKE awardBox', 'color:#2E7D32;font-weight:bold;font-size:12px;background:#E8F5E9;padding:4px 8px;border-radius:6px;border-left:4px solid #2E7D32;');
        var userId = request && request.userId;
        var boxId = Number(request && request.boxId);

        log.info('SNAKE', 'snake/awardBox START — userId=' + (userId || '-')
            + ', boxId=' + boxId);

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
                
                callback({}, 1);
                return;
            }
            console.log('   ✅ userId present: ' + userId);

            if (!boxId || boxId < 1 || boxId > 4) {
                console.warn('   ❌ Invalid boxId: ' + boxId);
                console.groupEnd(); // close Validation
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (invalid boxId)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                log.warn('SNAKE', 'awardBox — invalid boxId: ' + boxId);
                callback({}, 1); return;
            }
            console.log('   ✅ boxId valid: ' + boxId);
            console.groupEnd(); // close Validation

            // ═══ AWARD BOX PROCESSING ═══
            console.groupCollapsed('%c🐍 Award Box Processing', 'color:#0277BD;font-weight:bold;');

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
            var curLess = snake._curLess || 1;
            var passLess = snake._passLess || 0;
            var gotRewardBox = snake._gotRewardBox || [];

            // Load chest config
            var chestConfig = getSnakeChestConfig();
            if (!chestConfig) {
                console.warn('   ❌ Chest config not found');
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (config not found)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                callback({}, 1); return;
            }

            var boxConfig = chestConfig[String(boxId)];
            if (!boxConfig) {
                console.warn('   ❌ Box config not found for id: ' + boxId);
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (box config not found)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                callback({}, 1); return;
            }

            var lessonNeeded = Number(boxConfig.lessonNeeded) || 0;

            // Validate: stage already passed
            if (passLess < lessonNeeded) {
                console.warn('   ❌ Stage not reached: passLess=' + passLess + ' lessonNeeded=' + lessonNeeded);
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=0 (stage not reached)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                log.warn('SNAKE', 'awardBox — stage not reached: passLess=' + passLess
                    + ' lessonNeeded=' + lessonNeeded);
                callback({});
                return;
            }

            // Validate: not already claimed
            if (gotRewardBox.indexOf(boxId) !== -1) {
                console.warn('   ❌ Box already claimed: ' + boxId);
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (already claimed)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                log.warn('SNAKE', 'awardBox — box already claimed: ' + boxId);
                callback({}, 1); return;
            }

            // Give reward
            var rewardItemId = Number(boxConfig.award1) || 113;
            var rewardNum = Number(boxConfig.num1) || 10;

            var currentBalance = getItemBalance(savedData, rewardItemId);
            var newBalance = currentBalance + rewardNum;
            setItemBalance(savedData, rewardItemId, newBalance);

            // Update gotRewardBox
            gotRewardBox.push(boxId);
            snake._gotRewardBox = gotRewardBox;

            // Persist
            db._set(storageKey, savedData);

            console.log('   ✅ Reward given: item=' + rewardItemId + ' x' + rewardNum + ' balance=' + currentBalance + '→' + newBalance);

            // Build response
            var changeItems = {};
            changeItems[String(rewardItemId)] = { _id: rewardItemId, _num: newBalance };

            var response = {
                _changeInfo: { _items: changeItems },
                _gotRewardBox: gotRewardBox
            };

            log.info('SNAKE', 'awardBox SUCCESS — box=' + boxId
                + ', reward=' + rewardItemId + 'x' + rewardNum
                + ', balance=' + currentBalance + '→' + newBalance
                + ', gotRewardBox=[' + gotRewardBox.join(',') + ']');

            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | box=' + boxId + ' reward=' + rewardItemId + 'x' + rewardNum);
            console.table({
                'Award': { boxId: boxId, itemId: rewardItemId, amount: rewardNum, oldBal: currentBalance, newBal: newBalance },
                'State': { totalClaimed: gotRewardBox.length }
            });
            console.groupEnd();
            console.groupEnd(); // close SNAKE group

            callback(response);

        } catch (err) {
            console.error('   ❌ UNCAUGHT ERROR: ' + err.message);
            console.groupEnd(); // close any open groups
            console.groupEnd(); // close SNAKE group
            
            log.error('SNAKE', 'awardBox UNCAUGHT ERROR — '
                + (err && err.name) + ': ' + (err && err.message));
            callback({}, 1);
        }
    }

    MainServer.registerHandler('snake', 'awardBox', handleAwardBox);
})();
