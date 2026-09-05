/**
 * handlers/superSkill/evolveSuperSkill.js
 *
 * Request:  { type:"superSkill", action:"evolveSuperSkill", userId, skillId:"1120561", version:"1.0" }
 * Response: {
 *   _changeInfo: { _items: { "133": { _id:133, _num:<ABSOLUTE_BALANCE> } } },
 *   _skill: { _skillId, _level:<UNCHANGED>, _needEvolve:false, _totalCost:{_items:{...kumulatif...}} }
 * }
 *
 * ============================================================
 * ANALYSIS EVIDENCE (main.min.js):
 * ============================================================
 *
 * [CALL SITE] evolveBtnTap — hanya tampil/klik bila superSkillData.needEvolve === true:
 *   var t = e.myData.superSkillData, n = e.myData.superSkillInfo, o = thingsID;
 *   if (t.needEvolve) {
 *     var a = SuperSkillSingleton.getInstance().getSuperEvolevel(n.superConfig.quality, t.superskillLevel);
 *     if (!a) return Logger("没有该等级的("+t.superskillLevel+")超必杀进阶配置表"), void e.superSkillLevelUP();
 *     var r = o[a.costID];
 *     if (!r) return void Logger("没有该道具"+a.costID);
 *     var i = a.costNum <= ItemsCommonSingleton.getItemNum(a.costID);  // afford pre-check (enable btn)
 *     ...
 *     ts.processHandler({type:"superSkill",action:"evolveSuperSkill",userId:s,skillId:n.superSkillID,version:"1.0"},
 *       function(t){
 *         UIWindowManager.openCongratulationObtain(t);                        // ← TANPA guard _changeInfo!
 *         var n = SuperSkillSingleton.getInstance().changeSuperSkill(t._skill); // ← TANPA guard!
 *         e.myData.changeSuperSkillData(n), e.loadSuperSkillMainUI(), e.showUpEffectStart()
 *       })
 *   }
 *   → ⚠ Callback TANPA `if(t._changeInfo)` guard (beda dgn levelUp):
 *     respons SUKSES WAJIB membawa _skill valid, kalau tidak changeSuperSkill(undefined) crash.
 *     Karena itu semua path gagal memakai callback({}, 1) — client processHandler
 *     tidak meneruskan data ke success callback saat ret != 0 (pola seluruh repo).
 *
 * [getSuperEvolevel(quality, level)] (client):
 *   Iterates superEvolve.json → return entry where quality==quality && evolveLevel==level
 *   → { id, quality, evolveLevel, costID, costNum }
 *
 * [superEvolve.json] 100 entries (4 quality × 25 threshold):
 *   green: evolveLevel 20/40/60/.../300, costID selalu 133, costNum 80/150/225/...
 *   Evolve TIDAK menaikkan level — hanya membuka blokir level-up berikutnya
 *   (cap berikutnya = threshold evolveLevel selanjutnya, lihat getCurSuperEvolevel).
 *
 * [changeSuperSkill(t._skill)] (client) — membaca PERSIS 4 field:
 *   _skillId, _level, _needEvolve, _totalCost
 *   → changeSuperSkillLevel(level, needEvolve, totalCost):
 *       superskillLevel = level; needEvolve = needEvolve;
 *       totalCost.changeItems(totalCost) — REPLACE per item id (bukan aditif)
 *   → Server harus kirim _totalCost KUMULATIF penuh.
 *
 * [openCongratulationObtain(t)] (client):
 *   if (!(t._changeInfo || t._addHeroes || t._addSigns || t._addWeapons || t._addStones || t._addGenkis))
 *     → log "没有任何东西！！！" + skip popup
 *   i = t._changeInfo._items → popup "obtain" dari balance ABSOLUT
 *   → Response sukses wajib _changeInfo agar popup evolve muncul.
 *
 * [_totalCost akumulasi] — evolve cost MASUK ke _totalCost:
 *   resetBtnTap menampilkan refund dari superSkillData.totalCost.items
 *   (semua yang pernah dibelanjakan: level-up 134 + evolve 133) →
 *   resetSuperSkill me-refund _totalCost → evolve WAJIB menambahkan cost-nya
 *   ke _totalCost agar refund reset akurat.
 *
 * [Format _totalCost]: { _items: { "133": {_id:133,_num:kumulatif}, "134": {...} } }
 * [_changeInfo._items]: ABSOLUTE balance setelah pemotongan (pola levelUpSuperSkill.js)
 * [Error pattern]: callback({}, 1) — sama seperti levelUpSuperSkill.js
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
            log.error('RESOURCE', 'superSkill/evolveSuperSkill failed to load: ' + name + '.json — HTTP ' + xhr.status);
        } catch (e) {
            log.error('RESOURCE', 'superSkill/evolveSuperSkill failed to load: ' + name + '.json — ' + e.message);
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

    /**
     * getSuperEvolevel(quality, level) — matches client's getSuperEvolevel
     * Iterates superEvolve.json, returns entry where quality==quality && evolveLevel==level
     */
    function getSuperEvolevel(superEvolveConfig, quality, level) {
        for (var k in superEvolveConfig) {
            if (!superEvolveConfig.hasOwnProperty(k)) continue;
            var entry = superEvolveConfig[k];
            if (entry.quality === quality && entry.evolveLevel === level) {
                return entry;
            }
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN HANDLER
    // ═══════════════════════════════════════════════════════════

    function handleEvolveSuperSkill(request, callback) {

        var _logT0 = Date.now();

        var userId = request.userId;
        var skillId = request.skillId;

        log.info('HANDLER', 'superSkill/evolveSuperSkill — START');
        log.details('request', [
            ['userId', userId || '(null)'],
            ['skillId', skillId || '(null)'],
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

        console.table(_valChecks);
        console.groupEnd();

        // ── VALIDATION ──
        if (!userId) {
            log.error('HANDLER', 'superSkill/evolveSuperSkill — missing userId');
            var _earlyElapsed = Date.now() - _logT0;
            console.log('%c📤 Response (Early Reject)', 'color:#1565C0;font-weight:bold;', '| ⏱️ ' + _earlyElapsed + 'ms | ret=1');
            callback({}, 1);
            return;
        }

        if (!skillId) {
            log.error('HANDLER', 'superSkill/evolveSuperSkill — missing skillId');
            console.groupEnd();
            callback({}, 1);
            return;
        }

        // ── LOAD CONFIGS ──
        var superSkillConfig = loadJson('superSkill');
        if (!superSkillConfig) {
            log.error('HANDLER', 'superSkill/evolveSuperSkill — failed to load superSkill.json');
            callback({}, 1);
            return;
        }

        var superEvolveConfig = loadJson('superEvolve');
        if (!superEvolveConfig) {
            log.error('HANDLER', 'superSkill/evolveSuperSkill — failed to load superEvolve.json');
            callback({}, 1);
            return;
        }

        // Validate skillId exists in superSkill.json
        var skillEntry = superSkillConfig[String(skillId)];
        if (!skillEntry) {
            log.error('HANDLER', 'superSkill/evolveSuperSkill — skillId not in superSkill.json: ' + skillId);
            callback({}, 1);
            return;
        }

        var quality = skillEntry.quality; // "green", "blue", "purple", "orange"

        // ── LOAD USER DATA ──
        var key = userStorageKey(userId);
        var savedData = db._get(key);
        if (!savedData) {
            log.error('HANDLER', 'superSkill/evolveSuperSkill — user data not found: ' + key);
            callback({}, 1);
            return;
        }

        // ── FIND SKILL IN USER DATA ──
        var found = findSkillInStorage(savedData, skillId);
        if (!found) {
            log.error('HANDLER', 'superSkill/evolveSuperSkill — skill not found in user data: ' + skillId);
            callback({}, 1);
            return;
        }

        var skillData = found.data;
        var currentLevel = Number(skillData._level) || 1;
        var currentNeedEvolve = !!skillData._needEvolve;

        log.info('HANDLER', 'superSkill/evolveSuperSkill — found skill at key "' + found.key + '", level=' + currentLevel + ', needEvolve=' + currentNeedEvolve);

        // ── CHECK: evolve hanya sah bila needEvolve === true ──
        // Client evolveBtnTap hanya memproses di dalam if (t.needEvolve).
        if (!currentNeedEvolve) {
            log.error('HANDLER', 'superSkill/evolveSuperSkill — skill does NOT need evolve (level=' + currentLevel + ')');
            callback({}, 1);
            return;
        }

        // ── LOOKUP EVOLVE COST for current level ──
        // Persis client: getSuperEvolevel(quality, t.superskillLevel)
        var evolveEntry = getSuperEvolevel(superEvolveConfig, quality, currentLevel);
        if (!evolveEntry) {
            log.error('HANDLER', 'superSkill/evolveSuperSkill — no evolve config for quality=' + quality + ' level=' + currentLevel);
            callback({}, 1);
            return;
        }

        var costId = Number(evolveEntry.costID);
        var costNum = Number(evolveEntry.costNum);

        log.info('HANDLER', 'superSkill/evolveSuperSkill — evolve cost: item ' + costId + ' x' + costNum + ' (evolveLevel=' + evolveEntry.evolveLevel + ')');

        // ── CHECK ITEM BALANCE ──
        var currentBalance = getItemBalance(savedData, costId);
        if (currentBalance < costNum) {
            log.error('HANDLER', 'superSkill/evolveSuperSkill — not enough items: have ' + currentBalance + ', need ' + costNum + ' (item ' + costId + ')');
            callback({}, 1);
            return;
        }

        // ── DEDUCT COST ──
        var newBalance = currentBalance - costNum;
        setItemBalance(savedData, costId, newBalance);

        // ── CLEAR needEvolve (level TIDAK bertambah — paten evolveBtnTap) ──
        skillData._needEvolve = false;

        // ── UPDATE _totalCost (kumulatif — ikut di-refund resetSuperSkill) ──
        // Format: { _items: { "133": { _id:133, _num:<kumulatif> } } }
        var oldTotalCost = (skillData._totalCost && skillData._totalCost._items) ? skillData._totalCost._items : {};
        var oldCostForItem = 0;
        if (oldTotalCost[String(costId)]) {
            oldCostForItem = Number(oldTotalCost[String(costId)]._num) || 0;
        }
        var newTotalForItem = oldCostForItem + costNum;

        skillData._totalCost = { _items: {} };
        skillData._totalCost._items[String(costId)] = {
            _id: costId,
            _num: newTotalForItem
        };

        // Preserve item lain di _totalCost lama (mis. 134 dari level-up)
        for (var oldKey in oldTotalCost) {
            if (!oldTotalCost.hasOwnProperty(oldKey)) continue;
            if (oldKey === String(costId)) continue;
            skillData._totalCost._items[oldKey] = oldTotalCost[oldKey];
        }

        log.info('HANDLER', 'superSkill/evolveSuperSkill — evolved at level ' + currentLevel + ' (needEvolve false), totalCost item ' + costId + '=' + newTotalForItem);

        // ── SAVE USER DATA ──
        db._set(key, savedData);
        log.info('HANDLER', 'superSkill/evolveSuperSkill — user data saved.');

        // ── BUILD RESPONSE ──
        // Callback client TANPA guard: openCongratulationObtain(t) baca _changeInfo,
        // changeSuperSkill(t._skill) baca 4 field _skill — keduanya WAJIB ada.
        var response = {
            _changeInfo: {
                _items: {}
            },
            _skill: {
                _skillId: Number(skillId),
                _level: currentLevel,
                _needEvolve: false,
                _totalCost: skillData._totalCost
            }
        };

        // _changeInfo._items: ABSOLUTE balance setelah pemotongan
        response._changeInfo._items[String(costId)] = {
            _id: costId,
            _num: newBalance
        };

        log.details('response', [
            ['_changeInfo._items', JSON.stringify(response._changeInfo._items)],
            ['_skill._level', String(currentLevel) + ' (unchanged)'],
            ['_skill._needEvolve', 'false'],
            ['_skill._totalCost', JSON.stringify(response._skill._totalCost)]
        ]);

        // ── RESPONSE BUILD & AUDIT ──
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        var _respElapsed = Date.now() - _logT0;
        console.log('   ⏱️ Total: ' + _respElapsed + 'ms');
        console.table([
            { Field: 'skillId', Value: skillId, Note: 'super skill ID' },
            { Field: 'evolveLevel', Value: evolveEntry.evolveLevel, Note: 'threshold dibuka' },
            { Field: 'cost', Value: costId + ' x' + costNum, Note: 'deducted' },
            { Field: 'balance', Value: newBalance, Note: 'absolute after' },
            { Field: 'ret', Value: 0, Note: 'success' }
        ]);
        console.groupEnd();
        console.groupEnd();

        callback(response);
    }

    // ═══════════════════════════════════════════════════════════
    //  REGISTER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('superSkill', 'evolveSuperSkill', handleEvolveSuperSkill);

})();
