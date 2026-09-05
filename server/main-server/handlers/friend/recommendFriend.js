/**
 * handlers/friend/recommendFriend.js — Recommend Friends Handler
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * HANDLER: friend/recommendFriend
 * ============================================================
 *
 * Client call (main.min.js ~L84184):
 *   ts.processHandler({
 *     type: 'friend',
 *     action: 'recommendFriend',
 *     userId: UserInfoSingleton.getInstance().userId,
 *     oldUids: [list of already-seen userIds to exclude],
 *     version: '1.0'
 *   }, callback(response))
 *
 * Client callback:
 *   saveRandomFriendData(response) → baca _recommendFriends
 *
 * Response fields:
 *   _recommendFriends: { [userId]: { _nickName, _headImage, _headEffect,
 *                    _headBox, _oriServerId, _serverId, _level, _vip,
 *                    _online, _offlineTime?, _guildName? } }
 *
 * ─────────────────────────────────────────────────────────────
 * STRATEGY:
 * Karena ini single-server (semua data di localStorage),
 * kita generate "recommended" friends dari:
 *   1. Semua user yang terdaftar di DB (user:{userId})
 *   2. Bukan diri sendiri
 *   3. Bukan sudah di friend list
 *   4. Bukan di oldUids (sudah pernah direkomendasikan)
 *   5. Ambil random 4-5 orang
 * ─────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    // ═══════════════════════════════════════════════════════════════
    // HELPER
    // ═══════════════════════════════════════════════════════════════

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
     */
    function getUserProfile(userId) {
        var storageKey = 'user:' + userId;
        var userData = db._get(storageKey);

        var level = 1;
        var vip = 0;
        if (userData && userData.totalProps && userData.totalProps._items) {
            var items = userData.totalProps._items;
            for (var i = 0; i < items.length; i++) {
                if (Number(items[i]._id) === 104) { level = Number(items[i]._num) || 1; }
                if (Number(items[i]._id) === 106) { vip = Number(items[i]._num) || 0; }
            }
        }

        if (userData && userData.user) {
            // 🟢 Natural online state (main.min.js: setUserOnLineState + offlineTime)
            var onlineState = (MainServer.getUserOnlineState ? MainServer.getUserOnlineState(String(userId)) : null);
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
            _online: true
        };
    }

    /**
     * Collect all known userIds from DB.
     * Scans for keys matching 'user:{userId}'
     */
    function getAllKnownUserIds() {
        var userIds = [];
        // Use getAllKeys if available, otherwise return empty
        // (single-server environment — limited users)
        if (db._getAllKeys) {
            var keys = db._getAllKeys();
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                // Match pattern: user:{userId}
                if (key.indexOf('user:') === 0) {
                    var uid = key.substring('user:'.length);
                    userIds.push(uid);
                }
            }
        }
        return userIds;
    }

    /**
     * Simple Fisher-Yates partial shuffle — take N random items from array.
     */
    function getRandomItems(arr, count, excludeSet) {
        var available = [];
        for (var i = 0; i < arr.length; i++) {
            if (!excludeSet[arr[i]]) {
                available.push(arr[i]);
            }
        }

        // Shuffle available
        for (var j = available.length - 1; j > 0; j--) {
            var k = Math.floor(Math.random() * (j + 1));
            var temp = available[j];
            available[j] = available[k];
            available[k] = temp;
        }

        return available.slice(0, count);
    }

    // ═══════════════════════════════════════════════════════════════
    // MAIN HANDLER: friend/recommendFriend
    // ═══════════════════════════════════════════════════════════════

    function handleRecommendFriend(request, callback) {
        var _logT0 = Date.now();
        
        var userId = request.userId;
        var oldUids = request.oldUids || [];

        log.info('HANDLER', 'friend/recommendFriend processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['oldUids count', oldUids.length]
        ]);

        // ═══════════════════════════════════════════════════════════
        //  ✅ VALIDATION
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var _validationChecks = [];

        if (!userId) {
            _validationChecks.push({ check: 'userId', result: '❌ MISSING' });
            log.error('HANDLER', 'Missing userId in recommendFriend');
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

        // Build exclude set: self + friends + oldUids
        var friendData = getFriendData(userId);
        var excludeSet = {};
        excludeSet[userId] = true;

        for (var i = 0; i < friendData.friends.length; i++) {
            excludeSet[friendData.friends[i]] = true;
        }
        for (var j = 0; j < oldUids.length; j++) {
            excludeSet[oldUids[j]] = true;
        }

        // Get all known users
        var allUsers = getAllKnownUserIds();
        var recommendedIds = getRandomItems(allUsers, 4, excludeSet);

        // ═══════════════════════════════════════════════════════════
        //  📦 RECOMMEND FRIEND PROCESSING
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c📦 Recommend Friend Processing', 'color:#0277BD;font-weight:bold;');
        var _processSteps = [];

        // TANPA BOT — rekomendasi HANYA dari akun asli di DB.
        // Kalau kandidat kurang dari 4, biarkan apa adanya (main.min.js
        // menampilkan list apa adanya dari saveRandomFriendData).
        var recommendFriends = {};
        for (var r = 0; r < recommendedIds.length; r++) {
            var recId = recommendedIds[r];
            recommendFriends[recId] = getUserProfile(recId);
        }

        log.info('HANDLER', 'recommendFriend → ' + Object.keys(recommendFriends).length + ' recommended');
        _processSteps.push({ step: 'buildResponse', status: '✅ OK', detail: Object.keys(recommendFriends).length + ' friends' });

        console.table(_processSteps);
        console.groupEnd();

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        var _respElapsed = Date.now() - _logT0;
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');

        console.log('   ✅ Recommend friends response built');
        console.log('   📊 recommended: ' + Object.keys(recommendFriends).length);
        console.log('   ⏱️  Total elapsed: ' + _respElapsed + 'ms');
        console.groupEnd();

        callback({
            _recommendFriends: recommendFriends
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // REGISTER
    // ═══════════════════════════════════════════════════════════════

    MainServer.registerHandler('friend', 'recommendFriend', handleRecommendFriend);

    window.MainServer = MainServer;
})();
