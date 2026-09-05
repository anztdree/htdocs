/**
 * handlers/friend/recommendBattleFriend.js — Recommend Battle Friends (Teamwork)
 * Super Warrior Z — MAIN SERVER
 *
 * ═══ CLIENT EVIDENCE (main.min.js) ═══
 *
 *   ts.processHandler({type:"friend",action:"recommendBattleFriend",
 *     userId:t,version:"1.0"},function(e){
 *       ts.openWindow("TeamworkRecommendFriends",{parent:"Teamwork",
 *         recommendFriends:e._recommendFriends})})}
 *
 *   → Response: { _recommendFriends: { [userId]: FSUser } }
 *     (format sama dengan recommendFriend — client window TeamworkRecommendFriends)
 *
 *   FSUser (TeamUserItem + state) — dipakai window teamwork:
 *     _id, _nickName, _headImage, _headEffect, _headBox, _guildName,
 *     _level, _vip, _oriServerId, _serverId, _totalPower, _superSkill, state
 *     (+ _online/_offlineTime natural — main.min.js myTeamworkFriend
 *      sort by offlineTime)
 *
 * STRATEGI (single-server, data IndexedDB):
 *   1. TEMAN user dulu (calon partner paling natural), sort _totalPower desc
 *   2. Kurang dari 4 → isi dari akun asli lain (exclude diri sendiri + blacklist)
 *   3. Kalau tetap kurang → biarkan (tanpa bot karangan)
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

    var RECOMMEND_COUNT = 4;

    // ═══════════════════════════════════════════════════════════════
    // HELPER — pola friendServerAction.js (FSUser)
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

    function getUserProfileFSUser(userId) {
        var storageKey = 'user:' + userId;
        var userData = db._get(storageKey);

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

        if (userData && userData.user) {
            return {
                _id: (userData.user._id || String(userId)),
                _nickName: (userData.user._nickName || 'Player'),
                _headImage: (userData.user._headImage || 'hero_icon_1205'),
                _headEffect: (userData.user._headEffect !== undefined ? userData.user._headEffect : 0),
                _headBox: (userData.user._headBox !== undefined ? userData.user._headBox : 0),
                _guildName: (userData.guild && userData.guild._name) || '',
                _level: level,
                _vip: vip,
                _oriServerId: (userData.user._oriServerId ? Number(userData.user._oriServerId) : 1),
                _serverId: 1,
                _totalPower: (userData.totalPower || 0),
                _superSkill: (Array.isArray(userData.superSkill) ? userData.superSkill : []),
                state: 1,
                _online: (onlineState ? onlineState.online : true),
                _offlineTime: (onlineState ? onlineState.offlineTime : 0)
            };
        }

        return {
            _id: String(userId),
            _nickName: 'Player',
            _headImage: 'hero_icon_1205',
            _headEffect: 0,
            _headBox: 0,
            _guildName: '',
            _level: level,
            _vip: vip,
            _oriServerId: 1,
            _serverId: 1,
            _totalPower: 0,
            _superSkill: [],
            state: 1,
            _online: (onlineState ? onlineState.online : true),
            _offlineTime: (onlineState ? onlineState.offlineTime : 0)
        };
    }

    function collectAllUserIds() {
        var userIds = [];
        if (db._getAllKeys) {
            var keys = db._getAllKeys();
            for (var i = 0; i < keys.length; i++) {
                if (keys[i].indexOf('user:') === 0) {
                    userIds.push(keys[i].substring('user:'.length));
                }
            }
        }
        return userIds;
    }

    // ═══════════════════════════════════════════════════════════════
    // MAIN HANDLER: friend/recommendBattleFriend
    // ═══════════════════════════════════════════════════════════════

    function handleRecommendBattleFriend(request, callback) {
        var _logT0 = Date.now();

        var userId = request.userId;

        log.info('HANDLER', 'friend/recommendBattleFriend processing');
        log.details('request', [
            ['userId', userId || '-']
        ]);

        // ═══════════════════════════════════════════════════════════
        //  ✅ VALIDATION
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var _validationChecks = [];

        if (!userId) { _validationChecks.push({ check: 'userId', result: '❌ MISSING' }); }
        else { _validationChecks.push({ check: 'userId', result: '✅ OK' }); }

        console.table(_validationChecks);
        console.groupEnd();

        if (!userId) {
            var _elapsed = Date.now() - _logT0;
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            console.log('   ⚠️ Early exit — missing userId');
            console.log('   ⏱️  Elapsed: ' + _elapsed + 'ms');
            console.groupEnd();
            callback({ _error: 'missing_userId' });
            return;
        }

        userId = String(userId);

        // ═══════════════════════════════════════════════════════════
        //  ⚔️ RECOMMEND BATTLE FRIEND PROCESSING
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c⚔️ Recommend Battle Friend Processing', 'color:#0277BD;font-weight:bold;');
        var _processSteps = [];

        var friendData = getFriendData(userId);
        var excludeSet = {};
        excludeSet[userId] = true;
        var bi;
        for (bi = 0; bi < friendData.blacklist.length; bi++) {
            excludeSet[friendData.blacklist[bi]] = true;
        }

        // 1) Teman dulu
        var candidates = [];
        var friendSet = {};
        for (var f = 0; f < friendData.friends.length; f++) {
            var fid = String(friendData.friends[f]);
            friendSet[fid] = true;
            if (!excludeSet[fid]) {
                candidates.push(fid);
                excludeSet[fid] = true;
            }
        }
        _processSteps.push({ step: 'friendsAsCandidates', status: '✅ OK', detail: candidates.length + ' friends' });

        // 2) Kurang → akun asli lain (exclude diri + teman sudah masuk + blacklist)
        if (candidates.length < RECOMMEND_COUNT) {
            var allUserIds = collectAllUserIds();
            for (var u = 0; u < allUserIds.length && candidates.length < RECOMMEND_COUNT; u++) {
                var uid = allUserIds[u];
                if (!excludeSet[uid]) {
                    candidates.push(uid);
                    excludeSet[uid] = true;
                }
            }
            _processSteps.push({ step: 'fillFromAccounts', status: '✅ OK', detail: candidates.length + ' total' });
        }

        // Build FSUser profiles — sort _totalPower desc (battle partner = power)
        var recommendFriends = {};
        var profileList = [];
        for (var c = 0; c < candidates.length; c++) {
            profileList.push(getUserProfileFSUser(candidates[c]));
        }
        profileList.sort(function (a, b) { return (b._totalPower || 0) - (a._totalPower || 0); });
        for (var p = 0; p < profileList.length; p++) {
            recommendFriends[profileList[p]._id] = profileList[p];
        }

        _processSteps.push({ step: 'buildResponse', status: '✅ OK', detail: Object.keys(recommendFriends).length + ' recommended' });

        console.table(_processSteps);
        console.groupEnd();

        log.info('HANDLER', 'recommendBattleFriend → ' + Object.keys(recommendFriends).length + ' recommended for ' + userId);

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        var _respElapsed = Date.now() - _logT0;
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        console.log('   ✅ Recommend battle friends response built');
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

    MainServer.registerHandler('friend', 'recommendBattleFriend', handleRecommendBattleFriend);

    window.MainServer = MainServer;
})();
