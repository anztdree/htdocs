/**
 * handlers/friend/removeBalcklist.js — Remove from Blacklist (action LANGSUNG)
 * Super Warrior Z — MAIN SERVER
 *
 * ═══ CLIENT EVIDENCE (main.min.js) ═══
 *
 *   ts.processHandler({type:"friend",action:"removeBalcklist",userId:t,
 *     targetUserId:a,version:"1.0"},function(e){
 *       FriendManager.getInstance().removeBlacklist(a),     ← pakai closure
 *       BroadcastSingleton.getInstance().removeBlacklist(a),
 *       var t=ts.getCurrentNode();t instanceof AddBlacklist&&t.doRefresh()})}
 *
 *   ⚠️ ACTION NAME = "removeBalcklist" — TYPO RESMI dari client (huruf 'c'
 *      kelebihan). Server HARUS match exact spelling ini. (Pola sama dgn relay.)
 *   ⚠️ FIELD REQUEST = targetUserId (BUKAN friendId)
 *
 *   Response tidak dipakai client → ack {} cukup.
 *
 * LOGIKA: 100% sama dengan handleRemoveFromBlacklist di friendServerAction.js:
 *   - Hapus dari blacklist user
 *
 * Request : { type:'friend', action:'removeBalcklist', userId, targetUserId, version:'1.0' }
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
    // MAIN HANDLER: friend/removeBalcklist  (typo resmi client)
    // ═══════════════════════════════════════════════════════════════

    function handleRemoveFromBlacklistDirect(request, callback) {
        var _logT0 = Date.now();

        var userId = request.userId;
        var targetUserId = request.targetUserId;

        log.info('HANDLER', 'friend/removeBalcklist processing');
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
        //  ☑️ REMOVE FROM BLACKLIST PROCESSING (paten: friendServerAction.js)
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c☑️ Remove From Blacklist Processing', 'color:#0277BD;font-weight:bold;');
        var _processSteps = [];

        var data = getFriendData(userId);

        var idx = data.blacklist.indexOf(targetId);
        if (idx !== -1) {
            data.blacklist.splice(idx, 1);
            _processSteps.push({ step: 'removeFromBlacklist', status: '✅ OK', detail: targetId });
            log.info('HANDLER', 'removeBalcklist → removed from blacklist: ' + targetId);
        } else {
            _processSteps.push({ step: 'removeFromBlacklist', status: '⚠️ NOT FOUND', detail: targetId });
            log.warn('HANDLER', 'removeBalcklist — not in blacklist: ' + targetId);
        }

        saveFriendData(userId, data);

        console.table(_processSteps);
        console.groupEnd();

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        var _respElapsed = Date.now() - _logT0;
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        console.log('   ✅ Remove from blacklist response built (ack only)');
        console.log('   📊 targetUserId: ' + targetId);
        console.log('   ⏱️  Total elapsed: ' + _respElapsed + 'ms');
        console.groupEnd();

        callback({});
    }

    // ═══════════════════════════════════════════════════════════════
    // REGISTER
    // ═══════════════════════════════════════════════════════════════

    MainServer.registerHandler('friend', 'removeBalcklist', handleRemoveFromBlacklistDirect);

    window.MainServer = MainServer;
})();
