/**
 * handlers/guide/saveGuide.js — Guide Checkpoint Save
 * Super Warrior Z — MAIN SERVER
 *
 * Client (main.min.js sendGuideSted — satu-satunya call site):
 *   sendGuideSted(guideId)
 *   → o = tutorial.json[guideId]
 *   → if (!o) return Logger.serverDebugLog("没有该新手引导ID："+e)  ← guard config
 *   → setGuideStep(o.tutorialLine, guideId)                      // lokal dulu
 *   → if (o.isSave) processHandler({                            // hanya isSave=1
 *       type:'guide', action:'saveGuide', userId,
 *       guideType:o.tutorialLine, step:guideId, version:'1.0'
 *     }, 成功Cb, 失败Cb)  — 3 argumen (tanpa param-4)
 *     → ret!=0 → ErrorHandler.ShowErrorTips(e.ret, l)  ← MODAL POPUP AKTIF
 *       (arg-4 `o` kosong; l = function(){ n&&n(e), ret==38 → reload })
 *
 * Response: client TIDAK baca data (callback 成功 hanya log).
 * Real server echo back: type, action, userId, guideType, step, version.
 *
 * ============================================================
 * VALIDASI = MIRROR CLIENT GUARD (sumber: tutorial.json, BUKAN hardcoded):
 * ============================================================
 *   1. guideType valid ⟺ ADA entry tutorial.json dgn tutorialLine == guideType
 *      (guideType selalu = o.tutorialLine dari config — tidak pernah di-rekayasa)
 *   2. step valid ⟺ tutorial.json[step] ADA — mirror client guard
 *      "没有该新手引导ID：" (client menolak mengirim id yang tak ada di config;
 *      server menolak menyimpannya — melindungi _steps dari nilai sampah yang
 *      membuat enterNextGuide crash: a = n[o] undefined → a.nextID throw)
 *   3. Config gagal load → TOLAK semua (fail-closed, konsisten dgn client:
 *      tanpa config client juga tidak akan pernah mengirim)
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    if (!MainServer.handlers.guide) {
        MainServer.handlers.guide = {};
    }

    // ═══════════════════════════════════════════════════════════
    //  CONFIG LOADER (sync, cached) — sumber kebenaran: tutorial.json
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
            log.error('RESOURCE', 'saveGuide failed to load: ' + name + '.json — HTTP ' + xhr.status);
        } catch (e) {
            log.error('RESOURCE', 'saveGuide failed to load: ' + name + '.json — ' + e.message);
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  GUIDE CONFIG INDEX (mirror client ReadJsonSingleton.tutorial)
    //  _lineSet : tutorialLine yang ADA di config  → validasi guideType
    //  _idSet   : guideId yang ADA di config       → validasi step
    //  Dibangun sekali dari tutorial.json ASLI — tanpa hardcoded list.
    // ═══════════════════════════════════════════════════════════

    var _lineSet = null;
    var _idSet = null;

    function ensureGuideConfig() {
        if (_lineSet !== null) return true;
        var tut = loadJsonSync('tutorial');
        if (!tut) {
            log.error('GUIDE', 'tutorial.json tidak tersedia — validasi fail-closed (mirror client guard)');
            return false;
        }
        _lineSet = {};
        _idSet = {};
        var lineCount = 0;
        for (var k in tut) {
            var entry = tut[k];
            if (!entry) continue;
            if (entry.tutorialLine !== undefined) {
                _lineSet[String(Number(entry.tutorialLine))] = true;
            }
            if (entry.id !== undefined) {
                _idSet[String(Number(entry.id))] = true;
                lineCount++;
            }
        }
        log.details('GUIDE', [
            ['tutorial.json entries', String(lineCount)],
            ['unique tutorialLine', String(Object.keys(_lineSet).length)]
        ]);
        return true;
    }

    // guideType valid ⟺ tutorialLine ADA di tutorial.json (mirror: guideType = o.tutorialLine)
    function isValidGuideType(v) {
        if (!ensureGuideConfig()) return false;
        var n = Number(v);
        return isFinite(n) && _lineSet[String(n)] === true;
    }

    // step valid ⟺ guideId ADA di tutorial.json (mirror client guard "没有该新手引导ID：")
    function guideIdExists(v) {
        if (!ensureGuideConfig()) return false;
        var n = Number(v);
        return isFinite(n) && _idSet[String(n)] === true;
    }

    // ═══════════════════════════════════════════════════════════
    //  HANDLER
    // ═══════════════════════════════════════════════════════════

    function handleSaveGuide(request, callback) {

        var _logT0 = Date.now();
        
        console.groupCollapsed('%c📖 GUIDE saveGuide', 'color:#00695C;font-weight:bold;font-size:12px;background:#E0F2F1;padding:4px 8px;border-radius:6px;border-left:4px solid #00695C;');
        var userId = request.userId;
        var guideType = request.guideType;
        var step = request.step;

        log.info('HANDLER', 'guide/saveGuide');
        log.details('req', [
            ['userId', userId || '-'],
            ['guideType', String(guideType != null ? guideType : '-')],
            ['step', String(step != null ? step : '-')]
        ]);

        // ═══ VALIDATION ═══
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');

        // ── Validate ──
        if (!userId) {
            console.warn('   ❌ Missing userId');
            console.groupEnd(); // close Validation
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (missing userId)');
            console.groupEnd();
            console.groupEnd(); // close GUIDE group
            
            log.warn('HANDLER', 'saveGuide — missing userId');
            callback({ _error: 'missing_userId' }, 1);
            return;
        }
        console.log('   ✅ userId present: ' + userId);

        if (guideType == null || !isValidGuideType(guideType)) {
            console.warn('   ❌ Invalid guideType: ' + guideType);
            console.groupEnd(); // close Validation
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (invalid guideType)');
            console.groupEnd();
            console.groupEnd(); // close GUIDE group
            
            log.warn('HANDLER', 'saveGuide — invalid guideType: ' + guideType);
            callback({ _error: 'invalid_guideType' }, 1);
            return;
        }
        console.log('   ✅ guideType valid: ' + guideType);

        // ── Mirror client guard: step HARUS guideId yang ada di tutorial.json ──
        // client: o = tutorial[e]; if (!o) return log("没有该新手引导ID") — tidak kirim.
        // Server menolak nilai sampah → _steps tetap bersih → enterNextGuide
        // resume tidak akan crash (a.nextID di entry undefined).
        if (!guideIdExists(step)) {
            console.warn('   ❌ step bukan guideId yang ada di tutorial.json: ' + step);
            console.groupEnd(); // close Validation
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (step not in tutorial.json)');
            console.groupEnd();
            console.groupEnd(); // close GUIDE group

            log.warn('HANDLER', 'saveGuide — step not in tutorial.json: ' + step);
            callback({ _error: 'invalid_step' }, 1);
            return;
        }
        console.log('   ✅ step valid (guideId ada di config): ' + step);
        console.groupEnd(); // close Validation

        // ═══ GUIDE PROCESSING ═══
        console.groupCollapsed('%c📖 Guide Processing', 'color:#0277BD;font-weight:bold;');

        // ── Read user data ──
        var storageKey = 'user:' + userId;
        var savedData = db._get(storageKey);

        if (!savedData) {
            console.warn('   ❌ User data not found: ' + storageKey);
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (user not found)');
            console.groupEnd();
            console.groupEnd(); // close GUIDE group
            
            // User data MUST exist (enterGame runs first).
            // ret!=0 → ErrorHandler.ShowErrorTips → modal popup → blocks guide flow.
            log.error('HANDLER', 'saveGuide — user data not found: ' + storageKey + ' (enterGame should have created it)');
            callback({ _error: 'user_not_found' }, 1);
            return;
        }
        console.log('   ✅ User data loaded');

        // ── Update guide checkpoint ──
        if (!savedData.guide) {
            savedData.guide = { _id: String(userId), _steps: {} };
        } else {
            if (!savedData.guide._id) savedData.guide._id = String(userId);
            if (!savedData.guide._steps) savedData.guide._steps = {};
        }

        var guideTypeKey = String(guideType);
        var oldStep = savedData.guide._steps[guideTypeKey];
        savedData.guide._steps[guideTypeKey] = Number(step);

        // ── SHOW-ONCE LEDGER (_done) — REQUEST user 2026-09-04 ──
        // "guide step sudah di kerjakan harusnya tidak MUNCUL lagi setelah
        //  re-login dan di anggap selesai" (laporan: line 21 HEROWAKEUP
        //  muncul ulang setelah relogin meski 21104+21105 sudah tersimpan).
        //
        //  Akar: _steps bisa hilang antar-sesi (tulis IndexedDB async tercapak
        //  reload cepat / tab lama menimpa doc dengan salinan stale) — tanpa
        //  _steps, client fallback getGuideStartIDByLine(21)=21101 →
        //  getNextGuide(): 21101 < tutorialEnd(21)=21105 → openGuide(21101)
        //  → guide muncul ULANG. Ledger = ketahanan server: catat max step
        //  per line; enterGame memakainya utk mengembalikan line yang hilang.
        //
        //  PATEN main.min.js: setGuideInfo() client HANYA membaca _id &
        //  _steps — field _done tidak pernah dibaca client (aman dikirim /
        //  tidak dikirim). enterNextGuide/getNextGuide tidak tersentuh.
        if (!savedData.guide._done || typeof savedData.guide._done !== 'object') {
            savedData.guide._done = {};
        }
        var _ledgerPrev = Number(savedData.guide._done[guideTypeKey]) || 0;
        var _ledgerNow = Number(step);
        if (_ledgerNow > _ledgerPrev) savedData.guide._done[guideTypeKey] = _ledgerNow;

        console.log('   ✅ Guide updated: type=' + guideType + ' step=' + step + (oldStep ? ' (was ' + oldStep + ')' : '') +
            ' | ledger done[' + guideTypeKey + ']=' + savedData.guide._done[guideTypeKey]);

        // ── Persist ──
        db._set(storageKey, savedData);

        console.groupEnd(); // close Processing
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        var _elapsed = Date.now() - _logT0;
        console.log('   ⏱️ ' + _elapsed + 'ms | guideType=' + guideType + ' step=' + step);
        console.table({
            'Guide': { type: guideType, step: step, oldStep: oldStep || '(none)' }
        });
        console.groupEnd();
        console.groupEnd(); // close GUIDE group

        // ── Response: echo all request fields (sesuai real server) ──
        callback({
            type: request.type,
            action: request.action,
            userId: userId,
            guideType: Number(guideType),
            step: Number(step),
            version: request.version || '1.0'
        });
    }

    MainServer.registerHandler('guide', 'saveGuide', handleSaveGuide);
    window.MainServer = MainServer;
})();
