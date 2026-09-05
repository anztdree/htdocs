/**
 * handlers/trial/getState.js — Temple Trial GetState Handler
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * HANDLER: trial/getState
 * ============================================================
 *
 * Client call (main.min.js L56271-56286):
 *   OpenLimit.checkTempleLimit() → cek level >= 23 (open.json #25)
 *   ts.processHandler({
 *     type: 'trial',
 *     action: 'getState',
 *     userId: UserInfoSingleton.getInstance().userId,
 *     version: '1.0'
 *   }, callback(response))
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    if (!MainServer.handlers.trial) {
        MainServer.handlers.trial = {};
    }

    // ═════════════════════════════════════════════════════════════
    //  RESOURCE CACHE & CONFIG LOADER
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
        } catch (e) {
            log.warn('RESOURCE', 'Failed to load: ' + name + '.json — ' + e.message);
        }
        return null;
    }

    function getConstant(key) {
        var c = loadJsonSync('constant');
        return c ? c[key] : null;
    }

    // ═══════════════════════════════════════════════════════════
    //  UTC+8 (CST) DATE HELPERS
    // ═════════════════════════════════════════════════════════

    function getCSTNow() {
        var now = new Date();
        return new Date(now.getTime() + (8 * 60 * 60 * 1000) + now.getTimezoneOffset() * 60 * 1000);
    }

    function getTodayStrCST() {
        var d = getCSTNow();
        var yyyy = d.getUTCFullYear();
        var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        var dd = String(d.getUTCDate()).padStart(2, '0');
        return yyyy + '-' + mm + '-' + dd;
    }

    // ═══════════════════════════════════════════════════════════
    //  TRIAL STATE INIT
    // ═════════════════════════════════════════════════════════

    function buildDefaultTrialState(userId) {
        var nowMs = Date.now();
        var today = getTodayStrCST();
        var maxTimes = Number(getConstant('templeTestTimes')) || 10;

        return {
            _id: userId,
            _haveTimes: maxTimes,
            _timesStartRecover: nowMs,
            _lastLess: 0,
            _lastTime: 0,
            _buyFund: false,
            _haveGotFundReward: {},
            _buyCount: 0,
            _dailyDate: today,
            _yesterdayFloor: 0,
            _dailyRewardClaimed: false
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  DAILY RESET
    // ═════════════════════════════════════════════════════════

    function checkDailyReset(ts) {
        var today = getTodayStrCST();
        if (ts._dailyDate === today) {
            return false;
        }

        log.info('TRIAL_STATE', 'Daily reset detected (was ' + (ts._dailyDate || 'none') + ', now ' + today + ')');

        ts._yesterdayFloor = ts._lastLess || 0;

        var maxTimes = Number(getConstant('templeTestTimes')) || 10;
        ts._haveTimes = maxTimes;
        ts._timesStartRecover = Date.now();

        ts._buyCount = 0;

        // Reset daily reward claimed flag
        ts._dailyRewardClaimed = false;

        // Update date
        ts._dailyDate = today;

        log.details('daily_reset', [
            ['yesterdayFloor', String(ts._yesterdayFloor)],
            ['newHaveTimes', String(ts._haveTimes)],
            ['newDailyDate', ts._dailyDate]
        ]);

        return true;
    }

    // ═══════════════════════════════════════════════════════════
    //  TIME RECOVERY COMPUTATION
    // ═════════════════════════════════════════════════════════

    function computeTimeRecovery(ts) {
        var maxTimes = Number(getConstant('templeTestTimes')) || 10;
        var refreshSeconds = Number(getConstant('templeTestTimesRefresh')) || 1800;
        var refreshMs = refreshSeconds * 1000;

        if (ts._haveTimes >= maxTimes) {
            if (!ts._timesStartRecover || ts._timesStartRecover <= 0) {
                ts._timesStartRecover = Date.now();
            }
            return;
        }

        var nowMs = Date.now();
        var startRecover = ts._timesStartRecover || nowMs;

        if (startRecover > nowMs) {
            ts._timesStartRecover = nowMs;
            return;
        }

        var elapsedMs = Math.max(0, nowMs - startRecover);
        var recoveredTimes = Math.floor(elapsedMs / refreshMs);

        if (recoveredTimes <= 0) {
            return;
        }

        var oldHaveTimes = ts._haveTimes;
        var newHaveTimes = Math.min(oldHaveTimes + recoveredTimes, maxTimes);
        var actualRecovered = newHaveTimes - oldHaveTimes;

        ts._timesStartRecover = startRecover + (actualRecovered * refreshMs * 1000);
        ts._haveTimes = newHaveTimes;

        log.details('recovery', [
            ['oldHaveTimes', String(oldHaveTimes)],
            ['recovered', String(actualRecovered)],
            ['newHaveTimes', String(newHaveTimes)],
            ['maxTimes', String(maxTimes)]
        ]);
    }

    // ═══════════════════════════════════════════════════════════
    //  HANDLER: trial/getState
    // ═══════════════════════════════════════════════════════════

    /**
     * handleGetState(request, callback)
     */
    function handleGetState(request, callback) {

        var _logT0 = Date.now();
        
        console.groupCollapsed('%c🏛️ TRIAL getState', 'color:#6A1B9A;font-weight:bold;font-size:12px;background:#F3E5F5;padding:4px 8px;border-radius:6px;border-left:4px solid #6A1B9A;');
        var userId = request.userId;

        log.info('HANDLER', 'trial/getState processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['version', request.version || '-']
        ]);

        // ═══ VALIDATION ═══
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');

        if (!userId) {
            console.warn('   ❌ Missing userId');
            console.groupEnd(); // close Validation
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (missing userId)');
            console.groupEnd();
            console.groupEnd(); // close TRIAL group
            
            log.warn('HANDLER', 'trial/getState — missing userId');
            callback({});
            return;
        }
        console.log('   ✅ userId present: ' + userId);
        console.groupEnd(); // close Validation

        try {
        // ═══ TRIAL STATE PROCESSING ═══
        console.groupCollapsed('%c🏛️ Trial State Processing', 'color:#0277BD;font-weight:bold;');

        // ── STEP 2: Read savedData from DB ──
        var storageKey = 'user:' + userId;
        var savedData = db._get(storageKey);

        if (!savedData) {
            console.warn('   ❌ No savedData for userId=' + userId);
            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | ret=0 (no user data - returning defaults)');
            console.groupEnd();
            console.groupEnd(); // close TRIAL group
            
            log.warn('HANDLER', 'trial/getState — No savedData for userId=' + userId);
            callback({});
            return;
        }
        console.log('   ✅ User data loaded');

        // ── STEP 3: Ensure trialState exists (new user init) ──
        if (!savedData.trialState) {
            log.info('TRIAL_STATE', 'Initializing trialState for new user: ' + userId);
            savedData.trialState = buildDefaultTrialState(userId);
        }

        var ts = savedData.trialState;

        // ── STEP 4: Daily reset check (UTC+8) ──
        var didReset = checkDailyReset(ts);

        // ── STEP 5: Compute real-time recovery ──
        computeTimeRecovery(ts);

        // ── STEP 6: Save to DB ──
        db._set(storageKey, savedData);

        // ── STEP 7: Build response ──
        var response = {
            _model: {
                _id: ts._id || userId,
                _haveTimes: ts._haveTimes,
                _timesStartRecover: ts._timesStartRecover || 0,
                _lastLess: ts._lastLess || 0,
                _lastTime: ts._lastTime || 0,
                _buyFund: !!ts._buyFund,
                _haveGotFundReward: ts._haveGotFundReward || {}
            }
        };

        log.info('HANDLER', 'trial/getState success');
        log.details('state', [
            ['userId', userId],
            ['haveTimes', String(response._model._haveTimes)],
            ['lastLess', String(response._model._lastLess)],
            ['buyFund', String(response._model._buyFund)],
            ['dailyReset', didReset ? 'YES' : 'no']
        ]);

        console.groupEnd(); // close Trial State Processing
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        var _elapsed = Date.now() - _logT0;
        console.log('   ⏱️ ' + _elapsed + 'ms | haveTimes=' + response._model._haveTimes + ' lastLess=' + response._model._lastLess);
        console.table({
            'Trial': { haveTimes: response._model._haveTimes, lastLess: response._model._lastLess, buyFund: response._model._buyFund, dailyReset: didReset },
            'Recovery': { startRecover: response._model._timesStartRecover }
        });
        console.groupEnd();
        console.groupEnd(); // close TRIAL group

        callback(response);

    } catch (err) {
        console.error('   ❌ UNCAUGHT ERROR: ' + err.message);
        console.groupEnd(); // close any open groups
        console.groupEnd(); // close TRIAL group
        
        log.error('HANDLER', 'trial/getState UNCAUGHT ERROR', err);
        callback({});
    }
    }

    // ═══════════════════════════════════════════════════════════
    //  REGISTER HANDLER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('trial', 'getState', handleGetState);

    window.MainServer = MainServer;
})();
