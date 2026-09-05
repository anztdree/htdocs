/**
 * handlers/heroImage/readHeroVersion.js — Mark Hero Book Version as Read
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * HANDLER: heroImage/readHeroVersion
 * ============================================================
 *
 * Client call (main.min.js L121860-121867):
 *   if (UserInfoSingleton.heroImageVersion < myData.heroBookVersion)
 *     ts.processHandler({
 *       type: "heroImage",
 *       action: "readHeroVersion",
 *       userId: n,
 *       version: "1.0"
 *     }, function(t) {
 *       UserInfoSingleton.heroImageVersion = myData.heroBookVersion;
 *       e.judgeRed()  // update red dot
 *     })
 *
 * Dipanggil saat:
 *   Player buka tab Hero Handbook, dan heroImageVersion < heroBookVersion.
 *   Artinya ada hero baru di buku yang belum dilihat → dismiss red dot.
 *   Callback TIDAK baca response — hanya butuh ret:0 supaya callback jalan.
 *
 * Response: callback({}) — cukup kosong, client ignore response data.
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;

    if (!MainServer.handlers.heroImage) {
        MainServer.handlers.heroImage = {};
    }

    function handleReadHeroVersion(request, callback) {

        var _logT0 = Date.now();

        // ═══════════════════════════════════════════════════════════
        //  HEADER
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c🖼️ HEROIMAGE readHeroVersion', 'color:#00796B;font-weight:bold;font-size:11px;background:#E0F2F1;padding:3px 8px;border-radius:4px;border-left:3px solid #00796B;');
        console.log('   📦 version: ' + (request.version || '-'));

        log.info('HANDLER', 'heroImage/readHeroVersion processing');

        // ═══════════════════════════════════════════════════════════
        //  ✅ VALIDATION
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var _validationChecks = [
            { check: 'userId', result: request.userId ? '✅ OK' : '⚠️ MISSING' },
            { check: 'version', result: request.version ? '✅ OK' : '⚠️ DEFAULT' }
        ];
        console.table(_validationChecks);
        console.groupEnd();

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        var _elapsed = Date.now() - _logT0;
        console.log('   ⏱️  Elapsed: ' + _elapsed + 'ms');
        console.log('   📤 Response: {} (empty — client ignores data)');
        console.groupEnd();

        console.groupEnd(); // close main header

        callback({});
    }

    MainServer.registerHandler('heroImage', 'readHeroVersion', handleReadHeroVersion);

    window.MainServer = MainServer;
})();