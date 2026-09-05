/**
 * handlers/friend/getHeart.js — Receive (Claim) Heart from Friend
 * Super Warrior Z — MAIN SERVER
 *
 * ═══ CLIENT EVIDENCE (main.min.js) ═══
 *
 *   CALL SITE — FriendHeat receive button (receiveLoveBtnTap):
 *     ts.processHandler({type:"friend",action:"getHeart",userId:o,
 *       friendId:n.userId,version:"1.0"},function(n){
 *         UIWindowManager.openCongratulationObtain(n),   ← response = reward popup
 *         t+=1,
 *         FriendManager.getInstance().removeFromReceiveHearts(n),  ← butuh n.friendId!
 *         var o=e.data.refresh;o()})}
 *
 *   removeFromReceiveHearts(e): receiveHearts.indexOf(e.friendId) → splice,
 *   lalu getHearts.push(e.friendId) → RESPONSE WAJIB punya friendId.
 *
 *   Pre-check client: receiveHeartCount = receiveHearts.length → hanya tombol
 *   hati yang ada yang bisa diklik.
 *
 *   REWARD (pola paten autoGiveGetHeart.js): GET 1 = +1 item 121 (FRIENDHEART)
 *   Kuota: friendPointGetDailyMax = 30 (constant.json[1]), reset 6:00
 *
 * STATE (pola _friendHeart di user:{id}):
 *   receiveHearts[friendId] = true  (hati dari teman, dikirim via giveHeart)
 *   getHearts[friendId]     = true  (hati itu sudah diambil hari ini)
 *
 * Request : { type:'friend', action:'getHeart', userId, friendId, version:'1.0' }
 * Response: { friendId, _changeInfo:{ _items:{ '121': {_id:121,_num:newBalance} } } }
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    var FRIENDHEART_ID = 121;
    var FRIEND_POINT_GET_DAILY_MAX = 30; // constant.json[1].friendPointGetDailyMax

    // ─── generateRetrieveDay — pola paten enterGame.js/autoGiveGetHeart.js ───
    function generateRetrieveDay(date) {
        var utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
        var cstMs = utcMs + (8 * 3600000);
        var cstHour = Math.floor((cstMs % 86400000) / 3600000);
        if (cstHour < 6) {
            cstMs -= 86400000;
        }
        var adjusted = new Date(cstMs);
        return adjusted.getUTCFullYear() + '-' + (adjusted.getUTCMonth() + 1) + '-' + adjusted.getUTCDate();
    }

    function loadHeartState(userId) {
        var userKey = 'user:' + userId;
        var savedData = db._get(userKey);
        if (!savedData) return null;
        var state = savedData._friendHeart;
        var currentDate = generateRetrieveDay(new Date());
        if (!state) {
            state = { giveHearts: {}, getHearts: {}, receiveHearts: {}, date: currentDate };
        } else if (state.date !== currentDate) {
            state.giveHearts = {};
            state.getHearts = {};
            state.receiveHearts = {};
            state.date = currentDate;
        }
        return { userKey: userKey, savedData: savedData, state: state };
    }

    function saveHeartState(bundle) {
        bundle.savedData._friendHeart = bundle.state;
        db._set(bundle.userKey, bundle.savedData);
    }

    function countKeys(obj) {
        var n = 0;
        for (var k in obj) { if (obj.hasOwnProperty(k) && obj[k]) n++; }
        return n;
    }

    function getItemBalance(savedData, itemId) {
        if (!savedData || !savedData.totalProps || !savedData.totalProps._items) return 0;
        var items = savedData.totalProps._items;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === itemId) return Number(items[i]._num) || 0;
        }
        return 0;
    }

    function setItemBalance(savedData, itemId, newBalance) {
        if (!savedData.totalProps) savedData.totalProps = {};
        if (!savedData.totalProps._items) savedData.totalProps._items = [];
        var items = savedData.totalProps._items;
        var idStr = String(itemId);
        for (var i = 0; i < items.length; i++) {
            if (String(items[i]._id) === idStr) { items[i]._num = newBalance; return; }
        }
        items.push({ _id: idStr, _num: newBalance });
    }

    // ═══════════════════════════════════════════════════════════════
    // MAIN HANDLER: friend/getHeart
    // ═══════════════════════════════════════════════════════════════

    function handleGetHeart(request, callback) {
        var _logT0 = Date.now();

        var userId = request.userId;
        var friendId = request.friendId;

        log.info('HANDLER', 'friend/getHeart processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['friendId', friendId || '-']
        ]);

        // ═══════════════════════════════════════════════════════════
        //  ✅ VALIDATION
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var _validationChecks = [];

        if (!userId) { _validationChecks.push({ check: 'userId', result: '❌ MISSING' }); }
        else { _validationChecks.push({ check: 'userId', result: '✅ OK' }); }

        if (!friendId) { _validationChecks.push({ check: 'friendId', result: '❌ MISSING' }); }
        else { _validationChecks.push({ check: 'friendId', result: '✅ OK (' + friendId + ')' }); }

        console.table(_validationChecks);
        console.groupEnd();

        if (!userId || !friendId) {
            log.warn('HANDLER', 'getHeart — missing userId or friendId');
            callback({}, 1);
            return;
        }

        userId = String(userId);
        friendId = String(friendId);

        var bundle = loadHeartState(userId);
        if (!bundle) {
            log.error('HANDLER', 'getHeart — user not found: ' + userId);
            callback({}, 1);
            return;
        }

        // ═══════════════════════════════════════════════════════════
        //  ❤️ GET HEART PROCESSING
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c❤️ Get Heart Processing', 'color:#E91E63;font-weight:bold;');
        var _processSteps = [];

        // Hati harus ada (dikirim via giveHeart) — client hanya klik hati yang ada
        if (!bundle.state.receiveHearts[friendId]) {
            console.table([{ step: 'heartAvailable', status: '❌ NONE', detail: friendId }]);
            console.groupEnd();
            log.warn('HANDLER', 'getHeart — no heart from: ' + friendId + ' for ' + userId);
            callback({}, 1);
            return;
        }

        // Sudah diambil hari ini? (guard dobel — client juga menjaga via getHearts)
        if (bundle.state.getHearts[friendId]) {
            console.table([{ step: 'alreadyClaimedToday', status: '➖ NO-OP', detail: friendId }]);
            console.groupEnd();
            log.info('HANDLER', 'getHeart — already claimed today: ' + friendId);
            bundle.state.receiveHearts[friendId] = false; // bersihkan sisa
            saveHeartState(bundle);
            callback({ friendId: friendId });
            return;
        }

        // Kuota harian
        var getCount = countKeys(bundle.state.getHearts);
        if (getCount >= FRIEND_POINT_GET_DAILY_MAX) {
            console.table([{ step: 'dailyGetMax', status: '❌ FULL (' + FRIEND_POINT_GET_DAILY_MAX + ')', detail: friendId }]);
            console.groupEnd();
            log.warn('HANDLER', 'getHeart — daily get max reached: ' + userId);
            callback({}, 1);
            return;
        }

        // 1. Hati diambil: receiveHearts → getHearts
        bundle.state.receiveHearts[friendId] = false;
        bundle.state.getHearts[friendId] = true;
        _processSteps.push({ step: 'claimHeart', status: '✅ OK', detail: friendId });

        // 2. Reward: +1 FRIENDHEART (121) — pola autoGiveGetHeart.js
        var currentBalance = getItemBalance(bundle.savedData, FRIENDHEART_ID);
        var newBalance = currentBalance + 1;
        setItemBalance(bundle.savedData, FRIENDHEART_ID, newBalance);
        _processSteps.push({ step: 'reward', status: '✅ OK', detail: 'item 121: ' + currentBalance + ' → ' + newBalance });

        console.table(_processSteps);
        console.groupEnd();

        saveHeartState(bundle);

        log.info('HANDLER', 'getHeart → ' + userId + ' claimed heart from ' + friendId + ' (item 121 → ' + newBalance + ')');

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        var _respElapsed = Date.now() - _logT0;
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        console.log('   ✅ Get heart response built (friendId + reward popup)');
        console.log('   📊 friendId: ' + friendId + ' · item 121: ' + newBalance);
        console.log('   ⏱️  Total elapsed: ' + _respElapsed + 'ms');
        console.groupEnd();

        callback({
            friendId: friendId,
            _changeInfo: {
                _items: (function () {
                    var m = {};
                    m[String(FRIENDHEART_ID)] = { _id: FRIENDHEART_ID, _num: newBalance };
                    return m;
                })()
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // REGISTER
    // ═══════════════════════════════════════════════════════════════

    MainServer.registerHandler('friend', 'getHeart', handleGetHeart);

    window.MainServer = MainServer;
})();
