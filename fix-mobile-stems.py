#!/usr/bin/env python3
"""
Script pour remplacer les fonctions audio de mobile-app.js
avec le vrai système de chargement de 4 stems synchronisés
"""

# Lire le fichier actuel
with open('static/js/mobile-app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Trouver et remplacer loadStemsForIOS
start_marker = "    async loadStemsForIOS(data) {"
end_marker = "    createTrackControl(name) {"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("ERREUR: Marqueurs non trouvés")
    exit(1)

# Nouvelle implémentation loadStemsForIOS
new_load_stems = '''    async loadStemsForIOS(data) {
        console.log('[Mixer] Loading 4 separate stems with Web Audio API');

        const stemNames = ['vocals', 'drums', 'bass', 'other'];
        const tracksContainer = document.getElementById('mobileTracksContainer');
        if (!tracksContainer) {
            console.warn('[Mixer] Missing tracks container');
            return;
        }

        // Parse stems_paths
        let stemsPaths = null;
        if (data.stems_paths) {
            try {
                stemsPaths = typeof data.stems_paths === 'string'
                    ? JSON.parse(data.stems_paths)
                    : data.stems_paths;
                console.log('[Mixer] Parsed stems_paths:', stemsPaths);
            } catch (e) {
                console.error('[Mixer] Failed to parse stems_paths:', e);
                throw new Error('No stems available');
            }
        }

        if (!stemsPaths) {
            throw new Error('No stems paths found');
        }

        // Clean up previous audio
        this.stopPlayback();
        if (this.stemSources) {
            Object.values(this.stemSources).forEach(source => {
                try { source.stop(); } catch(e) {}
            });
        }

        this.stemBuffers = {};
        this.stemGains = {};
        this.stemPans = {};
        this.stemSources = {};
        tracksContainer.innerHTML = '';

        // Initialize audio context if needed
        if (!this.audioContext) {
            await this.unlockAudio();
        }

        // Load all 4 stems in parallel
        const loadPromises = stemNames.map(async (stemName) => {
            const stemPath = stemsPaths[stemName];
            if (!stemPath) {
                console.warn(`[Mixer] No path for ${stemName}`);
                return;
            }

            try {
                console.log(`[Mixer] Loading ${stemName} from ${stemPath}`);

                // Build URL
                const url = this.buildMediaUrl(stemPath);

                // Fetch audio file
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const arrayBuffer = await response.arrayBuffer();

                // Decode audio data
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

                // Store buffer
                this.stemBuffers[stemName] = {
                    buffer: audioBuffer,
                    duration: audioBuffer.duration
                };

                // Create gain node for volume control
                const gainNode = this.audioContext.createGain();
                gainNode.gain.value = 1.0;
                this.stemGains[stemName] = gainNode;

                // Create stereo panner for pan control
                const panNode = this.audioContext.createStereoPanner();
                panNode.pan.value = 0;
                this.stemPans[stemName] = panNode;

                // Connect: (source will be created on play) -> pan -> gain -> master
                panNode.connect(gainNode);
                gainNode.connect(this.masterGainNode);

                // Create track control UI
                this.createTrackControl(stemName);

                console.log(`[Mixer] ✓ ${stemName} loaded: ${audioBuffer.duration.toFixed(2)}s`);

            } catch (error) {
                console.error(`[Mixer] Failed to load ${stemName}:`, error);
            }
        });

        // Wait for all stems to load
        await Promise.all(loadPromises);

        // Set duration from longest stem
        const durations = Object.values(this.stemBuffers).map(s => s.duration);
        this.duration = Math.max(...durations);
        this.currentTime = 0;
        this.updateTimeDisplay();

        console.log(`[Mixer] All stems loaded, duration: ${this.duration.toFixed(2)}s`);
    }

    '''

# Remplacer
new_content = content[:start_idx] + new_load_stems + content[end_idx:]

# Maintenant remplacer playPlayback
play_start = new_content.find("    async playPlayback() {")
play_end = new_content.find("    pausePlayback() {")

new_play = '''    async playPlayback() {
        if (!this.audioContext) {
            console.warn('[Audio] No audio context');
            return;
        }

        if (!this.stemBuffers || Object.keys(this.stemBuffers).length === 0) {
            console.warn('[Audio] No stems loaded');
            return;
        }

        try {
            // Resume context if suspended (iOS)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Stop previous sources
            if (this.stemSources) {
                Object.values(this.stemSources).forEach(source => {
                    try { source.stop(); } catch(e) {}
                });
            }

            this.stemSources = {};

            // Calculate start time in audio context timeline
            const when = this.audioContext.currentTime;
            const offset = this.currentTime;

            // Create and start ALL sources at EXACTLY the same time
            Object.keys(this.stemBuffers).forEach(stemName => {
                const stem = this.stemBuffers[stemName];

                // Create source node
                const sourceNode = this.audioContext.createBufferSource();
                sourceNode.buffer = stem.buffer;

                // Connect: source -> pan -> gain -> master
                sourceNode.connect(this.stemPans[stemName]);

                // Apply mute/solo state
                const effectiveVolume = this.getEffectiveVolume(stemName);
                this.stemGains[stemName].gain.value = effectiveVolume;

                // Start at EXACT same time with offset
                sourceNode.start(when, offset);

                // Store source
                this.stemSources[stemName] = sourceNode;

                // Handle end of playback
                sourceNode.onended = () => {
                    if (this.isPlaying && this.currentTime >= this.duration - 0.1) {
                        this.pausePlayback();
                    }
                };
            });

            this.isPlaying = true;
            this.playbackStartTime = this.audioContext.currentTime - offset;

            // Update UI
            const playBtn = document.getElementById('mobilePlayBtn');
            if (playBtn) {
                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            }

            this.startTimeUpdate();

            console.log(`[Audio] Playing from ${offset.toFixed(2)}s`);

        } catch (error) {
            this.isPlaying = false;
            console.error('[Audio] Playback failed:', error);
        }
    }

    '''

new_content = new_content[:play_start] + new_play + new_content[play_end:]

# Remplacer pausePlayback
pause_start = new_content.find("    pausePlayback() {")
pause_end = new_content.find("    stopPlayback() {")

new_pause = '''    pausePlayback() {
        if (!this.isPlaying) return;

        // Stop all sources
        if (this.stemSources) {
            Object.values(this.stemSources).forEach(source => {
                try { source.stop(); } catch(e) {}
            });
        }

        this.isPlaying = false;
        this.stopTimeUpdate();

        const playBtn = document.getElementById('mobilePlayBtn');
        if (playBtn) {
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
        }

        console.log('[Audio] Paused');
    }

    '''

new_content = new_content[:pause_start] + new_pause + new_content[pause_end:]

# Remplacer startTimeUpdate
time_start = new_content.find("    startTimeUpdate() {")
time_end = new_content.find("    stopTimeUpdate() {")

new_time = '''    startTimeUpdate() {
        if (!this.audioContext) return;

        const update = () => {
            if (this.isPlaying) {
                // Calculate current time from audio context
                this.currentTime = this.audioContext.currentTime - this.playbackStartTime;

                if (this.currentTime >= this.duration) {
                    this.currentTime = this.duration;
                    this.pausePlayback();
                    return;
                }

                this.updateTimeDisplay();
                this.updateProgressBar();
                this.updateActiveLyric();
                this.syncChordPlayhead();

                this.animationFrame = requestAnimationFrame(update);
            }
        };
        update();
    }

    '''

new_content = new_content[:time_start] + new_time + new_content[time_end:]

# Ajouter getEffectiveVolume après applyMixerState
mixer_state_end = new_content.find("        });")
after_mixer = new_content.find("    }", mixer_state_end) + 6

helper_functions = '''

    // Calculate effective volume based on mute/solo
    getEffectiveVolume(stemName) {
        const track = this.tracks[stemName];
        if (!track) return 0;

        let volume = track.volume;

        // Check if muted
        if (track.muted) return 0;

        // Check solo logic
        const hasSolo = Object.values(this.tracks).some(t => t.solo);
        if (hasSolo && !track.solo) return 0;

        return volume;
    }
'''

new_content = new_content[:after_mixer] + helper_functions + new_content[after_mixer:]

# Sauvegarder
with open('static/js/mobile-app.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("✅ Fichier mobile-app.js mis à jour avec succès!")
print("- loadStemsForIOS: Charge 4 stems séparés")
print("- playPlayback: Synchronisation parfaite via audioContext.currentTime")
print("- Contrôles indépendants: GainNode + StereoPanner par stem")
