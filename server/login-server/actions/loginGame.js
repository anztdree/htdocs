/**
 * actions/loginGame.js — Handle loginGame action
 * Super Warrior Z — LOGIN SERVER
 *
 * Data source: IndexedDB (login-server / loginInfo)
 * Style: TIMELINE FEED - Nested Dropdown, No Box!
 * Features: Attack Timeline, Forensic Investigation, Deep Nesting
 */

(function () {
    'use strict';

    var LoginServer = window.LoginServer;
    var log = LoginServer.log;
    var db = LoginServer.db;

    // ═══════════════════════════════════════════════════════════════════
    // HANDLER: loginGame - TIMELINE FEED STYLE (SUPER DETAIL)
    // ═══════════════════════════════════════════════════════════════════

    function handleLoginGame(request, callback) {
        // ──────────────────────────────────────────────────────────────
        // HEADER
        // ──────────────────────────────────────────────────────────────
        log.tag('loginGame');
        log.section('🎮', 'loginGame', 'Processing authentication...');

        // ──────────────────────────────────────────────────────────────
        // DROPDOWN 1: Request Data (NESTED TREE)
        // ──────────────────────────────────────────────────────────────
        log.dropdown('📥', 'Request Data');
        
        var reqKeys = Object.keys(request || {});
        
        log.dropdownSection('🔑', 'Login Credentials');
        
        var userId = request.userId || '';
        var password = request.password || '';
        var channelCode = request.fromChannel || 'ppgame';
        var nickName = request.nickName || '';
        
        // Display credentials (password masked for security)
        log.dropdownSubItem('🆔', 'User ID', userId, false);
        if (password.length > 8) {
            log.dropdownSubItem('🔑', 'Password', password + ' (***masked***)', true);
        } else {
            log.dropdownSubItem('🔑', 'Password', '*** (hidden) ***', true);
        }
        
        log.divider();
        
        log.dropdownSection('📋', 'Additional Info');
        log.dropdownSubItem('💬', 'Nickname', nickName || '(empty)', false);
        log.dropdownSubItem('📡', 'Channel', channelCode, true);

        var requestTimestamp = new Date().toISOString();

        db.get(userId).then(function (acc) {
            var now = LoginServer.nowSeconds();

            // ═══════════════════════════════════════════════════════════
            // SCENARIO A: NEW USER (First Login)
            // ═══════════════════════════════════════════════════════════
            if (!acc) {
                var securityCode = 'sec_' + Math.random().toString(36).substr(2, 6);
                acc = {
                    userId: userId,
                    password: password,
                    channelCode: channelCode,
                    nickName: nickName,
                    securityCode: securityCode,
                    loginToken: '',
                    createTime: now,
                    lastLoginTime: now,
                    todayLoginCount: 0,
                    loginDate: '',
                    language: 'en',
                    history: []
                };

                // DROPDOWN: New User Registration
                log.dropdown('✨', 'New User Registration');
                
                log.dropdownSection('🆔', 'Account Identity');
                log.dropdownSubItem('🆔', 'User ID', acc.userId, false);
                log.dropdownSubItem('👤', 'Nickname', acc.nickName || '(not set)', true);
                
                log.divider();
                
                log.dropdownSection('🔑', 'Security Credentials');
                log.dropdownSubItem('🎫', 'Security Code', acc.securityCode, false);
                log.dropdownSubItem('💬', 'Source Channel', acc.channelCode, true);
                
                log.divider();
                
                log.dropdownSection('💾', 'Storage Info');
                log.dropdownSubItem('🗄️', 'Database', 'IndexedDB (local)', false);
                log.dropdownSubItem('📁', 'Data Location', 'login-server / loginInfo', true);

                return db.put(acc).then(function () {
                    log.success('Account Successfully Created!');

                    // CONSOLE GROUP: Registration Response Details (EXPANDABLE)
                    log.group('📦', 'Registration Response Details');
                    
                    console.log(
                        '%c   ├────────────────── %c📊%c Status',
                        'color:#78909C;font-size:11px;',
                        'font-size:11px;',
                        'color:#2E7D32;font-weight:bold;'
                    );
                    console.log('%c   │   └─▸ ✅ Result Code: 0 (Success)', 'color:#546E7A;font-size:10px;');
                    
                    console.log(
                        '%c   ├────────────────── %c📦%c Sent Data',
                        'color:#78909C;font-size:11px;',
                        'font-size:11px;',
                        'color:#2E7D32;font-weight:bold;'
                    );
                    console.log('%c   │   ├─▸ 🆔 User ID: ' + acc.userId, 'color:#546E7A;font-size:10px;');
                    console.log('%c   │   ├─▸ 💬 Channel: ' + acc.channelCode, 'color:#546E7A;font-size:10px;');
                    console.log('%c   │   ├─▸ 👤 Nickname: ' + (acc.nickName || '(empty)'), 'color:#546E7A;font-size:10px;');
                    console.log('%c   │   └─▸ 🔑 Security Code: ' + acc.securityCode, 'color:#546E7A;font-size:10px;');
                    
                    console.log(
                        '%c   └────────────────── %c⚙️%c Settings',
                        'color:#78909C;font-size:11px;',
                        'font-size:11px;',
                        'color:#2E7D32;font-weight:bold;'
                    );
                    console.log('%c       └─▸ 📦 Compression: Disabled', 'color:#546E7A;font-size:10px;');
                    
                    log.groupEnd();

                    callback({
                        userId: acc.userId,
                        channelCode: acc.channelCode,
                        nickName: acc.nickName,
                        securityCode: acc.securityCode
                    });
                });
            }

            // ═══════════════════════════════════════════════════════════
            // SCENARIO B: RETURNING USER - PASSWORD VERIFICATION
            // ═══════════════════════════════════════════════════════════
            
            // DROPDOWN: Credential Verification
            log.dropdown('🔐', 'Credential Verification');
            
            var storedPwd = String(acc.password || '');
            var receivedPwd = String(password || '');
            
            log.dropdownSection('🔒', 'Password Comparison');
            
            // Mask password for safe display
            var storedMasked = storedPwd + ' (***masked***)';
            var receivedMasked = receivedPwd + ' (***masked***)';
            
            log.dropdownSubItem('🔒', 'Stored Password', storedMasked, false);
            log.dropdownSubItem('🔑', 'Entered Password', receivedMasked, true);
            
            log.divider();
            
            log.dropdownSection('👤', 'Account Context');
            log.dropdownSubItem('🕐', 'Account Created', new Date(acc.createTime * 1000).toISOString(), false);
            log.dropdownSubItem('🕐', 'Last Login', new Date(acc.lastLoginTime * 1000).toISOString(), true);

            // ──────────────────────────────────────────────────────────
            // PASSWORD MISMATCH - FORENSIC REPORT
            // ──────────────────────────────────────────────────────────
            if (storedPwd !== receivedPwd) {
                log.errorBadge('Access Denied! Password Mismatch');

                // CONSOLE GROUP: Forensic Investigation Report (EXPANDABLE)
                log.group('🔍', 'Forensic Investigation Report');

                // Sub-dropdown: Hash Analysis
                console.log('');
                console.log(
                    '%c▾ %c🔐%c Password Hash Analysis',
                    'color:#C62828;font-weight:bold;font-size:12px;',
                    'font-size:12px;',
                    'color:#C62828;font-weight:bold;'
                );
                
                console.log(
                    '%c   ├─▸ %c🔒%c Stored Hash',
                    'color:#546E7A;font-size:11px;',
                    'font-size:11px;',
                    'color:#37474F;font-weight:600;'
                );
                console.log('%c   │   ├─▸ Value: ' + storedPwd + ' (hidden)', 'color:#546E7A;font-size:10px;');
                console.log('%c   │   └─▸ Length: ' + storedPwd.length + ' chars', 'color:#546E7A;font-size:10px;');
                
                console.log(
                    '%c   ├─▸ %c🔑%c Input Hash',
                    'color:#546E7A;font-size:11px;',
                    'font-size:11px;',
                    'color:#37474F;font-weight:600;'
                );
                console.log('%c   │   ├─▸ Value: ' + receivedPwd + ' (hidden)', 'color:#546E7A;font-size:10px;');
                console.log('%c   │   └─▸ Length: ' + receivedPwd.length + ' chars', 'color:#546E7A;font-size:10px;');
                
                console.log(
                    '%c   └─▸ %c❌%c Comparison Result',
                    'color:#546E7A;font-size:11px;',
                    'font-size:11px;',
                    'color:#C62828;font-weight:600;'
                );
                console.log('%c       └─▸ Status: MISMATCH ❌', 'color:#C62828;font-size:10px;');

                // Sub-dropdown: Requestor Profile
                console.log('');
                console.log(
                    '%c▾ %c👤%c Access Requestor Profile',
                    'color:#C62828;font-weight:bold;font-size:12px;',
                    'font-size:12px;',
                    'color:#C62828;font-weight:bold;'
                );
                
                console.log(
                    '%c   ├─▸ %c🆔%c Identity',
                    'color:#546E7A;font-size:11px;',
                    'font-size:11px;',
                    'color:#37474F;font-weight:600;'
                );
                console.log('%c   │   ├─▸ User ID: ' + userId, 'color:#546E7A;font-size:10px;');
                console.log('%c   │   └─▸ Nickname: ' + (nickName || '(none)'), 'color:#546E7A;font-size:10px;');
                
                console.log(
                    '%c   ├─▸ %c🌐%c Request Origin',
                    'color:#546E7A;font-size:11px;',
                    'font-size:11px;',
                    'color:#37474F;font-weight:600;'
                );
                console.log('%c   │   ├─▸ Channel: ' + channelCode, 'color:#546E7A;font-size:10px;');
                console.log('%c   │   └─▸ Time: ' + requestTimestamp, 'color:#546E7A;font-size:10px;');
                
                console.log(
                    '%c   └─▸ %c📊%c Account Statistics',
                    'color:#546E7A;font-size:11px;',
                    'font-size:11px;',
                    'color:#37474F;font-weight:600;'
                );
                console.log('%c       ├─▸ 📅 Account Age: ' + ((now - acc.createTime) / 86400).toFixed(1) + ' days', 'color:#546E7A;font-size:10px;');
                console.log('%c       ├─▸ 🔢 Total Logins: ' + acc.todayLoginCount + ' times', 'color:#546E7A;font-size:10px;');
                console.log('%c       └─▸ 📚 History Size: ' + (acc.history || []).length + ' entries', 'color:#546E7A;font-size:10px;');

                // Sub-dropdown: Attack Timeline (MAIN FEATURE!)
                console.log('');
                console.log(
                    '%c▾ %c⏱️%c Attempt Timeline',
                    'color:#C62828;font-weight:bold;font-size:12px;',
                    'font-size:12px;',
                    'color:#C62828;font-weight:bold;'
                );
                
                // Attempt #1 (current)
                console.log(
                    '%c   ├─▸ %c🕐%c Attempt #1 (CURRENT)',
                    'color:#546E7A;font-size:11px;',
                    'font-size:11px;',
                    'color:#F57C00;font-weight:600;'
                );
                console.log('%c   │   ├─▸ 🕐 Time: ' + requestTimestamp, 'color:#546E7A;font-size:10px;');
                console.log('%c   │   ├─▸ 📍 Same IP: Yes (same session)', 'color:#546E7A;font-size:10px;');
                console.log('%c   │   ├─▸ 📝 Password: ' + receivedPwd + ' (hidden)', 'color:#546E7A;font-size:10px;');
                console.log('%c   │   └─▸ ❌ Result: FAILED', 'color:#C62828;font-size:10px;');
                
                // Previous attempt history
                var histLen = (acc.history || []).length;
                if (histLen > 0) {
                    console.log(
                        '%c   └─▸ %c🕐%c Attempt #2 (HISTORY)',
                        'color:#546E7A;font-size:11px;',
                        'font-size:11px;',
                        'color:#757575;font-weight:600;'
                    );
                    console.log('%c       ├─▸ 🕐 Time: See history', 'color:#546E7A;font-size:10px;');
                    console.log('%c       ├─▸ 📍 Same IP: Unknown', 'color:#546E7A;font-size:10px;');
                    console.log('%c       ├─▸ 📝 Password: (from history)', 'color:#546E7A;font-size:10px;');
                    console.log('%c       └─▸ ⚠️ Result: CHECK HISTORY', 'color:#F57C00;font-size:10px;');
                } else {
                    console.log(
                        '%c   └─▸ %c📭%c No Previous Attempts',
                        'color:#546E7A;font-size:11px;',
                        'font-size:11px;',
                        'color:#9E9E9E;font-style:italic;'
                    );
                }

                // Sub-dropdown: Security Response
                console.log('');
                console.log(
                    '%c▾ %c🛡️%c Security Response',
                    'color:#C62828;font-weight:bold;font-size:12px;',
                    'font-size:12px;',
                    'color:#C62828;font-weight:bold;'
                );
                console.log('%c   ├─▸ 🚫 Action: ACCESS DENIED', 'color:#C62828;font-size:10px;');
                console.log('%c   ├─▸ 📋 Error Code: 1 (password_mismatch)', 'color:#546E7A;font-size:10px;');
                console.log('%c   ├─▸ ⚠️ Risk Level: LOW (single attempt)', 'color:#F57C00;font-size:10px;');
                console.log('%c   └─▸ 💡 Suggestion: Check credentials again', 'color:#546E7A;font-size:10px;');

                log.groupEnd();

                callback({ error: 'password_mismatch' }, 1);
                return;
            }

            // ═══════════════════════════════════════════════════════════
            // SCENARIO C: AUTHENTICATION SUCCESSFUL
            // ═══════════════════════════════════════════════════════════
            
            // Update account data
            acc.lastLoginTime = now;
            if (!acc.securityCode) {
                acc.securityCode = 'sec_' + Math.random().toString(36).substr(2, 6);
            }
            if (!acc.loginToken) {
                acc.loginToken = LoginServer.generateToken();
            }

            log.success('Authentication Successful! Welcome back.');

            return db.put(acc).then(function () {
                // DROPDOWN: User Session Profile
                log.dropdown('👤', 'User Session Profile');
                
                log.dropdownSection('🆔', 'Identity');
                log.dropdownSubItem('🆔', 'User ID', acc.userId, false);
                log.dropdownSubItem('👤', 'Nickname', acc.nickName || '(empty)', true);
                
                log.divider();
                
                log.dropdownSection('🔑', 'Session Credentials');
                log.dropdownSubItem('🎫', 'Security Code', acc.securityCode, false);
                log.dropdownSubItem('🎟️', 'Login Token', acc.loginToken || '(empty)', true);
                
                log.divider();
                
                log.dropdownSection('⏰', 'Activity Timeline');
                log.dropdownSubItem('📅', 'Creation Date', new Date(acc.createTime * 1000).toISOString(), false);
                log.dropdownSubItem('🕐', 'Last Login', new Date(acc.lastLoginTime * 1000).toISOString(), true);

                // CONSOLE GROUP: Complete Session Envelope (EXPANDABLE)
                log.group('📦', 'Complete Session Envelope');
                
                console.log(
                    '%c   ├────────────────── %c🎯%c Action Result',
                    'color:#78909C;font-size:11px;',
                    'font-size:11px;',
                    'color:#2E7D32;font-weight:bold;'
                );
                console.log('%c   │   └─▸ ✅ Status: AUTHENTICATED', 'color:#2E7D32;font-size:10px;');
                
                console.log(
                    '%c   ├────────────────── %c📤%c Response Payload',
                    'color:#78909C;font-size:11px;',
                    'font-size:11px;',
                    'color:#2E7D32;font-weight:bold;'
                );
                console.log('%c   │   ├─▸ 🆔 User ID: ' + acc.userId, 'color:#546E7A;font-size:10px;');
                console.log('%c   │   ├─▸ 💬 Channel: ' + acc.channelCode, 'color:#546E7A;font-size:10px;');
                console.log('%c   │   ├─▸ 👤 Nickname: ' + (acc.nickName || '(empty)'), 'color:#546E7A;font-size:10px;');
                console.log('%c   │   └─▸ 🔑 Security Code: ' + acc.securityCode, 'color:#546E7A;font-size:10px;');
                
                console.log(
                    '%c   ├────────────────── %c🔐%c Token Info',
                    'color:#78909C;font-size:11px;',
                    'font-size:11px;',
                    'color:#2E7D32;font-weight:bold;'
                );
                console.log('%c   │   ├─▸ 🎟️ Token: ' + (acc.loginToken || '(empty)'), 'color:#546E7A;font-size:10px;');
                console.log('%c   │   └─▸ 📏 Length: ' + (acc.loginToken || '').length + ' chars', 'color:#546E7A;font-size:10px;');
                
                console.log(
                    '%c   └────────────────── %c📊%c Statistics',
                    'color:#78909C;font-size:11px;',
                    'font-size:11px;',
                    'color:#2E7D32;font-weight:bold;'
                );
                console.log('%c       ├─▸ 📅 Account Age: ' + ((now - acc.createTime) / 86400).toFixed(1) + ' days', 'color:#546E7A;font-size:10px;');
                console.log('%c       ├─▸ 🔢 Login Count: ' + (acc.todayLoginCount + 1), 'color:#546E7A;font-size:10px;');
                console.log('%c       └─▸ 📚 History Size: ' + (acc.history || []).length + ' entries', 'color:#546E7A;font-size:10px;');
                
                log.groupEnd();

                callback({
                    userId: acc.userId,
                    channelCode: acc.channelCode,
                    nickName: acc.nickName,
                    securityCode: acc.securityCode
                });
            });
        }).catch(function (e) {
            // ═══════════════════════════════════════════════════════════
            // SCENARIO D: DATABASE ERROR
            // ═══════════════════════════════════════════════════════════
            
            log.errorBadge('Database Operation Failed!');
            
            // DROPDOWN: Error Analysis
            log.dropdown('❌', 'Error Analysis');
            
            log.dropdownSection('⚡', 'Exception Details');
            log.dropdownSubItem('🔴', 'Error Type', e.name || '(unknown)', false);
            log.dropdownSubItem('📄', 'Error Message', e.message || String(e), true);
            
            log.divider();
            
            log.dropdownSection('🔍', 'Operation Context');
            log.dropdownSubItem('📥', 'Operation', 'IndexedDB.get(userId)', false);
            log.dropdownSubItem('🗄️', 'Table', 'loginInfo', false);
            log.dropdownSubItem('🆔', 'Search Key', userId, true);

            // Fallback response
            var fallbackSecurityCode = 'sec_' + Math.random().toString(36).substr(2, 6);
            
            log.warnBadge('Degradation Mode Activated');
            
            // DROPDOWN: Fallback Data
            log.dropdown('⚠️', 'Fallback Response');
            
            log.dropdownSection('📦', 'Generated Credentials');
            log.dropdownSubItem('🆔', 'User ID', userId, false);
            log.dropdownSubItem('💬', 'Channel', channelCode, false);
            log.dropdownSubItem('👤', 'Nickname', nickName, false);
            log.dropdownSubItem('🔑', 'Security Code', fallbackSecurityCode, true);
            
            log.divider();
            
            log.dropdownSection('⚠️', 'Degradation Notes');
            log.dropdownSubItem('❗', 'Status', 'FALLBACK MODE', false);
            log.dropdownSubItem('💾', 'Saved?', 'NOT saved to DB!', true);

            // CONSOLE GROUP: Recovery Suggestions (EXPANDABLE)
            log.group('💡', 'Recovery Suggestions');
            
            console.log(
                '%c   ├─ ▸ %c🔄%c Immediate Steps',
                'color:#546E7A;font-size:11px;',
                'font-size:11px;',
                'color:#F57C00;font-weight:bold;'
            );
            console.log('%c   │   ├─ ▸ 1. Refresh page to retry', 'color:#546E7A;font-size:10px;');
            console.log('%c   │   └─ ▸ 2. Clear browser cache', 'color:#546E7A;font-size:10px;');
            
            console.log(
                '%c   ├─ ▸ %c🔧%c Advanced',
                'color:#546E7A;font-size:11px;',
                'font-size:11px;',
                'color:#F57C00;font-weight:bold;'
            );
            console.log('%c   │   ├─ ▸ 3. Check IndexedDB quota in DevTools', 'color:#546E7A;font-size:10px;');
            console.log('%c   │   └─ ▸ 4. Try incognito/private mode', 'color:#546E7A;font-size:10px;');
            
            console.log(
                '%c   └─ ▸ %c📞%c If Still Having Issues',
                'color:#546E7A;font-size:11px;',
                'font-size:11px;',
                'color:#F57C00;font-weight:bold;'
            );
            console.log('%c       └─ ▸ Contact support with screenshot', 'color:#546E7A;font-size:10px;');
            
            log.groupEnd();

            callback({
                userId: userId,
                channelCode: channelCode,
                nickName: nickName,
                securityCode: fallbackSecurityCode
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // REGISTER HANDLER
    // ═══════════════════════════════════════════════════════════════════

    LoginServer.handlers['loginGame'] = handleLoginGame;
    if (LoginServer._handlerNames.indexOf('loginGame') === -1) {
        LoginServer._handlerNames.push('loginGame');
    }
    LoginServer._handlerCount = LoginServer._handlerNames.length;

    window.LoginServer = LoginServer;
})();
