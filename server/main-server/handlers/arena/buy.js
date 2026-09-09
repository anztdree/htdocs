/**
 * handlers/arena/buy.js — Arena Buy Attack Times Handler (BARU)
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 *  KONTRAK CLIENT (verbatim main.min.js @5838377):
 * ============================================================
 *
 *  REQUEST (addTimesBtnTap):
 *    ts.processHandler({type:"arena",action:"buy",
 *        userId:..., version:"1.0"}, function(t){...})
 *
 *  CALLBACK (verbatim):
 *    ItemsCommonSingleton.getInstance().resetTtemsCallBack(t)
 *      → baca t._changeInfo._items (ABSOLUTE new balance per item id)
 *    AllRefreshCount.getInstance().arenaBuyTimesCount++
 *    AllRefreshCount.getInstance().arenaAttackTimes +=
 *        ReadJsonSingleton.getInstance().constant[1].arenaAttackTimesBuy (=3)
 *    e.initLabelValue1()
 *
 *  CLIENT PRE-CHECK (ArenaMainViewData — server harus validasi sama):
 *    vipLevel()    = arenaTimesBuy[buyCount+1].vipNeeded
 *    moneyNeeded() = arenaTimesBuy[buyCount+1].arenaRefreshPrice
 *    moneyId()     = arenaTimesBuy[buyCount+1].arenaCostID
 *    buyValue()    → jika baris habis → teks "tidak bisa beli"
 *                    (arenaMainViewData id5) + tombol tidak jalan
 *    → konfigurasi: arenaTimesBuy.json {1..N}: {arenaCostID, arenaRefreshPrice,
 *       vipNeeded}; constant.arenaAttackTimesBuy = 3
 *
 *  VIP LEVEL: item 106 di totalProps (pola verbatim trial/vipBuy.js)
 *
 * ============================================================
 *  SERVER LOGIC:
 * ============================================================
 *  1. buyCount = scheduleInfo._arenaBuyTimesCount (persist)
 *  2. row = arenaTimesBuy[buyCount+1]; tidak ada → error MAX_REACHED
 *  3. vipNeeded > userVipLevel → error VIP_NOT_ENOUGH
 *  4. saldo(arenaCostID) < arenaRefreshPrice → error INSUFFICIENT
 *  5. deduct + arenaState._attackTimes += constant.arenaAttackTimesBuy
 *     + buyCount++ + sinkron scheduleInfo (FIX B3) + persist
 *  6. RESPONSE { _changeInfo: { _items: { "<costID>": {_id,_num} } } }
 * ============================================================
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    var RET_CODES = {
        OK: 0,
        MISSING_USERID: 8,      // errorDefine 8     = ERROR_LACK_PARAM (window)
        USER_NOT_FOUND: 2,      // errorDefine 2     = ERROR_STATE_ERROR (window)
        MAX_REACHED: 26003,     // errorDefine 26003 = ERROR_ARENA_BUY_EXCEED (float)
        VIP_NOT_ENOUGH: 26004,  // errorDefine 26004 = ERROR_ARENA_BUY_VIP_NOT_ENOUGH (float)
        INSUFFICIENT: 7,        // errorDefine 7     = ERROR_LACK_ITEM (window)
        SERVER_ERROR: 1         // errorDefine 1     = ERROR_UNKNOWN (window)
    };

    var VIP_LEVEL_ID = 106;  // verbatim trial/vipBuy.js

    // ═══════════════════════════════════════════════════════════
    //  CONFIG LOADING (sync XHR + cache)
    // ═══════════════════════════════════════════════════════════

    var _buyCfg = null;
    var _constantCfg = null;

    function loadArenaTimesBuyCfg() {
        if (_buyCfg) return _buyCfg;
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './resource/json/arenaTimesBuy.json', false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                _buyCfg = JSON.parse(xhr.responseText);
            }
        } catch (e) {
            log.warn('ARENA_BUY', 'arenaTimesBuy.json failed — ' + e.message);
        }
        return _buyCfg || {};
    }

    function loadConstantCfg() {
        if (_constantCfg) return _constantCfg;
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './resource/json/constant.json', false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                _constantCfg = JSON.parse(xhr.responseText);
            }
        } catch (e) {
            log.warn('ARENA_BUY', 'constant.json failed — ' + e.message);
        }
        return _constantCfg || {};
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

    function getUserVipLevel(sd) {
        // VIP = item 106 (verbatim trial/vipBuy.js)
        return getBal(sd, VIP_LEVEL_ID);
    }

    // ═══════════════════════════════════════════════════════════
    //  ARENA STATE (init dari scheduleInfo — sama pola startBattle/join)
    // ═══════════════════════════════════════════════════════════

    function ensureArenaState(userId, savedData) {
        if (!MainServer._arenaStates) MainServer._arenaStates = {};
        if (!MainServer._arenaStates[userId]) {
            var sched = (savedData.scheduleInfo && typeof savedData.scheduleInfo === 'object')
                        ? savedData.scheduleInfo : {};
            var cRoot = loadConstantCfg();
            var cData = (cRoot && cRoot['1']) ? cRoot['1'] : (cRoot || {});
            var atkDefault = Number(cData.arenaAttackTimes) || 5;

            MainServer._arenaStates[userId] = {
                _rank: (typeof savedData._arenaRank === 'number') ? savedData._arenaRank : 2001,
                _topRank: (typeof savedData._arenaTopRank === 'number') ? savedData._arenaTopRank : 2001,
                _dailyRank: (typeof savedData._arenaRank === 'number') ? savedData._arenaRank : 2001,
                _dailyRewardTag: '', _rewardTags: [],
                _attackTimes: (typeof sched._arenaAttackTimes === 'number') ? sched._arenaAttackTimes : atkDefault,
                _buyTimesCount: (typeof sched._arenaBuyTimesCount === 'number') ? sched._arenaBuyTimesCount : 0,
                _lastDailyReset: Date.now(),
                _defenseTeam: null, _defenseSuper: null,
                _defenseTeamFull: null, _defenseSuperFull: null,
                _haveGotTopReward: savedData._haveGotTopReward || {}
            };
        }
        return MainServer._arenaStates[userId];
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN HANDLER
    // ═══════════════════════════════════════════════════════════

    function handleArenaBuy(request, callback) {
        var userId = request.userId;

        log.info('ARENA_BUY', 'arena/buy processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['version', request.version || '-']
        ]);

        try {
            if (!userId) {
                log.warn('ARENA_BUY', 'missing userId');
                callback({ ret: RET_CODES.MISSING_USERID, msg: 'userId tidak boleh kosong' }, RET_CODES.MISSING_USERID);
                return;
            }

            var savedData = db._get('user:' + userId);
            if (!savedData) {
                log.warn('ARENA_BUY', 'user not found: ' + userId);
                callback({ ret: RET_CODES.USER_NOT_FOUND, msg: 'User tidak ditemukan' }, RET_CODES.USER_NOT_FOUND);
                return;
            }

            var arenaState = ensureArenaState(userId, savedData);
            var buyCount = arenaState._buyTimesCount || 0;

            // STEP 1: baris harga berikutnya (arenaTimesBuy[buyCount+1])
            var buyCfg = loadArenaTimesBuyCfg();
            var row = buyCfg[String(buyCount + 1)];
            if (!row) {
                log.warn('ARENA_BUY', 'buy limit reached — buyCount=' + buyCount +
                    ' (no row ' + (buyCount + 1) + ' in arenaTimesBuy.json)');
                callback({ ret: RET_CODES.MAX_REACHED, msg: 'Batas beli tercapai' }, RET_CODES.MAX_REACHED);
                return;
            }

            // STEP 2: VIP gate (kontrak client vipEnough)
            var cRoot = loadConstantCfg();
            var cData = (cRoot && cRoot['1']) ? cRoot['1'] : (cRoot || {});
            var atkBuy = Number(cData.arenaAttackTimesBuy) || 3;

            var vipNeeded = Number(row.vipNeeded) || 0;
            var userVip = getUserVipLevel(savedData);
            if (userVip < vipNeeded) {
                log.warn('ARENA_BUY', 'VIP too low — user=' + userVip + ' needed=' + vipNeeded);
                callback({ ret: RET_CODES.VIP_NOT_ENOUGH, msg: 'VIP tidak cukup' }, RET_CODES.VIP_NOT_ENOUGH);
                return;
            }

            // STEP 3: saldo & potong (currency = row.arenaCostID, harga = row.arenaRefreshPrice)
            var curId = Number(row.arenaCostID) || 101;
            var price = Number(row.arenaRefreshPrice) || 0;
            var bal = getBal(savedData, curId);
            if (bal < price) {
                log.warn('ARENA_BUY', 'insufficient — item=' + curId + ' have=' + bal + ' need=' + price);
                callback({ ret: RET_CODES.INSUFFICIENT, msg: 'Saldo tidak cukup' }, RET_CODES.INSUFFICIENT);
                return;
            }
            var newBal = setBal(savedData, curId, bal - price);

            // STEP 4: tambah attack times (server-side + sinkron scheduleInfo B3)
            arenaState._attackTimes += atkBuy;
            arenaState._buyTimesCount = buyCount + 1;

            if (!savedData.scheduleInfo || typeof savedData.scheduleInfo !== 'object') {
                savedData.scheduleInfo = {};
            }
            savedData.scheduleInfo._arenaAttackTimes = arenaState._attackTimes;
            savedData.scheduleInfo._arenaBuyTimesCount = arenaState._buyTimesCount;

            db._set('user:' + userId, savedData);

            log.info('ARENA_BUY', 'OK — cost=' + curId + ' -' + price + ' (bal=' + newBal + ')' +
                ' attacks=' + arenaState._attackTimes + ' buyCount=' + arenaState._buyTimesCount);

            // KONTRAK: resetTtemsCallBack(t) → _changeInfo._items ABSOLUTE
            var changeItems = {};
            changeItems[String(curId)] = { _id: curId, _num: newBal };
            callback({ _changeInfo: { _items: changeItems } });

        } catch (err) {
            log.error('ARENA_BUY', 'arena/buy UNCAUGHT ERROR', err);
            callback({ ret: RET_CODES.SERVER_ERROR, msg: err.message || 'Unknown error' }, RET_CODES.SERVER_ERROR);
        }
    }

    MainServer.registerHandler('arena', 'buy', handleArenaBuy);

    window.MainServer = MainServer;
})();
