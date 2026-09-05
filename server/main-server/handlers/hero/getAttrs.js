/**
 * handlers/hero/getAttrs.js — Hero FULL Attribute Computation Handler
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * MIGRATED to use MainServer.heroStats (heroStats.js)
 * ============================================================
 * All stat computation logic moved to heroStats.js.
 * This file now only handles: request parsing, multi-hero loop, response formatting.
 *
 * Client call (main.min.js L84786-84795):
 *   ts.processHandler({
 *     type: 'hero', action: 'getAttrs', userId, heros: [heroId1, ...], version: '1.0'
 *   }, callback(response))
 *
 * Response format (VERIFIED from HAR):
 *   {
 *     type: 'hero', action: 'getAttrs', userId, heros, version: '1.0',
 *     _attrs:      [ { _items: { "0":{_id:0,_num:val}, ... } } ],  ← ARRAY
 *     _baseAttrs:  [ { _items: { "0":{_id:0,_num:val}, ... } } ]   ← ARRAY
 *   }
 *
 * _baseAttr: 35 items — IDs 0-15, 23-41 (NO 16-22)
 *   Raw base stats WITHOUT talent multiplication.
 *   Client applies talent on hp/attack in setBaseAttr.
 *
 * _totalAttr: 42 items — IDs 0-41 (complete)
 *   Display stats WITH talent + percent + power.
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    if (!MainServer.handlers.hero) {
        MainServer.handlers.hero = {};
    }

    // ═══════════════════════════════════════════════════════════
    //  HANDLER: hero/getAttrs
    // ═══════════════════════════════════════════════════════════

    function handleGetAttrs(request, callback) {

        // ═══════════════════════════════════════════════════════════
        //  🦸 HERO ATTRIBUTES — processHandler getAttrs
        //  Client: ts.processHandler({type:'hero',action:'getAttrs', ...}, cb)
        //  Flow: validate → load data → compute stats → callback
        // ═══════════════════════════════════════════════════════════
        var _haT0 = Date.now();
        
        console.log('   🦸 heroCount: ' + ((request.heros && Array.isArray(request.heros)) ? request.heros.length : 0));
        var userId = request.userId;
        var heroIds = request.heros;

        // ── VALIDATION GROUP ──
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var _valChecks = [];
        
        if (!userId) {
            _valChecks.push({ '#': 1, Check: 'userId', Status: '❌ MISSING' });
            console.warn('   ⚠ ShowErrorTips(1) — missing userId');
        } else {
            _valChecks.push({ '#': 1, Check: 'userId', Status: '✅ OK' });
        }
        
        if (!heroIds || !Array.isArray(heroIds) || heroIds.length === 0) {
            _valChecks.push({ '#': 2, Check: 'heros array', Status: '❌ EMPTY/INVALID' });
        } else {
            _valChecks.push({ '#': 2, Check: 'heros array', Status: '✅ ' + heroIds.length + ' heroes' });
        }
        
        console.table(_valChecks);
        console.groupEnd();

        if (!userId || !heroIds || !Array.isArray(heroIds) || heroIds.length === 0) {
            var _earlyElapsed = Date.now() - _haT0;
            console.log('%c📤 Response (Early Reject)', 'color:#C62828;font-weight:bold;', '| ⏱️ ' + _earlyElapsed + 'ms');
            log.warn('HANDLER', 'hero/getAttrs — missing userId or heros array');
            callback({
                type: 'hero', action: 'getAttrs', userId: userId, heros: heroIds, version: '1.0',
                _attrs: [], _baseAttrs: []
            });
            return;
        }

        // ── DATA LOAD GROUP ──
        console.groupCollapsed('%c📦 Data Load', 'color:#0277BD;font-weight:bold;');
        
        var savedData = db._get('user:' + userId);
        var _loadSteps = [];
        
        if (!savedData) {
            _loadSteps.push({ '#': 1, Step: 'db._get(user:' + userId + ')', Status: '❌ NOT FOUND' });
            console.warn('   ⚠ User data not found — returning empty attrs');
            console.table(_loadSteps);
            console.groupEnd();
            
            log.warn('HANDLER', 'hero/getAttrs — user data not found');
            callback({
                type: 'hero', action: 'getAttrs', userId: userId, heros: heroIds, version: '1.0',
                _attrs: [], _baseAttrs: []
            });
            return;
        }
        
        _loadSteps.push({ '#': 1, Step: 'db._get(user:' + userId + ')', Status: '✅ LOADED' });
        
        // Check heroStats engine
        var heroStats = MainServer.heroStats;
        if (!heroStats) {
            _loadSteps.push({ '#': 2, Step: 'MainServer.heroStats', Status: '❌ NOT LOADED' });
            console.table(_loadSteps);
            console.groupEnd();
            
            log.error('HANDLER', 'hero/getAttrs — heroStats module not loaded!');
            callback({
                type: 'hero', action: 'getAttrs', userId: userId, heros: heroIds, version: '1.0',
                _attrs: [], _baseAttrs: []
            });
            return;
        }
        _loadSteps.push({ '#': 2, Step: 'MainServer.heroStats', Status: '✅ READY' });
        
        console.table(_loadSteps);
        console.groupEnd();

        // ── COMPUTE STATS GROUP ──
        console.groupCollapsed('%c⚡ Compute Stats', 'color:#7B1FA2;font-weight:bold;');
        
        var _statResults = [];
        var result = heroStats.computeMultiHeroStats(heroIds, savedData);
        _statResults.push({ '#': 1, Action: 'computeMultiHeroStats', Heroes: heroIds.length, Status: '✅' });
        
        // Per-hero detail logging
        if (result && result.attrs) {
            for (var i = 0; i < Math.min(heroIds.length, 10); i++) {  // Max 10 to avoid spam
                var hId = heroIds[i];
                var attrArr = result.attrs[i];
                _statResults.push({ 
                    '#': (i + 2), 
                    Action: 'hero[' + hId + ']', 
                    Attrs: (attrArr && attrArr._items) ? Object.keys(attrArr._items).length : 0,
                    Status: '✅' 
                });
            }
            if (heroIds.length > 10) {
                _statResults.push({ '#': '-', Action: '... (' + (heroIds.length - 10) + ' more)', Status: '⏭️' });
            }
        }
        
        console.table(_statResults);
        console.groupEnd();

        // ── RESPONSE BUILD ──
        var _finalElapsed = Date.now() - _haT0;
        console.log('%c📤 Response Build', 'color:#1565C0;font-weight:bold;', '| ⏱️ ' + _finalElapsed + 'ms | Heroes: ' + heroIds.length);
        console.log('');
        console.log('%c┌─ Hero Attrs Summary ───────────────', 'color:#7B1FA2;');
        console.log('│ 📊 Total heroes processed: ' + heroIds.length);
        console.log('│ 📦 _attrs entries: ' + (result.attrs ? result.attrs.length : 0));
        console.log('│ 📦 _baseAttrs entries: ' + (result.baseAttrs ? result.baseAttrs.length : 0));
        console.log('%c└───────────────────────────────────', 'color:#7B1FA2;');

        log.info('HANDLER', 'hero/getAttrs success — processed ' + heroIds.length + ' heroes in ' + _finalElapsed + 'ms');

        callback({
            type: 'hero',
            action: 'getAttrs',
            userId: userId,
            heros: heroIds,
            version: '1.0',
            _attrs: result.attrs,
            _baseAttrs: result.baseAttrs
        });

    }

    // ═══════════════════════════════════════════════════════════
    //  REGISTER HANDLER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('hero', 'getAttrs', handleGetAttrs);

    window.MainServer = MainServer;
})();
