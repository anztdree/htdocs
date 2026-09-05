/**
 * handlers/friend/findUserBrief.js — Find User Brief (search by ID / name)
 * Super Warrior Z — MAIN SERVER
 *
 * ═══ CLIENT EVIDENCE (main.min.js) ═══
 *
 *   ts.processHandler({type:"friend",action:"findUserBrief",findType:1,
 *     idOrName:t,userId:n,version:"1.0"},
 *     function(e){
 *       ts.openWindow("FindFriendPage",{parent:"Friend",
 *         playerId:e._id, playerName:e._nickName,
 *         level:e._level, headImage:e._headImage})},
 *     function(e){
 *       ts.openWindow("BarTypeTips",{parent:"Tips",
 *         value:ToolCommon.getLanguageWithEditor("friendFind","id4")})})
 *
 *   → SUCCESS response: { _id, _nickName, _level, _headImage, ... }
 *   → NOT FOUND: ret=1 → client error callback → tips "tidak ditemukan"
 *   → findType:1 satu-satunya varian di main.min.js (idOrName bisa ID atau nama)
 *
 * STRUKTUR: pakai _getAllKeys (index.js bridge) untuk scan user:* by nickname.
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    var ITEM_IDS = {
        PLAYERLEVELID: 104,
        PLAYERVIPLEVELID: 106
    };

    // ═══════════════════════════════════════════════════════════════
    // HELPER — pola friendServerAction.js (FSUser) + natural online
    // ═══════════════════════════════════════════════════════════════

    function buildBrief(userId, userData) {
        var level = 1;
        var vip = 0;
        if (userData && userData.totalProps && userData.totalProps._items) {
            var items = userData.totalProps._items;
            for (var i = 0; i < items.length; i++) {
                var itemId = Number(items[i]._id);
                var itemNum = Number(items[i]._num) || 0;
                if (itemId === ITEM_IDS.PLAYERLEVELID) level = itemNum || 1;
                if (itemId === ITEM_IDS.PLAYERVIPLEVELID) vip = itemNum || 0;
            }
        }

        var onlineState = (MainServer.getUserOnlineState ? MainServer.getUserOnlineState(String(userId)) : null);

        return {
            _id: String(userId),
            _nickName: (userData && userData.user && userData.user._nickName) || 'Player',
            _headImage: (userData && userData.user && userData.user._headImage) || 'hero_icon_1205',
            _headEffect: (userData && userData.user && userData.user._headEffect !== undefined) ? userData.user._headEffect : 0,
            _headBox: (userData && userData.user && userData.user._headBox !== undefined) ? userData.user._headBox : 0,
            _oriServerId: (userData && userData.user && userData.user._oriServerId) ? Number(userData.user._oriServerId) : 1,
            _serverId: 1,
            _level: level,
            _vip: vip,
            _totalPower: (userData && userData.totalPower) || 0,
            _online: (onlineState ? onlineState.online : true),
            _offlineTime: (onlineState ? onlineState.offlineTime : 0)
        };
    }

    function isValidUserId(userId) {
        return userId && typeof userId === 'string' && userId.trim().length > 0;
    }

    function toString(val) {
        if (val === null || val === undefined) return '';
        return String(val);
    }

    // ═══════════════════════════════════════════════════════════════
    // MAIN HANDLER: friend/findUserBrief
    // ═══════════════════════════════════════════════════════════════

    function handleFindUserBrief(request, callback) {
        var _logT0 = Date.now();

        var userId = request.userId;
        var idOrName = toString(request.idOrName).trim();

        log.info('HANDLER', 'friend/findUserBrief processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['findType', request.findType || '-'],
            ['idOrName', idOrName || '-']
        ]);

        // ═══════════════════════════════════════════════════════════
        //  ✅ VALIDATION
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var _validationChecks = [];

        if (!isValidUserId(toString(userId))) {
            _validationChecks.push({ check: 'userId', result: '❌ MISSING OR INVALID' });
        } else {
            _validationChecks.push({ check: 'userId', result: '✅ OK' });
        }

        if (!idOrName) {
            _validationChecks.push({ check: 'idOrName', result: '❌ MISSING' });
        } else {
            _validationChecks.push({ check: 'idOrName', result: '✅ OK ("' + idOrName + '")' });
        }

        console.table(_validationChecks);
        console.groupEnd();

        if (!isValidUserId(toString(userId)) || !idOrName) {
            callback({}, 1);
            return;
        }

        // ═══════════════════════════════════════════════════════════
        //  🔍 FIND USER PROCESSING
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c🔍 Find User Processing', 'color:#0277BD;font-weight:bold;');
        var _processSteps = [];

        var found = null;
        var foundId = '';
        var foundBy = '';

        // 1) Cari by userId (exact)
        var byId = db._get('user:' + idOrName);
        if (byId && byId.user) {
            found = byId;
            foundId = idOrName;
            foundBy = 'userId';
        } else {
            // 2) Cari by nickName (exact match, scan user:* via _getAllKeys)
            var allKeys = (db._getAllKeys ? db._getAllKeys() : []);
            for (var i = 0; i < allKeys.length; i++) {
                var key = allKeys[i];
                if (key.indexOf('user:') !== 0) continue;
                var candidateId = key.substring('user:'.length);
                var candidate = db._get(key);
                if (candidate && candidate.user && candidate.user._nickName === idOrName) {
                    found = candidate;
                    foundId = candidateId;
                    foundBy = 'nickName';
                    break;
                }
            }
        }

        if (found) {
            _processSteps.push({ step: 'search', status: '✅ FOUND', detail: foundBy + ' → ' + foundId });
        } else {
            _processSteps.push({ step: 'search', status: '❌ NOT FOUND', detail: idOrName });
        }

        console.table(_processSteps);
        console.groupEnd();

        if (!found) {
            log.info('HANDLER', 'findUserBrief → not found: "' + idOrName + '"');
            var _elapsed = Date.now() - _logT0;
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            console.log('   ❌ Not found → ret=1 (client: tips friendFind id4)');
            console.log('   ⏱️  Total elapsed: ' + _elapsed + 'ms');
            console.groupEnd();
            callback({}, 1);
            return;
        }

        var brief = buildBrief(foundId, found);

        log.info('HANDLER', 'findUserBrief → found by ' + foundBy + ': "' + foundId + '"');

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        var _respElapsed = Date.now() - _logT0;
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        console.log('   ✅ Find user brief response built');
        console.log('   📊 _id: ' + brief._id + ' · _nickName: ' + brief._nickName + ' · _level: ' + brief._level);
        console.log('   ⏱️  Total elapsed: ' + _respElapsed + 'ms');
        console.groupEnd();

        callback(brief);
    }

    // ═══════════════════════════════════════════════════════════════
    // REGISTER
    // ═══════════════════════════════════════════════════════════════

    MainServer.registerHandler('friend', 'findUserBrief', handleFindUserBrief);

    window.MainServer = MainServer;
})();
