/**
 * StemTubes Mixer - Track Controls
 * Gestion des contrôles de piste (volume, panoramique, solo, mute)
 */

class TrackControls {
    /**
     * Constructeur des contrôles de piste
     * @param {StemMixer} mixer - Instance principale du mixeur
     */
    constructor(mixer) {
        this.mixer = mixer;
    }
    
    /**
     * Créer un élément de piste pour un stem
     * @param {string} name - Nom du stem
     */
    createTrackElement(name) {
        // S'assurer que le conteneur de pistes existe
        if (!this.mixer.elements.tracks) {
            this.mixer.log('Conteneur de pistes non trouvé');
            return;
        }
        
        // Créer l'élément de piste
        const trackElement = document.createElement('div');
        trackElement.className = 'track';
        trackElement.dataset.stem = name;
        
        // Ajouter la classe mobile si nécessaire
        if (this.mixer.isMobile) {
            trackElement.classList.add('mobile-track');
        }
        
        // Formater le nom du stem pour l'affichage
        const displayName = name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
        
        // Structure adaptée pour mobile et desktop
        const mobileLayout = this.mixer.isMobile ? `
            <div class="track-header mobile-header">
                <div class="track-title">
                    ${displayName} 
                    <span class="track-status active"></span>
                </div>
            </div>
            <div class="track-controls mobile-controls">
                <div class="button-group">
                    <button class="control-button solo-btn" data-stem="${name}" title="Solo">
                        <i class="fas fa-headphones"></i> Solo
                    </button>
                    <button class="control-button mute-btn" data-stem="${name}" title="Mute">
                        <i class="fas fa-volume-mute"></i> Mute
                    </button>
                </div>
                <div class="control-group">
                    <label class="control-label">
                        Volume: <span class="volume-value">100%</span>
                    </label>
                    <input type="range" class="volume-slider" data-stem="${name}" 
                           min="0" max="1" step="0.01" value="1" 
                           style="width: 100%; height: 35px;">
                </div>
                <div class="control-group">
                    <label class="control-label">
                        Pan: <span class="pan-value">0</span>
                    </label>
                    <input type="range" class="pan-knob" data-stem="${name}" 
                           min="-1" max="1" step="0.01" value="0"
                           style="width: 100%; height: 35px;">
                </div>
            </div>
            <div class="waveform-container">
                <div class="waveform"></div>
                <div class="track-playhead"></div>
            </div>
        ` : `
            <div class="track-header">
                <div class="track-title">
                    ${displayName} 
                    <span class="track-status active"></span>
                </div>
                <div class="track-buttons">
                    <button class="track-btn solo" title="Solo">S</button>
                    <button class="track-btn mute" title="Mute">M</button>
                </div>
                <div class="track-control">
                    <div class="track-control-label">
                        <span>Volume</span>
                        <span class="track-control-value volume-value">100%</span>
                    </div>
                    <input type="range" class="track-slider volume-slider" min="0" max="1" step="0.01" value="1">
                </div>
                <div class="track-control">
                    <div class="track-control-label">
                        <span>Pan</span>
                        <span class="track-control-value pan-value">0</span>
                    </div>
                    <input type="range" class="track-slider pan-knob" min="-1" max="1" step="0.01" value="0">
                </div>
            </div>
            <div class="waveform-container">
                <div class="waveform"></div>
                <div class="track-playhead"></div>
            </div>
        `;
        
        // Structure de l'élément de piste
        trackElement.innerHTML = mobileLayout;
        
        // Ajouter la piste au conteneur
        this.mixer.elements.tracks.appendChild(trackElement);
        
        // Configurer les écouteurs d'événements pour les contrôles
        this.setupTrackEventListeners(name, trackElement);
        
        // Ajouter des gestionnaires d'événements spécifiques mobile
        if (this.mixer.isMobile) {
            this.addMobileTouchHandlers(trackElement, name);
        }
        
        this.mixer.log(`Élément de piste créé pour ${name}`);
    }
    
    /**
     * Configurer les écouteurs d'événements pour les contrôles d'une piste
     * @param {string} name - Nom du stem
     * @param {HTMLElement} trackElement - Élément DOM de la piste
     */
    setupTrackEventListeners(name, trackElement) {
        // Bouton solo
        const soloBtn = trackElement.querySelector('.solo');
        if (soloBtn) {
            soloBtn.addEventListener('click', () => {
                this.toggleSolo(name);
            });
        }
        
        // Bouton mute
        const muteBtn = trackElement.querySelector('.mute');
        if (muteBtn) {
            muteBtn.addEventListener('click', () => {
                this.toggleMute(name);
            });
        }
        
        // Slider de volume
        const volumeSlider = trackElement.querySelector('.volume-slider');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                this.updateVolume(name, parseFloat(e.target.value));
            });
        }
        
        // Slider de panoramique
        const panSlider = trackElement.querySelector('.pan-knob');
        if (panSlider) {
            panSlider.addEventListener('input', (e) => {
                this.updatePan(name, parseFloat(e.target.value));
            });
        }
    }
    
    /**
     * Ajouter des gestionnaires tactiles pour mobile
     * @param {HTMLElement} trackElement - Élément de piste
     * @param {string} name - Nom du stem
     */
    addMobileTouchHandlers(trackElement, name) {
        // Gestionnaires pour les boutons Solo/Mute avec feedback tactile
        const soloBtn = trackElement.querySelector('.solo-btn');
        const muteBtn = trackElement.querySelector('.mute-btn');
        
        if (soloBtn) {
            // Feedback tactile pour Solo
            soloBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                soloBtn.style.transform = 'scale(0.95)';
                soloBtn.style.opacity = '0.8';
            }, { passive: false });
            
            soloBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                soloBtn.style.transform = '';
                soloBtn.style.opacity = '';
                this.toggleSolo(name);
            }, { passive: false });
        }
        
        if (muteBtn) {
            // Feedback tactile pour Mute
            muteBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                muteBtn.style.transform = 'scale(0.95)';
                muteBtn.style.opacity = '0.8';
            }, { passive: false });
            
            muteBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                muteBtn.style.transform = '';
                muteBtn.style.opacity = '';
                this.toggleMute(name);
            }, { passive: false });
        }
        
        // Gestionnaires améliorés pour les sliders sur mobile
        const volumeSlider = trackElement.querySelector('.volume-slider');
        const panSlider = trackElement.querySelector('.pan-knob');
        
        if (volumeSlider) {
            // Meilleure précision tactile pour le volume
            volumeSlider.addEventListener('touchstart', () => {
                volumeSlider.style.height = '40px'; // Augmenter temporairement la taille
            });
            
            volumeSlider.addEventListener('touchend', () => {
                setTimeout(() => {
                    volumeSlider.style.height = '35px';
                }, 200);
            });
        }
        
        if (panSlider) {
            // Meilleure précision tactile pour le pan
            panSlider.addEventListener('touchstart', () => {
                panSlider.style.height = '40px';
            });
            
            panSlider.addEventListener('touchend', () => {
                setTimeout(() => {
                    panSlider.style.height = '35px';
                }, 200);
            });
        }
    }
    
    /**
     * Activer/désactiver le mode solo pour une piste
     * @param {string} name - Nom du stem
     */
    toggleSolo(name) {
        const stem = this.mixer.stems[name];
        if (!stem) return;
        
        // Inverser l'état solo
        stem.solo = !stem.solo;
        
        // Mettre à jour l'apparence du bouton
        const trackElement = document.querySelector(`.track[data-stem="${name}"]`);
        if (trackElement) {
            const soloBtn = trackElement.querySelector('.solo');
            if (soloBtn) {
                if (stem.solo) {
                    soloBtn.classList.add('active');
                } else {
                    soloBtn.classList.remove('active');
                }
            }
        }
        
        // Mettre à jour les états solo/mute
        this.mixer.audioEngine.updateSoloMuteStates();
        
        this.mixer.log(`Solo ${stem.solo ? 'activé' : 'désactivé'} pour ${name}`);
    }
    
    /**
     * Activer/désactiver le mode muet pour une piste
     * @param {string} name - Nom du stem
     */
    toggleMute(name) {
        const stem = this.mixer.stems[name];
        if (!stem) return;
        
        // Inverser l'état muet
        stem.muted = !stem.muted;
        
        // Mettre à jour l'apparence du bouton
        const trackElement = document.querySelector(`.track[data-stem="${name}"]`);
        if (trackElement) {
            const muteBtn = trackElement.querySelector('.mute');
            if (muteBtn) {
                if (stem.muted) {
                    muteBtn.classList.add('active');
                } else {
                    muteBtn.classList.remove('active');
                }
            }
        }
        
        // Mettre à jour les états solo/mute
        this.mixer.audioEngine.updateSoloMuteStates();
        
        this.mixer.log(`Mute ${stem.muted ? 'activé' : 'désactivé'} pour ${name}`);
    }
    
    /**
     * Mettre à jour le volume d'une piste
     * @param {string} name - Nom du stem
     * @param {number} value - Nouvelle valeur de volume (0-1)
     */
    updateVolume(name, value) {
        const stem = this.mixer.stems[name];
        if (!stem) return;
        
        // Mettre à jour la valeur de volume
        stem.volume = value;
        
        // Mettre à jour le gain si la source est active
        if (stem.gainNode) {
            // Ne pas modifier le gain si en mode muet
            if (!stem.muted) {
                stem.gainNode.gain.value = value;
            }
        }
        
        // Mettre à jour l'affichage de la valeur
        const trackElement = document.querySelector(`.track[data-stem="${name}"]`);
        if (trackElement) {
            const volumeValue = trackElement.querySelector('.volume-value');
            if (volumeValue) {
                volumeValue.textContent = `${Math.round(value * 100)}%`;
            }
        }
        
        this.mixer.log(`Volume mis à jour pour ${name}: ${Math.round(value * 100)}%`);
    }
    
    /**
     * Mettre à jour le panoramique d'une piste
     * @param {string} name - Nom du stem
     * @param {number} value - Nouvelle valeur de panoramique (-1 à 1)
     */
    updatePan(name, value) {
        const stem = this.mixer.stems[name];
        if (!stem) return;
        
        // Mettre à jour la valeur de panoramique
        stem.pan = value;
        
        // Mettre à jour le panoramique si la source est active
        if (stem.panNode) {
            stem.panNode.pan.value = value;
        }
        
        // Mettre à jour l'affichage de la valeur
        const trackElement = document.querySelector(`.track[data-stem="${name}"]`);
        if (trackElement) {
            const panValue = trackElement.querySelector('.pan-value');
            if (panValue) {
                // Formater la valeur de panoramique
                let panText = 'C'; // Centre par défaut
                
                if (value < -0.05) {
                    const leftPercent = Math.round(Math.abs(value) * 100);
                    panText = `${leftPercent}%L`;
                } else if (value > 0.05) {
                    const rightPercent = Math.round(value * 100);
                    panText = `${rightPercent}%R`;
                }
                
                panValue.textContent = panText;
            }
        }
        
        this.mixer.log(`Panoramique mis à jour pour ${name}: ${value}`);
    }
    
    /**
     * Mettre à jour l'indicateur d'état d'une piste
     * @param {string} name - Nom du stem
     * @param {boolean} active - État actif de la piste
     */
    updateTrackStatus(name, active) {
        const trackElement = document.querySelector(`.track[data-stem="${name}"]`);
        if (!trackElement) return;
        
        const statusIndicator = trackElement.querySelector('.track-status');
        if (statusIndicator) {
            if (active) {
                statusIndicator.classList.add('active');
                statusIndicator.classList.remove('inactive');
            } else {
                statusIndicator.classList.add('inactive');
                statusIndicator.classList.remove('active');
            }
        }
        
        // Mettre à jour la propriété d'activité du stem
        if (this.mixer.stems[name]) {
            this.mixer.stems[name].active = active;
        }
    }
}
