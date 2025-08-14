/**
 * Browser Console Log Collection System
 * Captures browser console logs and sends them to the server for centralized logging.
 */

class BrowserLogger {
    constructor(config = {}) {
        this.config = {
            enableServerLogging: true,
            maxBufferSize: 100,
            flushInterval: 5000, // 5 seconds
            minLogLevel: 'info', // debug, info, warn, error
            endpoint: '/api/logs/browser',
            enableLocalStorage: true,
            ...config
        };
        
        this.logBuffer = [];
        this.sessionId = this.generateSessionId();
        this.userId = null;
        this.isSetup = false;
        
        this.setupLogging();
    }
    
    generateSessionId() {
        return 'bs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    setupLogging() {
        if (this.isSetup) return;
        
        // Store original console methods
        this.originalConsole = {
            log: console.log.bind(console),
            info: console.info.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
            debug: console.debug.bind(console)
        };
        
        // Override console methods
        console.log = (...args) => this.interceptLog('info', args);
        console.info = (...args) => this.interceptLog('info', args);
        console.warn = (...args) => this.interceptLog('warn', args);
        console.error = (...args) => this.interceptLog('error', args);
        console.debug = (...args) => this.interceptLog('debug', args);
        
        // Capture unhandled errors
        window.addEventListener('error', (event) => {
            this.logError('Unhandled Error', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error ? event.error.stack : null
            });
        });
        
        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.logError('Unhandled Promise Rejection', {
                reason: event.reason,
                stack: event.reason && event.reason.stack ? event.reason.stack : null
            });
        });
        
        // Start periodic flushing
        if (this.config.enableServerLogging && this.config.flushInterval > 0) {
            setInterval(() => this.flushLogs(), this.config.flushInterval);
        }
        
        // Flush logs when page is about to unload
        window.addEventListener('beforeunload', () => this.flushLogs());
        
        this.isSetup = true;
        this.log('info', 'Browser logging system initialized', { sessionId: this.sessionId });
    }
    
    interceptLog(level, args) {
        // Call original console method first
        this.originalConsole[level](...args);
        
        // Check if we should capture this log level
        if (!this.shouldCapture(level)) return;
        
        // Format the log entry
        const logEntry = this.formatLogEntry(level, args);
        
        // Add to buffer
        this.addToBuffer(logEntry);
    }
    
    shouldCapture(level) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        const minLevel = levels[this.config.minLogLevel] || 1;
        const currentLevel = levels[level] || 1;
        
        return currentLevel >= minLevel;
    }
    
    formatLogEntry(level, args) {
        const timestamp = new Date().toISOString();
        const message = args.map(arg => {
            if (typeof arg === 'string') return arg;
            if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack}`;
            try {
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return String(arg);
            }
        }).join(' ');
        
        return {
            timestamp,
            level,
            message,
            sessionId: this.sessionId,
            userId: this.userId,
            url: window.location.href,
            userAgent: navigator.userAgent,
            source: 'browser'
        };
    }
    
    addToBuffer(logEntry) {
        this.logBuffer.push(logEntry);
        
        // Remove old entries if buffer is too large
        if (this.logBuffer.length > this.config.maxBufferSize) {
            this.logBuffer.shift();
        }
        
        // Store in localStorage if enabled
        if (this.config.enableLocalStorage) {
            try {
                const stored = JSON.parse(localStorage.getItem('browserLogs') || '[]');
                stored.push(logEntry);
                
                // Keep only last 50 logs in localStorage
                if (stored.length > 50) {
                    stored.splice(0, stored.length - 50);
                }
                
                localStorage.setItem('browserLogs', JSON.stringify(stored));
            } catch (e) {
                // Ignore localStorage errors
            }
        }
        
        // Auto-flush on errors
        if (logEntry.level === 'error') {
            this.flushLogs();
        }
    }
    
    log(level, message, context = {}) {
        const args = [message];
        if (Object.keys(context).length > 0) {
            args.push(context);
        }
        this.interceptLog(level, args);
    }
    
    logError(message, errorData) {
        this.log('error', message, errorData);
    }
    
    logUserAction(action, context = {}) {
        this.log('info', `User Action: ${action}`, context);
    }
    
    logPageView(page) {
        this.log('info', `Page View: ${page}`, {
            url: window.location.href,
            referrer: document.referrer
        });
    }
    
    logApiCall(method, url, status, duration) {
        this.log('info', `API Call: ${method} ${url}`, {
            status,
            duration_ms: duration,
            type: 'api_call'
        });
    }
    
    setUserId(userId) {
        this.userId = userId;
        this.log('info', 'User ID set', { userId });
    }
    
    async flushLogs() {
        if (!this.config.enableServerLogging || this.logBuffer.length === 0) {
            return;
        }
        
        const logsToSend = [...this.logBuffer];
        this.logBuffer = [];
        
        try {
            const response = await fetch(this.config.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': this.getCsrfToken()
                },
                body: JSON.stringify({ logs: logsToSend })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
        } catch (error) {
            // Re-add logs to buffer if sending failed
            this.logBuffer.unshift(...logsToSend);
            
            // Use original console to avoid infinite loop
            this.originalConsole.error('Failed to send logs to server:', error);
        }
    }
    
    getCsrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    }
    
    // Manual logging methods
    debug(message, context) { this.log('debug', message, context); }
    info(message, context) { this.log('info', message, context); }
    warn(message, context) { this.log('warn', message, context); }
    error(message, context) { this.log('error', message, context); }
    
    // Get logs from localStorage for debugging
    getStoredLogs() {
        try {
            return JSON.parse(localStorage.getItem('browserLogs') || '[]');
        } catch (e) {
            return [];
        }
    }
    
    // Clear stored logs
    clearStoredLogs() {
        try {
            localStorage.removeItem('browserLogs');
        } catch (e) {
            // Ignore
        }
    }
    
    // Get current session logs
    getSessionLogs() {
        return [...this.logBuffer];
    }
    
    // Download logs as JSON file
    downloadLogs() {
        const allLogs = [...this.getStoredLogs(), ...this.logBuffer];
        const blob = new Blob([JSON.stringify(allLogs, null, 2)], { 
            type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `browser-logs-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialize global browser logger
window.browserLogger = new BrowserLogger({
    enableServerLogging: true,
    minLogLevel: 'info', // Capture info and above
    flushInterval: 10000, // Flush every 10 seconds
    maxBufferSize: 200
});

// Enhanced API call logging
const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
    const startTime = Date.now();
    const method = options.method || 'GET';
    
    try {
        const response = await originalFetch(url, options);
        const duration = Date.now() - startTime;
        
        // Log API calls
        browserLogger.logApiCall(method, url, response.status, duration);
        
        return response;
    } catch (error) {
        const duration = Date.now() - startTime;
        browserLogger.logApiCall(method, url, 'ERROR', duration);
        browserLogger.logError('Fetch Error', {
            url,
            method,
            error: error.message,
            duration
        });
        throw error;
    }
};

// Log page load
window.addEventListener('load', () => {
    browserLogger.logPageView(window.location.pathname);
});

// Export for use in other scripts
window.logUserAction = (action, context) => browserLogger.logUserAction(action, context);
window.logError = (message, error) => browserLogger.logError(message, error);
window.setLogUserId = (userId) => browserLogger.setUserId(userId);

console.info('🚀 Browser logging system loaded and active');