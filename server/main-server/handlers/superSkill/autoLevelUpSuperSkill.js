/**
 * handlers/superSkill/autoLevelUpSuperSkill.js
 *
 * Request:  { type:"superSkill", action:"autoLevelUpSuperSkill", userId, skillId:"1120561", times:999, version:"1.0" }
 * Response (ada progres): {
 *   _changeInfo: { _items: { "134": { _id:134, _num:<ABSOLUTE_BALANCE> } } },
 *   _skill: { _skillId, _level:<final>, _needEvolve, _totalCost:{_items:{...kumulatif...}} }
 * }
 * Response (0 progres, item kurang): { _openType: 2 }   // OPEN_TIPS
 * Response (0 progres, lainnya):     {}                 // silent
 *
 * ============================================================
 * ANALYSIS EVIDENCE (main.min.js):
 * ============================================================
 *
 * [CALL SITE] aKeyLevelUpBtnTap (tombol "AKey"/one-key level up):
 *   var r = SuperSkillSingleton.getInstance().getSuperLevelUP(n.superConfig.quality, t.superskillLevel);
 *   if (!r) return void Logger("没有该等级("+t.superskillLevel+")的超必杀升级配置表");
 *   if (t.superskillLevel >= SuperSkillSingleton.getInstance().getSuperSkillMaxLevel(o.quality))
 *     return void ts.openWindow("BarTypeTips", {... "SuperSkillMain","id4" (MAX)});
 *   var s = (r.costNum <= ItemsCommonSingleton.getInstance().getItemNum(r.costID), 999);
 *     // ⚠ COMMA OPERATOR — hasil cek balance DIBUANG, s SELALU 999!
 *     // → client percayakan ke server: habiskan balance / mentok evolve / max level
 *   ts.processHandler({type:"superSkill",action:"autoLevelUpSuperSkill",
 *       userId:l, skillId:n.superSkillID, times:s, version:"1.0"},
 *     function(t){
 *       t._openType == TimeLimitBonus.OPEN_TIME_BONUS
 *         ? Logger.serverDebugLog("道具不足,需要弹限时礼包")
 *         : t._openType == TimeLimitBonus.OPEN_TIPS && UIWindowManager.openMoneyNotEnough(r.costID.toString()),
 *       if (t._changeInfo) {
 *         UIWindowManager.openCongratulationObtain(t);
 *         var n = SuperSkillSingleton.getInstance().changeSuperSkill(t._skill);
 *         e.myData.changeSuperSkillData(n), e.loadSuperSkillMainUI(), e.showSkillUpEffect(e.skillIcon)
 *       }
 *     })
 *
 * [TimeLimitBonus / TimeBonusOpenType enum]: OPEN_TIME_BONUS=1, OPEN_TIPS=2
 *   → _openType=1 → client hanya log (promo pack — tidak diimplementasi server
 *     karena tidak ada bukti sistem pack utk item 134; pilih 2 = dialog "kurang")
 *   → _openType=2 → client openMoneyNotEnough(costID) memakai costID milik
 *     client sendiri (r.costID dari row level saat request) → server cukup kirim flag.
 *
 * [Kontrak _changeInfo / _skill] — identik levelUpSuperSkill:
 *   _changeInfo._items = balance ABSOLUT setelah semua pemotongan
 *   _skill 4 field (_skillId/_level/_needEvolve/_totalCost kumulatif penuh —
 *   changeSuperSkillLevel → totalCost.changeItems REPLACE per item id)
 *
 * [LOGIKA LOOP] — mirror levelUpSuperSkill per iterasi:
 *   - berhenti bila times habis / max level / needEvolve (threshold superEvolve)
 *     / config row hilang / balance kurang
 *   - cost row = getSuperLevelUP(quality, levelSAAT-INI) → {costID:134, costNum}
 *   - level baru == evolveLevel (superEvolve.json) → _needEvolve=true → berhenti
 *   - item kurang DI TENGAH jalan → berhenti, kirim progres yang sudah jalan
 *
 * [TASK PROGRESS] — sama dgn levelUpSuperSkill.js (task 6016 superLevelUp),
 *   dicek SEKALI setelah loop; Notify "mainTaskChange" bila state berubah.
 * [Error pattern]: callback({}, 1) untuk error keras (pola seluruh repo)
 * ============================================================
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    if (!MainServer.handlers.superSkill) {
        MainServer.handlers.superSkill = {};
    }

    // ═══════════════════════════════════════════════════════════
    //  CONSTANTS & HELPERS
    // ═══════════════════════════════════════════════════════════

    // TimeBonusOpenType enum (main.min.js): NONE=0, OPEN_TIME_BONUS=1, OPEN_TIPS=2
    var OPEN_TIPS = 2;

    // TASK_STATE enum (main.min.js L62602-62605):
    //   DEFAULT=0, DOING=1, COMPLETE=2, FINISH=3
    var TASK_STATE = { DEFAULT: 0, DOING: 1, COMPLETE: 2, FINISH: 3 };

    function userStorageKey(userId) {
        return 'user:' + userId;
    }

    // ═══════════════════════════════════════════════════════════
    //  CONFIG LOADER (sync, cached)
    // ═══════════════════════════════════════════════════════════

    var _resourceCache = {};

    function loadJson(name) {
        if (_resourceCache[name]) return _resourceCache[name];
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './resource/json/' + name + '.json', false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                var data = JSON.parse(xhr.responseText);
                _resourceCache[name] = data;
                return data;
            }
            log.error('RESOURCE', 'superSkill/autoLevelUpSuperSkill failed to load: ' + name + '.json — HTTP ' + xhr.status);
        } catch (e) {
            log.error('RESOURCE', 'superSkill/autoLevelUpSuperSkill failed to load: ' + name + '.json — ' + e.message);
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  ITEM BALANCE HELPERS (same pattern as levelUpSuperSkill.js)
    // ═══════════════════════════════════════════════════════════

    function getItemBalance(savedData, itemId) {
        if (!savedData || !savedData.totalProps || !savedData.totalProps._items) return 0;
        var items = savedData.totalProps._items;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(itemId)) {
                return Number(items[i]._num) || 0;
            }
        }
        return 0;
    }

    function setItemBalance(savedData, itemId, newBalance) {
        if (!savedData.totalProps) savedData.totalProps = {};
        if (!savedData.totalProps._items) savedData.totalProps._items = [];
        var items = savedData.totalProps._items;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(itemId)) {
                items[i]._num = newBalance;
                return;
            }
        }
        items.push({ _id: Number(itemId), _num: newBalance });
    }

    // ═══════════════════════════════════════════════════════════
    //  FIND SKILL IN USER DATA (keys arbitrary — iterate semua entry)
    // ═══════════════════════════════════════════════════════════

    function findSkillInStorage(savedData, skillId) {
        if (!savedData || !savedData.superSkill || !savedData.superSkill._skills) return null;
        var skills = savedData.superSkill._skills;
        var numSkillId = Number(skillId);
        for (var k in skills) {
            if (!skills.hasOwnProperty(k)) continue;
            var entry = skills[k];
            if (entry._skillId === numSkillId || entry._skillId === skillId ||
                String(entry._skillId) === String(skillId)) {
                return { data: entry, key: k };
            }
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  LOOKUP HELPERS (identik levelUpSuperSkill.js)
    // ═══════════════════════════════════════════════════════════

    function getSuperLevelUP(superLevelUpConfig, quality, level) {
        for (var k in superLevelUpConfig) {
            if (!superLevelUpConfig.hasOwnProperty(k)) continue;
            var entry = superLevelUpConfig[k];
            if (entry.quality === quality && entry.superLevel === level) {
                return entry;
            }
        }
        return null;
    }

    function getSuperEvolveLevel(superEvolveConfig, quality, level) {
        for (var k in superEvolveConfig) {
            if (!superEvolveConfig.hasOwnProperty(k)) continue;
            var entry = superEvolveConfig[k];
            if (entry.quality === quality && entry.evolveLevel === level) {
                return entry;
            }
        }
        return null;
    }

    function getSuperSkillMaxLevel(superLevelUpConfig, quality) {
        var max = 0;
        for (var k in superLevelUpConfig) {
            if (!superLevelUpConfig.hasOwnProperty(k)) continue;
            var entry = superLevelUpConfig[k];
            if (entry.quality === quality && entry.superLevel > max) {
                max = entry.superLevel;
            }
        }
        return max;
    }

    // ═══════════════════════════════════════════════════════════
    //  TASK PROGRESS (same pattern as levelUpSuperSkill.js)
    // ═══════════════════════════════════════════════════════════

    function getTaskConfig(taskId) {
        var t = loadJson('task');
        return t ? t[String(taskId)] : null;
    }

    function checkAndCompleteTask(savedData) {
        if (!savedData.curMainTask || !Array.isArray(savedData.curMainTask) || savedData.curMainTask.length === 0) {
            return false;
        }

        var currentTask = savedData.curMainTask[0];
        if (!currentTask || typeof currentTask._id === 'undefined') {
            return false;
        }

        if (currentTask._state === TASK_STATE.COMPLETE || currentTask._state === TASK_STATE.FINISH) {
            return false;
        }

        var taskData = getTaskConfig(currentTask._id);
        if (!taskData) {
            log.warn('TASK', 'checkAndCompleteTask — task config not found for id=' + currentTask._id);
            return false;
        }

        if (taskData.taskType !== 'superLevelUp') {
            return false;
        }

        currentTask._state = TASK_STATE.COMPLETE;
        savedData.curMainTask = [currentTask];

        log.info('TASK', 'Task ' + currentTask._id + ' (' + taskData.taskType + ') → COMPLETE (triggered by superSkill autoLevelUp)');

        return true;
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN HANDLER
    // ═══════════════════════════════════════════════════════════

    function handleAutoLevelUpSuperSkill(request, callback) {

        var _logT0 = Date.now();

        var userId = request.userId;
        var skillId = request.skillId;
        var times = Number(request.times);

        log.info('HANDLER', 'superSkill/autoLevelUpSuperSkill — START');
        log.details('request', [
            ['userId', userId || '(null)'],
            ['skillId', skillId || '(null)'],
            ['times', isNaN(times) ? '(null)' : times],
            ['version', request.version || '-']
        ]);

        // ── VALIDATION GROUP ──
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var _valChecks = [];

        if (!userId) {
            _valChecks.push({ '#': 1, Check: 'userId', Status: '❌ MISSING' });
            console.warn('   ⚠ missing userId');
        } else {
            _valChecks.push({ '#': 1, Check: 'userId', Status: '✅ OK' });
        }

        if (!skillId) {
            _valChecks.push({ '#': 2, Check: 'skillId', Status: '❌ MISSING' });
            console.warn('   ⚠ missing skillId');
        } else {
            _valChecks.push({ '#': 2, Check: 'skillId', Status: '✅ ' + skillId });
        }

        if (isNaN(times) || times < 1) {
            _valChecks.push({ '#': 3, Check: 'times', Status: '⚠ INVALID → pakai 1' });
        } else {
            _valChecks.push({ '#': 3, Check: 'times', Status: '✅ ' + times });
        }

        console.table(_valChecks);
        console.groupEnd();

        // ── VALIDATION ──
        if (!userId) {
            log.error('HANDLER', 'superSkill/autoLevelUpSuperSkill — missing userId');
            var _earlyElapsed = Date.now() - _logT0;
            console.log('%c📤 Response (Early Reject)', 'color:#1565C0;font-weight:bold;', '| ⏱️ ' + _earlyElapsed + 'ms | ret=1');
            callback({}, 1);
            return;
        }

        if (!skillId) {
            log.error('HANDLER', 'superSkill/autoLevelUpSuperSkill — missing skillId');
            console.groupEnd();
            callback({}, 1);
            return;
        }

        // times: client paten selalu kirim 999 (comma operator di aKeyLevelUpBtnTap).
        // Sanitasi: <1 → 1; >9999 → 9999 (loop tetap terikat max level ≤ 300).
        if (isNaN(times) || times < 1) times = 1;
        if (times > 9999) times = 9999;

        // ── LOAD CONFIGS ──
        var superSkillConfig = loadJson('superSkill');
        if (!superSkillConfig) {
            log.error('HANDLER', 'superSkill/autoLevelUpSuperSkill — failed to load superSkill.json');
            callback({}, 1);
            return;
        }

        var superLevelUpConfig = loadJson('superLevelUp');
        if (!superLevelUpConfig) {
            log.error('HANDLER', 'superSkill/autoLevelUpSuperSkill — failed to load superLevelUp.json');
            callback({}, 1);
            return;
        }

        var superEvolveConfig = loadJson('superEvolve');
        if (!superEvolveConfig) {
            log.error('HANDLER', 'superSkill/autoLevelUpSuperSkill — failed to load superEvolve.json');
            callback({}, 1);
            return;
        }

        // Validate skillId exists in superSkill.json
        var skillEntry = superSkillConfig[String(skillId)];
        if (!skillEntry) {
            log.error('HANDLER', 'superSkill/autoLevelUpSuperSkill — skillId not in superSkill.json: ' + skillId);
            callback({}, 1);
            return;
        }

        var quality = skillEntry.quality; // "green", "blue", "purple", "orange"

        // ── LOAD USER DATA ──
        var key = userStorageKey(userId);
        var savedData = db._get(key);
        if (!savedData) {
            log.error('HANDLER', 'superSkill/autoLevelUpSuperSkill — user data not found: ' + key);
            callback({}, 1);
            return;
        }

        // ── FIND SKILL IN USER DATA ──
        var found = findSkillInStorage(savedData, skillId);
        if (!found) {
            log.error('HANDLER', 'superSkill/autoLevelUpSuperSkill — skill not found in user data: ' + skillId);
            callback({}, 1);
            return;
        }

        var skillData = found.data;
        var maxLevel = getSuperSkillMaxLevel(superLevelUpConfig, quality);

        log.info('HANDLER', 'superSkill/autoLevelUpSuperSkill — found skill at key "' + found.key + '", level=' + (Number(skillData._level) || 1) + '/' + maxLevel + ', needEvolve=' + !!skillData._needEvolve + ', times=' + times);

        // ── AUTO LEVEL-UP LOOP (mirror levelUpSuperSkill per iterasi) ──
        var levelsDone = 0;
        var stopReason = 'times-exhausted';
        var insufficientCostId = null;  // utk _openType=2 bila 0 progres krn item kurang
        var changedItems = {};          // { "<itemId>": absoluteBalanceAfter }
        var totalCostAccum = {};        // { "<itemId>": totalDibayar sesi ini }

        while (levelsDone < times) {

            var currentLevel = Number(skillData._level) || 1;
            var currentNeedEvolve = !!skillData._needEvolve;

            // Max level
            if (currentLevel >= maxLevel) {
                stopReason = 'max-level';
                break;
            }

            // needEvolve memblokir level-up (persis levelUpSuperSkill)
            if (currentNeedEvolve) {
                stopReason = 'need-evolve';
                break;
            }

            // Cost row utk level SAAT INI (naik ke level+1)
            var levelUpEntry = getSuperLevelUP(superLevelUpConfig, quality, currentLevel);
            if (!levelUpEntry) {
                stopReason = 'no-config';
                break;
            }

            var costId = Number(levelUpEntry.costID);
            var costNum = Number(levelUpEntry.costNum);

            // Balance — bila kurang: berhenti, kirim progres yg sudah jalan
            var currentBalance = getItemBalance(savedData, costId);
            if (currentBalance < costNum) {
                stopReason = 'insufficient';
                insufficientCostId = costId;
                break;
            }

            // Deduct + update skill
            var newBalance = currentBalance - costNum;
            setItemBalance(savedData, costId, newBalance);
            changedItems[String(costId)] = { _id: costId, _num: newBalance };

            var newLevel = currentLevel + 1;
            skillData._level = newLevel;
            levelsDone++;

            totalCostAccum[String(costId)] = (Number(totalCostAccum[String(costId)]) || 0) + costNum;

            // Threshold evolve → _needEvolve=true (iterasi berikutnya break)
            var evolveEntry = getSuperEvolveLevel(superEvolveConfig, quality, newLevel);
            skillData._needEvolve = !!evolveEntry;

            log.info('HANDLER', 'superSkill/autoLevelUpSuperSkill — step ' + levelsDone + ': level ' + currentLevel + ' → ' + newLevel + ' (cost ' + costId + ' x' + costNum + ', balance ' + newBalance + ')' + (evolveEntry ? ' → needEvolve=true' : ''));
        }

        // ── UPDATE _totalCost KUMULATIF (lama + sesi ini) ──
        if (levelsDone > 0) {
            var oldTotalCost = (skillData._totalCost && skillData._totalCost._items) ? skillData._totalCost._items : {};

            skillData._totalCost = { _items: {} };
            // item yg dibelanjakan sesi ini
            for (var accKey in totalCostAccum) {
                if (!totalCostAccum.hasOwnProperty(accKey)) continue;
                var oldNum = oldTotalCost[accKey] ? (Number(oldTotalCost[accKey]._num) || 0) : 0;
                skillData._totalCost._items[accKey] = {
                    _id: Number(accKey),
                    _num: oldNum + totalCostAccum[accKey]
                };
            }
            // item lain dari _totalCost lama (mis. 133 dari evolve)
            for (var oldKey in oldTotalCost) {
                if (!oldTotalCost.hasOwnProperty(oldKey)) continue;
                if (skillData._totalCost._items[oldKey]) continue;
                skillData._totalCost._items[oldKey] = oldTotalCost[oldKey];
            }

            log.info('HANDLER', 'superSkill/autoLevelUpSuperSkill — DONE: ' + levelsDone + ' level(s) [' + (Number(skillData._level) - levelsDone + 1) + '→' + skillData._level + '], stop=' + stopReason + ', needEvolve=' + !!skillData._needEvolve + ', totalCost=' + JSON.stringify(skillData._totalCost));

            // ── TASK PROGRESS (sekali setelah loop) ──
            var taskUpdated = checkAndCompleteTask(savedData);

            // ── SAVE USER DATA ──
            db._set(key, savedData);
            log.info('HANDLER', 'superSkill/autoLevelUpSuperSkill — user data saved.');

            if (taskUpdated) {
                // Client L77080: Notify "mainTaskChange" → setMianTask(e._curMainTask)
                MainServer.log.notify('mainTaskChange', {
                    _curMainTask: savedData.curMainTask
                });
                log.info('TASK', 'Notify mainTaskChange sent — task ' +
                    savedData.curMainTask[0]._id + ' state=' +
                    savedData.curMainTask[0]._state);
            }

            // ── BUILD RESPONSE (pola levelUpSuperSkill) ──
            var response = {
                _changeInfo: {
                    _items: changedItems
                },
                _skill: {
                    _skillId: Number(skillId),
                    _level: Number(skillData._level),
                    _needEvolve: !!skillData._needEvolve,
                    _totalCost: skillData._totalCost
                }
            };

            log.details('response', [
                ['levelsDone', String(levelsDone)],
                ['_changeInfo._items', JSON.stringify(response._changeInfo._items)],
                ['_skill._level', String(response._skill._level)],
                ['_skill._needEvolve', String(response._skill._needEvolve)],
                ['_skill._totalCost', JSON.stringify(response._skill._totalCost)]
            ]);

            // ── RESPONSE BUILD & AUDIT ──
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _respElapsed = Date.now() - _logT0;
            console.log('   ⏱️ Total: ' + _respElapsed + 'ms');
            console.table([
                { Field: 'skillId', Value: skillId, Note: 'super skill ID' },
                { Field: 'levelsDone', Value: levelsDone, Note: 'level naik' },
                { Field: 'finalLevel', Value: response._skill._level, Note: 'dari ' + (response._skill._level - levelsDone) },
                { Field: 'stopReason', Value: stopReason, Note: 'alasan berhenti' },
                { Field: 'needEvolve', Value: response._skill._needEvolve ? 'YES' : 'NO', Note: 'evolve threshold' },
                { Field: 'ret', Value: 0, Note: 'success' }
            ]);
            console.groupEnd();
            console.groupEnd();

            callback(response);
            return;
        }

        // ── 0 PROGRES ──
        // Item kurang (kasus utama) → _openType=2 (OPEN_TIPS) → client
        // openMoneyNotEnough(costID) memakai costID milik client (r.costID).
        // Alasan lain (max-level / need-evolve / no-config) → silent {} —
        // UI client sudah menutup tombol untuk kondisi tsb.
        if (stopReason === 'insufficient') {
            log.info('HANDLER', 'superSkill/autoLevelUpSuperSkill — 0 progres (insufficient item ' + insufficientCostId + ') → _openType=2 (OPEN_TIPS)');

            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            console.log('   ⏱️ Total: ' + (Date.now() - _logT0) + 'ms');
            console.table([
                { Field: 'levelsDone', Value: 0, Note: 'tidak ada level naik' },
                { Field: 'stopReason', Value: stopReason, Note: 'item ' + insufficientCostId + ' kurang' },
                { Field: '_openType', Value: OPEN_TIPS, Note: 'OPEN_TIPS → openMoneyNotEnough' },
                { Field: 'ret', Value: 0, Note: 'success (bukan error)' }
            ]);
            console.groupEnd();
            console.groupEnd();

            callback({ _openType: OPEN_TIPS });
            return;
        }

        log.info('HANDLER', 'superSkill/autoLevelUpSuperSkill — 0 progres (stop=' + stopReason + ') → silent {}');
        callback({});
    }

    // ═══════════════════════════════════════════════════════════
    //  REGISTER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('superSkill', 'autoLevelUpSuperSkill', handleAutoLevelUpSuperSkill);

})();
