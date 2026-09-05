/**
 * actions/saveHistory.js — Handle SaveHistory action
 * Super Warrior Z — LOGIN SERVER
 *
 * Token permanen: 1 user = 1 token, generated ONCE, reused FOREVER.
 * Data source: IndexedDB (login-server / loginInfo)
 * Style: TIMELINE FEED - Nested Dropdown, No Box!
 */

(function () {
    'use strict';

    var LoginServer = window.LoginServer;
    var log = LoginServer.log;
    var db = LoginServer.db;

    function getTodayStr() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    // ═══════════════════════════════════════════════════════════════════
    // HANDLER: SaveHistory - TIMELINE FEED STYLE (SUPER DETAIL)
    // ═══════════════════════════════════════════════════════════════════

    function handleSaveHistory(request, callback) {
        // ──────────────────────────────────────────────────────────────
        // HEADER
        // ──────────────────────────────────────────────────────────────
        log.tag('SaveHistory');
        log.section('💾', 'SaveHistory', 'Recording session & generating token...');

        // ──────────────────────────────────────────────────────────────
        // DROPDOWN 1: Request Payload (NESTED TREE)
        // ──────────────────────────────────────────────────────────────
        log.dropdown('📥', 'Request Payload');
        
        var reqKeys = Object.keys(request || {});
        
        log.dropdownSection('🔑', 'Authentication Data');
        
        var userId = request.accountToken || '';
        var securityCode = request.securityCode || '';
        
        log.dropdownSubItem('🆔', 'Account Token', userId, false);
        log.dropdownSubItem('🔑', 'Security Code', securityCode, true);
        
        log.divider();
        
        log.dropdownSection('📋', 'Session Context');
        
        var channelCode = request.channelCode || 'ppgame';
        var serverId = request.serverId || '';
        
        log.dropdownSubItem('💬', 'Channel', channelCode, false);
        log.dropdownSubItem('🏠', 'Server ID', serverId || '(empty)', true);

        // ──────────────────────────────────────────────────────────────
        // DATABASE OPERATION
        // ──────────────────────────────────────────────────────────────
        db.get(userId).then(function (acc) {
            var now = LoginServer.nowSeconds();
            var today = getTodayStr();

            if (!acc) {
                // ══════════════════════════════════════════════════════
                // SCENARIO A: NEW USER (First Session)
                // ══════════════════════════════════════════════════════
                acc = {
                    userId: userId,
                    password: '',
                    channelCode: channelCode,
                    nickName: '',
                    securityCode: securityCode,
                    loginToken: LoginServer.generateToken(),
                    createTime: now,
                    lastLoginTime: now,
                    todayLoginCount: 1,
                    loginDate: today,
                    language: 'en',
                    history: serverId ? [serverId] : []
                };

                // DROPDOWN: New User Registration
                log.dropdown('✨', 'New User - First Session');
                
                log.dropdownSection('🎫', 'Token Certificate');
                log.dropdownSubItem('🆕', 'Status', 'NEW TOKEN GENERATED', false);
                log.dropdownSubItem('🎟️', 'Token Preview', acc.loginToken || '(empty)', true);
                
                log.divider();
                
                log.dropdownSection('📊', 'Session Statistics');
                log.dropdownSubItem('#️⃣', 'Login Count', '1 (first time!)', false);
                log.dropdownSubItem('📅', 'Login Date', today, true);
                
                log.divider();
                
                log.dropdownSection('💾', 'Storage Info');
                log.dropdownSubItem('🗄️', 'Database', 'IndexedDB (local)', false);
                log.dropdownSubItem('📁', 'Location', 'login-server / loginInfo', true);

            } else {
                // ══════════════════════════════════════════════════════
                // SCENARIO B: RETURNING USER
                // ══════════════════════════════════════════════════════
                
                // Generate token if not exists
                if (!acc.loginToken) {
                    acc.loginToken = LoginServer.generateToken();
                }
                
                // Reset daily counter if new day
                if (acc.loginDate !== today) {
                    acc.todayLoginCount = 1;
                    acc.loginDate = today;
                } else {
                    acc.todayLoginCount = (acc.todayLoginCount || 0) + 1;
                }
                
                acc.lastLoginTime = now;

                // Update history with new server
                if (serverId) {
                    acc.history = acc.history || [];
                    var existingIdx = acc.history.indexOf(serverId);
                    if (existingIdx !== -1) {
                        acc.history.splice(existingIdx, 1);
                    }
                    acc.history.unshift(serverId);
                    if (acc.history.length > 10) {
                        acc.history = acc.history.slice(0, 10);
                    }
                }

                // DROPDOWN: Returning User Session
                log.dropdown('👤', 'Returning User Session');
                
                log.dropdownSection('🎫', 'Token Status');
                log.dropdownSubItem('♾️', 'Policy', 'PERMANENT (reusable)', false);
                log.dropdownSubItem('🎟️', 'Token Preview', acc.loginToken || '(empty)', true);
                
                log.divider();
                
                log.dropdownSection('📊', 'Login Statistics');
                log.dropdownSubItem('#️⃣', "Today's Count", String(acc.todayLoginCount), false);
                log.dropdownSubItem('📅', 'Date', today, true);
                
                log.divider();
                
                log.dropdownSection('📜', 'History Updated');
                log.dropdownSubItem('🏠', 'Last Server', serverId || '(none)', false);
                log.dropdownSubItem('📚', 'Total Entries', String((acc.history || []).length), true);
            }

            return db.put(acc).then(function () { return acc; });
            
        }).then(function (acc) {
            // ═══════════════════════════════════════════════════════════
            // SUCCESS - COMPLETE TOKEN CERTIFICATE
            // ═══════════════════════════════════════════════════════════
            
            log.success('Session Saved! Token Ready.');

            // CONSOLE GROUP: Token Certificate & Session Profile (EXPANDABLE!)
            log.group('🎫', 'Token Certificate & Session Profile');

            // Sub-section: Token Details
            console.log('');
            console.log(
                '%c▾ %c🔐%c Token Information',
                'color:#2E7D32;font-weight:bold;font-size:12px;',
                'font-size:12px;',
                'color:#2E7D32;font-weight:bold;'
            );
            
            console.log(
                '%c   ├─▸ %c🎟️%c Complete Token',
                'color:#546E7A;font-size:11px;',
                'font-size:11px;',
                'color:#37474F;font-weight:600;'
            );
            console.log(
                '%c   │   └─▸ Value: ' + acc.loginToken,
                'font-family:monospace;font-size:10px;color:#2E7D32;background:#E8F5E9;padding:3px 6px;border-radius:3px;display:inline-block;'
            );
            
            console.log(
                '%c   ├─▸ %c📏%c Token Metrics',
                'color:#546E7A;font-size:11px;',
                'font-size:11px;',
                'color:#37474F;font-weight:600;'
            );
            console.log('%c   │   ├─▸ Length: ' + String(acc.loginToken.length) + ' chars', 'color:#546E7A;font-size:10px;');
            console.log('%c   │   └─▸ Type: permanent (used forever)', 'color:#546E7A;font-size:10px;');
            
            console.log(
                '%c   └─▸ %c♾️%c Storage Policy',
                'color:#546E7A;font-size:11px;',
                'font-size:11px;',
                'color:#37474F;font-weight:600;'
            );
            console.log('%c       └─▸ 1 user = 1 token (generated once)', 'color:#546E7A;font-size:10px;');

            // Sub-section: Session Timeline
            console.log('');
            console.log(
                '%c▾ %c⏰%c Session Timeline',
                'color:#2E7D32;font-weight:bold;font-size:12px;',
                'font-size:12px;',
                'color:#2E7D32;font-weight:bold;'
            );
            
            console.log(
                '%c   ├─▸ %c📅%c Account Creation',
                'color:#546E7A;font-size:11px;',
                'font-size:11px;',
                'color:#37474F;font-weight:600;'
            );
            console.log('%c   │   └─▸ 🕐 Time: ' + new Date(acc.createTime * 1000).toISOString(), 'color:#546E7A;font-size:10px;');
            
            console.log(
                '%c   ├─▸ %c🔄%c Current Session',
                'color:#546E7A;font-size:11px;',
                'font-size:11px;',
                'color:#37474F;font-weight:600;'
            );
            console.log('%c   │   ├─▸ 🕐 Last Login: ' + new Date(acc.lastLoginTime * 1000).toISOString(), 'color:#546E7A;font-size:10px;');
            console.log('%c   │   └─▸ #️⃣ Today Count: ' + String(acc.todayLoginCount), 'color:#546E7A;font-size:10px;');
            
            console.log(
                '%c   └─▸ %c📊%c Statistics',
                'color:#546E7A;font-size:11px;',
                'font-size:11px;',
                'color:#37474F;font-weight:600;'
            );
            console.log('%c       ├─▸ 📅 Login Date: ' + (acc.loginDate || 'N/A'), 'color:#546E7A;font-size:10px;');
            console.log('%c       └─▸ 📜 History Size: ' + String((acc.history || []).length) + ' entries', 'color:#546E7A;font-size:10px;');

            // Sub-section: Recent Server History (if any)
            if ((acc.history || []).length > 0) {
                console.log('');
                console.log(
                    '%c▾ %c🏠%c Recent Server History',
                    'color:#2E7D32;font-weight:bold;font-size:12px;',
                    'font-size:12px;',
                    'color:#2E7D32;font-weight:bold;'
                );
                
                for (var h = 0; h < Math.min(acc.history.length, 5); h++) {
                    var isLastHist = (h === Math.min(acc.history.length, 5) - 1);
                    console.log(
                        '%c   ' + (isLastHist ? '└─▸' : '├─▸') + ' 🕐 [' + (h + 1) + '] Server: ' + (acc.history[h] || 'N/A'),
                        'color:#546E7A;font-size:10px;'
                    );
                }
                
                if (acc.history.length > 5) {
                    console.log(
                        '%c       └─▸ ... and ' + String(acc.history.length - 5) + ' more',
                        'color:#9E9E9E;font-style:italic;font-size:10px;'
                    );
                }
            }

            log.groupEnd();

            log.info('response', 'Sending token to client (' + acc.loginToken.length + ' chars)');
            callback({ 
                loginToken: acc.loginToken, 
                todayLoginCount: acc.todayLoginCount 
            });
            
        }).catch(function (e) {
            // ═══════════════════════════════════════════════════════════
            // ERROR HANDLING - TIMELINE FEED STYLE
            // ═══════════════════════════════════════════════════════════
            
            log.errorBadge('Database Operation Failed!');
            
            // DROPDOWN: Error Analysis
            log.dropdown('❌', 'Error Analysis');
            
            log.dropdownSection('⚡', 'Exception Details');
            log.dropdownSubItem('🔴', 'Error Type', e.name || '(unknown)', false);
            log.dropdownSubItem('📄', 'Message', e.message || String(e), true);
            
            log.divider();
            
            log.dropdownSection('🔍', 'Operation Context');
            log.dropdownSubItem('📥', 'Operation', 'IndexedDB.get() → .put()', false);
            log.dropdownSubItem('🗄️', 'Table', 'loginInfo', false);
            log.dropdownSubItem('🆔', 'User ID', userId || '(empty)', true);

            // Fallback response
            var fallbackToken = LoginServer.generateToken();
            
            log.warnBadge('Degradation Mode - Using Fallback Token');
            
            // DROPDOWN: Fallback Response
            log.dropdown('⚠️', 'Fallback Token Response');
            
            log.dropdownSection('🎫', 'Generated Token');
            log.dropdownSubItem('🎟️', 'Preview', fallbackToken || '(empty)', false);
            log.dropdownSubItem('📏', 'Length', String(fallbackToken.length) + ' chars', true);
            
            log.divider();
            
            log.dropdownSection('⚠️', 'Degradation Notes');
            log.dropdownSubItem('❗', 'Status', 'FALLBACK MODE', false);
            log.dropdownSubItem('💾', 'Saved?', 'NOT saved to DB!', true);

            log.warn('ACTION', 'SaveHistory → DB Error, using fallback token');
            callback({ 
                loginToken: fallbackToken, 
                todayLoginCount: 1 
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // REGISTER HANDLER
    // ═══════════════════════════════════════════════════════════════════

    LoginServer.handlers['SaveHistory'] = handleSaveHistory;
    if (LoginServer._handlerNames.indexOf('SaveHistory') === -1) { 
        LoginServer._handlerNames.push('SaveHistory'); 
    }
    LoginServer._handlerCount = LoginServer._handlerNames.length;

    window.LoginServer = LoginServer;
})();
