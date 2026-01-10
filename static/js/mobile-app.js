const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
const WHITE_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_KEYS = [
    { note: 'C#', anchor: 0 },
    { note: 'D#', anchor: 1 },
    { note: 'F#', anchor: 3 },
    { note: 'G#', anchor: 4 },
    { note: 'A#', anchor: 5 }
];

const PIANO_INTERVALS = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    dom7: [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    maj9: [0, 4, 7, 11, 14],
    maj11: [0, 4, 7, 11, 14, 17],
    maj13: [0, 4, 7, 11, 14, 17, 21],
    m7: [0, 3, 7, 10],
    m9: [0, 3, 7, 10, 14],
    m11: [0, 3, 7, 10, 14, 17],
    m13: [0, 3, 7, 10, 14, 17, 21],
    m7b5: [0, 3, 6, 10],
    m6: [0, 3, 7, 9],
    m6add9: [0, 3, 7, 9, 14],
    madd9: [0, 3, 7, 14],
    aug: [0, 4, 8],
    dim: [0, 3, 6],
    dim7: [0, 3, 6, 9],
    '6': [0, 4, 7, 9],
    '6add9': [0, 4, 7, 9, 14],
    '5': [0, 7],
    '9': [0, 4, 7, 10, 14],
    '11': [0, 4, 7, 10, 14, 17],
    '13': [0, 4, 7, 10, 14, 17, 21],
    sus2: [0, 2, 7],
    sus4: [0, 5, 7],
    sus2sus4: [0, 2, 5, 7],
    add9: [0, 4, 7, 14],
    mmaj7: [0, 3, 7, 11]
};

const DEFAULT_CHORD_MESSAGE = 'Select a chord to view the diagram.';
/**
 * StemTube Mobile Application - Android First
 * Architecture complète réutilisant le moteur audio desktop avec SoundTouch
 */

class MobileApp {
    constructor() {
        console.log('[MobileApp] Initializing Android-first architecture...');
        
        this.audioContext = null;
        this.masterGainNode = null;
        this.stems = {};
        this.workletLoaded = false;
        
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;
        this.startTime = 0;
        this.animationFrameId = null;
        
        this.originalBPM = 120;
        this.currentBPM = 120;
        this.currentPitchShift = 0;
        this.cachedTempoRatio = 1.0;
        this.cachedPitchRatio = 1.0;
        this.cachedPlaybackRate = 1.0;
        this.cachedSyncRatio = 1.0;
        this.playbackPosition = 0;
        this.lastAudioTime = null;
        
        this.currentExtractionId = null;
        this.currentExtractionVideoId = null;
        this.currentExtractionData = null;
        this.currentExtractionItem = null;
        this.masterAudioBuffer = null;
        this.masterAudioSource = null;
        this.cleanupRunning = null;
        this.currentPage = 'library';  // Default page: My Library
        this.currentMixerTab = 'controls';
        this.currentLibraryTab = 'my';  // Track library sub-tab (my/global)

        this.socket = null;
        this.chords = [];
        this.chordSegments = [];
        this.chordElements = [];
        this.chordScrollContainer = null;
        this.chordTrackElement = null;
        this.lyrics = [];
        this.lyricsContainer = null;
        this.lyricLineElements = [];
        this.activeLyricIndex = -1;
        this.lyricsScrollAnimation = null;
        this.lyricsAutoScrolling = false;
        this.lyricsPastPreviewCount = 2;
        this.lyricsFuturePreviewCount = 3;
        this.lyricsUserScrolling = false;
        this.lyricsScrollResumeTimer = null;
        this.lyricsScrollHandlers = null;
        this.fullscreenLyricsOpen = false;
        this.fullscreenLyricElements = [];
        // Grid View 2 properties
        this.gridView2Open = false;
        this.gridView2Beats = [];
        this.lastGridView2BeatIndex = -1;
        this.lastGridView2ControlSync = 0;
        this.playheadIndicator = null;
        this.myLibraryVideoIds = new Set(); // Track user's library video IDs
        this.libraryRefreshTimer = null;
        this.libraryPollingInterval = 6000;
        this.libraryLoading = false;
        this.pendingLibraryRefresh = false;
        this.extractionStatusCache = new Map();
        this.beatsPerBar = 4;
        this.chordPxPerBeat = 40;
        this.chordBPM = 120;
        this.beatOffset = 0;
        this.loadingOverlay = null;
        this.loadingText = null;
        this.chordDiagramMode = 'guitar';
        this.chordDiagramEl = null;
        this.chordDiagramPrevEl = null;
        this.chordDiagramNextEl = null;
        this.chordInstrumentButtons = [];
        this.currentChordSymbol = null;
        this.prevChordSymbol = null;
        this.nextChordSymbol = null;
        this.masterAudioCache = new Map();
        this.masterAudioCacheLimit = 4;
        this.chordDataCache = new Map();
        this.chordDataCacheLimit = 12;
        this.guitarDiagramCache = new Map();
        this.guitarDiagramCacheLimit = 20;
        this.guitarDiagramBuilder = null;
        this.chordRegenerating = false;
        this.wakeLock = null;
        this.wakeLockRequestPending = false;
        this.wakeLockVisibilityHandler = null;
        this.wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

        this.init();
    }

    async init() {
        this.log('[MobileApp] Starting initialization...');
        this.initSocket();
        this.setupNavigation();
        this.setupSearch();
        this.setupMixerControls();
        this.setupRefreshButtons();
        this.setupExtractionModal();
        this.setupLoadingOverlay();
        this.setupBrowserLogging();

        document.addEventListener('touchstart', () => {
            if (!this.audioContext) this.initAudioContext();
        }, { once: true });

        await this.loadLibrary();

        // Restore state from localStorage after library is loaded
        this.restoreState();

        this.log('[MobileApp] Initialization complete');
    }

    setupBrowserLogging() {
        // Override console methods to send logs to backend
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        console.log = (...args) => {
            originalLog.apply(console, args);
            this.sendLogToBackend('info', args.join(' '));
        };

        console.error = (...args) => {
            originalError.apply(console, args);
            this.sendLogToBackend('error', args.join(' '));
        };

        console.warn = (...args) => {
            originalWarn.apply(console, args);
            this.sendLogToBackend('warn', args.join(' '));
        };
    }

    sendLogToBackend(level, message) {
        // Batch logs and send every 2 seconds to avoid overwhelming server
        if (!this.logQueue) this.logQueue = [];
        this.logQueue.push({ level, message, timestamp: Date.now() });

        if (!this.logTimer) {
            this.logTimer = setTimeout(() => {
                if (this.logQueue.length > 0) {
                    fetch('/api/logs/browser', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ logs: this.logQueue })
                    }).catch(() => {}); // Silent fail - don't break app if logging fails
                    this.logQueue = [];
                }
                this.logTimer = null;
            }, 2000);
        }
    }

    log(message) {
        console.log(message);
    }

    initSocket() {
        this.socket = io();
        this.socket.on('connect', () => console.log('[Socket] Connected'));
        this.socket.on('download_progress', (data) => this.onDownloadProgress(data));
        this.socket.on('download_complete', (data) => this.onDownloadComplete(data));
        this.socket.on('download_error', (data) => this.onDownloadError(data));
        this.socket.on('extraction_progress', (data) => this.onExtractionProgress(data));
        this.socket.on('extraction_complete', (data) => this.onExtractionComplete(data));
        this.socket.on('extraction_completed_global', () => this.loadLibrary());
        this.socket.on('extraction_refresh_needed', () => this.loadLibrary());
        this.socket.on('extraction_error', (data) => this.onExtractionError(data));
    }

    async initAudioContext() {
        // Check if AudioContext exists AND is not closed
        if (this.audioContext && this.audioContext.state !== 'closed') {
            console.log('[Audio] AudioContext already exists (state:', this.audioContext.state + ')');
            return;
        }

        console.log('[Audio] Initializing NEW AudioContext...');

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.connect(this.audioContext.destination);
            console.log('[Audio] AudioContext created successfully (state:', this.audioContext.state + ')');
            await this.loadSoundTouchWorklet();
        } catch (error) {
            console.error('[Audio] Failed:', error);
        }
    }

    async loadSoundTouchWorklet() {
        try {
            if (!this.audioContext.audioWorklet) throw new Error('AudioWorklet not supported');
            await this.audioContext.audioWorklet.addModule('/static/wasm/soundtouch-worklet.js');
            this.workletLoaded = true;
            console.log('[SoundTouch] Worklet loaded');
        } catch (error) {
            console.error('[SoundTouch] Failed:', error);
            this.workletLoaded = false;
        }
    }

    setupNavigation() {
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => this.navigateTo(btn.dataset.page));
        });

        const backBtn = document.getElementById('mobileMixerBack');
        if (backBtn) backBtn.addEventListener('click', () => {
            this.navigateTo('library');
            // Cleanup is handled by navigateTo()
        });

        document.querySelectorAll('.mobile-mixer-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchMixerTab(tab.dataset.mixerTab));
        });

        // Library sub-tabs
        document.querySelectorAll('.mobile-library-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchLibraryTab(tab.dataset.libraryTab));
        });
    }

    switchLibraryTab(tabName) {
        document.querySelectorAll('.mobile-library-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.mobile-library-content').forEach(c => c.classList.remove('active'));

        const tab = document.querySelector('.mobile-library-tab[data-library-tab="' + tabName + '"]');
        const content = document.getElementById('mobile' + (tabName === 'my' ? 'MyLibraryContent' : 'GlobalLibraryContent'));

        if (tab) tab.classList.add('active');
        if (content) content.classList.add('active');

        this.currentLibraryTab = tabName;

        // Load the appropriate library
        if (tabName === 'my') this.loadLibrary();
        else if (tabName === 'global') this.loadGlobalLibrary();

        // Save state
        this.saveState();
    }

    async navigateTo(page) {
        console.log('[Nav]', page);

        // CRITICAL: Clean up completely when leaving mixer
        if (this.currentPage === 'mixer' && page !== 'mixer') {
            console.log('[Nav] Leaving mixer, cleaning up...');
            try {
                await this.cleanupMixer();
            } catch (e) {
                console.warn('[Nav] Cleanup error:', e);
            }
        }

        document.querySelectorAll('.mobile-page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));

        const targetPage = document.getElementById('mobile' + page.charAt(0).toUpperCase() + page.slice(1) + 'Page');
        if (targetPage) targetPage.classList.add('active');

        const targetBtn = document.querySelector('.mobile-nav-btn[data-page="' + page + '"]');
        if (targetBtn) targetBtn.classList.add('active');

        this.currentPage = page;

        // When navigating to library page, use saved sub-tab or default to "My Library"
        if (page === 'library') {
            this.switchLibraryTab(this.currentLibraryTab || 'my');
        }

        // Save state
        this.saveState();
    }

    switchMixerTab(tabName) {
        document.querySelectorAll('.mobile-mixer-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.mobile-mixer-content').forEach(c => c.classList.remove('active'));

        const tab = document.querySelector('.mobile-mixer-tab[data-mixer-tab="' + tabName + '"]');
        const content = document.getElementById('mobileMixer' + tabName.charAt(0).toUpperCase() + tabName.slice(1));

        if (tab) tab.classList.add('active');
        if (content) content.classList.add('active');
        this.currentMixerTab = tabName;

        // Save state
        this.saveState();
    }

    setupSearch() {
        const btn = document.getElementById('mobileSearchBtn');
        const input = document.getElementById('mobileSearchInput');
        if (btn) btn.addEventListener('click', () => this.performSearch());
        if (input) input.addEventListener('keypress', e => {
            if (e.key === 'Enter') this.performSearch();
        });
    }

    // State Persistence: Save current state to localStorage
    saveState() {
        try {
        const state = {
            currentPage: this.currentPage,
            currentLibraryTab: this.currentLibraryTab,
            currentMixerTab: this.currentMixerTab,
            currentExtractionId: this.currentExtractionId,
            currentExtractionVideoId: this.currentExtractionVideoId,
                currentTime: this.currentTime,
                isPlaying: false,  // ALWAYS save as paused - user must press play after refresh
                currentPitchShift: this.currentPitchShift,
                currentBPM: this.currentBPM,
                timestamp: Date.now()
            };
            localStorage.setItem('mobileAppState', JSON.stringify(state));
            console.log('[State] Saved:', state);
        } catch (error) {
            console.warn('[State] Failed to save:', error);
        }
    }

    // State Persistence: Restore state from localStorage
    async restoreState() {
        try {
            const stateJson = localStorage.getItem('mobileAppState');
            if (!stateJson) {
                console.log('[State] No saved state found, using defaults');
                // Navigate to default page (library)
                this.navigateTo('library');
                this.updatePlayPauseButtons();
                return;
            }

            const state = JSON.parse(stateJson);
            console.log('[State] Restoring:', state);

            // Check if state is too old (> 24 hours)
            const age = Date.now() - (state.timestamp || 0);
            if (age > 24 * 60 * 60 * 1000) {
                console.log('[State] State too old, using defaults');
                this.navigateTo('library');
                this.updatePlayPauseButtons();
                return;
            }

            // Restore library tab
            if (state.currentLibraryTab) {
                this.currentLibraryTab = state.currentLibraryTab;
            }

            // Restore mixer state if user was in mixer
            if (state.currentPage === 'mixer' && state.currentExtractionId) {
                console.log('[State] Restoring mixer:', state.currentExtractionId);

                // Try to reopen mixer
                try {
                    const res = await fetch('/api/extractions/' + state.currentExtractionId);
                    const data = await res.json();

                    if (!data.error) {
                        // CRITICAL: Clean up any previous mixer state first (and WAIT)
                        await this.cleanupMixer();

                        this.currentExtractionId = state.currentExtractionId;
                        this.currentExtractionVideoId = state.currentExtractionVideoId || null;
                        this.currentExtractionData = data;

                        if (!this.audioContext) await this.initAudioContext();
                        await this.loadMixerData(data, { extractionId: state.currentExtractionId });

                        // Restore playback position
                        if (state.currentTime > 0) {
                            this.currentTime = state.currentTime;
                            this.seek(state.currentTime);
                        }

                        // Restore pitch/tempo
                        if (state.currentPitchShift !== undefined) {
                            this.currentPitchShift = state.currentPitchShift;
                            this.syncPitchValue(state.currentPitchShift);
                            this.setPitch(state.currentPitchShift);
                        }

                        if (state.currentBPM !== undefined) {
                            this.currentBPM = state.currentBPM;
                            const tempoRatio = this.currentBPM / this.originalBPM;
                            this.syncTempoValue(tempoRatio);
                            this.setTempo(tempoRatio);
                        }

                        // Show mixer navigation button
                        const nav = document.getElementById('mobileNavMixer');
                        if (nav) nav.style.display = 'flex';

                        // Navigate to mixer
                        this.navigateTo('mixer');

                        // Restore mixer tab
                        if (state.currentMixerTab) {
                            this.switchMixerTab(state.currentMixerTab);
                        }

                        console.log('[State] Mixer restored successfully');
                        this.updatePlayPauseButtons();
                        return;
                    }
                } catch (error) {
                    console.warn('[State] Failed to restore mixer:', error);
                }
            }

            // Fallback: restore page (search/library)
            this.navigateTo(state.currentPage || 'library');
            this.updatePlayPauseButtons();

        } catch (error) {
            console.error('[State] Failed to restore state:', error);
            this.navigateTo('library');
            this.updatePlayPauseButtons();
        }
    }

    async performSearch() {
        const query = document.getElementById('mobileSearchInput').value.trim();
        if (!query) return alert('Enter search query');
        
        const results = document.getElementById('mobileSearchResults');
        results.innerHTML = '<p class="mobile-text-center">Searching...</p>';
        
        try {
            const searchParams = new URLSearchParams({
                query,
                max_results: '10'
            });
            const res = await fetch('/api/search?' + searchParams.toString());
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || ('Search failed with status ' + res.status));
            }
            this.displaySearchResults(data);
        } catch (error) {
            results.innerHTML = '<p class="mobile-text-muted">Search failed: ' + error.message + '</p>';
        }
    }

    displaySearchResults(resultsData) {
        const container = document.getElementById('mobileSearchResults');
        container.innerHTML = '';

        const items = Array.isArray(resultsData)
            ? resultsData
            : (resultsData?.items || resultsData?.results || []);

        if (!items.length) {
            container.innerHTML = '<p class="mobile-text-muted">No results</p>';
            return;
        }

        items.forEach(item => {
            const videoId = this.extractVideoId(item);
            if (!videoId) return;

            const title = item.snippet?.title || item.title || 'Unknown Title';
            const channel = item.snippet?.channelTitle || item.channelTitle || item.channel?.name || 'Unknown Channel';
            const thumbnail = this.getThumbnailUrl(item);
            const duration = this.formatDuration(item.contentDetails?.duration || item.duration || '');

            const div = document.createElement('div');
            div.className = 'mobile-search-result';
            div.innerHTML =
                '<img src="' + (thumbnail || '/static/img/default-thumb.svg') + '" class="mobile-result-thumbnail" alt="' + this.escapeHtml(title) + '">' +
                '<div class="mobile-result-info">' +
                    '<div class="mobile-result-title">' + this.escapeHtml(title) + '</div>' +
                    '<div class="mobile-result-meta">' + this.escapeHtml(channel) + (duration ? ' · ' + duration : '') + '</div>' +
                '</div>' +
                '<button class="mobile-btn mobile-btn-icon" title="Download"><i class="fas fa-download"></i></button>';

            div.querySelector('button').addEventListener('click', () => this.downloadVideo({
                id: videoId,
                title,
                thumbnail
            }));
            container.appendChild(div);
        });
    }

    extractVideoId(item) {
        if (!item) return '';
        if (typeof item.id === 'string') return item.id;
        if (item.id?.videoId) return item.id.videoId;
        if (item.videoId) return item.videoId;
        return '';
    }

    getThumbnailUrl(item) {
        if (item?.snippet?.thumbnails) {
            const thumbs = item.snippet.thumbnails;
            return (thumbs.medium && thumbs.medium.url) ||
                (thumbs.default && thumbs.default.url) ||
                '';
        }

        if (Array.isArray(item?.thumbnails) && item.thumbnails.length) {
            const medium = item.thumbnails.find(t => t.width >= 200 && t.width <= 400);
            return (medium && medium.url) || item.thumbnails[0].url || '';
        }

        return item?.thumbnail || '';
    }

    formatDuration(duration) {
        if (!duration) return '';
        if (typeof duration === 'number') {
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60).toString().padStart(2, '0');
            return minutes + ':' + seconds;
        }

        if (typeof duration === 'string' && duration.startsWith('PT')) {
            const matchHours = duration.match(/(\d+)H/);
            const matchMinutes = duration.match(/(\d+)M/);
            const matchSeconds = duration.match(/(\d+)S/);
            const totalSeconds =
                (matchHours ? parseInt(matchHours[1], 10) * 3600 : 0) +
                (matchMinutes ? parseInt(matchMinutes[1], 10) * 60 : 0) +
                (matchSeconds ? parseInt(matchSeconds[1], 10) : 0);
            if (!totalSeconds) return '';
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
            return (matchHours ? Math.floor(totalSeconds / 3600) + ':' + (Math.floor(totalSeconds / 60) % 60).toString().padStart(2, '0') : minutes) + ':' + seconds;
        }

        return duration;
    }

    async downloadVideo(video) {
        const videoId = this.extractVideoId(video);
        if (!videoId) {
            alert('Invalid video reference');
            return;
        }

        const thumbnailUrl = video.thumbnail ||
            video.thumbnail_url ||
            `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

        const payload = {
            video_id: videoId,
            title: video.title || 'Untitled',
            thumbnail_url: thumbnailUrl,
            download_type: 'audio',
            quality: 'best'
        };

        try {
            const res = await fetch('/api/downloads', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || ('Download failed with status ' + res.status));
            }

            const message = data.existing
                ? (data.global ? 'Track already available globally. Added to your library.' : 'Track already in your library.')
                : 'Download started! Check your library for progress.';
            alert(message);
            this.loadLibrary();
            this.navigateTo('library');
        } catch (error) {
            alert('Download failed: ' + error.message);
        }
    }

    setupRefreshButtons() {
        const lib = document.getElementById('mobileRefreshLibrary');
        const glob = document.getElementById('mobileRefreshGlobal');
        if (lib) lib.addEventListener('click', () => this.loadLibrary());
        if (glob) glob.addEventListener('click', () => this.loadGlobalLibrary());
    }

    setupLoadingOverlay() {
        this.loadingOverlay = document.getElementById('mobileLoadingOverlay');
        this.loadingText = document.getElementById('mobileLoadingText');
        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = 'none';
        }
    }

    setupExtractionModal() {
        this.extractionModal = document.getElementById('mobileExtractionModal');
        if (!this.extractionModal) return;

        this.extractionModalShade = this.extractionModal;
        this.extractionTitleEl = document.getElementById('mobileExtractionTitle');
        this.extractionPathEl = document.getElementById('mobileExtractionPath');
        this.extractionModelSelect = document.getElementById('mobileExtractionModel');
        this.extractionModelDescription = document.getElementById('mobileExtractionModelDescription');
        this.extractionStemsContainer = document.getElementById('mobileExtractionStems');
        this.twoStemCheckbox = document.getElementById('mobileTwoStemMode');
        this.primaryStemContainer = document.getElementById('mobilePrimaryStemContainer');
        this.primaryStemSelect = document.getElementById('mobilePrimaryStem');
        this.extractionStartBtn = document.getElementById('mobileExtractionStartBtn');
        this.extractionCloseBtn = document.getElementById('mobileExtractionClose');

        this.extractionModelDescriptions = {
            htdemucs: 'Balanced 4-stem separation (recommended).',
            htdemucs_ft: 'Fine-tuned variant with smoother vocals.',
            htdemucs_6s: '6-stem separation (vocals, drums, bass, guitar, piano, other).',
            mdx_extra: 'Enhanced vocal focus (slower but cleaner vocals).',
            mdx_extra_q: 'High quality MDX (requires diffq).'
        };

        if (this.extractionModelSelect) {
            this.extractionModelSelect.addEventListener('change', () => {
                this.handleExtractionModelChange();
            });
        }

        if (this.twoStemCheckbox) {
            this.twoStemCheckbox.addEventListener('change', () => this.togglePrimaryStemVisibility());
        }

        if (this.extractionStartBtn) {
            this.extractionStartBtn.addEventListener('click', () => this.submitExtractionFromModal());
        }

        if (this.extractionCloseBtn) {
            this.extractionCloseBtn.addEventListener('click', () => this.closeExtractionModal());
        }

        this.extractionModal.addEventListener('click', (event) => {
            if (event.target === this.extractionModal) {
                this.closeExtractionModal();
            }
        });
    }

    handleExtractionModelChange() {
        if (!this.extractionModelSelect) return;
        const option = this.extractionModelSelect.selectedOptions[0];
        const stems = option?.dataset?.stems ? option.dataset.stems.split(',').map(s => s.trim()) : ['vocals', 'drums', 'bass', 'other'];
        this.renderStemCheckboxes(stems);
        this.updateExtractionModelDescription();
        this.populatePrimaryStemOptions(stems);
    }

    renderStemCheckboxes(stems, preselected = null) {
        if (!this.extractionStemsContainer) return;
        const selectedSet = new Set((preselected && preselected.length ? preselected : stems).map(s => s.trim()));
        this.extractionStemsContainer.innerHTML = '';
        stems.forEach(stem => {
            const normalized = stem.trim();
            const wrapper = document.createElement('label');
            wrapper.className = 'mobile-stem-option';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = normalized;
            checkbox.checked = selectedSet.has(normalized);

            const span = document.createElement('span');
            span.textContent = normalized.charAt(0).toUpperCase() + normalized.slice(1);

            wrapper.appendChild(checkbox);
            wrapper.appendChild(span);
            this.extractionStemsContainer.appendChild(wrapper);
        });
    }

    populatePrimaryStemOptions(stems) {
        if (!this.primaryStemSelect) return;
        this.primaryStemSelect.innerHTML = '';
        stems.forEach(stem => {
            const opt = document.createElement('option');
            opt.value = stem;
            opt.textContent = stem.charAt(0).toUpperCase() + stem.slice(1);
            this.primaryStemSelect.appendChild(opt);
        });
        if (stems.includes('vocals')) {
            this.primaryStemSelect.value = 'vocals';
        }
    }

    updateExtractionModelDescription() {
        if (!this.extractionModelDescription || !this.extractionModelSelect) return;
        const value = this.extractionModelSelect.value;
        this.extractionModelDescription.textContent = this.extractionModelDescriptions[value] || '';
    }

    togglePrimaryStemVisibility() {
        if (!this.primaryStemContainer || !this.twoStemCheckbox) return;
        this.primaryStemContainer.style.display = this.twoStemCheckbox.checked ? 'block' : 'none';
    }

    openExtractionModal(item) {
        if (!this.extractionModal) {
            // fallback: no modal available, run extraction directly
            this.startExtractionRequest(item);
            return;
        }
        if (!item?.file_path) {
            alert('Please wait until the download finishes before extracting.');
            return;
        }

        this.currentExtractionItem = item;
        if (this.extractionTitleEl) {
            this.extractionTitleEl.textContent = item.title || 'Untitled track';
        }
        if (this.extractionPathEl) {
            this.extractionPathEl.textContent = item.file_path;
        }

        if (this.extractionModelSelect) {
            const desiredModel = item.extraction_model || 'htdemucs';
            if (Array.from(this.extractionModelSelect.options).some(opt => opt.value === desiredModel)) {
                this.extractionModelSelect.value = desiredModel;
            } else {
                this.extractionModelSelect.value = 'htdemucs';
            }
        }

        this.handleExtractionModelChange();
        this.togglePrimaryStemVisibility();
        this.extractionModal.classList.add('visible');
    }

    closeExtractionModal() {
        if (this.extractionModal) {
            this.extractionModal.classList.remove('visible');
        }
    }

    getSelectedStemsFromModal() {
        if (!this.extractionStemsContainer) return [];
        const inputs = this.extractionStemsContainer.querySelectorAll('input[type="checkbox"]');
        const selected = [];
        inputs.forEach(input => {
            if (input.checked) selected.push(input.value);
        });
        return selected;
    }

    async submitExtractionFromModal() {
        if (!this.currentExtractionItem) {
            this.closeExtractionModal();
            return;
        }
        const selectedStems = this.getSelectedStemsFromModal();
        if (!selectedStems.length) {
            alert('Please select at least one stem to extract.');
            return;
        }

        const config = {
            model_name: this.extractionModelSelect ? this.extractionModelSelect.value : 'htdemucs',
            selected_stems: selectedStems,
            two_stem_mode: this.twoStemCheckbox ? this.twoStemCheckbox.checked : false,
            primary_stem: this.primaryStemSelect ? this.primaryStemSelect.value : 'vocals'
        };

        this.closeExtractionModal();
        await this.startExtractionRequest(this.currentExtractionItem, config);
    }

    async loadLibrary() {
        if (this.libraryLoading) {
            this.pendingLibraryRefresh = true;
            return;
        }

        this.libraryLoading = true;
        try {
            const res = await fetch('/api/downloads');
            const items = await res.json();
            const normalized = Array.isArray(items) ? items : [];

            this.myLibraryVideoIds.clear();
            normalized.forEach(item => {
                if (item.video_id) this.myLibraryVideoIds.add(item.video_id);
            });

            this.displayLibrary(normalized, 'mobileLibraryList', false);
            this.updateLibraryAutoRefresh(normalized);
        } catch (error) {
            console.error('[Library]', error);
            this.updateLibraryAutoRefresh([]);
        } finally {
            this.libraryLoading = false;
            if (this.pendingLibraryRefresh) {
                this.pendingLibraryRefresh = false;
                this.loadLibrary();
            }
        }
    }

    async loadGlobalLibrary() {
        try {
            const res = await fetch('/api/library');
            const data = await res.json();
            this.displayLibrary(data.items || [], 'mobileGlobalList', true);
        } catch (error) {
            console.error('[GlobalLibrary]', error);
        }
    }

    displayLibrary(items, containerId, isGlobal) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        
        if (!items.length) {
            container.innerHTML = '<p class="mobile-text-muted">No items</p>';
            return;
        }

        if (!this.chordDiagramEl) {
            this.chordDiagramEl = document.getElementById('mobileChordDiagram');
        }
        this.setupChordInstrumentToggle();
        
        items.forEach(item => {
            const hasStems = item.extracted || item.has_extraction || item.user_has_extraction_access;
            const alreadyInLibrary = this.myLibraryVideoIds.has(item.video_id);
            const div = document.createElement('div');
            div.className = 'mobile-library-item';
            const statusInfo = this.getStatusInfo(item, hasStems, isGlobal, alreadyInLibrary);

            if (statusInfo.downloadId) div.dataset.downloadId = statusInfo.downloadId;
            if (item.video_id) div.dataset.videoId = item.video_id;
            if (statusInfo.extractionId) div.dataset.extractionId = statusInfo.extractionId;
            div.dataset.status = statusInfo.statusKey;

            let actions = '';
            if (isGlobal) {
                if (alreadyInLibrary) {
                    actions = '<div class="mobile-library-status"><i class="fas fa-check"></i> In Library</div>';
                } else if (hasStems) {
                    actions = '<button class="mobile-btn mobile-btn-small add-btn">Add</button>';
                } else {
                    actions = '<div class="mobile-library-status">Not extracted</div>';
                }
            } else {
                actions = hasStems
                    ? '<div class="mobile-library-extracted"><i class="fas fa-check-circle"></i> Ready</div><button class="mobile-btn mobile-btn-primary mix-btn">Mix</button>'
                    : '<button class="mobile-btn mobile-btn-small extract-btn">Extract</button>';
            }

            const actionsHtml = '<div class="mobile-library-actions">' + (actions || '') + '</div>';
            const statusDetail = statusInfo.detail ? '<span class="mobile-status-detail">' + this.escapeHtml(statusInfo.detail) + '</span>' : '';
            const progressMeta = statusInfo.meta ? this.escapeHtml(statusInfo.meta) : '';
            const progressClass = statusInfo.showProgress ? 'mobile-progress-container' : 'mobile-progress-container is-hidden';
            const thumbnail = item.thumbnail_url || item.thumbnail || '/static/img/default-thumb.svg';

            div.innerHTML = `
                <img src="${thumbnail}" class="mobile-library-thumbnail" alt="${this.escapeHtml(item.title || 'Track')}">
                <div class="mobile-library-info">
                    <div class="mobile-library-title">${this.escapeHtml(item.title || 'Untitled')}</div>
                    <div class="mobile-library-status-line">
                        <span class="mobile-status-pill ${statusInfo.statusClass}">${this.escapeHtml(statusInfo.statusText)}</span>
                        ${statusDetail}
                    </div>
                    <div class="${progressClass}">
                        <div class="mobile-progress-track">
                            <div class="mobile-progress-fill" style="width: ${statusInfo.progressPercent}%"></div>
                        </div>
                        <div class="mobile-progress-meta">
                            <span class="mobile-progress-value">${statusInfo.progressPercent}%</span>
                            <span class="mobile-progress-extra">${progressMeta}</span>
                        </div>
                    </div>
                    ${actionsHtml}
                </div>
            `;
            div.__libraryItem = item;
            
            if (isGlobal) {
                const btn = div.querySelector('.add-btn');
                if (btn) btn.addEventListener('click', e => { e.stopPropagation(); this.addToMyLibrary(item); });
            } else {
                const extract = div.querySelector('.extract-btn');
                const mix = div.querySelector('.mix-btn');
                if (extract) extract.addEventListener('click', e => { e.stopPropagation(); this.extractStems(item); });
                if (mix) mix.addEventListener('click', e => { e.stopPropagation(); this.openMixer(item); });
            }

            container.appendChild(div);
        });

        // Batch fetch extraction statuses for items without stems (instead of individual calls)
        if (!isGlobal) {
            const videoIdsToCheck = items
                .filter(item => !item.extracted && !item.has_extraction && !item.user_has_extraction_access && item.video_id)
                .map(item => item.video_id);
            if (videoIdsToCheck.length > 0) {
                this.batchFetchExtractionStatuses(videoIdsToCheck, container);
            }
        }
    }

    async batchFetchExtractionStatuses(videoIds, container) {
        try {
            const res = await fetch('/api/downloads/batch-extraction-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video_ids: videoIds })
            });
            if (!res.ok) return;
            const data = await res.json();
            const statuses = data.statuses || {};

            for (const videoId of videoIds) {
                const status = statuses[videoId];
                if (!status) continue;
                const element = container.querySelector(`[data-video-id="${videoId}"]`);
                if (!element) continue;
                const item = element.__libraryItem;

                if (status.status === 'extracted') {
                    this.markItemReady(element, item, status);
                } else if (status.status === 'extracted_no_access') {
                    this.markItemNeedsAccess(element, item, status);
                }
            }
        } catch (err) {
            console.warn('[Library] Batch extraction status check failed:', err);
        }
    }
    
    getStatusInfo(item, hasStems, isGlobal, alreadyInLibrary) {
        const downloadId = item.download_id || item.id || '';
        const extractionId = item.extraction_id || '';
        let statusKey = '';
        if (item.status) {
            if (typeof item.status === 'string') statusKey = item.status.toLowerCase();
            else if (item.status.value) statusKey = item.status.value.toLowerCase();
        }

        let statusText = 'Idle';
        if (isGlobal) {
            if (alreadyInLibrary) {
                statusKey = 'ready';
                statusText = 'In Library';
            } else if (hasStems) {
                statusKey = 'ready';
                statusText = 'Ready Globally';
            } else {
                statusKey = 'not-extracted';
                statusText = 'Not extracted';
            }
        } else {
            switch (statusKey) {
                case 'downloading':
                case 'active':
                    statusKey = 'downloading';
                    statusText = 'Downloading';
                    break;
                case 'queued':
                    statusText = 'Queued';
                    break;
                case 'extracting':
                    statusText = 'Extracting';
                    break;
                case 'failed':
                case 'error':
                    statusKey = 'failed';
                    statusText = 'Failed';
                    break;
                case 'completed':
                    statusKey = hasStems ? 'ready' : 'completed';
                    statusText = hasStems ? 'Ready' : 'Downloaded';
                    break;
                case 'cancelled':
                    statusText = 'Cancelled';
                    break;
                default:
                    statusKey = hasStems ? 'ready' : 'idle';
                    statusText = hasStems ? 'Ready' : 'Idle';
            }
        }

        const baseProgress = this.normalizeProgress(item.progress);
        const showProgress = !isGlobal && (this.statusNeedsProgress(statusKey) || (baseProgress > 0 && baseProgress < 100));
        const metaParts = [];
        if (item.speed) metaParts.push(item.speed);
        if (item.eta) metaParts.push(item.eta);
        if (!metaParts.length && item.status_message) metaParts.push(item.status_message);
        const metaText = metaParts.join(' • ');

        return {
            downloadId,
            extractionId,
            statusKey,
            statusText,
            statusClass: 'status-' + statusKey,
            showProgress,
            progressPercent: this.formatProgressPercent(showProgress ? baseProgress : 0),
            meta: showProgress ? metaText : '',
            detail: showProgress ? '' : metaText
        };
    }

    statusNeedsProgress(statusKey) {
        return ['downloading', 'queued', 'extracting', 'processing', 'active'].includes(statusKey);
    }

    normalizeProgress(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return 0;
        return Math.min(100, Math.max(0, num));
    }

    formatProgressPercent(value) {
        const rounded = Math.round(value);
        if (!Number.isFinite(rounded)) return 0;
        return Math.min(100, Math.max(0, rounded));
    }

    ensureExtractionStatusForItem(element, item, statusInfo) {
        if (!item?.video_id) return;
        if (statusInfo.statusKey === 'ready') return;
        if (['downloading', 'queued', 'extracting'].includes(statusInfo.statusKey)) return;
        this.fetchExtractionStatus(item.video_id)
            .then(status => {
                if (!status) return;
                if (status.status === 'extracted') {
                    this.markItemReady(element, item, status);
                } else if (status.status === 'extracted_no_access') {
                    this.markItemNeedsAccess(element, item, status);
                }
            })
            .catch(err => console.warn('[Library] Extraction status check failed:', err));
    }

    fetchExtractionStatus(videoId) {
        if (!videoId) return Promise.resolve(null);
        if (!this.extractionStatusCache) this.extractionStatusCache = new Map();
        if (this.extractionStatusCache.has(videoId)) {
            return this.extractionStatusCache.get(videoId);
        }
        const promise = fetch(`/api/downloads/${encodeURIComponent(videoId)}/extraction-status`)
            .then(async res => {
                if (!res.ok) return null;
                return res.json();
            })
            .finally(() => {
                // Keep cache only briefly to avoid hammering API on repeated renders
                setTimeout(() => this.extractionStatusCache.delete(videoId), 5000);
            });
        this.extractionStatusCache.set(videoId, promise);
        return promise;
    }

    markItemReady(element, item, status) {
        const record = element.__libraryItem || item || {};
        element.__libraryItem = record;
        element.dataset.status = 'ready';
        const pill = element.querySelector('.mobile-status-pill');
        if (pill) {
            pill.textContent = 'Ready';
            pill.className = 'mobile-status-pill status-ready';
        }
        const detail = element.querySelector('.mobile-status-detail');
        if (detail) {
            detail.textContent = status?.extraction_model || 'Stems available';
        }
        const progress = element.querySelector('.mobile-progress-container');
        if (progress) progress.classList.add('is-hidden');

        const actions = element.querySelector('.mobile-library-actions') || element.appendChild(document.createElement('div'));
        actions.classList.add('mobile-library-actions');
        actions.innerHTML = '';

        const readyLabel = document.createElement('div');
        readyLabel.className = 'mobile-library-extracted';
        readyLabel.innerHTML = '<i class="fas fa-check-circle"></i> Ready';
        const mixBtn = document.createElement('button');
        mixBtn.className = 'mobile-btn mobile-btn-primary mix-btn';
        mixBtn.textContent = 'Mix';
        mixBtn.addEventListener('click', e => {
            e.stopPropagation();
            this.openMixer(record);
        });

        actions.appendChild(readyLabel);
        actions.appendChild(mixBtn);

        if (status?.extraction_id) element.dataset.extractionId = status.extraction_id;
        if (record) {
            record.extracted = true;
            record.has_extraction = true;
        }
    }

    markItemNeedsAccess(element, item, status) {
        const record = element.__libraryItem || item || {};
        element.__libraryItem = record;
        element.dataset.status = 'needs-access';
        const pill = element.querySelector('.mobile-status-pill');
        if (pill) {
            pill.textContent = 'Extracted';
            pill.className = 'mobile-status-pill status-queued';
        }
        const detail = element.querySelector('.mobile-status-detail');
        if (detail) detail.textContent = 'Tap to request access';
        const progress = element.querySelector('.mobile-progress-container');
        if (progress) progress.classList.add('is-hidden');

        const actions = element.querySelector('.mobile-library-actions') || element.appendChild(document.createElement('div'));
        actions.classList.add('mobile-library-actions');
        actions.innerHTML = '';

        const requestBtn = document.createElement('button');
        requestBtn.className = 'mobile-btn mobile-btn-small';
        requestBtn.textContent = 'Request Access';
        requestBtn.addEventListener('click', e => {
            e.stopPropagation();
            this.requestExtractionAccess(record?.video_id, actions, element);
        });
        actions.appendChild(requestBtn);
    }

    async requestExtractionAccess(videoId, container, element) {
        if (!videoId) return;
        try {
            container.classList.add('mobile-loading');
            container.innerHTML = '<span class="mobile-text-muted">Requesting access...</span>';
            const res = await fetch('/api/extractions', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ video_id: videoId, grant_access_only: true })
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || 'Failed');
            alert(data.message || 'Access granted!');
            this.loadLibrary();
        } catch (error) {
            alert('Access request failed: ' + error.message);
            container.innerHTML = '';
            const retry = document.createElement('button');
            retry.className = 'mobile-btn mobile-btn-small';
            retry.textContent = 'Retry Access';
            retry.addEventListener('click', e => {
                e.stopPropagation();
                this.requestExtractionAccess(videoId, container, element);
            });
            container.appendChild(retry);
        } finally {
            container.classList.remove('mobile-loading');
        }
    }

    updateLibraryAutoRefresh(items) {
        const needsRefresh = items.some(item => {
            const rawStatus = (item.status && item.status.value) ? item.status.value : (item.status || '');
            return this.statusNeedsProgress(rawStatus.toString().toLowerCase());
        });
        if (needsRefresh) {
            if (!this.libraryRefreshTimer) {
                this.libraryRefreshTimer = setInterval(() => this.loadLibrary(), this.libraryPollingInterval);
            }
        } else {
            this.clearLibraryAutoRefresh();
        }
    }

    clearLibraryAutoRefresh() {
        if (this.libraryRefreshTimer) {
            clearInterval(this.libraryRefreshTimer);
            this.libraryRefreshTimer = null;
        }
    }

    findLibraryItem(downloadId, videoId, extractionId) {
        const items = document.querySelectorAll('.mobile-library-item');
        let found = null;
        items.forEach(el => {
            if (found) return;
            if (downloadId && el.dataset.downloadId === String(downloadId)) found = el;
            else if (videoId && el.dataset.videoId === String(videoId)) found = el;
            else if (extractionId && el.dataset.extractionId === String(extractionId)) found = el;
        });
        return found;
    }

    showProgressContainer(element) {
        if (!element) return;
        const container = element.querySelector('.mobile-progress-container');
        if (container) container.classList.remove('is-hidden');
    }

    updateProgressElements(element, progress, meta) {
        if (!element) return;
        this.showProgressContainer(element);
        const fill = element.querySelector('.mobile-progress-fill');
        const value = element.querySelector('.mobile-progress-value');
        const extra = element.querySelector('.mobile-progress-extra');
        if (fill) fill.style.width = this.formatProgressPercent(progress) + '%';
        if (value) value.textContent = this.formatProgressPercent(progress) + '%';
        if (extra) extra.textContent = meta || '';
    }

    updateStatusPill(element, statusKey, text, detail) {
        if (!element) return;
        element.dataset.status = statusKey;
        const pill = element.querySelector('.mobile-status-pill');
        if (pill) {
            pill.textContent = text;
            pill.className = 'mobile-status-pill status-' + statusKey;
        }
        const detailEl = element.querySelector('.mobile-status-detail');
        if (detailEl) detailEl.textContent = detail || '';
    }

    formatSpeedEta(speed, eta) {
        const parts = [];
        if (speed) parts.push(speed);
        if (eta) parts.push(eta);
        return parts.join(' • ');
    }

    onDownloadProgress(data) {
        const element = this.findLibraryItem(data.download_id, data.video_id);
        if (!element) {
            this.loadLibrary();
            return;
        }
        const progress = this.normalizeProgress(data.progress);
        const meta = this.formatSpeedEta(data.speed, data.eta) || 'Downloading...';
        this.updateStatusPill(element, 'downloading', 'Downloading', '');
        this.updateProgressElements(element, progress, meta);
    }

    onDownloadComplete() {
        this.loadLibrary();
    }

    onDownloadError(data) {
        const element = this.findLibraryItem(data.download_id);
        if (!element) {
            this.loadLibrary();
            return;
        }
        this.updateStatusPill(element, 'failed', 'Failed', data.error_message || 'Download failed');
        this.updateProgressElements(element, 0, data.error_message || '');
    }

    onExtractionProgress(data) {
        const element = this.findLibraryItem(data.download_id, data.video_id, data.extraction_id);
        if (!element) {
            this.loadLibrary();
            return;
        }
        const progress = this.normalizeProgress(data.progress);
        const meta = data.status_message || 'Extracting...';
        this.updateStatusPill(element, 'extracting', 'Extracting', meta);
        this.updateProgressElements(element, progress, meta);
        if (data.extraction_id) element.dataset.extractionId = data.extraction_id;
    }

    onExtractionComplete() {
        this.loadLibrary();
    }

    onExtractionError(data) {
        const element = this.findLibraryItem(null, null, data.extraction_id);
        if (!element) {
            this.loadLibrary();
            return;
        }
        this.updateStatusPill(element, 'failed', 'Extraction failed', data.error_message || '');
        this.updateProgressElements(element, 0, data.error_message || '');
    }

    async addToMyLibrary(item) {
        if (!item || !item.id) {
            alert('Unable to add this item right now.');
            return;
        }

        const userHasDownload = Boolean(item.user_has_download_access);
        const userHasExtraction = Boolean(item.user_has_extraction_access);
        const downloadAvailable = Boolean(item.can_add_download || item.has_download || item.file_path);
        const extractionAvailable = Boolean(item.can_add_extraction || item.has_extraction || item.extracted);

        const actions = [];

        if (downloadAvailable && !userHasDownload) {
            actions.push({
                type: 'download',
                url: `/api/library/${item.id}/add-download`
            });
        }

        if (extractionAvailable && !userHasExtraction) {
            actions.push({
                type: 'extraction',
                url: `/api/library/${item.id}/add-extraction`
            });
        }

        if (!actions.length) {
            alert('This track is already in your library.');
            return;
        }

        try {
            for (const action of actions) {
                const res = await fetch(action.url, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'}
                });

                let data = {};
                try {
                    data = await res.json();
                } catch (_) {
                    data = {};
                }

                if (!res.ok || data.error) {
                    throw new Error(data.error || `Unable to add ${action.type}`);
                }
            }

            alert('Added!');
            await this.loadLibrary();
            await this.loadGlobalLibrary();
        } catch (error) {
            console.error('[AddToLibrary]', error);
            alert('Failed: ' + error.message);
        }
    }

    async extractStems(item) {
        if (!item || !item.file_path) {
            alert('Please wait for the download to finish before extracting.');
            return;
        }
        this.openExtractionModal(item);
    }

    async startExtractionRequest(item, config = {}) {
        if (!item || !item.file_path) {
            alert('Please wait for the download to finish before extracting.');
            return;
        }

        const fallbackStems = Array.isArray(item.selected_stems) && item.selected_stems.length
            ? item.selected_stems
            : ['vocals', 'drums', 'bass', 'other'];

        const payload = {
            video_id: item.video_id,
            audio_path: item.file_path,
            model_name: config.model_name || item.model_name || 'htdemucs',
            selected_stems: Array.isArray(config.selected_stems) && config.selected_stems.length ? config.selected_stems : fallbackStems,
            two_stem_mode: Boolean(config.two_stem_mode || (item.two_stem_mode && item.two_stem_mode !== 'false')),
            primary_stem: config.primary_stem || item.primary_stem || 'vocals',
            title: item.title || ''
        };

        try {
            const res = await fetch('/api/extractions', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || ('Extraction failed with status ' + res.status));
            }

            const downloadId = item.download_id || item.id || '';
            const libraryItem = this.findLibraryItem(downloadId, item.video_id);

            if (data.in_progress && data.extraction_id === 'in_progress') {
                alert(data.message || 'Extraction already running by another user. We will refresh when it completes.');
                if (libraryItem) {
                    this.updateStatusPill(libraryItem, 'queued', 'Queued', 'Waiting for existing extraction...');
                    this.updateProgressElements(libraryItem, 0, 'Waiting...');
                }
                this.loadLibrary();
                return;
            }

            if (libraryItem) {
                this.updateStatusPill(libraryItem, 'queued', 'Queued', 'Preparing extraction…');
                this.updateProgressElements(libraryItem, 0, 'Queued');
                if (data.extraction_id) {
                    libraryItem.dataset.extractionId = data.extraction_id;
                }
            }

            if (data.existing) {
                alert(data.message || 'Stems already available. Added to your library.');
                await this.loadLibrary();
                return;
            }

            alert('Extraction started! This card will update as it processes.');
            await this.loadLibrary();
        } catch (error) {
            alert('Extraction failed: ' + error.message);
        }
    }

    async openMixer(item) {
        this.showLoading('Loading stems…');
        try {
            const id = item.id || item.video_id;
            const res = await fetch('/api/extractions/' + id);
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            // CRITICAL: Clean up previous mixer completely before loading new one
            await this.cleanupMixer();

            this.currentExtractionId = id;
            this.currentExtractionData = data;

            if (!this.audioContext) await this.initAudioContext();
            await this.loadMixerData(data, { showLoader: false, extractionId: id });

            const nav = document.getElementById('mobileNavMixer');
            if (nav) nav.style.display = 'flex';
            this.navigateTo('mixer');

            // Save state after opening mixer
            this.saveState();
        } catch (error) {
            alert('Failed: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async cleanupMixer() {
        if (this.cleanupRunning) {
            return this.cleanupRunning;
        }
        this.cleanupRunning = this.performMixerCleanup().finally(() => {
            this.cleanupRunning = null;
        });
        return this.cleanupRunning;
    }

    async performMixerCleanup() {
        console.log('[Cleanup] ========== Starting COMPLETE mixer cleanup ==========');

        // Stop playback animation FIRST
        this.stopPlaybackAnimation();
        this.isPlaying = false;
        this.updatePlayPauseButtons();
        console.log('[Cleanup] Playback stopped');

        // Clean up all stems thoroughly
        const stemNames = Object.keys(this.stems);
        console.log('[Cleanup] Cleaning up', stemNames.length, 'stems:', stemNames);

        Object.keys(this.stems).forEach(name => {
            const stem = this.stems[name];

            // Stop and disconnect source
            if (stem.source) {
                try {
                    stem.source.stop(0);
                    stem.source.disconnect();
                    console.log('[Cleanup] Stopped and disconnected source for:', name);
                } catch (e) {
                    console.warn('[Cleanup] Error stopping source:', name, e);
                }
                stem.source = null;
            }

            // Disconnect SoundTouch node
            if (stem.soundTouchNode) {
                try {
                    stem.soundTouchNode.disconnect();
                    console.log('[Cleanup] Disconnected SoundTouch node for:', name);
                } catch (e) {
                    console.warn('[Cleanup] Error disconnecting SoundTouch:', name, e);
                }
                stem.soundTouchNode = null;
            }

            // Disconnect gain node
            if (stem.gainNode) {
                try {
                    stem.gainNode.disconnect();
                    console.log('[Cleanup] Disconnected gain node for:', name);
                } catch (e) {
                    console.warn('[Cleanup] Error disconnecting gain:', name, e);
                }
                stem.gainNode = null;
            }

            // Disconnect pan node
            if (stem.panNode) {
                try {
                    stem.panNode.disconnect();
                    console.log('[Cleanup] Disconnected pan node for:', name);
                } catch (e) {
                    console.warn('[Cleanup] Error disconnecting pan:', name, e);
                }
                stem.panNode = null;
            }

            // Clear buffer reference (allow GC)
            stem.buffer = null;
        });

        // Clear stems object completely
        this.stems = {};
        this.masterAudioBuffer = null;
        this.masterAudioSource = null;
        console.log('[Cleanup] All stems cleared');

        // CRITICAL: Close AudioContext and WAIT for it to complete
        if (this.audioContext) {
            const currentState = this.audioContext.state;
            console.log('[Cleanup] AudioContext state before close:', currentState);

            if (currentState !== 'closed') {
                try {
                    // Disconnect master gain first
                    if (this.masterGainNode) {
                        this.masterGainNode.disconnect();
                        console.log('[Cleanup] Master gain disconnected');
                        this.masterGainNode = null;
                    }

                    // Close AudioContext and WAIT for completion
                    console.log('[Cleanup] Closing AudioContext...');
                    await this.audioContext.close();
                    console.log('[Cleanup] AudioContext.close() completed, final state:', this.audioContext.state);
                } catch (e) {
                    console.error('[Cleanup] Error closing AudioContext:', e);
                }
            }

            // Reset AudioContext reference
            this.audioContext = null;
            this.workletLoaded = false;
            console.log('[Cleanup] AudioContext reference cleared');

            // CRITICAL: Wait a bit to ensure browser has fully cleaned up
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log('[Cleanup] Waited 100ms for browser cleanup');
        } else {
            console.log('[Cleanup] No AudioContext to clean up');
        }

        // Reset playback state
        this.currentTime = 0;
        this.duration = 0;
        this.startTime = 0;

        // Clear chords and lyrics
        this.chords = [];
        this.lyrics = [];
        this.playheadIndicator = null;

        // Clear track controls UI
        const tracksContainer = document.getElementById('mobileTracksContainer');
        if (tracksContainer) {
            tracksContainer.innerHTML = '';
        }

        // Clear waveform
        const waveformCanvas = document.getElementById('mobileWaveformCanvas');
        if (waveformCanvas) {
            const ctx = waveformCanvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
            }
        }
        const timeline = document.getElementById('mobileWaveformTimeline');
        if (timeline) timeline.innerHTML = '';

        this.currentChordSymbol = null;
        if (this.chordDiagramEl) {
            this.setChordDiagramMessage(DEFAULT_CHORD_MESSAGE);
        }
        // reset mixer metadata to avoid stale reloads
        this.currentExtractionId = null;
        this.currentExtractionVideoId = null;
        this.currentExtractionData = null;
        this.currentExtractionItem = null;
        this.currentPitchShift = 0;
        this.originalBPM = 120;
        this.currentBPM = 120;
        this.saveState();

        console.log('[Cleanup] ========== COMPLETE mixer cleanup finished ==========');
    }

    async loadMixerData(data, options = {}) {
        const showLoader = options.showLoader !== false;
        const cacheKey = options.extractionId || this.currentExtractionId;
        if (showLoader) this.showLoading('Loading stems…');
        try {
            console.log('[LoadMixer] Starting with data:', data);
            document.getElementById('mobileMixerTitle').textContent = data.title || 'Unknown';

            if (data.detected_bpm) {
                this.originalBPM = data.detected_bpm;
                this.currentBPM = data.detected_bpm;
                console.log('[LoadMixer] BPM set to:', this.originalBPM);
            }

        const stemsPaths = typeof data.stems_paths === 'string' ? JSON.parse(data.stems_paths) : data.stems_paths;
        console.log('[LoadMixer] Stems paths:', stemsPaths);

        if (!stemsPaths) {
            console.error('[LoadMixer] No stems paths found!');
            throw new Error('No stems');
        }

        this.stems = {};
        const container = document.getElementById('mobileTracksContainer');
        if (container) {
            container.innerHTML = '';
            console.log('[LoadMixer] Cleared tracks container');
        } else {
            console.error('[LoadMixer] Tracks container not found!');
        }

        const stemNames = Object.keys(stemsPaths);
        console.log('[LoadMixer] Loading', stemNames.length, 'stems:', stemNames);

        await Promise.all(stemNames.map(name => this.loadStem(name, stemsPaths[name])));

        const loadedStems = Object.keys(this.stems);
        console.log('[LoadMixer] Loaded stems:', loadedStems);
        console.log('[LoadMixer] Stems detail:', this.stems);

        const durations = Object.values(this.stems).map(s => s.buffer ? s.buffer.duration : 0).filter(d => d > 0);
        if (durations.length) {
            this.duration = Math.max(...durations);
            console.log('[LoadMixer] Duration set to:', this.duration);
        } else {
            console.error('[LoadMixer] No valid durations found!');
        }

        await this.ensureMasterAudioBuffer(data);

        // Render waveform
        console.log('[LoadMixer] Rendering waveform...');
        this.renderWaveform();

        if (typeof data.beat_offset === 'number') {
            this.beatOffset = data.beat_offset;
        } else {
            this.beatOffset = 0;
        }
        this.beatsPerBar = data.beats_per_bar || data.time_signature?.beats || 4;
        this.chordBPM = this.currentBPM || this.originalBPM || 120;

        const chordPayload = data.chords_data ?? data.chords ?? null;
        this.currentExtractionVideoId = data.video_id || this.currentExtractionVideoId || null;
        let parsedChords = null;
        if (chordPayload) {
            try {
                parsedChords = typeof chordPayload === 'string' ? JSON.parse(chordPayload) : chordPayload;
            } catch (err) {
                console.warn('[LoadMixer] Failed to parse chords payload:', err);
            }
            if (parsedChords && !Array.isArray(parsedChords) && Array.isArray(parsedChords.chords)) {
                parsedChords = parsedChords.chords;
            }
        }

        if (Array.isArray(parsedChords)) {
            this.chords = parsedChords;
            if (cacheKey) this.setChordCache(cacheKey, parsedChords);
            console.log('[LoadMixer] Loaded', this.chords.length, 'chords');
            this.preloadChordDiagrams();
            this.displayChords();
            this.initGridView2Popup();
        } else if (cacheKey && this.chordDataCache.has(cacheKey)) {
            this.chords = this.cloneChordArray(this.chordDataCache.get(cacheKey));
            console.log('[LoadMixer] Loaded chords from cache:', this.chords.length);
            this.preloadChordDiagrams();
            this.displayChords();
            this.initGridView2Popup();
        } else {
            this.chords = [];
            console.log('[LoadMixer] No chords data');
            this.displayChords();
            this.initGridView2Popup();
        }

        // Backend can return either 'lyrics' or 'lyrics_data'
        const lyricsData = data.lyrics || data.lyrics_data;

        if (lyricsData) {
            this.lyrics = typeof lyricsData === 'string' ? JSON.parse(lyricsData) : lyricsData;
            console.log('[LoadMixer] Loaded', this.lyrics.length, 'lyrics');
            this.displayLyrics();
        } else {
            this.lyrics = [];
            console.log('[LoadMixer] No lyrics data');
        }

            this.updateTimeDisplay();
            console.log('[LoadMixer] Complete!');
        } finally {
            if (showLoader) this.hideLoading();
        }
    }

    async loadStem(name, path) {
        console.log('[LoadStem] Starting:', name, 'path:', path);
        try {
            const url = '/api/extracted_stems/' + this.currentExtractionId + '/' + name;
            console.log('[LoadStem] Fetching:', url);

            const res = await fetch(url);
            console.log('[LoadStem]', name, 'response status:', res.status);

            if (!res.ok) {
                if (res.status === 404) {
                    console.warn('[LoadStem]', name, '404 Not Found - skipping');
                    return;
                }
                throw new Error('HTTP ' + res.status);
            }

            console.log('[LoadStem]', name, 'downloading audio data...');
            const arrayBuffer = await res.arrayBuffer();
            console.log('[LoadStem]', name, 'downloaded', arrayBuffer.byteLength, 'bytes');

            console.log('[LoadStem]', name, 'decoding audio...');
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            console.log('[LoadStem]', name, 'decoded! Duration:', audioBuffer.duration, 'channels:', audioBuffer.numberOfChannels);

            console.log('[LoadStem]', name, 'creating audio nodes...');
            await this.createAudioNodesForStem(name, audioBuffer);

            console.log('[LoadStem]', name, 'creating track control...');
            this.createTrackControl(name);

            console.log('[LoadStem]', name, 'COMPLETE ✓');
        } catch (error) {
            console.error('[LoadStem]', name, 'FAILED:', error);
            console.error('[LoadStem]', name, 'Error stack:', error.stack);
        }
    }

    async createAudioNodesForStem(name, buffer) {
        console.log('[CreateNodes]', name, 'creating audio nodes...');
        console.log('[CreateNodes]', name, 'workletLoaded:', this.workletLoaded);
        const playbackRate = this.cachedPlaybackRate || (this.currentBPM / this.originalBPM) || 1.0;

        const gain = this.audioContext.createGain();
        gain.gain.value = 1.0;
        console.log('[CreateNodes]', name, 'created GainNode');

        const pan = this.audioContext.createStereoPanner();
        pan.pan.value = 0;
        console.log('[CreateNodes]', name, 'created StereoPannerNode');

        let soundTouch = null;
        if (this.workletLoaded) {
            try {
                console.log('[CreateNodes]', name, 'creating SoundTouch AudioWorkletNode...');
                soundTouch = new AudioWorkletNode(this.audioContext, 'soundtouch-processor');
                const tempo = this.cachedTempoRatio || (this.currentBPM / this.originalBPM);
                const pitch = this.cachedPitchRatio || Math.pow(2, this.currentPitchShift / 12);
                soundTouch.parameters.get('tempo').value = tempo;
                soundTouch.parameters.get('pitch').value = pitch;
                soundTouch.parameters.get('rate').value = 1.0;
                soundTouch.connect(gain);
                console.log('[CreateNodes]', name, 'SoundTouch created and configured (tempo:', tempo, 'pitch:', pitch, ', playbackRate:', playbackRate, ')');
            } catch (e) {
                console.error('[CreateNodes]', name, 'SoundTouch creation failed:', e);
                soundTouch = null;
            }
        } else {
            console.warn('[CreateNodes]', name, 'SoundTouch worklet not loaded, using direct connection');
        }

        gain.connect(pan);
        pan.connect(this.masterGainNode);
        console.log('[CreateNodes]', name, 'connected audio graph');

        this.stems[name] = {
            name,
            buffer,
            source: null,
            soundTouchNode: soundTouch,
            gainNode: gain,
            panNode: pan,
            volume: 1,
            pan: 0,
            muted: false,
            solo: false
        };
        console.log('[CreateNodes]', name, 'stem object created and stored');
    }

    createTrackControl(name) {
        const container = document.getElementById('mobileTracksContainer');
        if (!container) return;
        
        const div = document.createElement('div');
        div.className = 'mobile-track';
        div.innerHTML = '<div class="mobile-track-header"><span class="mobile-track-name">' + name + '</span><div class="mobile-track-buttons"><button class="mobile-track-btn mute-btn" data-track="' + name + '">MUTE</button><button class="mobile-track-btn solo-btn" data-track="' + name + '">SOLO</button></div></div><div class="mobile-track-controls"><div class="mobile-track-control"><span class="mobile-track-label">Volume</span><input type="range" class="mobile-track-slider volume-slider" data-track="' + name + '" min="0" max="100" value="100"><span class="mobile-track-value">100%</span></div><div class="mobile-track-control"><span class="mobile-track-label">Pan</span><input type="range" class="mobile-track-slider pan-slider" data-track="' + name + '" min="-100" max="100" value="0"><span class="mobile-track-value">0</span></div></div>';
        
        div.querySelector('.volume-slider').addEventListener('input', e => {
            const v = parseInt(e.target.value);
            e.target.nextElementSibling.textContent = v + '%';
            this.setVolume(name, v / 100);
        });
        
        div.querySelector('.pan-slider').addEventListener('input', e => {
            const p = parseInt(e.target.value);
            e.target.nextElementSibling.textContent = p;
            this.setPan(name, p / 100);
        });
        
        div.querySelector('.mute-btn').addEventListener('click', function() {
            window.mobileApp.toggleMute(name);
            this.classList.toggle('active');
        });
        
        div.querySelector('.solo-btn').addEventListener('click', () => {
            this.toggleSolo(name);
            this.updateSoloButtons();
        });
        
        container.appendChild(div);
    }

    setupMixerControls() {
        // Setup play/stop buttons for all three tabs (Mix, Chords, Lyrics)
        const playBtnIds = ['mobilePlayBtn', 'mobilePlayBtnChords', 'mobilePlayBtnLyrics'];
        const stopBtnIds = ['mobileStopBtn', 'mobileStopBtnChords', 'mobileStopBtnLyrics'];

        playBtnIds.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', () => this.togglePlayback());
        });

        stopBtnIds.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', () => this.stop());
        });

        // Seek bar (interactive scrubbing)
        const seekBar = document.getElementById('mobileSeekBar');
        if (seekBar) {
            seekBar.addEventListener('touchstart', e => this.handleSeekTouch(e));
            seekBar.addEventListener('touchmove', e => this.handleSeekTouch(e));
            seekBar.addEventListener('click', e => this.handleSeekClick(e));
        }

        // Setup tempo sliders for all three tabs
        const tempoSliderIds = ['mobileTempoSliderMain', 'mobileTempoSliderChords', 'mobileTempoSliderLyrics'];
        tempoSliderIds.forEach((id, index) => {
            const slider = document.getElementById(id);
            if (slider) {
                slider.addEventListener('input', e => {
                    const ratio = parseFloat(e.target.value);
                    // Update all tempo displays
                    this.syncTempoValue(ratio);
                    this.setTempo(ratio);  // Now accepts ratio, not BPM
                });
                // Save state when user releases slider
                slider.addEventListener('change', () => this.saveState());
            }
        });

        // Setup pitch sliders for all three tabs
        const pitchSliderIds = ['mobilePitchSliderMain', 'mobilePitchSliderChords', 'mobilePitchSliderLyrics'];
        pitchSliderIds.forEach((id, index) => {
            const slider = document.getElementById(id);
            if (slider) {
                slider.addEventListener('input', e => {
                    const v = parseInt(e.target.value);
                    // Update all pitch displays
                    this.syncPitchValue(v);
                    this.setPitch(v);
                });
                // Save state when user releases slider
                slider.addEventListener('change', () => this.saveState());
            }
        });

        // Lyrics generation
        const lyrics = document.getElementById('mobileGenerateLyrics');
        if (lyrics) lyrics.addEventListener('click', () => this.generateLyrics());

        // Fullscreen Lyrics popup
        const fullscreenLyricsBtn = document.getElementById('mobileFullScreenLyrics');
        if (fullscreenLyricsBtn) fullscreenLyricsBtn.addEventListener('click', () => this.openFullscreenLyrics());

        const closeFullscreenLyricsBtn = document.getElementById('fullscreen-lyrics-popup-close');
        if (closeFullscreenLyricsBtn) closeFullscreenLyricsBtn.addEventListener('click', () => this.closeFullscreenLyrics());

        // Close fullscreen lyrics popup on overlay click
        const fullscreenLyricsPopup = document.getElementById('fullscreen-lyrics-popup');
        if (fullscreenLyricsPopup) {
            fullscreenLyricsPopup.addEventListener('click', (e) => {
                if (e.target === fullscreenLyricsPopup) this.closeFullscreenLyrics();
            });
        }

        // Fullscreen lyrics size slider
        const fullscreenSizeSlider = document.getElementById('fullscreenLyricsSizeSlider');
        if (fullscreenSizeSlider) {
            fullscreenSizeSlider.addEventListener('input', (e) => this.applyFullscreenLyricsScale(parseFloat(e.target.value)));
        }

        // Setup fullscreen lyrics controls
        this.initFullscreenLyricsControls();

        const regenerateChordsBtn = document.getElementById('mobileRegenerateChords');
        if (regenerateChordsBtn) regenerateChordsBtn.addEventListener('click', () => this.regenerateChords());

        // Ensure initial button state matches playback flag
        this.updatePlayPauseButtons();
    }

    syncTempoValue(value) {
        // Synchronize tempo value across all three tabs
        const sliderIds = ['mobileTempoSliderMain', 'mobileTempoSliderChords', 'mobileTempoSliderLyrics'];
        const valueIds = ['mobileTempoValueMain', 'mobileTempoValueChords', 'mobileTempoValueLyrics'];

        sliderIds.forEach(id => {
            const slider = document.getElementById(id);
            if (slider) slider.value = value;
        });

        valueIds.forEach(id => {
            const display = document.getElementById(id);
            if (display) display.textContent = value.toFixed(2) + 'x';
        });
    }

    syncPitchValue(value) {
        // Synchronize pitch value across all three tabs
        const sliderIds = ['mobilePitchSliderMain', 'mobilePitchSliderChords', 'mobilePitchSliderLyrics'];
        const valueIds = ['mobilePitchValueMain', 'mobilePitchValueChords', 'mobilePitchValueLyrics'];

        sliderIds.forEach(id => {
            const slider = document.getElementById(id);
            if (slider) slider.value = value;
        });

        valueIds.forEach(id => {
            const display = document.getElementById(id);
            if (display) display.textContent = (value > 0 ? '+' : '') + value;
        });
    }

    togglePlayback() {
        this.isPlaying ? this.pause() : this.play();
    }

    updatePlayPauseButtons() {
        const iconClass = this.isPlaying ? 'fa-pause' : 'fa-play';
        const playBtnIds = ['mobilePlayBtn', 'mobilePlayBtnChords', 'mobilePlayBtnLyrics'];
        playBtnIds.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.innerHTML = `<i class="fas ${iconClass}"></i>`;
            }
        });
    }

    async requestWakeLock() {
        if (!this.wakeLockSupported || this.wakeLockRequestPending) return false;

        this.wakeLockRequestPending = true;
        try {
            this.wakeLock = await navigator.wakeLock.request('screen');
            this.wakeLock.addEventListener('release', () => {
                this.wakeLock = null;
                if (this.isPlaying && typeof document !== 'undefined' && document.visibilityState === 'visible') {
                    this.requestWakeLock().catch(err => {
                        console.warn('[WakeLock] Failed to re-acquire after release:', err);
                    });
                }
            });

            if (!this.wakeLockVisibilityHandler && typeof document !== 'undefined') {
                this.wakeLockVisibilityHandler = async () => {
                    if (document.visibilityState === 'visible' && this.isPlaying) {
                        await this.requestWakeLock();
                    }
                };
                document.addEventListener('visibilitychange', this.wakeLockVisibilityHandler);
            }

            console.log('[WakeLock] Screen wake lock acquired');
            return true;
        } catch (error) {
            console.warn('[WakeLock] Failed to acquire screen wake lock:', error);
            this.wakeLock = null;
            return false;
        } finally {
            this.wakeLockRequestPending = false;
        }
    }

    releaseWakeLock() {
        if (this.wakeLockVisibilityHandler && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.wakeLockVisibilityHandler);
            this.wakeLockVisibilityHandler = null;
        }

        if (this.wakeLock) {
            const lock = this.wakeLock;
            this.wakeLock = null;
            lock.release().catch(() => {});
        }
    }

    async play() {
        if (this.isPlaying) return;

        // Ensure audio context is ready (critical for mobile)
        if (!this.audioContext) {
            console.error('[Play] AudioContext not initialized');
            return;
        }

        console.log('[Play] Starting playback, AudioContext state:', this.audioContext.state);

        // Resume audio context if suspended (required for mobile autoplay policy)
        if (this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                console.log('[Play] AudioContext resumed');
            } catch (error) {
                console.error('[Play] Failed to resume AudioContext:', error);
                return;
            }
        }

        // Check if we have stems loaded
        const stemCount = Object.keys(this.stems).length;
        if (stemCount === 0) {
            console.error('[Play] No stems loaded');
            alert('No audio loaded. Please wait for stems to load.');
            return;
        }

        console.log('[Play] Starting', stemCount, 'stems');

        // Reset precise playback tracking (needed for hybrid tempo)
        this.setPlaybackPosition(Math.max(0, Math.min(this.currentTime || 0, this.duration || Infinity)));
        this.lastAudioTime = this.audioContext.currentTime;

        Object.keys(this.stems).forEach(name => this.startStemSource(name));

        this.isPlaying = true;
        this.updatePlayPauseButtons();
        this.syncPopupControlsState();

        this.startPlaybackAnimation();

        // Initial scroll to current lyric position on playback start
        if (this.activeLyricIndex >= 0) {
            this.scrollLyricsToIndex(this.activeLyricIndex, true);
        }
        // Also scroll fullscreen popup if open
        if (this.fullscreenLyricsOpen && this.activeLyricIndex >= 0) {
            this.scrollToFullscreenLyric(this.activeLyricIndex, true);
        }

        if (this.wakeLockSupported) {
            this.requestWakeLock().catch(error => {
                console.warn('[WakeLock] Unable to keep screen awake:', error);
            });
        }
    }

    startStemSource(name) {
        const stem = this.stems[name];
        if (!stem || !stem.buffer) {
            console.warn('[StartStem] Skipping', name, '- no buffer');
            return;
        }

        if (stem.source) {
            try { stem.source.stop(); } catch(e) {}
        }

        stem.source = this.audioContext.createBufferSource();
        stem.source.buffer = stem.buffer;
        const playbackRate = this.cachedPlaybackRate || 1.0;
        stem.source.playbackRate.value = playbackRate;
        console.log('[StartStem]', name, 'playbackRate set to', playbackRate.toFixed(3));

        if (stem.soundTouchNode) {
            stem.source.connect(stem.soundTouchNode);
            console.log('[StartStem]', name, '→ SoundTouch → Gain → Pan → Master');
        } else {
            stem.source.connect(stem.gainNode);
            console.log('[StartStem]', name, '→ Gain → Pan → Master (no SoundTouch)');
        }

        this.updateStemGain(name);
        const startOffset = Math.min(this.currentTime, stem.buffer.duration);
        stem.source.start(0, startOffset);
        console.log('[StartStem]', name, 'started at offset', startOffset.toFixed(2) + 's');
    }

    pause() {
        if (!this.isPlaying) return;

        this.updatePlaybackClock();

        Object.values(this.stems).forEach(s => {
            if (s.source) {
                try { s.source.stop(); } catch(e) {}
                s.source = null;
            }
        });

        this.isPlaying = false;
        this.updatePlayPauseButtons();
        this.syncPopupControlsState();

        this.stopPlaybackAnimation();
        this.releaseWakeLock();

        // Save state when pausing
        this.saveState();
    }

    stop() {
        this.pause();
        this.seek(0);
        // Save state when stopping
        this.saveState();
    }

    seek(time) {
        const newTime = Math.max(0, Math.min(time, this.duration));
        const wasPlaying = this.isPlaying;

        if (this.isPlaying) this.pause();
        this.setPlaybackPosition(newTime);
        this.updateTimeDisplay();
        this.updateProgressBar();
        if (wasPlaying) this.play();

        // Save state after seeking
        this.saveState();
    }

    handleSeekTouch(e) {
        e.preventDefault();
        if (this.duration <= 0) return;

        const touch = e.touches[0];
        const bar = document.getElementById('mobileSeekBar');
        const rect = bar.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        this.seek(percent * this.duration);
    }

    handleSeekClick(e) {
        e.preventDefault();
        if (this.duration <= 0) return;

        const bar = document.getElementById('mobileSeekBar');
        const rect = bar.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        this.seek(percent * this.duration);
    }

    startPlaybackAnimation() {
        this.stopPlaybackAnimation();
        this.lastStateSave = Date.now();  // Track last save time

        const animate = () => {
            if (this.isPlaying) {
                this.updatePlaybackClock();
                if (this.currentTime >= this.duration) {
                    this.stop();
                    return;
                }
                this.updateTimeDisplay();
                this.updateProgressBar();
                this.syncChordPlayhead();
                this.updateActiveLyric();

                // Save state every 5 seconds during playback
                const now = Date.now();
                if (now - this.lastStateSave > 5000) {
                    this.saveState();
                    this.lastStateSave = now;
                }

                this.animationFrameId = requestAnimationFrame(animate);
            }
        };
        this.animationFrameId = requestAnimationFrame(animate);
    }

    updatePlaybackClock() {
        if (!this.audioContext) return this.currentTime;

        const now = this.audioContext.currentTime;
        if (this.lastAudioTime === null) {
            this.lastAudioTime = now;
        }

        if (this.isPlaying) {
            const delta = now - this.lastAudioTime;
            const ratio = this.cachedSyncRatio || (this.currentBPM / this.originalBPM) || 1.0;
            this.playbackPosition += delta * ratio;
            if (this.playbackPosition < 0) this.playbackPosition = 0;

            const maxDuration = (typeof this.duration === 'number' && this.duration > 0) ? this.duration : null;
            if (maxDuration !== null) {
                this.playbackPosition = Math.min(this.playbackPosition, maxDuration);
            }

            this.currentTime = this.playbackPosition;
        }

        this.lastAudioTime = now;
        return this.currentTime;
    }

    setPlaybackPosition(position) {
        const maxDuration = (typeof this.duration === 'number' && this.duration > 0) ? this.duration : null;
        const clamped = maxDuration !== null ? Math.min(position, maxDuration) : position;
        this.playbackPosition = Math.max(0, clamped);
        this.currentTime = this.playbackPosition;
        this.lastAudioTime = this.audioContext ? this.audioContext.currentTime : null;
    }

    stopPlaybackAnimation() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    async ensureMasterAudioBuffer(data) {
        const sourcePath = data?.audio_path || data?.file_path;
        if (!sourcePath) {
            this.masterAudioBuffer = null;
            this.masterAudioSource = null;
            return;
        }
        if (this.masterAudioBuffer && this.masterAudioSource === sourcePath) {
            return;
        }
        await this.loadMasterAudio(sourcePath);
    }

    async loadMasterAudio(filePath) {
        try {
            if (this.masterAudioCache.has(filePath)) {
                console.log('[MasterAudio] Using cached buffer for', filePath);
                this.masterAudioBuffer = this.masterAudioCache.get(filePath);
                this.masterAudioSource = filePath;
                return;
            }

            console.log('[MasterAudio] Loading original audio from', filePath);
            const url = '/api/download-file?file_path=' + encodeURIComponent(filePath);
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error('HTTP ' + res.status);
            }
            const arrayBuffer = await res.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.masterAudioBuffer = audioBuffer;
            this.masterAudioSource = filePath;
            this.storeInCache(this.masterAudioCache, filePath, audioBuffer, this.masterAudioCacheLimit);
            console.log('[MasterAudio] Loaded master audio. Duration:', audioBuffer.duration);
        } catch (error) {
            console.warn('[MasterAudio] Failed to load original audio:', error);
            this.masterAudioBuffer = null;
            this.masterAudioSource = null;
        }
    }

    updateProgressBar() {
        const percent = this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;

        // Update vertical playhead
        const playhead = document.getElementById('mobilePlayhead');
        if (playhead) {
            playhead.style.left = percent + '%';
        }

        // Update seek bar progress
        const seekProgress = document.getElementById('mobileSeekProgress');
        const seekHandle = document.getElementById('mobileSeekHandle');
        if (seekProgress) seekProgress.style.width = percent + '%';
        if (seekHandle) seekHandle.style.left = percent + '%';
    }

    updateTimeDisplay() {
        // Update time displays across all three tabs
        const currIds = ['mobileCurrentTime', 'mobileCurrentTimeChords', 'mobileCurrentTimeLyrics'];
        const durIds = ['mobileDuration', 'mobileDurationChords', 'mobileDurationLyrics'];

        currIds.forEach(id => {
            const elem = document.getElementById(id);
            if (elem) elem.textContent = this.formatTime(this.currentTime);
        });

        durIds.forEach(id => {
            const elem = document.getElementById(id);
            if (elem) elem.textContent = this.formatTime(this.duration);
        });
    }

    getLyricsAdjustedTime() {
        // SoundTouch modifies playback speed without changing AudioContext.currentTime rate
        // Lyrics timestamps are from the ORIGINAL audio
        //
        // At tempo 0.8x (slower): After 12.5s of playback, we've played 10s of original content
        //   → lyricTime = 12.5 * 0.8 = 10s ✓
        //
        // At tempo 1.2x (faster): After 8.33s of playback, we've played 10s of original content
        //   → lyricTime = 8.33 * 1.2 = 10s ✓
        //
        // Formula: adjustedTime = currentTime * tempoRatio
        const tempoRatio = this.currentBPM / this.originalBPM;
        const adjustedTime = this.currentTime * tempoRatio;

        // Debug log to understand what's happening
        if (Math.floor(this.currentTime * 10) % 10 === 0) {  // Log every second
            console.log('[Lyrics Tempo] currentTime:', this.currentTime.toFixed(2),
                       'originalBPM:', this.originalBPM, 'currentBPM:', this.currentBPM,
                       'ratio:', tempoRatio.toFixed(3), 'adjustedTime:', adjustedTime.toFixed(2));
        }

        return adjustedTime;
    }

    setTempo(ratio) {
        // Calculate actual BPM from ratio
        const newBPM = this.originalBPM * ratio;
        this.currentBPM = Math.max(50, Math.min(300, newBPM));

        // Recalculate actual ratio based on clamped BPM
        const actualRatio = this.currentBPM / this.originalBPM;

        console.log('[Tempo] Setting tempo - ratio:', ratio, 'originalBPM:', this.originalBPM, 'newBPM:', this.currentBPM, 'actualRatio:', actualRatio);

        const targets = this.calculateTempoPitchTargets();
        console.log('[Tempo] Targets → playbackRate:', targets.playbackRate.toFixed(3), 'SoundTouch tempo:', targets.soundTouchTempo.toFixed(3), 'SoundTouch pitch:', targets.soundTouchPitch.toFixed(3), 'mode:', targets.isAcceleration ? 'hybrid-accel' : 'stretch');
        this.applyTempoPitchTargets(targets);
    }

    setPitch(semitones) {
        this.currentPitchShift = Math.max(-12, Math.min(12, semitones));
        const targets = this.calculateTempoPitchTargets();
        console.log('[Pitch] Setting pitch:', semitones, 'semitones → SoundTouch pitch:', targets.soundTouchPitch.toFixed(3), 'playbackRate:', targets.playbackRate.toFixed(3));
        this.applyTempoPitchTargets(targets);
        this.updateChordLabels();
        this.updateLyricsChordTransposition();
    }

    calculateTempoPitchTargets() {
        const tempoRatio = this.currentBPM / this.originalBPM;
        const pitchRatio = Math.pow(2, this.currentPitchShift / 12);
        const isAcceleration = tempoRatio > 1.0 + 0.001;
        const playbackRate = isAcceleration ? tempoRatio : 1.0;
        const soundTouchTempo = isAcceleration ? 1.0 : tempoRatio;
        let soundTouchPitch = pitchRatio / playbackRate;
        soundTouchPitch = Math.max(0.25, Math.min(4.0, soundTouchPitch));

        return {
            tempoRatio,
            pitchRatio,
            isAcceleration,
            playbackRate,
            soundTouchTempo,
            soundTouchPitch,
            syncRatio: isAcceleration ? playbackRate : soundTouchTempo
        };
    }

    applyTempoPitchTargets(targets) {
        this.cachedPlaybackRate = targets.playbackRate;
        this.cachedSyncRatio = targets.syncRatio;
        this.cachedTempoRatio = targets.soundTouchTempo;
        this.cachedPitchRatio = targets.soundTouchPitch;
        this.playbackPosition = this.currentTime;
        this.lastAudioTime = this.audioContext ? this.audioContext.currentTime : null;

        Object.values(this.stems).forEach(stem => {
            if (stem.source && stem.source.playbackRate) {
                try {
                    const audioTime = this.audioContext ? this.audioContext.currentTime : 0;
                    stem.source.playbackRate.setValueAtTime(targets.playbackRate, audioTime);
                } catch (error) {
                    console.warn('[Tempo] Failed to update playbackRate for', stem.name, error);
                }
            }

            if (stem.soundTouchNode) {
                const tempoParam = stem.soundTouchNode.parameters.get('tempo');
                const pitchParam = stem.soundTouchNode.parameters.get('pitch');
                const rateParam = stem.soundTouchNode.parameters.get('rate');

                if (tempoParam) tempoParam.value = targets.soundTouchTempo;
                if (pitchParam) pitchParam.value = targets.soundTouchPitch;
                if (rateParam) rateParam.value = 1.0;
            }
        });
    }

    setVolume(name, vol) {
        const s = this.stems[name];
        if (!s) return;
        s.volume = Math.max(0, Math.min(1, vol));
        this.updateStemGain(name);
    }

    setPan(name, pan) {
        const s = this.stems[name];
        if (!s || !s.panNode) return;
        s.pan = Math.max(-1, Math.min(1, pan));
        s.panNode.pan.value = s.pan;
    }

    toggleMute(name) {
        const s = this.stems[name];
        if (!s) return;
        s.muted = !s.muted;
        this.updateStemGain(name);
    }

    toggleSolo(name) {
        const s = this.stems[name];
        if (!s) return;
        s.solo = !s.solo;
        Object.keys(this.stems).forEach(n => this.updateStemGain(n));
    }

    updateStemGain(name) {
        const s = this.stems[name];
        if (!s || !s.gainNode) return;
        
        const hasSolo = Object.values(this.stems).some(x => x.solo);
        let gain = s.volume;
        if (s.muted || (hasSolo && !s.solo)) gain = 0;
        s.gainNode.gain.value = gain;
    }

    updateSoloButtons() {
        document.querySelectorAll('.solo-btn').forEach(btn => {
            const name = btn.dataset.track;
            const s = this.stems[name];
            if (s && s.solo) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }

    showLoading(message = 'Loading…') {
        if (!this.loadingOverlay || !this.loadingText) return;
        this.loadingText.textContent = message;
        this.loadingOverlay.style.display = 'flex';
    }

    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = 'none';
        }
    }

    displayChords() {
        const container = document.getElementById('mobileChordTimeline');
        if (!container || !this.chords.length) {
            if (container) container.innerHTML = '<p class="mobile-text-muted">No chords detected</p>';
            this.setChordDiagramMessage('No chord data available.');
            this.chordSegments = [];
            return;
        }

        if (!this.chordDiagramEl) {
            this.chordDiagramEl = document.getElementById('mobileChordDiagram');
        }
        this.setupChordInstrumentToggle();

        const bpm = this.chordBPM || this.currentBPM || this.originalBPM || 120;
        const beatsPerBar = Math.max(2, Math.min(12, this.beatsPerBar || 4));
        const beatDuration = 60 / bpm;
        const measureSeconds = beatDuration * beatsPerBar;

        this.chordPxPerBeat = 100; // Fixed width per beat for grid
        this.chordBPM = bpm;
        this.chordSegments = [];
        this.chordElements = [];
        this.beatElements = []; // All beat elements including empty ones
        this.currentChordIndex = -1;

        // Apply beatOffset to align chord timestamps with the beat grid
        const offset = this.beatOffset || 0;

        // Quantize chords to nearest STRONG beat (1 or 3) with beatOffset
        const quantizedChords = [...this.chords].map(chord => {
            const originalTime = (chord.timestamp || 0) - offset;

            // Find the measure this chord belongs to
            const measureIndex = Math.floor(Math.max(0, originalTime) / measureSeconds);
            const measureStart = measureIndex * measureSeconds;

            // Strong beats are at 0 (beat 1) and 2*beatDuration (beat 3)
            const beat1Time = measureStart;
            const beat3Time = measureStart + (2 * beatDuration);

            // Check distance to each strong beat
            const distToBeat1 = Math.abs(originalTime - beat1Time);
            const distToBeat3 = Math.abs(originalTime - beat3Time);

            // Tolerance: snap to strong beat if within 0.7 of a beat duration
            const strongBeatTolerance = beatDuration * 0.7;

            let quantizedTime;
            if (distToBeat1 <= strongBeatTolerance) {
                quantizedTime = beat1Time;
            } else if (distToBeat3 <= strongBeatTolerance) {
                quantizedTime = beat3Time;
            } else {
                // Fall back to nearest beat
                quantizedTime = Math.round(originalTime / beatDuration) * beatDuration;
            }

            return {
                ...chord,
                timestamp: Math.max(0, quantizedTime),
                originalTimestamp: chord.timestamp
            };
        }).sort((a, b) => a.timestamp - b.timestamp);

        // Build chordSegments for diagram display
        quantizedChords.forEach((chord, index) => {
            this.chordSegments.push({
                chord: chord.chord || '',
                start: chord.timestamp,
                end: quantizedChords[index + 1]?.timestamp ?? this.duration,
                sourceIndex: index
            });
        });

        // Calculate total measures needed
        const totalDuration = this.duration || 180;
        const totalMeasures = Math.ceil(totalDuration / measureSeconds);

        // Create ALL measures with beat slots
        const measures = [];
        let lastActiveChord = '';
        let chordIndex = 0;

        for (let measureNum = 0; measureNum < totalMeasures; measureNum++) {
            const measureStartTime = measureNum * measureSeconds;
            const measure = {
                number: measureNum + 1,
                startTime: measureStartTime,
                beats: []
            };

            for (let beat = 0; beat < beatsPerBar; beat++) {
                const beatTime = measureStartTime + (beat * beatDuration);

                // Find chord active at this beat
                while (chordIndex < quantizedChords.length - 1 &&
                       quantizedChords[chordIndex + 1].timestamp <= beatTime + 0.01) {
                    chordIndex++;
                }

                const activeChord = quantizedChords[chordIndex];
                const chordName = activeChord?.chord || '';

                // Check if chord changes at this beat
                if (chordName && chordName !== lastActiveChord) {
                    measure.beats.push({
                        chord: chordName,
                        timestamp: beatTime,
                        index: chordIndex,
                        sourceIndex: chordIndex,
                        empty: false
                    });
                    lastActiveChord = chordName;
                } else {
                    measure.beats.push({
                        empty: true,
                        currentChord: lastActiveChord,
                        timestamp: beatTime
                    });
                }
            }

            measures.push(measure);
        }

        // Get lyrics if available
        const lyricsArray = this.lyrics || [];

        // Render the linear grid view
        container.innerHTML = '';
        const scroll = document.createElement('div');
        scroll.className = 'chord-linear-scroll';

        const track = document.createElement('div');
        track.className = 'chord-linear-track';

        measures.forEach((measure, measureIndex) => {
            const measureEl = document.createElement('div');
            measureEl.className = 'chord-linear-measure';
            measureEl.dataset.measureNumber = measure.number;
            measureEl.dataset.startTime = measure.startTime;

            // Chord grid row
            const chordRow = document.createElement('div');
            chordRow.className = 'chord-linear-chord-row';

            measure.beats.forEach((beat, beatIndex) => {
                const beatEl = document.createElement('div');
                beatEl.className = 'chord-linear-beat';

                // Calculate beat timestamp
                const beatDuration = measureSeconds / beatsPerBar;
                const beatTimestamp = measure.startTime + (beatIndex * beatDuration);

                beatEl.dataset.beatTime = beatTimestamp;
                beatEl.dataset.measureIndex = measureIndex;
                beatEl.dataset.beatIndex = beatIndex;

                if (beat.empty) {
                    beatEl.classList.add('empty');
                    beatEl.innerHTML = '<div class="chord-linear-beat-name">—</div>';
                    // Store the current chord for empty beats
                    beatEl.dataset.currentChord = beat.currentChord || '';
                } else {
                    beatEl.dataset.index = beat.sourceIndex;
                    beatEl.dataset.timestamp = beat.timestamp;
                    beatEl.dataset.currentChord = beat.chord;
                    const transposedChord = this.transposeChord(beat.chord, this.currentPitchShift);
                    beatEl.innerHTML = `<div class="chord-linear-beat-name">${transposedChord}</div>`;

                    this.chordElements.push(beatEl);
                }

                beatEl.addEventListener('click', () => this.seek(beatTimestamp));
                this.beatElements.push(beatEl);

                chordRow.appendChild(beatEl);
            });

            measureEl.appendChild(chordRow);

            // Lyrics row
            const lyricsRow = document.createElement('div');
            lyricsRow.className = 'chord-linear-lyrics-row';

            // Find lyrics that fall in this measure
            const measureEndTime = measure.startTime + measureSeconds;
            const measureLyrics = lyricsArray.filter(lyric => {
                const lyricTime = lyric.start || 0;
                return lyricTime >= measure.startTime && lyricTime < measureEndTime;
            });

            if (measureLyrics.length > 0) {
                const lyricsText = measureLyrics.map(l => l.text || '').join(' ');
                lyricsRow.textContent = lyricsText;
            } else {
                lyricsRow.innerHTML = '&nbsp;';
            }

            measureEl.appendChild(lyricsRow);
            track.appendChild(measureEl);
        });

        // Add playhead
        this.playheadIndicator = document.createElement('div');
        this.playheadIndicator.className = 'chord-linear-playhead';
        track.appendChild(this.playheadIndicator);

        scroll.appendChild(track);
        container.appendChild(scroll);

        this.chordScrollContainer = scroll;
        this.chordTrackElement = track;

        // Block manual horizontal scroll while allowing code-controlled scrollTo()
        this.preventManualHorizontalScroll(scroll);

        this.syncChordPlayhead(true);
        const firstSegmentChord = this.chordSegments[0]?.chord || this.chords[0]?.chord || '';
        const thirdSegmentChord = this.chordSegments[2]?.chord || this.chords[2]?.chord || ''; // Anticipate 2 beats ahead
        const initialChordSymbol = this.currentChordSymbol || this.transposeChord(firstSegmentChord, this.currentPitchShift);
        const initialNextSymbol = this.transposeChord(thirdSegmentChord, this.currentPitchShift);
        this.renderChordDiagramCarousel('', initialChordSymbol, initialNextSymbol);
    }

    // Prevent manual horizontal scroll while allowing programmatic scrollTo()
    preventManualHorizontalScroll(scrollContainer) {
        if (!scrollContainer) return;

        // Block horizontal wheel scroll
        scrollContainer.addEventListener('wheel', (e) => {
            // If scrolling horizontally (shift+wheel or trackpad horizontal swipe)
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.preventDefault();
            }
        }, { passive: false });

        // Block horizontal touch scroll on mobile
        let touchStartX = 0;
        let touchStartY = 0;

        scrollContainer.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        scrollContainer.addEventListener('touchmove', (e) => {
            if (!e.touches.length) return;

            const touchX = e.touches[0].clientX;
            const touchY = e.touches[0].clientY;
            const deltaX = Math.abs(touchX - touchStartX);
            const deltaY = Math.abs(touchY - touchStartY);

            // If horizontal swipe is stronger than vertical
            if (deltaX > deltaY && deltaX > 10) {
                e.preventDefault();
            }
        }, { passive: false });
    }

    preloadChordDiagrams(maxChords = 40) {
        if (!Array.isArray(this.chords) || !this.chords.length) return;
        const seen = new Set();
        const tasks = [];
        for (const entry of this.chords) {
            if (tasks.length >= maxChords) break;
            const symbol = (entry?.chord || '').trim();
            if (!symbol || seen.has(symbol)) continue;
            const parsed = this.parseChordSymbol(symbol);
            if (!parsed) continue;
            const root = this.normalizeNoteName(parsed.root);
            const suffixCandidates = Array.isArray(parsed.suffixCandidates) && parsed.suffixCandidates.length
                ? parsed.suffixCandidates
                : [this.getSuffixForQuality(parsed.quality)];
            seen.add(symbol);
            tasks.push(
                this.loadGuitarChordPositions(root, suffixCandidates).catch(() => {})
            );
        }
        if (tasks.length) {
            Promise.allSettled(tasks).catch(() => {});
        }
    }

    isChordTimelineVisible() {
        if (!this.chordScrollContainer) return true;
        const rect = this.chordScrollContainer.getBoundingClientRect();
        const viewHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return rect.bottom > 0 && rect.top < viewHeight * 0.7;
    }

    syncChordPlayhead(force = false) {
        if (!this.beatElements || !this.beatElements.length) return;

        // Find current beat based on actual time (no tempo adjustment needed - timestamps are in original time)
        const currentTime = this.currentTime - (this.beatOffset || 0);
        const beatIdx = this.getBeatIndexForTime(currentTime);
        if (beatIdx === -1) return;

        // Highlight the beat
        if (force || beatIdx !== this.currentChordIndex) {
            this.currentChordIndex = beatIdx;
            this.highlightBeat(beatIdx);
        }

        // Scroll to keep highlighted beat in 2nd position (using actual DOM position)
        if (this.chordScrollContainer) {
            const activeBeat = this.beatElements[beatIdx];
            if (activeBeat) {
                // Get the actual position of the beat element in the DOM
                const beatLeft = activeBeat.offsetLeft;

                // Fixed position at 2nd beat (80px from left edge of viewport for mobile)
                // 0-indexed: box 0, 1 = 2nd box - better for anticipating chord changes on mobile
                const fixedPlayheadPos = 1 * 80;

                // Scroll so the active beat appears at the fixed position
                const targetScroll = Math.max(0, beatLeft - fixedPlayheadPos);

                this.chordScrollContainer.scrollTo({
                    left: targetScroll,
                    behavior: 'auto'
                });
            }
        }

        // Sync Grid View if open
        this.syncGridView2();
    }

    getBeatIndexForTime(time) {
        if (!this.beatElements || !this.beatElements.length) return -1;

        // Find which beat element contains this time
        for (let i = 0; i < this.beatElements.length; i++) {
            const beatEl = this.beatElements[i];
            const beatTime = parseFloat(beatEl.dataset.beatTime);
            const nextBeatTime = i < this.beatElements.length - 1
                ? parseFloat(this.beatElements[i + 1].dataset.beatTime)
                : this.duration;

            if (time >= beatTime && time < nextBeatTime) {
                return i;
            }
        }

        // Return last beat if time is beyond all beats
        return this.beatElements.length - 1;
    }

    getChordIndexForTime(time) {
        const segments = this.chordSegments.length ? this.chordSegments : null;
        if (!segments || !segments.length) return -1;
        const offsetTime = time - (this.beatOffset || 0);
        for (let i = segments.length - 1; i >= 0; i--) {
            const start = segments[i].start || 0;
            const end = segments[i].end ?? this.duration;
            if (offsetTime >= start && offsetTime < end) return i;
        }
        return segments.length - 1;
    }

    highlightBeat(beatIndex) {
        if (!this.beatElements || !this.beatElements.length) return;

        const active = this.beatElements[beatIndex];
        if (!active) return;

        // Remove active class from all beats
        this.beatElements.forEach(el => el.classList.remove('active'));
        active.classList.add('active');

        // Highlight parent measure
        const measures = this.chordTrackElement?.querySelectorAll('.chord-linear-measure');
        if (measures) {
            measures.forEach(m => m.classList.remove('active'));
            const parentMeasure = active.closest('.chord-linear-measure');
            if (parentMeasure) parentMeasure.classList.add('active');
        }

        // Get current, previous and next chord names for the carousel
        const currentChordName = active.dataset.currentChord || '';
        const prevBeat = this.beatElements[beatIndex - 1];
        const nextBeat = this.beatElements[beatIndex + 2]; // Anticipate 2 beats ahead

        const prevChordName = prevBeat ? (prevBeat.dataset.currentChord || '') : '';
        const nextChordName = nextBeat ? (nextBeat.dataset.currentChord || '') : '';

        // Transpose all chords
        const transposedCurrent = this.transposeChord(currentChordName, this.currentPitchShift);
        const transposedPrev = this.transposeChord(prevChordName, this.currentPitchShift);
        const transposedNext = this.transposeChord(nextChordName, this.currentPitchShift);

        this.currentChordSymbol = transposedCurrent;
        this.prevChordSymbol = transposedPrev;
        this.nextChordSymbol = transposedNext;

        // Render the carousel with all three diagrams
        this.renderChordDiagramCarousel(transposedPrev, transposedCurrent, transposedNext);
    }

    highlightChord(index) {
        if (!this.chordElements || !this.chordElements.length) return;

        // Don't highlight if this is an empty slot
        const active = this.chordElements[index];
        if (!active || active.classList.contains('empty')) return;

        this.chordElements.forEach(el => el.classList.remove('active'));
        active.classList.add('active');

        // Highlight parent measure
        const measures = this.chordTrackElement?.querySelectorAll('.chord-linear-measure');
        if (measures) {
            measures.forEach(m => m.classList.remove('active'));
            const parentMeasure = active.closest('.chord-linear-measure');
            if (parentMeasure) parentMeasure.classList.add('active');
        }

        // Get current, previous and next chords
        const chordSource = this.chordSegments[index] || this.chords[index] || null;
        const prevSource = this.chordSegments[index - 1] || this.chords[index - 1] || null;
        const nextSource = this.chordSegments[index + 2] || this.chords[index + 2] || null; // Anticipate 2 ahead

        const currentChordName = this.transposeChord(chordSource?.chord || '', this.currentPitchShift);
        const prevChordName = this.transposeChord(prevSource?.chord || '', this.currentPitchShift);
        const nextChordName = this.transposeChord(nextSource?.chord || '', this.currentPitchShift);

        this.currentChordSymbol = currentChordName;
        this.prevChordSymbol = prevChordName;
        this.nextChordSymbol = nextChordName;

        this.renderChordDiagramCarousel(prevChordName, currentChordName, nextChordName);
    }

    updateChordLabels() {
        this.setupChordInstrumentToggle();
        if (!this.chordElements || !this.chordElements.length) {
            const firstChord = this.chordSegments[0]?.chord || this.chords[0]?.chord;
            const thirdChord = this.chordSegments[2]?.chord || this.chords[2]?.chord; // Anticipate 2 ahead
            if (firstChord) {
                const chordName = this.transposeChord(firstChord, this.currentPitchShift);
                const nextChordName = thirdChord ? this.transposeChord(thirdChord, this.currentPitchShift) : '';
                this.currentChordSymbol = chordName;
                this.nextChordSymbol = nextChordName;
                this.prevChordSymbol = '';
                this.renderChordDiagramCarousel('', chordName, nextChordName);
            } else {
                this.setChordDiagramMessage(DEFAULT_CHORD_MESSAGE);
            }
            return;
        }
        if (!this.chordElements) return;
        this.chordElements.forEach((el, idx) => {
            const chord = this.chordSegments[idx]?.chord || el.dataset.chord || el.dataset.currentChord || '';
            const name = el.querySelector('.chord-linear-beat-name');
            if (name) name.textContent = this.transposeChord(chord, this.currentPitchShift);
        });
        if (typeof this.currentChordIndex === 'number' && this.currentChordIndex >= 0) {
            const idx = this.currentChordIndex;
            const chordData = this.chordSegments[idx] || this.chords[idx];
            const prevData = this.chordSegments[idx - 1] || this.chords[idx - 1];
            const nextData = this.chordSegments[idx + 2] || this.chords[idx + 2]; // Anticipate 2 ahead

            const currentChordName = this.transposeChord(chordData?.chord || '', this.currentPitchShift);
            const prevChordName = this.transposeChord(prevData?.chord || '', this.currentPitchShift);
            const nextChordName = this.transposeChord(nextData?.chord || '', this.currentPitchShift);

            this.currentChordSymbol = currentChordName;
            this.prevChordSymbol = prevChordName;
            this.nextChordSymbol = nextChordName;

            this.renderChordDiagramCarousel(prevChordName, currentChordName, nextChordName);
        }
    }

    transposeChord(chord, semitones) {
        if (!chord || !semitones) return chord || '';

        const rootMatch = chord.match(/^([A-G][#b]?)/);
        if (!rootMatch) return chord;

        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const root = rootMatch[1];
        const quality = chord.substring(root.length);

        const normalized = root
            .replace('Db', 'C#')
            .replace('Eb', 'D#')
            .replace('Gb', 'F#')
            .replace('Ab', 'G#')
            .replace('Bb', 'A#');

        const idx = noteNames.indexOf(normalized);
        if (idx === -1) return chord;

        let nextIdx = (idx + semitones) % 12;
        if (nextIdx < 0) nextIdx += 12;

        return noteNames[nextIdx] + quality;
    }

    setupChordInstrumentToggle() {
        if (!this.chordDiagramEl) {
            this.chordDiagramEl = document.getElementById('mobileChordDiagram');
        }
        if (this.chordInstrumentButtons.length === 0) {
            const buttons = document.querySelectorAll('[data-chord-instrument]');
            if (!buttons.length) return;
            this.chordInstrumentButtons = Array.from(buttons);
            this.chordInstrumentButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const mode = btn.dataset.chordInstrument;
                    if (!mode || mode === this.chordDiagramMode) return;
                    this.chordDiagramMode = mode;
                    this.chordInstrumentButtons.forEach(b => b.classList.toggle('active', b.dataset.chordInstrument === this.chordDiagramMode));
                    // Refresh the carousel with current chords
                    if (this.currentChordSymbol) {
                        this.renderChordDiagramCarousel(this.prevChordSymbol || '', this.currentChordSymbol, this.nextChordSymbol || '');
                    }
                });
            });
        }
        this.chordInstrumentButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.chordInstrument === this.chordDiagramMode));
    }

    setChordDiagramMessage(message) {
        if (!this.chordDiagramEl) {
            this.chordDiagramEl = document.getElementById('mobileChordDiagram');
        }
        if (!this.chordDiagramEl) return;
        this.currentChordSymbol = null;
        this.chordDiagramEl.innerHTML = `<p class="mobile-text-muted">${message}</p>`;
        this.setupChordInstrumentToggle();
    }

    renderChordDiagram(chordName) {
        this.setupChordInstrumentToggle();
        if (!this.chordDiagramEl) {
            this.chordDiagramEl = document.getElementById('mobileChordDiagram');
        }
        if (!this.chordDiagramEl) return;
        if (!chordName) {
            this.setChordDiagramMessage(DEFAULT_CHORD_MESSAGE);
            return;
        }
        this.currentChordSymbol = chordName;
        const parsed = this.parseChordSymbol(chordName);
        if (!parsed) {
            this.setChordDiagramMessage('Diagram unavailable for this chord.');
            return;
        }
        if (this.chordDiagramMode === 'piano') {
            this.renderPianoDiagram(parsed, chordName);
        } else {
            this.renderGuitarDiagram(parsed, chordName);
        }
    }

    renderChordDiagramCarousel(prevChordName, currentChordName, nextChordName) {
        this.setupChordInstrumentToggle();

        // Initialize diagram elements if not already done
        if (!this.chordDiagramEl) {
            this.chordDiagramEl = document.getElementById('mobileChordDiagram');
        }
        if (!this.chordDiagramPrevEl) {
            this.chordDiagramPrevEl = document.getElementById('mobileChordDiagramPrev');
        }
        if (!this.chordDiagramNextEl) {
            this.chordDiagramNextEl = document.getElementById('mobileChordDiagramNext');
        }

        // Render current chord (center, large)
        if (currentChordName) {
            const parsed = this.parseChordSymbol(currentChordName);
            if (parsed) {
                this.currentChordSymbol = currentChordName;
                if (this.chordDiagramMode === 'piano') {
                    this.renderPianoDiagramInElement(parsed, currentChordName, this.chordDiagramEl);
                } else {
                    this.renderGuitarDiagramInElement(parsed, currentChordName, this.chordDiagramEl);
                }
            } else if (this.chordDiagramEl) {
                this.chordDiagramEl.innerHTML = '<p class="mobile-text-muted">—</p>';
            }
        } else if (this.chordDiagramEl) {
            this.chordDiagramEl.innerHTML = '<p class="mobile-text-muted">—</p>';
        }

        // Render previous chord (left, small)
        if (prevChordName && this.chordDiagramPrevEl) {
            const parsed = this.parseChordSymbol(prevChordName);
            if (parsed) {
                this.prevChordSymbol = prevChordName;
                if (this.chordDiagramMode === 'piano') {
                    this.renderPianoDiagramInElement(parsed, prevChordName, this.chordDiagramPrevEl);
                } else {
                    this.renderGuitarDiagramInElement(parsed, prevChordName, this.chordDiagramPrevEl);
                }
            } else {
                this.chordDiagramPrevEl.innerHTML = '<p class="mobile-text-muted">—</p>';
            }
        } else if (this.chordDiagramPrevEl) {
            this.chordDiagramPrevEl.innerHTML = '<p class="mobile-text-muted">—</p>';
        }

        // Render next chord (right, small)
        if (nextChordName && this.chordDiagramNextEl) {
            const parsed = this.parseChordSymbol(nextChordName);
            if (parsed) {
                this.nextChordSymbol = nextChordName;
                if (this.chordDiagramMode === 'piano') {
                    this.renderPianoDiagramInElement(parsed, nextChordName, this.chordDiagramNextEl);
                } else {
                    this.renderGuitarDiagramInElement(parsed, nextChordName, this.chordDiagramNextEl);
                }
            } else {
                this.chordDiagramNextEl.innerHTML = '<p class="mobile-text-muted">—</p>';
            }
        } else if (this.chordDiagramNextEl) {
            this.chordDiagramNextEl.innerHTML = '<p class="mobile-text-muted">—</p>';
        }
    }

    parseChordSymbol(chord) {
        if (!chord) return null;
        const match = chord.match(/^([A-G][#b]?)(.*)$/);
        if (!match) return null;
        const rawRoot = match[1];
        const normalizedRoot = this.normalizeNoteName(rawRoot);
        const remainder = this.sanitizeChordSuffix(match[2] || '');
        const { baseSuffix, bassNote } = this.extractSuffixParts(remainder);
        const quality = this.getQualityFromSuffix(baseSuffix);
        const qualitySuffix = this.getSuffixForQuality(quality);
        const suffixCandidates = this.buildSuffixCandidates(baseSuffix, bassNote, qualitySuffix);
        return {
            root: normalizedRoot,
            quality,
            suffixCandidates,
            baseSuffix,
            bassNote
        };
    }

    sanitizeChordSuffix(value) {
        if (!value) return '';
        let result = value
            .replace(/♭/g, 'b')
            .replace(/♯/g, '#')
            .replace(/–|−/g, '-')
            .replace(/Δ/g, 'maj')
            .replace(/Ø/g, 'm7b5')
            .replace(/ø/g, 'm7b5')
            .replace(/°/g, 'dim')
            .replace(/^\+/, 'aug')
            .replace(/\s+/g, '')
            .replace(/[()]/g, '');

        if (/^M(?=[0-9A-Za-z#b+\-])/.test(result)) {
            result = 'maj' + result.slice(1);
        }
        if (/^Maj/.test(result)) {
            result = 'maj' + result.slice(3);
        }
        result = result.toLowerCase();

        if (/^mi(?=[a-z0-9#b+\-])/.test(result)) {
            result = 'm' + result.slice(2);
        }
        if (/^min(?=[a-z0-9#b+\-])/.test(result)) {
            result = 'm' + result.slice(3);
        }

        return result;
    }

    extractSuffixParts(suffix) {
        if (!suffix) {
            return { baseSuffix: 'major', bassNote: '' };
        }
        const [base, bass] = suffix.split('/');
        return {
            baseSuffix: this.normalizeSuffixBase(base),
            bassNote: this.normalizeBassNote(bass)
        };
    }

    normalizeSuffixBase(token) {
        if (!token) return 'major';
        const lowered = token.toLowerCase();
        if (!lowered || lowered === 'maj') return 'major';
        if (['m', 'min', 'minor', '-'].includes(lowered)) return 'minor';
        if (lowered === 'sus') return 'sus4';
        if (lowered === 'dom7') return '7';
        if (lowered === 'dom9') return '9';
        if (lowered === 'dom11') return '11';
        if (lowered === 'dom13') return '13';
        return lowered;
    }

    normalizeBassNote(note) {
        if (!note) return '';
        const cleaned = note.replace(/[^A-G#b]/gi, '');
        if (!cleaned) return '';
        const normalized = this.normalizeNoteName(cleaned);
        return normalized ? normalized.toLowerCase() : '';
    }

    buildSuffixCandidates(baseSuffix, bassNote, fallbackSuffix) {
        const candidates = [];
        const pushCandidate = (suffix, includeBass = true) => {
            if (!suffix) return;
            const normalized = suffix.toLowerCase();
            if (includeBass && bassNote) {
                const withBass = `${normalized}_${bassNote}`;
                if (!candidates.includes(withBass)) candidates.push(withBass);
            }
            if (!candidates.includes(normalized)) candidates.push(normalized);
        };

        if (baseSuffix) pushCandidate(baseSuffix, true);
        if (fallbackSuffix) pushCandidate(fallbackSuffix, true);
        if (baseSuffix) pushCandidate(baseSuffix, false);
        if (fallbackSuffix && fallbackSuffix !== baseSuffix) pushCandidate(fallbackSuffix, false);

        if (baseSuffix !== 'major') pushCandidate('major', false);
        if (baseSuffix !== 'minor' && fallbackSuffix !== 'minor') {
            pushCandidate('minor', false);
        }

        return candidates.filter(Boolean);
    }

    getQualityFromSuffix(suffix) {
        const target = (suffix || '').toLowerCase();
        for (const pattern of CHORD_QUALITY_MAP) {
            if (pattern.match.test(target)) {
                return pattern.key;
            }
        }
        if (!target || target === 'major') return 'major';
        if (target === 'minor') return 'minor';
        return target || 'major';
    }

    getSuffixForQuality(quality) {
        if (!quality) return 'major';
        return QUALITY_TO_SUFFIX[quality] || quality || 'major';
    }

    shouldPreferBarreVoicing(chord, label) {
        if (!chord) return false;
        const root = chord.root || '';
        const normalizedLabel = (label || '').trim();
        const openChordList = [
            'A', 'C', 'D', 'E', 'G',
            'Am', 'Dm', 'Em',
            'A7', 'B7', 'C7', 'D7', 'E7', 'G7',
            'Amaj7', 'Cmaj7', 'Dmaj7', 'Emaj7', 'Gmaj7',
            'Am7', 'Dm7', 'Em7',
            'E9', 'G9',
            'Aadd9', 'Cadd9', 'Dadd9', 'Eadd9', 'Gadd9',
            'Asus2', 'Dsus2', 'Esus2', 'Gsus2',
            'Asus4', 'Csus4', 'Dsus4', 'Esus4', 'Gsus4',
            'A6', 'C6', 'D6', 'E6', 'G6',
            'Adim', 'Ddim', 'Edim',
            'Eaug', 'Caug'
        ];
        const forcedBarreRoots = ['F', 'F#', 'G#', 'A#', 'Bb', 'B', 'C#', 'D#', 'Eb', 'Ab'];

        if (openChordList.includes(normalizedLabel)) {
            return false;
        }

        const normalizedRoot = this.normalizeNoteName(root);
        if (forcedBarreRoots.includes(normalizedRoot)) {
            return true;
        }

        if (/#|b/.test(root)) return true;
        const suffix = chord.baseSuffix || '';
        return /(add9|9|11|13|dim|aug|m7b5|sus2sus4)/.test(suffix);
    }

    normalizeNoteName(note) {
        if (!note) return '';
        const replaced = note.replace('♭', 'b');
        const normalized = replaced.length > 1
            ? replaced[0].toUpperCase() + replaced.slice(1)
            : replaced.toUpperCase();
        return FLAT_TO_SHARP[normalized] || normalized;
    }

    getNoteIndex(note) {
        return NOTE_NAMES.indexOf(note);
    }

    getGuitarDiagramBuilder() {
        if (!this.guitarDiagramBuilder) {
            this.guitarDiagramBuilder = new GuitarDiagramBuilder();
        }
        return this.guitarDiagramBuilder;
    }

    hasCachedGuitarDiagram(root, suffixCandidates = []) {
        if (!root || !this.guitarDiagramCache) return false;
        const candidates = Array.isArray(suffixCandidates) && suffixCandidates.length
            ? suffixCandidates
            : ['major'];
        for (const suffix of candidates) {
            if (!suffix) continue;
            const key = `${root}_${suffix.toLowerCase()}`;
            if (this.guitarDiagramCache.has(key)) return true;
        }
        return false;
    }

    async loadGuitarChordPositions(root, suffixCandidates = []) {
        if (!root) return { positions: [], suffix: null };
        const candidates = Array.isArray(suffixCandidates) && suffixCandidates.length
            ? suffixCandidates
            : ['major'];
        const tried = new Set();

        for (const suffix of candidates) {
            if (!suffix) continue;
            const normalized = suffix.toLowerCase();
            if (tried.has(normalized)) continue;
            tried.add(normalized);
            const cacheKey = `${root}_${normalized}`;
            if (this.guitarDiagramCache.has(cacheKey)) {
                const cached = this.guitarDiagramCache.get(cacheKey);
                if (cached.length) return { positions: cached, suffix: normalized };
                continue;
            }

            const positions = await this.fetchGuitarChordPositions(root, normalized);
            if (positions.length) {
                this.storeInCache(this.guitarDiagramCache, cacheKey, positions, this.guitarDiagramCacheLimit);
                return { positions, suffix: normalized };
            }
        }

        return { positions: [], suffix: null };
    }

    async fetchGuitarChordPositions(root, suffix) {
        const encodedRoot = encodeURIComponent(root);
        const encodedSuffix = encodeURIComponent(suffix);
        const path = `/static/js/datas/guitar-chords-db-json/${encodedRoot}/${encodedSuffix}.json`;
        try {
            const res = await fetch(path);
            if (!res.ok) {
                if (res.status === 404) {
                    return [];
                }
                throw new Error(`Failed to load chord diagram (${res.status})`);
            }
            const json = await res.json();
            return Array.isArray(json?.positions) ? json.positions : [];
        } catch (err) {
            console.warn('[ChordDiagram] Load failed:', err);
            return [];
        }
    }

    renderGuitarDiagram(chord, label) {
        if (!this.chordDiagramEl) {
            this.chordDiagramEl = document.getElementById('mobileChordDiagram');
        }
        if (!this.chordDiagramEl) return;

        const root = this.normalizeNoteName(chord.root);
        const suffixCandidates = Array.isArray(chord.suffixCandidates) && chord.suffixCandidates.length
            ? chord.suffixCandidates
            : [this.getSuffixForQuality(chord.quality)];
        const preferBarre = this.shouldPreferBarreVoicing(chord, label);
        if (!this.hasCachedGuitarDiagram(root, suffixCandidates)) {
            this.chordDiagramEl.innerHTML = '<p class="mobile-text-muted">Loading chord diagram…</p>';
        }

        this.loadGuitarChordPositions(root, suffixCandidates)
            .then(({ positions }) => {
                if (!positions.length) {
                    this.setChordDiagramMessage('Diagram unavailable for this chord.');
                    return;
                }

                const selection = this.pickGuitarPosition(positions, { preferBarre, label });
                if (!selection) {
                    this.setChordDiagramMessage('Diagram unavailable for this chord.');
                    return;
                }

                const { position, frets, minFret, maxFret } = selection;
                if (!frets || frets.length !== 6) {
                    this.setChordDiagramMessage('Diagram unavailable for this chord.');
                    return;
                }

                const { baseFret, rows } = this.determineFretWindow(frets, position, minFret, maxFret);
                const fingers = this.parseFingerString(position.fingers);

                const relativeFrets = frets.map(fret => {
                    if (fret <= 0) return fret;
                    return Math.max(1, fret - baseFret + 1);
                });

                const builder = this.getGuitarDiagramBuilder();
                const svg = builder.build({
                    frets: relativeFrets,
                    fingers,
                    baseFret
                }, { rows });

                const wrapper = document.createElement('div');
                wrapper.className = 'guitar-diagram';

                const labelEl = document.createElement('div');
                labelEl.className = 'mobile-chord-diagram-label';
                labelEl.textContent = label;
                wrapper.appendChild(labelEl);

                const svgContainer = document.createElement('div');
                svgContainer.className = 'guitar-svg-wrapper';
                svgContainer.appendChild(svg);
                wrapper.appendChild(svgContainer);

                const fretLabelEl = document.createElement('div');
                fretLabelEl.className = 'guitar-fret-label';
                fretLabelEl.textContent = baseFret > 1 ? `Fret ${baseFret}` : 'Open position';
                wrapper.appendChild(fretLabelEl);

                this.chordDiagramEl.innerHTML = '';
                this.chordDiagramEl.appendChild(wrapper);
            })
            .catch(err => {
                console.warn('[ChordDiagram] Guitar render failed:', err);
                this.setChordDiagramMessage('Diagram unavailable for this chord.');
            });
    }

    renderPianoDiagram(chord, label) {
        const rootIndex = this.getNoteIndex(chord.root);
        if (rootIndex === -1) {
            this.setChordDiagramMessage('Diagram unavailable for this chord.');
            return;
        }
        const intervals = PIANO_INTERVALS[chord.quality] || PIANO_INTERVALS.major;
        const notes = intervals.map(offset => (rootIndex + offset) % 12);

        const whiteKeysHTML = WHITE_KEYS.map(note => {
            const noteIndex = NOTE_NAMES.indexOf(note);
            const active = notes.includes(noteIndex);
            return `<div class="piano-white-key${active ? ' active' : ''}"><span>${note}</span></div>`;
        }).join('');

        const whiteWidth = 100 / WHITE_KEYS.length;
        const blackKeysHTML = BLACK_KEYS.map(entry => {
            const noteIndex = NOTE_NAMES.indexOf(entry.note);
            if (noteIndex === -1) return '';
            const active = notes.includes(noteIndex);
            const left = ((entry.anchor + 1) * whiteWidth) - (whiteWidth * 0.35);
            return `<div class="piano-black-key${active ? ' active' : ''}" style="left:${left}%"></div>`;
        }).join('');

        this.chordDiagramEl.innerHTML = `
            <div class="mobile-chord-diagram-label">${label}</div>
            <div class="piano-diagram">
                <div class="piano-wrapper">
                    <div class="piano-white-keys">${whiteKeysHTML}</div>
                    <div class="piano-black-keys">${blackKeysHTML}</div>
                </div>
            </div>
        `;
    }

    renderGuitarDiagramInElement(chord, label, targetElement) {
        if (!targetElement) return;

        const root = this.normalizeNoteName(chord.root);
        const suffixCandidates = Array.isArray(chord.suffixCandidates) && chord.suffixCandidates.length
            ? chord.suffixCandidates
            : [this.getSuffixForQuality(chord.quality)];
        const preferBarre = this.shouldPreferBarreVoicing(chord, label);

        if (!this.hasCachedGuitarDiagram(root, suffixCandidates)) {
            targetElement.innerHTML = '<p class="mobile-text-muted">Loading…</p>';
        }

        this.loadGuitarChordPositions(root, suffixCandidates)
            .then(({ positions }) => {
                if (!positions.length) {
                    targetElement.innerHTML = '<p class="mobile-text-muted">—</p>';
                    return;
                }

                const selection = this.pickGuitarPosition(positions, { preferBarre, label });
                if (!selection) {
                    targetElement.innerHTML = '<p class="mobile-text-muted">—</p>';
                    return;
                }

                const { position, frets, minFret, maxFret } = selection;
                if (!frets || frets.length !== 6) {
                    targetElement.innerHTML = '<p class="mobile-text-muted">—</p>';
                    return;
                }

                const { baseFret, rows } = this.determineFretWindow(frets, position, minFret, maxFret);
                const fingers = this.parseFingerString(position.fingers);

                const relativeFrets = frets.map(fret => {
                    if (fret <= 0) return fret;
                    return Math.max(1, fret - baseFret + 1);
                });

                const builder = this.getGuitarDiagramBuilder();
                const svg = builder.build({
                    frets: relativeFrets,
                    fingers,
                    baseFret
                }, { rows });

                const wrapper = document.createElement('div');
                wrapper.className = 'guitar-diagram';

                const labelEl = document.createElement('div');
                labelEl.className = 'mobile-chord-diagram-label';
                labelEl.textContent = label;
                wrapper.appendChild(labelEl);

                const svgContainer = document.createElement('div');
                svgContainer.className = 'guitar-svg-wrapper';
                svgContainer.appendChild(svg);
                wrapper.appendChild(svgContainer);

                const fretLabelEl = document.createElement('div');
                fretLabelEl.className = 'guitar-fret-label';
                fretLabelEl.textContent = baseFret > 1 ? `Fret ${baseFret}` : 'Open position';
                wrapper.appendChild(fretLabelEl);

                targetElement.innerHTML = '';
                targetElement.appendChild(wrapper);
            })
            .catch(err => {
                console.warn('[ChordDiagram] Guitar render failed:', err);
                targetElement.innerHTML = '<p class="mobile-text-muted">—</p>';
            });
    }

    renderPianoDiagramInElement(chord, label, targetElement) {
        if (!targetElement) return;

        const rootIndex = this.getNoteIndex(chord.root);
        if (rootIndex === -1) {
            targetElement.innerHTML = '<p class="mobile-text-muted">—</p>';
            return;
        }
        const intervals = PIANO_INTERVALS[chord.quality] || PIANO_INTERVALS.major;
        const notes = intervals.map(offset => (rootIndex + offset) % 12);

        const whiteKeysHTML = WHITE_KEYS.map(note => {
            const noteIndex = NOTE_NAMES.indexOf(note);
            const active = notes.includes(noteIndex);
            return `<div class="piano-white-key${active ? ' active' : ''}"><span>${note}</span></div>`;
        }).join('');

        const whiteWidth = 100 / WHITE_KEYS.length;
        const blackKeysHTML = BLACK_KEYS.map(entry => {
            const noteIndex = NOTE_NAMES.indexOf(entry.note);
            if (noteIndex === -1) return '';
            const active = notes.includes(noteIndex);
            const left = ((entry.anchor + 1) * whiteWidth) - (whiteWidth * 0.35);
            return `<div class="piano-black-key${active ? ' active' : ''}" style="left:${left}%"></div>`;
        }).join('');

        targetElement.innerHTML = `
            <div class="mobile-chord-diagram-label">${label}</div>
            <div class="piano-diagram">
                <div class="piano-wrapper">
                    <div class="piano-white-keys">${whiteKeysHTML}</div>
                    <div class="piano-black-keys">${blackKeysHTML}</div>
                </div>
            </div>
        `;
    }

    storeInCache(map, key, value, limit = 10) {
        if (!map) return;
        if (map.has(key)) map.delete(key);
        map.set(key, value);
        while (map.size > limit) {
            const oldest = map.keys().next().value;
            map.delete(oldest);
        }
    }

    setChordCache(key, chords) {
        if (!key || !Array.isArray(chords)) return;
        this.storeInCache(this.chordDataCache, key, this.cloneChordArray(chords), this.chordDataCacheLimit);
    }

    cloneChordArray(arr) {
        return Array.isArray(arr) ? arr.map(ch => ({ ...ch })) : [];
    }

    parseFrets(fretsString) {
        if (!fretsString) return null;
        const result = [];
        for (let i = 0; i < fretsString.length && result.length < 6; i++) {
            const char = fretsString[i];
            if (char === 'x' || char === 'X') {
                result.push(-1);
            } else if (/[0-9]/.test(char)) {
                result.push(parseInt(char, 10));
            } else if (/[a-z]/i.test(char)) {
                result.push(this.fretLetterToNumber(char));
            }
        }
        while (result.length < 6) result.push(0);
        return result;
    }

    fretLetterToNumber(char) {
        if (!char) return 0;
        const lower = char.toLowerCase();
        const code = lower.charCodeAt(0);
        if (code < 97 || code > 122) return 0;
        return 10 + (code - 97);
    }

    parseFingerString(fingerString) {
        if (!fingerString) return Array(6).fill(0);
        const result = [];
        for (let i = 0; i < fingerString.length && result.length < 6; i++) {
            const char = fingerString[i];
            result.push(/[0-9]/.test(char) ? parseInt(char, 10) : 0);
        }
        while (result.length < 6) result.push(0);
        return result;
    }

    pickGuitarPosition(positions, options = {}) {
        if (!Array.isArray(positions) || !positions.length) return null;
        let best = null;
        let bestScore = Infinity;
        const preferBarre = Boolean(options.preferBarre);
        const label = (options.label || '').trim().toLowerCase();
        const forceBarreLabel = ['bm', 'f#m', 'g#m', 'bbm', 'abm', 'b#m'].includes(label);

        positions.forEach(position => {
            const frets = this.parseFrets(position.frets);
            if (!Array.isArray(frets) || frets.length !== 6) return;
            const positive = frets.filter(f => f > 0);
            if (!positive.length) return;
            const minFret = Math.min(...positive);
            const maxFret = Math.max(...positive);
            const span = maxFret - minFret;
            const effectiveBase = Math.min(this.getBaseFret(position, minFret), minFret);
            const muted = frets.filter(f => f < 0).length;
            const open = frets.filter(f => f === 0).length;
            const hasBarre = typeof position.barres !== 'undefined';
            let score = (span * 3) + effectiveBase + (muted * 0.25) - (open * 0.1);
            if (preferBarre || forceBarreLabel) {
                score += open * 1.5;
                if (effectiveBase < 2) score += 3;
                if (effectiveBase < 4) score += 2;
                if (!hasBarre) score += 6;
                if ((open > 0 || effectiveBase <= 2) && !hasBarre) score += 4;
                if (hasBarre) score -= 2;
            } else {
                score -= open * 0.2;
            }
            if (score < bestScore) {
                bestScore = score;
                best = { position, frets, minFret, maxFret };
            }
        });

        if (best) return best;
        const fallback = positions[0];
        return fallback ? { position: fallback, frets: this.parseFrets(fallback.frets) || [], minFret: 1, maxFret: 4 } : null;
    }

    getBaseFret(position, fallback = null) {
        const raw = parseInt(position?.baseFret || position?.basefret || 'NaN', 10);
        if (Number.isFinite(raw) && raw > 0) return raw;
        if (Number.isFinite(fallback) && fallback > 0) return fallback;
        return 1;
    }

    determineFretWindow(frets, position, minFret = null, maxFret = null) {
        const positive = frets.filter(f => f > 0);
        if (!positive.length) return { baseFret: 1, rows: 4 };
        const minVal = Number.isFinite(minFret) ? minFret : Math.min(...positive);
        const maxVal = Number.isFinite(maxFret) ? maxFret : Math.max(...positive);
        const rawBase = this.getBaseFret(position, minVal) || minVal;
        let baseFret = Math.min(rawBase, minVal);
        const maxRows = 6;
        const minRows = 4;

        while ((maxVal - baseFret + 1) > maxRows) {
            baseFret += 1;
        }

        let rows = maxVal - baseFret + 1;
        if (rows < minRows) rows = minRows;
        if (rows > maxRows) rows = maxRows;
        return { baseFret, rows };
    }

    async regenerateChords() {
        const targetId = this.currentExtractionVideoId || this.currentExtractionId;
        if (!targetId) {
            return alert('Load a track before regenerating chords.');
        }
        if (this.chordRegenerating) return;
        const btn = document.getElementById('mobileRegenerateChords');
        const original = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Regenerating...';
        }
        this.chordRegenerating = true;
        try {
            const url = `/api/extractions/${targetId}/chords/regenerate`;
            const res = await fetch(url, { method: 'POST' });
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || ('HTTP ' + res.status));
            }
            const payload = Array.isArray(data.chords) ? data.chords : data.chords_data;
            let parsed = payload;
            if (typeof payload === 'string') {
                parsed = JSON.parse(payload);
            }
            if (!Array.isArray(parsed)) {
                throw new Error('Chord data missing from response');
            }
            this.chords = parsed;
            if (typeof data.beat_offset === 'number') {
                this.beatOffset = data.beat_offset;
            }
            if (this.currentExtractionData) {
                this.currentExtractionData.chords_data = JSON.stringify(parsed);
                if (typeof data.beat_offset === 'number') {
                    this.currentExtractionData.beat_offset = data.beat_offset;
                }
            }
            if (this.currentExtractionId) {
                this.setChordCache(this.currentExtractionId, parsed);
            }
            this.displayChords();
            this.initGridView2Popup();
            alert('Chords regenerated successfully!');
        } catch (error) {
            console.error('[Chords] Regeneration failed:', error);
            alert('Chord regeneration failed: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = original;
            }
            this.chordRegenerating = false;
        }
    }

    async generateLyrics() {
        if (!this.currentExtractionId) {
            console.error('[Lyrics] No extraction ID');
            return alert('No track loaded');
        }

        const btn = document.getElementById('mobileGenerateLyrics');
        if (!btn) {
            console.error('[Lyrics] Button not found');
            return;
        }

        console.log('[Lyrics] Starting generation for extraction:', this.currentExtractionId);

        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        btn.disabled = true;

        try {
            const url = '/api/extractions/' + this.currentExtractionId + '/lyrics/generate';
            console.log('[Lyrics] Fetching:', url);

            const res = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({})  // Send empty JSON body
            });

            console.log('[Lyrics] Response status:', res.status);

            if (!res.ok) {
                throw new Error('HTTP ' + res.status + ': ' + res.statusText);
            }

            const data = await res.json();
            console.log('[Lyrics] Response data:', data);

            if (data.error) throw new Error(data.error);

            // Backend can return either 'lyrics' or 'lyrics_data'
            const lyricsData = data.lyrics || data.lyrics_data;

            if (lyricsData) {
                this.lyrics = typeof lyricsData === 'string' ? JSON.parse(lyricsData) : lyricsData;
                console.log('[Lyrics] Parsed', this.lyrics.length, 'lyrics segments');
                this.displayLyrics();
                alert('Lyrics generated successfully!');
            } else {
                console.warn('[Lyrics] No lyrics data in response');
                alert('Lyrics generation completed but no data returned');
            }
        } catch (error) {
            console.error('[Lyrics] Generation failed:', error);
            alert('Lyrics generation failed: ' + error.message);
        } finally {
            btn.innerHTML = orig;
            btn.disabled = false;
        }
    }

    displayLyrics() {
        const container = document.getElementById('mobileLyricsDisplay');
        if (!container) {
            console.warn('[Lyrics] Container not found');
            return;
        }

        this.lyricsContainer = container;

        if (!this.lyrics.length) {
            container.innerHTML = '<p class="mobile-lyrics-placeholder">No lyrics available. Generate lyrics to see them here.</p>';
            this.detachLyricsScrollHandlers();
            this.lyricLineElements = [];
            this.activeLyricIndex = -1;
            this.lyricsUserScrolling = false;
            if (this.lyricsScrollResumeTimer) {
                clearTimeout(this.lyricsScrollResumeTimer);
                this.lyricsScrollResumeTimer = null;
            }
            return;
        }

        console.log('[Lyrics] Rendering', this.lyrics.length, 'segments with word-level timing');
        container.innerHTML = '';
        this.lyricLineElements = [];
        this.activeLyricIndex = -1;
        this.cancelLyricsScrollAnimation();
        this.attachLyricsScrollHandlers();

        // Reset scroll position
        container.scrollTop = 0;

        // Build chord lookup for songbook display
        const chordLookup = this.buildChordLookupForLyrics();

        // Create a line for each segment
        this.lyrics.forEach((segment, index) => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'mobile-lyrics-line';
            lineDiv.dataset.index = index;
            lineDiv.dataset.start = segment.start || 0;
            lineDiv.dataset.end = segment.end || 0;

            // Add timestamp
            const timeSpan = document.createElement('span');
            timeSpan.className = 'mobile-lyrics-time';
            timeSpan.textContent = this.formatTime(segment.start || 0);
            lineDiv.appendChild(timeSpan);

            // Add text container for words with chord annotations (songbook style)
            const textContainer = document.createElement('div');
            textContainer.className = 'mobile-lyrics-text songbook-style';

            // If we have word-level timestamps, render words with chord annotations
            if (segment.words && segment.words.length > 0) {
                segment.words.forEach((wordData, wordIndex) => {
                    const wordWrapper = document.createElement('span');
                    wordWrapper.className = 'mobile-lyrics-word-wrapper';

                    // Check if there's a chord change at this word
                    const chordInfo = this.findChordAtTime(wordData.start, chordLookup);
                    if (chordInfo && chordInfo.isChange) {
                        const chordLabel = document.createElement('span');
                        chordLabel.className = 'mobile-lyrics-chord';
                        chordLabel.dataset.originalChord = chordInfo.chord;
                        chordLabel.dataset.chordTime = chordInfo.timestamp;
                        chordLabel.textContent = this.transposeChord(chordInfo.chord, this.currentPitchShift);
                        wordWrapper.appendChild(chordLabel);
                    }

                    const wordSpan = document.createElement('span');
                    wordSpan.className = 'mobile-lyrics-word';
                    wordSpan.dataset.wordIndex = wordIndex;
                    wordSpan.dataset.start = wordData.start || 0;
                    wordSpan.dataset.end = wordData.end || 0;
                    wordSpan.textContent = wordData.word;

                    wordWrapper.appendChild(wordSpan);
                    textContainer.appendChild(wordWrapper);
                });
                console.log('[Lyrics] Line', index, 'rendered with', segment.words.length, 'words (songbook style)');
            } else {
                // Fallback: no word timestamps, check for chord at line start
                const chordInfo = this.findChordAtTime(segment.start, chordLookup);
                if (chordInfo) {
                    const chordLabel = document.createElement('span');
                    chordLabel.className = 'mobile-lyrics-chord';
                    chordLabel.dataset.originalChord = chordInfo.chord;
                    chordLabel.textContent = this.transposeChord(chordInfo.chord, this.currentPitchShift);
                    textContainer.appendChild(chordLabel);
                }
                const textSpan = document.createElement('span');
                textSpan.textContent = segment.text || '';
                textContainer.appendChild(textSpan);
                console.log('[Lyrics] Line', index, 'rendered without word timing (fallback)');
            }

            lineDiv.appendChild(textContainer);

            // Click to seek
            lineDiv.addEventListener('click', () => {
                console.log('[Lyrics] Seek to', segment.start);
                this.seek(segment.start || 0);
            });

            container.appendChild(lineDiv);
        });

        this.lyricLineElements = Array.from(container.querySelectorAll('.mobile-lyrics-line'));
        this.applyLyricLineStates(this.activeLyricIndex);
        console.log('[Lyrics] Rendered', this.lyrics.length, 'lines with songbook-style chord annotations');
    }

    buildChordLookupForLyrics() {
        // Build a sorted list of chord changes with timestamps
        if (!this.chords || this.chords.length === 0) return [];

        const lookup = [];
        let lastChord = null;

        this.chords.forEach(chord => {
            const chordName = chord.chord || '';
            const timestamp = chord.timestamp || 0;

            // Only add if it's a new chord (chord change)
            if (chordName && chordName !== lastChord) {
                lookup.push({
                    chord: chordName,
                    timestamp: timestamp,
                    isChange: true
                });
                lastChord = chordName;
            }
        });

        return lookup;
    }

    findChordAtTime(time, chordLookup) {
        if (!chordLookup || chordLookup.length === 0) return null;

        // Find the chord that starts closest to (and before or at) this time
        // with a tolerance window for matching
        const tolerance = 0.5; // 500ms tolerance

        for (let i = chordLookup.length - 1; i >= 0; i--) {
            const chordInfo = chordLookup[i];
            const diff = time - chordInfo.timestamp;

            // Chord starts within tolerance before or at the word
            if (diff >= -tolerance && diff <= tolerance) {
                // Mark as already used to avoid duplicates
                if (!chordInfo.used) {
                    chordInfo.used = true;
                    return chordInfo;
                }
            }
        }

        return null;
    }

    updateLyricsChordTransposition() {
        // Update all chord labels in lyrics when pitch changes
        const chordLabels = document.querySelectorAll('.mobile-lyrics-chord');
        chordLabels.forEach(label => {
            const originalChord = label.dataset.originalChord;
            if (originalChord) {
                label.textContent = this.transposeChord(originalChord, this.currentPitchShift);
            }
        });
    }

    updateActiveLyric() {
        if (!this.lyrics.length || !this.lyricsContainer) return;

        // IMPORTANT: Do NOT adjust time for lyrics!
        // SoundTouch changes playback speed but doesn't affect AudioContext.currentTime
        // The lyrics timestamps are already in the correct time domain
        const currentTime = this.currentTime;
        const segmentIndex = this.findCurrentLyricIndex(currentTime);

        if (segmentIndex === -1) {
            if (this.activeLyricIndex !== -1) {
                this.clearWordHighlights(this.activeLyricIndex);
                this.activeLyricIndex = -1;
            }
            return;
        }

        if (segmentIndex !== this.activeLyricIndex) {
            this.clearWordHighlights(this.activeLyricIndex);
            this.activeLyricIndex = segmentIndex;
            this.applyLyricLineStates(segmentIndex);
            this.scrollLyricsToIndex(segmentIndex);
        }

        this.highlightLyricWords(segmentIndex, currentTime);

        // Update fullscreen lyrics if open
        this.updateFullscreenLyrics();
    }

    findCurrentLyricIndex(currentTime) {
        if (!this.lyrics.length) return -1;

        const tolerance = 0.2; // seconds
        const activeIndex = this.activeLyricIndex;

        if (activeIndex >= 0) {
            const activeSeg = this.lyrics[activeIndex];
            if (activeSeg && currentTime >= (activeSeg.start - tolerance) && currentTime <= (activeSeg.end + tolerance)) {
                return activeIndex;
            }

            if (activeSeg && currentTime > activeSeg.end) {
                for (let i = activeIndex + 1; i < this.lyrics.length; i++) {
                    const seg = this.lyrics[i];
                    if (!seg) continue;
                    if (currentTime < seg.start - tolerance) break;
                    if (currentTime <= seg.end + tolerance) {
                        return i;
                    }
                }
            } else if (activeSeg && currentTime < activeSeg.start) {
                for (let i = activeIndex - 1; i >= 0; i--) {
                    const seg = this.lyrics[i];
                    if (!seg) continue;
                    if (currentTime >= seg.start - tolerance && currentTime <= seg.end + tolerance) {
                        return i;
                    }
                    if (currentTime > seg.end) break;
                }
            }
        }

        for (let i = 0; i < this.lyrics.length; i++) {
            const seg = this.lyrics[i];
            if (!seg) continue;
            if (currentTime >= (seg.start - tolerance) && currentTime <= (seg.end + tolerance)) {
                return i;
            }
            if (currentTime < seg.start) break;
        }

        const lastSegment = this.lyrics[this.lyrics.length - 1];
        if (lastSegment && currentTime > lastSegment.end) {
            return this.lyrics.length - 1;
        }

        return -1;
    }

    applyLyricLineStates(activeIndex) {
        if (!this.lyricLineElements.length) return;

        const pastPreview = this.lyricsPastPreviewCount;
        const futurePreview = this.lyricsFuturePreviewCount;

        this.lyricLineElements.forEach((line, i) => {
            line.classList.remove('recent-past', 'hidden-past', 'hidden-future', 'up-next', 'active', 'past', 'future');

            if (activeIndex === -1) {
                if (i === 0) {
                    line.classList.add('up-next', 'future');
                } else {
                    line.classList.add('future');
                }
                return;
            }

            if (i === activeIndex) {
                line.classList.add('active');
                return;
            }

            if (i < activeIndex) {
                line.classList.add('past');
                if (i >= activeIndex - pastPreview) {
                    line.classList.add('recent-past');
                } else {
                    line.classList.add('hidden-past');
                }
                return;
            }

            line.classList.add('future');
            if (i <= activeIndex + futurePreview) {
                line.classList.add('up-next');
            } else {
                line.classList.add('hidden-future');
            }
        });
    }

    scrollLyricsToIndex(index, immediate = false) {
        if (!this.lyricsContainer || index < 0 || !this.lyricLineElements[index]) return;
        if (!immediate && this.isPlaying && this.lyricsUserScrolling) return;

        const container = this.lyricsContainer;
        const line = this.lyricLineElements[index];

        // Position the active line at 35% from top (slightly above center)
        // This allows users to see upcoming lyrics while keeping current line visible
        const containerHeight = container.clientHeight;
        const targetOffset = containerHeight * 0.35;

        // Calculate target scroll position
        const lineTop = line.offsetTop;
        const lineHeight = line.clientHeight;
        const lineCenterY = lineTop + (lineHeight / 2);

        // Target position to place line center at 35% of viewport
        let targetTop = lineCenterY - targetOffset;

        // Clamp to valid scroll range
        const maxScroll = Math.max(0, container.scrollHeight - containerHeight);
        const clampedTarget = Math.max(0, Math.min(targetTop, maxScroll));

        if (immediate) {
            this.cancelLyricsScrollAnimation();
            this.lyricsAutoScrolling = true;
            container.scrollTop = clampedTarget;
            this.lyricsAutoScrolling = false;
            return;
        }

        if (Math.abs(container.scrollTop - clampedTarget) < 1) return;
        this.animateLyricsScroll(clampedTarget);
    }

    animateLyricsScroll(target) {
        if (!this.lyricsContainer) return;

        this.cancelLyricsScrollAnimation();
        this.lyricsAutoScrolling = true;

        const container = this.lyricsContainer;
        const start = container.scrollTop;
        const distance = target - start;

        if (Math.abs(distance) < 0.5) {
            container.scrollTop = target;
            this.lyricsAutoScrolling = false;
            return;
        }

        // Smooth, gentle scroll animation
        const duration = 600;
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
        const startTime = performance.now();

        const step = (now) => {
            const progress = Math.min(1, (now - startTime) / duration);
            const eased = easeOutCubic(progress);
            container.scrollTop = start + distance * eased;

            if (progress < 1) {
                this.lyricsScrollAnimation = requestAnimationFrame(step);
            } else {
                this.lyricsScrollAnimation = null;
                this.lyricsAutoScrolling = false;
            }
        };

        this.lyricsScrollAnimation = requestAnimationFrame(step);
    }

    cancelLyricsScrollAnimation() {
        if (this.lyricsScrollAnimation) {
            cancelAnimationFrame(this.lyricsScrollAnimation);
            this.lyricsScrollAnimation = null;
        }
        this.lyricsAutoScrolling = false;
    }

    clearWordHighlights(index) {
        if (index < 0 || !this.lyricLineElements[index]) return;

        const line = this.lyricLineElements[index];
        const wordSpans = line.querySelectorAll('.mobile-lyrics-word');

        wordSpans.forEach((wordSpan) => {
            wordSpan.classList.remove('word-past', 'word-current', 'word-future');
            wordSpan.style.background = '';
            wordSpan.style.webkitBackgroundClip = '';
            wordSpan.style.backgroundClip = '';
            wordSpan.style.webkitTextFillColor = '';
        });
    }

    highlightLyricWords(segmentIndex, currentTime) {
        if (segmentIndex < 0 || !this.lyricLineElements[segmentIndex]) return;

        const line = this.lyricLineElements[segmentIndex];
        const wordSpans = line.querySelectorAll('.mobile-lyrics-word');

        wordSpans.forEach((wordSpan) => {
            const wordStart = parseFloat(wordSpan.dataset.start) || 0;
            const wordEnd = parseFloat(wordSpan.dataset.end) || 0;

            wordSpan.classList.remove('word-past', 'word-current', 'word-future');

            if (currentTime < wordStart) {
                wordSpan.classList.add('word-future');
                wordSpan.style.background = '';
                wordSpan.style.webkitBackgroundClip = '';
                wordSpan.style.backgroundClip = '';
                wordSpan.style.webkitTextFillColor = '';
            } else if (currentTime >= wordStart && currentTime <= wordEnd) {
                wordSpan.classList.add('word-current');
                const progress = wordEnd > wordStart ? (currentTime - wordStart) / (wordEnd - wordStart) : 1;
                const fillPercent = Math.min(100, Math.max(0, progress * 100));
                wordSpan.style.background = `linear-gradient(to right, var(--mobile-primary) ${fillPercent}%, rgba(255, 255, 255, 0.6) ${fillPercent}%)`;
                wordSpan.style.webkitBackgroundClip = 'text';
                wordSpan.style.backgroundClip = 'text';
                wordSpan.style.webkitTextFillColor = 'transparent';
            } else {
                wordSpan.classList.add('word-past');
                wordSpan.style.background = 'var(--mobile-primary)';
                wordSpan.style.webkitBackgroundClip = 'text';
                wordSpan.style.backgroundClip = 'text';
                wordSpan.style.webkitTextFillColor = 'transparent';
            }
        });
    }

    attachLyricsScrollHandlers() {
        if (!this.lyricsContainer) return;

        this.detachLyricsScrollHandlers();

        const pointerDownHandler = () => this.onLyricsManualScrollStart();
        const pointerReleaseHandler = () => this.onLyricsManualScrollEnd();
        const wheelHandler = () => {
            this.onLyricsManualScrollStart();
            this.onLyricsManualScrollEnd(1500);
        };
        const touchMoveHandler = () => this.onLyricsManualScrollStart();
        const scrollHandler = () => {
            if (this.lyricsAutoScrolling || !this.isPlaying) return;
            this.onLyricsManualScrollStart();
            this.onLyricsManualScrollEnd(1500);
        };

        this.lyricsContainer.addEventListener('pointerdown', pointerDownHandler);
        this.lyricsContainer.addEventListener('pointerup', pointerReleaseHandler);
        this.lyricsContainer.addEventListener('pointercancel', pointerReleaseHandler);
        this.lyricsContainer.addEventListener('pointerleave', pointerReleaseHandler);
        this.lyricsContainer.addEventListener('wheel', wheelHandler, { passive: true });
        this.lyricsContainer.addEventListener('touchmove', touchMoveHandler, { passive: true });
        this.lyricsContainer.addEventListener('scroll', scrollHandler, { passive: true });

        this.lyricsScrollHandlers = {
            pointerDownHandler,
            pointerReleaseHandler,
            wheelHandler,
            touchMoveHandler,
            scrollHandler
        };
    }

    detachLyricsScrollHandlers() {
        if (!this.lyricsContainer || !this.lyricsScrollHandlers) return;

        const handlers = this.lyricsScrollHandlers;
        this.lyricsContainer.removeEventListener('pointerdown', handlers.pointerDownHandler);
        this.lyricsContainer.removeEventListener('pointerup', handlers.pointerReleaseHandler);
        this.lyricsContainer.removeEventListener('pointercancel', handlers.pointerReleaseHandler);
        this.lyricsContainer.removeEventListener('pointerleave', handlers.pointerReleaseHandler);
        this.lyricsContainer.removeEventListener('wheel', handlers.wheelHandler);
        this.lyricsContainer.removeEventListener('touchmove', handlers.touchMoveHandler);
        this.lyricsContainer.removeEventListener('scroll', handlers.scrollHandler);
        this.lyricsScrollHandlers = null;
        if (this.lyricsScrollResumeTimer) {
            clearTimeout(this.lyricsScrollResumeTimer);
            this.lyricsScrollResumeTimer = null;
        }
    }

    onLyricsManualScrollStart() {
        if (!this.isPlaying) return;

        if (!this.lyricsUserScrolling) {
            this.lyricsUserScrolling = true;
            this.cancelLyricsScrollAnimation();
        }

        if (this.lyricsScrollResumeTimer) {
            clearTimeout(this.lyricsScrollResumeTimer);
            this.lyricsScrollResumeTimer = null;
        }
    }

    onLyricsManualScrollEnd(delay = 1500) {
        if (!this.lyricsUserScrolling) return;

        if (!this.isPlaying) {
            this.lyricsUserScrolling = false;
            return;
        }

        if (this.lyricsScrollResumeTimer) {
            clearTimeout(this.lyricsScrollResumeTimer);
        }

        this.lyricsScrollResumeTimer = setTimeout(() => {
            this.lyricsUserScrolling = false;
            if (this.activeLyricIndex >= 0) {
                this.scrollLyricsToIndex(this.activeLyricIndex);
            }
        }, delay);
    }

    renderWaveform() {
        const canvas = document.getElementById('mobileWaveformCanvas');
        if (!canvas) {
            console.warn('[Waveform] Canvas not found');
            return;
        }

        const ctx = canvas.getContext('2d');

        const parentWidth = canvas.parentElement.offsetWidth;
        const parentHeight = canvas.parentElement.offsetHeight;
        const width = parentWidth > 0 ? parentWidth : Math.min(window.innerWidth - 24, 800);
        const height = parentHeight > 0 ? parentHeight : 120;

        canvas.width = width;
        canvas.height = height;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        const pointCount = Math.max(500, Math.floor(width * window.devicePixelRatio));
        let data = null;

        if (this.masterAudioBuffer) {
            data = this.buildWaveformDataFromBuffer(this.masterAudioBuffer, pointCount);
        }

        if (!data || !data.length) {
            const stemBuffers = Object.values(this.stems).map(s => s.buffer).filter(Boolean);
            if (!stemBuffers.length) {
                console.warn('[Waveform] No audio buffers available for waveform rendering');
                return;
            }
            data = this.buildMasterWaveformData(stemBuffers, pointCount);
        }

        if (!data || !data.length) {
            console.warn('[Waveform] Unable to render waveform - no data');
            return;
        }

        ctx.fillStyle = '#282828';
        ctx.fillRect(0, 0, width, height);

        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        ctx.fillStyle = '#1DB954';
        ctx.globalAlpha = 0.6;

        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;

            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }

            const yMin = (1 + min) * amp;
            const yMax = (1 + max) * amp;

            ctx.fillRect(i, yMin, 1, yMax - yMin);
        }

        ctx.globalAlpha = 1.0;
        console.log('[Waveform] Rendered master waveform:', width + 'x' + height);

        // Render timeline markers
        this.renderTimeline();
    }

    buildWaveformDataFromBuffer(buffer, pointCount = 1000) {
        if (!buffer || !pointCount) return null;
        const channel = buffer.getChannelData(0);
        const length = channel.length;
        if (!length) return null;

        const data = new Float32Array(pointCount);
        const blockSize = Math.floor(length / pointCount);
        if (!blockSize) return Array.from(channel.slice(0, pointCount));

        for (let i = 0; i < pointCount; i++) {
            const start = i * blockSize;
            let sum = 0;
            for (let j = 0; j < blockSize && (start + j) < length; j++) {
                sum += channel[start + j];
            }
            data[i] = sum / blockSize;
        }

        let maxVal = 0;
        for (let i = 0; i < pointCount; i++) {
            const abs = Math.abs(data[i]);
            if (abs > maxVal) maxVal = abs;
        }

        if (maxVal > 0) {
            for (let i = 0; i < pointCount; i++) {
                data[i] /= maxVal;
            }
        }

        return Array.from(data);
    }

    buildMasterWaveformData(buffers, pointCount = 1000) {
        if (!buffers.length || pointCount <= 0) return null;
        const maxSamples = Math.max(...buffers.map(b => b.length));
        if (!maxSamples) return null;

        const data = new Float32Array(pointCount);
        const counts = new Uint32Array(pointCount);

        buffers.forEach(buffer => {
            if (!buffer.numberOfChannels) return;
            const channel = buffer.getChannelData(0);
            const len = channel.length;
            for (let i = 0; i < len; i++) {
                const bucket = Math.min(pointCount - 1, Math.floor((i / maxSamples) * pointCount));
                data[bucket] += channel[i];
                counts[bucket]++;
            }
        });

        let maxVal = 0;
        for (let i = 0; i < pointCount; i++) {
            if (counts[i] > 0) {
                data[i] /= counts[i];
            }
            const abs = Math.abs(data[i]);
            if (abs > maxVal) maxVal = abs;
        }

        if (maxVal > 0) {
            for (let i = 0; i < pointCount; i++) {
                data[i] /= maxVal;
            }
        }

        return Array.from(data);
    }

    renderTimeline() {
        const timeline = document.getElementById('mobileWaveformTimeline');
        if (!timeline || this.duration <= 0) {
            console.warn('[Timeline] Cannot render - timeline element or duration missing');
            return;
        }

        timeline.innerHTML = '';

        // Determine interval based on duration
        let interval;
        if (this.duration < 90) {
            interval = 15; // 15s for songs < 1.5min
        } else if (this.duration < 300) {
            interval = 30; // 30s for songs < 5min
        } else if (this.duration < 600) {
            interval = 60; // 1min for songs < 10min
        } else {
            interval = 120; // 2min for longer songs
        }

        console.log('[Timeline] Rendering with', interval, 's interval for duration', this.duration);

        // Generate markers
        const markers = [];
        for (let time = 0; time <= this.duration; time += interval) {
            markers.push(time);
        }

        // Always include the end time if it's not already there
        if (markers[markers.length - 1] < this.duration) {
            markers.push(Math.floor(this.duration));
        }

        console.log('[Timeline] Creating', markers.length, 'markers:', markers);

        // Create marker elements
        markers.forEach(time => {
            const marker = document.createElement('div');
            marker.className = 'mobile-timeline-marker';

            const tick = document.createElement('div');
            tick.className = 'mobile-timeline-tick';

            const label = document.createElement('div');
            label.className = 'mobile-timeline-label';
            label.textContent = this.formatTime(time);

            marker.appendChild(tick);
            marker.appendChild(label);
            timeline.appendChild(marker);
        });

        console.log('[Timeline] Rendered', markers.length, 'markers');
    }

    formatTime(s) {
        if (isNaN(s) || s < 0) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return m + ':' + sec.toString().padStart(2, '0');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    syncPopupControlsState() {
        try {
        // Sync play button state
        const playBtns = document.querySelectorAll('.popup-play-sync');
        playBtns.forEach(btn => {
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
            }
            btn.classList.toggle('playing', this.isPlaying);
        });

        // Sync time display
        const timeDisplays = document.querySelectorAll('.popup-time-sync');
        timeDisplays.forEach(el => {
            el.textContent = this.formatTime(this.currentTime);
        });

        const durationDisplays = document.querySelectorAll('.popup-duration-sync');
        durationDisplays.forEach(el => {
            el.textContent = this.formatTime(this.duration);
        });

        // Sync tempo sliders (ratio-based - legacy)
        const originalBPM = this.originalBPM || 120;
        const tempoRatio = (this.currentBPM || 120) / originalBPM;
        const tempoSliders = document.querySelectorAll('.popup-tempo-sync');
        tempoSliders.forEach(slider => {
            if (isFinite(tempoRatio)) {
                slider.value = tempoRatio.toFixed(2);
            }
        });

        const tempoValues = document.querySelectorAll('.popup-tempo-value-sync');
        tempoValues.forEach(el => {
            if (isFinite(tempoRatio)) {
                el.textContent = tempoRatio.toFixed(2) + 'x';
            }
        });

        // Sync tempo sliders (BPM-based - new)
        const currentBPM = this.currentBPM || 120;  // Default to 120 if undefined
        const tempoBpmSliders = document.querySelectorAll('.popup-tempo-bpm-sync');
        tempoBpmSliders.forEach(slider => {
            if (isFinite(currentBPM) && currentBPM > 0) {
                slider.value = Math.round(currentBPM);
            }
        });

        const tempoBpmValues = document.querySelectorAll('.popup-tempo-bpm-value-sync');
        tempoBpmValues.forEach(el => {
            if (isFinite(currentBPM) && currentBPM > 0) {
                el.textContent = Math.round(currentBPM) + ' BPM';
            }
        });

        // Sync pitch sliders
        const pitchSliders = document.querySelectorAll('.popup-pitch-sync');
        pitchSliders.forEach(slider => {
            slider.value = this.currentPitchShift;
        });

        const pitchValues = document.querySelectorAll('.popup-pitch-value-sync');
        pitchValues.forEach(el => {
            const sign = this.currentPitchShift >= 0 ? '+' : '';
            el.textContent = sign + this.currentPitchShift;
        });
        } catch (err) {
            console.error('[syncPopupControlsState] Error:', err);
        }
    }

    // ============================================
    // GRID VIEW - MODERN CHORDS GRID POPUP
    // ============================================

    initGridView2Popup() {
        const openBtn = document.getElementById('mobileGridView2Btn');
        const closeBtn = document.getElementById('gridview2-popup-close');
        const popup = document.getElementById('gridview2-popup');

        if (!openBtn || !closeBtn || !popup) return;

        openBtn.addEventListener('click', () => this.openGridView2Popup());
        closeBtn.addEventListener('click', () => this.closeGridView2Popup());

        // Close on overlay click
        popup.addEventListener('click', (e) => {
            if (e.target === popup) this.closeGridView2Popup();
        });

        // Close on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && popup.getAttribute('aria-hidden') === 'false') {
                this.closeGridView2Popup();
            }
        });

        // Initialize Grid View 2 controls (they use popup-*-sync classes)
        this.initGridView2Controls();
    }

    initGridView2Controls() {
        const playBtn = document.getElementById('gridview2PlayBtn');
        const stopBtn = document.getElementById('gridview2StopBtn');
        const tempoSlider = document.getElementById('gridview2TempoSlider');
        const pitchSlider = document.getElementById('gridview2PitchSlider');

        if (playBtn) {
            playBtn.addEventListener('click', () => {
                if (this.isPlaying) {
                    this.pause();
                } else {
                    this.play();
                }
            });
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stop());
        }

        if (tempoSlider) {
            tempoSlider.addEventListener('input', (e) => {
                const targetBPM = parseInt(e.target.value);
                const originalBPM = this.originalBPM || 120;
                const ratio = targetBPM / originalBPM;
                if (isFinite(ratio) && ratio > 0) {
                    this.setTempo(ratio);
                    this.syncPopupControlsState();
                }
            });
        }

        if (pitchSlider) {
            pitchSlider.addEventListener('input', (e) => {
                const pitch = parseInt(e.target.value);
                this.syncPitchValue(pitch);
                this.setPitch(pitch);
                this.syncPopupControlsState();
            });
        }
    }

    openGridView2Popup() {
        const popup = document.getElementById('gridview2-popup');
        const content = document.getElementById('gridview2-content');

        if (!popup || !content) {
            console.warn('[GridView2] Missing popup elements');
            return;
        }

        if (!this.chords || this.chords.length === 0) {
            alert('No chords available. Generate chords first.');
            return;
        }

        // Render the grid
        this.renderGridView2(content);

        // Open popup
        popup.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        this.gridView2Open = true;

        // Sync controls state
        this.syncPopupControlsState();

        // IMMEDIATE positioning on current beat - NO ANIMATION
        const currentBeatIdx = this.getBeatIndexForTime(this.currentTime - (this.beatOffset || 0));
        if (currentBeatIdx >= 0) {
            // Use setTimeout to ensure DOM is rendered
            setTimeout(() => {
                this.highlightGridView2Beat(currentBeatIdx, true);
            }, 0);
        }

        console.log('[GridView2] Opened with', this.gridView2Beats.length, 'beats');
    }

    closeGridView2Popup() {
        const popup = document.getElementById('gridview2-popup');
        if (!popup) return;

        popup.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        this.gridView2Open = false;
        this.gridView2Beats = [];

        console.log('[GridView2] Closed');
    }

    renderGridView2(container) {
        container.innerHTML = '';
        this.gridView2Beats = [];

        if (!this.chords || this.chords.length === 0) {
            container.innerHTML = `
                <div class="gridview2-empty">
                    <i class="fas fa-music"></i>
                    <p>No chords available</p>
                </div>
            `;
            return;
        }

        // Calculate timing based on BPM
        const bpm = this.chordBPM || this.currentBPM || this.originalBPM || 120;
        const beatsPerBar = Math.max(2, Math.min(12, this.beatsPerBar || 4));
        const beatDuration = 60 / bpm; // Duration of one beat in seconds
        const measureDuration = beatDuration * beatsPerBar;

        // Calculate total number of measures needed
        const totalDuration = this.duration || 180; // fallback to 3 minutes
        const totalMeasures = Math.ceil(totalDuration / measureDuration);

        // Build a chord lookup: for each beat position, what chord is active?
        // Apply beatOffset to align chord timestamps with the beat grid
        const offset = this.beatOffset || 0;

        // Sort chords by timestamp and QUANTIZE to nearest STRONG beat (1 or 3)
        const sortedChords = [...this.chords]
            .map(chord => {
                // Apply beat offset to align with grid
                const originalTime = (chord.timestamp || 0) - offset;

                // Find the measure this chord belongs to
                const measureIndex = Math.floor(originalTime / measureDuration);
                const measureStart = measureIndex * measureDuration;
                const timeInMeasure = originalTime - measureStart;

                // Strong beats are at 0 (beat 1) and 2*beatDuration (beat 3)
                const beat1Time = measureStart;
                const beat3Time = measureStart + (2 * beatDuration);
                const beat2Time = measureStart + beatDuration;
                const beat4Time = measureStart + (3 * beatDuration);

                // Check distance to each strong beat first
                const distToBeat1 = Math.abs(originalTime - beat1Time);
                const distToBeat3 = Math.abs(originalTime - beat3Time);

                // Tolerance: snap to strong beat if within 0.7 of a beat duration
                const strongBeatTolerance = beatDuration * 0.7;

                let quantizedTime;
                if (distToBeat1 <= strongBeatTolerance) {
                    quantizedTime = beat1Time;
                } else if (distToBeat3 <= strongBeatTolerance) {
                    quantizedTime = beat3Time;
                } else {
                    // Fall back to nearest beat
                    quantizedTime = Math.round(originalTime / beatDuration) * beatDuration;
                }

                return {
                    ...chord,
                    timestamp: quantizedTime,
                    originalTimestamp: originalTime
                };
            })
            .sort((a, b) => a.timestamp - b.timestamp);

        // Create ALL measures from start to end
        let lastShownChord = ''; // Track what chord name was shown on previous beat
        let chordIndex = 0;

        for (let measureNum = 0; measureNum < totalMeasures; measureNum++) {
            const measureStartTime = measureNum * measureDuration;
            const measureDiv = document.createElement('div');
            measureDiv.className = 'gridview2-measure';

            // Add measure number badge
            const measureNumEl = document.createElement('span');
            measureNumEl.className = 'gridview2-measure-number';
            measureNumEl.textContent = `M${measureNum + 1}`;
            measureDiv.appendChild(measureNumEl);

            // Create exactly beatsPerBar beats for this measure
            for (let beatInMeasure = 0; beatInMeasure < beatsPerBar; beatInMeasure++) {
                const beatTime = measureStartTime + (beatInMeasure * beatDuration);

                // Find the chord that is active at this beat time
                // (the most recent chord that started before or at this time)
                while (chordIndex < sortedChords.length - 1 &&
                       (sortedChords[chordIndex + 1].timestamp || 0) <= beatTime + 0.01) {
                    chordIndex++;
                }

                // Get current chord at this beat time
                const activeChord = sortedChords[chordIndex];
                const chordName = activeChord?.chord || '';

                const beatDiv = document.createElement('div');
                beatDiv.className = 'gridview2-beat';
                beatDiv.dataset.beatTime = beatTime;
                beatDiv.dataset.measure = measureNum;
                beatDiv.dataset.beat = beatInMeasure;
                beatDiv.dataset.globalIndex = this.gridView2Beats.length;
                beatDiv.dataset.currentChord = chordName;

                // Show chord name if it's different from the previous beat
                if (chordName && chordName !== lastShownChord) {
                    const transposedChord = this.transposeChord(chordName, this.currentPitchShift);
                    beatDiv.textContent = transposedChord;
                    lastShownChord = chordName;
                } else {
                    // Continuation beat - show dash
                    beatDiv.classList.add('is-empty');
                    beatDiv.textContent = '—';
                }

                // Click to seek
                beatDiv.addEventListener('click', () => this.seek(beatTime));

                this.gridView2Beats.push(beatDiv);
                measureDiv.appendChild(beatDiv);
            }

            container.appendChild(measureDiv);
        }
    }

    highlightGridView2Beat(beatIndex, immediate = false) {
        if (!this.gridView2Open) return;
        if (!this.gridView2Beats || !this.gridView2Beats.length) return;

        const activeBeat = this.gridView2Beats[beatIndex];
        if (!activeBeat) return;

        // Update classes for all beats (past/active/future)
        this.gridView2Beats.forEach((beat, idx) => {
            beat.classList.remove('active', 'past', 'future');
            if (idx < beatIndex) {
                beat.classList.add('past');
            } else if (idx > beatIndex) {
                beat.classList.add('future');
            }
        });

        // Highlight active beat
        activeBeat.classList.add('active');

        // Scroll to show the MEASURE at the top of viewport
        const content = document.getElementById('gridview2-content');
        if (!content) return;

        // Get the measure element containing the active beat
        const measureEl = activeBeat.parentElement;
        if (!measureEl) return;

        const measureRect = measureEl.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();

        // Position measure at top of content area (with padding for transport bar)
        const paddingTop = 100; // Space from top of content
        const measureTop = measureRect.top - contentRect.top;
        const targetScrollTop = measureEl.offsetTop - paddingTop;

        // Scroll to position the measure at the top
        if (Math.abs(content.scrollTop - targetScrollTop) > 10) {
            content.scrollTop = targetScrollTop;
        }
    }

    syncGridView2() {
        if (!this.gridView2Open) return;
        if (!this.gridView2Beats || !this.gridView2Beats.length) return;

        const currentTime = this.currentTime - (this.beatOffset || 0);

        // Find the correct beat index based on beatTime
        let beatIdx = -1;
        for (let i = 0; i < this.gridView2Beats.length; i++) {
            const beatTime = parseFloat(this.gridView2Beats[i].dataset.beatTime);
            const nextBeatTime = i < this.gridView2Beats.length - 1
                ? parseFloat(this.gridView2Beats[i + 1].dataset.beatTime)
                : this.duration;

            if (currentTime >= beatTime && currentTime < nextBeatTime) {
                beatIdx = i;
                break;
            }
        }

        // Fallback to last beat if past all beats
        if (beatIdx === -1 && currentTime >= parseFloat(this.gridView2Beats[this.gridView2Beats.length - 1].dataset.beatTime)) {
            beatIdx = this.gridView2Beats.length - 1;
        }

        if (beatIdx >= 0 && beatIdx !== this.lastGridView2BeatIndex) {
            this.highlightGridView2Beat(beatIdx);
            this.lastGridView2BeatIndex = beatIdx;
        }

        // Throttle syncPopupControlsState to max once per 200ms (prevents mobile crash)
        const now = Date.now();
        if (!this.lastGridView2ControlSync || (now - this.lastGridView2ControlSync) > 200) {
            this.syncPopupControlsState();
            this.lastGridView2ControlSync = now;
        }
    }

    // ============================================
    // FULLSCREEN LYRICS POPUP
    // ============================================

    openFullscreenLyrics() {
        const popup = document.getElementById('fullscreen-lyrics-popup');
        const content = document.getElementById('fullscreen-lyrics-content');

        if (!popup || !content) {
            console.warn('[FullscreenLyrics] Missing popup elements');
            return;
        }

        if (!this.lyrics || this.lyrics.length === 0) {
            alert('No lyrics available. Generate lyrics first.');
            return;
        }

        // Render lyrics fresh (not clone) with own element structure
        this.renderFullscreenLyrics(content);

        // Open popup
        popup.classList.add('active');
        popup.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        this.fullscreenLyricsOpen = true;

        // Apply current state
        if (this.activeLyricIndex >= 0) {
            this.applyFullscreenLyricStates(this.activeLyricIndex);
            this.scrollToFullscreenLyric(this.activeLyricIndex, true);
        }

        // Sync controls state
        this.syncPopupControlsState();
        console.log('[FullscreenLyrics] Opened with', this.lyrics.length, 'lines');
    }

    closeFullscreenLyrics() {
        const popup = document.getElementById('fullscreen-lyrics-popup');
        if (!popup) return;

        popup.classList.remove('active');
        popup.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        this.fullscreenLyricsOpen = false;
        this.fullscreenLyricElements = [];

        // Reset size slider
        const sizeSlider = document.getElementById('fullscreenLyricsSizeSlider');
        if (sizeSlider) sizeSlider.value = '1';

        // Reset content transform
        const content = document.getElementById('fullscreen-lyrics-content');
        if (content) {
            content.style.removeProperty('transform');
            content.style.removeProperty('transform-origin');
        }

        console.log('[FullscreenLyrics] Closed');
    }

    renderFullscreenLyrics(container) {
        container.innerHTML = '';
        this.fullscreenLyricElements = [];

        // Build chord lookup for display
        const chordLookup = this.buildChordLookupForLyrics();

        this.lyrics.forEach((segment, index) => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'fs-lyrics-line';
            lineDiv.dataset.index = index;
            lineDiv.dataset.start = segment.start || 0;
            lineDiv.dataset.end = segment.end || 0;

            // Text container
            const textContainer = document.createElement('div');
            textContainer.className = 'fs-lyrics-text';

            if (segment.words && segment.words.length > 0) {
                segment.words.forEach((wordData, wordIndex) => {
                    const wordWrapper = document.createElement('span');
                    wordWrapper.className = 'fs-lyrics-word-wrapper';

                    // Check for chord at this word
                    const chordInfo = this.findChordAtTime(wordData.start, chordLookup);
                    if (chordInfo && chordInfo.isChange) {
                        const chordLabel = document.createElement('span');
                        chordLabel.className = 'fs-lyrics-chord';
                        chordLabel.dataset.originalChord = chordInfo.chord;
                        chordLabel.textContent = this.transposeChord(chordInfo.chord, this.currentPitchShift);
                        wordWrapper.appendChild(chordLabel);
                    }

                    const wordSpan = document.createElement('span');
                    wordSpan.className = 'fs-lyrics-word';
                    wordSpan.dataset.wordIndex = wordIndex;
                    wordSpan.dataset.start = wordData.start || 0;
                    wordSpan.dataset.end = wordData.end || 0;
                    wordSpan.textContent = wordData.word;

                    wordWrapper.appendChild(wordSpan);
                    textContainer.appendChild(wordWrapper);
                });
            } else {
                // Fallback for segments without word timing
                const textSpan = document.createElement('span');
                textSpan.className = 'fs-lyrics-word';
                textSpan.textContent = segment.text || '';
                textContainer.appendChild(textSpan);
            }

            lineDiv.appendChild(textContainer);

            // Click to seek
            lineDiv.addEventListener('click', () => {
                this.seek(segment.start || 0);
            });

            container.appendChild(lineDiv);
        });

        this.fullscreenLyricElements = Array.from(container.querySelectorAll('.fs-lyrics-line'));
    }

    applyFullscreenLyricStates(activeIndex) {
        if (!this.fullscreenLyricElements || this.fullscreenLyricElements.length === 0) return;

        const pastPreview = 2;
        const futurePreview = 3;

        this.fullscreenLyricElements.forEach((line, i) => {
            line.classList.remove('active', 'past', 'recent-past', 'hidden-past', 'future', 'up-next', 'hidden-future');

            if (i === activeIndex) {
                line.classList.add('active');
            } else if (i < activeIndex) {
                if (i >= activeIndex - pastPreview) {
                    line.classList.add('recent-past');
                } else {
                    line.classList.add('hidden-past');
                }
                line.classList.add('past');
            } else {
                if (i <= activeIndex + futurePreview) {
                    line.classList.add('up-next');
                } else {
                    line.classList.add('hidden-future');
                }
                line.classList.add('future');
            }
        });
    }

    scrollToFullscreenLyric(index, immediate = false) {
        if (!this.fullscreenLyricElements || index < 0 || index >= this.fullscreenLyricElements.length) return;

        const content = document.getElementById('fullscreen-lyrics-content');
        const line = this.fullscreenLyricElements[index];
        if (!content || !line) return;

        const containerHeight = content.clientHeight;

        // Validate container is laid out
        if (containerHeight < 50) {
            setTimeout(() => this.scrollToFullscreenLyric(index, immediate), 100);
            return;
        }

        // Position line at 25% from top (like desktop but with more margin for mobile controls)
        const topMargin = containerHeight * 0.25;

        // Use getBoundingClientRect for accurate positioning (like desktop)
        const lineRect = line.getBoundingClientRect();
        const containerRect = content.getBoundingClientRect();
        const lineTopInContainer = lineRect.top - containerRect.top + content.scrollTop;

        let targetTop = lineTopInContainer - topMargin;
        const maxScroll = Math.max(0, content.scrollHeight - containerHeight);
        targetTop = Math.max(0, Math.min(targetTop, maxScroll));

        if (immediate) {
            content.scrollTop = targetTop;
            this.lastFullscreenScrollTime = Date.now();
            this.lastFullscreenScrollIndex = index;
            return;
        }

        // Skip if already at position
        if (Math.abs(content.scrollTop - targetTop) < 5) return;

        // Throttle smooth scrolls to max once per 300ms to avoid overwhelming mobile browsers
        const now = Date.now();
        if (this.lastFullscreenScrollTime && (now - this.lastFullscreenScrollTime) < 300 && this.lastFullscreenScrollIndex === index) {
            return;
        }

        this.lastFullscreenScrollTime = now;
        this.lastFullscreenScrollIndex = index;
        content.scrollTop = targetTop; // Use immediate scroll instead of smooth on mobile
    }

    highlightFullscreenWords(segmentIndex, currentTime) {
        if (!this.fullscreenLyricElements || segmentIndex < 0 || segmentIndex >= this.fullscreenLyricElements.length) return;

        const line = this.fullscreenLyricElements[segmentIndex];
        if (!line) return;

        const wordSpans = line.querySelectorAll('.fs-lyrics-word');

        wordSpans.forEach((wordSpan) => {
            const wordStart = parseFloat(wordSpan.dataset.start);
            const wordEnd = parseFloat(wordSpan.dataset.end);

            // Clear previous states
            wordSpan.classList.remove('word-future', 'word-current', 'word-past');
            wordSpan.style.background = '';
            wordSpan.style.webkitBackgroundClip = '';
            wordSpan.style.backgroundClip = '';
            wordSpan.style.webkitTextFillColor = '';

            if (isNaN(wordStart) || isNaN(wordEnd)) return;

            if (currentTime < wordStart) {
                // Future word
                wordSpan.classList.add('word-future');
            } else if (currentTime >= wordStart && currentTime <= wordEnd) {
                // Current word - gradient fill effect (like desktop)
                wordSpan.classList.add('word-current');
                const duration = wordEnd - wordStart;
                if (duration > 0) {
                    const progress = (currentTime - wordStart) / duration;
                    const fillPercent = Math.min(100, Math.max(0, progress * 100));
                    wordSpan.style.background = `linear-gradient(to right, var(--mobile-primary) ${fillPercent}%, rgba(255, 255, 255, 0.6) ${fillPercent}%)`;
                    wordSpan.style.webkitBackgroundClip = 'text';
                    wordSpan.style.backgroundClip = 'text';
                    wordSpan.style.webkitTextFillColor = 'transparent';
                }
            } else {
                // Past word - fully highlighted
                wordSpan.classList.add('word-past');
                wordSpan.style.background = 'var(--mobile-primary)';
                wordSpan.style.webkitBackgroundClip = 'text';
                wordSpan.style.backgroundClip = 'text';
                wordSpan.style.webkitTextFillColor = 'transparent';
            }
        });
    }

    updateFullscreenLyrics() {
        try {
            if (!this.fullscreenLyricsOpen || !this.fullscreenLyricElements || this.fullscreenLyricElements.length === 0) return;

            // Update line states
            this.applyFullscreenLyricStates(this.activeLyricIndex);

            // Highlight words in current line
            if (this.activeLyricIndex >= 0) {
                this.highlightFullscreenWords(this.activeLyricIndex, this.currentTime);
            }

            // Scroll to active line
            this.scrollToFullscreenLyric(this.activeLyricIndex);
        } catch (err) {
            console.error('[updateFullscreenLyrics] Error:', err);
        }
    }

    applyFullscreenLyricsScale(scale) {
        const content = document.getElementById('fullscreen-lyrics-content');
        if (!content) return;

        const clamped = Math.min(1.6, Math.max(0.8, scale || 1));

        content.style.setProperty('transform', `scale(${clamped})`, 'important');
        content.style.setProperty('transform-origin', 'top left', 'important');

        // Update size display
        const sizeValue = document.getElementById('fullscreenLyricsSizeValue');
        if (sizeValue) {
            sizeValue.textContent = clamped.toFixed(1) + 'x';
        }

        // Refocus on active line
        if (this.activeLyricIndex >= 0) {
            setTimeout(() => this.scrollToFullscreenLyric(this.activeLyricIndex, true), 100);
        }
    }

    initFullscreenLyricsControls() {
        const playBtn = document.getElementById('fullscreenLyricsPlayBtn');
        const stopBtn = document.getElementById('fullscreenLyricsStopBtn');
        const tempoSlider = document.getElementById('fullscreenLyricsTempoSlider');
        const pitchSlider = document.getElementById('fullscreenLyricsPitchSlider');

        if (playBtn) {
            playBtn.addEventListener('click', () => this.togglePlayback());
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stop());
        }

        if (tempoSlider) {
            tempoSlider.addEventListener('input', (e) => {
                const targetBPM = parseInt(e.target.value);
                const originalBPM = this.originalBPM || 120;
                const ratio = targetBPM / originalBPM;
                if (isFinite(ratio) && ratio > 0) {
                    this.setTempo(ratio);
                    this.syncPopupControlsState();
                }
            });
        }

        if (pitchSlider) {
            pitchSlider.addEventListener('input', (e) => {
                const pitch = parseInt(e.target.value);
                this.syncPitchValue(pitch);
                this.setPitch(pitch);
                this.syncPopupControlsState();
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('[MobileApp] DOM ready');
    window.mobileApp = new MobileApp();
});
const QUALITY_TO_SUFFIX = {
    major: 'major',
    minor: 'minor',
    dom7: '7',
    maj7: 'maj7',
    maj9: 'maj9',
    maj11: 'maj11',
    maj13: 'maj13',
    mmaj7: 'mmaj7',
    m7: 'm7',
    m9: 'm9',
    m11: 'm11',
    m13: 'm13',
    m7b5: 'm7b5',
    m6: 'm6',
    m6add9: 'm6add9',
    add9: 'add9',
    madd9: 'madd9',
    '6': '6',
    '6add9': '6add9',
    '5': '5',
    '9': '9',
    '11': '11',
    '13': '13',
    sus2: 'sus2',
    sus4: 'sus4',
    sus2sus4: 'sus2sus4',
    aug: 'aug',
    dim: 'dim',
    dim7: 'dim7'
};

const CHORD_QUALITY_MAP = [
    { match: /^maj13/, key: 'maj13' },
    { match: /^maj11/, key: 'maj11' },
    { match: /^maj7(add)?11/, key: 'maj11' },
    { match: /^maj9/, key: 'maj9' },
    { match: /^maj7(add)?9/, key: 'maj9' },
    { match: /^maj7sus/, key: 'sus4' },
    { match: /^maj7/, key: 'maj7' },
    { match: /^ma7/, key: 'maj7' },
    { match: /^Δ7/, key: 'maj7' },
    { match: /^maj6/, key: '6' },
    { match: /^majb5/, key: 'major' },
    { match: /^maj/, key: 'major' },
    { match: /^mmaj7/, key: 'mmaj7' },
    { match: /^m13/, key: 'm13' },
    { match: /^m11/, key: 'm11' },
    { match: /^m9/, key: 'm9' },
    { match: /^m7b5/, key: 'm7b5' },
    { match: /^m7/, key: 'm7' },
    { match: /^-7/, key: 'm7' },
    { match: /^min7/, key: 'm7' },
    { match: /^m6add9/, key: 'm6add9' },
    { match: /^m6/, key: 'm6' },
    { match: /^madd9/, key: 'madd9' },
    { match: /^minor/, key: 'minor' },
    { match: /^min/, key: 'minor' },
    { match: /^m/, key: 'minor' },
    { match: /^sus2sus4/, key: 'sus2sus4' },
    { match: /^sus2/, key: 'sus2' },
    { match: /^sus4/, key: 'sus4' },
    { match: /^7sus4/, key: 'sus4' },
    { match: /^7sus2/, key: 'sus2' },
    { match: /^7sus/, key: 'sus4' },
    { match: /^7#9b5/, key: 'dom7' },
    { match: /^7#9/, key: 'dom7' },
    { match: /^7b5/, key: 'dom7' },
    { match: /^7#5/, key: 'dom7' },
    { match: /^7/, key: 'dom7' },
    { match: /^6add9/, key: '6add9' },
    { match: /^6/, key: '6' },
    { match: /^add9/, key: 'add9' },
    { match: /^9/, key: '9' },
    { match: /^11/, key: '11' },
    { match: /^13/, key: '13' },
    { match: /^aug/, key: 'aug' },
    { match: /^dim7/, key: 'dim7' },
    { match: /^dim/, key: 'dim' },
    { match: /^°/, key: 'dim' },
    { match: /^ø/, key: 'm7b5' },
    { match: /^5/, key: '5' }
];

function readCssVariable(varName, fallback) {
    try {
        const value = getComputedStyle(document.documentElement).getPropertyValue(varName);
        return value && value.trim() ? value.trim() : fallback;
    } catch (err) {
        return fallback;
    }
}

class GuitarDiagramSettings {
    constructor() {
        const text = readCssVariable('--mobile-text', '#f5f5f5');
        const secondary = readCssVariable('--mobile-text-secondary', '#b5b5b5');
        const accent = readCssVariable('--mobile-primary', '#5ce1a5');
        const border = readCssVariable('--mobile-border', 'rgba(255,255,255,0.2)');

        this.stringSpace = 52;
        this.fretSpace = 56;
        this.fontFamily = 'Inter, "SF Pro Display", "Segoe UI", sans-serif';
        this.fingering = {
            color: '#04150d',
            margin: 1.5,
            size: 16,
            visible: true
        };
        this.dot = {
            radius: 14,
            borderWidth: 2,
            fillColor: accent,
            strokeColor: accent,
            openStringRadius: 7
        };
        this.neck = {
            useRoman: true,
            color: 'rgba(255,255,255,0.02)',
            nut: {
                color: text,
                visible: true,
                width: 3.2
            },
            grid: {
                color: border,
                width: 1.2,
                visible: true
            },
            stringName: {
                color: secondary,
                size: 15,
                margin: 8,
                visible: true
            },
            baseFret: {
                color: secondary,
                size: 17,
                margin: 14,
                visible: true
            },
            stringInfo: {
                color: secondary,
                size: 15,
                margin: 6,
                visible: true
            }
        };
    }
}

class GuitarChordDiagram {
    constructor(data = {}) {
        this.frets = Array.isArray(data.frets) ? data.frets.slice(0, 6) : [];
        this.fingers = Array.isArray(data.fingers) ? data.fingers.slice(0, 6) : [];
        this.baseFret = Number.isFinite(data.baseFret) && data.baseFret > 0 ? data.baseFret : 1;
        while (this.frets.length < 6) this.frets.push(0);
        while (this.fingers.length < 6) this.fingers.push(0);
    }

    getBarres() {
        const barres = [];
        if (!this.fingers.some(f => f > 0)) return barres;

        const dots = this.frets.map((fret, idx) => [fret, this.fingers[idx]]);
        const uniqueFrets = this.frets
            .filter((value, index, self) => value > 0 && self.indexOf(value) === index)
            .sort((a, b) => a - b);

        uniqueFrets.forEach(fret => {
            for (let index = 0; index < dots.length; index++) {
                const dot = dots[index];
                if (dot[0] !== fret) continue;
                const startString = index;
                const finger = dot[1];
                let total = 1;
                while (++index < dots.length && (dots[index][0] >= fret || dots[index][0] === -1)) {
                    if (dots[index][0] === fret) {
                        if (dots[index][1] !== finger) continue;
                        total++;
                    }
                }
                if (total > 1) {
                    barres.push({
                        fret,
                        startString,
                        endString: index - 1
                    });
                }
            }
        });

        return barres;
    }
}

class GuitarDiagramHelper {
    static createSVG(name, attrs = {}, dash = false) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', name);
        Object.keys(attrs).forEach(key => {
            if (attrs[key] === undefined || attrs[key] === null) return;
            const attrName = dash ? key.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) : key;
            node.setAttribute(attrName, attrs[key].toString());
        });
        return node;
    }

    static appendText(node, value) {
        node.appendChild(document.createTextNode(value));
        return node;
    }
}

class GuitarDiagramBuilder {
    constructor() {
        this.settings = new GuitarDiagramSettings();
        this.instrument = {
            stringsCount: 6,
            fretsOnDiagram: 5,
            name: 'Guitar',
            tuning: ['E', 'A', 'D', 'G', 'B', 'E']
        };
    }

    build(chordData, options = {}) {
        const chord = chordData instanceof GuitarChordDiagram ? chordData : new GuitarChordDiagram(chordData);
        const rows = Number.isFinite(options.rows) ? Math.max(4, Math.min(6, options.rows)) : this.instrument.fretsOnDiagram;
        return this.buildSvg(chord, rows);
    }

    buildSvg(chord, fretsOnChord) {
        const settings = this.settings;
        const stringsCount = this.instrument.stringsCount;
        const baseFret = chord.baseFret > 0 ? chord.baseFret : 1;

        const stringsWidth = (stringsCount - 1) * settings.stringSpace;
        const fretsHeight = fretsOnChord * settings.fretSpace;
        const hasStringNames = !!settings.neck.stringName.visible;

        const horizontalPad = Math.max(14, settings.stringSpace * 0.65);
        const topPad = Math.max(28, settings.fretSpace * 0.9);
        const bottomExtra = hasStringNames
            ? settings.neck.stringName.margin + settings.neck.stringName.size + settings.stringSpace * 0.2
            : 20;
        const bottomPad = Math.max(32, settings.fretSpace) + bottomExtra;

        const viewBoxWidth = stringsWidth + horizontalPad * 2;
        const viewBoxHeight = fretsHeight + topPad + bottomPad;
        const translateX = horizontalPad;
        const translateY = topPad;

        const svg = GuitarDiagramHelper.createSVG('svg', {
            class: 'chordproject-diagram',
            width: '100%',
            'font-family': settings.fontFamily,
            preserveAspectRatio: 'xMidYMid meet',
            viewBox: `0 0 ${viewBoxWidth} ${viewBoxHeight}`
        });

        const root = GuitarDiagramHelper.createSVG('g', { transform: `translate(${translateX}, ${translateY})` });

        root.appendChild(this.buildNeck(stringsCount, fretsOnChord, baseFret));

        const barres = chord.getBarres();
        if (barres.length) {
            barres.forEach(barre => root.appendChild(this.buildBarre(barre)));
        }

        this.buildDots(chord).forEach(dot => root.appendChild(dot));

        svg.appendChild(root);
        return svg;
    }

    buildNeck(stringsCount, fretsOnChord, baseFret) {
        const s = this.settings;
        const group = GuitarDiagramHelper.createSVG('g', { class: 'neck' });
        const width = s.stringSpace * (stringsCount - 1);
        const height = s.fretSpace * fretsOnChord;

        group.appendChild(GuitarDiagramHelper.createSVG('rect', {
            x: 0,
            y: 0,
            width,
            height,
            fill: s.neck.color
        }));

        const path = this.getNeckPath(stringsCount, fretsOnChord);
        group.appendChild(GuitarDiagramHelper.createSVG('path', {
            stroke: s.neck.grid.visible ? s.neck.grid.color : 'transparent',
            strokeWidth: s.neck.grid.width,
            strokeLinecap: 'square',
            d: path
        }));

        if (baseFret === 1) {
            group.appendChild(GuitarDiagramHelper.createSVG('path', {
                stroke: s.neck.nut.color,
                strokeWidth: s.neck.nut.width,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                d: `M 0 ${-s.neck.nut.width / 2} H ${(stringsCount - 1) * s.stringSpace}`
            }));
        } else if (s.neck.baseFret.visible) {
            const text = GuitarDiagramHelper.createSVG('text', {
                fontSize: s.neck.baseFret.size,
                fill: s.neck.baseFret.color,
                dominantBaseline: 'middle',
                textAnchor: 'end',
                x: -(s.neck.baseFret.margin + (s.stringSpace * 0.4)),
                y: s.fretSpace / 2
            });
            group.appendChild(GuitarDiagramHelper.appendText(text, this.getBaseFretText(baseFret)));
        }

        if (s.neck.stringName.visible) {
            const tuningGroup = GuitarDiagramHelper.createSVG('g');
            this.instrument.tuning.forEach((note, index) => {
                const text = GuitarDiagramHelper.createSVG('text', {
                    textAnchor: 'middle',
                    dominantBaseline: 'hanging',
                    fontSize: s.neck.stringName.size,
                    fill: s.neck.stringName.color,
                    x: index * s.stringSpace,
                    y: fretsOnChord * s.fretSpace + s.neck.stringName.margin
                });
                tuningGroup.appendChild(GuitarDiagramHelper.appendText(text, note));
            });
            group.appendChild(tuningGroup);
        }

        return group;
    }

    buildDots(chord) {
        const hasNut = chord.baseFret === 1;
        return chord.frets.map((value, index) => this.buildDot(index, value, chord.fingers[index] || 0, hasNut));
    }

    buildDot(index, fret, finger, hasNut) {
        const s = this.settings;
        const cx = index * s.stringSpace;
        const cy = fret * s.fretSpace - s.fretSpace / 2;

        if (fret === -1) {
            const text = GuitarDiagramHelper.createSVG('text', {
                fontSize: s.neck.stringInfo.size,
                fill: s.neck.stringInfo.color,
                textAnchor: 'middle',
                dominantBaseline: 'auto',
                x: cx,
                y: hasNut ? -s.neck.nut.width - s.neck.stringInfo.margin : -s.neck.stringInfo.margin
            }, true);
            return GuitarDiagramHelper.appendText(text, 'X');
        }

        if (fret === 0) {
            const circle = GuitarDiagramHelper.createSVG('circle', {
                fill: 'transparent',
                strokeWidth: s.dot.borderWidth,
                stroke: s.dot.strokeColor,
                cx,
                cy: hasNut
                    ? -s.neck.nut.width - s.neck.stringInfo.margin - s.dot.openStringRadius
                    : -s.neck.stringInfo.margin - s.dot.openStringRadius,
                r: s.dot.openStringRadius
            });
            return circle;
        }

        const group = GuitarDiagramHelper.createSVG('g');
        const circleElement = GuitarDiagramHelper.createSVG('circle', {
            fill: s.dot.fillColor,
            strokeWidth: s.dot.borderWidth,
            stroke: s.dot.strokeColor,
            cx,
            cy,
            r: s.dot.radius
        });
        group.appendChild(circleElement);

        if (finger > 0 && this.settings.fingering.visible) {
            const text = GuitarDiagramHelper.createSVG('text', {
                fill: this.settings.fingering.color,
                fontSize: this.settings.fingering.size,
                textAnchor: 'middle',
                dominantBaseline: 'central',
                alignmentBaseline: 'central',
                x: cx,
                y: cy
            }, true);
            text.setAttribute('font-weight', '600');
            group.appendChild(GuitarDiagramHelper.appendText(text, finger.toString()));
        }

        return group;
    }

    buildBarre(barreData) {
        const s = this.settings;
        const span = Math.max(1, barreData.endString - barreData.startString);
        const rectX = barreData.startString * s.stringSpace;
        const rectY = barreData.fret * s.fretSpace - s.fretSpace / 2 - s.dot.radius;
        return GuitarDiagramHelper.createSVG('rect', {
            x: rectX,
            y: rectY,
            width: span * s.stringSpace + s.dot.radius,
            height: s.dot.radius * 2,
            fill: s.dot.fillColor,
            rx: s.dot.radius,
            ry: s.dot.radius / 1.5,
            opacity: 0.9
        });
    }

    getBaseFretText(baseFret) {
        if (!this.settings.neck.useRoman) {
            return `${baseFret}fr`;
        }
        const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
        return roman[baseFret - 1] || `${baseFret}fr`;
    }

    getNeckPath(stringsCount, fretsOnChord) {
        const horizontal = Array.from({ length: fretsOnChord + 1 }, (_, pos) =>
            `M 0 ${pos * this.settings.fretSpace} H ${(stringsCount - 1) * this.settings.stringSpace}`
        ).join(' ');
        const vertical = Array.from({ length: stringsCount }, (_, pos) =>
            `M ${pos * this.settings.stringSpace} 0 V ${fretsOnChord * this.settings.fretSpace}`
        ).join(' ');
        return `${horizontal} ${vertical}`;
    }
}
