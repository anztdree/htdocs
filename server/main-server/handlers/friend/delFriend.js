/**
 * handlers/friend/delFriend.js — Delete Friend (action LANGSUNG)
 * Super Warrior Z — MAIN SERVER
 *
 * ═══ CLIENT EVIDENCE (main.min.js) ═══
 *
 *   ts.processHandler({type:"friend",action:"delFriend",userId:t,
 *     friendId:o,version:"1.0"},function(e){
 *       FriendManager.getInstance().delectFriendData(e.friendId),      ← e.friendId!
 *       MailInfoManager.getInstance().clearOneFriendMessage(e.friendId),
 *       var t=ts.getCurrentNode();t instanceof FriendHeat&&t.doRefresh()})}
 *
 *   → RESPONSE WAJIB: { friendId: <yang dihapus> } (client pakai e.friendId)
 *     (beda dengan jalur relay friendServerAction yang ack {} saja)
 *
 * LOGIKA: 100% sama dengan handleDelFriend di friendServerAction.js:
 *   - Hapus dari friend list user + target (DUA ARAH)
 *   - Hapus messages dengan friend tsb
 *
 * Request : { type:'friend', action:'delFriend', userId, friendId, version:'1.0' }
 * Response: { friendId: friendId }
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
    // MAIN HANDLER: friend/delFriend
    // ═══════════════════════════════════════════════════════════════

    function handleDelFriendDirect(request, callback) {
        var _logT0 = Date.now();

        var userId = request.userId;
        var friendId = request.friendId;

        log.info('HANDLER', 'friend/delFriend processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['friendId', friendId || '-']
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

        if (!isValidUserId(toString(friendId))) {
            _validationChecks.push({ check: 'friendId', result: '❌ MISSING OR INVALID' });
        } else {
            _validationChecks.push({ check: 'friendId', result: '✅ OK (' + friendId + ')' });
        }

        console.table(_validationChecks);
        console.groupEnd();

        if (!isValidUserId(toString(userId))) {
            callback({ _error: 'missing_userId' });
            return;
        }

        if (!isValidUserId(toString(friendId))) {
            callback({});
            return;
        }

        userId = toString(userId);
        friendId = toString(friendId);

        // ═══════════════════════════════════════════════════════════
        //  🗑️ DEL FRIEND PROCESSING (paten: friendServerAction.js)
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c🗑️ Del Friend Processing', 'color:#F44336;font-weight:bold;');
        var _processSteps = [];

        // Hapus dari friend list user
        var data = getFriendData(userId);
        var idx = data.friends.indexOf(friendId);
        if (idx !== -1) {
            data.friends.splice(idx, 1);
            _processSteps.push({ step: 'removeFromSelf', status: '✅ OK', detail: friendId });
            log.info('HANDLER', "delFriend → removed from user's friends: " + friendId);
        } else {
            _processSteps.push({ step: 'removeFromSelf', status: '⚠️ NOT FOUND', detail: friendId });
        }

        // Hapus dari friend list target juga (DUA ARAH!)
        var targetData = getFriendData(friendId);
        var tIdx = targetData.friends.indexOf(userId);
        if (tIdx !== -1) {
            targetData.friends.splice(tIdx, 1);
            _processSteps.push({ step: 'removeFromTarget', status: '✅ OK', detail: userId });
            log.info('HANDLER', "delFriend → also removed from target's friends: " + friendId);
        }
        saveFriendData(friendId, targetData);

        // Hapus juga messages (sesuai client behavior: clearOneFriendMessage)
        if (data.messages[friendId]) {
            delete data.messages[friendId];
            _processSteps.push({ step: 'clearMessages', status: '✅ OK', detail: friendId });
            log.info('HANDLER', 'delFriend → cleared messages with: ' + friendId);
        }
        saveFriendData(userId, data);

        console.table(_processSteps);
        console.groupEnd();

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        var _respElapsed = Date.now() - _logT0;
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        console.log('   ✅ Del friend response built ({friendId} — dipakai client)');
        console.log('   📊 friendId: ' + friendId);
        console.log('   ⏱️  Total elapsed: ' + _respElapsed + 'ms');
        console.groupEnd();

        callback({ friendId: friendId });
    }

    // ═══════════════════════════════════════════════════════════════
    // REGISTER
    // ═══════════════════════════════════════════════════════════════

    MainServer.registerHandler('friend', 'delFriend', handleDelFriendDirect);

    window.MainServer = MainServer;
})();
