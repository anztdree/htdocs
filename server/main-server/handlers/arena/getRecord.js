/**
 * handlers/arena/getRecord.js — Arena Record List Handler (FIX B2)
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 *  KONTRAK CLIENT (verbatim main.min.js):
 * ============================================================
 *
 *  CALL SITE @5836654 (ArenaMain recordBtnTabTap):
 *    ts.processHandler({type:"arena",action:"getRecord",
 *                       userId:..., version:"1.0"},
 *      function(e){ ts.openWindow("ArenaRecord",{parent:"arena",value:e}) })
 *
 *  ArenaRecordViewData.initList @ArenaRecord area:
 *    var t = e.params.value, n = t._record;
 *    for (var o = n.length - 1; o >= 0; o--) e.ArenaRecordList.push({item:n[o]})
 *    → client loop DARI BELAKANG → elemen TERAKHIR array tampil PALING ATAS.
 *    → server push record baru ke BELAKANG array (FIFO, terbaru di ekor).
 *
 *  ArenaRecordListItem (initValue/initBattleInfo/initLastTime):
 *    item._nickName   → label nama lawan
 *    item._rank       → label rank
 *    item._headImage  → ViewCommon.setHeadItem(headItem, _headImage, _level)
 *    item._level      → head item level
 *    item._result     → 1=wudaohuixinnew27(win), 2=new38(lose),
 *                       3=new29, 4=new28  (playback: 2/4 → LOSE endType)
 *    item._battleId   → playback: BattleCallBack.arenaRecordBattle(...)
 *    item._start      → "x menit lalu" (Date.now() - _start)
 *
 * ============================================================
 *  SUMBER DATA:
 * ============================================================
 *  savedData._arenaRecords — diisi arena/startBattle.js (FIX B2).
 *  Setiap entri: {_battleId,_nickName,_rank,_headImage,_level,
 *                 _result,_start,_detail:{...}}
 *  Handler ini MENGIRIM field tampilan SAJA (tanpa _detail) — detail
 *  diambil terpisah via arena/getBattleRecord saat playback.
 *  Maks 20 entri (dipotong FIFO oleh startBattle.js).
 *
 * ============================================================
 *  RESPONSE FORMAT:
 * ============================================================
 *  { _record: [ { _nickName, _rank, _headImage, _level,
 *                 _result, _battleId, _start }, ... ] }
 *  Kosong → { _record: [] } (client menampilkan list kosong, aman)
 * ============================================================
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    var RET_CODES = {
        OK: 0,
        MISSING_USERID: 10001,
        USER_NOT_FOUND: 10003,
        SERVER_ERROR: 99999
    };

    function buildError(code, msg) {
        return { ret: code, msg: msg || 'Error' };
    }

    function handleArenaGetRecord(request, callback) {
        var userId = request.userId;

        log.info('ARENA_GETRECORD', 'arena/getRecord processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['version', request.version || '-']
        ]);

        try {
            if (!userId) {
                log.warn('ARENA_GETRECORD', 'missing userId');
                callback(buildError(RET_CODES.MISSING_USERID, 'userId tidak boleh kosong'), RET_CODES.MISSING_USERID);
                return;
            }

            var savedData = db._get('user:' + userId);
            if (!savedData) {
                log.warn('ARENA_GETRECORD', 'user not found: ' + userId);
                callback(buildError(RET_CODES.USER_NOT_FOUND, 'User tidak ditemukan'), RET_CODES.USER_NOT_FOUND);
                return;
            }

            var records = Array.isArray(savedData._arenaRecords) ? savedData._arenaRecords : [];

            // Kirim field tampilan saja — _detail TIDAK dikirim (payload kecil)
            var out = [];
            for (var i = 0; i < records.length; i++) {
                var r = records[i];
                if (!r) continue;
                out.push({
                    _battleId: r._battleId,
                    _nickName: r._nickName || '???',
                    _rank: Number(r._rank) || 0,
                    _headImage: r._headImage || '',
                    _level: Number(r._level) || 1,
                    _result: Number(r._result) || 1,
                    _start: Number(r._start) || 0
                });
            }

            log.info('ARENA_GETRECORD', 'record list ready — total=' + out.length);

            callback({ _record: out });

        } catch (err) {
            log.error('ARENA_GETRECORD', 'arena/getRecord UNCAUGHT ERROR', err);
            callback(buildError(RET_CODES.SERVER_ERROR, err.message || 'Unknown error'), RET_CODES.SERVER_ERROR);
        }
    }

    MainServer.registerHandler('arena', 'getRecord', handleArenaGetRecord);

    window.MainServer = MainServer;
})();
