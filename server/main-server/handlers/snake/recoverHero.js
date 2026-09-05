/**
 * handlers/snake/recoverHero.js — Snake Dungeon Hero Recovery Handler
 * Super Warrior Z — MAIN SERVER
 *
 * ═══════════════════════════════════════════════════════════════════════
 * HANDLER: snake/recoverHero
 * ═══════════════════════════════════════════════════════════════════════
 *
 * TUGAS UTAMA:
 *   Recover hero HP/energy di snake dungeon. User pakai item 146 (Bean)
 *   untuk restore hero yang sudah mati/low HP kembali ke full.
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    var BEAN_ID = 146;

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
        if (!savedData.snake._allTeam) savedData.snake._allTeam = {};
        return savedData.snake;
    }

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

    function handleRecoverHero(request, callback) {

        var _logT0 = Date.now();
        
        console.groupCollapsed('%c🐍 SNAKE recoverHero', 'color:#2E7D32;font-weight:bold;font-size:12px;background:#E8F5E9;padding:4px 8px;border-radius:6px;border-left:4px solid #2E7D32;');
        var userId = request && request.userId;
        var heroIds = request && request.heroIds;

        log.info('SNAKE', 'snake/recoverHero START — userId=' + (userId || '-')
            + ', heroes=' + (heroIds ? heroIds.length : 0));

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

            if (!heroIds || !Array.isArray(heroIds) || heroIds.length === 0) {
                console.warn('   ❌ Missing or empty heroIds');
                console.groupEnd(); // close Validation
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (no heroIds)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                callback({}, 1); return;
            }
            console.log('   ✅ heroIds valid: [' + heroIds.join(',') + '] (' + heroIds.length + ' heroes)');
            console.groupEnd(); // close Validation

            // ═══ HERO RECOVERY PROCESSING ═══
            console.groupCollapsed('%c🐍 Hero Recovery Processing', 'color:#0277BD;font-weight:bold;');

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
            var allTeam = snake._allTeam || {};

            // Validate bean balance
            var beanBalance = getItemBalance(savedData, BEAN_ID);
            var cost = heroIds.length;  // 1 bean per hero

            if (beanBalance < cost) {
                console.warn('   ❌ Not enough beans: have=' + beanBalance + ' need=' + cost);
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=0 (not enough beans)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                log.warn('SNAKE', 'recoverHero — not enough beans: have=' + beanBalance + ' need=' + cost);
                callback({});
                return;
            }

            // Recover each hero: set curHp = totalHp, energy = 50
            for (var i = 0; i < heroIds.length; i++) {
                var heroId = String(heroIds[i]);
                var heroState = allTeam[heroId];
                if (heroState) {
                    heroState._curHp = heroState._totalHp || 0;
                    heroState._energy = 50;
                    log.info('SNAKE', 'recoverHero — hero ' + heroId
                        + ' recovered to HP=' + heroState._curHp + '/' + heroState._totalHp);
                } else {
                    log.warn('SNAKE', 'recoverHero — hero ' + heroId + ' not in _allTeam, skip');
                }
            }

            // Deduct beans
            var newBeanBalance = beanBalance - cost;
            setItemBalance(savedData, BEAN_ID, newBeanBalance);

            // Persist
            db._set(storageKey, savedData);

            console.log('   ✅ Heroes recovered: ' + heroIds.length + ' beans=' + beanBalance + '→' + newBeanBalance);

            // Build response
            var changeItems = {};
            changeItems[String(BEAN_ID)] = { _id: BEAN_ID, _num: newBeanBalance };

            var response = {
                _allTeam: allTeam,
                _changeInfo: { _items: changeItems }
            };

            log.info('SNAKE', 'recoverHero SUCCESS — '
                + heroIds.length + ' heroes recovered'
                + ', beans=' + beanBalance + '→' + newBeanBalance);

            console.groupEnd(); // close Hero Recovery Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | heroes=' + heroIds.length + ' beans=' + beanBalance + '→' + newBeanBalance);
            console.table({
                'Recovery': { heroCount: heroIds.length, beanCost: cost, oldBal: beanBalance, newBal: newBeanBalance }
            });
            console.groupEnd();
            console.groupEnd(); // close SNAKE group

            callback(response);

        } catch (err) {
            console.error('   ❌ UNCAUGHT ERROR: ' + err.message);
            console.groupEnd(); // close any open groups
            console.groupEnd(); // close SNAKE group
            
            log.error('SNAKE', 'recoverHero UNCAUGHT ERROR — '
                + (err && err.name) + ': ' + (err && err.message));
            callback({}, 1);
        }
    }

    MainServer.registerHandler('snake', 'recoverHero', handleRecoverHero);
})();
