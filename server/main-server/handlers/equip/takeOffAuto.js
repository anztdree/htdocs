/**
 * handlers/equip/takeOffAuto.js — One-Step Unfix (Lepas Semua Equip + Senjata + Gem) ✅1000%
 * Super Warrior Z — MAIN SERVER
 *
 * ═══════════════════════════════════════════════════════════════════
 * COMPATIBLE WITH main.min.js (CLIENT) — 100% MATCH
 * ═══════════════════════════════════════════════════════════════════
 *
 * Client call (main.min.js oneStepUnfixTap):
 *   guard: hero punya ≥1 suitItem ATAU punya old weapon (getOldWeapon)
 *   ts.processHandler({
 *     type: "equip", action: "takeOffAuto",
 *     userId: UserInfoSingleton.getInstance().userId,
 *     heroId: n,          // hero instance ID
 *     version: "1.0"
 *   }, function(t){ ... })   // ← 3 argumen TANPA error-callback
 *      → ret != 0 tetap memicu ErrorHandler.ShowErrorTips (arg-4 kosong)
 *
 * 📦 CALLBACK 1: EquipInfoManager.oneSteapOff(response)
 *      if (e._equipItem):
 *          SetEquipDataToModel(e._equipItem)   // TANPA GUARD — butuh 5 field:
 *              _suitItems [{_id,_pos}] / _suitAttrs [{_id,_num}]
 *              _equipAttrs [{_id,_num}] / _earrings (object) / _weaponState (number)
 *          delete equipDataList[e.heroId]; addToEquips(e.heroId, model)
 *      if (e._weapon):                              // OPSIONAL — hanya jika hero punya senjata
 *          WeaponDataModel.deserialize(e._weapon)   // _weaponId,_displayId,_heroId,_star,
 *          delete WeaponDataArray[wid]; addToWeap(wid, model) // _level,_attrs,_haloId,...
 *
 * 💎 CALLBACK 2: for (n in t._takeOffStoneIds) → unfixEquipGemById(id)
 *      gem TETAP di equipGemList, heroId="", hero.gemstoneSuitId=0   (gem unique kembali)
 * 💎 CALLBACK 3: for (n in t._delStoneIds) → delEquipGemById(id)
 *      gem DIHAPUS dari equipGemList                                  (gem stackable → jadi item tas)
 *
 *      ATURAN PATEN GEM — ToolCommon.canStackEquipGem (client memanggil SETELAH heroId dikosongkan):
 *          stackable   = level<=1 && totalExp<=0  →  hapus entry + bag item +1 (_displayId)
 *          not stackable (level>1 || exp>0)       →  unfix (entry tetap, heroId="")
 *      Bukti konversi identik: hero resolve (L1787418) & reborn return (L3806345):
 *          g.heroId=""; canStackEquipGem(g) ? delEquipGemById(g.id)
 *                                          : push({_id:g.displayId,_num:1,_star:0,_level:g.level})
 *
 * 📊 CALLBACK 4: HerosManager.setTotalAttrsByHeroId(t, t.heroId)
 *      → setTotalAttrs: e._totalAttr._items → OVERWRITE per-entry totalAttr[id]
 *      → id==21 → heroBaseAttr.power = Math.floor(num)
 * 🎒 CALLBACK 5: ItemsCommonSingleton.resetTtemsCallBack(t)
 *      → e._changeInfo._items → setItem(_id, _num) [ABSOLUTE balance]
 *
 * ═══════════════════════════════════════════════════════════════════
 * SERVER PIPELINE
 * ═══════════════════════════════════════════════════════════════════
 * 0. COPY-ON-WRITE: db._get = referensi live memory → SEMUA mutasi pada
 *    SALINAN (JSON deep-copy); db._set HANYA di jalur sukses.
 *    Paten: processHandler 3-arg → ret!=0 → ShowErrorTips saja, client
 *    tak mengubah state → server wajib mirror (juga saat exception).
 * 1. Validasi userId + heroId → load user:{id} → findHeroInStorage
 *    ⚠ heroId dipakai MENTAP persis seperti client kirim (oneStepUnfixTap:
 *    heroId = t.getHeroData().heroId, tanpa konversi tipe) — identity
 *    client = identity server. JANGAN String()/Number() karangan.
 * 2. Suit items  : tiap _suitItems → +1 ke inventori (ABSOLUTE) → _suitItems=[]
 * 3. Weapon      : cari weapon._items dgn _heroId==heroId → _heroId='' → kirim _weapon (copy)
 * 4. Gems        : gemstone._items (ARRAY) dgn _heroId==heroId:
 *                    stackable  → splice + bag item +1 displayId → _delStoneIds
 *                    unique     → _heroId='' + hero._gemstoneSuitId=0 → _takeOffStoneIds
 * 5. heroStats.computeHeroStats(heroId MENTAP) SETELAH mutasi (single source of truth)
 * 6. Respons lengkap + persist salinan
 *
 * ⚠️ _takeOffStoneIds & _delStoneIds SELALU ada (array, boleh kosong) —
 *    client melakukan for..in tanpa guard; undefined = TypeError.
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;
    var heroStats = MainServer.heroStats;

    if (!MainServer.handlers.equip) {
        MainServer.handlers.equip = {};
    }

    // ═══════════════════════════════════════════════════════════════════
    //  INVENTORY HELPERS  (totalProps._items = [{_id, _num}, ...] — ABSOLUTE)
    //  Pola identik wearAuto.js / reborn.js
    // ═══════════════════════════════════════════════════════════════════

    function getBal(sd, id) {
        var items = sd && sd.totalProps && sd.totalProps._items;
        if (!items) return 0;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(id)) return Number(items[i]._num) || 0;
        }
        return 0;
    }

    function setBal(sd, id, val) {
        if (!sd.totalProps) sd.totalProps = { _items: [] };
        if (!sd.totalProps._items) sd.totalProps._items = [];
        var items = sd.totalProps._items;
        for (var i = 0; i < items.length; i++) {
            if (Number(items[i]._id) === Number(id)) { items[i]._num = val; return; }
        }
        items.push({ _id: id, _num: val });
    }

    // ═══════════════════════════════════════════════════════════════════
    //  GEM STACKABILITY — mirror ToolCommon.canStackEquipGem
    //  Client: g.heroId="" DULU baru cek → level>1 || totalExp>0 = unique
    //  ═══════════════════════════════════════════════════════════════════

    function isStackableGem(gem) {
        var level = Number(gem && gem._level);
        if (!isFinite(level)) level = 1;                    // GemstoneItem default level=1
        var exp = Number(gem && gem._totalExp);
        if (!isFinite(exp)) exp = 0;                        // default totalExp=0
        return level <= 1 && exp <= 0;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  EARRING BLOCK — pola wearAuto.js (SetEquipDataToModel butuh _earrings)
    // ═══════════════════════════════════════════════════════════════════

    function buildEarringBlock(savedData) {
        var earData = savedData && savedData.earring && savedData.earring._earring;
        if (earData && (Number(earData._level) || 0) > 0) {
            return {
                _id: Number(earData._id) || 0,
                _level: Number(earData._level) || 0,
                _attrs: earData._attrs || { _items: {}, _version: '' }
            };
        }
        return { _id: 0, _level: 0, _attrs: { _items: {}, _version: '' } };
    }

    // ═══════════════════════════════════════════════════════════════════
    //  HANDLER: equip/takeOffAuto
    // ═══════════════════════════════════════════════════════════════════

    function handleTakeOffAuto(request, callback) {

        var _logT0 = Date.now();

        // ═══ VALIDATION ═══
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var userId = request.userId;
        var heroId = request.heroId;
        var _validationChecks = [
            { check: 'userId present', pass: !!userId },
            { check: 'heroId present', pass: !!heroId }
        ];
        console.table(_validationChecks);
        console.groupEnd();

        log.info('TAKEOFFAUTO', 'equip/takeOffAuto');
        log.details('TAKEOFFAUTO', [
            ['userId', userId || '-'],
            ['heroId', heroId || '-'],
            ['version', request.version || '-']
        ]);

        try {
            if (!userId || !heroId) {
                log.warn('TAKEOFFAUTO', 'Missing userId or heroId');
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                console.log('⏱️ Elapsed: ' + (Date.now() - _logT0) + 'ms');
                console.log('❌ Error: Missing userId or heroId');
                console.groupEnd();
                callback({}, 1);
                return;
            }

            // ═══ PROCESSING ═══
            console.groupCollapsed('%c📦 Equip TakeOffAuto Processing', 'color:#0277BD;font-weight:bold;');
            console.log('userId:', userId, 'heroId:', heroId);

            var storageKey = 'user:' + userId;
            var savedRaw = db._get(storageKey);
            if (!savedRaw) {
                log.warn('TAKEOFFAUTO', 'User data not found: ' + storageKey);
                callback({}, 1);
                return;
            }

            var found = heroStats.findHeroInStorage(savedRaw, heroId);
            if (!found || !found.hero) {
                log.warn('TAKEOFFAUTO', 'Hero not found: ' + heroId);
                callback({}, 1);
                return;
            }

            // ══ COPY-ON-WRITE — mirror paten ret!=0 ══
            // main.min.js processHandler 3-arg: ret!=0 → ErrorHandler.ShowErrorTips SAJA
            // (client TIDAK mengubah state). db._get = referensi live memory
            // (index.js _dbEngine.get → return memory[key]) → mutasi dikerjakan pada
            // SALINAN, db._set hanya saat sukses → jalur gagal/exception tak menyentuh
            // state. hero dicari ulang di salinan (referensi hero lama = milik raw).
            var savedData = JSON.parse(JSON.stringify(savedRaw));
            var hero = heroStats.findHeroInStorage(savedData, heroId).hero;

            var changeItems = {};        // ABSOLUTE balances (resetTtemsCallBack)
            var takeOffStoneIds = [];    // gem unique → unfix (entry tetap, heroId="")
            var delStoneIds = [];        // gem stackable → hapus entry + bag item +1

            // ── STEP 1: SUIT ITEMS — semua equip lepas → +1 inventori ──
            if (!savedData.equip) savedData.equip = {};
            if (!savedData.equip._suits) savedData.equip._suits = {};
            if (!savedData.equip._suits[heroId]) {
                // Jaga agar model equip hero tetap ada (mirror client: model dikosongkan, bukan dihapus)
                savedData.equip._suits[heroId] = {
                    _suitItems: [],
                    _suitAttrs: [],
                    _equipAttrs: [],
                    _weaponState: 0
                };
            }
            var suit = savedData.equip._suits[heroId];
            var oldSuitItems = suit._suitItems || [];

            for (var i = 0; i < oldSuitItems.length; i++) {
                var eqId = Number(oldSuitItems[i]._id);
                if (!eqId || eqId <= 0) continue;
                var newBal = getBal(savedData, eqId) + 1;
                setBal(savedData, eqId, newBal);
                changeItems[String(eqId)] = { _id: eqId, _num: newBal };
                log.details('EQUIP', [
                    ['return pos ' + oldSuitItems[i]._pos, String(eqId)],
                    ['balance', newBal]
                ]);
            }
            suit._suitItems = [];        // SEMUA equip lepas — model tetap ada (mirror oneSteapOff)

            // ── STEP 2: WEAPON — unlink dari pool (heroId='') + kirim _weapon ──
            var weaponOut = null;
            if (savedData.weapon && savedData.weapon._items) {
                var weapons = savedData.weapon._items;
                for (var wid in weapons) {
                    if (!weapons.hasOwnProperty(wid)) continue;
                    var w = weapons[wid];
                    if (w && String(w._heroId) === String(heroId)) {
                        w._heroId = '';  // UNLINK — mirror getOldWeapon + _weapon replace
                        // Copy serialized WeaponDataModel (deserialize baca _weaponId, _displayId,
                        // _heroId, _star, _level, _attrs._items, _strengthenCost._items,
                        // _haloId, _haloLevel, _haloCost._items — primitive only via isCommonType)
                        weaponOut = JSON.parse(JSON.stringify(w));
                        weaponOut._heroId = '';
                        log.details('WEAPON', [
                            ['action', 'UNLINK'],
                            ['weaponId', String(wid)],
                            ['fromHero', String(heroId)]
                        ]);
                        break;       // satu hero hanya satu senjata
                    }
                }
            }

            // ── STEP 3: GEMS — aturan paten canStackEquipGem ──
            if (savedData.gemstone && savedData.gemstone._items && savedData.gemstone._items.length) {
                var gems = savedData.gemstone._items;
                for (var g = gems.length - 1; g >= 0; g--) {
                    var gem = gems[g];
                    if (!gem) continue;
                    if (String(gem._heroId) !== String(heroId)) continue;

                    if (isStackableGem(gem)) {
                        // STACKABLE → hapus entry + kembali jadi item tas (displayId)
                        var dispId = Number(gem._displayId);
                        gems.splice(g, 1);
                        if (dispId > 0) {
                            var gemBal = getBal(savedData, dispId) + 1;
                            setBal(savedData, dispId, gemBal);
                            changeItems[String(dispId)] = { _id: dispId, _num: gemBal };
                        }
                        delStoneIds.push(String(gem._id));
                        log.details('GEM', [
                            ['action', 'DELETE→ITEM'],
                            ['gemId', String(gem._id)],
                            ['displayId', String(dispId)],
                            ['level', Number(gem._level) || 1]
                        ]);
                    } else {
                        // UNIQUE (level>1 || exp>0) → unfix: entry tetap, heroId=""
                        gem._heroId = '';
                        takeOffStoneIds.push(String(gem._id));
                        log.details('GEM', [
                            ['action', 'UNFIX'],
                            ['gemId', String(gem._id)],
                            ['displayId', String(gem._displayId)],
                            ['level', Number(gem._level) || 1],
                            ['exp', Number(gem._totalExp) || 0]
                        ]);
                    }
                }
            }

            // ── STEP 4: gemstoneSuitId → 0 (mirror unfixEquipGemById: hanya cabang unfix
            //    yang me-reset hero.gemstoneSuitId di client) ──
            if (takeOffStoneIds.length > 0) {
                hero._gemstoneSuitId = 0;
            }

            // ── STEP 5: REKOMPUTASI STATS — SETELAH semua mutasi ──
            // ⚠ heroId MENTAP (paten oneStepUnfixTap: client kirim identity tanpa
            // konversi). String() karangan mematahkan findHeroInStorage strict ===
            // utk hero _heroId NUMBER dgn displayId berbeda (bug live heroId 1209).
            var statsResult = heroStats.computeHeroStats(heroId, savedData);
            if (!statsResult) {
                log.error('TAKEOFFAUTO', 'heroStats.computeHeroStats returned null for heroId: ' + heroId);
                // COPY-ON-WRITE: tak ada db._set → memory TIDAK tercoret (mirror ret!=0)
                callback({}, 1);
                return;
            }

            // ── STEP 6: BUILD RESPONSE ──
            var response = {
                type: 'equip',
                action: 'takeOffAuto',
                userId: userId,
                heroId: String(heroId),
                version: '1.0',

                // 💎 WAJIB ADA (client for..in tanpa guard) — boleh array kosong
                _takeOffStoneIds: takeOffStoneIds,
                _delStoneIds: delStoneIds,

                // 📦 oneSteapOff → SetEquipDataToModel — 5 field wajib (tanpa guard di client)
                _equipItem: {
                    _suitItems: [],
                    _suitAttrs: [],
                    _equipAttrs: [],
                    _earrings: buildEarringBlock(savedData),
                    _weaponState: Number(suit._weaponState) || 0
                },

                // 🗡️ OPSIONAL — hanya jika hero punya senjata (client: if (e._weapon))
                _weapon: weaponOut || undefined,

                // 📊 setTotalAttrsByHeroId — OVERWRITE per-entry; id 21 = power
                _totalAttr: { _items: statsResult.totalItems },

                // 🎒 resetTtemsCallBack — ABSOLUTE balances
                _changeInfo: { _items: changeItems }
            };

            log.details('TAKEOFFAUTO', [
                ['equipsReturned', String(Object.keys(changeItems).length) + ' item kinds'],
                ['weaponUnlinked', weaponOut ? 'yes (' + weaponOut._weaponId + ')' : 'no'],
                ['gemsUnfixed', String(takeOffStoneIds.length)],
                ['gemsDeleted→items', String(delStoneIds.length)],
                ['power', String(statsResult.totalItems['21'] ? statsResult.totalItems['21']._num : '?')]
            ]);

            db._set(storageKey, savedData);

            log.info('TAKEOFFAUTO', 'success');
            console.groupEnd(); // End Processing

            // ═══ RESPONSE BUILD & AUDIT ═══
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            console.log('⏱️ Total Elapsed: ' + (Date.now() - _logT0) + 'ms');
            console.log('📋 Key Data:', {
                heroId: String(heroId),
                takeOffStones: takeOffStoneIds.length,
                delStones: delStoneIds.length,
                weapon: !!weaponOut,
                changeInfo: Object.keys(changeItems).length
            });
            console.groupEnd();

            callback(response);

        } catch (err) {
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            console.log('⏱️ Elapsed: ' + (Date.now() - _logT0) + 'ms');
            console.log('❌ UNCAUGHT ERROR:', err.message);
            console.groupEnd();
            log.error('TAKEOFFAUTO', 'UNCAUGHT ERROR', err);
            callback({}, 1);
        }
    }

    MainServer.registerHandler('equip', 'takeOffAuto', handleTakeOffAuto);
    window.MainServer = MainServer;

})();
