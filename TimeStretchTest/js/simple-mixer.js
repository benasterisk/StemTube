/**
 * Simple Mixer for TimeStretch Testing
 * Test environment for B.B. King stems
 */

class SimpleMixer {
    constructor() {
        this.audioContext = null;
        this.stems = {};
        this.isPlaying = false;
        this.currentTempo = 100; // Percentage
        this.masterVolume = 0.5;
        this.startTime = 0;
        this.pauseTime = 0;
        
        this.stemNames = ['vocals', 'drums', 'bass', 'other'];
        
        this.init();
    }
    
    async init() {
        this.log('Initializing SimpleMixer...');
        
        // Initialize audio context
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.log('AudioContext created successfully');
        } catch (error) {
            this.log('Error creating AudioContext: ' + error.message);
            return;
        }
        
        // Create master gain node
        this.masterGainNode = this.audioContext.createGain();
        this.masterGainNode.gain.value = this.masterVolume;
        this.masterGainNode.connect(this.audioContext.destination);
        
        // Load stems
        await this.loadStems();
        
        // Setup UI
        this.setupUI();
        
        this.log('SimpleMixer initialized successfully');
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
    
    createStemNodes() {
        for (const [stemName, stem] of Object.entries(this.stems)) {
            if (!stem.buffer) continue;
            
            // Create new source
            stem.source = this.audioContext.createBufferSource();
            stem.source.buffer = stem.buffer;
            
            // TEMPO CONTROL: Apply only tempo via playbackRate
            const tempoRatio = this.currentTempo / 100;
            stem.source.playbackRate.value = tempoRatio;
            
            // Create gain node
            stem.gainNode = this.audioContext.createGain();
            stem.gainNode.gain.value = stem.muted ? 0 : stem.volume;
            
            // Connect: source -> gain -> master -> destination
            stem.source.connect(stem.gainNode);
            stem.gainNode.connect(this.masterGainNode);
            
            // Handle end of playback
            stem.source.onended = () => {
                if (this.isPlaying) {
                    this.stop();
                }
            };
        }
    }
    
    play() {
        if (this.isPlaying) return;
        
        this.log(`Starting playback at tempo ${this.currentTempo}%`);
        
        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        // Create new nodes
        this.createStemNodes();
        
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
        
        // Calculate current position
        const elapsed = (this.audioContext.currentTime - this.startTime) * (this.currentTempo / 100);
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
    window.mixer = new SimpleMixer();
});