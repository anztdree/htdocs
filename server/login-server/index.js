/**
 * index.js — Login Server Entry Point
 * Super Warrior Z — LOGIN SERVER
 *
 * Titik masuk tunggal. Berisi:
 *   1. Logger (inline, self-contained)
 *   2. Config
 *   3. Action loader (actions/*.js)
 *   4. Router/Dispatcher
 *   5. LoginSocket class (verifyEnable=false)
 *   6. io.connect() override
 *   7. getLoginServer() override
 *
 * Semua infrastructure di sini. Actions di folder actions/.
 * TIDAK menyentuh file main-server.
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════
    // PRE-LOG (sebelum logger siap, pakai console.log biasa + CSS)
    // ═══════════════════════════════════════════════════════════════════
    function preLog(msg) {
        console.log('%c⏱️ [LOGIN-SERVER] ' + msg, 'background:#4CAF50;color:white;padding:2px 8px;border-radius:3px;');
    }

    function preError(msg) {
        console.log('%c❌ [LOGIN-SERVER] ' + msg, 'background:#F44336;color:white;padding:2px 8px;border-radius:3px;');
    }

    // ═══════════════════════════════════════════════════════════════════
    // AUTO-DETECT BASE PATH
    // ═══════════════════════════════════════════════════════════════════
    var basePath = (function () {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
            var src = scripts[i].src || '';
            if (src.indexOf('login-server/index.js') !== -1) {
                return src.replace('index.js', '');
            }
        }
        return './server/login-server/';
    })();



    // ═══════════════════════════════════════════════════════════════════
    // 1. LOGGER - TIMELINE FEED STYLE (TANPA BOX!)
    // Design: Flow-based, emoji bullet, nested dropdown, stylish
    // ═══════════════════════════════════════════════════════════════════
    var LoginServerLogger = (function () {
        var SERVER_TAG = 'LOGIN-SERVER';
        var LEVEL_KEY = 'LOGIN_SERVER_LOG_LEVEL';
        var PRIORITY = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 99 };

        // Server color theme - GREEN for Login Server
        var SERVER_COLOR = '#4CAF50';
        var ACCENT_1 = '#2E7D32';   // Dark green
        var ACCENT_2 = '#81C784';   // Light green
        var TEXT_PRIMARY = '#1B5E20';
        var TEXT_SECONDARY = '#37474F';
        var TEXT_MUTED = '#78909C';
        var DIVIDER_COLOR = '#B0BEC5';
        var SECTION_COLOR = '#00695C';

        // Current level
        var currentLevel = (function () {
            try { return localStorage.getItem(LEVEL_KEY) || 'DEBUG'; }
            catch (e) { return 'DEBUG'; }
        })();
        var minPriority = PRIORITY[currentLevel] !== undefined ? PRIORITY[currentLevel] : 0;

        function shouldLog(level) {
            var p = PRIORITY[level];
            return p !== undefined && p >= minPriority;
        }

        // Timestamp short format
        function ts() {
            var d = new Date();
            var h = String(d.getHours()).padStart(2, '0');
            var m = String(d.getMinutes()).padStart(2, '0');
            var s = String(d.getSeconds()).padStart(2, '0');
            return h + ':' + m + ':' + s;
        }

        // Timestamp full format (for debug)
        function tsFull() {
            var d = new Date();
            var h = String(d.getHours()).padStart(2, '0');
            var m = String(d.getMinutes()).padStart(2, '0');
            var s = String(d.getSeconds()).padStart(2, '0');
            var ms = String(d.getMilliseconds()).padStart(3, '0');
            return h + ':' + m + ':' + s + '.' + ms;
        }

        // ═══════════════════════════════════════════════════════════════
        // TIMELINE FEED FUNCTIONS
        // ═══════════════════════════════════════════════════════════════

        /**
         * tag(actionName) - Server tag line dengan Action Name
         * Output: ⚪ LOGIN-SERVER  💠 GetServerList
         * - Server badge: background HIJAU (#4CAF50)
         * - Action badge: background KUNING (#FFC107)
         */
        function tag(actionName) {
            if (!shouldLog('INFO')) return;
            var action = actionName || 'Unknown';
            console.log(
                '%c⚪ ' + SERVER_TAG + '  %c💠 ' + action,
                'background:' + SERVER_COLOR + ';color:#fff;padding:3px 12px;border-radius:12px;font-weight:bold;font-size:11px;',
                'background:#FFC107;color:#000;padding:3px 10px;border-radius:10px;font-weight:bold;font-size:11px;'
            );
        }

        /**
         * section(emoji, title, status) - Section header with progress bar
         * Output:
         *   ═══ 🔌 Socket #42 connected ═══
         */
        function section(emoji, title, status) {
            if (!shouldLog('INFO')) return;
            if (status) {
                console.log(
                    '%c═══ ' + emoji + ' ' + title + ' %c──────▸ ' + status,
                    'color:' + SECTION_COLOR + ';font-weight:bold;font-size:13px;',
                    'color:' + SERVER_COLOR + ';font-size:11px;'
                );
            } else {
                console.log(
                    '%c═══ ' + emoji + ' ' + title + ' ═══',
                    'color:' + SECTION_COLOR + ';font-weight:bold;font-size:13px;'
                );
            }
        }

        /**
         * row(emoji, label, value) - Single data row (flat, no expand)
         * Output: 🆔 label value
         */
        function row(emoji, label, value) {
            if (!shouldLog('DEBUG')) return;
            var em = emoji || '📌';
            var lbl = (label || '');
            console.log(
                '%c' + em + '%c ' + lbl + ': %c' + (value || ''),
                'font-size:12px;',
                'color:' + TEXT_SECONDARY + ';font-weight:600;',
                'color:' + TEXT_MUTED + ';'
            );
        }

        /**
         * rows(data[]) - Multiple data rows
         * data format: [[emoji, label, value], ...]
         */
        function rows(data) {
            if (!data || !data.length) return;
            for (var i = 0; i < data.length; i++) {
                var item = data[i];
                if (Array.isArray(item)) {
                    row(item[0] || '📌', item[1] || '', item.length > 2 ? item[2] : '');
                }
            }
        }

        /**
         * dropdown(emoji, title) - Dropdown list header (STATIS, tidak bisa expand)
         * Output: ▾ 🌐 Title
         */
        function dropdown(emoji, title) {
            if (!shouldLog('INFO')) return;
            console.log(
                '%c▾ ' + emoji + ' ' + (title || ''),
                'color:' + SECTION_COLOR + ';font-weight:bold;font-size:13px;'
            );
        }

        /**
         * dropdownSubItem(emoji, label, value, isLast) - Item dalam dropdown (nested)
         * Output: └─▸ or ├─▸ item
         */
        function dropdownSubItem(emoji, label, value, isLast) {
            if (!shouldLog('DEBUG')) return;
            var prefix = isLast ? '└─▸' : '├─▸';
            var em = emoji || '📌';
            // Label tanpa padding berlebihan - lebih mudah dibaca!
            var lbl = (label || '');
            // Value TIDAK dipotong - tampil full!
            var val = (value !== undefined && value !== null && value !== '') ? String(value) : '-';
            console.log(
                '%c   ' + prefix + ' %c' + em + ' %c' + lbl + ': %c' + val,
                'font-size:11px;color:#546E7A;',
                'font-size:11px;',
                'color:' + TEXT_SECONDARY + ';font-weight:600;',
                'color:#37474F;'
            );
        }

        /**
         * dropdownSection(emoji, title) - Sub-section dalam dropdown
         * Output: ├─────────────▸ 📋 Title
         */
        function dropdownSection(emoji, title) {
            if (!shouldLog('DEBUG')) return;
            console.log(
                '%c   ├──────── %c' + emoji + ' %c' + (title || '') + '%c ─────────────',
                'color:#78909C;font-size:11px;',
                'font-size:11px;',
                'color:' + SECTION_COLOR + ';font-weight:bold;font-size:11px;',
                'color:#78909C;font-size:11px;'
            );
        }

        /**
         * group(emoji, title, count) - Console Group (BISA EXPAND!)
         * Output: ▸ 👂 Title (n)
         */
        function group(emoji, title, count) {
            if (!shouldLog('INFO')) return;
            var countStr = count ? ' (' + count + ')' : '';
            console.groupCollapsed(
                '%c▸ ' + emoji + ' ' + (title || '') + countStr,
                'color:' + SECTION_COLOR + ';font-weight:bold;cursor:pointer;font-size:13px;'
            );
        }

        /**
         * groupEnd() - Tutup console group
         */
        function groupEnd() {
            if (!shouldLog('INFO')) return;
            console.groupEnd();
        }

        /**
         * divider() - Garis pemisah
         */
        function divider() {
            if (!shouldLog('DEBUG')) return;
            console.log(
                '%c   ─%c──────────────────────────────────────────',
                'color:#CFD8DC;',
                'color:#CFD8DC;'
            );
        }

        /**
         * space() - Spacing kosong
         */
        function space() {
            console.log('');
        }

        /**
         * success(msg), error(msg), warn(msg), info(msg) - Badge style
         */
        function success(msg) {
            if (!shouldLog('INFO')) return;
            console.log('%c  ✓ ' + (msg || ''), 'background:#E8F5E9;color:#2E7D32;padding:4px 14px;border-radius:15px;font-weight:500;font-size:12px;\n');
        }

        function errorBadge(msg) {
            if (!shouldLog('ERROR')) return;
            console.log('%c  ✗ ' + (msg || ''), 'background:#FFEBEE;color:#C62828;padding:4px 14px;border-radius:15px;font-weight:500;font-size:12px;\n');
        }

        function warnBadge(msg) {
            if (!shouldLog('WARN')) return;
            console.log('%c  ⚠ ' + (msg || ''), 'background:#FFF3E0;color:#EF6C00;padding:4px 14px;border-radius:15px;font-weight:500;font-size:12px;\n');
        }

        /**
         * bigValue(value) - Display large value (token, hash, etc)
         */
        function bigValue(value) {
            if (!shouldLog('DEBUG')) return;
            console.log(
                '%c' + (value || ''),
                'font-family:monospace;font-size:12px;color:' + SECTION_COLOR + ';padding:8px 20px;background:#E0F2F7;border-radius:8px;display:inline-block;'
            );
        }

        // ═══════════════════════════════════════════════════════════════
        // LEGACY COMPATIBILITY (map to new functions)
        // ═══════════════════════════════════════════════════════════════

        function header(action, status) {
            section('🎯', action, status);
        }

        function info(context, message) {
            if (!shouldLog('INFO')) return;
            row(getContextEmojiLegacy(context), context, ts() + ' ' + (message || ''));
        }

        function warn(context, message) {
            if (!shouldLog('WARN')) return;
            row('⚠️', context, ts() + ' ' + (message || ''));
        }

        function error(context, message) {
            if (!shouldLog('ERROR')) return;
            row('❌', context, ts() + ' ' + (message || ''));
        }

        function debug(context, message) {
            if (!shouldLog('DEBUG')) return;
            row('🔍', context, tsFull() + ' ' + (message || ''));
        }

        function detail(emoji, key, value) {
            row(emoji || '📌', key, String(value));
        }

        function openDetail(emoji, key, value) {
            row(emoji || '📌', key, String(value));
        }

        function details(pairs) {
            rows(pairs);
        }

        function table(title, data) {
            group('📋', title);
            console.table(data);
            groupEnd();
        }

        function alwaysDetails(pairs) {
            var savedMin = minPriority;
            minPriority = 0;
            rows(pairs);
            minPriority = savedMin;
        }

        function quickBox(title, items) {
            section('📦', title);
            rows(items);
        }

        // Legacy box functions → convert to section/rows
        function boxHeader(title) {
            section('📦', title);
        }

        function boxItem(emoji, label, value) {
            row(emoji, label, value);
        }

        function boxClose() {
            divider();
        }

        function getContextEmojiLegacy(context) {
            var ctx = (context || '').toLowerCase();
            var map = {
                'timer': '⏱️', 'connection': '🔌', 'connect': '🔌',
                'emit': '⚡', 'handler': '🎯', 'request': '📥',
                'response': '📤', 'storage': '💾', 'action': '⚙️',
                'startup': '🏗️', 'environment': '🌐', 'loader': '📦'
            };
            return map[ctx] || '⏱️';
        }

        // ═══════════════════════════════════════════════════════════════
        // setLevel
        // ═══════════════════════════════════════════════════════════════

        function setLevel(level) {
            var p = PRIORITY[level];
            if (p !== undefined) {
                currentLevel = level;
                minPriority = p;
                try { localStorage.setItem(LEVEL_KEY, level); } catch (e) {}
                console.log('%c[' + SERVER_TAG + '] Log level → ' + level, 'background:' + SERVER_COLOR + ';color:#fff;padding:2px 8px;border-radius:3px;');
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // Export - NEW FUNCTIONS + LEGACY SUPPORT
        // ═══════════════════════════════════════════════════════════════

        return {
            // NEW TIMELINE FEED FUNCTIONS
            tag: tag,
            section: section,
            row: row,
            rows: rows,
            dropdown: dropdown,
            dropdownSubItem: dropdownSubItem,
            dropdownSection: dropdownSection,
            group: group,
            groupEnd: groupEnd,
            divider: divider,
            space: space,
            success: success,
            errorBadge: errorBadge,
            warnBadge: warnBadge,
            bigValue: bigValue,
            
            // LEGACY FUNCTIONS (still work!)
            header: header,
            info: info,
            warn: warn,
            error: error,
            debug: debug,
            detail: detail,
            openDetail: openDetail,
            details: details,
            table: table,
            alwaysDetails: alwaysDetails,
            quickBox: quickBox,
            boxHeader: boxHeader,
            boxItem: boxItem,
            boxClose: boxClose,
            
            level: currentLevel,
            setLevel: setLevel,
            
            SERVER_BG: 'background:' + SERVER_COLOR + ';color:#fff;padding:2px 8px;border-radius:3px;',
            COLORS: {
                PRIMARY: TEXT_PRIMARY,
                SECONDARY: TEXT_SECONDARY,
                MUTED: TEXT_MUTED,
                ACCENT: SECTION_COLOR,
                SERVER: SERVER_COLOR,
                DIVIDER: DIVIDER_COLOR
            },
            SERVER_TAG: '[' + SERVER_TAG + ']'
        };
    })();

    window.LoginServerLogger = LoginServerLogger;

    // ═══════════════════════════════════════════════════════════════════
    // 2. CONFIG
    // ═══════════════════════════════════════════════════════════════════
    var log = LoginServerLogger;

    var LoginServer = {
        config: {
            loginServerUrl: 'http://127.0.0.1:8000',
            mainServerUrl: 'http://127.0.0.1:8001',
            chatServerUrl: 'http://127.0.0.1:8002',
            dungeonServerUrl: 'http://127.0.0.1:8003',
            delayMin:      30,
            delayMax:      120,
            loginTokenLength: 64,
            verifyEnable:  false
        },
        handlers: {},
        _handlerNames: [],
        _handlerCount: 0,
        log: log
    };

    // ═══════════════════════════════════════════════════════════════════
    // INDEXEDDB HELPER
    // ═══════════════════════════════════════════════════════════════════
    var DB_NAME = 'login-server';
    var DB_VERSION = 2;
    var STORE_NAME = 'loginInfo';
    var _idb = null;

    function openDB() {
        return new Promise(function (ok, fail) {
            if (_idb) { ok(_idb); return; }
            var r = indexedDB.open(DB_NAME, DB_VERSION);
            r.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
                }
            };
            r.onsuccess = function (e) {
                _idb = e.target.result;
                ok(_idb);
            };
            r.onerror = function (e) {
                log.error('STORAGE', 'IndexedDB open FAILED: ' + DB_NAME);
                fail(e);
            };
        });
    }

    function idbGet(key) {
        return openDB().then(function (db) {
            return new Promise(function (ok, fail) {
                var tx = db.transaction(STORE_NAME, 'readonly');
                var req = tx.objectStore(STORE_NAME).get(key);
                req.onsuccess = function () { ok(req.result || null); };
                req.onerror = function () { fail(req.error); };
            });
        });
    }

    function idbPut(data) {
        return openDB().then(function (db) {
            return new Promise(function (ok, fail) {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                var req = tx.objectStore(STORE_NAME).put(data);
                req.onsuccess = function () { ok(data); };
                req.onerror = function () { fail(req.error); };
            });
        });
    }

    function seedConfig() {
        var defaultConfig = {
            userId: '__config__',
            servers: [
                {
                    serverId: '1',
                    name: 'Local 1',
                    url: LoginServer.config.mainServerUrl,
                    chaturl: LoginServer.config.chatServerUrl,
                    dungeonurl: LoginServer.config.dungeonServerUrl,
                    online: true,
                    hot: false,
                    'new': true,
                    sortOrder: 1
                }
            ],
            notices: [
                {
                    title: { en: 'Welcome', cn: '欢迎' },
                    text: { en: 'Welcome to Super Warrior Z!', cn: '欢迎来到超级战士Z！' },
                    version: '1.0',
                    orderNo: 1,
                    alwaysPopup: false
                }
            ]
        };

        return idbGet('__config__').then(function (existing) {
            if (existing) {
                return existing;
            }
            return idbPut(defaultConfig).then(function () { return defaultConfig; });
        });
    }

    LoginServer.db = {
        open: openDB,
        get: idbGet,
        put: idbPut,
        seedConfig: seedConfig
    };

    // ═══════════════════════════════════════════════════════════════════
    // HELPERS (pure infra)
    // ═══════════════════════════════════════════════════════════════════

    LoginServer.randomDelay = function () {
        return Math.floor(Math.random() * (LoginServer.config.delayMax - LoginServer.config.delayMin + 1)) + LoginServer.config.delayMin;
    };

    LoginServer.generateToken = function (length) {
        var chars = 'abcdef0123456789';
        var token = '';
        var len = length || LoginServer.config.loginTokenLength;
        for (var i = 0; i < len; i++) {
            token += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return token;
    };

    LoginServer.nowSeconds = function () {
        return Math.floor(Date.now() / 1000);
    };

    LoginServer.buildEnvelope = function (responseData, retCode) {
        var ret = (typeof retCode === 'number' && retCode !== 0) ? retCode : 0;
        var dataStr;
        try {
            dataStr = JSON.stringify(responseData !== undefined && responseData !== null ? responseData : {});
        } catch (e) {
            dataStr = '{}';
        }

        return {
            ret: ret,
            data: dataStr,
            compress: false,
            serverTime: LoginServer.nowSeconds(),
            server0Time: Math.abs(new Date().getTimezoneOffset()) * 60 * 1000
        };
    };

    window.LoginServer = LoginServer;

    // ═══════════════════════════════════════════════════════════════════
    // 3. LOAD ACTIONS (actions/*.js)
    // ═══════════════════════════════════════════════════════════════════
    var actionFiles = [
        'actions/loginGame.js',
        'actions/getServerList.js',
        'actions/saveHistory.js',
        'actions/loginAnnounce.js',
        'actions/saveUserEnterInfo.js',
        'actions/saveLanguage.js'
    ];
    var loadedCount = 0;
    var loadStart = Date.now();
    var _criticalError = false;
    var loadResults = [];

    function loadNextAction() {
        if (_criticalError) return;

        if (loadedCount >= actionFiles.length) {
            var totalLoadTime = Date.now() - loadStart;
            var bootOk = loadResults.every(function (r) { return r.status.indexOf('OK') !== -1; });

            // Header KONSISTEN
            log.header('Initializing...', (bootOk ? '✅' : '❌') + ' Ready in ' + totalLoadTime + 'ms');

            // Box KONSISTEN - SATU BESAR BOX! Group DI DALAM!
            log.boxHeader('🚀 BOOT SUMMARY');
            log.boxItem('📊', 'Total actions', String(actionFiles.length));
            log.boxItem('⏱️', 'Load time', totalLoadTime + 'ms');
            log.boxItem('✅', 'Status', bootOk ? 'All OK' : 'Some failed');
            
            // Group DI DALAM box!
            console.groupCollapsed('  ▸ ⚙️ Full configuration & details');
            
            log.boxHeader('⚙️ SYSTEM CONFIG');
            var cfg = LoginServer.config;
            log.boxItem('🔗', 'loginServerUrl', cfg.loginServerUrl);
            log.boxItem('🔗', 'mainServerUrl', cfg.mainServerUrl);
            log.boxItem('🔗', 'chatServerUrl', cfg.chatServerUrl);
            log.boxItem('🔗', 'dungeonServerUrl', cfg.dungeonServerUrl);
            log.boxItem('⏱️', 'delayMin', cfg.delayMin + 'ms');
            log.boxItem('⏱️', 'delayMax', cfg.delayMax + 'ms');
            log.boxItem('🔑', 'loginTokenLength', String(cfg.loginTokenLength));
            log.boxItem('🔒', 'verifyEnable', String(cfg.verifyEnable));
            log.boxClose();

            console.table(loadResults);

            log.boxHeader('📋 REGISTERED HANDLERS');
            for (var hi = 0; hi < LoginServer._handlerNames.length; hi++) {
                log.boxItem('✅', '[' + hi + ']', LoginServer._handlerNames[hi]);
            }
            log.boxClose();

            log.boxHeader('💾 STORAGE INFO');
            log.boxItem('💾', 'Database', DB_NAME);
            log.boxItem('📦', 'Store', STORE_NAME);
            log.boxItem('📁', 'BasePath', basePath);
            log.boxClose();
            
            console.groupEnd(); // End group
            log.boxClose(); // End main box

            init();
            return;
        }

        var fileName = actionFiles[loadedCount];
        var filePath = basePath + fileName;
        var fileStart = Date.now();

        var script = document.createElement('script');
        script.src = filePath;
        script.async = false;

        script.onload = function () {
            var fileTime = Date.now() - fileStart;
            loadResults.push({ file: fileName, status: '✅ OK', loadTime: fileTime + 'ms' });
            script.parentNode.removeChild(script);
            loadedCount++;
            loadNextAction();
        };

        script.onerror = function () {
            _criticalError = true;
            log.error('loader', 'CRITICAL: Failed to load ' + fileName);
            log.alwaysDetails([
                ['🔗', 'url', filePath],
                ['📁', 'basePath', basePath],
                ['📋', 'loadedSoFar', '[' + actionFiles.slice(0, loadedCount).join(', ') + ']'],
                ['💡', 'hint', 'Check file exists in ' + basePath]
            ]);
            loadResults.push({ file: fileName, status: '❌ FAILED', loadTime: 'N/A' });
        };

        (document.head || document.documentElement).appendChild(script);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. ROUTER / DISPATCHER
    // ═══════════════════════════════════════════════════════════════════

    var _routeStats = {
        totalRouted: 0,
        totalUnknown: 0,
        totalNoAction: 0,
        totalErrors: 0,
        lastAction: null
    };

    function dispatch(request, callback) {
        var action = request.action || '';
        _routeStats.totalRouted++;
        _routeStats.lastAction = action;

        if (!action) {
            _routeStats.totalNoAction++;
            log.error('handler', 'No action field in request!');
            log.alwaysDetails([
                ['🔑', 'requestKeys', Object.keys(request || {}).join(', ')],
                ['📄', 'requestDump', JSON.stringify(request || {}).substring(0, 300)],
                ['❌', 'retCode', '1 (no_action)']
            ]);
            callback(LoginServer.buildEnvelope({ error: 'no_action' }, 1));
            return;
        }

        var handler = LoginServer.handlers[action];

        if (typeof handler === 'function') {
            try {
                handler(request, callback);
            } catch (handlerErr) {
                _routeStats.totalErrors++;
                log.error('handler', 'Handler "' + action + '" threw UNCAUGHT ERROR');
                log.alwaysDetails([
                    ['🎯', 'action', action],
                    ['⚠️', 'errorName', handlerErr.name || '(unknown)'],
                    ['💥', 'errorMessage', handlerErr.message || String(handlerErr)],
                    ['❌', 'retCode', '1 (handler_exception)']
                ]);
                callback(LoginServer.buildEnvelope({ error: 'handler_exception', action: action }, 1));
            }
        } else {
            _routeStats.totalUnknown++;
            log.error('handler', 'Unknown action: "' + action + '"');
            log.alwaysDetails([
                ['🔍', 'requested', action],
                ['🔢', 'totalUnknown', String(_routeStats.totalUnknown)],
                ['❌', 'retCode', '1 (unknown_action)']
            ]);
            log.details([
                ['✅', 'availableHandlers', '[' + LoginServer._handlerNames.join(', ') + ']'],
                ['📊', 'totalHandlers', String(LoginServer._handlerNames.length)]
            ]);
            callback(LoginServer.buildEnvelope({ error: 'unknown_action', action: action }, 1));
        }
    }

    LoginServer.router = {
        dispatch: dispatch,
        getStats: function () { return _routeStats; }
    };

    // ═══════════════════════════════════════════════════════════════════
    // 5. LOGINSOCKET CLASS
    // ═══════════════════════════════════════════════════════════════════

    var _socketCounter = 0;

    function LoginSocket() {
        _socketCounter++;
        this.id = 'login-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
        this._counter = _socketCounter;
        this.connected = false;
        this.disconnected = false;
        this._listeners = {};
        this._emitCount = 0;

        var self = this;
        var delay = LoginServer.randomDelay();

        log.info('connection', 'LoginSocket #' + this._counter + ' connecting...');

        setTimeout(function () {
            if (self.disconnected) {
                log.warn('connection', 'LoginSocket #' + self._counter + ' disconnected BEFORE connect completed');
                return;
            }
            self.connected = true;
            self._fire('connect');

            var listenerNames = Object.keys(self._listeners);
            var verifyLabel = LoginServer.config.verifyEnable ? 'on' : 'off';
            
            // ═══════════════════════════════════════════════════════════════
            // TIMELINE FEED STYLE - Socket Connected! (NESTED TREE STRUCTURE)
            // ═══════════════════════════════════════════════════════════════
            log.tag('Socket #' + self._counter);
            log.section('🔌', 'Socket #' + self._counter, 'connected (' + delay + 'ms)');

            // ──────────────────────────────────────────────────────────────
            // DROPDOWN 1: Socket Identity (STATIC NESTED LIST)
            // ──────────────────────────────────────────────────────────────
            log.dropdown('📋', 'Socket Identity');
            
            log.dropdownSection('🆔', 'Identification Data');
            log.dropdownSubItem('🆔', 'Unique ID', self.id, false);
            log.dropdownSubItem('#️⃣', 'Sequence Number', '#' + self._counter, true);
            
            log.divider();
            
            log.dropdownSection('⚡', 'Connection Metrics');
            log.dropdownSubItem('⏱️', 'Connection Latency', delay + ' ms', false);
            log.dropdownSubItem('🔒', 'Verification Mode', verifyLabel === 'on' ? 'ACTIVE' : 'INACTIVE', true);

            // ──────────────────────────────────────────────────────────────
            // DROPDOWN 2: Connection Target (STATIC NESTED LIST)
            // ──────────────────────────────────────────────────────────────
            log.dropdown('🎯', 'Connection Target');
            
            log.dropdownSection('🔗', 'Endpoint Details');
            log.dropdownSubItem('🌐', 'Server URL', LoginServer.config.loginServerUrl || '(unknown)', false);
            log.dropdownSubItem('📊', 'Protocol', (LoginServer.config.loginServerUrl || '').indexOf('https') === 0 ? 'HTTPS (Secure)' : 'HTTP (Normal)', true);

            // ──────────────────────────────────────────────────────────────
            // CONSOLE GROUP: Event Listener List (EXPANDABLE!)
            // ──────────────────────────────────────────────────────────────
            if (listenerNames.length > 0) {
                log.group('👂', 'Event Listener List', listenerNames.length);
                
                for (var li = 0; li < listenerNames.length; li++) {
                    var isLastListener = (li === listenerNames.length - 1);
                    var listenerName = listenerNames[li];
                    var handlerCount = (self._listeners[listenerName] || []).length;
                    
                    console.log(
                        '%c   ' + (isLastListener ? '└─▸' : '├─▸') + ' %c🎭%c ' + (listenerName || '') + ': %c[' + handlerCount + ' handler(s) registered]',
                        'color:#546E7A;font-size:11px;',
                        'font-size:11px;',
                        'color:#37474F;font-weight:600;',
                        'color:#78909C;font-size:10px;'
                    );
                }
                
                log.groupEnd();
            } else {
                log.row('📭', 'Listener Status', '(none registered yet)');
            }
        }, delay);
    }

    LoginSocket.prototype.on = function (event, handler) {
        if (typeof handler !== 'function') {
            log.error('connection', 'on() called with non-function handler');
            log.alwaysDetails([
                ['🎭', 'event', event],
                ['📝', 'handlerType', typeof handler],
                ['🔌', 'socketId', this.id]
            ]);
            return;
        }
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event].push(handler);
    };

    LoginSocket.prototype.off = function (event, handler) {
        if (!this._listeners[event]) {
            log.debug('connection', 'off() — no listeners for "' + event + '" on socket #' + this._counter);
            return;
        }
        if (handler) {
            var list = this._listeners[event];
            var before = list.length;
            for (var i = list.length - 1; i >= 0; i--) {
                if (list[i] === handler) list.splice(i, 1);
            }
            log.debug('connection', 'off() — removed ' + (before - list.length) + ' listener(s) from "' + event + '" on socket #' + this._counter);
        } else {
            var count = this._listeners[event].length;
            delete this._listeners[event];
            log.debug('connection', 'off() — removed ALL ' + count + ' listener(s) from "' + event + '" on socket #' + this._counter);
        }
    };

    LoginSocket.prototype.emit = function (event, data, callback) {
        this._emitCount++;
        var emitNum = this._emitCount;
        var actionName = (data && data.action) ? data.action : (event || 'unknown');
        var typeName = (data && data.type) ? data.type : '-';
        var emitStartTime = Date.now();

        if (event === 'handler.process') {
            var self = this;
            var delay = LoginServer.randomDelay();

            setTimeout(function () {
                if (!self.connected) {
                    log.error('EMIT', 'emit #' + emitNum + ' FAILED — socket disconnected');
                    log.alwaysDetails([
                        ['🎯', 'action', actionName],
                        ['🔌', 'socketId', self.id],
                        ['⚠️', 'hint', 'Client may hang waiting for response']
                    ]);
                    return;
                }

                if (data === null || data === undefined || typeof data === 'function') {
                    data = {};
                }

                if (!data || typeof data !== 'object') {
                    log.error('EMIT', 'emit #' + emitNum + ' — invalid data');
                    log.alwaysDetails([
                        ['📝', 'dataType', typeof data],
                        ['🎯', 'action', actionName],
                        ['🔌', 'socketId', self.id]
                    ]);
                    return;
                }

                if (!data.action) {
                    data.action = 'LoginAnnounce';
                }

                var routeStart = Date.now();
                var reqKeys = Object.keys(data);

                // ═══════════════════════════════════════════════════════════════
                // TIMELINE FEED STYLE - Emit Processing (NESTED TREE STRUCTURE)
                // ═══════════════════════════════════════════════════════════════
                log.tag(actionName);
                log.section('📤', 'Emit #' + emitNum, actionName);

                // ──────────────────────────────────────────────────────────────
                // DROPDOWN: Emit Metadata
                // ──────────────────────────────────────────────────────────────
                log.dropdown('📋', 'Emit Metadata');
                
                log.dropdownSection('🔢', 'Identification');
                log.dropdownSubItem('#️⃣', 'Emit Number', '#' + emitNum, false);
                log.dropdownSubItem('🎯', 'Action', actionName, true);
                
                log.divider();
                
                log.dropdownSection('📊', 'Payload Info');
                log.dropdownSubItem('📋', 'Data Type', typeName || '(empty)', false);
                log.dropdownSubItem('📦', 'Field Count', reqKeys.length + ' properties', true);

                // ──────────────────────────────────────────────────────────────
                // CONSOLE GROUP: Request & Response Details (EXPANDABLE!)
                // ──────────────────────────────────────────────────────────────
                log.group('📥', 'Request & Response Details');

                // Sub-section: Request Data
                console.log(
                    '%c▾ %c📥%c Request Data',
                    'color:#00695C;font-weight:bold;font-size:12px;',
                    'font-size:12px;',
                    'color:#00695C;font-weight:bold;'
                );
                
                for (var k = 0; k < reqKeys.length; k++) {
                    var rk = reqKeys[k];
                    var rv = String(data[rk] || '');
                    var isLastKey = (k === reqKeys.length - 1);
                    
                    console.log(
                        '%c   ' + (isLastKey ? '└─▸' : '├─▸') + ' %c📝%c ' + (rk || '') + ': %c' + rv,
                        'color:#546E7A;font-size:11px;',
                        'font-size:11px;',
                        'color:#37474F;font-weight:600;',
                        'color:#37474F;'
                    );
                }

                LoginServer.router.dispatch(data, function (responseData, retCode) {
                    var routeDuration = Date.now() - routeStart;
                    var totalDuration = Date.now() - emitStartTime;

                    var envelope = LoginServer.buildEnvelope(responseData, retCode);

                    // Sub-section: Response Data
                    console.log(
                        '%c▾ %c📤%c Response Data',
                        'color:#00695C;font-weight:bold;font-size:12px;',
                        'font-size:12px;',
                        'color:#00695C;font-weight:bold;'
                    );
                    
                    // Response sub-sections with tree items
                    console.log(
                        '%c   ├────────────────── %c🚀%c Dispatch Info',
                        'color:#78909C;font-size:11px;',
                        'font-size:11px;',
                        'color:#00695C;font-weight:bold;'
                    );
                    console.log('%c   │   └─ ▸ 📄 Handler File: actions/' + actionName + '.js', 'color:#546E7A;font-size:10px;');
                    
                    console.log(
                        '%c   ├────────────────── %c📦%c Envelope',
                        'color:#78909C;font-size:11px;',
                        'font-size:11px;',
                        'color:#00695C;font-weight:bold;'
                    );
                    console.log('%c   │   ├─ ▸ 📋 Return Code: ' + String(envelope.ret), 'color:#546E7A;font-size:10px;');
                    console.log('%c   │   ├─ ▸ 📦 Compression: ' + String(envelope.compress), 'color:#546E7A;font-size:10px;');
                    console.log('%c   │   └─ ▸ 🕐 Server Time: ' + String(envelope.serverTime), 'color:#546E7A;font-size:10px;');
                    
                    console.log(
                        '%c   └────────────────── %c⏱️%c Performance',
                        'color:#78909C;font-size:11px;',
                        'font-size:11px;',
                        'color:#00695C;font-weight:bold;'
                    );
                    console.log('%c       ├─ ▸ 🚀 Routing Time: ' + routeDuration + ' ms', 'color:#546E7A;font-size:10px;');
                    console.log('%c       ├─ ⏳ Scheduled Delay: ' + delay + ' ms', 'color:#546E7A;font-size:10px;');
                    console.log('%c       └─ ▸ 🔢 Total Time: ' + totalDuration + ' ms', 'color:#546E7A;font-size:10px;');
                    
                    // Data preview (tampil full!)
                    var dataPreview = envelope.data;
                    console.log(
                        '%c   💾 Preview Data:',
                        'color:#37474F;font-weight:bold;font-size:11px;'
                    );
                    console.log(
                        '%c' + dataPreview,
                        'font-family:monospace;font-size:10px;color:#37474F;padding:4px 8px;background:#ECEFF1;border-radius:4px;display:inline-block;'
                    );

                    log.groupEnd(); // End main group

                    if (typeof callback === 'function') {
                        try {
                            callback(envelope);
                        } catch (cbErr) {
                            log.error('environment', 'emit #' + emitNum + ' callback THREW ERROR');
                            log.alwaysDetails([
                                ['⚠️', 'errorName', cbErr.name || '(unknown)'],
                                ['💥', 'errorMessage', cbErr.message || String(cbErr)]
                            ]);
                        }
                    } else {
                        log.error('environment', 'emit #' + emitNum + ' — NO CALLBACK PROVIDED');
                        log.alwaysDetails([
                            ['🎯', 'action', actionName],
                            ['⚠️', 'hint', 'Game may hang waiting for response']
                        ]);
                    }
                });
            }, delay);
            return;
        }

        log.warn('EMIT', 'emit #' + emitNum + ' — unhandled event: "' + event + '"');
        log.alwaysDetails([
            ['🎭', 'event', event],
            ['🎯', 'action', actionName],
            ['❓', 'expected', 'handler.process'],
            ['🔌', 'socketId', this.id]
        ]);
    };

    LoginSocket.prototype.disconnect = function () {
        var hadListeners = Object.keys(this._listeners).length;
        this.connected = false;
        this.disconnected = true;
        this._fire('disconnect', 'client disconnect');
        log.info('connection', 'LoginSocket #' + this._counter + ' disconnected');
        log.details([
            ['🔌', 'socketId', this.id],
            ['📤', 'totalEmits', String(this._emitCount)],
            ['👂', 'remainingListeners', String(hadListeners)]
        ]);
    };

    LoginSocket.prototype.destroy = function () {
        var hadListeners = Object.keys(this._listeners).length;
        this.connected = false;
        this.disconnected = true;
        this._listeners = {};
        log.info('connection', 'LoginSocket #' + this._counter + ' destroyed');
        log.details([
            ['🔌', 'socketId', this.id],
            ['📤', 'totalEmits', String(this._emitCount)],
            ['🧹', 'clearedListeners', String(hadListeners)]
        ]);
    };

    LoginSocket.prototype._fire = function (event) {
        var args = Array.prototype.slice.call(arguments, 1);
        var list = this._listeners[event];

        if (!list || list.length === 0) return;

        for (var i = 0; i < list.length; i++) {
            try {
                list[i].apply(null, args);
            } catch (e) {
                log.error('connection', '_fire: listener #' + (i + 1) + ' for "' + event + '" threw error');
                log.alwaysDetails([
                    ['⚠️', 'errorName', e.name || '(unknown)'],
                    ['💥', 'errorMessage', e.message || String(e)],
                    ['🎭', 'event', event],
                    ['🔢', 'listenerIndex', String(i + 1)]
                ]);
            }
        }
    };

    LoginServer.LoginSocket = LoginSocket;
    window.LoginServer = LoginServer;

    // ═══════════════════════════════════════════════════════════════════
    // 6. INIT — io.connect override + getLoginServer
    // ═══════════════════════════════════════════════════════════════════

    function init() {
        var loginServerUrl = LoginServer.config.loginServerUrl;
        var patched = false;

        LoginServer.db.seedConfig().catch(function (e) {
            log.error('startup', 'IndexedDB seedConfig FAILED');
            log.alwaysDetails([
                ['⚠️', 'errorName', e.name || '(unknown)'],
                ['💥', 'errorMessage', e.message || String(e)]
            ]);
        });

        window.getLoginServer = function () {
            return loginServerUrl;
        };

        function overrideIoConnect() {
            if (patched) return;
            if (!window.io || typeof window.io.connect !== 'function') return false;

            var origConnect = window.io.connect;
            patched = true;

            window.io.connect = function (url, options) {
                if (url && url.indexOf(loginServerUrl) !== -1) {
                    // KONSISTEN 100% - SATU BESAR BOX! Group DI DALAM!
                    log.info('IO', '✅ READY');
                    
                    log.boxHeader('🌐 IO CONNECTION');
                    log.boxItem('🔗', 'URL', url);
                    log.boxItem('🔒', 'Verify', 'off');
                    log.boxItem('🔀', 'Routing', '1-level');
                    log.boxItem('📦', 'Return Type', 'LoginSocket');
                    
                    // Group DI DALAM box!
                    console.groupCollapsed('  ▸ ⚙️ Full configuration details');
                    log.boxHeader('⚙️ CONFIGURATION');
                    log.boxItem('🔗', 'serverUrl', url);
                    log.boxItem('🔒', 'verifyEnable', 'false');
                    log.boxItem('🔀', 'routing', '1-level (action only)');
                    log.boxItem('📦', 'returnType', 'LoginSocket');
                    log.boxClose();
                    console.groupEnd(); // End group
                    
                    log.boxClose(); // End main box

                    return new LoginServer.LoginSocket();
                }

                return origConnect.call(window.io, url, options);
            };

            return true;
        }

        log.info('TIMER', 'Waiting for window.io...');
        var pollCount = 0;
        var pollTimer = setInterval(function () {
            if (patched) { clearInterval(pollTimer); return; }
            if (++pollCount > 300) {
                clearInterval(pollTimer);
                log.error('TIMER', 'window.io NOT found after 30s (300 polls)');
                log.alwaysDetails([
                    ['💡', 'hint', 'main.min.js may not have loaded'],
                    ['💡', 'hint2', 'io not exposed on window']
                ]);
                return;
            }
            if (pollCount % 50 === 0) {
                log.debug('TIMER', 'Still waiting... (' + (pollCount * 100) + 'ms, ' + pollCount + ' polls)');
            }
            if (overrideIoConnect()) clearInterval(pollTimer);
        }, 100);

        if (typeof MutationObserver !== 'undefined') {
            var observer = new MutationObserver(function () {
                if (!patched && window.io && typeof window.io.connect === 'function') {
                    log.info('TIMER', 'MutationObserver detected window.io');
                    overrideIoConnect();
                    observer.disconnect();
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(function () { observer.disconnect(); }, 60000);
        } else {
            log.warn('TIMER', 'MutationObserver not available — poll only');
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // START
    // ═══════════════════════════════════════════════════════════════════
    loadNextAction();
})();
