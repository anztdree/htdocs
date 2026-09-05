/**
 * handlers/heroImage/getComments.js — Hero Appraisal Comments Handler
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * HANDLER: heroImage/getComments
 * ============================================================
 *
 * Client call (main.min.js L56414-56428 & L127247-127261):
 *   ts.processHandler({
 *     type: "heroImage",
 *     action: "getComments",
 *     userId: t,
 *     heroDisplayId: e,          // hero display ID
 *     start: 0,                   // pagination offset
 *     needCount: 10,              // HeroAppraiseNeedCount
 *     version: "1.0"
 *   }, callback)
 *
 * Dipanggil saat:
 *   1. L56411: openHeroAppraiseMain(heroDisplayId) — buka halaman appraisal hero
 *   2. L127247: Scroll load more comments (pagination)
 *
 * Response callback (main.min.js):
 *   L86089-86095 — setHeroCommentModel(t):
 *     for (var n = 0; n < e._comments.length; n++) {
 *       var o = new HeroCommentModel;
 *       o.deserialize(e._comments[n]);
 *       t.heroCommentModelList.push(o);
 *     }
 *
 *   L127256-127260 — pagination:
 *     for (var o = 0; o < e._comments.length; o++) { ... deserialize }
 *     t.startCount = e._end;
 *
 *   L56425 — avgScore:
 *     ts.openWindow("HeroAppraiseMain", { avgScore: t._avgScore, heroDisplayId, end: n })
 *
 * HeroCommentModel (L85000-85015):
 *   { id, detail, score, time, likeUsers: [{userId,...}], userId, nickName,
 *     headImage, level, serverId }
 *   deserialize: strips underscore prefix, likeUsers = array of user IDs
 *
 * ============================================================
 * PRIVATE SERVER
 * ============================================================
 *
 * Sistem komentar/appraisal hero tidak memiliki real database.
 * Return komentar kosong + avgScore 0.
 * _end = start + needCount agar pagination berhenti (tidak loop infinite).
 *
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;

    if (!MainServer.handlers.heroImage) {
        MainServer.handlers.heroImage = {};
    }

    function handleGetComments(request, callback) {

        var _logT0 = Date.now();

        // ═══════════════════════════════════════════════════════════
        //  HEADER
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c🖼️ HEROIMAGE getComments', 'color:#00796B;font-weight:bold;font-size:11px;background:#E0F2F1;padding:3px 8px;border-radius:4px;border-left:3px solid #00796B;');
        console.log('   📦 version: ' + (request.version || '-'));

        var userId = request.userId;
        var heroDisplayId = request.heroDisplayId;
        var start = Number(request.start) || 0;
        var needCount = Number(request.needCount) || 10;

        log.info('HANDLER', 'heroImage/getComments processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['heroDisplayId', String(heroDisplayId || '-')],
            ['start', String(start)],
            ['needCount', String(needCount)]
        ]);

        // ═══════════════════════════════════════════════════════════
        //  ✅ VALIDATION
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var _validationChecks = [
            { check: 'userId', result: userId ? '✅ OK' : '⚠️ MISSING' },
            { check: 'heroDisplayId', result: heroDisplayId ? '✅ OK (' + heroDisplayId + ')' : '⚠️ MISSING' },
            { check: 'start', result: '✅ ' + start },
            { check: 'needCount', result: '✅ ' + needCount }
        ];
        console.table(_validationChecks);
        console.groupEnd();

        // ═══════════════════════════════════════════════════════════
        //  🔧 PROCESSING — Build empty comments (private server)
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c🔧 Processing', 'color:#0277BD;font-weight:bold;');
        console.log('   📭 Private server: no real comment DB → returning empty array');

        // Private server: no real comments. Return empty array.
        var response = {
            _comments: [],
            _avgScore: 0,
            _end: start + needCount
        };

        log.arrow('Returning empty comments (private server, no comment DB)');
        console.log('   📤 _comments.length: 0');
        console.log('   📊 _avgScore: 0');
        console.log('   📄 _end (pagination): ' + response._end);
        console.groupEnd();

        // ═══════════════════════════════════════════════════════════
        //  📤 RESPONSE BUILD & AUDIT
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        var _elapsed = Date.now() - _logT0;
        console.log('   ⏱️  Elapsed: ' + _elapsed + 'ms');
        console.log('   📤 Response keys: _comments, _avgScore, _end');
        console.groupEnd();

        console.groupEnd(); // close main header

        callback(response);
    }

    MainServer.registerHandler('heroImage', 'getComments', handleGetComments);

    window.MainServer = MainServer;
})();