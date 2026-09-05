/**
 * handlers/snake/getEnemyInfo.js — Snake Dungeon Enemy Info Handler
 * Super Warrior Z — MAIN SERVER
 *
 * Bot players dengan team pre-built.
 */

(function () {
    'use strict';

    var MainServer = window.MainServer;
    var log = MainServer.log;
    var db = window.MainServerDB;

    var SNAKE_HERO_LEVEL = 40;
    var SNAKE_DUNGEON_MAX_LESSON = 10;

    // ═══════════════════════════════════════════════════════════
    //  BOT PLAYERS — 10 bots, 1 per floor
    // ═══════════════════════════════════════════════════════════

    var SNAKE_BOTS = {
        1:  { name: 'Enemy Floor 1',  heroes: [1201, 1202, 1206, 1207, 1209] },
        2:  { name: 'Enemy Floor 2',  heroes: [1201, 1202, 1206, 1301, 1302] },
        3:  { name: 'Enemy Floor 3',  heroes: [1301, 1302, 1305, 1307, 1308] },
        4:  { name: 'Enemy Floor 4',  heroes: [1301, 1302, 1305, 1309, 1310] },
        5:  { name: 'Enemy Floor 5',  heroes: [1307, 1308, 1309, 1310, 1402] },
        6:  { name: 'Enemy Floor 6',  heroes: [1402, 1403, 1404, 1405, 1301] },
        7:  { name: 'Enemy Floor 7',  heroes: [1402, 1403, 1404, 1405, 1410] },
        8:  { name: 'Enemy Floor 8',  heroes: [1402, 1403, 1410, 1411, 1412] },
        9:  { name: 'Enemy Floor 9',  heroes: [1503, 1504, 1506, 1507, 1508] },
        10: { name: 'Enemy Floor 10', heroes: [1503, 1504, 1506, 1507, 1508] }
    };

    // ═══════════════════════════════════════════════════════════
    //  CONFIG LOADER
    // ═══════════════════════════════════════════════════════════

    var _resourceCache = {};

    function loadJsonSync(name) {
        if (_resourceCache[name]) return _resourceCache[name];
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './resource/json/' + name + '.json', false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
                _resourceCache[name] = JSON.parse(xhr.responseText);
                return _resourceCache[name];
            }
        } catch (e) {
            log.error('RESOURCE', 'getEnemyInfo failed to load: ' + name + '.json — ' + e.message);
        }
        return null;
    }

    function getSnakeDungeonConfig() { return loadJsonSync('snakeDungeon'); }
    function getHeroConfig(id) { var h = loadJsonSync('hero'); return h ? h[String(id)] : null; }
    function getHeroLevelAttr(level) { var la = loadJsonSync('heroLevelAttr'); return la ? la[String(level)] : null; }
    function getHeroTypeParam(type) { var tp = loadJsonSync('heroTypeParam'); return tp ? tp[String(type)] : null; }
    function getHeroQualityParam(quality) { var qp = loadJsonSync('heroQualityParam'); return qp ? qp[String(quality)] : null; }

    // ═══════════════════════════════════════════════════════════
    //  COMPUTE HERO HP
    // ═══════════════════════════════════════════════════════════

    function computeHeroHP(heroDisplayId, level, difficulty) {
        var hc = getHeroConfig(heroDisplayId) || {};
        var quality = hc.quality || 'purple';
        var heroType = hc.heroType || 'critical';
        var la = getHeroLevelAttr(level) || {};
        var tp = getHeroTypeParam(heroType) || {};
        var qp = getHeroQualityParam(quality) || {};

        var baseHp = (Number(la.hp) || 0) * (Number(tp.hpParam) || 0) + (Number(tp.hpBais) || 0);
        baseHp *= (Number(qp.hpParam) || 1) * (Number(hc.balanceHp) || 1);
        baseHp *= (difficulty || 1);
        if (baseHp < 1000) baseHp = 1000;
        return Math.floor(baseHp);
    }

    // ═══════════════════════════════════════════════════════════
    //  BUILD ENEMY TEAM from BOT config
    // ═══════════════════════════════════════════════════════════

    function buildEnemyTeam(botConfig, level, difficulty) {
        var teamInfo = {};
        var totalPower = 0;
        var heroIds = botConfig.heroes;

        for (var i = 0; i < heroIds.length; i++) {
            var hp = computeHeroHP(heroIds[i], level, difficulty);
            teamInfo[String(i)] = {
                heroDisplayId: heroIds[i],
                level: level,
                star: 0,
                curHp: hp,
                totalHp: hp,
                skinId: 0
            };
            totalPower += hp;
        }
        return { teamInfo: teamInfo, totalPower: totalPower };
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN HANDLER
    // ═══════════════════════════════════════════════════════════

    function handleGetEnemyInfo(request, callback) {

        var _logT0 = Date.now();
        
        console.groupCollapsed('%c🐍 SNAKE getEnemyInfo', 'color:#2E7D32;font-weight:bold;font-size:12px;background:#E8F5E9;padding:4px 8px;border-radius:6px;border-left:4px solid #2E7D32;');
        var userId = request && request.userId;
        var lessId = Number(request && request.lessId);

        log.info('SNAKE', 'snake/getEnemyInfo START — userId=' + (userId || '-')
            + ', lessId=' + lessId);

        try {

            // ═══ VALIDATION ═══
            console.groupCollapsed('%c✅ Validation', 'color:#2E7D32;font-weight:bold;');

            if (!userId) {
                console.warn('   ❌ Missing userId');
                console.groupEnd(); // close Validation
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (missing userId)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                callback({}, 1); return;
            }
            console.log('   ✅ userId present: ' + userId);

            if (!lessId || lessId < 1 || lessId > SNAKE_DUNGEON_MAX_LESSON) {
                console.warn('   ❌ Invalid lessId: ' + lessId);
                console.groupEnd(); // close Validation
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (invalid lessId)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                callback({}, 1); return;
            }
            console.log('   ✅ lessId valid: ' + lessId);
            console.groupEnd(); // close Validation

            // ═══ ENEMY INFO PROCESSING ═══
            console.groupCollapsed('%c🐍 Enemy Info Processing', 'color:#0277BD;font-weight:bold;');

            var dungeonConfig = getSnakeDungeonConfig();
            if (!dungeonConfig) {
                console.error('   ❌ Dungeon config not found');
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (config error)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                callback({}, 1); return;
            }

            var stageConfig = dungeonConfig[String(lessId)];
            if (!stageConfig) {
                console.warn('   ❌ Stage config not found for id: ' + lessId);
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (stage not found)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                callback({}, 1); return;
            }

            var difficulty = Number(stageConfig.difficulty) || 1;
            var bot = SNAKE_BOTS[lessId];
            if (!bot) {
                console.warn('   ❌ Bot config not found for floor: ' + lessId);
                console.groupEnd(); // close Processing
                console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
                var _elapsed = Date.now() - _logT0;
                console.log('   ⏱️ ' + _elapsed + 'ms | ret=1 (bot not found)');
                console.groupEnd();
                console.groupEnd(); // close SNAKE group
                
                callback({}, 1); return;
            }

            var teamData = buildEnemyTeam(bot, SNAKE_HERO_LEVEL, difficulty);
            var firstHeroId = bot.heroes[0];

            var response = {
                _nickName: bot.name,
                _headImage: 'hero_icon_' + firstHeroId,
                _level: SNAKE_HERO_LEVEL,
                _guildName: '',
                _totalPower: teamData.totalPower,
                _enemyUserId: 'bot_snake_' + lessId,
                _teamInfo: teamData.teamInfo,
                _superSkill: []
            };

            log.info('SNAKE', 'getEnemyInfo SUCCESS — '
                + 'lessId=' + lessId + ', bot=' + bot.name
                + ', difficulty=' + difficulty
                + ', totalPower=' + teamData.totalPower);
            
            console.log('   ✅ Enemy info built: floor=' + lessId + ' bot=' + bot.name + ' power=' + teamData.totalPower);

            console.groupEnd(); // close Processing
            console.groupCollapsed('%c📤 Response Build & Audit', 'color:#1565C0;font-weight:bold;');
            var _elapsed = Date.now() - _logT0;
            console.log('   ⏱️ ' + _elapsed + 'ms | lessId=' + lessId + ' bot=' + bot.name);
            console.table({
                'Enemy': { floor: lessId, name: bot.name, difficulty: difficulty, totalPower: teamData.totalPower, heroCount: bot.heroes.length }
            });
            console.groupEnd();
            console.groupEnd(); // close SNAKE group

            callback(response);

        } catch (err) {
            console.error('   ❌ UNCAUGHT ERROR: ' + err.message);
            console.groupEnd(); // close any open groups
            console.groupEnd(); // close SNAKE group
            
            log.error('SNAKE', 'getEnemyInfo UNCAUGHT ERROR — '
                + (err && err.name) + ': ' + (err && err.message));
            callback({}, 1);
        }
    }

    MainServer.registerHandler('snake', 'getEnemyInfo', handleGetEnemyInfo);
})();
