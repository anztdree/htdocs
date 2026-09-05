/**
 * actions/loginAnnounce.js — Handle LoginAnnounce action
 * Super Warrior Z — LOGIN SERVER
 *
 * Data source: IndexedDB (login-server / loginInfo → __config__.notices)
 * Style: TIMELINE FEED - Nested Dropdown, No Box!
 */

(function () {
    'use strict';

    var LoginServer = window.LoginServer;
    var log = LoginServer.log;
    var db = LoginServer.db;

    // ═══════════════════════════════════════════════════════════════════
    // HANDLER: LoginAnnounce - TIMELINE FEED STYLE (SUPER DETAIL)
    // ═══════════════════════════════════════════════════════════════════

    function handleLoginAnnounce(request, callback) {
        // ──────────────────────────────────────────────────────────────
        // HEADER
        // ──────────────────────────────────────────────────────────────
        log.tag('LoginAnnounce');
        log.section('📢', 'LoginAnnounce', 'Fetching system announcements...');

        // ──────────────────────────────────────────────────────────────
        // DROPDOWN 1: Request Context (NESTED TREE)
        // ──────────────────────────────────────────────────────────────
        log.dropdown('📥', 'Request Context');
        
        var reqKeys = Object.keys(request || {});
        
        log.dropdownSection('📋', 'Request Parameters');
        
        for (var i = 0; i < reqKeys.length; i++) {
            var k = reqKeys[i];
            var v = String(request[k] || '');
            log.dropdownSubItem('📝', k, v, (i === reqKeys.length - 1));
        }
        
        log.divider();
        
        log.dropdownSection('💾', 'Data Source');
        log.dropdownSubItem('🗄️', 'Database', 'IndexedDB', false);
        log.dropdownSubItem('🔑', 'Search Key', '__config__', false);
        log.dropdownSubItem('📁', 'Data Path', '__config__.notices', true);

        // ──────────────────────────────────────────────────────────────
        // QUERY DATABASE
        // ──────────────────────────────────────────────────────────────
        db.get('__config__').then(function (config) {
            var notices = (config && config.notices) ? config.notices : [];
            var noticeCount = notices.length;

            log.success('Announcements Successfully Retrieved!');

            // ═══════════════════════════════════════════════════════════
            // DROPDOWN 2: ANNOUNCEMENT BOARD (DEEP NESTING!)
            // ═══════════════════════════════════════════════════════════
            
            if (noticeCount > 0) {
                log.dropdown('📋', 'Announcement Board (' + noticeCount + ' announcements)');
                
                for (var n = 0; n < noticeCount; n++) {
                    var notice = notices[n];
                    var isLastNotice = (n === noticeCount - 1);
                    
                    // Extract title with fallback
                    var titleStr = '(no title)';
                    if (notice && notice.title) {
                        titleStr = notice.title.en || notice.title.cn || String(notice.title) || '(no title)';
                    }
                    
                    // Announcement item header
                    console.log(
                        '%c   ' + (isLastNotice ? '└─▸' : '├─▸') + ' %c📌%c [' + (n + 1) + '] %c' + titleStr,
                        'color:#546E7A;font-size:11px;',
                        'font-size:11px;',
                        'font-size:11px;',
                        'color:#37474F;font-weight:bold;'
                    );
                    
                    // Sub-section: Content Preview (nested in announcement)
                    console.log(
                        '%c   │   ├────────────────── %c📄%c Content Preview',
                        'color:#78909C;font-size:10px;',
                        'font-size:10px;',
                        'color:#00695C;font-weight:bold;'
                    );
                    
                    // Extract text with fallback
                    var textPreview = '(empty)';
                    if (notice && notice.text) {
                        textPreview = (notice.text.en || notice.text.cn || '');
                    }
                    console.log(
                        '%c   │   │   └─▸ 📝 Text: ' + textPreview,
                        'color:#546E7A;font-size:10px;'
                    );
                    
                    // Sub-section: Metadata (nested in announcement)
                    console.log(
                        '%c   │   ├────────────────── %c🏷️%c Metadata',
                        'color:#78909C;font-size:10px;',
                        'font-size:10px;',
                        'color:#00695C;font-weight:bold;'
                    );
                    console.log(
                        '%c   │   │   ├─▸ 📋 Version: ' + String((notice && notice.version) || 'N/A'),
                        'color:#546E7A;font-size:10px;'
                    );
                    console.log(
                        '%c   │   │   ├─▸ #️⃣ Order: ' + String((notice && notice.orderNo) || 'N/A'),
                        'color:#546E7A;font-size:10px;'
                    );
                    console.log(
                        '%c   │   │   └─▸ 🔔 Always Popup: ' + String((notice && notice.alwaysPopup) || false),
                        (notice && notice.alwaysPopup) ? 'color:#F57C00;' : 'color:#9E9E9E;',
                        'font-size:10px;'
                    );

                    // Spacing between announcements (except last)
                    if (!isLastNotice) {
                        console.log('%c   │', 'color:#CFD8DC;');
                    }
                }

            } else {
                // Empty state
                log.dropdown('📭', 'No Announcements');
                log.dropdownSubItem('ℹ️', 'Status', 'No announcements configured in __config__', true);
            }

            log.info('response', 'Sending ' + noticeCount + ' announcements to client');
            callback({ data: notices });
            
        }).catch(function (e) {
            // ═══════════════════════════════════════════════════════════
            // ERROR HANDLING - TIMELINE FEED STYLE
            // ═══════════════════════════════════════════════════════════
            
            log.errorBadge('Database Query Failed!');
            
            // DROPDOWN: Error Analysis
            log.dropdown('❌', 'Error Analysis');
            
            log.dropdownSection('⚡', 'Exception Details');
            log.dropdownSubItem('🔴', 'Error Type', e.name || '(unknown)', false);
            log.dropdownSubItem('📄', 'Message', e.message || String(e), true);
            
            log.divider();
            
            log.dropdownSection('🔍', 'Operation Context');
            log.dropdownSubItem('📥', 'Operation', 'IndexedDB.get(__config__)', false);
            log.dropdownSubItem('🎯', 'Target', '__config__.notices', true);

            // Fallback response
            log.warnBadge('Degraded Response - Empty Announcements');
            
            log.dropdown('⚠️', 'Fallback Response');
            log.dropdownSubItem('📋', 'Announcements', '[] (empty array)', true);

            log.warn('ACTION', 'LoginAnnounce → DB Error, returning empty array');
            callback({ data: [] });
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // REGISTER HANDLER
    // ═══════════════════════════════════════════════════════════════════

    LoginServer.handlers['LoginAnnounce'] = handleLoginAnnounce;
    if (LoginServer._handlerNames.indexOf('LoginAnnounce') === -1) { 
        LoginServer._handlerNames.push('LoginAnnounce'); 
    }
    LoginServer._handlerCount = LoginServer._handlerNames.length;
    
    window.LoginServer = LoginServer;
})();
