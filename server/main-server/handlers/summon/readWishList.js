/**
 * handlers/summon/readWishList.js — Read Wish List Handler (mark-as-read)
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * HANDLER: summon/readWishList
 * ============================================================
 *
 * Client call — 1 call site (main.min.js wishListBtnTap):
 *
 *   t.prototype.wishListBtnTap = function () {
 *     var e = this, t = UserInfoSingleton.getInstance().userId;
 *     e.wishListRedImg.visible && (
 *       e.wishListRedImg.visible = !1,
 *       ts.processHandler({ type:'summon', action:'readWishList', userId:t })
 *     ),
 *     ts.openWindow('SummonWishList', { parent:'summon' })
 *   }
 *
 *   Trigger: red dot wishlist menyala, lalu player tap tombol wishlist.
 *   Red dot rule (main.min.js):
 *     wishListRedImg.visible = HeroCommon.getWishMaxVersion() != n.WishVersion
 *
 *   ── TANPA CALLBACK (fire-and-forget) ──
 *   Client MENGABAIKAN respons action ini. Fungsi server: menyimpan state
 *   "wishlist sudah dibaca" agar WishVersion tersinkron lintas sesi
 *   (enterGame berikutnya mengirim summon._wishVersion → setSummon).
 *
 * ============================================================
 * KONTRAK YANG DIMIRROR SERVER (persis perilaku client):
 * ============================================================
 *
 *   closeBtnTap / confirmBtnTap (main.min.js):
 *     SummonSingleton.getInstance().WishVersion = HeroCommon.getWishMaxVersion()
 *
 *   HeroCommon.getWishMaxVersion (main.min.js):
 *     var e = 0, t = ReadJsonSingleton.heroBook, n = getLocalHeroInfo();
 *     for (var o in t) {
 *       var a = t[o], r = n[a.id];
 *       r && 'flickerOrange' == r.quality && e < a.isNewVersion && (e = a.isNewVersion)
 *     }
 *     return e
 *
 *   ── getLocalHeroInfo = CONFIG hero.json (BUKAN koleksi user) ──
 *   → join: heroBook.json[isNewVersion] × hero.json[quality=flickerOrange]
 *   → konstan per roster game (bukan per user)
 *
 * ============================================================
 * RESPONSE FORMAT (diabaikan client — informatif utk log streaming):
 * ============================================================
 *   {
 *     _wishVersion : number  — versi roster yang baru tersimpan
 *     wishList     : array   — wishlist tersimpan (echo, tak berubah)
 *   }
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
            log.error('RESOURCE', 'readWishList failed to load: ' + name + '.json — HTTP ' + xhr.status);
        } catch (e) {
            log.error('RESOURCE', 'readWishList failed to load: ' + name + '.json — ' + e.message);
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  WISH MAX VERSION (mirror HeroCommon.getWishMaxVersion)
    // ═══════════════════════════════════════════════════════════
    //  join heroBook.json × hero.json:
    //    max(isNewVersion) utk entry dgn hero.json[id].quality == 'flickerOrange'
    //  Dihitung sekali (cache) — konstan per roster game.

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
            if (r && r.quality === 'flickerOrange') {
                var v = Number(a.isNewVersion) || 0;
                if (v > maxV) maxV = v;
            }
        }
        _wishMaxVersion = maxV;
        log.details('WISHLIST', [
            ['wishMaxVersion', String(_wishMaxVersion)],
            ['source', 'heroBook × hero(flickerOrange)']
        ]);
        return _wishMaxVersion;
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
    //  HANDLER
    // ═══════════════════════════════════════════════════════════

    var _t0 = 0;

    function handleReadWishList(request, callback) {
        _t0 = Date.now();
        console.groupCollapsed('%c📖 summon/readWishList', 'color:#6A1B9A;font-weight:bold;');
        console.log('   📥 Request:', JSON.stringify(request || {}));

        // ── Validasi userId ──
        var userId = request ? request.userId : undefined;
        if (userId === undefined || userId === null || userId === '') {
            log.warn('HANDLER', 'summon/readWishList — missing userId');
            console.groupEnd();
            callback({ _error: 'missing_userId' }, 1);
            return;
        }

        // ── Load user data ──
        var storageKey = userStorageKey(userId);
        var savedData = db._get(storageKey);
        if (!savedData) {
            log.warn('HANDLER', 'summon/readWishList — user data not found: ' + storageKey);
            console.groupEnd();
            callback({ _error: 'user_not_found' }, 1);
            return;
        }

        ensureSummonData(savedData, userId);

        // ── Mirror client: WishVersion = getWishMaxVersion() ──
        //  (persis closeBtnTap/confirmBtnTap — red dot hilang permanen
        //   juga untuk sesi berikutnya via setSummon di enterGame)
        var newVersion = getWishMaxVersion();
        var oldVersion = Number(savedData.summon._wishVersion) || 0;
        var changed = oldVersion !== newVersion;

        if (changed) {
            savedData.summon._wishVersion = newVersion;
            db._set(storageKey, savedData);
            log.info('WISHLIST', 'userId=' + userId + ' wishVersion ' + oldVersion + ' → ' + newVersion + ' (read marker saved)');
        } else {
            log.info('WISHLIST', 'userId=' + userId + ' wishVersion already ' + newVersion + ' — no change');
        }

        console.log('   ✅ wishVersion=' + newVersion + ' (was ' + oldVersion + ')' +
            ' wishList.length=' + ((savedData.summon._wishList || []).length));

        var response = {
            _wishVersion: newVersion,
            wishList: savedData.summon._wishList || []
        };

        log.info('HANDLER', 'summon/readWishList — SUCCESS');
        log.details('response', [
            ['_wishVersion', String(newVersion)],
            ['wishList.length', String((response.wishList || []).length)],
            ['changed', changed ? 'yes' : 'no']
        ]);

        console.table([
            { Field: '_wishVersion', Value: newVersion, Note: 'roster read marker' },
            { Field: 'oldVersion', Value: oldVersion, Note: 'previous value' },
            { Field: 'ret', Value: 0, Note: 'success' }
        ]);
        console.log('   ⏱️ ' + (Date.now() - _t0) + 'ms');
        console.groupEnd();

        callback(response);
    }

    // ═══════════════════════════════════════════════════════════
    //  REGISTER HANDLER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('summon', 'readWishList', handleReadWishList);

    window.MainServer = MainServer;

})();
