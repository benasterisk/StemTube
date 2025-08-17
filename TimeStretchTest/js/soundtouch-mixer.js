/**
 * SoundTouch Mixer for TimeStretch Testing
 * Uses SoundTouch WASM for real time-stretching without pitch change
 */

class SoundTouchMixer {
    constructor() {
        this.audioContext = null;
        this.stems = {};
        this.isPlaying = false;
        this.currentTempo = 100; // Percentage
        this.masterVolume = 0.5;
        this.startTime = 0;
        this.pauseTime = 0;
        
        this.stemNames = ['vocals', 'drums', 'bass', 'other'];
        this.workletLoaded = false;
        this.soundTouchLoaded = false;
        
        this.init();
    }
    
    async init() {
        this.log('Initializing SoundTouchMixer...');
        
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.log('AudioContext created successfully');
            
            // Load SoundTouch library
            await this.loadSoundTouch();
            
            // Load AudioWorklet
            await this.loadAudioWorklet();
            
            // Create master gain node
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.gain.value = this.masterVolume;
            this.masterGainNode.connect(this.audioContext.destination);
            
            // Load stems
            await this.loadStems();
            
            // Setup UI
            this.setupUI();
            
            this.log('SoundTouchMixer initialized successfully');
        } catch (error) {
            this.log('Initialization error: ' + error.message);
        }
    }
    
    async loadSoundTouch() {
        this.log('Loading SoundTouch library...');
        
        try {
            // Load SoundTouch as ES6 module
            const soundTouchModule = await import('./wasm/soundtouch.js');
            
            // Make classes available globally
            window.SoundTouch = soundTouchModule.SoundTouch;
            window.SimpleFilter = soundTouchModule.SimpleFilter;
            window.getWebAudioNode = soundTouchModule.getWebAudioNode;
            
            this.soundTouchLoaded = true;
            this.log('SoundTouch ES6 module loaded successfully');
        } catch (error) {
            this.log('Failed to load SoundTouch: ' + error.message);
            throw error;
        }
    }
    
    async loadAudioWorklet() {
        this.log('Loading AudioWorklet...');
        
        try {
            // Check AudioWorklet support
            if (!this.audioContext.audioWorklet) {
                throw new Error('AudioWorklet not supported');
            }
            
            // Load our custom worklet
            await this.audioContext.audioWorklet.addModule('js/timestretch-worklet.js');
            
            this.workletLoaded = true;
            this.log('AudioWorklet loaded successfully');
        } catch (error) {
            this.log('Failed to load AudioWorklet: ' + error.message);
            throw error;
        }
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
                    workletNode: null,
                    gainNode: null,
                    volume: 1.0,
                    muted: false
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
                
                // Create AudioWorklet node for time-stretching
                if (this.workletLoaded) {
                    stem.workletNode = new AudioWorkletNode(this.audioContext, 'timestretch-processor', {
                        numberOfInputs: 1,
                        numberOfOutputs: 1,
                        channelCount: 1
                    });
                    
                    // Set initial tempo
                    const tempoRatio = this.currentTempo / 100;
                    stem.workletNode.parameters.get('tempo').value = tempoRatio;
                    
                    // Listen for worklet messages
                    stem.workletNode.port.onmessage = (event) => {
                        if (event.data.type === 'log') {
                            this.log(`[${stemName}] ${event.data.message}`);
                        } else if (event.data.type === 'initialized') {
                            this.log(`[${stemName}] Worklet initialized: ${event.data.success}`);
                        }
                    };
                    
                    // Initialize the worklet
                    stem.workletNode.port.postMessage({ type: 'init' });
                } else {
                    this.log(`Warning: No worklet for ${stemName}, using direct connection`);
                }
                
                // Create gain node
                stem.gainNode = this.audioContext.createGain();
                stem.gainNode.gain.value = stem.muted ? 0 : stem.volume;
                
                // Connect audio chain
                if (stem.workletNode) {
                    // source -> worklet -> gain -> master
                    stem.source.connect(stem.workletNode);
                    stem.workletNode.connect(stem.gainNode);
                } else {
                    // Fallback: source -> gain -> master
                    stem.source.connect(stem.gainNode);
                }
                
                stem.gainNode.connect(this.masterGainNode);
                
                // Handle end of playback
                stem.source.onended = () => {
                    if (this.isPlaying) {
                        this.stop();
                    }
                };
                
                this.log(`Created nodes for ${stemName}`);
                
            } catch (error) {
                this.log(`Error creating nodes for ${stemName}: ${error.message}`);
            }
        }
    }
    
    async play() {
        if (this.isPlaying) return;
        
        this.log(`Starting playback with SoundTouch at tempo ${this.currentTempo}%`);
        
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
        for (const stem of Object.values(this.stems)) {
            if (stem.source && stem.buffer) {
                stem.source.start(this.startTime, offset);
            }
        }
        
        this.isPlaying = true;
        this.updateUI();
    }
    
    pause() {
        if (!this.isPlaying) return;
        
        this.log('Pausing playback');
        
        // Calculate current position (no tempo adjustment for pause time)
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
            if (stem.source) {
                try {
                    stem.source.stop();
                } catch (e) {
                    // Source might already be stopped
                }
                stem.source = null;
                stem.workletNode = null;
                stem.gainNode = null;
            }
        }
    }
    
    adjustTempo(delta) {
        const newTempo = Math.max(25, Math.min(400, this.currentTempo + delta));
        
        if (newTempo === this.currentTempo) return;
        
        this.log(`Adjusting tempo from ${this.currentTempo}% to ${newTempo}%`);
        this.currentTempo = newTempo;
        
        // Update worklet tempo in real-time if playing
        if (this.isPlaying) {
            const tempoRatio = newTempo / 100;
            for (const stem of Object.values(this.stems)) {
                if (stem.workletNode) {
                    stem.workletNode.parameters.get('tempo').value = tempoRatio;
                }
            }
        }
        
        this.updateUI();
    }
    
    resetTempo() {
        this.log('Resetting tempo to 100%');
        this.currentTempo = 100;
        
        // Update worklet tempo in real-time if playing
        if (this.isPlaying) {
            for (const stem of Object.values(this.stems)) {
                if (stem.workletNode) {
                    stem.workletNode.parameters.get('tempo').value = 1.0;
                }
            }
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
    window.mixer = new SoundTouchMixer();
});