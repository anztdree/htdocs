/**
 * index.js — Chat Server Entry Point
 * Super Warrior Z — CHAT SERVER
 *
 * Titik masuk tunggal. Berisi:
 *   1. Logger (inline, self-contained)
 *   2. Config + MESSAGE_KIND + Helpers
 *   3. IndexedDB (chat-server: chat)
 *      — store 'chat' dari type:"chat" di main.min.js
 *   4. Room & Notify management (in-memory)
 *   5. Action loader (actions/*.js)
 *   6. Router/Dispatcher (type='chat' validation)
 *   7. ChatSocket class (verifyEnable=TRUE, TEA handshake)
 *   8. io.connect() override (intercept port 8002)
 *
 * Actions di folder actions/. PHP/MySQL TIDAK digunakan — semua via IndexedDB.
 * User profile dibaca dari login-server IndexedDB (login-server/loginInfo).
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════
    // PRE-LOG (sebelum logger siap, pakai console.log biasa + CSS)
    // ═══════════════════════════════════════════════════════════════════
    var _PRE_BG = 'background:#212121;color:white;padding:2px 8px;border-radius:3px;';
    
    function preLog(msg) {
        console.log('%c⏱️ [CHAT-SERVER] ' + msg, _PRE_BG);
    }

    function preError(msg) {
        console.log('%c❌ [CHAT-SERVER] ' + msg, 'background:#F44336;color:white;padding:2px 8px;border-radius:3px;');
    }

    // ═══════════════════════════════════════════════════════════════════
    // AUTO-DETECT BASE PATH
    // ═══════════════════════════════════════════════════════════════════
    var basePath = (function () {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
            var src = scripts[i].src || '';
            if (src.indexOf('chat-server/index.js') !== -1) {
                return src.replace('index.js', '');
            }
        }
        return './server/chat-server/';
    })();



    // ═══════════════════════════════════════════════════════════════════
    // 1. LOGGER - KONSISTEN 100% - SATU PATTERN SAJA!
    // ═══════════════════════════════════════════════════════════════════
    var ChatServerLogger = (function () {
        var SERVER_TAG = '[CHAT-SERVER]';
        var LEVEL_KEY = 'CHAT_SERVER_LOG_LEVEL';
        var PRIORITY = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 99 };

        // [CHAT-SERVER] background HITAM - NO BOLD!
        var SERVER_BG = 'background:#212121;color:white;padding:2px 8px;border-radius:3px;';
        
        // Warna KONSISTEN - hanya 5 warna!
        var CLR = {
            BOX_HEADER: '#00897B',     // Teal - untuk semua box header
            BOX_ITEM:   '#546E7A',     // Blue-gray - untuk label
            BOX_VALUE:  '#37474F',     // Dark gray - untuk value
            SUCCESS:    '#4CAF50',     // Green - success
            ERROR:      '#F44336',     // Red - error
            WARNING:    '#FF9800',     // Orange - warning
            INFO:       '#2196F3',     // Blue - info request
            DEBUG:      '#78909C'      // Gray-blue - debug
        };

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

        // Context emoji map - KONSISTEN!
        function getContextEmoji(context) {
            var ctx = (context || '').toLowerCase();
            var map = {
                'timer': '⏱️',
                'connection': '🔌',
                'connect': '🔌',
                'emit': '⚡',
                'handler': '🎯',
                'request': '📥',
                'response': '📤',
                'storage': '💾',
                'action': '⚙️',
                'startup': '🏗️',
                'environment': '🌐',
                'loader': '📦',
                'encryption': '🔐',
                'notification': '🔔',
                'message': '💬',
                'join': '🎬',
                'leave': '🚪',
                'chat': '💬',
                'database': '🗄️',
                'network': '🌐'
            };
            return map[ctx] || '⏱️';
        }

        // ═══════════════════════════════════════════════════════════════
        // BOX FUNCTIONS - Pattern: ┌─ header, │ content, └─ close
        // Semua warna KONSISTEN!
        // ═══════════════════════════════════════════════════════════════

        /**
         * boxHeader(title) - Open box dengan header
         * Output: ┌────── TITLE ────────────
         */
        function boxHeader(title) {
            if (!shouldLog('INFO')) return;
            var fill = '';
            for (var i = (title || '').length; i < 42; i++) {
                fill += '\u2500';
            }
            console.log(
                '%c\u250c\u2500\u2500 ' + title + ' ' + fill,
                'color:' + CLR.BOX_HEADER + ';'
            );
        }

        /**
         * boxItem(emoji, label, value) - Content line dalam box
         * EMOJI WAJIB! Output: │ 🏷️ Label    Value
         */
        function boxItem(emoji, label, value) {
            if (!shouldLog('DEBUG')) return;
            var em = emoji || '📌';
            var lbl = (label || '').padEnd(14);
            console.log(
                '%c\u2502 ' + em + ' %c' + lbl + '%c' + (value || ''),
                'color:#90A4AE;',
                'color:' + CLR.BOX_ITEM + ';',
                'color:' + CLR.BOX_VALUE + ';'
            );
        }

        /**
         * boxClose() - Close box
         * Output: └────────────────────────
         */
        function boxClose() {
            if (!shouldLog('DEBUG')) return;
            var closeLine = '';
            for (var i = 0; i < 44; i++) {
                closeLine += '\u2500';
            }
            console.log(
                '%c\u2514' + closeLine,
                'color:' + CLR.BOX_HEADER + ';'
            );
        }

        // ═══════════════════════════════════════════════════════════════
        // MAIN LOG FUNCTIONS - KONSISTEN 100%!
        // Format: 💬 [CHAT-SERVER]  CONTEXT  ▸  TIMESTAMP message
        // ═══════════════════════════════════════════════════════════════

        /**
         * header(action, status) - Main header
         * Output: 💬 [CHAT-SERVER]  ►  Action  ►  Status
         */
        function header(action, status) {
            if (!shouldLog('INFO')) return;
            console.log(
                '%c💬 ' + SERVER_TAG + '  %c►  ' + (action || '') + '  ►  ' + (status || ''),
                SERVER_BG,
                'color:' + CLR.BOX_VALUE + ';'
            );
        }

        /**
         * info(context, message) - Info line
         * Output: ⏱️ [CHAT-SERVER]  CONTEXT  ▸  TIMESTAMP message
         */
        function info(context, message) {
            if (!shouldLog('INFO')) return;
            var em = getContextEmoji(context);
            console.log(
                '%c' + em + ' ' + SERVER_TAG + '  %c' + (context || '').padEnd(12) + ' ▸  ' + ts() + ' ' + (message || ''),
                SERVER_BG,
                'color:' + CLR.INFO + ';'
            );
        }

        /**
         * warn(context, message) - Warning line
         */
        function warn(context, message) {
            if (!shouldLog('WARN')) return;
            var em = getContextEmoji(context);
            console.log(
                '%c' + em + ' ' + SERVER_TAG + '  %c' + (context || '').padEnd(12) + ' ▸  ' + ts() + ' ' + (message || ''),
                SERVER_BG,
                'color:' + CLR.WARNING + ';'
            );
        }

        /**
         * error(context, message) - Error line
         */
        function error(context, message) {
            if (!shouldLog('ERROR')) return;
            var em = getContextEmoji(context);
            console.log(
                '%c' + em + ' ' + SERVER_TAG + '  %c' + (context || '').padEnd(12) + ' ▸  ' + ts() + ' ' + (message || ''),
                SERVER_BG,
                'color:' + CLR.ERROR + ';'
            );
        }

        /**
         * debug(context, message) - Debug line
         */
        function debug(context, message) {
            if (!shouldLog('DEBUG')) return;
            var em = getContextEmoji(context);
            console.log(
                '%c' + em + ' ' + SERVER_TAG + '  %c' + (context || '').padEnd(12) + ' ▸  ' + tsFull() + ' ' + (message || ''),
                SERVER_BG,
                'color:' + CLR.DEBUG + ';'
            );
        }

        // ═══════════════════════════════════════════════════════════════
        // HELPER: Quick box with items array
        // ═══════════════════════════════════════════════════════════════

        /**
         * quickBox(title, items[]) - Full box with auto close
         * Items format: [emoji, label, value] - EMOJI WAJIB!
         */
        function quickBox(title, items) {
            if (!items || !items.length) return;
            
            boxHeader(title);
            
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (Array.isArray(item)) {
                    // Format: [emoji, label, value] atau [emoji, label] (value optional)
                    var em = item[0] || '📌';
                    var lbl = item[1] || '';
                    var val = item.length > 2 ? item[2] : '';
                    boxItem(em, lbl, val);
                } else if (typeof item === 'object') {
                    boxItem(item.emoji || '📌', item.label || '', item.value || '');
                }
            }
            
            boxClose();
        }

        // ═══════════════════════════════════════════════════════════════
        // LEGACY COMPATIBILITY
        // ═══════════════════════════════════════════════════════════════

        function detail(emoji, key, value) {
            boxItem(emoji || '📌', key, String(value));
        }

        function openDetail(emoji, key, value) {
            boxItem(emoji || '📌', key, String(value));
        }

        function details(pairs) {
            if (!pairs || !pairs.length) return;
            // OTOMATIS DALAM BOX!
            boxHeader('📋 DETAILS');
            for (var i = 0; i < pairs.length; i++) {
                var pair = pairs[i];
                if (Array.isArray(pair)) {
                    // Check format: [emoji, label, value] or [label, value]
                    if (pair.length === 3 && typeof pair[0] === 'string' && pair[0].length <= 2) {
                        // New format: [emoji, label, value]
                        var em = pair[0] || '📌';
                        var lbl = pair[1] || '';
                        var val = pair.length > 2 ? pair[2] : '';
                        boxItem(em, lbl, val);
                    } else {
                        // Legacy format: [label, value] - add default emoji
                        var em = '📌';
                        var lbl = pair[0] || '';
                        var val = pair.length > 1 ? pair[1] : '';
                        boxItem(em, lbl, val);
                    }
                }
            }
            boxClose();
        }

        function table(title, data) {
            if (!shouldLog('DEBUG')) return;
            console.log('%c  📋 ' + (title || ''), 'color:' + CLR.DEBUG + ';');
            console.table(data);
        }

        function alwaysDetails(pairs) {
            var savedMin = minPriority;
            minPriority = 0;
            // OTOMATIS DALAM BOX!
            boxHeader('📋 ALWAYS DETAILS');
            if (pairs && pairs.length) {
                for (var i = 0; i < pairs.length; i++) {
                    var pair = pairs[i];
                    if (Array.isArray(pair)) {
                        if (pair.length === 3 && typeof pair[0] === 'string' && pair[0].length <= 2) {
                            var em = pair[0] || '📌';
                            var lbl = pair[1] || '';
                            var val = pair.length > 2 ? pair[2] : '';
                            boxItem(em, lbl, val);
                        } else {
                            var em = '📌';
                            var lbl = pair[0] || '';
                            var val = pair.length > 1 ? pair[1] : '';
                            boxItem(em, lbl, val);
                        }
                    }
                }
            }
            boxClose();
            minPriority = savedMin;
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
                console.log('%c💬 ' + SERVER_TAG + ' Log level → ' + level, SERVER_BG);
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // Export
        // ═══════════════════════════════════════════════════════════════

        return {
            header: header,
            info: info,
            warn: warn,
            error: error,
            debug: debug,
            
            boxHeader: boxHeader,
            boxItem: boxItem,
            boxClose: boxClose,
            quickBox: quickBox,
            
            detail: detail,
            openDetail: openDetail,
            details: details,
            table: table,
            alwaysDetails: alwaysDetails,
            
            level: currentLevel,
            setLevel: setLevel,
            
            SERVER_BG: SERVER_BG,
            COLORS: CLR,
            SERVER_TAG: SERVER_TAG
        };
    })();

    window.ChatServerLogger = ChatServerLogger;

    // ═══════════════════════════════════════════════════════════════════
    // 2. CONFIG + MESSAGE_KIND + HELPERS
    // ═══════════════════════════════════════════════════════════════════
    var log = ChatServerLogger;

    var ChatServer = {
        config: {
            chatServerUrl: 'http://127.0.0.1:8002',
            teaKey: 'verification',
            verifyEnable: true,
            delayMin: 30,
            delayMax: 120,
            maxRecordPerRoom: 50,
            maxMessagesPerRequest: 30,
            maxReconnectWaitTime: 600000,
            reconnectionAttempts: 10
        },
        handlers: {},
        _handlerNames: [],
        _handlerCount: 0,
        log: log,
        currentSocket: null
    };

    // MESSAGE_KIND constants (dari main.min.js)
    ChatServer.MESSAGE_KIND = {
        MK_NULL: 0,
        SYSTEM: 1,
        WORLD: 2,
        GUILD: 3,
        PRIVATE: 4,
        WORLD_TEAM: 5,
        TEAM: 6
    };

    // Pure helpers
    ChatServer.randomDelay = function () {
        return Math.floor(Math.random() * (ChatServer.config.delayMax - ChatServer.config.delayMin + 1)) + ChatServer.config.delayMin;
    };

    ChatServer.generateChallenge = function () {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var result = '';
        for (var i = 0; i < 16; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    ChatServer.nowTimestamp = function () {
        return Math.floor(Date.now() / 1000);
    };

    // User profile — baca dari login-server IndexedDB (login-server / loginInfo)
    // Login-server simpan: userId, nickName, channelCode, securityCode, dll
    // Visual fields (headImage, headEffect, headBox) akan tersedia setelah
    // main-server di-update ke IndexedDB — sementara pakai default.
    //
    // Mengapa langsung open DB lain di sini?
    //   Chat-server harus SEMPURNA tanpa localStorage sama sekali.
    //   Login-server sudah bikin DB ini saat login → tinggal baca.

    var _loginDB = null;
    var LOGIN_DB_NAME = 'login-server';
    var LOGIN_STORE_NAME = 'loginInfo';

    function openLoginDB() {
        return new Promise(function (ok, fail) {
            if (_loginDB) { ok(_loginDB); return; }
            var r = indexedDB.open(LOGIN_DB_NAME);
            r.onsuccess = function (e) {
                _loginDB = e.target.result;
                ok(_loginDB);
            };
            r.onerror = function () { fail(new Error('Cannot open ' + LOGIN_DB_NAME)); };
        });
    }

    function readLoginInfo(userId) {
        return openLoginDB().then(function (db) {
            return new Promise(function (ok, fail) {
                var tx = db.transaction(LOGIN_STORE_NAME, 'readonly');
                var req = tx.objectStore(LOGIN_STORE_NAME).get(userId);
                req.onsuccess = function () { ok(req.result || null); };
                req.onerror = function () { fail(req.error); };
            });
        });
    }

    ChatServer.getUserInfo = function (userId, serverId) {
        return readLoginInfo(userId).then(function (acc) {
            if (!acc) return null;
            // Map loginInfo fields ke format yang chat-server butuhkan
            return {
                nickName:   acc.nickName || '',
                headImage:  acc.headImage || '',
                headEffect: acc.headEffect || '0',
                headBox:    acc.headBox || '0',
                userId:     acc.userId,
                serverId:   acc.serverId || (serverId || '1')
            };
        }).catch(function (e) {
            log.error('database', 'getUserInfo failed for userId: ' + userId, e);
            return null;
        });
    };

    ChatServer.extractUserProfile = function (profile) {
        // profile sudah di-format oleh getUserInfo, atau default jika null
        if (!profile) {
            return { nickName: '', headImage: '', headEffect: '0', headBox: '0' };
        }
        return {
            nickName:   profile.nickName || '',
            headImage:  profile.headImage || '',
            headEffect: String(profile.headEffect || 0),
            headBox:    String(profile.headBox || 0)
        };
    };
    window.ChatServer = ChatServer;

    // ═══════════════════════════════════════════════════════════════════
    // 3. INDEXEDDB
    // ═══════════════════════════════════════════════════════════════════
    // Database: chat-server
    //   — dari type:"chat" di main.min.js
    // Store: chat
    //   — semua chat message, index by roomId dan _time
    //
    // Catatan: game asli TIDAK pakai IndexedDB untuk chat (murni in-memory
    // ts.chatData + server-side). Kita pakai IndexedDB untuk persistence
    // offline. User profile dari login-server IndexedDB (login-server/loginInfo).

    var DB_NAME = 'chat-server';
    var DB_VERSION = 1;
    var _idb = null;

    function openDB() {
        return new Promise(function (ok, fail) {
            if (_idb) { ok(_idb); return; }
            var r = indexedDB.open(DB_NAME, DB_VERSION);
            r.onupgradeneeded = function (e) {
                var db = e.target.result;

                // chat — semua chat message (satu-satunya store)
                if (!db.objectStoreNames.contains('chat')) {
                    var store = db.createObjectStore('chat', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('roomId', 'roomId', { unique: false });
                    store.createIndex('_time', '_time', { unique: false });
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

    // Generic IDB helpers
    function idbGet(storeName, key) {
        return openDB().then(function (db) {
            return new Promise(function (ok, fail) {
                var tx = db.transaction(storeName, 'readonly');
                var req = tx.objectStore(storeName).get(key);
                req.onsuccess = function () { ok(req.result || null); };
                req.onerror = function () { fail(req.error); };
            });
        });
    }

    function idbPut(storeName, data) {
        return openDB().then(function (db) {
            return new Promise(function (ok, fail) {
                var tx = db.transaction(storeName, 'readwrite');
                var store = tx.objectStore(storeName);
                var req = store.put(data);
                req.onsuccess = function () { ok(data); };
                req.onerror = function () { fail(req.error); };
            });
        });
    }

    function idbDelete(storeName, key) {
        return openDB().then(function (db) {
            return new Promise(function (ok, fail) {
                var tx = db.transaction(storeName, 'readwrite');
                var req = tx.objectStore(storeName).delete(key);
                req.onsuccess = function () { ok(); };
                req.onerror = function () { fail(req.error); };
            });
        });
    }

    function idbGetAllByIndex(storeName, indexName, value) {
        return openDB().then(function (db) {
            return new Promise(function (ok, fail) {
                var tx = db.transaction(storeName, 'readonly');
                var store = tx.objectStore(storeName);
                var index = store.index(indexName);
                var req = index.getAll(value);
                req.onsuccess = function () { ok(req.result || []); };
                req.onerror = function () { fail(req.error); };
            });
        });
    }

    ChatServer.db = {
        open: openDB,
        get: function (store, key) { return idbGet(store, key); },
        put: function (store, data) { return idbPut(store, data); },
        delete: function (store, key) { return idbDelete(store, key); },
        getAllByIndex: function (store, indexName, value) { return idbGetAllByIndex(store, indexName, value); }
    };

    // ═══════════════════════════════════════════════════════════════════
    // 4. ROOM & NOTIFY MANAGEMENT (in-memory)
    // ═══════════════════════════════════════════════════════════════════
    //
    // In-memory room registry. Socket references stored for Notify emission.
    // Message persistence uses IndexedDB.
    //
    // Evidence:
    //   L114240-114261: listenNotify → socket.on('Notify', fn)
    //     Notify envelope: {ret:'SUCCESS', data:JSON.stringify({_msg:...})}
    //
    // _rooms:       roomId → [socketRef, socketRef, ...]
    // _socketRooms: socketId → [roomId, roomId, ...]

    ChatServer._rooms = {};
    ChatServer._socketRooms = {};

    ChatServer.socketJoinRoom = function (socket, roomId) {
        if (!ChatServer._rooms[roomId]) {
            ChatServer._rooms[roomId] = [];
        }
        var room = ChatServer._rooms[roomId];
        for (var i = 0; i < room.length; i++) {
            if (room[i].id === socket.id) return;
        }
        room.push(socket);
        if (!ChatServer._socketRooms[socket.id]) {
            ChatServer._socketRooms[socket.id] = [];
        }
        var srooms = ChatServer._socketRooms[socket.id];
        if (srooms.indexOf(roomId) === -1) {
            srooms.push(roomId);
        }
    };

    ChatServer.socketLeaveRoom = function (socket, roomId) {
        var room = ChatServer._rooms[roomId];
        if (room) {
            for (var i = room.length - 1; i >= 0; i--) {
                if (room[i].id === socket.id) { room.splice(i, 1); break; }
            }
            if (room.length === 0) delete ChatServer._rooms[roomId];
        }
        var srooms = ChatServer._socketRooms[socket.id];
        if (srooms) {
            var idx = srooms.indexOf(roomId);
            if (idx !== -1) srooms.splice(idx, 1);
        }
    };

    ChatServer.socketLeaveAllRooms = function (socket) {
        var rooms = ChatServer._socketRooms[socket.id] || [];
        for (var i = 0; i < rooms.length; i++) {
            ChatServer.socketLeaveRoom(socket, rooms[i]);
        }
        delete ChatServer._socketRooms[socket.id];
    };

    ChatServer.getRoomSize = function (roomId) {
        return (ChatServer._rooms[roomId] || []).length;
    };

    ChatServer.emitNotifyToRoom = function (roomId, msg, excludeSocket) {
        var room = ChatServer._rooms[roomId] || [];

        if (room.length === 0) {
            log.debug('notification', 'No sockets in room: ' + roomId);
            return;
        }

        var notifyEnvelope = {
            ret: 'SUCCESS',
            data: JSON.stringify({ _msg: msg }),
            compress: false
        };

        var sentCount = 0;
        for (var i = 0; i < room.length; i++) {
            var targetSocket = room[i];
            if (excludeSocket && targetSocket.id === excludeSocket.id) continue;
            if (!targetSocket.connected) continue;
            try {
                targetSocket._fire('Notify', notifyEnvelope);
                sentCount++;
            } catch (fireErr) {
                log.error('notification', 'Failed to send Notify to ' + targetSocket.id, fireErr);
            }
        }

        log.debug('notification', 'Broadcast complete');
        log.details([
            ['📍', 'roomId', roomId],
            ['👥', 'roomSize', String(room.length)],
            ['📤', 'sentTo', String(sentCount)],
            ['🚫', 'excluded', excludeSocket ? excludeSocket.id : '(none)']
        ]);
    };

    window.ChatServer = ChatServer;

    // ═══════════════════════════════════════════════════════════════════
    // 5. LOAD ACTIONS (actions/*.js)
    // ═══════════════════════════════════════════════════════════════════
    var actionFiles = [
        'actions/chatLogin.js',
        'actions/joinRoom.js',
        'actions/leaveRoom.js',
        'actions/sendMsg.js',
        'actions/getRecord.js'
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

            // ── Boot summary with new pattern ──
            log.header('BOOT', (bootOk ? '✅' : '❌') + ' Ready');
            
            // SATU BESAR BOX - Group DI DALAM!
            log.boxHeader('🚀 BOOT SUMMARY');
            log.boxItem('📂', 'Actions', String(actionFiles.length));
            log.boxItem('⏱️', 'Load Time', totalLoadTime + 'ms');
            log.boxItem('💾', 'Database', DB_NAME);
            log.boxItem('🎯', 'Handlers', String(ChatServer._handlerNames.length));
            log.boxItem('🔗', 'URL', ChatServer.config.chatServerUrl);
            
            // Group DI DALAM box!
            console.groupCollapsed('  ▸ ⚙️ Full configuration & details');
            
            log.boxHeader('📋 LOAD RESULTS');
            console.table(loadResults);
            
            log.boxHeader('⚙️ CONFIG');
            var configRows = [];
            var cfg = ChatServer.config;
            log.boxItem('🔗', 'chatServerUrl', cfg.chatServerUrl);
            log.boxItem('🔑', 'teaKey', cfg.teaKey);
            log.boxItem('🔒', 'verifyEnable', String(cfg.verifyEnable));
            log.boxItem('⏱️', 'delayMin', String(cfg.delayMin) + 'ms');
            log.boxItem('⏱️', 'delayMax', String(cfg.delayMax) + 'ms');
            log.boxItem('📊', 'maxRecordPerRoom', String(cfg.maxRecordPerRoom));
            log.boxItem('📨', 'maxMessagesPerRequest', String(cfg.maxMessagesPerRequest));
            log.boxItem('🔄', 'reconnectionAttempts', String(cfg.reconnectionAttempts));
            log.boxClose();
            
            log.boxHeader('🎯 HANDLERS');
            for (var hi = 0; hi < ChatServer._handlerNames.length; hi++) {
                log.boxItem('✅', '[' + hi + ']', ChatServer._handlerNames[hi]);
            }
            log.boxClose();
            
            log.boxHeader('💾 STORAGE INFO');
            log.boxItem('🗄️', 'Database', DB_NAME);
            log.boxItem('📦', 'Store', 'chat');
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
                ['📦', 'loadedSoFar', '[' + actionFiles.slice(0, loadedCount).join(', ') + ']'],
                ['💡', 'hint', 'Check file exists in ' + basePath]
            ]);
            loadResults.push({ file: fileName, status: '❌ FAILED', loadTime: 'N/A' });
        };

        (document.head || document.documentElement).appendChild(script);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 6. ROUTER / DISPATCHER
    // ═══════════════════════════════════════════════════════════════════
    // Routes request.action → handler. Only accepts type='chat'.

    var _routeStats = {
        totalRouted: 0,
        totalUnknown: 0,
        totalNoAction: 0,
        totalWrongType: 0,
        totalErrors: 0,
        lastAction: null
    };

    function dispatch(request, callback) {
        var action = request.action || '';
        var type = request.type || '';
        _routeStats.totalRouted++;
        _routeStats.lastAction = action;

        if (!action) {
            _routeStats.totalNoAction++;
            log.error('handler', 'No action field in request!');
            log.alwaysDetails([
                ['📋', 'type', type || '(empty)'],
                ['🔑', 'requestKeys', Object.keys(request || {}).join(', ')],
                ['📄', 'requestDump', JSON.stringify(request || {}).substring(0, 300)]
            ]);
            callback({});
            return;
        }

        if (type !== 'chat') {
            _routeStats.totalWrongType++;
            log.error('handler', 'Wrong type — expected "chat"');
            log.alwaysDetails([
                ['📥', 'receivedType', type || '(empty)'],
                ['✅', 'expectedType', 'chat'],
                ['🎯', 'action', action],
                ['🔢', 'totalWrongType', String(_routeStats.totalWrongType)]
            ]);
            callback({});
            return;
        }

        var handler = ChatServer.handlers[action];

        if (typeof handler === 'function') {
            try {
                handler(request, callback);
            } catch (handlerErr) {
                _routeStats.totalErrors++;
                log.error('handler', 'Handler "' + action + '" threw UNCAUGHT ERROR');
                log.alwaysDetails([
                    ['🎯', 'action', action],
                    ['❌', 'errorName', handlerErr.name || '(unknown)'],
                    ['📝', 'errorMessage', handlerErr.message || String(handlerErr)]
                ]);
                callback({});
            }
        } else {
            _routeStats.totalUnknown++;
            log.error('handler', 'Unknown action: "' + action + '"');
            log.alwaysDetails([
                ['📝', 'requested', action],
                ['🔢', 'totalUnknown', String(_routeStats.totalUnknown)],
                ['📋', 'available', '[' + ChatServer._handlerNames.join(', ') + ']']
            ]);
            callback({});
        }
    }

    ChatServer.router = {
        dispatch: dispatch,
        getStats: function () { return _routeStats; }
    };

    // ═══════════════════════════════════════════════════════════════════
    // 7. CHATSOCKET CLASS
    // ═══════════════════════════════════════════════════════════════════
    //
    // Evidence:
    //   L82535: connectWithSocket(url, callback, errorCallback)
    //   L82539: verifyEnable ? socketOnVerify(callback) : callback()
    //   Chat-server: verifyEnable = TRUE → TEA handshake
    //
    // TEA verify flow:
    //   1. Client connects → ChatSocket fires 'connect'
    //   2. ChatSocket fires 'verify' event with challenge string
    //   3. Game client (TSSocketClient.socketOnVerify) encrypts with TEA,
    //      sends back via emit('verify', encrypted, callback)
    //   4. ChatSocket decrypts, compares with original challenge
    //   5. If match → callback({ret: 0}) → game continues to chatLoginRequest

    var _socketCounter = 0;

    function ChatSocket() {
        _socketCounter++;
        this.id = 'chat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
        this._counter = _socketCounter;
        this.connected = false;
        this.disconnected = false;
        this._listeners = {};
        this._emitCount = 0;
        this._verifyChallenge = '';
        this._verified = false;

        var self = this;
        var delay = ChatServer.randomDelay();

        log.info('connection', 'ChatSocket #' + this._counter + ' connecting...');

        setTimeout(function () {
            if (self.disconnected) {
                log.warn('connection', 'ChatSocket #' + self._counter + ' disconnected BEFORE connect completed');
                return;
            }
            self.connected = true;
            self._fire('connect');

            // ── Socket connected summary with new pattern ──
            log.header('SOCK', 'Socket #' + self._counter + ' ✅ CONNECTED');
            log.boxHeader('🔌 Socket Info');
            log.boxItem('⏱️', 'Delay', delay + 'ms');
            log.boxItem('🆔', 'Socket ID', self.id);
            log.boxItem('🔐', 'Verify', 'on');
            log.boxItem('👂', 'Listeners', String(Object.keys(self._listeners).length));
            
            // Group DI DALAM box!
            console.groupCollapsed('  ▸ 🔌 Full socket details');
            
            log.boxHeader('⚙️ SOCKET CONFIG');
            log.boxItem('🆔', 'socketId', self.id);
            log.boxItem('🎯', 'target', ChatServer.config.chatServerUrl);
            log.boxItem('🔒', 'verifyEnable', 'true');
            log.boxItem('🔑', 'teaKey', ChatServer.config.teaKey);
            log.boxItem('⏱️', 'delay', delay + 'ms');
            log.boxItem('📤', 'emitCount', String(self._emitCount));
            log.boxClose();
            
            var listenerNames = Object.keys(self._listeners);
            if (listenerNames.length > 0) {
                log.boxHeader('👂 EVENT LISTENERS');
                for (var li = 0; li < listenerNames.length; li++) {
                    log.boxItem('🎭', '[' + li + ']', listenerNames[li]);
                }
                log.boxClose();
            } else {
                log.boxItem('📭', 'Listeners', '(none bound)');
            }
            
            console.groupEnd(); // End group
            log.boxClose(); // End main box

            // Setelah connect, mulai TEA verify
            setTimeout(function () {
                if (self.disconnected || !self.connected) {
                    log.warn('encryption', 'Socket gone before verify started');
                    return;
                }
                self._startVerify();
            }, 50);
        }, delay);
    }

    // ── TEA Verify Handshake ──

    ChatSocket.prototype._startVerify = function () {
        var self = this;
        var challenge = ChatServer.generateChallenge();
        this._verifyChallenge = challenge;

        log.info('encryption', 'Starting TEA verify handshake');
        log.details([
            ['🔑', 'challenge', challenge],
            ['🔐', 'key', ChatServer.config.teaKey],
            ['📤', 'expect', 'Client encrypts with TEA and sends back']
        ]);

        // Fire 'verify' event — game client akan menerima via socket.on('verify', handler)
        this._fire('verify', challenge);

        log.debug('encryption', 'Challenge sent, waiting for client response...');
    };

    ChatSocket.prototype._handleVerifyResponse = function (encrypted, callback) {
        var self = this;
        log.info('encryption', 'Received verify response from client');

        if (!this._verifyChallenge) {
            log.error('encryption', 'No challenge stored — cannot verify');
            if (typeof callback === 'function') callback({ ret: 1 });
            return;
        }

        try {
            var tea = new TEA();
            var decrypted = tea.decrypt(encrypted, ChatServer.config.teaKey);

            if (decrypted === this._verifyChallenge) {
                this._verified = true;
                log.info('encryption', 'TEA verify SUCCESS');
                log.alwaysDetails([
                    ['✅', 'status', 'VERIFIED'],
                    ['🆔', 'socketId', this.id]
                ]);
                if (typeof callback === 'function') callback({ ret: 0 });
            } else {
                log.error('encryption', 'TEA verify FAILED — decrypted mismatch');
                log.alwaysDetails([
                    ['📥', 'original', this._verifyChallenge],
                    ['🔓', 'decrypted', decrypted],
                    ['🔒', 'encrypted', encrypted.substring(0, 32) + '...']
                ]);
                if (typeof callback === 'function') callback({ ret: 1 });
            }
        } catch (err) {
            log.error('encryption', 'TEA decrypt threw ERROR', err);
            log.alwaysDetails([
                ['🔒', 'encrypted', encrypted.substring(0, 32) + '...'],
                ['💡', 'hint', 'TEA class may not be loaded from main.min.js']
            ]);
            if (typeof callback === 'function') callback({ ret: 1 });
        }
    };

    // ── Event Handlers ──

    ChatSocket.prototype.on = function (event, handler) {
        if (typeof handler !== 'function') {
            log.error('connection', 'on() called with non-function handler');
            log.alwaysDetails([
                ['🎧', 'event', event],
                ['📝', 'handlerType', typeof handler],
                ['🆔', 'socketId', this.id]
            ]);
            return;
        }
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event].push(handler);
    };

    ChatSocket.prototype.off = function (event, handler) {
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

    ChatSocket.prototype.emit = function (event, data, callback) {
        this._emitCount++;
        var emitNum = this._emitCount;
        var actionName = (data && data.action) ? data.action : (event || 'unknown');
        var typeName = (data && data.type) ? data.type : '-';
        var emitStartTime = Date.now();

        // ── TEA Verify response ──
        if (event === 'verify' && !this._verified) {
            log.info('encryption', 'emit #' + emitNum + ' → TEA verify response');
            this._handleVerifyResponse(data, callback);
            return;
        }

        // ── handler.process ──
        if (event === 'handler.process') {
            if (!this._verified && ChatServer.config.verifyEnable) {
                log.error('EMIT', 'emit #' + emitNum + ' — handler.process before TEA verify');
                log.alwaysDetails([
                    ['🎯', 'action', actionName],
                    ['🆔', 'socketId', this.id],
                    ['💡', 'hint', 'TEA handshake must complete first']
                ]);
                return;
            }

            var self = this;
            var delay = ChatServer.randomDelay();

            setTimeout(function () {
                if (!self.connected) {
                    log.error('EMIT', 'emit #' + emitNum + ' FAILED — socket disconnected');
                    log.alwaysDetails([
                        ['🎯', 'action', actionName],
                        ['🆔', 'socketId', self.id],
                        ['💡', 'hint', 'Client may hang waiting for response']
                    ]);
                    return;
                }

                if (!data || typeof data !== 'object') {
                    log.error('EMIT', 'emit #' + emitNum + ' — invalid data');
                    log.alwaysDetails([
                        ['📝', 'dataType', typeof data],
                        ['🎯', 'action', actionName],
                        ['🆔', 'socketId', self.id]
                    ]);
                    return;
                }

                // ── Action: SATU BESAR BOX dengan Group DI DALAM! ──
                log.header('EMIT', actionName);
                
                log.boxHeader('⚡ EMIT #' + emitNum + ' ► ' + actionName);
                log.boxItem('#️⃣', 'Emit #', String(emitNum));
                log.boxItem('📋', 'Type', typeName);
                log.boxItem('🔢', 'Fields', String(Object.keys(data).length));
                
                // Group DI DALAM box!
                console.groupCollapsed('  ▸ 📥 Request & Response details');
                
                var reqPairs = [];
                var reqKeys = Object.keys(data);
                for (var k = 0; k < reqKeys.length; k++) {
                    var rk = reqKeys[k];
                    var rv = String(data[rk]);
                    if (rv.length > 120) rv = rv.substring(0, 120) + '... (' + String(data[rk]).length + ' chars)';
                    reqPairs.push(['📝', rk, rv]);
                }
                
                // details() OTOMATIS ada boxHeader/boxClose!
                log.details(reqPairs);

                var routeStart = Date.now();

                ChatServer.router.dispatch(data, function (responseData) {
                    var routeDuration = Date.now() - routeStart;
                    var totalDuration = Date.now() - emitStartTime;

                    var dataStr;
                    try {
                        dataStr = JSON.stringify(responseData !== undefined && responseData !== null ? responseData : {});
                    } catch (e) {
                        dataStr = '{}';
                    }

                    var envelope = {
                        ret: 0,
                        data: dataStr,
                        compress: false,
                        serverTime: ChatServer.nowTimestamp(),
                        server0Time: Math.abs(new Date().getTimezoneOffset()) * 60 * 1000
                    };

                    // details() OTOMATIS ada boxHeader/boxClose!
                    log.details([
                        ['🎯', 'dispatched', 'actions/' + actionName + '.js'],
                        ['📋', 'ret', String(envelope.ret)],
                        ['📄', 'data', envelope.data.substring(0, 300) + (envelope.data.length > 300 ? '... (' + envelope.data.length + ' chars)' : '')],
                        ['🗜️', 'compress', String(envelope.compress)],
                        ['🕐', 'serverTime', String(envelope.serverTime)],
                        ['⏱️', 'routeTime', routeDuration + 'ms'],
                        ['⏳', 'scheduleDelay', delay + 'ms'],
                        ['🕐', 'total', totalDuration + 'ms']
                    ]);

                    console.groupEnd(); // End group
                    log.boxClose(); // End main box

                    if (typeof callback === 'function') {
                        try {
                            callback(envelope);
                        } catch (cbErr) {
                            log.error('environment', 'emit #' + emitNum + ' callback THREW ERROR');
                            log.alwaysDetails([
                                ['❌', 'errorName', cbErr.name || '(unknown)'],
                                ['📝', 'errorMessage', cbErr.message || String(cbErr)]
                            ]);
                        }
                    } else {
                        log.error('environment', 'emit #' + emitNum + ' — NO CALLBACK PROVIDED');
                        log.alwaysDetails([
                            ['🎯', 'action', actionName],
                            ['💡', 'hint', 'Game may hang waiting for response']
                        ]);
                    }

                    ChatServer.currentSocket = null;
                });
            }, delay);
            return;
        }

        // ── Unknown event ──
        log.warn('EMIT', 'emit #' + emitNum + ' — unhandled event: "' + event + '"');
        log.alwaysDetails([
            ['🎧', 'event', event],
            ['🎯', 'action', actionName],
            ['✅', 'expected', 'verify, handler.process'],
            ['🆔', 'socketId', this.id]
        ]);
    };

    ChatSocket.prototype.disconnect = function () {
        var hadListeners = Object.keys(this._listeners).length;
        this.connected = false;
        this.disconnected = true;
        this._verified = false;
        ChatServer.socketLeaveAllRooms(this);
        this._fire('disconnect', 'client disconnect');
        log.info('connection', 'ChatSocket #' + this._counter + ' disconnected');
        log.details([
            ['🆔', 'socketId', this.id],
            ['#️⃣', 'totalEmits', String(this._emitCount)],
            ['👂', 'remainingListeners', String(hadListeners)]
        ]);
    };

    ChatSocket.prototype.destroy = function () {
        var hadListeners = Object.keys(this._listeners).length;
        this.connected = false;
        this.disconnected = true;
        this._verified = false;
        ChatServer.socketLeaveAllRooms(this);
        this._listeners = {};
        log.info('connection', 'ChatSocket #' + this._counter + ' destroyed');
        log.details([
            ['🆔', 'socketId', this.id],
            ['#️⃣', 'totalEmits', String(this._emitCount)],
            ['🧹', 'clearedListeners', String(hadListeners)]
        ]);
    };

    ChatSocket.prototype._fire = function (event) {
        var args = Array.prototype.slice.call(arguments, 1);
        var list = this._listeners[event];

        if (!list || list.length === 0) return;

        for (var i = 0; i < list.length; i++) {
            try {
                list[i].apply(null, args);
            } catch (e) {
                log.error('connection', '_fire: listener #' + (i + 1) + ' for "' + event + '" threw error');
                log.alwaysDetails([
                    ['❌', 'errorName', e.name || '(unknown)'],
                    ['📝', 'errorMessage', e.message || String(e)],
                    ['🎧', 'event', event],
                    ['#️⃣', 'listenerIndex', String(i + 1)]
                ]);
            }
        }
    };

    ChatServer.ChatSocket = ChatSocket;
    window.ChatServer = ChatServer;

    // ═══════════════════════════════════════════════════════════════════
    // 8. INIT — io.connect override
    // ═══════════════════════════════════════════════════════════════════
    // Patch io.connect() untuk intercept chat-server URL.
    // Chat URL bersifat DYNAMIC — datang dari main-server via registChat.
    // Intercept berdasarkan: port 8002 atau chatServerUrl dari config.

    function init() {
        var chatServerUrl = ChatServer.config.chatServerUrl;
        var patched = false;

        function isChatUrl(url) {
            if (!url) return false;
            if (url.indexOf(':8002') !== -1) return true;
            if (url.indexOf(chatServerUrl) !== -1) return true;
            return false;
        }

        function patchIoConnect() {
            if (patched) return;
            if (!window.io || typeof window.io.connect !== 'function') return false;

            // Simpan reference ke CURRENT io.connect (bisa sudah di-patch login-server)
            var currentConnect = window.io.connect;
            patched = true;

            window.io.connect = function (url, options) {
                if (isChatUrl(url)) {
                    // ── IO Ready dengan SATU BESAR BOX! ──
                    log.header('IO', '✅ READY');
                    
                    log.boxHeader('🌐 IO CONNECTION');
                    log.boxItem('🔗', 'URL', url);
                    log.boxItem('🔐', 'Verify', 'on');
                    log.boxItem('📋', 'Routing', 'type=chat routing');
                    log.boxItem('💻', 'Return', 'ChatSocket');
                    
                    // Group DI DALAM box!
                    console.groupCollapsed('  ▸ ⚙️ Full configuration details');
                    
                    log.boxHeader('⚙️ CONFIGURATION');
                    log.boxItem('🔗', 'serverUrl', url);
                    log.boxItem('🔒', 'verifyEnable', 'true');
                    log.boxItem('🔑', 'teaKey', ChatServer.config.teaKey);
                    log.boxItem('🔀', 'routing', 'type=chat → action dispatch');
                    log.boxItem('📦', 'returnType', 'ChatSocket');
                    log.boxClose();
                    
                    console.groupEnd(); // End group
                    log.boxClose(); // End main box

                    return new ChatServer.ChatSocket();
                }

                return currentConnect.call(window.io, url, options);
            };

            log.info('TIMER', 'io.connect() patched — CHAT SERVER READY');
            return true;
        }

        // ── Poll for window.io ──
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
            if (patchIoConnect()) clearInterval(pollTimer);
        }, 100);

        // ── MutationObserver fallback ──
        if (typeof MutationObserver !== 'undefined') {
            var observer = new MutationObserver(function () {
                if (!patched && window.io && typeof window.io.connect === 'function') {
                    log.info('TIMER', 'MutationObserver detected window.io');
                    patchIoConnect();
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
