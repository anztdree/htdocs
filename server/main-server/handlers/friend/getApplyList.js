/**
 * handlers/friend/getApplyList.js — Get Friend Apply List Handler
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * HANDLER: friend/getApplyList
 * ============================================================
 *
 * Client call (main.min.js ~L84196):
 *   ts.processHandler({
 *     type: 'friend',
 *     action: 'getApplyList',
 *     userId: UserInfoSingleton.getInstance().userId,
 *     version: '1.0'
 *   }, callback(response))
 *
 * Client callback:
 *   saveApplyFriendData(response) → baca _applyList
 *
 * Response fields:
 *   _applyList: { [userId]: { _nickName, _headImage, _headEffect, _headBox,
 *               _oriServerId, _serverId, _level, _vip, _online,
 *               _offlineTime?, _guildName? } }
 *
 * Data source: db key 'friend:{userId}'
 *   → { friends:[], blacklist:[], applyList:[] }
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    /**
     * Get friend data for a user.
     */
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

    /**
     * Get user profile from saved user data.
     * 🟢 FIXED: level/vip dibaca dari totalProps._items (item 104/106) —
     *    userData.level tidak pernah ada (pola sama dgn getFriends/friendServerAction)
     * 🟢 Natural: _online/_offlineTime dari online tracker (index.js)
     */
    function getUserProfile(userId) {
        var storageKey = 'user:' + userId;
        var userData = db._get(storageKey);

        var level = 1;
        var vip = 0;
        if (userData && userData.totalProps && userData.totalProps._items) {
            var items = userData.totalProps._items;
            for (var i = 0; i < items.length; i++) {
                if (Number(items[i]._id) === 104) level = Number(items[i]._num) || 1;
                if (Number(items[i]._id) === 106) vip = Number(items[i]._num) || 0;
            }
        }

        var onlineState = (MainServer.getUserOnlineState ? MainServer.getUserOnlineState(String(userId)) : null);

        if (userData && userData.user) {
            return {
                _nickName: userData.user._nickName || 'Player',
                _headImage: userData.user._headImage || 'hero_icon_1205',
                _headEffect: (userData.user._headEffect || 0),
                _headBox: (userData.user._headBox || 0),
                _oriServerId: (userData.user._oriServerId || 1),
                _serverId: 1,
                _level: level,
                _vip: vip,
                _online: (onlineState ? onlineState.online : true),
                _offlineTime: (onlineState ? onlineState.offlineTime : 0)
            };
        }

        return {
            _nickName: 'Player',
            _headImage: 'hero_icon_1205',
            _headEffect: 0,
            _headBox: 0,
            _oriServerId: 1,
            _serverId: 1,
            _level: level,
            _vip: vip,
            _online: (onlineState ? onlineState.online : true),
            _offlineTime: (onlineState ? onlineState.offlineTime : 0)
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MAIN HANDLER: friend/getApplyList
    // ═══════════════════════════════════════════════════════════════

    function handleGetApplyList(request, callback) {
        var _logT0 = Date.now();
        
        var userId = request.userId;

        log.info('HANDLER', 'friend/getApplyList processing');
        log.details('request', [
            ['userId', userId || '-']
        ]);

        // ═══════════════════════════════════════════════════════════
        //  ✅ VALIDATION
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var _validationChecks = [];

        if (!userId) {
            _validationChecks.push({ check: 'userId', result: '❌ MISSING' });
            log.error('HANDLER', 'Missing userId in getApplyList');
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
            callback({ _error: 'missing_userId' });
            return;
        }

        var data = getFriendData(userId);

        // Build _applyList object — { [applicantId]: profile }
        var applyList = {};
        for (var i = 0; i < data.applyList.length; i++) {
            var applicantId = data.applyList[i];
            applyList[applicantId] = getUserProfile(applicantId);
        }

        log.info('HANDLER', 'getApplyList → ' + Object.keys(applyList).length + ' applicants');

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        var _respElapsed = Date.now() - _logT0;
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');

        console.log('   ✅ Get apply list response built');
        console.log('   📊 applicants: ' + Object.keys(applyList).length);
        console.log('   ⏱️  Total elapsed: ' + _respElapsed + 'ms');
        console.groupEnd();

        callback({
            _applyList: applyList
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // REGISTER
    // ═══════════════════════════════════════════════════════════════

    MainServer.registerHandler('friend', 'getApplyList', handleGetApplyList);

    window.MainServer = MainServer;
})();
