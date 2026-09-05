/**
 * handlers/friend/addToBlacklist.js — Add to Blacklist (action LANGSUNG)
 * Super Warrior Z — MAIN SERVER
 *
 * ═══ CLIENT EVIDENCE (main.min.js) ═══
 *
 *   ts.processHandler({type:"friend",action:"addToBlacklist",userId:o,
 *     targetUserId:e,version:"1.0"},function(o){
 *       BroadcastSingleton.getInstance().addBlackList(e),   ← pakai closure, bukan response
 *       for(var a in n.myFriend) if(n.myFriend[a].userId==e){ n.myFriend.splice(...) }
 *       ...})}
 *
 *   ⚠️ FIELD REQUEST = targetUserId (BUKAN friendId seperti jalur relay!)
 *   ⚠️ TYPO resmi client untuk remove = "removeBalcklist" (huruf c kelebihan)
 *
 *   Response tidak dipakai client → ack {} cukup.
 *
 * LOGIKA: 100% sama dengan handleAddToBlacklist di friendServerAction.js:
 *   - Hapus dari friends (implicit remove friend)
 *   - Hapus dari applyList
 *   - Tambah ke blacklist
 *   - Hapus messages
 *
 * Request : { type:'friend', action:'addToBlacklist', userId, targetUserId, version:'1.0' }
 * Response: {} (ack only)
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    // ═══════════════════════════════════════════════════════════════
    // HELPER — identik dengan friendServerAction.js
    // ═══════════════════════════════════════════════════════════════

    function getFriendData(userId) {
        var key = 'friend:' + userId;
        var data = db._get(key);
        if (!data) {
            data = { friends: [], blacklist: [], applyList: [], messages: {}, inviteMessages: [] };
            db._set(key, data);
        }
        return data;
    }

    function saveFriendData(userId, data) {
        db._set('friend:' + userId, data);
    }

    function isValidUserId(userId) {
        return userId && typeof userId === 'string' && userId.trim().length > 0;
    }

    function toString(val) {
        if (val === null || val === undefined) return '';
        return String(val);
    }

    // ═══════════════════════════════════════════════════════════════
    // MAIN HANDLER: friend/addToBlacklist
    // ═══════════════════════════════════════════════════════════════

    function handleAddToBlacklistDirect(request, callback) {
        var _logT0 = Date.now();

        var userId = request.userId;
        var targetUserId = request.targetUserId;

        log.info('HANDLER', 'friend/addToBlacklist processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['targetUserId', targetUserId || '-']
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

        if (!isValidUserId(toString(targetUserId))) {
            _validationChecks.push({ check: 'targetUserId', result: '❌ MISSING OR INVALID' });
        } else {
            _validationChecks.push({ check: 'targetUserId', result: '✅ OK (' + targetUserId + ')' });
        }

        console.table(_validationChecks);
        console.groupEnd();

        if (!isValidUserId(toString(userId))) {
            callback({ _error: 'missing_userId' });
            return;
        }

        if (!isValidUserId(toString(targetUserId))) {
            callback({});
            return;
        }

        userId = toString(userId);
        var targetId = toString(targetUserId);

        // ═══════════════════════════════════════════════════════════
        //  ⛔ ADD TO BLACKLIST PROCESSING (paten: friendServerAction.js)
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c⛔ Add To Blacklist Processing', 'color:#F44336;font-weight:bold;');
        var _processSteps = [];

        var data = getFriendData(userId);

        // Hapus dari friend list (jika ada) — client juga splice myFriend sendiri
        var fIdx = data.friends.indexOf(targetId);
        if (fIdx !== -1) {
            data.friends.splice(fIdx, 1);
            _processSteps.push({ step: 'removeFromFriends', status: '✅ OK', detail: targetId });
            log.info('HANDLER', 'addToBlacklist → removed from friends first: ' + targetId);
        }

        // Hapus dari apply list (jika ada)
        var aIdx = data.applyList.indexOf(targetId);
        if (aIdx !== -1) {
            data.applyList.splice(aIdx, 1);
            _processSteps.push({ step: 'removeFromApplyList', status: '✅ OK', detail: targetId });
            log.info('HANDLER', 'addToBlacklist → removed from applyList: ' + targetId);
        }

        // Tambahkan ke blacklist
        if (data.blacklist.indexOf(targetId) === -1) {
            data.blacklist.push(targetId);
            _processSteps.push({ step: 'addToBlacklist', status: '✅ OK', detail: targetId });
            log.info('HANDLER', 'addToBlacklist → added to blacklist: ' + targetId);
        }

        // Hapus messages
        if (data.messages[targetId]) {
            delete data.messages[targetId];
            _processSteps.push({ step: 'clearMessages', status: '✅ OK', detail: targetId });
        }

        saveFriendData(userId, data);

        console.table(_processSteps);
        console.groupEnd();

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        var _respElapsed = Date.now() - _logT0;
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        console.log('   ✅ Add to blacklist response built (ack only)');
        console.log('   📊 targetUserId: ' + targetId);
        console.log('   ⏱️  Total elapsed: ' + _respElapsed + 'ms');
        console.groupEnd();

        callback({});
    }

    // ═══════════════════════════════════════════════════════════════
    // REGISTER
    // ═══════════════════════════════════════════════════════════════

    MainServer.registerHandler('friend', 'addToBlacklist', handleAddToBlacklistDirect);

    window.MainServer = MainServer;
})();
