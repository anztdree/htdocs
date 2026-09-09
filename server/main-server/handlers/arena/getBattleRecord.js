/**
 * handlers/arena/getBattleRecord.js — Arena Battle Playback Handler (FIX B2)
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 *  KONTRAK CLIENT (verbatim main.min.js @2191128):
 * ============================================================
 *
 *  REQUEST (arenaRecordBattle):
 *    ts.processHandler({type:"arena",action:"getBattleRecord",
 *        userId:..., battleId:t, version:"1.0",
 *        battleField:BattleLogic.GameFieldType.ARENA}, function(r){...})
 *
 *  CALLBACK (verbatim):
 *    var i = r._record._recordData;                    // string (log "录像：")
 *    var s = r._record._leftTeam;                      // OBJECT keyed posisi
 *    for (var u in s) { var c = new BattleTeam(s[u]); l[u] = c.primaryData }
 *    var g = r._record._leftSuperSkill;                // ARRAY {_id,_level}
 *    for (m=0; m<g.length; m++) { p.push(g[m]._id); d.push(g[m]._level) }
 *    var h = r._record._rightTeam;                     // OBJECT keyed posisi
 *    (idem BattleTeam)
 *    var v = r._record._rightSuperSkill;               // ARRAY {_id,_level}
 *    RunSceneWithBattle.battleWithPVPAndRecord(
 *        l, p, I, n, f, v, r._record._rand, ...)
 *
 *  battleWithPVPAndRecord (verbatim):
 *    initLeftTeamWithoutBoss(e=leftTeam, t=leftSuperIds, a=rightTeam,
 *                            r=rightSuperIds, void 0, p=leftSuperLevels)
 *    → super skill playback dari ARRAY ID + ARRAY LEVEL.
 *
 *  BattleTeam constructor @3085782 (verbatim):
 *    - _attrs._items → attrItems (ALL entries; playback override HP dgn
 *      currentHp saat battle — server kirim _num FULL = FullHealth)
 *    - field common (string/number/boolean) → teamHeroItem
 *      (_heroDisplayId, _heroLevel, _heroStar, _skinId,
 *       _weaponHaloId, _weaponHaloLevel, ...)
 *    - SKILL TIDAK dibaca dari entry — dibangun client dari hero.json
 *      (normal=lv1, super=lv _superSkillLevel, skill=max(1,_fixSkillLevel))
 *      → untuk robot: cukup _heroDisplayId + _heroLevel + _heroStar + _attrs.
 *
 * ============================================================
 *  SUMBER DATA:
 * ============================================================
 *  savedData._arenaRecords[i]._detail — diisi arena/startBattle.js (FIX B2):
 *    {_recordData, _leftTeam, _leftSuperSkill, _rightTeam,
 *     _rightSuperSkill, _rand}
 *
 * ============================================================
 *  RESPONSE FORMAT:
 * ============================================================
 *  { _record: {
 *      _recordData: string,
 *      _leftTeam:        { "0": entry, "1": entry, ... },
 *      _leftSuperSkill:  [ {_id,_level}, ... ],
 *      _rightTeam:       { "0": entry, ... },
 *      _rightSuperSkill: [ {_id,_level}, ... ],
 *      _rand: [ ... ]
 *  } }
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
        RECORD_NOT_FOUND: 20021,
        SERVER_ERROR: 99999
    };

    function buildError(code, msg) {
        return { ret: code, msg: msg || 'Error' };
    }

    function handleArenaGetBattleRecord(request, callback) {
        var userId = request.userId;
        var battleId = request.battleId;

        log.info('ARENA_PLAYBACK', 'arena/getBattleRecord processing');
        log.details('request', [
            ['userId', userId || '-'],
            ['battleId', battleId || '-'],
            ['battleField', request.battleField != null ? String(request.battleField) : '-']
        ]);

        try {
            if (!userId) {
                log.warn('ARENA_PLAYBACK', 'missing userId');
                callback(buildError(RET_CODES.MISSING_USERID, 'userId tidak boleh kosong'), RET_CODES.MISSING_USERID);
                return;
            }

            if (!battleId) {
                log.warn('ARENA_PLAYBACK', 'missing battleId');
                callback(buildError(RET_CODES.RECORD_NOT_FOUND, 'battleId tidak boleh kosong'), RET_CODES.RECORD_NOT_FOUND);
                return;
            }

            var savedData = db._get('user:' + userId);
            if (!savedData) {
                log.warn('ARENA_PLAYBACK', 'user not found: ' + userId);
                callback(buildError(RET_CODES.USER_NOT_FOUND, 'User tidak ditemukan'), RET_CODES.USER_NOT_FOUND);
                return;
            }

            var records = Array.isArray(savedData._arenaRecords) ? savedData._arenaRecords : [];

            // Cari record by battleId — terbaru duluan (dari ekor array)
            var found = null;
            for (var i = records.length - 1; i >= 0; i--) {
                var r = records[i];
                if (r && String(r._battleId) === String(battleId)) { found = r; break; }
            }

            if (!found || !found._detail) {
                log.warn('ARENA_PLAYBACK', 'record not found battleId=' + battleId);
                callback(buildError(RET_CODES.RECORD_NOT_FOUND, 'Record battle tidak ditemukan'), RET_CODES.RECORD_NOT_FOUND);
                return;
            }

            var d = found._detail;

            var response = {
                _record: {
                    _recordData: d._recordData || ('arena:' + battleId),
                    _leftTeam: d._leftTeam || {},
                    _leftSuperSkill: Array.isArray(d._leftSuperSkill) ? d._leftSuperSkill : [],
                    _rightTeam: d._rightTeam || {},
                    _rightSuperSkill: Array.isArray(d._rightSuperSkill) ? d._rightSuperSkill : [],
                    _rand: Array.isArray(d._rand) ? d._rand : []
                }
            };

            log.info('ARENA_PLAYBACK', 'record ready — battleId=' + battleId +
                ' left=' + Object.keys(response._record._leftTeam).length +
                ' right=' + Object.keys(response._record._rightTeam).length +
                ' supers=' + response._record._leftSuperSkill.length +
                ' rand=' + response._record._rand.length);

            callback(response);

        } catch (err) {
            log.error('ARENA_PLAYBACK', 'arena/getBattleRecord UNCAUGHT ERROR', err);
            callback(buildError(RET_CODES.SERVER_ERROR, err.message || 'Unknown error'), RET_CODES.SERVER_ERROR);
        }
    }

    MainServer.registerHandler('arena', 'getBattleRecord', handleArenaGetBattleRecord);

    window.MainServer = MainServer;
})();
