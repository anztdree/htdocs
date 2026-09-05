/**
 * handlers/friend/friendServerAction.js — Friend Server Action Handler (100% MATCH main.min.js)
 * Super Warrior Z — MAIN SERVER
 *
 * ═══════════════════════════════════════════════════════════════════
 * HANDLER: friend/friendServerAction
 * ═══════════════════════════════════════════════════════════════════
 *
 * Client call: processHandler({type:'friend', action:'friendServerAction',
 *               relayAction:'...', userId, version:'1.0', ...extraFields}, cb)
 *
 * Semua relayAction masuk ke 1 handler ini, lalu di-dispatch internally
 * berdasarkan request.relayAction.
 *
 * ═══════════════════════════════════════════════════════════════════
 * RELAY ACTIONS (15 unique) - 100% dari main.min.js:
 * ═══════════════════════════════════════════════════════════════════
 *
 * ┌───────────────────┬───────────────────┬───────────────────────────┐
 * │ relayAction       │ Extra Req Fields  │ Response Fields           │
 * ├───────────────────┼───────────────────┼───────────────────────────┤
 * │ queryFriends      │ (none)            │ { users: {[id]: FSUser} }  │
 * │ queryBlackList    │ (none)            │ { users: {[id]: FSUser} }  │
 * │ queryApplyList    │ (none)            │ { users: {[id]: FSUser} }  │
 * │ apply             │ friendIds:[]      │ (ack only)                │
 * │ handleApply       │ agree, friendId   │ (ack only)                │
 * │ delFriend         │ friendId          │ (ack only)                │
 * │ addToBlacklist    │ friendId          │ (ack only)                │
 * │ removeBalcklist   │ friendId          │ (ack only)                │
 * │ chat              │ friendId,msgType,  │ (ack only)                │
 * │                   │   params           │                           │
 * │ sendMsg           │ friendId, msg     │ (ack only)                │
 * │ getMsg            │ friendId, time    │ { _msgs: [...] }          │
 * │ getMsgList        │ (none)            │ { _brief: {...} }         │
 * │ readMsg           │ friendId          │ { _readTime: ts }         │
 * │ getChatMsg        │ time              │ { _msgs: [...] }          │
 * │ delMsg            │ friendId          │ (ack only)                │
 * └───────────────────┴───────────────────┴───────────────────────────┘
 *
 * ⚠️ NOTE: removeBalcklist = TYPO dari client (huruf 'c' kelebihan).
 *    Server HARUS match exact spelling ini.
 *
 * ═══════════════════════════════════════════════════════════════════
 * DATA MODEL - FSUser (extends TeamUserItem) from main.min.js:
 * ═══════════════════════════════════════════════════════════════════
 *
 * TeamUserItem fields (base class):
 *   serverId: number       → Default 0
 *   oriServerId: number    → From user data
 *   userId: string         → Key dari response object
 *   nickName: string       → _nickName
 *   headImage: string      → _headImage
 *   headEffect: number     → _headEffect
 *   headBox: number        → _headBox
 *   guildName: string      → _guildName
 *   level: number          → _level (dari totalProps._items id=104)
 *   vip: number            → _vip (dari totalProps._items id=106)
 *   superSkill: array      → _superSkill
 *   totalPower: number     → _totalPower
 *
 * FSUser extends TeamUserItem + tambahan:
 *   state: number          → 0=OFFLINE, 1=ONLINE, 2=IN_TEAM
 *
 * Client deserialize logic (main.min.js):
 *   o = new FSUser()
 *   o.deserialize(e.users[n])  // n = userId (string key)
 *   // deserialize maps _fieldName to fieldName (strip underscore)
 *
 * DATA SOURCE: localStorage (prefix friend:)
 *   friend:{userId}        → { friends:[], blacklist:[], applyList:[], messages:{}, inviteMessages:[] }
 *   friend:profile:{userId} → { _nickName, _headImage, _level, _serverId, ... }
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    if (!MainServer.handlers.friend) {
        MainServer.handlers.friend = {};
    }

    // ═══════════════════════════════════════════════════════════════
    // CONSTANTS - Item IDs untuk baca level/vip (dari main.min.js)
    // ═══════════════════════════════════════════════════════════════

    var ITEM_IDS = {
        PLAYERLEVELID: 104,  // Item ID untuk player level
        PLAYERVIPLEVELID: 106 // Item ID untuk VIP level
    };

    // ═══════════════════════════════════════════════════════════════
    // HELPER: Data Access
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get friend data for a user.
     * Initialize if not exists.
     */
    function getFriendData(userId) {
        var key = 'friend:' + userId;
        var data = db._get(key);

        if (!data) {
            data = {
                friends: [],
                blacklist: [],
                applyList: [],
                messages: {},       // { [friendId]: [{_time,_isSelf,_context,_type}] }
                inviteMessages: []  // [{_type,_from,_time,teamExist,_params}]
            };
            db._set(key, data);
        }

        return data;
    }

    /**
     * Save friend data.
     */
    function saveFriendData(userId, data) {
        var key = 'friend:' + userId;
        db._set(key, data);
    }

    /**
     * 🆕 getUserProfile - 100% SESUAI main.min.js FSUser model
     *
     * Mengambil user profile yang sesuai dengan FSUser/TeamUserItem format.
     * Baca level & vip dari totalProps._items (Bukan hardcoded!)
     *
     * @param {string} userId - User ID to get profile for
     * @returns {object} FSUser-compatible object
     */
    function getUserProfile(userId) {
        // Coba baca dari user:{userId}
        var storageKey = 'user:' + userId;
        var userData = db._get(storageKey);

        // 🔧 FIX CRITICAL: Baca level & vip dari totalProps._items
        // Sesuai dengan getFriends.js dan main.min.js expectation
        var level = 1;
        var vip = 0;

        if (userData && userData.totalProps && userData.totalProps._items) {
            var items = userData.totalProps._items;
            for (var i = 0; i < items.length; i++) {
                var itemId = Number(items[i]._id);
                var itemNum = Number(items[i]._num) || 0;

                if (itemId === ITEM_IDS.PLAYERLEVELID) {
                    level = itemNum || 1;
                }
                if (itemId === ITEM_IDS.PLAYERVIPLEVELID) {
                    vip = itemNum || 0;
                }
            }
        }

        // Jika ada userData lengkap, build FSUser object
        if (userData && userData.user) {
            // 🟢 Natural online state (main.min.js: setUserOnLineState + offlineTime)
            var onlineState = (MainServer.getUserOnlineState ? MainServer.getUserOnlineState(String(userId)) : null);
            return {
                // TeamUserItem fields (dengan underscore prefix untuk deserialize)
                _id: (userData.user._id || userId),
                _nickName: (userData.user._nickName || 'Player'),
                _headImage: (userData.user._headImage || 'hero_icon_1205'),
                _headEffect: (userData.user._headEffect !== undefined ? userData.user._headEffect : 0),
                _headBox: (userData.user._headBox !== undefined ? userData.user._headBox : 0),
                _guildName: (userData.guild?._name || ''),  // Baca dari guild data jika ada
                _level: level,  // ✅ FIXED: Dari totalProps._items
                _vip: vip,      // ✅ FIXED: Dari totalProps._items
                _oriServerId: (userData.user._oriServerId ? Number(userData.user._oriServerId) : 1),
                _serverId: 1,
                _totalPower: (userData.totalPower || 0),  // Baca jika tersedia
                _superSkill: (Array.isArray(userData.superSkill) ? userData.superSkill : []),
                // FSUser-specific field
                state: 1,  // ONLINE by default (single-server environment)
                // 🟢 Natural: tracker aktif → false jika idle > 5 menit
                _online: (onlineState ? onlineState.online : true),
                _offlineTime: (onlineState ? onlineState.offlineTime : 0)
            };
        }

        // Fallback profile jika tidak ada data lengkap
        return {
            _id: userId,
            _nickName: 'Player',
            _headImage: 'hero_icon_1205',
            _headEffect: 0,
            _headBox: 0,
            _guildName: '',
            _level: level,  // ✅ FIXED: Tetap gunakan level yang sudah dibaca
            _vip: vip,      // ✅ FIXED: Tetap gunakan vip yang sudah dibaca
            _oriServerId: 1,
            _serverId: 1,
            _totalPower: 0,
            _superSkill: [],
            state: 1
        };
    }

    /**
     * Check if userId is valid non-empty string.
     */
    function isValidUserId(userId) {
        return userId && typeof userId === 'string' && userId.trim().length > 0;
    }

    /**
     * Safely convert value to string.
     */
    function toString(val) {
        if (val === null || val === undefined) return '';
        return String(val);
    }

    // ═══════════════════════════════════════════════════════════════
    // MAIN HANDLER: friendServerAction
    // ═══════════════════════════════════════════════════════════════

    /**
     * handleFriendServerAction(request, callback)
     *
     * Router internal berdasarkan request.relayAction.
     * Handle semua 15 relayActions dari main.min.js.
     *
     * @param {object} request  — { type:'friend', action:'friendServerAction',
     *                              relayAction, userId, version, ...extraFields }
     * @param {function} callback — callback(responseData)
     */
    function handleFriendServerAction(request, callback) {
        var _logT0 = Date.now();

        console.log('   🔀 relayAction: ' + (request.relayAction || '?'));
        var userId = request.userId;
        var relayAction = request.relayAction;

        log.info('HANDLER', 'friendServerAction processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['relayAction', relayAction || '-']
        ]);

        // ═══════════════════════════════════════════════════════════
        //  ✅ VALIDATION
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var _validationChecks = [];

        if (!isValidUserId(userId)) {
            _validationChecks.push({ check: 'userId', result: '❌ MISSING OR INVALID' });
            log.error('HANDLER', 'Missing/invalid userId in friendServerAction');
        } else {
            _validationChecks.push({ check: 'userId', result: '✅ OK' });
        }

        if (!relayAction) {
            _validationChecks.push({ check: 'relayAction', result: '❌ MISSING' });
            log.error('HANDLER', 'Missing relayAction in friendServerAction');
        } else {
            _validationChecks.push({ check: 'relayAction', result: '✅ OK (' + relayAction + ')' });
        }

        console.table(_validationChecks);
        console.groupEnd();

        if (!isValidUserId(userId)) {
            var _elapsed = Date.now() - _logT0;
            console.groupCollapsed('%c📤 Early Exit', 'color:#F44336;font-weight:bold;');
            console.log('   ⚠️ Missing/invalid userId');
            console.log('   ⏱️ Elapsed: ' + _elapsed + 'ms');
            console.groupEnd();
            callback({ _error: 'missing_userId' });
            return;
        }

        if (!relayAction) {
            log.error('HANDLER', 'Missing relayAction in friendServerAction');
            callback({ _error: 'missing_relayAction' });
            return;
        }

        // Dispatch ke relayAction handler
        switch (relayAction) {

            // ─── FRIEND LIST ────────────────────────────────────
            case 'queryFriends':
                handleQueryFriends(userId, callback);
                break;

            // ─── BLACKLIST ─────────────────────────────────────
            case 'queryBlackList':
                handleQueryBlackList(userId, callback);
                break;

            // ─── APPLY LIST ────────────────────────────────────
            case 'queryApplyList':
                handleQueryApplyList(userId, callback);
                break;

            // ─── SEND FRIEND REQUEST ────────────────────────────
            case 'apply':
                handleApply(userId, request.friendIds, callback);
                break;

            // ─── ACCEPT/REJECT APPLICATION ─────────────────────
            case 'handleApply':
                handleAcceptApply(userId, request.friendId, request.agree, callback);
                break;

            // ─── DELETE FRIEND ─────────────────────────────────
            case 'delFriend':
                handleDelFriend(userId, request.friendId, callback);
                break;

            // ─── BLACKLIST ACTIONS ─────────────────────────────
            case 'addToBlacklist':
                handleAddToBlacklist(userId, request.friendId, callback);
                break;

            // ⚠️ TYPO from client — must match exact spelling
            case 'removeBalcklist':
                handleRemoveFromBlacklist(userId, request.friendId, callback);
                break;

            // ─── CHAT / INVITE ─────────────────────────────────
            case 'chat':
                handleChat(userId, request.friendId, request.msgType, request.params, callback);
                break;

            // ─── SEND MESSAGE ──────────────────────────────────
            case 'sendMsg':
                handleSendMsg(userId, request.friendId, request.msg, callback);
                break;

            // ─── GET MESSAGES ───────────────────────────────────
            case 'getMsg':
                handleGetMsg(userId, request.friendId, request.time, callback);
                break;

            // ─── GET MESSAGE LIST (BRIEF) ──────────────────────
            case 'getMsgList':
                handleGetMsgList(userId, callback);
                break;

            // ─── READ MESSAGES ─────────────────────────────────
            case 'readMsg':
                handleReadMsg(userId, request.friendId, callback);
                break;

            // ─── GET CHAT/INVITE MESSAGES ──────────────────────
            case 'getChatMsg':
                handleGetChatMsg(userId, request.time, callback);
                break;

            // ─── DELETE MESSAGES ────────────────────────────────
            case 'delMsg':
                handleDelMsg(userId, request.friendId, callback);
                break;

            default:
                log.warn('HANDLER', 'Unknown relayAction: ' + relayAction);
                callback({ _error: 'unknown_relayAction: ' + relayAction });
                break;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // RELAY ACTION HANDLERS (15 total - 100% sesuai main.min.js)
    // ═══════════════════════════════════════════════════════════════

    // ───────────────────────────────────────────────────────────
    // 1. queryFriends — Fetch friend list
    // Client expects: { users: { [userId]: FSUser } }
    // ───────────────────────────────────────────────────────────
    function handleQueryFriends(userId, callback) {
        var data = getFriendData(userId);
        var users = {};

        // Build FSUser objects untuk setiap friend
        for (var i = 0; i < data.friends.length; i++) {
            var friendId = data.friends[i];
            if (isValidUserId(friendId)) {
                users[friendId] = getUserProfile(friendId);
            }
        }

        log.info('HANDLER', 'queryFriends → ' + Object.keys(users).length + ' friends');

        // Response format sesuai main.min.js expectation
        callback({ users: users });
    }

    // ───────────────────────────────────────────────────────────
    // 2. queryBlackList — Fetch blacklist
    // Client expects: { users: { [userId]: FSUser } }
    // ───────────────────────────────────────────────────────────
    function handleQueryBlackList(userId, callback) {
        var data = getFriendData(userId);
        var users = {};

        for (var i = 0; i < data.blacklist.length; i++) {
            var blockedId = data.blacklist[i];
            if (isValidUserId(blockedId)) {
                users[blockedId] = getUserProfile(blockedId);
            }
        }

        log.info('HANDLER', 'queryBlackList → ' + Object.keys(users).length + ' blocked');
        callback({ users: users });
    }

    // ───────────────────────────────────────────────────────────
    // 3. queryApplyList — Fetch pending friend applications
    // Client expects: { users: { [userId]: FSUser } }
    // ───────────────────────────────────────────────────────────
    function handleQueryApplyList(userId, callback) {
        var data = getFriendData(userId);
        var users = {};

        for (var i = 0; i < data.applyList.length; i++) {
            var applicantId = data.applyList[i];
            if (isValidUserId(applicantId)) {
                users[applicantId] = getUserProfile(applicantId);
            }
        }

        log.info('HANDLER', 'queryApplyList → ' + Object.keys(users).length + ' pending');
        callback({ users: users });
    }

    // ───────────────────────────────────────────────────────────
    // 4. apply — Send friend request(s)
    // Extra req: friendIds (array of userId strings)
    // Response: {} (ack only)
    //
    // 📝 Logic dari main.min.js:
    //   - Client kirim array friendIds
    //   - Server tambahkan ke applyList target
    //   - Tidak auto-accept, menunggu target handleApply
    // ───────────────────────────────────────────────────────────
    function handleApply(userId, friendIds, callback) {
        // Validate friendIds
        if (!friendIds || !Array.isArray(friendIds) || friendIds.length === 0) {
            log.warn('HANDLER', 'apply — no friendIds provided or invalid format');
            callback({});
            return;
        }

        var successCount = 0;

        for (var i = 0; i < friendIds.length; i++) {
            var targetId = toString(friendIds[i]);

            // Skip invalid IDs
            if (!isValidUserId(targetId)) {
                log.warn('HANDLER', 'apply — skipping invalid friendId: ' + targetId);
                continue;
            }

            // Skip self
            if (targetId === userId) {
                log.warn('HANDLER', 'apply — cannot add self as friend');
                continue;
            }

            var targetData = getFriendData(targetId);

            // Cek apakah sudah ada di friend list
            var alreadyFriend = targetData.friends.indexOf(userId) !== -1;
            var alreadyApplied = targetData.applyList.indexOf(userId) !== -1;

            if (!alreadyFriend && !alreadyApplied) {
                // Tambahkan ke applyList target
                targetData.applyList.push(userId);
                saveFriendData(targetId, targetData);
                successCount++;
                log.info('HANDLER', 'apply → request added for user: ' + targetId);
            } else {
                log.info('HANDLER', 'apply → already friend/applied: ' + targetId +
                    ' (friend:' + alreadyFriend + ', applied:' + alreadyApplied + ')');
            }
        }

        log.info('HANDLER', 'apply → processed ' + friendIds.length + ' requests, ' + successCount + ' successful');
        callback({});
    }

    // ───────────────────────────────────────────────────────────
    // 5. handleApply — Accept/reject friend application
    // Extra req: friendId (applicant's userId), agree (boolean)
    // Response: {} (ack only)
    //
    // 📝 Logic dari main.min.js:
    //   - agree=true: Add ke friends list (DUA ARAH!)
    //   - agree=false: Hapus dari applyList saja
    //   - Client panggil: TeamworkFriendManager.getInstance().addFriendData(n) jika agree
    // ───────────────────────────────────────────────────────────
    function handleAcceptApply(userId, friendId, agree, callback) {
        if (!isValidUserId(friendId)) {
            log.warn('HANDLER', 'handleApply — no or invalid friendId');
            callback({});
            return;
        }

        friendId = toString(friendId);
        var data = getFriendData(userId);

        // Hapus dari apply list (selalu dilakukan, baik accept maupun reject)
        var idx = data.applyList.indexOf(friendId);
        if (idx !== -1) {
            data.applyList.splice(idx, 1);
            log.info('HANDLER', 'handleApply → removed from applyList: ' + friendId);
        } else {
            log.warn('HANDLER', 'handleApply — friendId not in applyList: ' + friendId);
        }

        if (agree) {
            // ✅ ACCEPT: Tambahkan ke friend list USER
            if (data.friends.indexOf(friendId) === -1) {
                data.friends.push(friendId);
                log.info('HANDLER', 'handleApply → ADDED to friends: ' + friendId);
            }

            // ✅ ACCEPT: Tambahkan user ke friend list TARGET juga (DUA ARAH!)
            var targetData = getFriendData(friendId);
            if (targetData.friends.indexOf(userId) === -1) {
                targetData.friends.push(userId);
                log.info('HANDLER', 'handleApply → ALSO added user to target\'s friends: ' + friendId);
            }
            saveFriendData(friendId, targetData);
        } else {
            log.info('HANDLER', 'handleApply → REJECTED friend: ' + friendId);
        }

        saveFriendData(userId, data);
        callback({});
    }

    // ───────────────────────────────────────────────────────────
    // 6. delFriend — Remove friend
    // Extra req: friendId
    // Response: {} (ack only)
    //
    // 📝 Logic dari main.min.js:
    //   - Hapus dari kedua sisi (dua arah)
    //   - Client juga clear messages via: clearOneFriendMessage(o)
    // ───────────────────────────────────────────────────────────
    function handleDelFriend(userId, friendId, callback) {
        if (!isValidUserId(friendId)) {
            log.warn('HANDLER', 'delFriend — no or invalid friendId');
            callback({});
            return;
        }

        friendId = toString(friendId);

        // Hapus dari friend list user
        var data = getFriendData(userId);
        var idx = data.friends.indexOf(friendId);
        if (idx !== -1) {
            data.friends.splice(idx, 1);
            log.info('HANDLER', 'delFriend → removed from user\'s friends: ' + friendId);
        }

        // Hapus dari friend list target juga (DUA ARAH!)
        var targetData = getFriendData(friendId);
        var tIdx = targetData.friends.indexOf(userId);
        if (tIdx !== -1) {
            targetData.friends.splice(tIdx, 1);
            log.info('HANDLER', 'delFriend → also removed from target\'s friends: ' + friendId);
        }
        saveFriendData(friendId, targetData);

        // Hapus juga messages (sesuai client behavior)
        if (data.messages[friendId]) {
            delete data.messages[friendId];
            log.info('HANDLER', 'delFriend → cleared messages with: ' + friendId);
        }
        saveFriendData(userId, data);

        callback({});
    }

    // ───────────────────────────────────────────────────────────
    // 7. addToBlacklist — Add to blacklist (implicit remove friend)
    // Extra req: friendId
    // Response: {} (ack only)
    //
    // 📝 Logic dari main.min.js:
    //   - Client panggil: delectFriendData(t.userId) SEBELUM blacklist
    //   - Jadi server perlu hapus friend + tambah blacklist
    // ───────────────────────────────────────────────────────────
    function handleAddToBlacklist(userId, friendId, callback) {
        if (!isValidUserId(friendId)) {
            log.warn('HANDLER', 'addToBlacklist — no or invalid friendId');
            callback({});
            return;
        }

        friendId = toString(friendId);
        var data = getFriendData(userId);

        // Hapus dari friend list (jika ada)
        var fIdx = data.friends.indexOf(friendId);
        if (fIdx !== -1) {
            data.friends.splice(fIdx, 1);
            log.info('HANDLER', 'addToBlacklist → removed from friends first: ' + friendId);
        }

        // Hapus dari apply list (jika ada)
        var aIdx = data.applyList.indexOf(friendId);
        if (aIdx !== -1) {
            data.applyList.splice(aIdx, 1);
            log.info('HANDLER', 'addToBlacklist → removed from applyList: ' + friendId);
        }

        // Tambahkan ke blacklist
        if (data.blacklist.indexOf(friendId) === -1) {
            data.blacklist.push(friendId);
            log.info('HANDLER', 'addToBlacklist → added to blacklist: ' + friendId);
        }

        // Hapus messages
        if (data.messages[friendId]) {
            delete data.messages[friendId];
        }

        saveFriendData(userId, data);
        callback({});
    }

    // ───────────────────────────────────────────────────────────
    // 8. removeBalcklist — ⚠️ TYPO from client, must match exact!
    // Extra req: friendId
    // Response: {} (ack only)
    // ───────────────────────────────────────────────────────────
    function handleRemoveFromBlacklist(userId, friendId, callback) {
        if (!isValidUserId(friendId)) {
            log.warn('HANDLER', 'removeBalcklist — no or invalid friendId');
            callback({});
            return;
        }

        friendId = toString(friendId);
        var data = getFriendData(userId);

        var idx = data.blacklist.indexOf(friendId);
        if (idx !== -1) {
            data.blacklist.splice(idx, 1);
            log.info('HANDLER', 'removeBalcklist → unblocked: ' + friendId);
        } else {
            log.warn('HANDLER', 'removeBalcklist — user not in blacklist: ' + friendId);
        }

        saveFriendData(userId, data);
        callback({});
    }

    // ───────────────────────────────────────────────────────────
    // 9. chat — Send structured invite (e.g., team dungeon)
    // Extra req: friendId, msgType (number), params (object)
    // Response: {} (ack only)
    //
    // 📝 Logic dari main.min.js:
    //   - Dipakai untuk dungeon team invites
    //   - msgType = TeamDungeonBroadcastID (number)
    //   - params = dungeon info object
    // ───────────────────────────────────────────────────────────
    function handleChat(userId, friendId, msgType, params, callback) {
        if (!isValidUserId(friendId)) {
            log.warn('HANDLER', 'chat — no or invalid friendId');
            callback({});
            return;
        }

        friendId = toString(friendId);

        // Simpan sebagai invite message di target
        var targetData = getFriendData(friendId);
        if (!targetData.inviteMessages) {
            targetData.inviteMessages = [];
        }

        var now = Date.now();

        targetData.inviteMessages.push({
            _type: msgType,           // Number: invite type
            _from: userId,            // String: sender userId
            _time: now,               // Timestamp
            _params: params || {},    // Object: additional params
            teamExist: true           // Boolean: default true
        });

        saveFriendData(friendId, targetData);

        log.info('HANDLER', 'chat → invite sent to: ' + friendId +
            ', type: ' + msgType + ', time: ' + now);
        callback({});
    }

    // ───────────────────────────────────────────────────────────
    // 10. sendMsg — Send free-text message
    // Extra req: friendId, msg (string)
    // Response: {} (ack only)
    //
    // 📝 Logic dari main.min.js:
    //   - Simpan di PENGIRIM (_isSelf=true)
    //   - Simpan di PENERIMA (_isSelf=false)
    //   - Client update local setelah ack: setMessageDetalListByFriendId
    // ───────────────────────────────────────────────────────────
    function handleSendMsg(userId, friendId, msg, callback) {
        if (!isValidUserId(friendId)) {
            log.warn('HANDLER', 'sendMsg — no or invalid friendId');
            callback({});
            return;
        }

        if (msg === undefined || msg === null) {
            log.warn('HANDLER', 'sendMsg — no message content');
            callback({});
            return;
        }

        friendId = toString(friendId);
        var now = Date.now();
        var msgStr = toString(msg);

        // Build message object sesuai main.min.js format
        var messageObj = {
            _time: now,
            _isSelf: true,        // Pengirim selalu _isSelf=true
            _context: msgStr,     // String: pesan text
            _type: 0              // Number: message type (0=text)
        };

        // Simpan di pengirim
        var senderData = getFriendData(userId);
        if (!senderData.messages[friendId]) {
            senderData.messages[friendId] = [];
        }
        senderData.messages[friendId].push(messageObj);
        saveFriendData(userId, senderData);

        // Simpan juga di penerima (dengan _isSelf = false)
        var targetData = getFriendData(friendId);
        if (!targetData.messages[userId]) {
            targetData.messages[userId] = [];
        }
        targetData.messages[userId].push({
            _time: now,
            _isSelf: false,       // Penerima lihat _isSelf=false
            _context: msgStr,
            _type: 0
        });
        saveFriendData(friendId, targetData);

        log.info('HANDLER', 'sendMsg → to: ' + friendId + ', length: ' + msgStr.length);
        callback({});
    }

    // ───────────────────────────────────────────────────────────
    // 11. getMsg — Get message history with specific friend
    // Extra req: friendId, time (timestamp for pagination reference)
    // Response: { _msgs: [{_time, _isSelf, _context, _type}] }
    //
    // 📝 Logic dari main.min.js:
    //   - Client pakai ini untuk load message history
    //   - Setelah dapat, client simpan lokal: setMessageDetalListByFriendId
    // ───────────────────────────────────────────────────────────
    function handleGetMsg(userId, friendId, time, callback) {
        if (!isValidUserId(friendId)) {
            log.warn('HANDLER', 'getMsg — no or invalid friendId');
            callback({ _msgs: [] });
            return;
        }

        friendId = toString(friendId);
        var data = getFriendData(userId);
        var msgs = data.messages[friendId] || [];

        // Build response array sesuai format
        var response = [];

        for (var i = 0; i < msgs.length; i++) {
            response.push({
                _time: msgs[i]._time,
                _isSelf: msgs[i]._isSelf,
                _context: msgs[i]._context,
                _type: (msgs[i]._type !== undefined ? msgs[i]._type : 0)
            });
        }

        log.info('HANDLER', 'getMsg → ' + response.length + ' messages with: ' + friendId);
        callback({ _msgs: response });
    }

    // ───────────────────────────────────────────────────────────
    // 12. getMsgList — Get conversation summaries (brief)
    // Response: { _brief: { [friendId]: { lastMsgTime, lastReadTime, msg } } }
    //
    // 📝 Logic dari main.min.js:
    //   - Client panggil saat buka message list
    //   - Update UI dengan preview pesan terakhir
    // ───────────────────────────────────────────────────────────
    function handleGetMsgList(userId, callback) {
        var data = getFriendData(userId);
        var messages = data.messages || {};
        var brief = {};

        for (var friendId in messages) {
            if (messages.hasOwnProperty(friendId)) {
                var msgs = messages[friendId];

                if (Array.isArray(msgs) && msgs.length > 0) {
                    var lastMsg = msgs[msgs.length - 1];
                    var preview = lastMsg._context || '';

                    // Truncate preview jika terlalu panjang (max 20 chars seperti chat app)
                    if (preview.length > 20) {
                        preview = preview.substring(0, 20) + '...';
                    }

                    brief[friendId] = {
                        lastMsgTime: lastMsg._time || 0,
                        lastReadTime: 0,  // Single-server simplified
                        msg: preview
                    };
                }
            }
        }

        log.info('HANDLER', 'getMsgList → ' + Object.keys(brief).length + ' conversations');
        callback({ _brief: brief });
    }

    // ───────────────────────────────────────────────────────────
    // 13. readMsg — Mark messages as read
    // Extra req: friendId
    // Response: { _readTime: timestamp }
    //
    // 📝 Logic dari main.min.js:
    //   - Client update local: setMessageReadWithFriendId(e.userId, t._readTime)
    // ───────────────────────────────────────────────────────────
    function handleReadMsg(userId, friendId, callback) {
        if (!isValidUserId(friendId)) {
            log.warn('HANDLER', 'readMsg — no or invalid friendId');
            callback({ _readTime: 0 });
            return;
        }

        friendId = toString(friendId);
        var readTime = Date.now();

        // Note: Untuk single-server, readTime cukup dikembalikan
        // Client akan simpan local via TeamworkMailInfoManager
        // Server bisa track lastReadTime jika diperlukan untuk multi-device sync

        log.info('HANDLER', 'readMsg → friend: ' + friendId + ', readTime: ' + readTime);
        callback({ _readTime: readTime });
    }

    // ───────────────────────────────────────────────────────────
    // 14. getChatMsg — Get invite/chat messages (team dungeon etc.)
    // Extra req: time (current server time reference)
    // Response: { _msgs: [{_type, _from, _time, teamExist}] }
    //
    // 📝 Logic dari main.min.js:
    //   - Dipakai untuk load dungeon invites
    //   - Client proses: setTeamworkFriendInvitedList
    // ───────────────────────────────────────────────────────────
    function handleGetChatMsg(userId, time, callback) {
        var data = getFriendData(userId);
        var invites = data.inviteMessages || [];

        var response = [];

        for (var i = 0; i < invites.length; i++) {
            response.push({
                _type: invites[i]._type,
                _from: invites[i]._from,
                _time: invites[i]._time,
                teamExist: (invites[i].teamExist !== undefined ? invites[i].teamExist : false)
            });
        }

        log.info('HANDLER', 'getChatMsg → ' + response.length + ' invites');
        callback({ _msgs: response });
    }

    // ───────────────────────────────────────────────────────────
    // 15. delMsg — Delete conversation with friend
    // Extra req: friendId
    // Response: {} (ack only)
    // ───────────────────────────────────────────────────────────
    function handleDelMsg(userId, friendId, callback) {
        if (!isValidUserId(friendId)) {
            log.warn('HANDLER', 'delMsg — no or invalid friendId');
            callback({});
            return;
        }

        friendId = toString(friendId);
        var data = getFriendData(userId);

        // Delete messages untuk friend ini
        if (data.messages[friendId]) {
            delete data.messages[friendId];
            log.info('HANDLER', 'delMsg → cleared messages with: ' + friendId);
        }

        saveFriendData(userId, data);
        callback({});
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS (via console for debugging)
    // ═══════════════════════════════════════════════════════════════

    // Guard — pola sama dengan enterGame.js: lazy-loader bisa memuat file
    // ini SEBELUM enterGame, jadi MainServer.admin belum tentu ada.
    if (!MainServer.admin) {
        MainServer.admin = {};
    }

    /**
     * MainServer.admin.getFriendData(userId)
     * Lihat semua friend data user.
     *
     * Contoh: MainServer.admin.getFriendData('guest_xxx')
     */
    MainServer.admin.getFriendData = function (userId) {
        var data = getFriendData(userId);
        log.info('ADMIN', 'Friend data for: ' + userId);
        log.details('friends', [String(data.friends.length)]);
        log.details('blacklist', [String(data.blacklist.length)]);
        log.details('applyList', [String(data.applyList.length)]);

        var convCount = Object.keys(data.messages || {}).length;
        log.details('conversations', [String(convCount)]);
        log.details('inviteMessages', [String((data.inviteMessages || []).length)]);

        return data;
    };

    /**
     * MainServer.admin.clearFriendData(userId)
     * Reset semua friend data user.
     *
     * Contoh: MainServer.admin.clearFriendData('guest_xxx')
     */
    MainServer.admin.clearFriendData = function (userId) {
        var key = 'friend:' + userId;
        db._set(key, {
            friends: [],
            blacklist: [],
            applyList: [],
            messages: {},
            inviteMessages: []
        });
        log.info('ADMIN', 'Friend data cleared for: ' + userId);
    };

    /**
     * MainServer.admin.testFSUser(userId)
     * Test getUserProfile output untuk spesifik userId.
     * Cek apakah FSUser format sudah benar.
     */
    MainServer.admin.testFSUser = function (userId) {
        var profile = getUserProfile(userId);
        console.table(profile);
        log.info('ADMIN', 'FSUser test for: ' + userId);
        return profile;
    };

    // ═══════════════════════════════════════════════════════════════
    // REGISTER
    // ═══════════════════════════════════════════════════════════════

    MainServer.registerHandler('friend', 'friendServerAction', handleFriendServerAction);

    window.MainServer = MainServer;
})();
