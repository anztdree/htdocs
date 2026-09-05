/**
 * actions/saveLanguage.js — Handle SaveLanguage action
 * Super Warrior Z — LOGIN SERVER
 *
 * Data source: IndexedDB (login-server / loginInfo)
 * Style: TIMELINE FEED - Nested Dropdown, No Box!
 */

(function () {
    'use strict';

    var LoginServer = window.LoginServer;
    var log = LoginServer.log;
    var db = LoginServer.db;

    // ═══════════════════════════════════════════════════════════════════
    // HANDLER: SaveLanguage - TIMELINE FEED STYLE (SUPER DETAIL)
    // ═══════════════════════════════════════════════════════════════════

    function handleSaveLanguage(request, callback) {
        // ──────────────────────────────────────────────────────────────
        // HEADER
        // ──────────────────────────────────────────────────────────────
        log.tag('SaveLanguage');
        log.section('🌐', 'SaveLanguage', 'Updating language preference...');

        // ──────────────────────────────────────────────────────────────
        // DROPDOWN 1: Request Payload (NESTED TREE)
        // ──────────────────────────────────────────────────────────────
        log.dropdown('📥', 'Request Payload');
        
        var reqKeys = Object.keys(request || {});
        
        log.dropdownSection('🔑', 'Main Parameters');
        
        var userId = request.userid || '';
        var language = request.language || 'en';
        
        log.dropdownSubItem('🆔', 'User ID', userId || '(empty)', false);
        log.dropdownSubItem('🌐', 'Selected Language', language, true);
        
        log.divider();
        
        log.dropdownSection('📋', 'Additional Data');
        var extraCount = 0;
        for (var k = 0; k < reqKeys.length; k++) {
            if (reqKeys[k] !== 'userid' && reqKeys[k] !== 'language') {
                var v = String(request[reqKeys[k]] || '');
                extraCount++;
                log.dropdownSubItem('📝', reqKeys[k], v, (extraCount === (reqKeys.length - 2)));
            }
        }

        // ──────────────────────────────────────────────────────────────
        // DATABASE OPERATION
        // ──────────────────────────────────────────────────────────────
        db.get(userId).then(function (acc) { 
            if (acc) { 
                acc.language = language; 
                return db.put(acc); 
            }
            return acc;
        }).then(function () {
            // ═══════════════════════════════════════════════════════════
            // SUCCESS
            // ═══════════════════════════════════════════════════════════
            
            log.success('Language Preference Saved!');

            // DROPDOWN: Language Update Confirmation
            log.dropdown('✅', 'Language Update Confirmation');
            
            log.dropdownSection('🌐', 'New Settings');
            log.dropdownSubItem('💬', 'Active Language', language, false);
            log.dropdownSubItem('🏳️', 'Locale Code', language.toUpperCase(), true);
            
            log.divider();
            
            log.dropdownSection('📋', 'Response Details');
            log.dropdownSubItem('📊', 'Error Code', '0 (Success)', false);
            log.dropdownSubItem('📝', 'Note', 'Client will close Language List & apply changes', true);

            // CONSOLE GROUP: Complete Operation Log (EXPANDABLE!)
            log.group('📋', 'Complete Operation Log');
            
            console.log(
                '%c   ├────────────────── %c👤%c Target User',
                'color:#78909C;font-size:11px;',
                'font-size:11px;',
                'color:#00695C;font-weight:bold;'
            );
            console.log('%c   │   └─▸ 🆔 ID: ' + (userId || '(empty)'), 'color:#546E7A;font-size:10px;');
            
            console.log(
                '%c   ├────────────────── %c🌐%c Language Change',
                'color:#78909C;font-size:11px;',
                'font-size:11px;',
                'color:#00695C;font-weight:bold;'
            );
            console.log('%c   │   └─▸ 💬 New Language: ' + language, 'color:#546E7A;font-size:10px;');
            
            console.log(
                '%c   ├────────────────── %c💾%c Storage',
                'color:#78909C;font-size:11px;',
                'font-size:11px;',
                'color:#00695C;font-weight:bold;'
            );
            console.log('%c   │   ├─▸ 🗄️ Database: IndexedDB', 'color:#546E7A;font-size:10px;');
            console.log('%c   │   └─▸ 📁 Table: loginInfo', 'color:#546E7A;font-size:10px;');
            
            console.log(
                '%c   └────────────────── %c📤%c Client Action',
                'color:#78909C;font-size:11px;',
                'font-size:11px;',
                'color:#00695C;font-weight:bold;'
            );
            console.log('%c       └─▸ 🔄 Close Language List & apply UI', 'color:#546E7A;font-size:10px;');
            
            log.groupEnd();

            log.info('response', 'Sending success to client (language=' + language + ')');
            callback({ errorCode: 0 });
            
        }).catch(function (e) {
            // ═══════════════════════════════════════════════════════════
            // ERROR HANDLING - FORCED SUCCESS (language non-critical!)
            // ═══════════════════════════════════════════════════════════
            
            log.errorBadge('Database Error (Non-Critical)');
            
            // DROPDOWN: Error Analysis
            log.dropdown('⚠️', 'Error Analysis (Success Forced)');
            
            log.dropdownSection('⚡', 'Exception Details');
            log.dropdownSubItem('🔴', 'Error Type', e.name || '(unknown)', false);
            log.dropdownSubItem('📄', 'Message', e.message || String(e), true);
            
            log.divider();
            
            log.dropdownSection('🛡️', 'Recovery Actions');
            log.dropdownSubItem('✅', 'Decision', 'SUCCESS FORCED (non-critical)', false);
            log.dropdownSubItem('📋', 'Error Code', '0 (forced)', true);

            log.warnBadge('Success Forced - Non-Critical Language');
            
            log.dropdown('ℹ️', 'Reason');
            log.dropdownSubItem('💡', 'Reason', 'Language preference is non-critical data', false);
            log.dropdownSubItem('🔄', 'Action', 'Return success to avoid UI freeze', true);

            log.warn('ACTION', 'SaveLanguage → DB Error, returning errorCode:0 (forced)');
            callback({ errorCode: 0 });
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // REGISTER HANDLER
    // ═══════════════════════════════════════════════════════════════════

    LoginServer.handlers['SaveLanguage'] = handleSaveLanguage;
    if (LoginServer._handlerNames.indexOf('SaveLanguage') === -1) { 
        LoginServer._handlerNames.push('SaveLanguage'); 
    }
    LoginServer._handlerCount = LoginServer._handlerNames.length;
    
    window.LoginServer = LoginServer;
})();
