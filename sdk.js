/**
 * DB-IDLE Standalone SDK
 * Mock SDK untuk game Dragon Ball Idle
 * Semua data di-generate otomatis dan disimpan di localStorage
 * 
 * Format data disesuaikan dengan format server asli (dari HAR file)
 */

(function() {
    'use strict';
    
    console.log('[SDK] Initializing Standalone SDK...');
    
    // ==================== CONFIG ====================
    const SDK_STORAGE_KEY = 'db_idle_sdk_data';
    const SDK_VERSION = '2.0.0';
    
    // ==================== UTILITY FUNCTIONS ====================
    function generateNumericId() {
        // Generate numeric ID seperti server asli: "1194331643771168"
        return String(Date.now()) + String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    }
    
    function generateRandomHex(length) {
        // Generate random hex string untuk loginToken
        let result = '';
        for (let i = 0; i < length; i++) {
            result += Math.floor(Math.random() * 16).toString(16);
        }
        return result;
    }
    
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    function getQueryString(name) {
        const url = window.location.href;
        const reg = new RegExp('[?&]' + name + '=([^&#]*)', 'i');
        const result = reg.exec(url);
        return result ? decodeURIComponent(result[1]) : null;
    }
    
    // ==================== STORAGE MANAGER ====================
    const SDKStorage = {
        data: null,
        
        init: function() {
            try {
                const saved = localStorage.getItem(SDK_STORAGE_KEY);
                if (saved) {
                    this.data = JSON.parse(saved);
                    // Pastikan semua field yang diperlukan ada
                    if (!this.data.loginToken) {
                        this.data.loginToken = generateRandomHex(32);
                        this.save();
                    }
                } else {
                    this.data = this.createNewData();
                    this.save();
                }
            } catch(e) {
                this.data = this.createNewData();
            }
        },
        
        createNewData: function() {
            const now = Date.now();
            
            // Format sesuai dengan HAR file dan index-pp.html
            return {
                // Core fields - format sesuai server asli
                userId: generateNumericId(),           // Numeric string: "1194331643771168"
                sdk: 'standalone',                      // Platform identifier
                loginToken: generateRandomHex(32),      // 32 char hex: "f5604d0c5747ca4bff107dde049da07f"
                nickName: 'Player' + Math.floor(Math.random() * 10000),  // Display name
                
                // Channel info
                channelCode: 'standalone',
                channel: 'standalone',
                
                // App info
                appId: 'db_idle_standalone',
                serverId: '1',
                
                // Timestamps
                createTime: now,
                lastLoginTime: now,
                
                // Settings
                language: 'en',
                vipLevel: 0,
                
                // Extra data
                headImageUrl: '',
                sign: 'sign_' + now
            };
        },
        
        save: function() {
            try {
                localStorage.setItem(SDK_STORAGE_KEY, JSON.stringify(this.data));
            } catch(e) {
                console.error('[SDK] Failed to save:', e);
            }
        },
        
        get: function() {
            return this.data;
        },
        
        update: function(obj) {
            for (let key in obj) {
                if (obj.hasOwnProperty(key)) {
                    this.data[key] = obj[key];
                }
            }
            this.save();
        },
        
        clear: function() {
            this.data = this.createNewData();
            this.save();
        }
    };
    
    // Initialize storage
    SDKStorage.init();
    
    // ==================== WINDOW VARIABLES ====================
    window.sdkChannel = 'standalone';
    window.sdkNativeChannel = 'standalone';
    window.debugLanguage = SDKStorage.data.language || 'en';
    window.contactSdk = false;
    window.showContact = false;
    window.userCenterSdk = false;
    window.switchAccountSdk = false;
    window.switchUser = false;
    window.clientver = '1.0.0';
    window.Log_Clean = false;
    window.debug = true;
    
    // ==================== TSBROWSER OBJECT ====================
    window.TSBrowser = {
        // Variant values (config)
        _variants: {
            clientver: '1.0.0',
            clientserver: 'standalone',
            clientVersion: '1.0.0',
            clientVer: '1.0.0',
            CacheNum: 10,
            Log_Clean: false,
            debug: true,
            debugLanguage: SDKStorage.data.language || 'en',
            sdkChannel: 'standalone',
            versionConfig: {},
            reportBattlleLog: null,
            maskLayerClear: true
        },
        
        // Get variant value
        getVariantValue: function(key) {
            return this._variants[key];
        },
        
        // Check if native platform
        _isNativePlatform: function() {
            return false;
        },
        
        // Main function executor
        executeFunction: function(name) {
            const args = Array.prototype.slice.call(arguments, 1);
            console.log('[SDK] TSBrowser.executeFunction:', name, args);
            
            switch(name) {
                // ========== LOGIN & USER ==========
                case 'getSdkLoginInfo':
                    // Return format sesuai HAR file dan index-pp.html
                    return {
                        userId: SDKStorage.data.userId,
                        sdk: SDKStorage.data.sdk,
                        loginToken: SDKStorage.data.loginToken,
                        nickName: SDKStorage.data.nickName,
                        channelCode: SDKStorage.data.channelCode,
                        channel: SDKStorage.data.channel,
                        appId: SDKStorage.data.appId,
                        serverId: SDKStorage.data.serverId,
                        headImageUrl: SDKStorage.data.headImageUrl || ''
                    };
                    
                case 'getAppId':
                    return SDKStorage.data.appId;
                    
                case 'getLoginServer':
                    // Kembalikan null agar game pakai serversetting.json
                    // Mock Socket.IO di login-server.js akan intercept semua koneksi
                    return null;
                    
                case 'getQueryStringByName':
                    return getQueryString(args[0]);
                    
                // ========== USER ACTIONS ==========
                case 'switchAccount':
                    console.log('[SDK] Switch account requested');
                    // Generate new user
                    SDKStorage.clear();
                    window.location.reload();
                    return true;
                    
                case 'accountLoginCallback':
                    if (typeof args[0] === 'function') {
                        // Store callback for later use
                        this._accountLoginCallback = args[0];
                    }
                    return true;
                    
                // ========== REPORTING ==========
                case 'report2Sdk':
                    console.log('[SDK] report2Sdk:', args[0]);
                    return true;
                    
                case 'report2Sdk350CreateRole':
                    console.log('[SDK] report2Sdk350CreateRole:', args[0]);
                    return true;
                    
                case 'report2Sdk350LoginUser':
                    console.log('[SDK] report2Sdk350LoginUser:', args[0]);
                    return true;
                    
                case 'reportLogToPP':
                    console.log('[SDK] reportLogToPP:', args[0], args[1]);
                    return true;
                    
                case 'reportToCpapiCreaterole':
                    console.log('[SDK] reportToCpapiCreaterole:', args[0]);
                    return true;
                    
                // ========== ANALYTICS ==========
                case 'fbq':
                    console.log('[SDK] fbq:', args[0], args[1]);
                    return true;
                    
                case 'gtag':
                    console.log('[SDK] gtag:', args[0], args[1], args[2]);
                    return true;
                    
                // ========== GAME EVENTS ==========
                case 'gameLevelUp':
                    console.log('[SDK] gameLevelUp:', args[0]);
                    return true;
                    
                case 'gameChapterFinish':
                    console.log('[SDK] gameChapterFinish:', args[0]);
                    return true;
                    
                case 'tutorialFinish':
                    console.log('[SDK] tutorialFinish');
                    return true;
                    
                // ========== NAVIGATION ==========
                case 'openURL':
                    if (args[0]) {
                        window.open(args[0], '_blank');
                    }
                    return true;
                    
                case 'openShopPage':
                    console.log('[SDK] openShopPage - not available in standalone');
                    return false;
                    
                // ========== PAYMENT ==========
                case 'paySdk':
                    console.log('[SDK] paySdk - not available in standalone:', args[0]);
                    alert('Payment not available in standalone mode');
                    return false;
                    
                // ========== OTHERS ==========
                case 'changeLanguage':
                    if (args[0]) {
                        SDKStorage.update({ language: args[0] });
                        window.debugLanguage = args[0];
                    }
                    return true;
                    
                case 'checkFromNative':
                    return false;
                    
                case 'reload':
                    window.location.reload();
                    return true;
                    
                case 'sendCustomEvent':
                    console.log('[SDK] sendCustomEvent:', args[0], args[1]);
                    return true;
                    
                default:
                    console.log('[SDK] Unknown function:', name);
                    return null;
            }
        },
        
        // Check if window function exists
        checkWindowFunction: function(name) {
            return typeof window[name] === 'function';
        }
    };
    
    // ==================== WINDOW FUNCTIONS ====================
    
    // Initialize SDK with device token
    window.initSDKDe = function(token) {
        console.log('[SDK] initSDKDe called with token:', token);
        SDKStorage.update({ deviceToken: token });
    };
    
    // Check if SDK is ready
    window.checkSDK = function() {
        console.log('[SDK] checkSDK - returning true');
        return true;
    };
    
    // Get SDK login info - format sesuai server
    window.getSdkLoginInfo = function() {
        console.log('[SDK] getSdkLoginInfo:', {
            userId: SDKStorage.data.userId,
            sdk: SDKStorage.data.sdk,
            loginToken: SDKStorage.data.loginToken,
            nickName: SDKStorage.data.nickName
        });
        return {
            userId: SDKStorage.data.userId,
            sdk: SDKStorage.data.sdk,
            loginToken: SDKStorage.data.loginToken,
            nickName: SDKStorage.data.nickName,
            channelCode: SDKStorage.data.channelCode,
            channel: SDKStorage.data.channel,
            appId: SDKStorage.data.appId,
            serverId: SDKStorage.data.serverId
        };
    };
    
    // Get app ID
    window.getAppId = function() {
        return SDKStorage.data.appId;
    };
    
    // Contact SDK (not available)
    window.contactSdk = function() {
        console.log('[SDK] contactSdk - not available in standalone');
    };
    
    // User center SDK (not available)
    window.userCenterSdk = function() {
        console.log('[SDK] userCenterSdk - not available in standalone');
    };
    
    // Switch account SDK (not available)
    window.switchAccountSdk = function() {
        console.log('[SDK] switchAccountSdk - not available in standalone');
    };
    
    // Switch user
    window.switchUser = function() {
        console.log('[SDK] switchUser');
        if (confirm('Reset all progress and start new game?')) {
            SDKStorage.clear();
            window.location.reload();
        }
    };
    
    // Game ready notification
    window.gameReady = function() {
        console.log('[SDK] gameReady');
    };
    
    // Change language
    window.changeLanguage = function(lang) {
        console.log('[SDK] changeLanguage:', lang);
        SDKStorage.update({ language: lang });
        window.debugLanguage = lang;
    };
    
    // Open URL
    window.openURL = function(url) {
        console.log('[SDK] openURL:', url);
        if (url) {
            window.open(url, '_blank');
        }
    };
    
    // Get query string by name
    window.getQueryStringByName = function(name) {
        return getQueryString(name);
    };
    
    // Give like SDK (social feature)
    window.giveLikeSdk = function() {
        console.log('[SDK] giveLikeSdk - not available in standalone');
    };
    
    // FB give live SDK (social feature)
    window.fbGiveLiveSdk = function() {
        console.log('[SDK] fbGiveLiveSdk - not available in standalone');
    };
    
    // PWA button click
    window.pwaBtnClick = function() {
        console.log('[SDK] pwaBtnClick');
    };
    
    // Report chat message
    window.reportChatMsg = function(msg) {
        console.log('[SDK] reportChatMsg:', msg);
    };
    
    // Report to FBQ
    window.reportToFbq = function(event, data) {
        console.log('[SDK] reportToFbq:', event, data);
    };
    
    // Change VIP link
    window.changeVipLink = function() {
        console.log('[SDK] changeVipLink');
    };
    
    // Get hide above
    window.getHideAbove = function() {
        return false;
    };
    
    // Check from native
    window.checkFromNative = function() {
        return false;
    };
    
    // URL encode
    window.urlEncode = function(str) {
        return encodeURIComponent(str);
    };
    
    // ==================== LOGIN USER INFO ====================
    // This is set by game after successful login
    window.ts = window.ts || {};
    window.ts.loginUserInfo = {
        userId: SDKStorage.data.userId,
        serverId: SDKStorage.data.serverId,
        serverName: SDKStorage.data.serverName || 'Server 1',
        sdk: SDKStorage.data.sdk
    };
    
    // ==================== SDK API ====================
    // Expose SDK utilities
    window.SDK = {
        // Get current user data
        getUser: function() {
            return SDKStorage.get();
        },
        
        // Reset user (start new game)
        resetUser: function() {
            SDKStorage.clear();
            return SDKStorage.get();
        },
        
        // Update user data
        updateUser: function(data) {
            SDKStorage.update(data);
            return SDKStorage.get();
        },
        
        // Get storage instance
        getStorage: function() {
            return SDKStorage;
        },
        
        // Get SDK version
        getVersion: function() {
            return SDK_VERSION;
        }
    };
    
    console.log('[SDK] Standalone SDK v' + SDK_VERSION + ' initialized successfully!');
    console.log('[SDK] User ID:', SDKStorage.data.userId);
    console.log('[SDK] Login Token:', SDKStorage.data.loginToken);
    console.log('[SDK] Nick Name:', SDKStorage.data.nickName);
    console.log('[SDK] Commands:');
    console.log('  SDK.getUser() - Get current user data');
    console.log('  SDK.resetUser() - Reset and create new user');
    console.log('  SDK.updateUser(data) - Update user data');
    
})();
