/**
 * Real SoundTouch Implementation
 * Uses the official @soundtouchjs/audio-worklet package
 */

class RealSoundTouchMixer {
    constructor() {
        this.audioContext = null;
        this.stems = {};
        this.isPlaying = false;
        this.currentTempo = 1.0; // Ratio (1.0 = 100%)
        this.masterVolume = 0.5;
        this.startTime = 0;
        this.pauseTime = 0;
        
        this.stemNames = ['vocals', 'drums', 'bass', 'other'];
        this.workletLoaded = false;
        
        this.init();
    }
    
    async init() {
        this.log('Initializing Real SoundTouch Mixer...');
        
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.log('AudioContext created successfully');
            
            // Load the SoundTouch AudioWorklet
            await this.loadSoundTouchWorklet();
            
            // Create master gain node
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.gain.value = this.masterVolume;
            this.masterGainNode.connect(this.audioContext.destination);
            
            // Load stems
            await this.loadStems();
            
            // Setup UI
            this.setupUI();
            
            this.log('Real SoundTouch Mixer initialized successfully');
        } catch (error) {
            this.log('Initialization error: ' + error.message);
            // Try fallback without SoundTouch
            await this.initFallback();
        }
    }
    
    async loadSoundTouchWorklet() {
        this.log('Loading SoundTouch AudioWorklet...');
        
        try {
            // Load the AudioWorklet module
            await this.audioContext.audioWorklet.addModule('wasm/soundtouch-worklet.js');
            
            this.workletLoaded = true;
            this.log('SoundTouch AudioWorklet loaded successfully');
        } catch (error) {
            this.log('Failed to load SoundTouch AudioWorklet: ' + error.message);
            throw error;
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
                    soundTouchNode: null,
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
                
                // Create gain node
                stem.gainNode = this.audioContext.createGain();
                stem.gainNode.gain.value = stem.muted ? 0 : stem.volume;
                
                if (this.workletLoaded) {
                    try {
                        // Create SoundTouch AudioWorklet node
                        stem.soundTouchNode = new AudioWorkletNode(this.audioContext, 'soundtouch-processor', {
                            numberOfInputs: 1,
                            numberOfOutputs: 1,
                            channelCount: 2, // Stereo
                            channelCountMode: 'explicit',
                            channelInterpretation: 'speakers'
                        });
                        
                        // Set initial parameters
                        stem.soundTouchNode.parameters.get('tempo').value = this.currentTempo;
                        stem.soundTouchNode.parameters.get('pitch').value = 1.0; // Keep pitch unchanged
                        stem.soundTouchNode.parameters.get('rate').value = 1.0;
                        
                        // Connect: source -> soundtouch -> gain -> master
                        stem.source.connect(stem.soundTouchNode);
                        stem.soundTouchNode.connect(stem.gainNode);
                        stem.gainNode.connect(this.masterGainNode);
                        
                        this.log(`Using Real SoundTouch for ${stemName} (tempo: ${this.currentTempo})`);
                    } catch (stError) {
                        this.log(`SoundTouch failed for ${stemName}: ${stError.message}, using fallback`);
                        this.connectFallback(stem);
                    }
                } else {
                    this.connectFallback(stem);
                }
                
                // Handle end of playback
                stem.source.onended = () => {
                    if (this.isPlaying) {
                        this.stop();
                    }
                };
                
            } catch (error) {
                this.log(`Error creating nodes for ${stemName}: ${error.message}`);
            }
        }
    }
    
    connectFallback(stem) {
        // Fallback: use playbackRate (tempo affects pitch)
        const tempoPercentage = this.currentTempo * 100;
        stem.source.playbackRate.value = this.currentTempo;
        
        // Connect: source -> gain -> master
        stem.source.connect(stem.gainNode);
        stem.gainNode.connect(this.masterGainNode);
        
        this.log(`Using playbackRate fallback for ${Object.keys(this.stems).find(k => this.stems[k] === stem)} (${tempoPercentage}%)`);
    }
    
    async play() {
        if (this.isPlaying) return;
        
        const tempoPercentage = (this.currentTempo * 100).toFixed(0);
        this.log(`Starting playback at tempo ${tempoPercentage}% (SoundTouch: ${this.workletLoaded})`);
        
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
            if (stem.source && stem.buffer) {
                stem.source.start(this.startTime, offset);
                this.log(`Started playback for ${stemName}`);
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
            if (stem.source) {
                try {
                    stem.source.stop();
                } catch (e) {
                    // Source might already be stopped
                }
                stem.source = null;
            }
            
            if (stem.soundTouchNode) {
                try {
                    stem.soundTouchNode.disconnect();
                } catch (e) {
                    // Ignore disconnect errors
                }
                stem.soundTouchNode = null;
            }
            
            if (stem.gainNode) {
                stem.gainNode = null;
            }
        }
    }
    
    adjustTempo(deltaPercentage) {
        const currentPercentage = this.currentTempo * 100;
        const newPercentage = Math.max(25, Math.min(400, currentPercentage + deltaPercentage));
        const newRatio = newPercentage / 100;
        
        if (Math.abs(newRatio - this.currentTempo) < 0.001) return;
        
        this.log(`Adjusting tempo from ${currentPercentage.toFixed(0)}% to ${newPercentage.toFixed(0)}%`);
        this.currentTempo = newRatio;
        
        // Update SoundTouch parameters in real-time if playing
        if (this.isPlaying && this.workletLoaded) {
            for (const [stemName, stem] of Object.entries(this.stems)) {
                if (stem.soundTouchNode) {
                    stem.soundTouchNode.parameters.get('tempo').value = this.currentTempo;
                    this.log(`Updated ${stemName} tempo to ${newPercentage.toFixed(0)}%`);
                }
            }
        } else if (this.isPlaying) {
            // For fallback mode, restart playback
            this.pause();
            this.play();
        }
        
        this.updateUI();
    }
    
    resetTempo() {
        this.log('Resetting tempo to 100%');
        this.currentTempo = 1.0;
        
        // Update SoundTouch parameters in real-time if playing
        if (this.isPlaying && this.workletLoaded) {
            for (const stem of Object.values(this.stems)) {
                if (stem.soundTouchNode) {
                    stem.soundTouchNode.parameters.get('tempo').value = 1.0;
                }
            }
        } else if (this.isPlaying) {
            // For fallback mode, restart playback
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
        const tempoPercentage = (this.currentTempo * 100).toFixed(0);
        document.getElementById('tempo-value').textContent = tempoPercentage + '%';
        
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
    window.mixer = new RealSoundTouchMixer();
});