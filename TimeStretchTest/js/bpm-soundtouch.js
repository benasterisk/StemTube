/**
 * BPM-Based SoundTouch Implementation
 * Uses BPM detection and BPM-based tempo control instead of percentages
 */

import { BPMDetector } from './bpm-detector.js';

class BPMSoundTouchMixer {
    constructor() {
        this.audioContext = null;
        this.stems = {};
        this.isPlaying = false;
        this.originalBPM = 105; // Will be detected or set
        this.currentBPM = 105;   // Current target BPM
        this.masterVolume = 0.5;
        this.startTime = 0;
        this.pauseTime = 0;
        
        this.stemNames = ['vocals', 'drums', 'bass', 'other'];
        this.workletLoaded = false;
        this.bpmDetector = null;
        this.bpmDetected = false;
        
        this.init();
    }
    
    async init() {
        this.log('Initializing BPM SoundTouch Mixer...');
        
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.log('AudioContext created successfully');
            
            // Initialize BPM detector
            this.bpmDetector = new BPMDetector(this.audioContext);
            
            // Load the SoundTouch AudioWorklet
            await this.loadSoundTouchWorklet();
            
            // Create master gain node
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.gain.value = this.masterVolume;
            this.masterGainNode.connect(this.audioContext.destination);
            
            // Load stems and detect BPM
            await this.loadStems();
            
            // Setup UI
            this.setupUI();
            
            this.log('BPM SoundTouch Mixer initialized successfully');
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
        
        let firstStemBuffer = null;
        
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
                
                // Use first stem for BPM detection
                if (!firstStemBuffer) {
                    firstStemBuffer = audioBuffer;
                }
                
                this.log(`Loaded ${stemName}: ${audioBuffer.duration.toFixed(2)}s`);
            } catch (error) {
                this.log(`Error loading ${stemName}: ${error.message}`);
            }
        }
        
        // Detect BPM from first stem
        if (firstStemBuffer && this.bpmDetector) {
            try {
                this.originalBPM = await this.bpmDetector.detectBPMFromBuffer(firstStemBuffer);
                this.currentBPM = this.originalBPM;
                this.bpmDetected = true;
                this.log(`BPM detected: ${this.originalBPM} BPM`);
            } catch (error) {
                this.log(`BPM detection failed: ${error.message}`);
                // Use known BPM for B.B. King track
                this.originalBPM = this.bpmDetector.getKnownBPM('bb_king_thrill_gone_tracy');
                this.currentBPM = this.originalBPM;
                this.log(`Using known BPM: ${this.originalBPM} BPM`);
            }
        }
        
        this.log(`Loaded ${Object.keys(this.stems).length} stems | Original BPM: ${this.originalBPM}`);
    }
    
    setupUI() {
        // Transport controls
        document.getElementById('play-btn').addEventListener('click', () => this.play());
        document.getElementById('pause-btn').addEventListener('click', () => this.pause());
        document.getElementById('stop-btn').addEventListener('click', () => this.stop());
        
        // BPM controls
        document.getElementById('bpm-up').addEventListener('click', () => this.adjustBPM(1));
        document.getElementById('bpm-down').addEventListener('click', () => this.adjustBPM(-1));
        document.getElementById('bpm-up-5').addEventListener('click', () => this.adjustBPM(5));
        document.getElementById('bpm-down-5').addEventListener('click', () => this.adjustBPM(-5));
        document.getElementById('bpm-reset').addEventListener('click', () => this.resetBPM());
        
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
                        
                        // Calculate tempo ratio from BPM
                        const tempoRatio = this.currentBPM / this.originalBPM;
                        
                        // Set parameters
                        stem.soundTouchNode.parameters.get('tempo').value = tempoRatio;
                        stem.soundTouchNode.parameters.get('pitch').value = 1.0; // Keep pitch unchanged
                        stem.soundTouchNode.parameters.get('rate').value = 1.0;
                        
                        // Connect: source -> soundtouch -> gain -> master
                        stem.source.connect(stem.soundTouchNode);
                        stem.soundTouchNode.connect(stem.gainNode);
                        stem.gainNode.connect(this.masterGainNode);
                        
                        this.log(`Using SoundTouch for ${stemName} (${this.currentBPM} BPM, ratio: ${tempoRatio.toFixed(3)})`);
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
        const tempoRatio = this.currentBPM / this.originalBPM;
        stem.source.playbackRate.value = tempoRatio;
        
        // Connect: source -> gain -> master
        stem.source.connect(stem.gainNode);
        stem.gainNode.connect(this.masterGainNode);
        
        this.log(`Using playbackRate fallback for ${Object.keys(this.stems).find(k => this.stems[k] === stem)} (${this.currentBPM} BPM)`);
    }
    
    async play() {
        if (this.isPlaying) return;
        
        this.log(`Starting playback at ${this.currentBPM} BPM (SoundTouch: ${this.workletLoaded})`);
        
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
    
    adjustBPM(deltaBPM) {
        const newBPM = Math.max(50, Math.min(300, this.currentBPM + deltaBPM));
        
        if (newBPM === this.currentBPM) return;
        
        this.log(`Adjusting BPM from ${this.currentBPM} to ${newBPM} (${deltaBPM >= 0 ? '+' : ''}${deltaBPM})`);
        this.currentBPM = newBPM;
        
        // Update SoundTouch parameters in real-time if playing
        if (this.isPlaying && this.workletLoaded) {
            const tempoRatio = this.currentBPM / this.originalBPM;
            for (const [stemName, stem] of Object.entries(this.stems)) {
                if (stem.soundTouchNode) {
                    stem.soundTouchNode.parameters.get('tempo').value = tempoRatio;
                    this.log(`Updated ${stemName} to ${newBPM} BPM (ratio: ${tempoRatio.toFixed(3)})`);
                }
            }
        } else if (this.isPlaying) {
            // For fallback mode, restart playback
            this.pause();
            this.play();
        }
        
        this.updateUI();
    }
    
    resetBPM() {
        this.log(`Resetting BPM to original: ${this.originalBPM}`);
        this.currentBPM = this.originalBPM;
        
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
        // Update BPM displays
        document.getElementById('current-bpm').textContent = this.currentBPM;
        document.getElementById('original-bpm').textContent = this.originalBPM;
        
        // Calculate and display percentage
        const percentage = ((this.currentBPM / this.originalBPM) * 100).toFixed(1);
        document.getElementById('bpm-percentage').textContent = `${percentage}%`;
        
        // Calculate and display tempo ratio
        const ratio = (this.currentBPM / this.originalBPM).toFixed(3);
        document.getElementById('tempo-ratio').textContent = `×${ratio}`;
        
        // Update transport buttons
        document.getElementById('play-btn').disabled = this.isPlaying;
        document.getElementById('pause-btn').disabled = !this.isPlaying;
        
        // Update BPM control buttons
        document.getElementById('bpm-up').disabled = this.currentBPM >= 300;
        document.getElementById('bpm-down').disabled = this.currentBPM <= 50;
        document.getElementById('bpm-up-5').disabled = this.currentBPM >= 296;
        document.getElementById('bpm-down-5').disabled = this.currentBPM <= 54;
        
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
    window.mixer = new BPMSoundTouchMixer();
});