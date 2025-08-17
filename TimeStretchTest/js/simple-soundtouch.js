/**
 * Simple SoundTouch Implementation
 * Uses SoundTouch directly without AudioWorklet for easier debugging
 */

class SimpleSoundTouchMixer {
    constructor() {
        this.audioContext = null;
        this.stems = {};
        this.isPlaying = false;
        this.currentTempo = 100; // Percentage
        this.masterVolume = 0.5;
        this.startTime = 0;
        this.pauseTime = 0;
        
        this.stemNames = ['vocals', 'drums', 'bass', 'other'];
        this.soundTouchLoaded = false;
        
        this.init();
    }
    
    async init() {
        this.log('Initializing SimpleSoundTouchMixer...');
        
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.log('AudioContext created successfully');
            
            // Load SoundTouch library
            await this.loadSoundTouch();
            
            // Create master gain node
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.gain.value = this.masterVolume;
            this.masterGainNode.connect(this.audioContext.destination);
            
            // Load stems
            await this.loadStems();
            
            // Setup UI
            this.setupUI();
            
            this.log('SimpleSoundTouchMixer initialized successfully');
        } catch (error) {
            this.log('Initialization error: ' + error.message);
            // Try fallback without SoundTouch
            await this.initFallback();
        }
    }
    
    async initFallback() {
        this.log('Initializing fallback mode (no SoundTouch)...');
        
        // Create master gain node if not exists
        if (!this.masterGainNode) {
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.gain.value = this.masterVolume;
            this.masterGainNode.connect(this.audioContext.destination);
        }
        
        // Load stems
        await this.loadStems();
        
        // Setup UI
        this.setupUI();
        
        this.log('Fallback mode initialized (using playbackRate)');
    }
    
    async loadSoundTouch() {
        this.log('Loading SoundTouch library...');
        
        try {
            // Test different loading methods
            let soundTouchModule;
            
            // Method 1: ES6 import
            try {
                soundTouchModule = await import('./wasm/soundtouch.js');
                this.log('Loaded via ES6 import');
            } catch (e1) {
                this.log('ES6 import failed: ' + e1.message);
                
                // Method 2: Dynamic script loading
                try {
                    await this.loadScriptDynamically('./wasm/soundtouch.js');
                    // Check if global variables are available
                    if (window.SoundTouch) {
                        soundTouchModule = {
                            SoundTouch: window.SoundTouch,
                            SimpleFilter: window.SimpleFilter
                        };
                        this.log('Loaded via dynamic script');
                    } else {
                        throw new Error('Global SoundTouch not found');
                    }
                } catch (e2) {
                    this.log('Dynamic script loading failed: ' + e2.message);
                    throw new Error('All loading methods failed');
                }
            }
            
            // Make classes available globally
            if (soundTouchModule.SoundTouch) {
                window.SoundTouch = soundTouchModule.SoundTouch;
                window.SimpleFilter = soundTouchModule.SimpleFilter;
                
                this.soundTouchLoaded = true;
                this.log('SoundTouch loaded and available globally');
            } else {
                throw new Error('SoundTouch classes not found in module');
            }
            
        } catch (error) {
            this.log('Failed to load SoundTouch: ' + error.message);
            throw error;
        }
    }
    
    loadScriptDynamically(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.type = 'module';
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    async loadStems() {
        this.log('Loading stems...');
        
        for (const stemName of this.stemNames) {
            try {
                const response = await fetch(`stems/${stemName}.mp3`);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                
                this.stems[stemName] = {
                    buffer: audioBuffer,
                    source: null,
                    gainNode: null,
                    volume: 1.0,
                    muted: false,
                    soundTouchNode: null
                };
                
                this.log(`Loaded ${stemName}: ${audioBuffer.duration.toFixed(2)}s`);
            } catch (error) {
                this.log(`Error loading ${stemName}: ${error.message}`);
            }
        }
        
        this.log(`Loaded ${Object.keys(this.stems).length} stems`);
    }
    
    setupUI() {
        // Transport controls
        document.getElementById('play-btn').addEventListener('click', () => this.play());
        document.getElementById('pause-btn').addEventListener('click', () => this.pause());
        document.getElementById('stop-btn').addEventListener('click', () => this.stop());
        
        // Tempo controls
        document.getElementById('tempo-up').addEventListener('click', () => this.adjustTempo(5));
        document.getElementById('tempo-down').addEventListener('click', () => this.adjustTempo(-5));
        document.getElementById('tempo-reset').addEventListener('click', () => this.resetTempo());
        
        // Master volume
        const masterVolumeSlider = document.getElementById('master-volume');
        masterVolumeSlider.addEventListener('input', (e) => {
            this.masterVolume = e.target.value / 100;
            this.masterGainNode.gain.value = this.masterVolume;
            document.getElementById('volume-value').textContent = e.target.value + '%';
        });
        
        // Stem controls
        document.querySelectorAll('.mute-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const stemName = e.target.dataset.stem;
                this.toggleMute(stemName);
            });
        });
        
        document.querySelectorAll('.volume-control').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const stemName = e.target.dataset.stem;
                const volume = e.target.value / 100;
                this.setStemVolume(stemName, volume);
            });
        });
        
        this.updateUI();
    }
    
    async createStemNodes() {
        for (const [stemName, stem] of Object.entries(this.stems)) {
            if (!stem.buffer) continue;
            
            try {
                // Create buffer source
                stem.source = this.audioContext.createBufferSource();
                stem.source.buffer = stem.buffer;
                
                // Create gain node
                stem.gainNode = this.audioContext.createGain();
                stem.gainNode.gain.value = stem.muted ? 0 : stem.volume;
                
                if (this.soundTouchLoaded && window.getWebAudioNode) {
                    try {
                        // Try to use SoundTouch
                        const tempoRatio = this.currentTempo / 100;
                        
                        stem.soundTouchNode = window.getWebAudioNode(this.audioContext, stem.buffer);
                        stem.soundTouchNode.tempo = tempoRatio;
                        stem.soundTouchNode.pitch = 1.0; // Keep pitch unchanged
                        
                        // Connect: soundTouch -> gain -> master
                        stem.soundTouchNode.connect(stem.gainNode);
                        stem.gainNode.connect(this.masterGainNode);
                        
                        this.log(`Using SoundTouch for ${stemName}`);
                    } catch (stError) {
                        this.log(`SoundTouch failed for ${stemName}: ${stError.message}, using fallback`);
                        this.connectFallback(stem);
                    }
                } else {
                    this.connectFallback(stem);
                }
                
                // Handle end of playback
                if (stem.source.onended !== undefined) {
                    stem.source.onended = () => {
                        if (this.isPlaying) {
                            this.stop();
                        }
                    };
                }
                
            } catch (error) {
                this.log(`Error creating nodes for ${stemName}: ${error.message}`);
            }
        }
    }
    
    connectFallback(stem) {
        // Fallback: use playbackRate (tempo affects pitch)
        const tempoRatio = this.currentTempo / 100;
        stem.source.playbackRate.value = tempoRatio;
        
        // Connect: source -> gain -> master
        stem.source.connect(stem.gainNode);
        stem.gainNode.connect(this.masterGainNode);
        
        this.log(`Using playbackRate fallback for ${Object.keys(this.stems).find(k => this.stems[k] === stem)}`);
    }
    
    async play() {
        if (this.isPlaying) return;
        
        this.log(`Starting playback at tempo ${this.currentTempo}% (SoundTouch: ${this.soundTouchLoaded})`);
        
        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        // Create new nodes
        await this.createStemNodes();
        
        // Calculate start time
        const offset = this.pauseTime || 0;
        this.startTime = this.audioContext.currentTime;
        
        // Start all stems synchronized
        for (const [stemName, stem] of Object.entries(this.stems)) {
            if (stem.soundTouchNode) {
                // SoundTouch node handles playback automatically
                this.log(`Starting SoundTouch playback for ${stemName}`);
            } else if (stem.source && stem.buffer) {
                stem.source.start(this.startTime, offset);
                this.log(`Starting fallback playback for ${stemName}`);
            }
        }
        
        this.isPlaying = true;
        this.updateUI();
    }
    
    pause() {
        if (!this.isPlaying) return;
        
        this.log('Pausing playback');
        
        // Calculate current position
        const elapsed = this.audioContext.currentTime - this.startTime;
        this.pauseTime = (this.pauseTime || 0) + elapsed;
        
        this.stopAllSources();
        this.isPlaying = false;
        this.updateUI();
    }
    
    stop() {
        this.log('Stopping playback');
        
        this.stopAllSources();
        this.isPlaying = false;
        this.pauseTime = 0;
        this.updateUI();
    }
    
    stopAllSources() {
        for (const stem of Object.values(this.stems)) {
            if (stem.soundTouchNode) {
                try {
                    stem.soundTouchNode.disconnect();
                } catch (e) {
                    // Ignore disconnect errors
                }
                stem.soundTouchNode = null;
            }
            
            if (stem.source) {
                try {
                    stem.source.stop();
                } catch (e) {
                    // Source might already be stopped
                }
                stem.source = null;
            }
            
            if (stem.gainNode) {
                stem.gainNode = null;
            }
        }
    }
    
    adjustTempo(delta) {
        const newTempo = Math.max(25, Math.min(400, this.currentTempo + delta));
        
        if (newTempo === this.currentTempo) return;
        
        this.log(`Adjusting tempo from ${this.currentTempo}% to ${newTempo}%`);
        this.currentTempo = newTempo;
        
        // If playing, restart with new tempo
        if (this.isPlaying) {
            this.pause();
            this.play();
        }
        
        this.updateUI();
    }
    
    resetTempo() {
        this.log('Resetting tempo to 100%');
        this.currentTempo = 100;
        
        if (this.isPlaying) {
            this.pause();
            this.play();
        }
        
        this.updateUI();
    }
    
    toggleMute(stemName) {
        if (!this.stems[stemName]) return;
        
        this.stems[stemName].muted = !this.stems[stemName].muted;
        
        // Update gain if playing
        if (this.stems[stemName].gainNode) {
            this.stems[stemName].gainNode.gain.value = 
                this.stems[stemName].muted ? 0 : this.stems[stemName].volume;
        }
        
        this.updateUI();
        this.log(`${stemName} ${this.stems[stemName].muted ? 'muted' : 'unmuted'}`);
    }
    
    setStemVolume(stemName, volume) {
        if (!this.stems[stemName]) return;
        
        this.stems[stemName].volume = volume;
        
        // Update gain if playing and not muted
        if (this.stems[stemName].gainNode && !this.stems[stemName].muted) {
            this.stems[stemName].gainNode.gain.value = volume;
        }
    }
    
    updateUI() {
        // Update tempo display
        document.getElementById('tempo-value').textContent = this.currentTempo + '%';
        
        // Update transport buttons
        document.getElementById('play-btn').disabled = this.isPlaying;
        document.getElementById('pause-btn').disabled = !this.isPlaying;
        
        // Update mute buttons
        document.querySelectorAll('.mute-btn').forEach(btn => {
            const stemName = btn.dataset.stem;
            if (this.stems[stemName]) {
                btn.textContent = this.stems[stemName].muted ? '🔇' : '🔊';
            }
        });
    }
    
    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        console.log(logMessage);
        
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = logMessage;
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.mixer = new SimpleSoundTouchMixer();
});