/**
 * handlers/friend/applyFriend.js
 * Super Warrior Z — MAIN SERVER
 *
 * Client call (L84140-84148):
 *   ts.processHandler({
 *     type: "friend",
 *     action: "applyFriend",
 *     userId: myUserId,
 *     friendId: targetUserId,
 *     version: "1.0"
 *   }, callback)
 *
 * Callback: t && t() — no response fields read, just ack.
 *
 * TUGAS:
 *   1. Push applicant (userId) into target's applyList, save DB.
 *   2. Check main task: if taskType="friendApply" & state=1 → advance to state=2
 *
 * TANPA BOT: tidak ada auto-accept — pertemanan hanya sah setelah
 * pemilik akun menyetujui lewat handleApply (pola paten main.min.js).
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    var _resCache = {};
    function loadJson(name) {
        if (_resCache[name]) return _resCache[name];
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './resource/json/' + name + '.json', false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                _resCache[name] = JSON.parse(xhr.responseText);
                return _resCache[name];
            }
        } catch (e) {
            log.error('APPLYFRIEND', 'loadJson error: ' + e.message);
        }
        return null;
    }

    function getFriendData(userId) {
        var key = 'friend:' + userId;
        var data = db._get(key);
        if (!data) {
            data = { friends: [], blacklist: [], applyList: [], messages: {}, inviteMessages: [] };
            db._set(key, data);
        }
        return data;
    }

    function handleApplyFriend(request, callback) {
        var _logT0 = Date.now();
        
        var userId = request.userId;
        var friendId = request.friendId;

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

        if (!friendId) {
            _validationChecks.push({ check: 'friendId', result: '❌ MISSING' });
        } else {
            _validationChecks.push({ check: 'friendId', result: '✅ OK (' + friendId + ')' });
        }

        console.table(_validationChecks);
        console.groupEnd();

        if (!userId || !friendId) {
            log.warn('HANDLER', 'applyFriend — missing userId or friendId');

            var _elapsed = Date.now() - _logT0;
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            console.log('   ⚠️ Early exit — missing userId or friendId');
            console.log('   ⏱️ Elapsed: ' + _elapsed + 'ms');
            console.groupEnd();

            callback({}, 1);
            return;
        }

        friendId = String(friendId);
        userId = String(userId);

        // ── 1. Push applicant to target's applyList ──
        var targetKey = 'friend:' + friendId;
        var targetData = db._get(targetKey);

        if (!targetData) {
            targetData = { friends: [], blacklist: [], applyList: [], messages: {}, inviteMessages: [] };
        }

        var alreadyFriend = targetData.friends.indexOf(userId) !== -1;
        var alreadyApplied = targetData.applyList.indexOf(userId) !== -1;

        if (!alreadyFriend && !alreadyApplied) {
            targetData.applyList.push(userId);
            db._set(targetKey, targetData);
            log.info('HANDLER', 'applyFriend → userId=' + userId + ' applied to friendId=' + friendId);
        } else {
            log.info('HANDLER', 'applyFriend → already friend/applied: ' + friendId);
        }

        // ── 2. Check & advance main task (taskType=friendApply) ──
        try {
            var storageKey = 'user:' + userId;
            var savedData = db._get(storageKey);
            var cmt = savedData && savedData.curMainTask;
            if (cmt && Array.isArray(cmt) && cmt.length > 0 && cmt[0]._state === 1) {
                var taskCfg = loadJson('task');
                var taskDef = taskCfg && taskCfg[cmt[0]._id];
                if (taskDef && taskDef.taskType === 'friendApply') {
                    cmt[0]._state = 2;
                    db._set(storageKey, savedData);
                    if (typeof MainServer.notify === 'function') {
                        MainServer.notify({
                            action: 'mainTaskChange',
                            _curMainTask: [{ _id: cmt[0]._id, _state: 2 }]
                        });
                        log.info('TASK', 'applyFriend → Task ' + cmt[0]._id + ' DOING→COMPLETE');
                    }
                }
            }
        } catch (taskErr) {
            log.warn('TASK', 'applyFriend task check error: ' + (taskErr.message || taskErr));
        }

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        var _respElapsed = Date.now() - _logT0;
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');

        console.log('   ✅ Apply friend response built');
        console.log('   📊 userId: ' + userId);
        console.log('   📊 friendId: ' + friendId);
        console.log('   ⏱️  Total elapsed: ' + _respElapsed + 'ms');
        console.groupEnd();

        callback({});
    }

    MainServer.registerHandler('friend', 'applyFriend', handleApplyFriend);
    window.MainServer = MainServer;
})();
