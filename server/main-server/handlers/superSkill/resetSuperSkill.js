/**
 * handlers/superSkill/resetSuperSkill.js
 *
 * Request:  { type:"superSkill", action:"resetSuperSkill", userId, skillId:"1120561", version:"1.0" }
 * Response: {
 *   _changeInfo: { _items: { "<itemId>": { _id, _num:<ABSOLUTE_BALANCE> }, ... } },  // hasil refund
 *   _skill: { _skillId, _level:1, _needEvolve:false, _totalCost:{_items:{}} }
 * }
 *
 * ============================================================
 * ANALYSIS EVIDENCE (main.min.js):
 * ============================================================
 *
 * [CALL SITE] resetBtnTap (konfirmasi "rebirth" — dialog mendaftar SEMUA item
 * yang pernah dibelanjakan, dibaca dari superSkillData.totalCost.items):
 *   var t = e.myData.superSkillInfo, n = e.myData.superSkillData, o = userId;
 *   var a = function(){
 *     ts.processHandler({type:"superSkill",action:"resetSuperSkill",userId:o,skillId:t.superSkillID,version:"1.0"},
 *       function(t){
 *         UIWindowManager.openCongratulationObtain(t);                          // ← TANPA guard!
 *         var n = SuperSkillSingleton.getInstance().changeSuperSkill(t._skill); // ← TANPA guard!
 *         e.myData.changeSuperSkillData(n), e.loadSuperSkillMainUI()
 *       })
 *   };
 *   var r = thingsID, i = n.totalCost.items, s = [];
 *   for (var l in i) { ... s.push(getLanguageWithEditor("SuperSkillMain","id5",[u.count, c.name])) }
 *   → Dialog konfirmasi menampilkan daftar item refund (dari totalCost) —
 *     server TIDAK dipanggil untuk menghitung; server cukup refund + reset.
 *   → Tidak ada biaya reset terpisah di request (hanya userId/skillId/version).
 *
 * [⚠ Callback TANPA guard _changeInfo] — respons SUKSES WAJIB membawa _skill
 *   valid (4 field: _skillId/_level/_needEvolve/_totalCost); path gagal pakai
 *   callback({}, 1) — client processHandler tidak meneruskan data saat ret != 0.
 *
 * [openCongratulationObtain(t)]:
 *   if (!(t._changeInfo || t._addHeroes || ...)) → "没有任何东西！！！" skip popup
 *   i = t._changeInfo._items → popup "obtain" dari balance ABSOLUT
 *   → Refund harus masuk _changeInfo agar popup reward muncul.
 *
 * [RESET STATE — apa yang dikembalikan server]:
 *   _level      → 1   (aktivasi = level 1; SuperSkillData(id, 1, false))
 *   _needEvolve → false
 *   _totalCost  → {_items:{}} kosong (semua sudah di-refund)
 *   Skill TETAP terpasang (changeSuperSkill mempertahankan/membuat SuperSkillData)
 *
 * [_totalCost format]: { _items: { "134": {_id:134,_num:kumulatif}, "133": {...} } }
 *   — diisi levelUpSuperSkill (item 134) dan evolveSuperSkill (item 133)
 * [_changeInfo._items]: ABSOLUTE balance setelah refund (pola levelUpSuperSkill.js)
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
            log.error('RESOURCE', 'superSkill/resetSuperSkill failed to load: ' + name + '.json — HTTP ' + xhr.status);
        } catch (e) {
            log.error('RESOURCE', 'superSkill/resetSuperSkill failed to load: ' + name + '.json — ' + e.message);
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
    //  MAIN HANDLER
    // ═══════════════════════════════════════════════════════════

    function handleResetSuperSkill(request, callback) {

        var _logT0 = Date.now();

        var userId = request.userId;
        var skillId = request.skillId;

        log.info('HANDLER', 'superSkill/resetSuperSkill — START');
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
            log.error('HANDLER', 'superSkill/resetSuperSkill — missing userId');
            var _earlyElapsed = Date.now() - _logT0;
            console.log('%c📤 Response (Early Reject)', 'color:#1565C0;font-weight:bold;', '| ⏱️ ' + _earlyElapsed + 'ms | ret=1');
            callback({}, 1);
            return;
        }

        if (!skillId) {
            log.error('HANDLER', 'superSkill/resetSuperSkill — missing skillId');
            console.groupEnd();
            callback({}, 1);
            return;
        }

        // ── LOAD CONFIG (validasi skillId ada di paten config) ──
        var superSkillConfig = loadJson('superSkill');
        if (!superSkillConfig) {
            log.error('HANDLER', 'superSkill/resetSuperSkill — failed to load superSkill.json');
            callback({}, 1);
            return;
        }

        var skillEntry = superSkillConfig[String(skillId)];
        if (!skillEntry) {
            log.error('HANDLER', 'superSkill/resetSuperSkill — skillId not in superSkill.json: ' + skillId);
            callback({}, 1);
            return;
        }

        // ── LOAD USER DATA ──
        var key = userStorageKey(userId);
        var savedData = db._get(key);
        if (!savedData) {
            log.error('HANDLER', 'superSkill/resetSuperSkill — user data not found: ' + key);
            callback({}, 1);
            return;
        }

        // ── FIND SKILL IN USER DATA ──
        var found = findSkillInStorage(savedData, skillId);
        if (!found) {
            log.error('HANDLER', 'superSkill/resetSuperSkill — skill not found in user data: ' + skillId);
            callback({}, 1);
            return;
        }

        var skillData = found.data;
        var currentLevel = Number(skillData._level) || 1;

        log.info('HANDLER', 'superSkill/resetSuperSkill — found skill at key "' + found.key + '", level=' + currentLevel + ', needEvolve=' + !!skillData._needEvolve);

        // ── REFUND SEMUA _totalCost._items ──
        // Persis dialog client: totalCost.items → daftar {id, count}
        var totalCostItems = (skillData._totalCost && skillData._totalCost._items) ? skillData._totalCost._items : {};
        var refundedItems = {};  // { "<itemId>": absoluteBalanceAfter }

        for (var tcKey in totalCostItems) {
            if (!totalCostItems.hasOwnProperty(tcKey)) continue;
            var entry = totalCostItems[tcKey];
            if (!entry || !entry._id || !(Number(entry._num) > 0)) continue;

            var itemId = Number(entry._id);
            var refundNum = Number(entry._num);

            var newBalance = getItemBalance(savedData, itemId) + refundNum;
            setItemBalance(savedData, itemId, newBalance);
            refundedItems[String(itemId)] = { _id: itemId, _num: newBalance };

            log.info('HANDLER', 'superSkill/resetSuperSkill — refund item ' + itemId + ' x' + refundNum + ' → balance ' + newBalance);
        }

        // ── RESET SKILL STATE (level 1, evolve clear, cost kosong) ──
        skillData._level = 1;
        skillData._needEvolve = false;
        skillData._totalCost = { _items: {} };

        log.info('HANDLER', 'superSkill/resetSuperSkill — skill ' + skillId + ' reset: level ' + currentLevel + ' → 1, totalCost cleared, ' + Object.keys(refundedItems).length + ' item kind(s) refunded');

        // ── SAVE USER DATA ──
        db._set(key, savedData);
        log.info('HANDLER', 'superSkill/resetSuperSkill — user data saved.');

        // ── BUILD RESPONSE ──
        // Callback client TANPA guard: openCongratulationObtain(t) baca _changeInfo,
        // changeSuperSkill(t._skill) baca 4 field _skill — keduanya WAJIB ada.
        var response = {
            _changeInfo: {
                _items: refundedItems
            },
            _skill: {
                _skillId: Number(skillId),
                _level: 1,
                _needEvolve: false,
                _totalCost: skillData._totalCost
            }
        };

        log.details('response', [
            ['_changeInfo._items', JSON.stringify(response._changeInfo._items)],
            ['_skill._level', '1'],
            ['_skill._needEvolve', 'false'],
            ['_skill._totalCost', '{"_items":{}}']
        ]);

        // ── RESPONSE BUILD & AUDIT ──
        console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
        var _respElapsed = Date.now() - _logT0;
        console.log('   ⏱️ Total: ' + _respElapsed + 'ms');
        console.table([
            { Field: 'skillId', Value: skillId, Note: 'super skill ID' },
            { Field: 'oldLevel', Value: currentLevel, Note: 'before reset' },
            { Field: 'refunds', Value: Object.keys(refundedItems).length + ' kind(s)', Note: 'totalCost refunded' },
            { Field: 'ret', Value: 0, Note: 'success' }
        ]);
        console.groupEnd();
        console.groupEnd();

        callback(response);
    }

    // ═══════════════════════════════════════════════════════════
    //  REGISTER
    // ═══════════════════════════════════════════════════════════

    MainServer.registerHandler('superSkill', 'resetSuperSkill', handleResetSuperSkill);

})();
