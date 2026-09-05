/**
 * handlers/friend/giveHeart.js — Give Heart to Friend
 * Super Warrior Z — MAIN SERVER
 *
 * ═══ CLIENT EVIDENCE (main.min.js) ═══
 *
 *   CALL SITE — FriendHeat give button (tombol kirim hati):
 *     ts.processHandler({type:"friend",action:"giveHeart",userId:o,
 *       friendId:n.userId,version:"1.0"},function(o){
 *         t+=1,
 *         FriendManager.getInstance().addToGiveHearts(n.userId),
 *         UIWindowManager.openCongratulationObtain(o),      ← response = reward popup
 *         var a=e.data.refresh;a()})}
 *
 *   openCongratulationObtain(t): skip popup jika response tanpa
 *   _changeInfo/_addHeroes/... → response tanpa _changeInfo = popup tidak muncul.
 *
 *   REWARD (pola paten autoGiveGetHeart.js): GIVE 1 = +1 item 121 (FRIENDHEART)
 *
 *   Kuota harian (constant.json[1]): friendPointGiveDailyMax = 30,
 *   reset harian 6:00 (generateRetrieveDay — pola enterGame.js/autoGiveGetHeart.js)
 *
 * STATE (pola _friendHeart di user:{id}):
 *   pengirim  → _friendHeart.giveHearts[friendId]  = true (sudah diberi hari ini)
 *   penerima  → _friendHeart.receiveHearts[userId] = true (hati menunggu diambil)
 *
 * Request : { type:'friend', action:'giveHeart', userId, friendId, version:'1.0' }
 * Response: { _changeInfo:{ _items:{ '121': {_id:121,_num:newBalance} } } }
 *           (tanpa _changeInfo bila sudah diberi hari ini → popup skip)
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    var FRIENDHEART_ID = 121;
    var FRIEND_POINT_GIVE_DAILY_MAX = 30; // constant.json[1].friendPointGiveDailyMax

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
            // Reset harian (lewati batas 6:00) — pola autoGiveGetHeart.js
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
    // MAIN HANDLER: friend/giveHeart
    // ═══════════════════════════════════════════════════════════════

    function handleGiveHeart(request, callback) {
        var _logT0 = Date.now();

        var userId = request.userId;
        var friendId = request.friendId;

        log.info('HANDLER', 'friend/giveHeart processing');
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
            log.warn('HANDLER', 'giveHeart — missing userId or friendId');
            callback({}, 1);
            return;
        }

        userId = String(userId);
        friendId = String(friendId);

        // ── Harus berteman (bukti client: tombol hanya ada di daftar teman) ──
        var friendData = db._get('friend:' + userId);
        if (!friendData || !friendData.friends || friendData.friends.indexOf(friendId) === -1) {
            log.warn('HANDLER', 'giveHeart — not friends: ' + userId + ' → ' + friendId);
            callback({}, 1);
            return;
        }

        // ── State pengirim ──
        var sender = loadHeartState(userId);
        if (!sender) {
            log.error('HANDLER', 'giveHeart — user not found: ' + userId);
            callback({}, 1);
            return;
        }

        // ── State penerima (hati menunggu di sisi penerima) ──
        var receiver = loadHeartState(friendId);

        // ═══════════════════════════════════════════════════════════
        //  ❤️ GIVE HEART PROCESSING
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c❤️ Give Heart Processing', 'color:#E91E63;font-weight:bold;');
        var _processSteps = [];

        // Sudah diberi hari ini → response tanpa _changeInfo (popup skip, no-op)
        if (sender.state.giveHearts[friendId]) {
            console.table([{ step: 'alreadyGivenToday', status: '➖ NO-OP', detail: friendId }]);
            console.groupEnd();
            log.info('HANDLER', 'giveHeart → already given today: ' + userId + ' → ' + friendId);
            saveHeartState(sender);
            callback({});
            return;
        }

        // Kuota harian
        var giveCount = countKeys(sender.state.giveHearts);
        if (giveCount >= FRIEND_POINT_GIVE_DAILY_MAX) {
            console.table([{ step: 'dailyGiveMax', status: '❌ FULL (' + FRIEND_POINT_GIVE_DAILY_MAX + ')', detail: friendId }]);
            console.groupEnd();
            log.warn('HANDLER', 'giveHeart — daily give max reached: ' + userId);
            saveHeartState(sender);
            callback({}, 1);
            return;
        }

        // 1. Pengirim: tandai sudah memberi
        sender.state.giveHearts[friendId] = true;
        _processSteps.push({ step: 'markGiven', status: '✅ OK', detail: friendId });

        // 2. Penerima: hati menunggu diambil (kalau data user penerima ada)
        if (receiver) {
            receiver.state.receiveHearts[userId] = true;
            saveHeartState(receiver);
            _processSteps.push({ step: 'deliverToReceiver', status: '✅ OK', detail: userId + ' → ' + friendId });
        } else {
            _processSteps.push({ step: 'deliverToReceiver', status: '⚠️ RECEIVER NOT FOUND', detail: friendId });
        }

        // 3. Reward pengirim: +1 FRIENDHEART (121) — pola autoGiveGetHeart.js
        var currentBalance = getItemBalance(sender.savedData, FRIENDHEART_ID);
        var newBalance = currentBalance + 1;
        setItemBalance(sender.savedData, FRIENDHEART_ID, newBalance);
        _processSteps.push({ step: 'reward', status: '✅ OK', detail: 'item 121: ' + currentBalance + ' → ' + newBalance });

        console.table(_processSteps);
        console.groupEnd();

        saveHeartState(sender);

        log.info('HANDLER', 'giveHeart → ' + userId + ' gave heart to ' + friendId + ' (item 121 → ' + newBalance + ')');

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        var _respElapsed = Date.now() - _logT0;
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        console.log('   ✅ Give heart response built (reward popup)');
        console.log('   📊 item 121: ' + newBalance);
        console.log('   ⏱️  Total elapsed: ' + _respElapsed + 'ms');
        console.groupEnd();

        callback({
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

    MainServer.registerHandler('friend', 'giveHeart', handleGiveHeart);

    window.MainServer = MainServer;
})();
