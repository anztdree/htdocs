/**
 * handlers/friend/getFriends.js — Get Friends List Handler
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * HANDLER: friend/getFriends
 * ============================================================
 *
 * Client call (main.min.js ~L84170):
 *   ts.processHandler({
 *     type: 'friend',
 *     action: 'getFriends',
 *     userId: UserInfoSingleton.getInstance().userId,
 *     version: '1.0'
 *   }, callback(response))
 *
 * Dipanggil saat:
 *   - Tab 0 (Friend List): buka halaman Friend
 *   - Tab 3 (Blacklist): buka halaman Blacklist
 *
 * Client callback:
 *   - saveFriendData(response)  → baca _friends, _receiveHearts, _giveHearts, _getHearts
 *   - saveBlackListData(response) → baca _blackList
 *
 * Response fields:
 *   _friends: { [userId]: { _nickName, _headImage, _headEffect, _headBox,
 *               _oriServerId, _serverId, _level, _vip, _online,
 *               _offlineTime?, _guildName? } }
 *   _blackList: { [userId]: { _nickName, _headImage, ... } }
 *   _receiveHearts: []
 *   _giveHearts: []
 *   _getHearts: []
 *
 * Data source: db key 'friend:{userId}'
 *   → { friends:[], blacklist:[], applyList:[], messages:{}, inviteMessages:[] }
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
            log.error('GETFRIENDS', 'loadJson error: ' + e.message);
        }
        return null;
    }

    var ITEM_IDS = {
        PLAYERLEVELID: 104,
        PLAYERVIPLEVELID: 106
    };

    // TANPA BOT — friend list hanya berisi akun asli (user:{id} di DB).

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

    function getItemBalance(savedData, itemId) {
        if (!savedData || !savedData.totalProps || !savedData.totalProps._items) return 0;
        var items = savedData.totalProps._items;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === itemId) {
                return Number(items[i]._num) || 0;
            }
        }
        return 0;
    }

    /**
     * Get user profile from saved user data.
     * Konsisten dengan recommendFriend.js: baca level/vip dari totalProps._items
     * 🟢 Natural: _online/_offlineTime dari online tracker (main.min.js:
     *    ViewCommon.setUserOnLineState(online, offlineTime) + sort offlineTime).
     *    Tanpa data tracker → true/0 = default FriendlistInfoModel client.
     */
    function getUserProfile(userId) {
        var storageKey = 'user:' + userId;
        var userData = db._get(storageKey);

        var level = 1;
        var vip = 0;
        if (userData && userData.totalProps && userData.totalProps._items) {
            var items = userData.totalProps._items;
            for (var i = 0; i < items.length; i++) {
                if (Number(items[i]._id) === ITEM_IDS.PLAYERLEVELID) level = Number(items[i]._num) || 1;
                if (Number(items[i]._id) === ITEM_IDS.PLAYERVIPLEVELID) vip = Number(items[i]._num) || 0;
            }
        }

        // 🟢 Online tracker (index.js) — null = tidak ada data → default client
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

    // ════════════════════════════════════════════════════════════════
    // MAIN HANDLER: friend/getFriends
    // ════════════════════════════════════════════════════════════════

    function handleGetFriends(request, callback) {
        var _logT0 = Date.now();
        
        var userId = request.userId;

        log.info('HANDLER', 'friend/getFriends processing');
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
            log.error('HANDLER', 'Missing userId in getFriends');
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

        // ── 🧹 BOT PURGE — buang permanen ID yang bukan akun asli ──
        // Sisa bot lama (era auto-accept) bisa terlanjur tersimpan di
        // friends/blacklist/_friendHeart. Akun asli = punya user:{id} di DB;
        // bot karangan tidak pernah punya. Dibersihkan sekali jalan di sini,
        // lalu friend list yang sudah bersih disimpan kembali ke DB.
        var _purgedCount = 0;
        var _realCache = {};
        function isRealAccount(uid) {
            if (_realCache[uid] === undefined) { _realCache[uid] = !!db._get('user:' + uid); }
            return _realCache[uid];
        }

        var _cleanFriends = [];
        for (var pf = 0; pf < data.friends.length; pf++) {
            if (isRealAccount(String(data.friends[pf]))) _cleanFriends.push(data.friends[pf]);
            else _purgedCount++;
        }
        var _cleanBlack = [];
        for (var pb = 0; pb < data.blacklist.length; pb++) {
            if (isRealAccount(String(data.blacklist[pb]))) _cleanBlack.push(data.blacklist[pb]);
            else _purgedCount++;
        }
        if (_purgedCount > 0) {
            data.friends = _cleanFriends;
            data.blacklist = _cleanBlack;
            db._set('friend:' + userId, data);
            log.info('HANDLER', 'getFriends → BOT PURGE: ' + _purgedCount +
                ' non-account entries removed from friend/blacklist');
        }

        // ── Heart state (pola _friendHeart — konsisten dengan autoGiveGetHeart.js) ──
        // Client saveFriendData (main.min.js): for(var n in e._receiveHearts) receiveHearts.push(...)
        // → kirim indexed object {"0": friendId, "1": ...}
        function buildIndexed(stateObj) {
            var result = {}, idx = 0;
            for (var k in stateObj) {
                if (stateObj.hasOwnProperty(k) && stateObj[k]) { result[String(idx)] = k; idx++; }
            }
            return result;
        }
        var userHeartData = db._get('user:' + userId);
        var heartState = (userHeartData && userHeartData._friendHeart)
            ? userHeartData._friendHeart
            : { giveHearts: {}, getHearts: {}, receiveHearts: {} };

        // Purge heart state yang menunjuk ke non-account (bot lama)
        var _heartPurged = 0;
        function purgeHeartMap(m) {
            var out = {};
            for (var hk in m) {
                if (m.hasOwnProperty(hk) && m[hk]) {
                    if (isRealAccount(hk)) { out[hk] = true; }
                    else { _heartPurged++; }
                }
            }
            return out;
        }
        var _g1 = purgeHeartMap(heartState.giveHearts || {});
        var _g2 = purgeHeartMap(heartState.getHearts || {});
        var _g3 = purgeHeartMap(heartState.receiveHearts || {});
        if (_heartPurged > 0 && userHeartData) {
            heartState.giveHearts = _g1;
            heartState.getHearts = _g2;
            heartState.receiveHearts = _g3;
            userHeartData._friendHeart = heartState;
            db._set('user:' + userId, userHeartData);
            log.info('HANDLER', 'getFriends → BOT PURGE heart state: ' + _heartPurged + ' keys removed');
        }

        // Build _friends object — { [friendId]: profile }
        var friends = {};
        for (var i = 0; i < data.friends.length; i++) {
            var friendId = data.friends[i];
            friends[friendId] = getUserProfile(friendId);
        }

        // Build _blackList object — { [blacklistId]: profile }
        var blackList = {};
        for (var j = 0; j < data.blacklist.length; j++) {
            var blId = data.blacklist[j];
            blackList[blId] = getUserProfile(blId);
        }

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        var _respElapsed = Date.now() - _logT0;
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');

        log.info('HANDLER', 'getFriends → ' + Object.keys(friends).length + ' friends, ' +
            Object.keys(blackList).length + ' blacklist');

        console.log('   ✅ Get friends response built');
        console.log('   📊 friends: ' + Object.keys(friends).length);
        console.log('   📊 blacklist: ' + Object.keys(blackList).length);
        console.log('   ⏱️  Total elapsed: ' + _respElapsed + 'ms');
        console.groupEnd();

        callback({
            _friends: friends,
            _blackList: blackList,
            _receiveHearts: buildIndexed(heartState.receiveHearts || {}),
            _giveHearts: buildIndexed(heartState.giveHearts || {}),
            _getHearts: buildIndexed(heartState.getHearts || {})
        });
    }

    // ════════════════════════════════════════════════════════════════
    // REGISTER
    // ═══════════════════════════════════════════════════════════════

    MainServer.registerHandler('friend', 'getFriends', handleGetFriends);

    window.MainServer = MainServer;
})();
