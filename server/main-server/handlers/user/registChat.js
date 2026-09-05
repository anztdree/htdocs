/**
 * handlers/user/registChat.js — RegistChat Handler
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 * HANDLER: user/registChat
 * ============================================================
 *
 * Client call: processHandler({type:'user',action:'registChat',userId,version:'1.0'}, cb)
 *
 * v3 FIX:
 *   Chat server URL boleh _success:true karena index.js v3 sudah
 *   io.connect :8002 diarahkan ke chat-server.
 *   Tapi HAPUS _guildRoomId dan _teamChatRoom yang tidak pernah
 *   dikirim server asli (bukti dari HAR).
 *
 * HAR evidence (1 sample):
 *   Response fields: type, action, userId, version, _chatServerUrl,
 *                    _worldRoomId, _teamDungeonChatRoom, _success
 *   TIDAK ada: _guildRoomId, _teamChatRoom
 *
 * Client mapping (L114470):
 *   n._success               → if (n._success) { ... } else { retry }
 *   n._chatServerUrl         → ts.loginInfo.serverItem.chaturl
 *   n._worldRoomId           → ts.loginInfo.serverItem.worldRoomId
 *   n._guildRoomId           → (TIDAK di-read dari response, tapi dari enterGame)
 *   n._teamDungeonChatRoom   → ts.loginInfo.serverItem.teamDungeonChatRoom
 *   n._teamChatRoom          → (TIDAK di-read dari response)
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    if (!MainServer.handlers.user) {
        MainServer.handlers.user = {};
    }

    function handleRegistChat(request, callback) {
        var _logT0 = Date.now();
        
        var userId = request.userId;

        var _validationChecks = [];
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');

        log.info('HANDLER', 'registChat processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['version', request.version || '-']
        ]);

        try {
            if (!userId) {
                _validationChecks.push({ check: 'userId', status: '❌ FAIL', info: 'Missing userId' });
                console.table(_validationChecks);
                console.groupEnd();
                log.error('HANDLER', 'Missing userId in registChat request');

                var _elapsedErr = Date.now() - _logT0;
                console.log('%c📤 Response', 'color:#1565C0;font-weight:bold;', '| ⏱️ ' + _elapsedErr + 'ms | ❌ FAIL');

                callback({ _success: false });
                return;
            }
            _validationChecks.push({ check: 'userId', status: '✅ OK', info: userId });
            console.table(_validationChecks);
            console.groupEnd();

            // ── CHAT CONFIG BUILD ──
            console.groupCollapsed('%c📡 Chat Config Build', 'color:#6A1B9A;font-weight:bold;');
            var _configSteps = [];

            var serverId = request.serverId || 1;

            // Room IDs — worldRoomId WAJIB non-empty (tanpa guard di chat join)
            // teamDungeonChatRoom ada guard → boleh empty
            var worldRoomId = 'world_' + serverId;
            var teamDungeonChatRoom = 'teamdungeon_' + serverId;

            _configSteps.push({ step: 'serverId', status: '✅ OK', value: serverId });
            _configSteps.push({ step: 'worldRoomId', status: '✅ OK', value: worldRoomId });
            _configSteps.push({ step: 'teamDungeonChatRoom', status: '✅ OK', value: teamDungeonChatRoom });
            console.table(_configSteps);
            console.groupEnd();

            // v3: response sesuai HAR — tidak kirim _guildRoomId dan _teamChatRoom
            var responseData = {
                type: request.type,
                action: request.action,
                userId: userId,
                version: request.version || '1.0',
                _success: true,
                _chatServerUrl: MainServer.config.chatServerUrl,
                _worldRoomId: worldRoomId,
                _teamDungeonChatRoom: teamDungeonChatRoom
            };

            // ── RESPONSE BUILD ──
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');

            log.info('HANDLER', 'registChat success');
            log.details('response', [
                ['_success', 'true'],
                ['_chatServerUrl', responseData._chatServerUrl],
                ['_worldRoomId', responseData._worldRoomId],
                ['_teamDungeonChatRoom', responseData._teamDungeonChatRoom]
            ]);

            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ Elapsed: ' + _elapsed + 'ms');
            console.log('   · 💬 _success: true');
            console.log('   · 🌐 _chatServerUrl: ' + responseData._chatServerUrl);
            console.log('   · 🏠 _worldRoomId: ' + worldRoomId);
            console.log('   · 👥 _teamDungeonChatRoom: ' + teamDungeonChatRoom);
            console.groupEnd();

            callback(responseData);

        } catch (err) {
            console.error('   ❌ Error: ' + err.message);
            console.groupEnd();
            log.error('HANDLER', 'registChat UNCAUGHT ERROR', err);
            callback({ _success: false });
        }
    }

    MainServer.registerHandler('user', 'registChat', handleRegistChat);

    window.MainServer = MainServer;
})();