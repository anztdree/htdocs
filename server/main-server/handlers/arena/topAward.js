/**
 * handlers/arena/topAward.js — Arena Top Rank Award Claim Handler (BARU)
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 *  KONTRAK CLIENT (verbatim main.min.js):
 * ============================================================
 *
 *  CALL SITE 1 @4689494 (JialintaAwardRankListItem.item_getRewardBtnTap)
 *  CALL SITE 2 @5172765 (BossDamageAwardRankListItem.item_getRewardBtnTap)
 *
 *    ts.processHandler({type:"arena",action:"topAward",
 *        userId:..., rewardId:e.data.rewardId, version:"1.0"},
 *      function(t){
 *        e.data.refreshList(e.data.rewardId);
 *        ItemsCommonSingleton.getInstance().openCommonItemGetTips(t._changeInfo._items)
 *      })
 *
 *  → response WAJIB punya _changeInfo._items (popup item didapat).
 *
 *  Sumber rewardId: id baris arenaTopRankAward.json (10,20,30,40,50,60,...)
 *  Konfigurasi (verbatim resource/json/arenaTopRankAward.json):
 *    { id:10, rankStart:1, rankEnd:1, topRankAward1:101, num1:1200 }
 *    { id:20, rankStart:2, rankEnd:3, topRankAward1:101, num1:800 }
 *    { id:30, rankStart:4, rankEnd:10, ... } dst.
 *
 *  Award = HADIAH BEST-RANK (riwayat). Kelayakan = _topRank (rank terbaik)
 *  player ∈ [rankStart..rankEnd]. One-time claim per rewardId —
 *  ditandai di savedData._haveGotTopReward[rewardId] = true.
 *
 *  _haveGotTopReward dikirim ke client via arena/join response
 *  (_arena._haveGotTopReward — verbatim ArenaMainViewData.initMyData:
 *   t._haveGotTopReward = e._haveGotTopReward).
 *
 * ============================================================
 *  RESPONSE FORMAT:
 * ============================================================
 *  { _changeInfo: { _items: { "<itemId>": {_id, _num(ABSOLUTE)} } } }
 * ============================================================
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    var RET_CODES = {
        OK: 0,
        MISSING_USERID: 10001,
        USER_NOT_FOUND: 10003,
        BAD_REWARD_ID: 20041,
        NOT_ELIGIBLE: 20042,
        ALREADY_CLAIMED: 20043,
        SERVER_ERROR: 99999
    };

    // ═══════════════════════════════════════════════════════════
    //  CONFIG LOADING (sync XHR + cache)
    // ═══════════════════════════════════════════════════════════

    var _topAwardCfg = null;

    function loadArenaTopRankAwardCfg() {
        if (_topAwardCfg) return _topAwardCfg;
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './resource/json/arenaTopRankAward.json', false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                _topAwardCfg = JSON.parse(xhr.responseText);
            }
        } catch (e) {
            log.warn('ARENA_TOPAWARD', 'arenaTopRankAward.json failed — ' + e.message);
        }
        return _topAwardCfg || {};
    }

    // ═══════════════════════════════════════════════════════════
    //  ITEM BALANCE (pola verbatim tower/buyBattleTimes.js)
    // ═══════════════════════════════════════════════════════════

    function getBal(sd, id) {
        var items = sd && sd.totalProps && sd.totalProps._items;
        if (!items) return 0;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(id)) return Number(items[i]._num) || 0;
        }
        return 0;
    }

    function setBal(sd, id, val) {
        if (!sd.totalProps) sd.totalProps = { _items: [] };
        if (!sd.totalProps._items) sd.totalProps._items = [];
        var items = sd.totalProps._items;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(id)) { items[i]._num = val; return val; }
        }
        items.push({ _id: id, _num: val });
        return val;
    }

    function grantReward(sd, changeItems, itemId, amount) {
        if (!itemId || itemId <= 0 || !amount || amount <= 0) return 0;
        var nb = getBal(sd, itemId) + amount;
        setBal(sd, itemId, nb);
        changeItems[String(itemId)] = { _id: itemId, _num: nb };
        return nb;
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN HANDLER
    // ═══════════════════════════════════════════════════════════

    function handleArenaTopAward(request, callback) {
        var userId = request.userId;
        var rewardId = request.rewardId;

        log.info('ARENA_TOPAWARD', 'arena/topAward processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['rewardId', rewardId != null ? String(rewardId) : '-']
        ]);

        try {
            if (!userId) {
                log.warn('ARENA_TOPAWARD', 'missing userId');
                callback({ ret: RET_CODES.MISSING_USERID, msg: 'userId tidak boleh kosong' }, RET_CODES.MISSING_USERID);
                return;
            }

            if (rewardId == null || rewardId === '') {
                log.warn('ARENA_TOPAWARD', 'missing rewardId');
                callback({ ret: RET_CODES.BAD_REWARD_ID, msg: 'rewardId tidak valid' }, RET_CODES.BAD_REWARD_ID);
                return;
            }

            var savedData = db._get('user:' + userId);
            if (!savedData) {
                log.warn('ARENA_TOPAWARD', 'user not found: ' + userId);
                callback({ ret: RET_CODES.USER_NOT_FOUND, msg: 'User tidak ditemukan' }, RET_CODES.USER_NOT_FOUND);
                return;
            }

            // STEP 1: lookup config by rewardId (id baris)
            var cfg = loadArenaTopRankAwardCfg();
            var tier = cfg[String(rewardId)];
            if (!tier) {
                log.warn('ARENA_TOPAWARD', 'rewardId not in arenaTopRankAward.json: ' + rewardId);
                callback({ ret: RET_CODES.BAD_REWARD_ID, msg: 'rewardId tidak dikenal' }, RET_CODES.BAD_REWARD_ID);
                return;
            }

            // STEP 2: kelayakan — _topRank (best rank) dalam [rankStart..rankEnd]
            var arenaState = (MainServer._arenaStates && MainServer._arenaStates[userId]) || null;
            var topRank = (arenaState && typeof arenaState._topRank === 'number')
                ? arenaState._topRank
                : ((typeof savedData._arenaTopRank === 'number') ? savedData._arenaTopRank : 2001);

            var rankStart = Number(tier.rankStart) || 0;
            var rankEnd = Number(tier.rankEnd) || 0;
            if (!(topRank >= rankStart && topRank <= rankEnd)) {
                log.warn('ARENA_TOPAWARD', 'not eligible — topRank=' + topRank +
                    ' need [' + rankStart + '..' + rankEnd + ']');
                callback({ ret: RET_CODES.NOT_ELIGIBLE, msg: 'Rank terbaik belum mencapai tier ini' }, RET_CODES.NOT_ELIGIBLE);
                return;
            }

            // STEP 3: one-time claim (persist)
            if (!savedData._haveGotTopReward || typeof savedData._haveGotTopReward !== 'object') {
                savedData._haveGotTopReward = {};
            }
            if (savedData._haveGotTopReward[String(rewardId)]) {
                log.warn('ARENA_TOPAWARD', 'already claimed — rewardId=' + rewardId);
                callback({ ret: RET_CODES.ALREADY_CLAIMED, msg: 'Sudah diklaim' }, RET_CODES.ALREADY_CLAIMED);
                return;
            }

            // STEP 4: grant slots topRankAward1..4 + num1..4 (existence check)
            var changeItems = {};
            var granted = 0;
            for (var slot = 1; slot <= 4; slot++) {
                var itemId = Number(tier['topRankAward' + slot]);
                var amount = Number(tier['num' + slot]);
                if (itemId > 0 && amount > 0) {
                    grantReward(savedData, changeItems, itemId, amount);
                    granted++;
                }
            }

            if (granted === 0) {
                log.warn('ARENA_TOPAWARD', 'no valid reward slots in tier id=' + rewardId);
                callback({ ret: RET_CODES.BAD_REWARD_ID, msg: 'Reward kosong' }, RET_CODES.BAD_REWARD_ID);
                return;
            }

            // STEP 5: tandai claimed + persist + sinkron arena state
            savedData._haveGotTopReward[String(rewardId)] = true;
            db._set('user:' + userId, savedData);
            if (arenaState) {
                if (!arenaState._haveGotTopReward || typeof arenaState._haveGotTopReward !== 'object') {
                    arenaState._haveGotTopReward = {};
                }
                arenaState._haveGotTopReward[String(rewardId)] = true;
            }

            log.info('ARENA_TOPAWARD', 'OK — rewardId=' + rewardId + ' topRank=' + topRank +
                ' granted=' + granted + ' items');

            // KONTRAK: openCommonItemGetTips(t._changeInfo._items)
            callback({ _changeInfo: { _items: changeItems } });

        } catch (err) {
            log.error('ARENA_TOPAWARD', 'arena/topAward UNCAUGHT ERROR', err);
            callback({ ret: RET_CODES.SERVER_ERROR, msg: err.message || 'Unknown error' }, RET_CODES.SERVER_ERROR);
        }
    }

    MainServer.registerHandler('arena', 'topAward', handleArenaTopAward);

    window.MainServer = MainServer;
})();
