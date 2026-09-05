/**
 * handlers/friend/handleApply.js — Accept/Reject Friend Application
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * HANDLER: friend/handleApply  (action PATEN dari main.min.js)
 * ============================================================
 *
 * BUKTI main.min.js (ApplyForFriendListItem — tombol Setuju/Tolak
 * permintaan teman SE-SERVER):
 *
 *   t.prototype.handleApply=function(e){
 *     var t=this,n=t.data.applyFriendData,o=UserInfoSingleton.getInstance().userId;
 *     ts.processHandler({type:"friend",action:"handleApply",userId:o,agree:e,
 *       friendId:n.userId,version:"1.0"},function(o){
 *         e&&FriendManager.getInstance().temporaryAddToMyFriend(n),
 *         FriendManager.getInstance().removeApply(n.userId);
 *         var a=t.data.refresh;a()})}
 *
 * Client callback hanya butuh ACK — semua update UI dilakukan client
 * (temporaryAddToMyFriend + removeApply + refresh list).
 *
 * Request : { type:'friend', action:'handleApply',
 *             userId, agree:boolean, friendId, version:'1.0' }
 * Response: {} (ack only)
 *
 * LOGIKA: 100% sama dengan handleAcceptApply di
 *         handlers/friend/friendServerAction.js (case 'handleApply'):
 *   - Hapus pemohon dari applyList user (selalu, accept maupun reject)
 *   - agree=true  : tambah ke friends DUA ARAH (user<->friendId)
 *   - agree=false : hanya hapus dari applyList (REJECTED)
 *
 * Catatan: jalur relay (friendServerAction/relayAction:"handleApply")
 * tetap jalan seperti sebelumnya di friendServerAction.js — handler ini
 * untuk pemanggilan LANGSUNG type:"friend",action:"handleApply".
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
            data = {
                friends: [],
                blacklist: [],
                applyList: [],
                messages: {},
                inviteMessages: []
            };
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
    // MAIN HANDLER: friend/handleApply
    // ═══════════════════════════════════════════════════════════════

    function handleAcceptApply(request, callback) {
        var _logT0 = Date.now();

        var userId = request.userId;
        var friendId = request.friendId;
        var agree = request.agree;

        log.info('HANDLER', 'friend/handleApply processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['friendId', friendId || '-'],
            ['agree', agree]
        ]);

        // ═══════════════════════════════════════════════════════════
        //  ✅ VALIDATION
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var _validationChecks = [];

        if (!isValidUserId(toString(userId))) {
            _validationChecks.push({ check: 'userId', result: '❌ MISSING OR INVALID' });
            log.error('HANDLER', 'Missing/invalid userId in handleApply');
        } else {
            _validationChecks.push({ check: 'userId', result: '✅ OK' });
        }

        if (!isValidUserId(toString(friendId))) {
            _validationChecks.push({ check: 'friendId', result: '❌ MISSING OR INVALID' });
            log.warn('HANDLER', 'handleApply — no or invalid friendId');
        } else {
            _validationChecks.push({ check: 'friendId', result: '✅ OK (' + friendId + ')' });
        }

        _validationChecks.push({ check: 'agree', result: agree ? '✅ ACCEPT' : '➖ REJECT' });

        console.table(_validationChecks);
        console.groupEnd();

        if (!isValidUserId(toString(userId))) {
            var _elapsed = Date.now() - _logT0;
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            console.log('   ⚠️ Early exit — missing/invalid userId');
            console.log('   ⏱️ Elapsed: ' + _elapsed + 'ms');
            console.groupEnd();
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
        //  🤝 HANDLE APPLY PROCESSING (paten: friendServerAction.js)
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c🤝 Handle Apply Processing', 'color:#0277BD;font-weight:bold;');
        var _processSteps = [];

        var data = getFriendData(userId);

        // Hapus dari apply list (selalu dilakukan, baik accept maupun reject)
        var idx = data.applyList.indexOf(friendId);
        if (idx !== -1) {
            data.applyList.splice(idx, 1);
            _processSteps.push({ step: 'removeFromApplyList', status: '✅ OK', detail: friendId });
            log.info('HANDLER', 'handleApply → removed from applyList: ' + friendId);
        } else {
            _processSteps.push({ step: 'removeFromApplyList', status: '⚠️ NOT FOUND', detail: friendId });
            log.warn('HANDLER', 'handleApply — friendId not in applyList: ' + friendId);
        }

        if (agree) {
            // ✅ ACCEPT: Tambahkan ke friend list USER
            if (data.friends.indexOf(friendId) === -1) {
                data.friends.push(friendId);
                _processSteps.push({ step: 'addFriend(self)', status: '✅ OK', detail: friendId });
                log.info('HANDLER', 'handleApply → ADDED to friends: ' + friendId);
            }

            // ✅ ACCEPT: Tambahkan user ke friend list TARGET juga (DUA ARAH!)
            var targetData = getFriendData(friendId);
            if (targetData.friends.indexOf(userId) === -1) {
                targetData.friends.push(userId);
                _processSteps.push({ step: 'addFriend(target)', status: '✅ OK', detail: userId + ' → ' + friendId });
                log.info('HANDLER', "handleApply → ALSO added user to target's friends: " + friendId);
            }
            saveFriendData(friendId, targetData);
        } else {
            _processSteps.push({ step: 'reject', status: '➖ DONE', detail: friendId });
            log.info('HANDLER', 'handleApply → REJECTED friend: ' + friendId);
        }

        saveFriendData(userId, data);

        console.table(_processSteps);
        console.groupEnd();

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        var _respElapsed = Date.now() - _logT0;
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');

        console.log('   ✅ Handle apply response built (ack only — UI update by client)');
        console.log('   📊 result: ' + (agree ? 'ACCEPTED' : 'REJECTED') + ' · ' + userId + ' <-> ' + friendId);
        console.log('   ⏱️  Total elapsed: ' + _respElapsed + 'ms');
        console.groupEnd();

        callback({});
    }

    // ═══════════════════════════════════════════════════════════════
    // REGISTER
    // ═══════════════════════════════════════════════════════════════

    MainServer.registerHandler('friend', 'handleApply', handleAcceptApply);

    window.MainServer = MainServer;
})();
