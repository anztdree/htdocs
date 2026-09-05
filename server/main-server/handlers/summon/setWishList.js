/**
 * handlers/summon/setWishList.js — Set Wish List Handler
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * HANDLER: summon/setWishList
 * ============================================================
 *
 * Client call — 1 call site (main.min.js confirmBtnTap SummonWishList):
 *
 *   t.prototype.confirmBtnTap = function () {
 *     var e = this, t = e.data, n = e.getHasChosedDisplayIdList();
 *     return n.length < t.wishListMaxNum
 *       ? void UIWindowManager.openNoCloseWindows(getLanguageWithEditor('SummonWishList','id2'))
 *       : (
 *         ts.processHandler(
 *           { type:'summon', action:'setWishList',
 *             userId: UserInfoSingleton.getInstance().userId, wishList: n },
 *           function (e) {
 *             SummonSingleton.getInstance().WishList = e.wishList,
 *             UIWindowManager.openBarTypeTips(getLanguageWithEditor('SummonWishList','id4'))
 *           }),
 *         SummonSingleton.getInstance().WishVersion = HeroCommon.getWishMaxVersion(),
 *         void ts.closeWindow('SummonWishList'))
 *   }
 *
 *   ── REQUEST ──
 *   {
 *     type    : 'summon',
 *     action  : 'setWishList',
 *     userId  : number,
 *     wishList: [displayId, ...]   ← getHasChosedDisplayIdList()
 *   }
 *   Client guard: n.length < wishListMaxNum → TIDAK dikirim (tolak lokal).
 *   wishListMaxNum = ReadJsonSingleton.constant[1].wishListMaxNum = 15.
 *
 *   ── POOL PILIHAN ──
 *   SummonWishListViewData.initData:
 *     e.wishMap = HeroCommon.getWishHeroInfo('flickerOrange')
 *   → hanya hero quality 'flickerOrange' (join heroBook × hero.json)
 *     yang bisa dipilih → server memvalidasi id terhadap pool yang sama.
 *
 * ============================================================
 * RESPONSE FORMAT (kontrak callback client):
 * ============================================================
 *   {
 *     wishList: [displayId, ...]  ← WAJIB: client set
 *                                    SummonSingleton.WishList = e.wishList
 *   }
 *
 *   Callback TIDAK membaca field lain — respons minimal & akurat.
 *
 * ============================================================
 * EFEK SAMPING SERVER (mirror persis urutan client):
 * ============================================================
 *   1. summon._wishList    = array final tersimpan
 *   2. summon._wishVersion = getWishMaxVersion()   ← mirror baris
 *      'WishVersion = HeroCommon.getWishMaxVersion()' setelah processHandler
 *   3. persist db → enterGame berikutnya kirim via setSummon
 *
 * ============================================================
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    if (!MainServer.handlers.summon) {
        MainServer.handlers.summon = {};
    }

    // ═══════════════════════════════════════════════════════════
    //  CONFIG LOADER (sync, cached)
    // ═══════════════════════════════════════════════════════════

    var _resourceCache = {};

    function loadJsonSync(name) {
        if (_resourceCache[name]) return _resourceCache[name];
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './resource/json/' + name + '.json', false);
            xhr.send();
            if (xhr.status === 200) {
                var data = JSON.parse(xhr.responseText);
                _resourceCache[name] = data;
                return data;
            }
            log.error('RESOURCE', 'setWishList failed to load: ' + name + '.json — HTTP ' + xhr.status);
        } catch (e) {
            log.error('RESOURCE', 'setWishList failed to load: ' + name + '.json — ' + e.message);
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  WISH CONSTANTS (mirror client)
    // ═══════════════════════════════════════════════════════════

    var WISH_QUALITY = 'flickerOrange';  // getWishHeroInfo('flickerOrange')

    // wishListMaxNum — client: ReadJsonSingleton.constant[1].wishListMaxNum
    var _wishListMaxNum = null;

    function getWishListMaxNum() {
        if (_wishListMaxNum !== null) return _wishListMaxNum;
        var c = loadJsonSync('constant');
        var entry = c ? (c['1'] !== undefined ? c['1'] : (Array.isArray(c) ? c[1] : null)) : null;
        _wishListMaxNum = (entry && Number(entry.wishListMaxNum)) || 15;
        log.details('WISHLIST', [['wishListMaxNum', String(_wishListMaxNum)]]);
        return _wishListMaxNum;
    }

    // getWishMaxVersion — mirror HeroCommon.getWishMaxVersion (join heroBook × hero)
    var _wishMaxVersion = null;

    function getWishMaxVersion() {
        if (_wishMaxVersion !== null) return _wishMaxVersion;
        var book = loadJsonSync('heroBook');
        var hero = loadJsonSync('hero');
        if (!book || !hero) {
            log.error('WISHLIST', 'config heroBook/hero tidak tersedia — _wishMaxVersion fallback 0');
            _wishMaxVersion = 0;
            return _wishMaxVersion;
        }
        var maxV = 0;
        for (var k in book) {
            var a = book[k];
            if (!a || a.id === undefined) continue;
            var r = hero[String(a.id)];
            if (r && r.quality === WISH_QUALITY) {
                var v = Number(a.isNewVersion) || 0;
                if (v > maxV) maxV = v;
            }
        }
        _wishMaxVersion = maxV;
        return _wishMaxVersion;
    }

    // Pool wish sah — set displayId hero quality flickerOrange (hero.json)
    var _wishPool = null;

    function getWishPool() {
        if (_wishPool !== null) return _wishPool;
        var pool = {};
        var hero = loadJsonSync('hero');
        if (hero) {
            for (var k in hero) {
                if (hero[k] && hero[k].quality === WISH_QUALITY) {
                    pool[String(k)] = true;
                }
            }
        }
        _wishPool = pool;
        return _wishPool;
    }

    // ═══════════════════════════════════════════════════════════
    //  STORAGE HELPERS
    // ═══════════════════════════════════════════════════════════

    function userStorageKey(userId) {
        return 'user:' + userId;
    }

    // Pola summonOne.js — summon struct WAJIB ada sebelum ditulis
    function ensureSummonData(savedData, userId) {
        if (!savedData.summon) {
            savedData.summon = {
                _energy: 50,                 // ✅ L114903
                _wishList: [],               // ✅ L114904
                _wishVersion: 0,             // ✅ L114905
                _canCommonFreeTime: 0,       // ✅ L114906
                _canSuperFreeTime: 0,        // ✅ L114907
                _summonTimes: {}             // ✅ L114908-114911
            };
            log.details('SUMMON', 'initialized summon data structure for userId=' + userId);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  WISHLIST NORMALIZE
    //  1. Number() normalisasi (client kirim displayId config)
    //  2. buang NaN / duplikat
    //  3. filter pool flickerOrange (mirror wishMap client)
    //  4. clamp ke wishListMaxNum (mirror guard confirmBtnTap)
    // ═══════════════════════════════════════════════════════════

    function normalizeWishList(raw) {
        var pool = getWishPool();
        var max = getWishListMaxNum();
        var seen = {};
        var out = [];
        var dropped = { dup: 0, notInPool: 0, invalid: 0 };

        for (var i = 0; i < raw.length; i++) {
            var id = Number(raw[i]);
            if (!isFinite(id) || id <= 0) { dropped.invalid++; continue; }
            var key = String(id);
            if (seen[key]) { dropped.dup++; continue; }
            if (!pool[key]) { dropped.notInPool++; continue; }
            seen[key] = true;
            out.push(id);
            if (out.length >= max) break;   // clamp — sisanya diabaikan
        }

        return { list: out, dropped: dropped };
    }

    // ═══════════════════════════════════════════════════════════
    //  HANDLER
    // ═══════════════════════════════════════════════════════════

    var _t0 = 0;

    function handleSetWishList(request, callback) {
        _t0 = Date.now();
        console.groupCollapsed('%c🌟 summon/setWishList', 'color:#6A1B9A;font-weight:bold;');
        console.log('   📥 Request:', JSON.stringify(request || {}));

        // ── Validasi userId ──
        var userId = request ? request.userId : undefined;
        if (userId === undefined || userId === null || userId === '') {
            log.warn('HANDLER', 'summon/setWishList — missing userId');
            console.groupEnd();
            callback({ _error: 'missing_userId' }, 1);
            return;
        }

        // ── Validasi wishList ──
        var raw = request ? request.wishList : undefined;
        if (!raw || !Array.isArray(raw) || raw.length === 0) {
            log.warn('HANDLER', 'summon/setWishList — invalid wishList (missing/not array/empty)');
            console.groupEnd();
            callback({ _error: 'invalid_wishList' }, 1);
            return;
        }

        // ── Load user data ──
        var storageKey = userStorageKey(userId);
        var savedData = db._get(storageKey);
        if (!savedData) {
            log.warn('HANDLER', 'summon/setWishList — user data not found: ' + storageKey);
            console.groupEnd();
            callback({ _error: 'user_not_found' }, 1);
            return;
        }

        ensureSummonData(savedData, userId);

        // ── Normalize + simpan ──
        var norm = normalizeWishList(raw);
        var oldList = savedData.summon._wishList || [];
        savedData.summon._wishList = norm.list;

        // Mirror client: WishVersion = getWishMaxVersion() (setelah processHandler)
        var newVersion = getWishMaxVersion();
        savedData.summon._wishVersion = newVersion;

        db._set(storageKey, savedData);

        log.info('WISHLIST', 'userId=' + userId + ' wishList saved — ' +
            oldList.length + ' → ' + norm.list.length + ' entries (max ' + getWishListMaxNum() + ')');
        log.details('WISHLIST', [
            ['dropped.notInPool', String(norm.dropped.notInPool)],
            ['dropped.dup', String(norm.dropped.dup)],
            ['dropped.invalid', String(norm.dropped.invalid)],
            ['wishVersion', String(newVersion)]
        ]);

        console.log('   ✅ wishList: [' + norm.list.join(', ') + ']');
        console.table([
            { Field: 'entries', Value: norm.list.length, Note: 'max ' + getWishListMaxNum() },
            { Field: 'dropped', Value: JSON.stringify(norm.dropped), Note: 'notInPool/dup/invalid' },
            { Field: '_wishVersion', Value: newVersion, Note: 'mirrored client' },
            { Field: 'ret', Value: 0, Note: 'success' }
        ]);
        console.log('   ⏱️ ' + (Date.now() - _t0) + 'ms');
        console.groupEnd();

        // Kontrak callback client: SummonSingleton.WishList = e.wishList
        callback({ wishList: norm.list });
    }

    // ═══════════════════════════════════════════════════════════
    //  REGISTER HANDLER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('summon', 'setWishList', handleSetWishList);

    window.MainServer = MainServer;

})();
