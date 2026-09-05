/**
 * handlers/userMsg/getMsgList.js — Friend Message List (Same-Server)
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * HANDLER: userMsg/getMsgList
 * ============================================================
 *
 * Client call (main.min.js L186590-186601):
 *   ts.processHandler({
 *     type: 'userMsg',
 *     action: 'getMsgList',
 *     userId: a,
 *     version: '1.0'
 *   }, function (t) {
 *     MailInfoManager.getInstance().setMessageFriendSimpleList(t._brief);
 *     e.updateUI();
 *   })
 *
 * Dipanggil saat:
 *   1. Buka tab "Friend" di Mail window (L186588)
 *   2. Setelah login/enterGame sukses (L236726-236731)
 *
 * Response di-consume oleh MailInfoManager.setMessageFriendSimpleList()
 * (main.min.js L121134-121145):
 *   for (var n in e) {
 *       var o = new UserMessageFriendSimpleItem();
 *       e[n].lastMsgTime && (o.lastMsgTime = e[n].lastMsgTime);
 *       e[n].lastReadTime && (o.lastReadTime = e[n].lastReadTime);
 *       o.msg = e[n].msg;
 *       o.userInfo.deserialize(e[n].userInfo);  // ← UserSimpleInfo
 *       t.messageFriendSimpleItemList[n] = o;
 *   }
 *
 * UserSimpleInfo.deserialize() (L130778-130782):
 *   for (var t in e) {
 *       var n = e[t];
 *       this.isCommonType(n) && (this[t.substring(1)] = n);
 *   }
 *   → fields dengan underscore di-strip: _nickName → nickName
 *
 * UserMessageFriendSimpleItem (L121294-121303):
 *   lastMsgTime: 0,
 *   lastReadTime: 0,
 *   msg: '',
 *   userInfo: new UserSimpleInfo()
 *
 * ============================================================
 * DATA SOURCE
 * ============================================================
 *
 * localStorage: userMsg:{userId}
 *   {
 *     messages: {
 *       [friendId]: [{ _time, _isSelf, _context, _type }]
 *     },
 *     readTimes: {
 *       [friendId]: timestamp
 *     }
 *   }
 *
 * Profile teman dibaca dari: user:{friendId}
 *   (savedData.user._nickName, .user._headImage, dll)
 *
 * ============================================================
 * RESPONSE
 * ============================================================
 * {
 *   _brief: {
 *     "friendId_1": {
 *       lastMsgTime: 1717400000000,
 *       lastReadTime: 1717400000000,
 *       msg: "preview text...",
 *       userInfo: {
 *         _nickName: "PlayerName",
 *         _headImage: "hero_icon_1205",
 *         _headEffect: 0,
 *         _headBox: 0,
 *         _level: 50,
 *         _oriServerId: 1,
 *         _serverId: 1,
 *         _vip: 0
 *       }
 *     }
 *   }
 * }
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    if (!MainServer.handlers.userMsg) {
        MainServer.handlers.userMsg = {};
    }

    // ================================================================
    // HELPER: Get user message data
    // ================================================================

    /**
     * Get message data for a user.
     * Initialize if not exists.
     */
    function getMsgData(userId) {
        var key = 'userMsg:' + userId;
        var data = db._get(key);

        if (!data) {
            data = {
                messages: {},
                readTimes: {}
            };
            db._set(key, data);
        }

        return data;
    }

    // ================================================================
    // HELPER: Get friend's userInfo for brief
    // ================================================================

    /**
     * Get friend's UserSimpleInfo-compatible object.
     * Reads from user:{friendId} (saved by enterGame).
     *
     * Fields use underscore prefix because client's deserialize()
     * strips the first character: _nickName → nickName
     */
    function getFriendUserInfo(friendId) {
        var storageKey = 'user:' + friendId;
        var userData = db._get(storageKey);

        if (userData && userData.user) {
            return {
                _nickName: userData.user._nickName || 'Player',
                _headImage: userData.user._headImage || 'hero_icon_1205',
                _headEffect: (userData.user._headEffect || 0),
                _headBox: (userData.user._headBox || 0),
                _level: (userData.level || 1),
                _oriServerId: (userData.user._oriServerId || 1),
                _serverId: 1,
                _vip: (userData.vip || 0)
            };
        }

        // Fallback default profile
        return {
            _nickName: 'Player',
            _headImage: 'hero_icon_1205',
            _headEffect: 0,
            _headBox: 0,
            _level: 1,
            _oriServerId: 1,
            _serverId: 1,
            _vip: 0
        };
    }

    // ================================================================
    // HANDLER: userMsg/getMsgList
    // ================================================================

    /**
     * handleGetMsgList(request, callback)
     *
     * Mengirim daftar ringkas conversation (friend mail list).
     * Setiap entry berisi: lastMsgTime, lastReadTime, preview msg, dan userInfo teman.
     *
     * @param {object} request
     *   { type:'userMsg', action:'getMsgList', userId, version:'1.0' }
     *
     * @param {function} callback
     *   callback(responseData)
     */
    function handleGetMsgList(request, callback) {

        var _logT0 = Date.now();

        // ═══════════════════════════════════════════════════════════
        //  HEADER
        // ═══════════════════════════════════════════════════════════
        console.groupCollapsed('%c📨 USERMSG getMsgList', 'color:#546E7A;font-weight:bold;font-size:11px;background:#ECEFF1;padding:3px 8px;border-radius:4px;border-left:3px solid #546E7A;');
        console.log('   📦 version: ' + (request.version || '-'));

        var userId = request.userId;

        log.info('HANDLER', 'userMsg/getMsgList processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['version', request.version || '-']
        ]);

        try {
            // ═══════════════════════════════════════════════════════════
            //  ✅ VALIDATION
            // ═══════════════════════════════════════════════════════════
            console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
            var _validationChecks = [
                { check: 'userId', result: userId ? '✅ OK' : '❌ MISSING' }
            ];
            console.table(_validationChecks);

            // ── Validasi userId ──
            if (!userId) {
                log.error('HANDLER', 'Missing userId in userMsg/getMsgList');
                console.warn('   ❌ Missing userId → returning empty _brief');
                console.groupEnd(); // close validation

                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsedErr = Date.now() - _logT0;
                console.log('   ⏱️  Elapsed: ' + _elapsedErr + 'ms');
                console.log('   📤 Response: { _brief: {} } (error fallback)');
                console.groupEnd();
                console.groupEnd(); // close main header

                callback({ _brief: {} });
                return;
            }
            console.log('   ✅ userId validated');
            console.groupEnd();

            // ═══════════════════════════════════════════════════════════
            //  🔧 PROCESSING — Build Friend Message Brief List
            // ═══════════════════════════════════════════════════════════
            console.groupCollapsed('%c🔧 Processing — Build Brief List', 'color:#0277BD;font-weight:bold;');

            // ── Step 1: Baca message data ──
            var data = getMsgData(userId);
            var messages = data.messages || {};
            var readTimes = data.readTimes || {};
            var brief = {};

            console.log('   📂 Messages loaded, conversations: ' + Object.keys(messages).length);

            // ── Step 2: Build brief untuk setiap conversation ──
            for (var friendId in messages) {
                var msgs = messages[friendId];

                // Skip conversation kosong
                if (!msgs || msgs.length === 0) {
                    continue;
                }

                var lastMsg = msgs[msgs.length - 1];
                var preview = '';

                if (lastMsg._context) {
                    // Preview: ambil awal konten, max 10 bytes (Chinese ~10 chars)
                    preview = String(lastMsg._context);
                    // Client pakai ToolCommon.getXXByteLengthInStr(n._context, 10)
                    // untuk truncate. Kita cukup potong sederhana.
                    if (preview.length > 20) {
                        preview = preview.substring(0, 20) + '...';
                    }
                }

                brief[friendId] = {
                    lastMsgTime: lastMsg._time || 0,
                    lastReadTime: readTimes[friendId] || 0,
                    msg: preview,
                    userInfo: getFriendUserInfo(friendId)
                };
            }

            // ── Log hasil ──
            log.info('HANDLER', 'userMsg/getMsgList success');
            log.details('response', [
                ['conversationCount', String(Object.keys(brief).length)]
            ]);

            console.log('   ✅ Brief list built:');
            console.log('      • Conversations: ' + Object.keys(brief).length);

            var briefKeys = Object.keys(brief);
            for (var i = 0; i < briefKeys.length; i++) {
                var k = briefKeys[i];
                var entry = brief[k];
                log.details('brief[' + k + ']', [
                    ['lastMsgTime', String(entry.lastMsgTime)],
                    ['lastReadTime', String(entry.lastReadTime)],
                    ['msg', '"' + entry.msg + '"'],
                    ['userInfo._nickName', entry.userInfo._nickName]
                ]);
            }

            console.groupEnd(); // close processing

            // ═══════════════════════════════════════════════════════════
            //  📤 RESPONSE BUILD & AUDIT
            // ═══════════════════════════════════════════════════════════
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️  Elapsed: ' + _elapsed + 'ms');
            console.log('   📤 Response._brief keys: ' + Object.keys(brief).length);
            console.log('   💬 Conversations: ' + Object.keys(brief).length);
            console.groupEnd();

            console.groupEnd(); // close main header

            // ── Step 3: Kirim response ──
            callback({ _brief: brief });

        } catch (err) {
            log.error('HANDLER', 'userMsg/getMsgList UNCAUGHT ERROR', err);
            console.error('   💥 UNCAUGHT ERROR:', err);

            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsedCatch = Date.now() - _logT0;
            console.log('   ⏱️  Elapsed: ' + _elapsedCatch + 'ms');
            console.log('   📤 Response: { _brief: {} } (error catch)');
            console.groupEnd();
            console.groupEnd(); // close main header

            callback({ _brief: {} });
        }
    }

    // ================================================================
    // REGISTER
    // ================================================================

    MainServer.registerHandler('userMsg', 'getMsgList', handleGetMsgList);

    window.MainServer = MainServer;
})();
