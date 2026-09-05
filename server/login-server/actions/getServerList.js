/**
 * actions/getServerList.js — Handle GetServerList action
 * Super Warrior Z — LOGIN SERVER
 *
 * Data source: IndexedDB (login-server / loginInfo)
 * Style: TIMELINE FEED - Nested Dropdown, No Box!
 * Features: Server Fleet Tree, Session History, Deep Nesting
 */

(function () {
    'use strict';

    var LoginServer = window.LoginServer;
    var log = LoginServer.log;
    var db = LoginServer.db;

    // ═══════════════════════════════════════════════════════════════════
    // HANDLER: GetServerList - TIMELINE FEED STYLE (SUPER DETAIL)
    // ═══════════════════════════════════════════════════════════════════

    function handleGetServerList(request, callback) {
        // ──────────────────────────────────────────────────────────────
        // HEADER
        // ──────────────────────────────────────────────────────────────
        log.tag('GetServerList');
        log.section('📡', 'GetServerList', 'Fetching server list...');

        // ──────────────────────────────────────────────────────────────
        // DROPDOWN 1: Request Parameters (NESTED TREE)
        // ──────────────────────────────────────────────────────────────
        log.dropdown('📥', 'Request Parameters');
        
        var reqKeys = Object.keys(request || {});
        
        log.dropdownSection('🔑', 'Main Parameters');
        
        var userId = request.userId || '';
        
        log.dropdownSubItem('🆔', 'User ID', userId || '(empty)', false);
        log.dropdownSubItem('💬', 'Sub-Channel', request.subChannel || '(empty)', true);
        
        log.divider();
        
        log.dropdownSection('📋', 'Additional Metadata');
        log.dropdownSubItem('📡', 'Main Channel', request.channel || '(empty)', false);
        log.dropdownSubItem('💾', 'Data Source', 'IndexedDB (__config__ + user data)', true);

        // ──────────────────────────────────────────────────────────────
        // QUERY DATABASE
        // ──────────────────────────────────────────────────────────────
        var configPromise = db.get('__config__');
        var userPromise = userId ? db.get(userId) : Promise.resolve(null);

        Promise.all([configPromise, userPromise]).then(function (results) {
            var config = results[0];
            var user = results[1];

            var servers = (config && config.servers) ? config.servers : [];
            var history = (user && user.history) ? user.history : [];

            // Fallback if no servers
            if (servers.length === 0) {
                log.dropdown('⚠️', 'Fallback Mode Activated');
                
                log.dropdownSection('🔧', 'Fallback Reason');
                log.dropdownSubItem('❗', 'Issue', 'No servers in __config__', false);
                log.dropdownSubItem('🛠️', 'Solution', 'Using built-in fallback server', true);
                
                servers = [
                    { serverId: '1', name: 'Local 1', url: LoginServer.config.mainServerUrl, online: true, hot: false, 'new': true }
                ];
            }

            log.success('Server List Successfully Retrieved!');

            // ═══════════════════════════════════════════════════════════
            // DROPDOWN 2: SERVER FLEET (DEEP NESTING!)
            // ═══════════════════════════════════════════════════════════
            log.dropdown('🌐', 'Server Fleet (' + servers.length + ' servers)');
            
            for (var s = 0; s < servers.length; s++) {
                var srv = servers[s];
                var isLastServer = (s === servers.length - 1);
                
                // Server status indicator
                var statusEmoji = srv.online ? '🟢' : '🔴';
                var statusText = srv.online ? 'ONLINE' : 'OFFLINE';
                var flags = '';
                if (srv.hot) flags += ' ★ POPULAR';
                if (srv['new']) flags += ' 🆕 NEW';
                
                // Server item header
                console.log(
                    '%c   ' + (isLastServer ? '└─▸' : '├─▸') + ' %c' + statusEmoji + '%c %c' + (srv.name || 'Unknown'),
                    'color:#546E7A;font-size:11px;',
                    'font-size:12px;',
                    'font-size:11px;',
                    'color:#37474F;font-weight:bold;'
                );
                
                // Sub-section: Server Identity (nested)
                console.log(
                    '%c   │   ├────────────────── %c📋%c Server Identity',
                    'color:#78909C;font-size:10px;',
                    'font-size:10px;',
                    'color:#00695C;font-weight:bold;'
                );
                console.log(
                    '%c   │   │   ├─▸ 🆔 Server ID: ' + (srv.serverId || 'N/A'),
                    'color:#546E7A;font-size:10px;'
                );
                console.log(
                    '%c   │   │   └─▸ 🔗 URL: ' + (srv.url || 'N/A'),
                    'color:#546E7A;font-size:10px;'
                );
                
                // Sub-section: Status & Metrics (nested)
                console.log(
                    '%c   │   ├────────────────── %c📊%c Status & Metrics',
                    'color:#78909C;font-size:10px;',
                    'font-size:10px;',
                    'color:#00695C;font-weight:bold;'
                );
                console.log(
                    '%c   │   │   ├─▸ ' + statusEmoji + ' Status: ' + statusText,
                    srv.online ? 'color:#2E7D32;' : 'color:#C62828;',
                    'font-size:10px;'
                );
                console.log(
                    '%c   │   │   ├─▸ 👥 Players: ' + (srv.players || '0') + '/' + (srv.maxPlayers || '?'),
                    'color:#546E7A;font-size:10px;'
                );
                console.log(
                    '%c   │   │   ├─▸ 🔥 Popular: ' + (srv.hot ? '★ YES' : '- NO'),
                    srv.hot ? 'color:#F57C00;' : 'color:#9E9E9E;',
                    'font-size:10px;'
                );
                console.log(
                    '%c   │   │   └─▸ 🆕 New: ' + (srv['new'] ? '✅ YES' : '- NO'),
                    srv['new'] ? 'color:#2E7D32;' : 'color:#9E9E9E;',
                    'font-size:10px;'
                );

                // Spacing between servers (except last)
                if (!isLastServer) {
                    console.log('%c   │', 'color:#CFD8DC;');
                }
            }

            // ═══════════════════════════════════════════════════════════
            // DROPDOWN 3: PLAY SESSIONS (if any)
            // ═══════════════════════════════════════════════════════════
            
            if (history.length > 0) {
                log.dropdown('📜', 'Play History (' + history.length + ' sessions)');
                
                for (var h = 0; h < history.length; h++) {
                    var histEntry = history[h];
                    var isLastHist = (h === history.length - 1);
                    
                    // Handle various history formats
                    var sessionLabel = '';
                    var sessionDetail = '';
                    
                    if (typeof histEntry === 'object') {
                        sessionLabel = 'Session #' + (h + 1);
                        sessionDetail = new Date((histEntry.timestamp || Date.now()) * 1000).toISOString();
                    } else {
                        sessionLabel = '[' + h + '] Entry';
                        sessionDetail = String(histEntry || '');
                    }
                    
                    log.dropdownSubItem('🕐', sessionLabel, sessionDetail, isLastHist);
                    
                    // Nested details for each session (if object)
                    if (typeof histEntry === 'object' && histEntry) {
                        var histKeys = Object.keys(histEntry);
                        for (var hk = 0; hk < Math.min(histKeys.length, 3); hk++) {
                            var isLastKey = (hk === Math.min(histKeys.length, 3) - 1);
                            var hVal = String(histEntry[histKeys[hk]] || '');
                            console.log(
                                '%c      │   ' + (isLastKey ? '└─▸' : '├─▸') + ' ' + (histKeys[hk] || '') + ': ' + hVal,
                                'color:#90A4AE;font-size:9px;'
                            );
                        }
                    }
                }
            } else {
                log.dropdown('📭', 'No Play Sessions Yet');
                log.dropdownSubItem('ℹ️', 'Info', 'User has no play history yet', true);
            }

            // ═══════════════════════════════════════════════════════════
            // CONSOLE GROUP: Raw API Data (EXPANDABLE!)
            // ═══════════════════════════════════════════════════════════
            log.group('📋', 'Raw API Data');
            
            console.log(
                '%c   ├────────────────── %c📊%c Summary',
                'color:#78909C;font-size:11px;',
                'font-size:11px;',
                'color:#00695C;font-weight:bold;'
            );
            console.log('%c   │   ├─▸ 🏠 Total Servers: ' + servers.length, 'color:#546E7A;font-size:10px;');
            console.log('%c   │   ├─▸ 📜 History: ' + history.length + ' entries', 'color:#546E7A;font-size:10px;');
            console.log('%c   │   └─▸ ✅ Offline Reason: (none)', 'color:#546E7A;font-size:10px;');
            
            console.log('');
            console.table(servers.map(function(srv, idx) {
                return {
                    '#': idx + 1,
                    Name: srv.name || 'Unknown',
                    ID: srv.serverId || 'N/A',
                    URL: srv.url || '',
                    Status: srv.online ? '🟢 Online' : '🔴 Offline',
                    Popular: srv.hot ? '★ Yes' : '-',
                    New: srv['new'] ? '🆕 Yes' : '-'
                };
            }));
            
            log.groupEnd();

            log.info('response', 'Sending server list to client (' + servers.length + ' servers)');
            callback({ serverList: servers, history: history, offlineReason: '' });
            
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
            log.dropdownSubItem('📥', 'Operation', 'IndexedDB Query (parallel)', false);
            log.dropdownSubItem('🗄️', 'Table', '__config__ + user data', false);
            log.dropdownSubItem('🆔', 'User ID', userId || '(not provided)', true);

            // Fallback response
            log.warnBadge('Degradation Mode - Using Fallback Server');
            
            log.dropdown('⚠️', 'Fallback Response');
            
            log.dropdownSection('🌐', 'Fallback Server');
            log.dropdownSubItem('🏠', 'Name', 'Local 1', false);
            log.dropdownSubItem('🔗', 'URL', LoginServer.config.mainServerUrl, true);
            
            log.divider();
            
            log.dropdownSection('⚠️', 'Impact');
            log.dropdownSubItem('📊', 'Server Count', '1 (fallback only)', false);
            log.dropdownSubItem('📜', 'History', '[] (empty)', true);

            callback({
                serverList: [{ 
                    serverId: '1', 
                    name: 'Local 1', 
                    url: LoginServer.config.mainServerUrl, 
                    online: true, 
                    hot: false, 
                    'new': true 
                }],
                history: [],
                offlineReason: ''
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // REGISTER HANDLER
    // ═══════════════════════════════════════════════════════════════════

    LoginServer.handlers['GetServerList'] = handleGetServerList;
    if (LoginServer._handlerNames.indexOf('GetServerList') === -1) {
        LoginServer._handlerNames.push('GetServerList');
    }
    LoginServer._handlerCount = LoginServer._handlerNames.length;

    window.LoginServer = LoginServer;
})();
