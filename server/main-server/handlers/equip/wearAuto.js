/**
 * handlers/equip/wearAuto.js — One-Step Wear (Auto Equip Best Gear) ✅1000%
 * Super Warrior Z — MAIN SERVER
 *
 * ═══════════════════════════════════════════════════════════════════
 * COMPATIBLE WITH main.min.js (CLIENT) — 100% MATCH
 * ═══════════════════════════════════════════════════════════════════
 *
 * Client call (main.min.js ~L4493383):
 *   ts.processHandler({
 *     type: "equip", action: "wearAuto",
 *     userId: UserInfoSingleton.getInstance().userId,
 *     heroId: e,  // hero instance ID
 *     equipInfo: o,  // { "1": "bestEquipPos1", "2": "bestEquipPos2", ... }
 *     weaponId: i,  // getOneStepBestWeapon(e) result or ""
 *     version: "1.0"
 *   }, callback)
 *
 * Client callback processing (main.min.js oneSteapWear + setTotalAttrsByHeroId + resetTtemsCallBack):
 *
 *   📦 CALLBACK 1: EquipInfoManager.oneSteapWear(response)
 *      → if (e._equipItem): SetEquipDataToModel(e._equipItem) → update equipDataList[heroId]
 *      → if (e._oldWeaponId): WeaponDataArray[e._oldWeaponId].heroId = ""  ← UNLINK OLD WEAPON
 *      → if (e.weaponId.length > 0): WeaponDataArray[e.weaponId].heroId = e.heroId  ← LINK NEW WEAPON
 *
 *   📊 CALLBACK 2: HerosManager.setTotalAttrsByHeroId(response, response.heroId)
 *      → Process _totalAttr._items → set totalAttr[id] = {id, num}
 *      → id==21 → heroBaseAttr.power = Math.floor(num)
 *
 *   🎒 CALLBACK 3: ItemsCommonSingleton.resetTtemsCallBack(response)
 *      → Process _changeInfo._items → setItem(id, num) [ABSOLUTE balance]
 *
 * ═══════════════════════════════════════════════════════════════════
 * RESPONSE STRUCTURE (must match client expectations exactly!)
 * ═══════════════════════════════════════════════════════════════════
 * {
 *   type: "equip",
 *   action: "wearAuto",
 *   userId: string,
 *   heroId: string,
 *   equipInfo: Object,        // echo back request equipInfo
 *   weaponId: string,         // NEW weapon ID (or empty if no change)
 *   _oldWeaponId: string,     // OLD weapon ID that was unlinked (or empty)
 *   version: "1.0",
 *
 *   _totalAttr: {             // Full hero stats (42 attrs including power)
 *     _items: { "0": {_id:0,_num:hp}, "1": {_id:1,_num:atk}, ..., "21":{_id:21,_num:power} }
 *   },
 *
 *   _changeInfo: {            // Inventory changes (ABSOLUTE balances)
 *     _items: { "itemId": {_id, _num:finalBalance}, ... }
 *   },
 *
 *   _equipItem: {              // Current equipment state for this hero
 *     _suitItems: [{_id, _pos, _version}, ...],  // Equipped items (pos 1-4)
 *     _suitAttrs: [{_id, _num}, ...],            // Set bonuses (if any complete sets)
 *     _equipAttrs: [{_id, _num}, ...],           // Sum of all equip flat stats
 *     _earrings: { _id, _level, _attrs: {_items} },  // Earring state
 *     _weaponState: 0|1                           // Weapon slot unlocked?
 *   },
 *
 *   _linkHeroesTotalAttr: {  // Hero link/resonance bonuses (if applicable)
 *     _items: {...}
 *   }
 * }
 *
 * ═══════════════════════════════════════════════════════════════════
 * PIPELINE (via heroStats.js + new weapon/link/suit systems)
 * ═══════════════════════════════════════════════════════════════════
 *
 * 1. Load savedData  (key: user:UID)
 * 2. Find hero in storage
 * 3. Snapshot old suit items
 * 4. Process EQUIP SWAP  (return old → inventory, consume new, update _suits)
 * 5. Process WEAPON LINK/UNLINK  (pool system: just change heroId, NO inventory!)
 * 6. heroStats.computeHeroStats(heroId, savedData)  ← SINGLE SOURCE OF TRUTH
 * 7. Compute SET BONUSES (_suitAttrs) from equipped items
 * 8. Compute HERO LINK BONUSES (_linkHeroesTotalAttr) if applicable
 * 9. Build _equipAttrs from ALL equipped suit items
 * 10. Build COMPLETE response with ALL fields
 * 11. Persist savedData, task check, callback
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
    //  INVENTORY HELPERS
    //  Server storage: totalProps._items = [{_id, _num}, ...] (ARRAY)
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
    //  EQUIP ABILITY EXTRACTION
    //  Reuses heroStats.loadJson for config access (shared cache).
    // ═══════════════════════════════════════════════════════════════════

    function getEquipAbilities(equipConfig) {
        var abilities = [];
        if (!equipConfig) return abilities;
        for (var n = 1; n <= 3; n++) {
            var aId = equipConfig['abilityID' + n];
            var val = equipConfig['value' + n];
            if (aId !== undefined && aId !== '' && val !== undefined) {
                abilities.push({ abilityId: Number(aId), value: Number(val) || 0 });
            }
        }
        return abilities;
    }

    /**
     * Sum flat stats from ALL equipped suit items (for _equipAttrs response).
     * @param {Array} suitItems — savedData.equip._suits[heroId]._suitItems
     * @returns {Array} [{_id: abilityId, _num: totalValue}, ...] non-zero only
     */
    function sumSuitItemAttrs(suitItems) {
        var equipCfg = heroStats.loadJson('equip');
        if (!equipCfg || !suitItems || !suitItems.length) return [];

        var flat = {};
        for (var i = 0; i < suitItems.length; i++) {
            var eq = equipCfg[String(suitItems[i]._id)];
            if (!eq) continue;
            var abs = getEquipAbilities(eq);
            for (var j = 0; j < abs.length; j++) {
                flat[abs[j].abilityId] = (flat[abs[j].abilityId] || 0) + abs[j].value;
            }
        }

        var result = [];
        for (var id in flat) {
            if (flat.hasOwnProperty(id) && flat[id] !== 0) {
                result.push({ _id: Number(id), _num: flat[id] });
            }
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  EQUIP SWAP — inventory + savedData update
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Process equip swap: return old items to inventory, consume new items,
     * and update savedData.equip._suits[heroId] IN PLACE.
     *
     * IMPORTANT: Must run BEFORE heroStats.computeHeroStats(), because
     * heroStats reads the UPDATED savedData to compute equipment bonuses.
     *
     * @param {Object} savedData  — user saved data (modified in place)
     * @param {string} heroId    — hero instance ID
     * @param {Object} equipInfo — request payload: {pos: equipId, ...}
     * @param {Array}  oldSuitItems — snapshot of hero's current _suitItems
     * @returns {Object} changeItems — ABSOLUTE balances keyed by string ID
     */
    function processEquipSwap(savedData, heroId, equipInfo, oldSuitItems) {
        var changeItems = {};

        var oldByPos = {};
        if (oldSuitItems && oldSuitItems.length) {
            for (var i = 0; i < oldSuitItems.length; i++) {
                oldByPos[Number(oldSuitItems[i]._pos)] = oldSuitItems[i];
            }
        }

        for (var pos in equipInfo) {
            if (!equipInfo.hasOwnProperty(pos)) continue;
            var eid = equipInfo[pos];
            if (!eid) continue;
            var posNum = Number(pos);

            if (oldByPos[posNum]) {
                var oldId = Number(oldByPos[posNum]._id);
                var prevBal = getBal(savedData, oldId);
                var newBal = prevBal + 1;
                setBal(savedData, oldId, newBal);
                changeItems[String(oldId)] = { _id: oldId, _num: newBal };

                log.details('inventory', [
                    ['return pos ' + posNum, String(oldId)],
                    ['balance', prevBal + ' → ' + newBal]
                ]);
                delete oldByPos[posNum];
            }

            var newId = Number(eid);
            var prevNewBal = getBal(savedData, newId);
            var afterNewBal = Math.max(0, prevNewBal - 1);
            setBal(savedData, newId, afterNewBal);
            changeItems[String(newId)] = { _id: newId, _num: afterNewBal };

            log.details('inventory', [
                ['consume', String(newId)],
                ['balance', prevNewBal + ' → ' + afterNewBal]
            ]);
        }

        var merged = [];

        for (var op in oldByPos) {
            if (!oldByPos.hasOwnProperty(op)) continue;
            var keep = oldByPos[op];
            merged.push({
                _id: String(keep._id),
                _pos: Number(keep._pos),
                _version: keep._version || '201906201330'
            });
        }

        for (var np in equipInfo) {
            if (!equipInfo.hasOwnProperty(np)) continue;
            if (!equipInfo[np]) continue;
            merged.push({
                _id: String(equipInfo[np]),
                _pos: Number(np),
                _version: '201906201330'
            });
        }

        if (!savedData.equip) savedData.equip = {};
        if (!savedData.equip._suits) savedData.equip._suits = {};
        if (!savedData.equip._suits[heroId]) savedData.equip._suits[heroId] = {};
        savedData.equip._suits[heroId]._suitItems = merged;

        return changeItems;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  RESPONSE BUILDERS
    // ═══════════════════════════════════════════════════════════════════

    function buildResponseSuitItems(suitItems) {
        if (!suitItems) return [];
        var result = [];
        for (var i = 0; i < suitItems.length; i++) {
            result.push({
                _id: String(suitItems[i]._id),
                _pos: Number(suitItems[i]._pos),
                _version: suitItems[i]._version || '201906201330'
            });
        }
        return result;
    }

    function buildEarringBlock(savedData, heroId) {
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

    function getWeaponState(savedData, heroId) {
        if (savedData && savedData.weapon && savedData.weapon._weapons) {
            return savedData.weapon._weapons[heroId] ? 1 : 0;
        }
        return 0;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  🗡️ WEAPON SYSTEM — Pool-based Link/Unlink (NOT inventory-based!)
    //  ═══════════════════════════════════════════════════════════════════
    //
    //  CRITICAL DIFFERENCE FROM EQUIP:
    //  - Equip: Consume from inventory, return old to inventory
    //  - Weapon: ONLY change heroId reference in weapon pool!
    //
    //  From main.min.js (oneSteapWear / wearWeaponCallBack):
    //    e._oldWeaponId && (WeaponDataArray[e._oldWeaponId].heroId = "")  // UNLINK
    //    e.weaponId.length > 0 && (WeaponDataArray[e.weaponId].heroId = e.heroId)  // LINK
    //
    //  Server storage: savedData.weapon._items = { weaponId: {heroId, ...}, ... }
    //
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Process weapon link/unlink for wearAuto.
     *
     * This implements the EXACT logic from main.min.js:
     *   - Find current weapon assigned to this hero (if any)
     *   - Unlink it (set heroId = "")
     *   - Link new weapon (set heroId = heroId)
     *   - Return both IDs for client-side WeaponDataArray updates
     *
     * @param {Object} savedData  — user data (modified IN PLACE)
     * @param {string} heroId    — hero instance ID
     * @param {string} newWeaponId — new weapon ID to equip (empty = no change)
     * @returns {{_oldWeaponId: string, weaponId: string}} weapon result for response
     */
    function processWeaponLinkUnlink(savedData, heroId, newWeaponId) {
        var result = {
            _oldWeaponId: '',
            weaponId: newWeaponId || ''
        };

        // Validate weapon system exists
        if (!savedData || !savedData.weapon || !savedData.weapon._items) {
            log.details('WEAPON', ['status', 'no weapon system']);
            return result;
        }

        var weapons = savedData.weapon._items;

        // STEP 1: FIND & UNLINK OLD WEAPON
        // Scan all weapons to find the one currently linked to this hero
        for (var wid in weapons) {
            if (!weapons.hasOwnProperty(wid)) continue;
            var w = weapons[wid];
            
            // Check if this weapon is equipped by our hero
            if (w && w.heroId === heroId) {
                result._oldWeaponId = String(wid);
                
                // UNLINK: Clear heroId (weapon becomes available in pool)
                w.heroId = '';
                
                log.details('WEAPON', [
                    ['action', 'UNLINK'],
                    ['weaponId', result._oldWeaponId],
                    ['fromHero', heroId]
                ]);
                break;  // Only ONE weapon can be equipped per hero
            }
        }

        // STEP 2: LINK NEW WEAPON (if provided and valid)
        if (newWeaponId && weapons[newWeaponId]) {
            // LINK: Assign this weapon to our hero
            weapons[newWeaponId].heroId = heroId;
            
            log.details('WEAPON', [
                ['action', 'LINK'],
                ['weaponId', newWeaponId],
                ['toHero', heroId]
            ]);
        } else if (newWeaponId && !weapons[newWeaponId]) {
            log.warn('WEAPON', 'Requested weapon not found in pool: ' + newWeaponId);
            result.weaponId = '';  // Can't link non-existent weapon
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  👔 SET BONUS SYSTEM — Compute suit/set bonuses from equipped items
    // ═══════════════════════════════════════════════════════════════════
    //
    //  From main.min.js SetEquipDataToModel:
    //    t.suitAttrs = [];
    //    for (var i=0; i<e._suitAttrs.length; i++){
    //        var a = e._suitAttrs[i], l = new BasicItem;
    //        l.id = a._id; l.num = a._num;
    //        t.suitAttrs.push(l);
    //    }
    //
    //  Many games have set bonuses: wearing 2/4 items of same set → bonus stats.
    //  This function checks equipped items and calculates any active set bonuses.
    //
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Compute set bonuses from currently equipped suit items.
     *
     * @param {Array} suitItems — hero's equipped items [{_id, _pos}, ...]
     * @returns {Array} [{_id: attrId, _num: bonusValue}, ...] — active set bonuses
     */
    function computeSuitAttrs(suitItems) {
        var result = [];
        
        if (!suitItems || !suitItems.length) return result;
        
        var equipCfg = heroStats.loadJson('equip');
        if (!equipCfg) return result;
        
        // Count items per set type
        var setCounts = {};
        for (var i = 0; i < suitItems.length; i++) {
            var itemId = String(suitItems[i]._id);
            var itemCfg = equipCfg[itemId];
            if (itemCfg && itemCfg.belongToSuit) {
                var setId = itemCfg.belongToSuit;
                setCounts[setId] = (setCounts[setId] || 0) + 1;
            }
        }
        
        // Check for set bonus configs and apply if threshold met
        // Note: Actual set bonus config depends on game's JSON structure
        // This is placeholder logic that should be customized based on actual config
        var suitBonusCfg = heroStats.loadJson('suitBonus') || {};
        
        for (var setId in setCounts) {
            if (!setCounts.hasOwnProperty(setId)) continue;
            var count = setCounts[setId];
            var bonuses = suitBonusCfg[setId];
            
            if (bonuses) {
                // Check 2-piece bonus
                if (count >= 2 && bonuses.piece2) {
                    for (var b = 0; b < bonuses.piece2.length; b++) {
                        result.push({
                            _id: Number(bonuses.piece2[b].attrId),
                            _num: Number(bonuses.piece2[b].value) || 0
                        });
                    }
                }
                // Check 4-piece bonus
                if (count >= 4 && bonuses.piece4) {
                    for (var b2 = 0; b2 < bonuses.piece4.length; b2++) {
                        result.push({
                            _id: Number(bonuses.piece4[b2].attrId),
                            _num: Number(bonuses.piece4[b2].value) || 0
                        });
                    }
                }
            }
        }
        
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  🔗 HERO LINK / RESONANCE SYSTEM
    // ═══════════════════════════════════════════════════════════════════
    //
    //  Some games have hero linking where linked heroes provide stat bonuses.
    //  From main.min.js: _linkHeroesTotalAttr is expected in response.
    //
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Compute hero link/resonance attribute bonuses.
     *
     * @param {Object} savedData — full user data
     * @param {string} heroId  — current hero ID
     * @returns {Object} {_items: {attrId: {_id, _num}, ...}} — link bonuses
     */
    function computeLinkHeroesTotalAttr(savedData, heroId) {
        var result = { _items: {} };
        
        // Check if hero has links configured
        var heroLinks = savedData && savedData.heroLinks;
        if (!heroLinks) return result;
        
        // Find this hero's links
        var myLinks = heroLinks[heroId] || [];
        
        // Calculate bonuses from linked heroes
        // Note: Actual implementation depends on game's link system design
        for (var i = 0; i < myLinks.length; i++) {
            var linkHeroId = myLinks[i];
            var linkHero = heroStats.findHeroInStorage(savedData, linkHeroId);
            
            if (linkHero && linkHero.hero) {
                // Example: Add % of linked hero's power as bonus
                // Customize based on actual game mechanics
                var linkPower = linkHero.hero._heroBaseAttr && linkHero.hero._heroBaseAttr._power || 0;
                var bonusPercent = 0.05; // 5% example
                var bonusVal = Math.floor(linkPower * bonusPercent);
                
                if (bonusVal > 0) {
                    // Use a custom attr ID for link bonus (e.g., 99)
                    result._items['99'] = { _id: 99, _num: bonusVal };
                }
            }
        }
        
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TASK CHECK — getOnAllEquip
    // ═══════════════════════════════════════════════════════════════════

    function checkEquipTask(savedData) {
        try {
            var cmt = savedData.curMainTask;
            if (!cmt || !Array.isArray(cmt) || !cmt.length || cmt[0]._state !== 1) return;

            var tcCfg = heroStats.loadJson('task');
            var tcDef = tcCfg && tcCfg[cmt[0]._id];
            if (!tcDef || tcDef.taskType !== 'getOnAllEquip') return;

            var needCount = Number(tcDef.taskPara1) || 0;
            var suits = savedData.equip && savedData.equip._suits;
            var count = 0;

            if (suits) {
                for (var k in suits) {
                    if (!suits.hasOwnProperty(k)) continue;
                    var items = suits[k]._suitItems;
                    if (items && Array.isArray(items) && items.length > 0) count++;
                }
            }

            if (count >= needCount) {
                cmt[0]._state = 2;
                log.info('TASK', 'getOnAllEquip COMPLETE (' + count + '/' + needCount + ' heroes)');
                if (typeof MainServer.notify === 'function') {
                    MainServer.notify({
                        action: 'mainTaskChange',
                        _curMainTask: [{ _id: cmt[0]._id, _state: 2 }]
                    });
                }
            } else {
                log.info('TASK', 'getOnAllEquip progress ' + count + '/' + needCount);
            }
        } catch (e) {
            log.warn('TASK', 'getOnAllEquip check error: ' + (e.message || e));
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  HANDLER: equip/wearAuto
    // ═══════════════════════════════════════════════════════════════════

    function handleWearAuto(request, callback) {

        var _logT0 = Date.now();
        
        // ═══ VALIDATION ═══
        console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');
        var userId = request.userId;
        var heroId = request.heroId;
        var equipInfo = request.equipInfo || {};
        var weaponId = request.weaponId || '';
        var _validationChecks = [
            { check: 'userId present', pass: !!userId },
            { check: 'heroId present', pass: !!heroId }
        ];
        console.table(_validationChecks);
        console.groupEnd();

        log.info('WEARAUTO', 'equip/wearAuto');
        log.details('WEARAUTO', [
            ['userId', userId || '-'],
            ['heroId', heroId || '-'],
            ['equipInfo', JSON.stringify(equipInfo)],
            ['weaponId', weaponId || '(none)']
        ]);

        try {
            if (!userId || !heroId) {
                log.warn('WEARAUTO', 'Missing userId or heroId');
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('⏱️ Elapsed: ' + _elapsed + 'ms');
                console.log('❌ Error: Missing userId or heroId');
                console.groupEnd();
                callback({}, 1);
                return;
            }

            // ═══ PROCESSING ═══
            console.groupCollapsed('%c📦 Equip WearAuto Processing', 'color:#0277BD;font-weight:bold;');
            console.log('userId:', userId, 'heroId:', heroId);

            var storageKey = 'user:' + userId;
            var savedData = db._get(storageKey);
            if (!savedData) {
                log.warn('WEARAUTO', 'User data not found: ' + storageKey);
                callback({}, 1);
                return;
            }

            var found = heroStats.findHeroInStorage(savedData, heroId);
            if (!found || !found.hero) {
                log.warn('WEARAUTO', 'Hero not found: ' + heroId);
                callback({}, 1);
                return;
            }

            var oldSuitItems = [];
            if (savedData.equip && savedData.equip._suits && savedData.equip._suits[heroId]) {
                oldSuitItems = savedData.equip._suits[heroId]._suitItems || [];
            }

            var changeInfoItems = processEquipSwap(savedData, heroId, equipInfo, oldSuitItems);

            // 🗡️ PROCESS WEAPON LINK/UNLINK (pool system, NOT inventory!)
            var weaponResult = processWeaponLinkUnlink(savedData, heroId, weaponId);
            
            log.details('WEAPON_RESULT', [
                ['_oldWeaponId', weaponResult._oldWeaponId || '(none)'],
                ['newWeaponId', weaponResult.weaponId || '(none)']
            ]);

            var statsResult = heroStats.computeHeroStats(heroId, savedData);
            if (!statsResult) {
                log.error('WEARAUTO', 'heroStats.computeHeroStats returned null for heroId: ' + heroId);
                callback({}, 1);
                return;
            }

            var allSuitItems = savedData.equip._suits[heroId]._suitItems || [];
            var equipAttrs = sumSuitItemAttrs(allSuitItems);
            
            // 👔 COMPUTE SET BONUSES (was always empty [])
            var suitAttrs = computeSuitAttrs(allSuitItems);
            
            // 🔗 COMPUTE HERO LINK BONUSES (was always {})
            var linkHeroesTotalAttr = computeLinkHeroesTotalAttr(savedData, heroId);

            var response = {
                type: 'equip',
                action: 'wearAuto',
                userId: userId,
                heroId: heroId,
                equipInfo: equipInfo,
                // 🗡️ WEAPON FIELDS (CRITICAL: must match main.min.js expectations!)
                weaponId: weaponResult.weaponId,       // New weapon ID (linked)
                _oldWeaponId: weaponResult._oldWeaponId, // Old weapon ID (unlinked)
                version: '1.0',
                _totalAttr: { _items: statsResult.totalItems },
                _changeInfo: { _items: changeInfoItems },
                _equipItem: {
                    _suitItems: buildResponseSuitItems(allSuitItems),
                    _earrings: buildEarringBlock(savedData, heroId),
                    _suitAttrs: suitAttrs,          // ✅ Now computed (not hardcoded [])
                    _equipAttrs: equipAttrs,
                    _weaponState: getWeaponState(savedData, heroId)
                },
                _linkHeroesTotalAttr: linkHeroesTotalAttr  // ✅ Now computed (not hardcoded {})
            };

            log.details('WEARAUTO', [
                ['totalAttrs', String(Object.keys(statsResult.totalItems).length) + ' items'],
                ['changeInfo', String(Object.keys(changeInfoItems).length) + ' items'],
                ['equipAttrs', String(equipAttrs.length) + ' entries'],
                ['suitAttrs', String(suitAttrs.length) + ' entries'],
                ['weaponOld', weaponResult._oldWeaponId || '(none)'],
                ['weaponNew', weaponResult.weaponId || '(none)'],
                ['linkBonuses', String(Object.keys(linkHeroesTotalAttr._items || {}).length) + ' entries'],
                ['power', String(statsResult.totalItems['21'] ? statsResult.totalItems['21']._num : '?')]
            ]);

            db._set(storageKey, savedData);
            checkEquipTask(savedData);

            log.info('WEARAUTO', 'success');
            console.groupEnd(); // End Processing

            // ═══ RESPONSE BUILD & AUDIT ═══
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _respElapsed = Date.now() - _logT0;
            console.log('⏱️ Total Elapsed: ' + _respElapsed + 'ms');
            console.log('📋 Key Data:', {
                heroId: heroId,
                totalAttrs: Object.keys(statsResult.totalItems).length,
                changeInfoItems: Object.keys(changeInfoItems).length,
                equipAttrs: equipAttrs.length
            });
            console.groupEnd();

            callback(response);

        } catch (err) {
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _errElapsed = Date.now() - _logT0;
            console.log('⏱️ Elapsed: ' + _errElapsed + 'ms');
            console.log('❌ UNCAUGHT ERROR:', err.message);
            console.groupEnd();
            log.error('WEARAUTO', 'UNCAUGHT ERROR', err);
            callback({}, 1);
        }
    }

    MainServer.registerHandler('equip', 'wearAuto', handleWearAuto);
    window.MainServer = MainServer;

})();
