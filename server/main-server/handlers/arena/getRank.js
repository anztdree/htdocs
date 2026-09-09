/**
 * handlers/arena/getRank.js — Arena Leaderboard Handler (BARU)
 * Super Warrior Z — MAIN SERVER
 *
 * ============================================================
 *  KONTRAK CLIENT (verbatim main.min.js):
 * ============================================================
 *
 *  CALL SITE 1 @5838067 (ArenaMain rankBtnTap):
 *    ts.processHandler({type:"arena",action:"getRank",
 *        userId:..., start:1, end:20, version:"1.0"},
 *      function(e){ ts.openWindow("ArenaRank",{parent:"arena",value:e,
 *          myRank:t._rank, team:t._lastDenfenceTeamDisplay}) })
 *
 *  CALL SITE 2 @5868592 (ArenaRankViewData.request — paging):
 *    var o = t+6, a = t+26;
 *    processHandler({...,start:o,end:a}, function(e){ n.updateList(e) })
 *
 *  ArenaRankViewData.updateList (verbatim):
 *    var n = e._rank;  for (o=0;o<n.length;o++) rankArray.push(n[o]);
 *    → new ArenaOtherTeam(); r.init(n[a])
 *
 *  ArenaOtherTeam.init (verbatim):
 *    _nickName=e._basic._nickName, _level=e._basic._level,
 *    _headImage=e._basic._headImage, _rank=e._rank,
 *    _vip=e._basic._vip, _id=e._id,
 *    _headEffect=e._basic._headEffect, _headBox=e._basic._headBox,
 *    _guildName=e._basic._guildName,
 *    team dari e._lastDenfenceTeam (values):
 *      _heroDisplayId, _heroStar, _heroLevel,
 *      power=Math.floor(_attrs._items[21]._num),
 *      _skinId, _weaponHaloId, _weaponHaloLevel
 *    sort by _rank asc (sortEnemyList)
 *
 * ============================================================
 *  SUMBER DATA (config resource/json):
 * ============================================================
 *  arenaRobot.json  — 13 baris rankStart..rankEnd → robotID (bisa csv)
 *  robotPlayer.json — detail robot: enemyList, enemyLevel, difficultyHp,
 *                     difficultyAttack, userLevel
 *  hero.json + heroLevelAttr.json — formula stats enemy (sama join/select)
 *  language.json    — nama robot (nama hero pertama)
 *
 *  Rank player: savedData._arenaRank (persist oleh startBattle/setTeam).
 *  Jika rank player ∈ [start..end] → entri PEMAIN disisipkan (bukan robot).
 *
 *  Deterministic robot per rank: list = robotID.split(','),
 *  pick = list[(rank - rankStart) % list.length] — rank sama selalu
 *  menampilkan robot sama (leaderboard stabil antar refresh).
 *
 * ============================================================
 *  RESPONSE FORMAT:
 * ============================================================
 *  { _rank: [ { _id, _rank, _basic:{_nickName,_level,_headImage,_vip,
 *              _headEffect,_headBox,_guildName},
 *              _lastDenfenceTeam:{...}, _lastDenfenceSuperSkill:{...} } ] }
 *  (urut _rank ASC)
 * ============================================================
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    var RET_CODES = {
        OK: 0,
        MISSING_USERID: 8,   // errorDefine 8 = ERROR_LACK_PARAM (window)
        USER_NOT_FOUND: 2,   // errorDefine 2 = ERROR_STATE_ERROR (window)
        SERVER_ERROR: 1      // errorDefine 1 = ERROR_UNKNOWN (window)
    };

    // ═══════════════════════════════════════════════════════════
    //  CONFIG LOADING (sync XHR + cache — pola join.js)
    // ═══════════════════════════════════════════════════════════

    var _cache = {};

    function loadJson(url, name) {
        if (_cache[url]) return _cache[url];
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                _cache[url] = JSON.parse(xhr.responseText);
                return _cache[url];
            }
        } catch (e) {
            log.warn('ARENA_RANK', 'Failed to load ' + name + ' — ' + e.message);
        }
        log.warn('ARENA_RANK', name + ' unavailable, using empty object');
        return {};
    }

    function getArenaRobotCfg() { return loadJson('./resource/json/arenaRobot.json', 'arenaRobot.json'); }
    function getRobotPlayerCfg() { return loadJson('./resource/json/robotPlayer.json', 'robotPlayer.json'); }
    function getHeroCfg() { return loadJson('./resource/json/hero.json', 'hero.json'); }
    function getHeroLevelAttrCfg() { return loadJson('./resource/json/heroLevelAttr.json', 'heroLevelAttr.json'); }
    function getLanguageCfg() { return loadJson('./resource/json/language.json', 'language.json'); }

    function getHeroName(heroDisplayId) {
        var hero = getHeroCfg()[String(heroDisplayId)];
        if (!hero || !hero.name) return 'Hero_' + heroDisplayId;
        var le = getLanguageCfg()[hero.name];
        return (le && le.cn) ? le.cn : hero.name;
    }

    // ═══════════════════════════════════════════════════════════
    //  ENEMY FORMULA (identik join.js computeEnemyAttrs — dungeon style)
    // ═══════════════════════════════════════════════════════════

    function computeEnemyAttrs(heroData, level, diffHp, diffAtk) {
        var lvlData = getHeroLevelAttrCfg()[String(level)] ||
                      getHeroLevelAttrCfg()['1'] || { hp: 1240, attack: 125, armor: 205 };

        var laHp = Number(lvlData.hp) || 1240;
        var laAttack = Number(lvlData.attack) || 125;
        var laArmor = Number(lvlData.armor) || 205;

        var heroType = heroData.heroType || heroData.type || 'strength';
        var typeCategory;
        if (heroType === 'critical' || heroType === 'criticalSingle' || heroType === 'hit') {
            typeCategory = 'ATK';
        } else if (heroType === 'body' || heroType === 'block' || heroType === 'dodge' ||
                   heroType === 'armor' || heroType === 'armorS' || heroType === 'bodyDamage') {
            typeCategory = 'TANK';
        } else {
            typeCategory = 'SKL';
        }

        var hpBase;
        if (typeCategory === 'SKL') hpBase = Math.floor(laHp / 2 - 240);
        else if (typeCategory === 'ATK') hpBase = Math.floor(laHp / 2 - 14 * level - 290);
        else hpBase = Math.floor(laHp / 2 + 412);

        var atkBase;
        if (typeCategory === 'SKL') atkBase = 13 * level + 47;
        else if (typeCategory === 'ATK') atkBase = Math.round(12.25 * level + 51);
        else atkBase = Math.round(9 * level + 1);

        var finalHp = hpBase * (diffHp || 1);
        var finalAtk = atkBase * (diffAtk || 1);
        var finalArmor = laArmor - 21;

        var speed = Number(heroData.speed) || 180;
        var hit, crit, critDmg, dodge, block, critResist;
        if (typeCategory === 'SKL') {
            hit = level / 14000; crit = hit * 2.5; critDmg = crit * 1.5;
            dodge = 0; block = 0; critResist = 0;
        } else if (typeCategory === 'ATK') {
            hit = level / 2000; crit = hit * 0.5; critDmg = 0.3;
            dodge = 0; block = 0; critResist = 0;
        } else {
            hit = level / 3043; crit = hit * 0.5; critDmg = hit;
            dodge = level / 2500; block = level / 8000; critResist = level / 6667;
        }

        var balancePower = Number(heroData.balancePower) || 1;
        var ATK_WEIGHTS = {
            'critical': 20, 'criticalSingle': 20, 'hit': 20,
            'skill': 15, 'body': 15, 'block': 15, 'armor': 15,
            'armorDamage': 15, 'armorS': 15, 'bodyDamage': 15,
            'dodge': 15, 'strength': 15, 'dot': 15
        };
        var atkWeight = ATK_WEIGHTS[heroType] || 15;
        var power = Math.floor(finalHp * balancePower + finalAtk * atkWeight + finalArmor);

        var items = {};
        items['0'] = { _id: 0,  _num: finalHp };
        items['1'] = { _id: 1,  _num: finalAtk };
        items['2'] = { _id: 2,  _num: finalArmor };
        items['3'] = { _id: 3,  _num: speed };
        items['4'] = { _id: 4,  _num: hit };
        items['5'] = { _id: 5,  _num: dodge };
        items['6'] = { _id: 6,  _num: block };
        items['7'] = { _id: 7,  _num: 0 };
        items['8'] = { _id: 8,  _num: 0 };
        items['9'] = { _id: 9,  _num: crit };
        items['10'] = { _id: 10, _num: critResist };
        items['11'] = { _id: 11, _num: critDmg };
        items['16'] = { _id: 16, _num: 50 };
        items['21'] = { _id: 21, _num: power };
        items['22'] = { _id: 22, _num: finalHp };
        items['41'] = { _id: 41, _num: Number(heroData.energyMax) || 100 };

        return { _items: items };
    }

    function buildEnemySkills(heroData) {
        var skills = {};
        if (heroData.normal) {
            skills[String(heroData.normal)] = { _type: 0, _id: heroData.normal, _level: 1 };
        }
        if (heroData.skill) {
            skills[String(heroData.skill)] = { _type: 1, _id: heroData.skill, _level: 1 };
        }
        return skills;
    }

    function lookupHero(heroDisplayId) {
        var heroCfg = getHeroCfg();
        return heroCfg[String(heroDisplayId)] || heroCfg[heroDisplayId] || null;
    }

    // ═══════════════════════════════════════════════════════════
    //  ROBOT ENTRY BUILDERS (identik join.js)
    // ═══════════════════════════════════════════════════════════

    function buildRobotHeroEntry(heroDisplayId, level, diffHp, diffAtk) {
        if (!heroDisplayId || heroDisplayId <= 0) return null;
        var heroData = lookupHero(heroDisplayId);
        if (!heroData) return null;

        return {
            _id: String(heroDisplayId),
            _heroDisplayId: heroDisplayId,
            _heroStar: 0,
            _heroLevel: level,
            _skinId: 0,
            _weaponHaloId: 0,
            _weaponHaloLevel: 0,
            _skills: buildEnemySkills(heroData),
            _attrs: computeEnemyAttrs(heroData, level, diffHp, diffAtk)
        };
    }

    function buildRobotDefenseTeam(robotData) {
        var team = {};
        if (!robotData) return team;

        var heroIds = String(robotData.enemyList || '').split(',');
        var levels = String(robotData.enemyLevel || '').split(',');
        var diffHps = String(robotData.difficultyHp || '').split(',');
        var diffAtks = String(robotData.difficultyAttack || '').split(',');

        for (var i = 0; i < heroIds.length && i < 5; i++) {
            var displayId = parseInt(heroIds[i], 10);
            var level = parseInt(levels[i], 10) || 1;
            var diffHp = parseFloat(diffHps[i]) || 1;
            var diffAtk = parseFloat(diffAtks[i]) || 1;
            var entry = buildRobotHeroEntry(displayId, level, diffHp, diffAtk);
            if (entry) team[String(i)] = entry;
        }
        return team;
    }

    // Cari baris arenaRobot.json yang mencakup rank, lalu pilih robot
    // secara DETERMINISTIC (rank sama → robot sama).
    function resolveRobotIdForRank(rank) {
        var cfg = getArenaRobotCfg();
        for (var k in cfg) {
            if (!cfg.hasOwnProperty(k)) continue;
            var e = cfg[k];
            if (!e) continue;
            var rs = Number(e.rankStart), re = Number(e.rankEnd);
            if (rank >= rs && rank <= re) {
                var ids = String(e.robotID || '').split(',');
                if (ids.length === 0 || !ids[0]) return null;
                var idx = (rank - rs) % ids.length;
                return ids[idx];
            }
        }
        return null;
    }

    function buildRobotLeaderboardEntry(robotId, rank) {
        var robotData = getRobotPlayerCfg()[String(robotId)];
        if (!robotData) {
            log.warn('ARENA_RANK', 'Robot ' + robotId + ' not found in robotPlayer.json');
            return null;
        }

        var firstHeroId = 0;
        var heroIds = String(robotData.enemyList || '').split(',');
        if (heroIds.length > 0) firstHeroId = parseInt(heroIds[0], 10) || 0;

        return {
            _id: String(robotId),
            _rank: rank,
            _basic: {
                _nickName: getHeroName(firstHeroId),
                _level: robotData.userLevel || 60,
                _headImage: 'hero_icon_1904',  // FIX R1: icon robot 1904 (arah user)
                _vip: 0,
                _headEffect: 0,
                _headBox: 0,
                _guildName: ''
            },
            _lastDenfenceTeam: buildRobotDefenseTeam(robotData),
            _lastDenfenceSuperSkill: {}
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  PLAYER ENTRY (jika rank player masuk range)
    //  Team = defense team (prioritas: arenaState._defenseTeamFull →
    //  rebuild dari savedData._arenaTeam + hero collection) — pola join.js
    // ═══════════════════════════════════════════════════════════

    function buildPlayerHeroEntry(heroDef) {
        if (!heroDef) return null;
        var displayId = Number(heroDef._heroDisplayId || heroDef._heroId) || 0;
        if (displayId <= 0) return null;
        if (!getHeroCfg()[String(displayId)]) return null;

        var heroId = heroDef._id ? String(heroDef._id) : String(displayId);
        var attrs = (heroDef._attrs && heroDef._attrs._items)
            ? heroDef._attrs
            : { _items: {
                '0': { _id: 0, _num: Number(heroDef._hp) || 0 },
                '1': { _id: 1, _num: Number(heroDef._attack) || 0 },
                '2': { _id: 2, _num: Number(heroDef._armor) || 0 },
                '21': { _id: 21, _num: Number(heroDef._power) || 0 }
            } };

        return {
            _id: heroId,
            _heroId: heroId,
            _heroDisplayId: displayId,
            _heroStar: Number(heroDef._heroStar) || 0,
            _heroLevel: Number(heroDef._heroLevel) || 1,
            _skinId: heroDef._skinId || 0,
            _weaponHaloId: heroDef._weaponHaloId || 0,
            _weaponHaloLevel: heroDef._weaponHaloLevel || 0,
            _attrs: attrs
        };
    }

    function buildPlayerLeaderboardEntry(savedData, arenaState, rank) {
        var team = {};

        // Priority 1: full team cache dari setTeam (in-memory)
        if (arenaState && arenaState._defenseTeamFull) {
            var full = arenaState._defenseTeamFull;
            for (var k in full) {
                if (full.hasOwnProperty(k) && full[k]) team[k] = full[k];
            }
        }

        // Priority 2: rebuild dari savedData._arenaTeam + hero collection
        if (Object.keys(team).length === 0 && Array.isArray(savedData._arenaTeam)) {
            var heros = (savedData.heros && savedData.heros._heros) || savedData._heros || null;
            if (heros) {
                for (var i = 0; i < savedData._arenaTeam.length && i < 5; i++) {
                    var slot = savedData._arenaTeam[i];
                    if (!slot || !slot._id) continue;
                    var heroId = String(slot._id);
                    for (var hk in heros) {
                        if (!heros.hasOwnProperty(hk)) continue;
                        var h = heros[hk];
                        if (!h) continue;
                        if (String(h._heroId || '') === heroId || String(h._id || '') === heroId) {
                            var entry = buildPlayerHeroEntry(h);
                            if (entry) team[String(i)] = entry;
                            break;
                        }
                    }
                }
            }
        }

        // Super defense
        var sup = {};
        if (arenaState && arenaState._defenseSuperFull) {
            sup = arenaState._defenseSuperFull;
        } else if (Array.isArray(savedData._arenaSuper)) {
            for (var j = 0; j < savedData._arenaSuper.length; j++) {
                if (savedData._arenaSuper[j] && savedData._arenaSuper[j]._id) {
                    sup[String(j)] = { _id: String(savedData._arenaSuper[j]._id), _level: 1 };
                }
            }
        }

        var headImage = 'head_0';
        var nick = 'Player';
        if (savedData.headImage) headImage = String(savedData.headImage);
        if (savedData._nickName) nick = String(savedData._nickName);
        else if (savedData.nickName) nick = String(savedData.nickName);

        var lvl = 1;
        if (savedData.scheduleInfo && Number(savedData.scheduleInfo._userLevel)) {
            lvl = Number(savedData.scheduleInfo._userLevel);
        } else if (savedData.totalProps && savedData.totalProps._items) {
            for (var p = 0; p < savedData.totalProps._items.length; p++) {
                if (Number(savedData.totalProps._items[p]._id) === 104) {
                    lvl = Number(savedData.totalProps._items[p]._num) || 1;
                    break;
                }
            }
        }

        return {
            _id: String(savedData._id || savedData.userId || ''),
            _rank: rank,
            _basic: {
                _nickName: nick,
                _level: lvl,
                _headImage: headImage,
                _vip: Number(savedData._vip) || 0,
                _headEffect: 0,
                _headBox: 0,
                _guildName: savedData._guildName || ''
            },
            _lastDenfenceTeam: team,
            _lastDenfenceSuperSkill: sup
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN HANDLER
    // ═══════════════════════════════════════════════════════════

    function handleArenaGetRank(request, callback) {
        var userId = request.userId;
        var start = Math.max(1, parseInt(request.start, 10) || 1);
        var end = Math.max(start, parseInt(request.end, 10) || (start + 19));

        log.info('ARENA_RANK', 'arena/getRank processing — start=' + start + ' end=' + end);
        log.details('request', [
            ['userId', userId || '-'],
            ['start', String(start)],
            ['end', String(end)]
        ]);

        try {
            if (!userId) {
                log.warn('ARENA_RANK', 'missing userId');
                callback(buildError(RET_CODES.MISSING_USERID, 'userId tidak boleh kosong'), RET_CODES.MISSING_USERID);
                return;
            }

            var savedData = db._get('user:' + userId);
            if (!savedData) {
                log.warn('ARENA_RANK', 'user not found: ' + userId);
                callback(buildError(RET_CODES.USER_NOT_FOUND, 'User tidak ditemukan'), RET_CODES.USER_NOT_FOUND);
                return;
            }

            var arenaState = (MainServer._arenaStates && MainServer._arenaStates[userId]) || null;
            var playerRank = (arenaState && typeof arenaState._rank === 'number')
                ? arenaState._rank
                : ((typeof savedData._arenaRank === 'number') ? savedData._arenaRank : 2001);

            var list = [];
            for (var rank = start; rank <= end; rank++) {
                if (rank === playerRank) {
                    // Entri PEMAIN sendiri (bukan robot)
                    list.push(buildPlayerLeaderboardEntry(savedData, arenaState, rank));
                } else {
                    var robotId = resolveRobotIdForRank(rank);
                    if (!robotId) continue;
                    var entry = buildRobotLeaderboardEntry(robotId, rank);
                    if (entry) list.push(entry);
                }
            }

            // Urutkan _rank ASC (client juga sort, tapi kirim rapi)
            list.sort(function (a, b) { return (a._rank > b._rank) ? 1 : -1; });

            log.info('ARENA_RANK', 'rank list ready — entries=' + list.length +
                ' playerRank=' + playerRank +
                (playerRank >= start && playerRank <= end ? ' (player included)' : ''));

            callback({ _rank: list });

        } catch (err) {
            log.error('ARENA_RANK', 'arena/getRank UNCAUGHT ERROR', err);
            callback(buildError(RET_CODES.SERVER_ERROR, err.message || 'Unknown error'), RET_CODES.SERVER_ERROR);
        }
    }

    MainServer.registerHandler('arena', 'getRank', handleArenaGetRank);

    window.MainServer = MainServer;
})();
