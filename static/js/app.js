/**
 * StemTube Web - Main JavaScript
 * Handles UI interactions, API calls, and WebSocket communication
 */

// Global variables
let socket;
let currentVideoId = null;
let currentExtractionItem = null;
let appConfig = {};

// Extraction polling for concurrent user scenarios
let waitingForExtraction = false;
let extractionPollInterval = null;

// Function to start polling when user gets "extraction in progress by another user" message
function startExtractionPolling() {
    if (waitingForExtraction) return; // Already polling
    
    waitingForExtraction = true;
    console.log('[EXTRACTION POLL] Starting periodic refresh while waiting for another user\'s extraction to complete');
    
    // Poll every 10 seconds while waiting
    extractionPollInterval = setInterval(() => {
        console.log('[EXTRACTION POLL] Refreshing extraction list...');
        loadExtractions();
    }, 10000); // 10 seconds
    
    // Stop polling after 5 minutes max (extraction should be done by then)
    setTimeout(() => {
        stopExtractionPolling();
        console.log('[EXTRACTION POLL] Stopped polling after 5 minute timeout');
    }, 300000); // 5 minutes
}

// Function to stop polling 
function stopExtractionPolling() {
    if (!waitingForExtraction) return;
    
    waitingForExtraction = false;
    if (extractionPollInterval) {
        clearInterval(extractionPollInterval);
        extractionPollInterval = null;
        console.log('[EXTRACTION POLL] Stopped periodic refresh');
    }
}
let searchResults = [];
let searchResultsPage = 1;
let searchResultsPerPage = 10;
let totalSearchResults = 0;
let searchQuery = '';
let searchMode = 'search'; // 'search' or 'url'

// CSRF protection has been disabled for this application
function getCsrfToken() {
    // Return empty string since CSRF is disabled
    return '';
}

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Socket.IO
    initializeSocketIO();
    
    // Load initial configuration
    loadConfig();
    
    // Initialize UI event listeners
    initializeEventListeners();
    
    // Load existing downloads and extractions
    loadDownloads();
    loadExtractions();
});

// Cleanup polling on page unload
window.addEventListener('beforeunload', () => {
    stopExtractionPolling();
});

// Socket.IO Initialization
function initializeSocketIO() {
    // Configuration optimisée pour la stabilité des connexions
    socket = io({
        transports: ['websocket'],
        upgrade: false,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        timeout: 60000  // Augmenter le timeout à 60 secondes
    });
    
    // Socket event listeners
    socket.on('connect', () => {
        console.log('Connected to server via WebSocket');
        showToast('Connected to server', 'success');
        
        // Recharger les téléchargements et extractions à la reconnexion
        loadDownloads();
        loadExtractions();
    });
    
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        showToast('Connection error: ' + error.message, 'error');
    });
    
    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        showToast('Disconnected from server', 'warning');
    });
    
    // Set up authentication error handling
    if (window.setupSocketAuthHandling) {
        window.setupSocketAuthHandling(socket);
    }
    
    // Download events
    socket.on('download_progress', (data) => {
        console.log('Download progress:', data);
        updateDownloadProgress(data);
    });
    
    socket.on('download_complete', (data) => {
        console.log('Download complete:', data);
        updateDownloadComplete(data);
    });
    
    socket.on('download_error', (data) => {
        console.error('Download error:', data);
        updateDownloadError(data);
    });
    
    // Extraction events
    socket.on('extraction_progress', (data) => {
        console.log('Extraction progress:', data);
        updateExtractionProgress(data);
    });
    
    socket.on('extraction_complete', (data) => {
        console.log('Extraction complete:', data);
        updateExtractionComplete(data);
    });
    
    // Handle global extraction completion notifications
    // This refreshes extraction lists for all users when ANY user completes an extraction
    socket.on('extraction_completed_global', (data) => {
        console.log('[FRONTEND DEBUG] Global extraction completed event received:', data);
        console.log('[FRONTEND DEBUG] Current user should refresh extraction lists');
        
        try {
            // Refresh the extractions list to show the new extraction
            console.log('[FRONTEND DEBUG] Calling loadExtractions()');
            loadExtractions();
            
            // Also refresh downloads list to update "Extract Stems" buttons
            console.log('[FRONTEND DEBUG] Calling loadDownloads()');
            loadDownloads();
            
            // Show a subtle notification
            console.log('[FRONTEND DEBUG] Showing toast notification');
            showToast(`New extraction available: ${data.title}`, 'info');
            
            console.log('[FRONTEND DEBUG] Global extraction refresh completed successfully');
        } catch (error) {
            console.error('[FRONTEND DEBUG] Error handling global extraction completion:', error);
        }
    });
    
    // Alternative global extraction refresh event handler
    socket.on('extraction_refresh_needed', (data) => {
        console.log('[FRONTEND DEBUG] Extraction refresh needed event received:', data);
        console.log('[FRONTEND DEBUG] This is the backup global broadcast method');
        
        try {
            // Refresh the extractions list to show the new extraction  
            console.log('[FRONTEND DEBUG] Calling loadExtractions() from backup handler');
            loadExtractions();
            
            // Also refresh downloads list
            console.log('[FRONTEND DEBUG] Calling loadDownloads() from backup handler');
            loadDownloads();
            
            // Show notification
            showToast(data.message || `New extraction available: ${data.title}`, 'success');
            
            console.log('[FRONTEND DEBUG] Backup extraction refresh completed');
        } catch (error) {
            console.error('[FRONTEND DEBUG] Error in backup extraction refresh:', error);
        }
    });
    
    socket.on('extraction_error', (data) => {
        console.error('Extraction error:', data);
        updateExtractionError(data);
    });
}

// Load Configuration
function loadConfig() {
    fetch('/api/config', {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
        .then(response => response.json())
        .then(data => {
            appConfig = data;
            
            // Apply theme
            if (appConfig.theme === 'light') {
                document.body.classList.add('light-theme');
                document.getElementById('themeSelect').value = 'light';
            } else {
                document.body.classList.remove('light-theme');
                document.getElementById('themeSelect').value = 'dark';
            }
            
            // Apply other settings
            document.getElementById('downloadsDirectory').value = appConfig.downloads_directory || '';
            document.getElementById('maxConcurrentDownloads').value = appConfig.max_concurrent_downloads || 3;
            document.getElementById('preferredVideoQuality').value = appConfig.preferred_video_quality || '720p';
            document.getElementById('preferredAudioQuality').value = appConfig.preferred_audio_quality || 'best';
            document.getElementById('useGpuForExtraction').checked = appConfig.use_gpu_for_extraction !== false;
            document.getElementById('defaultStemModel').value = appConfig.default_stem_model || 'htdemucs';
            
            // Update GPU status
            updateGpuStatus();
            
            // Check FFmpeg status
            checkFfmpegStatus();
        })
        .catch(error => {
            console.error('Error loading configuration:', error);
            showToast('Error loading configuration', 'error');
        });
}

// Initialize Event Listeners
function initializeEventListeners() {
    // Search mode toggle
    document.querySelectorAll('#searchMode .segment').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('#searchMode .segment').forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');
            searchMode = button.dataset.mode;
            
            // Update search input placeholder
            if (searchMode === 'search') {
                document.getElementById('searchInput').placeholder = 'Search YouTube...';
            } else {
                document.getElementById('searchInput').placeholder = 'Enter YouTube URL or video ID...';
            }
        });
    });
    
    // Search button
    document.getElementById('searchButton').addEventListener('click', () => {
        performSearch();
    });
    
    // Search input (Enter key)
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            switchToTab(tabId);
        });
    });
    
    // Settings button
    document.getElementById('settingsButton').addEventListener('click', () => {
        document.getElementById('settingsModal').style.display = 'flex';
    });
    
    // Logout button
    document.getElementById('logoutButton').addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) {
            window.location.href = '/logout';
        }
    });
    
    // Add global function to clear all downloads (for console testing)
    window.clearAllDownloads = function() {
        if (confirm('Are you sure you want to clear ALL downloads and stems? This cannot be undone!')) {
            fetch('/api/downloads/clear-all', {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': getCsrfToken()
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('Clear all downloads result:', data);
                    showToast(`Cleared ${data.cleared.total} items successfully`, 'success');
                    // Refresh the downloads list
                    loadDownloads();
                    loadExtractions();
                } else {
                    showToast('Error clearing downloads: ' + (data.error || 'Unknown error'), 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('Error clearing downloads: ' + error.message, 'error');
            });
        }
    };
    
    // Close buttons for modals
    document.querySelectorAll('.close-button').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.modal').style.display = 'none';
        });
    });
    
    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // Save settings button
    document.getElementById('saveSettingsButton').addEventListener('click', () => {
        saveSettings();
    });
    
    // Download FFmpeg button
    document.getElementById('downloadFfmpegButton').addEventListener('click', () => {
        downloadFfmpeg();
    });
    
    // Download type change (audio/video)
    document.getElementById('downloadType').addEventListener('change', () => {
        const downloadType = document.getElementById('downloadType').value;
        
        if (downloadType === 'audio') {
            document.getElementById('videoQualityContainer').style.display = 'none';
            document.getElementById('audioQualityContainer').style.display = 'block';
        } else {
            document.getElementById('videoQualityContainer').style.display = 'block';
            document.getElementById('audioQualityContainer').style.display = 'none';
        }
    });
    
    // Two-stem mode toggle
    document.getElementById('twoStemMode').addEventListener('change', () => {
        const twoStemMode = document.getElementById('twoStemMode').checked;
        
        if (twoStemMode) {
            document.getElementById('primaryStemContainer').style.display = 'block';
        } else {
            document.getElementById('primaryStemContainer').style.display = 'none';
        }
    });
    
    // Start download button
    document.getElementById('startDownloadButton').addEventListener('click', () => {
        startDownload();
    });
    
    // Start extraction button
    document.getElementById('startExtractionButton').addEventListener('click', () => {
        startExtraction();
    });
    
    // Model selection change event
    document.getElementById('stemModel').addEventListener('change', () => {
        updateStemOptions();
        updateModelDescription();
    });
}

// Search Functions
function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) {
        showToast('Please enter a search query', 'warning');
        return;
    }
    
    console.log('Performing search for query:', query);
    console.log('Search mode:', searchMode);
    
    // Show loading state
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = '<div class="loading-indicator">Searching...</div>';
    
    // Determine search mode (search or URL)
    const searchParams = new URLSearchParams();
    
    if (searchMode === 'search') {
        // Regular search
        const maxResults = document.getElementById('resultsCount').value;
        console.log('Selected max results:', maxResults);
        console.log('Query:', query);
        searchParams.append('query', query);
        searchParams.append('max_results', maxResults);
        
        const searchUrl = `/api/search?${searchParams.toString()}`;
        console.log('Fetching from URL:', searchUrl);
        
        fetch(searchUrl, {
            headers: {
                'X-CSRF-Token': getCsrfToken()
            }
        })
            .then(response => {
                console.log('Search API response status:', response.status);
                if (!response.ok) {
                    if (response.status === 401) {
                        // Handle authentication error
                        return response.json().then(data => {
                            throw new Error('Authentication required');
                        });
                    }
                    throw new Error(`Search failed with status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Search API response data:', data);
                displaySearchResults(data);
            })
            .catch(error => {
                console.error('Search error:', error);
                resultsContainer.innerHTML = `<div class="error-message">Search error: ${error.message}</div>`;
                showToast(`Search error: ${error.message}`, 'error');
            });
    } else {
        // URL/ID mode - direct video lookup
        const videoId = extractVideoId(query);
        if (videoId) {
            const videoUrl = `/api/video/${videoId}`;
            console.log('Fetching video info from URL:', videoUrl);
            
            fetch(videoUrl, {
                headers: {
                    'X-CSRF-Token': getCsrfToken()
                }
            })
                .then(response => {
                    console.log('Video API response status:', response.status);
                    if (!response.ok) {
                        if (response.status === 401) {
                            // Handle authentication error
                            return response.json().then(data => {
                                throw new Error('Authentication required');
                            });
                        }
                        throw new Error(`Video lookup failed with status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('Video API response data:', data);
                    // Format the response to match search results format
                    const formattedData = {
                        items: [data]
                    };
                    displaySearchResults(formattedData);
                })
                .catch(error => {
                    console.error('Video lookup error:', error);
                    resultsContainer.innerHTML = `<div class="error-message">Video lookup error: ${error.message}</div>`;
                    showToast(`Video lookup error: ${error.message}`, 'error');
                });
        } else {
            resultsContainer.innerHTML = '<div class="error-message">Invalid YouTube URL or video ID</div>';
            showToast('Invalid YouTube URL or video ID', 'error');
        }
    }
}

// Helper function to get the best thumbnail URL
function getThumbnailUrl(item) {
    // Handle different API response structures
    if (item.snippet && item.snippet.thumbnails) {
        const thumbnails = item.snippet.thumbnails;
        return thumbnails.medium?.url || thumbnails.default?.url || '';
    } else if (item.thumbnails && Array.isArray(item.thumbnails)) {
        // Find a thumbnail with width between 200 and 400px
        const mediumThumbnail = item.thumbnails.find(thumb => 
            thumb.width >= 200 && thumb.width <= 400
        );
        
        if (mediumThumbnail) {
            return mediumThumbnail.url;
        }
        
        // Fallback to the first thumbnail
        return item.thumbnails[0]?.url || '';
    } else if (item.thumbnail) {
        return item.thumbnail;
    }
    
    return '';
}

// Helper function to format duration
function formatDuration(duration) {
    if (!duration) return 'Unknown';
    
    // Handle ISO 8601 duration format (PT1H2M3S)
    if (typeof duration === 'string' && duration.startsWith('PT')) {
        const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        
        if (matches) {
            const hours = matches[1] ? parseInt(matches[1]) : 0;
            const minutes = matches[2] ? parseInt(matches[2]) : 0;
            const seconds = matches[3] ? parseInt(matches[3]) : 0;
            
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        }
    }
    
    // Handle seconds format
    if (!isNaN(duration)) {
        const totalSeconds = parseInt(duration);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }
    
    // Handle MM:SS format that might be incorrectly formatted (e.g., 0:296)
    if (typeof duration === 'string' && duration.includes(':')) {
        const parts = duration.split(':');
        if (parts.length === 2) {
            let minutes = parseInt(parts[0]);
            let seconds = parseInt(parts[1]);
            
            // Convertir les secondes excédentaires en minutes
            if (seconds >= 60) {
                minutes += Math.floor(seconds / 60);
                seconds = seconds % 60;
            }
            
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }
    
    return duration;
}

// Download Modal Functions
function openDownloadModal(videoId, title, thumbnailUrl) {
    console.log('Opening download modal with:', { videoId, title, thumbnailUrl });
    
    // Validate video ID before proceeding
    if (!isValidYouTubeVideoId(videoId)) {
        showToast(`Invalid YouTube video ID: "${videoId}" (length: ${videoId ? videoId.length : 0})`, 'error');
        console.error('Invalid video ID provided to download modal:', videoId);
        return;
    }
    
    // Stocker l'ID décodé
    currentVideoId = videoId;
    console.log('Set currentVideoId to:', currentVideoId);
    
    document.getElementById('downloadTitle').textContent = title;
    document.getElementById('downloadThumbnail').src = thumbnailUrl;
    
    // Set default values from settings
    document.getElementById('downloadType').value = 'audio';
    document.getElementById('videoQuality').value = appConfig.preferred_video_quality || '720p';
    document.getElementById('audioQuality').value = appConfig.preferred_audio_quality || 'best';
    
    // Show/hide quality options based on download type
    document.getElementById('videoQualityContainer').style.display = 'none';
    document.getElementById('audioQualityContainer').style.display = 'block';
    
    // Show modal
    document.getElementById('downloadModal').style.display = 'flex';
}

function startDownload() {
    console.log('Starting download with currentVideoId:', currentVideoId);
    
    if (!currentVideoId) {
        showToast('No video selected', 'error');
        return;
    }
    
    const downloadType = document.getElementById('downloadType').value;
    const quality = downloadType === 'audio' 
        ? document.getElementById('audioQuality').value 
        : document.getElementById('videoQuality').value;
    const title = document.getElementById('downloadTitle').textContent;
    const thumbnailUrl = document.getElementById('downloadThumbnail').src;
    
    console.log('Download parameters:', { 
        downloadType, 
        quality, 
        title, 
        thumbnailUrl 
    });
    
    // Create download item
    // DEBUG: Log the video_id being sent to API
    console.log(`[FRONTEND DEBUG] Sending video_id: '${currentVideoId}' (length: ${currentVideoId.length})`);
    console.log(`[FRONTEND DEBUG] Title: '${title}'`);
    
    const downloadItem = {
        video_id: currentVideoId,
        title: title,
        thumbnail_url: thumbnailUrl,
        download_type: downloadType,
        quality: quality
    };
    
    console.log('Sending download request with data:', downloadItem);
    
    // Add to queue
    fetch('/api/downloads', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(downloadItem)
    })
    .then(response => {
        console.log('Download API response status:', response.status);
        
        // Vérifier si la réponse est OK
        if (!response.ok) {
            if (response.status === 401) {
                // Erreur d'authentification
                return response.json().then(data => {
                    throw new Error('Authentication required');
                }).catch(e => {
                    // Si le parsing JSON échoue, c'est probablement une page HTML
                    throw new Error(`Authentication required (${response.status})`);
                });
            }
            
            // Autres erreurs
            return response.text().then(text => {
                // Essayer de parser en JSON si possible
                try {
                    const data = JSON.parse(text);
                    throw new Error(data.error || `Server error: ${response.status}`);
                } catch (e) {
                    // Si ce n'est pas du JSON, c'est probablement une page HTML
                    console.error('Response is not JSON:', text.substring(0, 100) + '...');
                    throw new Error(`Server error: ${response.status}`);
                }
            });
        }
        
        return response.json();
    })
    .then(data => {
        if (data.error) {
            showToast(`Error: ${data.error}`, 'error');
            return;
        }
        
        // Close modal first
        document.getElementById('downloadModal').style.display = 'none';
        
        if (data.existing) {
            // Video already exists - show appropriate message based on source
            const messageType = data.global ? 'success' : 'info';
            const defaultMessage = data.global ? 
                'File found on server - instant access granted!' : 
                'Video already downloaded - showing existing download';
            showToast(data.message || defaultMessage, messageType);
            loadDownloads(); // Refresh the list to show the existing download
            loadExtractions(); // Also refresh extractions in case user was granted access to existing extraction
        } else {
            // New download - add to UI immediately
            const downloadElement = createDownloadElement({
                download_id: data.download_id,
                video_id: currentVideoId,
                title: title,
                status: 'queued',
                progress: 0,
                speed: '0 KB/s',
                eta: 'Unknown',
                file_path: '',
                error_message: ''
            });
            
            document.getElementById('downloadsContainer').appendChild(downloadElement);
            showToast('Download added to queue', 'success');
        }
        
        // Switch to downloads tab
        switchToTab('downloads');
    })
    .catch(error => {
        console.error('Error adding download:', error);
        showToast(`Error adding download: ${error.message}`, 'error');
    });
}

// Extraction Modal Functions
function openExtractionModal(downloadId, title, filePath, videoId) {
    currentExtractionItem = {
        download_id: downloadId,
        title: title,
        audio_path: filePath,
        video_id: videoId  // Store video_id for deduplication
    };
    
    document.getElementById('extractionTitle').textContent = title;
    document.getElementById('extractionPath').textContent = filePath;
    
    // Set default values from settings
    document.getElementById('stemModel').value = appConfig.default_stem_model || 'htdemucs';
    
    // Mettre à jour les stems disponibles en fonction du modèle
    updateStemOptions();
    
    // Mettre à jour la description du modèle
    updateModelDescription();
    
    document.getElementById('twoStemMode').checked = false;
    document.getElementById('primaryStemContainer').style.display = 'none';
    document.getElementById('primaryStem').value = 'vocals';
    
    // Show modal
    document.getElementById('extractionModal').style.display = 'flex';
}

// Fonction pour charger la description du modèle sélectionné
function updateModelDescription() {
    const modelSelect = document.getElementById('stemModel');
    const selectedModel = modelSelect.value;
    const modelDescriptionElement = document.getElementById('modelDescription');
    
    // Dictionnaire des descriptions des modèles
    const modelDescriptions = {
        'htdemucs': 'Modèle de haute qualité pour la séparation en 4 stems (voix, batterie, basse, autres)',
        'htdemucs_ft': 'Version fine-tuned du modèle HTDemucs avec une meilleure qualité pour les 4 stems',
        'htdemucs_6s': 'Modèle avancé pour la séparation en 6 stems (voix, batterie, basse, guitare, piano, autres)',
        'mdx_extra': 'Modèle MDX avec une séparation plus précise des voix',
        'mdx_extra_q': 'Version optimisée du modèle MDX pour une qualité supérieure avec un coût de calcul plus élevé'
    };
    
    // Mettre à jour la description
    modelDescriptionElement.textContent = modelDescriptions[selectedModel] || '';
}

// Fonction pour mettre à jour les options de stems en fonction du modèle sélectionné
function updateStemOptions() {
    const modelSelect = document.getElementById('stemModel');
    const selectedModel = modelSelect.value;
    const selectedOption = modelSelect.options[modelSelect.selectedIndex];
    const stemCheckboxes = document.getElementById('stemCheckboxes');
    
    // Récupérer les stems disponibles depuis l'attribut data-stems
    const availableStems = selectedOption.getAttribute('data-stems') ? 
                          selectedOption.getAttribute('data-stems').split(',') : 
                          ['vocals', 'drums', 'bass', 'other'];
    
    // Vider le conteneur des checkboxes
    stemCheckboxes.innerHTML = '';
    
    // Créer les checkboxes pour chaque stem disponible
    availableStems.forEach(stem => {
        const stemId = `${stem}Checkbox`;
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'stem-checkbox';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = stemId;
        checkbox.checked = true;
        
        const label = document.createElement('label');
        label.htmlFor = stemId;
        label.textContent = stem.charAt(0).toUpperCase() + stem.slice(1); // Capitalize first letter
        
        checkboxDiv.appendChild(checkbox);
        checkboxDiv.appendChild(label);
        stemCheckboxes.appendChild(checkboxDiv);
    });
    
    // Mettre à jour également les options dans le sélecteur primaryStem
    const primaryStemSelect = document.getElementById('primaryStem');
    primaryStemSelect.innerHTML = '';
    
    availableStems.forEach(stem => {
        const option = document.createElement('option');
        option.value = stem;
        option.textContent = stem.charAt(0).toUpperCase() + stem.slice(1);
        primaryStemSelect.appendChild(option);
    });
    
    // Sélectionner 'vocals' par défaut si disponible
    if (availableStems.includes('vocals')) {
        primaryStemSelect.value = 'vocals';
    }
}

function startExtraction() {
    if (!currentExtractionItem) {
        showToast('No audio file selected', 'error');
        return;
    }
    
    const modelName = document.getElementById('stemModel').value;
    const twoStemMode = document.getElementById('twoStemMode').checked;
    const primaryStem = document.getElementById('primaryStem').value;
    
    // Get selected stems from dynamically created checkboxes
    const selectedStems = [];
    const checkboxes = document.querySelectorAll('#stemCheckboxes input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            // Extract stem name from ID (remove 'Checkbox' suffix)
            const stemName = checkbox.id.replace('Checkbox', '');
            selectedStems.push(stemName);
        }
    });
    
    if (selectedStems.length === 0) {
        showToast('Please select at least one stem to extract', 'warning');
        return;
    }
    
    // Use video_id from the extraction item (passed from the download)
    const video_id = currentExtractionItem.video_id || "";
    
    // Create extraction item
    const extractionItem = {
        audio_path: currentExtractionItem.audio_path,
        model_name: modelName,
        selected_stems: selectedStems,
        two_stem_mode: twoStemMode,
        primary_stem: primaryStem,
        video_id: video_id,  // Add video_id for deduplication
        title: currentExtractionItem.title  // Add title for database storage
    };
    
    // Add to queue
    fetch('/api/extractions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(extractionItem)
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(`Error: ${data.error}`, 'error');
            return;
        }
        
        // Check if extraction is in progress by another user
        if (data.in_progress && data.extraction_id === 'in_progress') {
            console.log('[EXTRACTION POLL] Detected extraction in progress by another user, starting polling...');
            showToast(data.message || 'Extraction in progress by another user. Will auto-refresh when complete.', 'warning');
            startExtractionPolling();
            return;
        }
        
        // Close modal first
        document.getElementById('extractionModal').style.display = 'none';
        
        if (data.existing) {
            // Extraction already exists - show message and refresh extractions list
            showToast(data.message || 'Stems already extracted - showing existing extraction', 'info');
            loadExtractions(); // Refresh the list to show the existing extraction
        } else {
            // New extraction - add to UI immediately
            const extractionElement = createExtractionElement({
                extraction_id: data.extraction_id,
                audio_path: currentExtractionItem.audio_path,
                title: currentExtractionItem.title,
                model_name: modelName,
                status: 'queued',
                progress: 0,
                output_paths: {},
                error_message: ''
            });
            
            document.getElementById('extractionsContainer').appendChild(extractionElement);
            showToast('Extraction added to queue', 'success');
        }
        
        // Switch to extractions tab
        switchToTab('extractions');
    })
    .catch(error => {
        console.error('Error adding extraction:', error);
        showToast('Error adding extraction', 'error');
    });
}

// Download and Extraction Management
function loadDownloads() {
    fetch('/api/downloads', {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) {
                    // Handle authentication error
                    return response.json().then(data => {
                        throw new Error('Authentication required');
                    });
                }
                throw new Error(`Failed to load downloads: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const downloadsContainer = document.getElementById('downloadsContainer');
            downloadsContainer.innerHTML = '';
            
            if (data.length === 0) {
                downloadsContainer.innerHTML = '<div class="empty-state">No downloads yet</div>';
                return;
            }
            
            // Sort downloads by creation time (newest first)
            data.sort((a, b) => {
                // Handle different created_at formats (database timestamp vs Unix timestamp)
                const timeA = isNaN(a.created_at) ? new Date(a.created_at) : new Date(parseInt(a.created_at) * 1000);
                const timeB = isNaN(b.created_at) ? new Date(b.created_at) : new Date(parseInt(b.created_at) * 1000);
                return timeB - timeA;
            });
            
            data.forEach(item => {
                const downloadElement = createDownloadElement(item);
                downloadsContainer.appendChild(downloadElement);
            });
            
            // Update left panel if we're on extractions tab
            updateDownloadsListForExtraction(data);
            
            // Update user management controls visibility
            updateUserManagementControls();
        })
        .catch(error => {
            console.error('Error loading downloads:', error);
            document.getElementById('downloadsContainer').innerHTML = 
                `<div class="error-message">Failed to load downloads: ${error.message}</div>`;
            showToast(`Failed to load downloads: ${error.message}`, 'error');
        });
}

function loadExtractions() {
    fetch('/api/extractions', {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) {
                    // Handle authentication error
                    return response.json().then(data => {
                        throw new Error('Authentication required');
                    });
                }
                throw new Error(`Failed to load extractions: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const extractionsContainer = document.getElementById('extractionsContainer');
            extractionsContainer.innerHTML = '';
            
            if (data.length === 0) {
                extractionsContainer.innerHTML = '<div class="empty-state">No extractions yet</div>';
                return;
            }
            
            // If we were polling for extraction completion and now we have extractions, stop polling
            if (waitingForExtraction && data.length > 0) {
                console.log('[EXTRACTION POLL] Found extractions, stopping polling');
                stopExtractionPolling();
                showToast('Extraction completed! List refreshed automatically.', 'success');
            }
            
            // Sort extractions by creation time (newest first)
            data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            data.forEach(item => {
                const extractionElement = createExtractionElement(item);
                extractionsContainer.appendChild(extractionElement);
            });
            
            // Update left panel if we're on mixer tab
            updateExtractionsListForMixer(data);
            
            // Update user management controls visibility
            updateUserManagementControls();
        })
        .catch(error => {
            console.error('Error loading extractions:', error);
            document.getElementById('extractionsContainer').innerHTML = 
                `<div class="error-message">Failed to load extractions: ${error.message}</div>`;
            showToast(`Failed to load extractions: ${error.message}`, 'error');
        });
}

// Check extraction status for a video
async function checkExtractionStatus(videoId) {
    try {
        const response = await fetch(`/api/downloads/${encodeURIComponent(videoId)}/extraction-status`, {
            headers: {
                'X-CSRF-Token': getCsrfToken()
            }
        });
        
        if (!response.ok) {
            return { exists: false, user_has_access: false, status: 'not_extracted' };
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error checking extraction status:', error);
        return { exists: false, user_has_access: false, status: 'not_extracted' };
    }
}

// Grant access to existing extraction
async function grantExtractionAccess(videoId, button) {
    try {
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Granting Access...';
        button.disabled = true;
        
        const response = await fetch('/api/extractions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify({
                video_id: videoId,
                grant_access_only: true  // Special flag to only grant access
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to grant access');
        }
        
        // Success - update button to mixer
        button.innerHTML = '<i class="fas fa-sliders-h"></i> Open Mixer';
        button.className = 'item-button extract-button extracted';
        button.disabled = false;
        
        // Update click handler
        button.removeEventListener('click', arguments.callee);
        button.addEventListener('click', () => {
            switchToTab('mixer');
            loadExtractionInMixer(`download_${button.dataset.downloadId}`);
        });
        
        showToast('Access granted! You can now use the mixer.', 'success');
        
    } catch (error) {
        console.error('Error granting access:', error);
        button.innerHTML = '<i class="fas fa-key"></i> Already Extracted/Grant me Access';
        button.disabled = false;
        showToast('Failed to grant access. Please try again.', 'error');
    }
}

// Update extract button based on extraction status
async function updateExtractButton(button, extractionStatus) {
    // Remove loading class
    button.classList.remove('loading');
    
    if (extractionStatus.status === 'not_extracted') {
        // Not extracted - show normal extract button
        button.innerHTML = '<i class="fas fa-music"></i> Extract Stems';
        button.className = 'item-button extract-button';
        button.addEventListener('click', () => {
            openExtractionModal(
                button.dataset.downloadId,
                button.dataset.title,
                button.dataset.filePath,
                button.dataset.videoId
            );
        });
    } else if (extractionStatus.status === 'extracted') {
        // User has access - show mixer button
        button.innerHTML = '<i class="fas fa-sliders-h"></i> Open Mixer';
        button.className = 'item-button extract-button extracted';
        button.addEventListener('click', () => {
            // Switch to mixer tab and load this extraction
            switchToTab('mixer');
            loadExtractionInMixer(`download_${button.dataset.downloadId}`);
        });
    } else if (extractionStatus.status === 'extracted_no_access') {
        // Extracted by someone else - show grant access button
        button.innerHTML = '<i class="fas fa-key"></i> Already Extracted/Grant me Access';
        button.className = 'item-button extract-button grant-access';
        button.addEventListener('click', async () => {
            await grantExtractionAccess(button.dataset.videoId, button);
        });
    }
}

function createDownloadElement(item) {
    // Debug: log the item structure
    console.log('createDownloadElement item:', item);
    // Use download_id for live downloads, id for database downloads, or fallback to video_id
    const itemId = item.download_id || item.id || item.video_id;
    
    const downloadElement = document.createElement('div');
    downloadElement.className = 'download-item';
    downloadElement.id = `download-${itemId}`;
    
    const statusClass = getStatusClass(item.status);
    const statusText = getStatusText(item.status);
    
    downloadElement.innerHTML = `
        <div class="item-header">
            <div class="item-title-container">
                <input type="checkbox" class="user-item-checkbox" data-download-id="${item.global_download_id}" value="${item.global_download_id}">
                <div class="item-title">${item.title}</div>
            </div>
            <div class="item-status ${statusClass}">${statusText}</div>
        </div>
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${item.progress}%"></div>
            </div>
            <div class="progress-info">
                <span class="progress-percentage">${item.progress}%</span>
                <span class="progress-details">${item.speed} - ${item.eta}</span>
            </div>
        </div>
        <div class="item-actions">
            ${item.status === 'completed' ? `
                <button class="item-button extract-button loading" data-download-id="${itemId}" data-title="${item.title}" data-file-path="${item.file_path}" data-video-id="${item.video_id}">
                    <i class="fas fa-spinner fa-spin"></i> Checking...
                </button>
                <button class="item-button open-folder-button" data-file-path="${item.file_path}">
                    <i class="fas fa-download"></i> Get File
                </button>
                <button class="item-button remove-from-list" data-download-id="${item.global_download_id}" title="Remove from my list">
                    <i class="fas fa-eye-slash"></i> Remove from List
                </button>
            ` : ''}
            ${item.status === 'downloading' || item.status === 'queued' ? `
                <button class="item-button cancel cancel-download-button" data-download-id="${itemId}">
                    <i class="fas fa-times"></i> Cancel
                </button>
            ` : ''}
            ${item.status === 'error' || item.status === 'cancelled' || item.status === 'failed' || !item.status || item.status === 'undefined' ? `
                <div class="error-message">${item.error_message || 'Download failed or cancelled'}</div>
                <div class="action-buttons">
                    <button class="item-button retry-button" data-download-id="${itemId}">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                    <button class="item-button delete-button" data-download-id="${itemId}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                    <button class="item-button remove-from-list" data-download-id="${item.global_download_id}" title="Remove from my list">
                        <i class="fas fa-eye-slash"></i> Remove from List
                    </button>
                </div>
            ` : ''}
        </div>
    `;
    
    // Add event listeners and update extraction status
    setTimeout(async () => {
        const extractButton = downloadElement.querySelector('.extract-button');
        if (extractButton && extractButton.classList.contains('loading')) {
            // Check extraction status
            const extractionStatus = await checkExtractionStatus(item.video_id);
            await updateExtractButton(extractButton, extractionStatus);
        }
        
        const openFolderButton = downloadElement.querySelector('.open-folder-button');
        if (openFolderButton) {
            openFolderButton.addEventListener('click', () => {
                const filePath = openFolderButton.dataset.filePath;
                // Handle both Windows (\) and Unix (/) path separators
                const lastBackslash = filePath.lastIndexOf('\\');
                const lastForwardslash = filePath.lastIndexOf('/');
                const lastSeparator = Math.max(lastBackslash, lastForwardslash);
                const folderPath = filePath.substring(0, lastSeparator);
                const title = downloadElement.querySelector('.item-title').textContent;
                
                // Déterminer si l'utilisateur est local ou distant
                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                
                if (isLocalhost) {
                    // Pour les utilisateurs locaux, offrir l'option d'ouvrir le dossier localement
                    console.log(`Opening folder locally: ${folderPath}`);
                    
                    fetch('/api/open-folder', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': getCsrfToken()
                        },
                        body: JSON.stringify({ folder_path: folderPath })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            console.log('Folder opened successfully');
                            showToast('Folder opened successfully', 'success');
                        } else {
                            // Si l'ouverture locale échoue, afficher la modale de téléchargement
                            console.error('Error opening folder:', data.message);
                            showToast(`Couldn't open folder locally. Showing file list instead.`, 'warning');
                            showFilesModal(folderPath, title);
                        }
                    })
                    .catch(error => {
                        console.error('Error calling open-folder API:', error);
                        showToast('Error opening folder', 'error');
                        // Afficher la modale de téléchargement en cas d'erreur
                        showFilesModal(folderPath, title);
                    });
                } else {
                    // Pour les utilisateurs distants, afficher directement la modale de téléchargement
                    console.log(`Showing files list for remote user: ${folderPath}`);
                    showFilesModal(folderPath, title);
                }
            });
        }
        
        const cancelButton = downloadElement.querySelector('.cancel-download-button');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                cancelDownload(cancelButton.dataset.downloadId);
            });
        }
        
        const retryButton = downloadElement.querySelector('.retry-button');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                retryDownload(retryButton.dataset.downloadId);
            });
        }
        
        const deleteButton = downloadElement.querySelector('.delete-button');
        if (deleteButton) {
            deleteButton.addEventListener('click', () => {
                deleteDownload(deleteButton.dataset.downloadId);
            });
        }
        
        // Add remove from list button event handler
        const removeFromListButton = downloadElement.querySelector('.remove-from-list');
        if (removeFromListButton) {
            removeFromListButton.addEventListener('click', () => {
                removeDownloadFromList(removeFromListButton.dataset.downloadId);
            });
        }
    }, 0);
    
    return downloadElement;
}

function createExtractionElement(item) {
    // Debug: log the item structure
    console.log('createExtractionElement item:', item);
    const extractionElement = document.createElement('div');
    extractionElement.className = 'extraction-item';
    extractionElement.id = `extraction-${item.extraction_id}`;
    
    const statusClass = getStatusClass(item.status);
    const statusText = getStatusText(item.status);
    const title = item.title || getFileNameFromPath(item.audio_path);
    
    extractionElement.innerHTML = `
        <div class="item-header">
            <div class="item-title-container">
                <input type="checkbox" class="user-item-checkbox" data-download-id="${item.global_download_id}" value="${item.global_download_id}">
                <div class="item-title">${title}</div>
            </div>
            <div class="item-status ${statusClass}">${statusText}</div>
        </div>
        <div class="item-details">
            <div>Model: ${item.model_name}</div>
            <div>File: ${getFileNameFromPath(item.audio_path)}</div>
        </div>
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${item.progress}%"></div>
            </div>
            <div class="progress-info">
                <span class="progress-percentage">${item.progress}%</span>
            </div>
        </div>
        <div class="item-actions">
            ${item.status === 'completed' ? `
                <div class="action-buttons">
                    <button class="item-button open-mixer-button extracted" data-extraction-id="${item.extraction_id}">
                        <i class="fas fa-sliders-h"></i> Open Mixer
                    </button>
                    <button class="item-button open-folder-button" data-file-path="${getFirstOutputPath(item)}" data-extraction-id="${item.extraction_id}">
                        <i class="fas fa-download"></i> Get Tracks
                    </button>
                    <button class="item-button download-zip-button" data-file-path="${item.zip_path || ''}" data-extraction-id="${item.extraction_id}">
                        <i class="fas fa-file-archive"></i> Download All (ZIP)
                    </button>
                    <button class="item-button remove-from-list" data-download-id="${item.global_download_id}" title="Remove from my list">
                        <i class="fas fa-eye-slash"></i> Remove from List
                    </button>
                </div>
            ` : ''}
            ${item.status === 'extracting' || item.status === 'queued' ? `
                <button class="item-button cancel cancel-extraction-button" data-extraction-id="${item.extraction_id}">
                    <i class="fas fa-times"></i> Cancel
                </button>
            ` : ''}
            ${item.status === 'error' || item.status === 'cancelled' ? `
                <div class="error-message">${item.error_message || 'Extraction cancelled'}</div>
                <div class="action-buttons">
                    <button class="item-button retry-button" data-extraction-id="${item.extraction_id}">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                    <button class="item-button delete-button" data-extraction-id="${item.extraction_id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                    <button class="item-button remove-from-list" data-download-id="${item.global_download_id}" title="Remove from my list">
                        <i class="fas fa-eye-slash"></i> Remove from List
                    </button>
                </div>
            ` : ''}
        </div>
    `;
    
    // Add event listeners
    setTimeout(() => {
        const openMixerButton = extractionElement.querySelector('.open-mixer-button');
        if (openMixerButton) {
            openMixerButton.addEventListener('click', () => {
                const extractionId = openMixerButton.dataset.extractionId;
                
                // Switch to the Mixer tab
                switchToTab('mixer');
                
                // Load extraction in mixer with state persistence
                loadExtractionInMixer(extractionId);
            });
        }
        
        const openFolderButton = extractionElement.querySelector('.open-folder-button');
        if (openFolderButton) {
            openFolderButton.addEventListener('click', () => {
                const filePath = openFolderButton.dataset.filePath;
                const extractionId = openFolderButton.dataset.extractionId;
                const title = extractionElement.querySelector('.item-title').textContent;
                
                let folderPath = '';
                
                if (filePath) {
                    // Handle both Windows (\) and Unix (/) path separators
                    const lastBackslash = filePath.lastIndexOf('\\');
                    const lastForwardslash = filePath.lastIndexOf('/');
                    const lastSeparator = Math.max(lastBackslash, lastForwardslash);
                    folderPath = filePath.substring(0, lastSeparator);
                } else {
                    // Try to find stems folder based on extraction info
                    // This is a fallback for cases where output_paths is not available
                    console.warn('No file path available, trying to construct stems folder path');
                    showToast('Unable to determine stems location', 'warning');
                    return;
                }
                
                // Déterminer si l'utilisateur est local ou distant
                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                
                if (isLocalhost) {
                    // Pour les utilisateurs locaux, offrir l'option d'ouvrir le dossier localement
                    console.log(`Opening folder locally: ${folderPath}`);
                    
                    fetch('/api/open-folder', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': getCsrfToken()
                        },
                        body: JSON.stringify({ folder_path: folderPath })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            console.log('Folder opened successfully');
                            showToast('Folder opened successfully', 'success');
                        } else {
                            // Si l'ouverture locale échoue, afficher la modale de téléchargement
                            console.error('Error opening folder:', data.message);
                            showToast(`Couldn't open folder locally. Showing file list instead.`, 'warning');
                            showFilesModal(folderPath, title);
                        }
                    })
                    .catch(error => {
                        console.error('Error calling open-folder API:', error);
                        showToast('Error opening folder', 'error');
                        // Afficher la modale de téléchargement en cas d'erreur
                        showFilesModal(folderPath, title);
                    });
                } else {
                    // Pour les utilisateurs distants, afficher directement la modale de téléchargement
                    console.log(`Showing files list for remote user: ${folderPath}`);
                    showFilesModal(folderPath, title);
                }
            });
        }
        
        const downloadZipButton = extractionElement.querySelector('.download-zip-button');
        if (downloadZipButton) {
            downloadZipButton.addEventListener('click', () => {
                const filePath = downloadZipButton.dataset.filePath;
                const extractionId = downloadZipButton.dataset.extractionId;
                
                if (!filePath) {
                    // Try to create a ZIP on the fly
                    showToast('Creating ZIP archive...', 'info');
                    createZipForExtraction(extractionId);
                    return;
                }
                
                // Check if file exists by trying to download it
                window.location.href = `/api/download-file?file_path=${encodeURIComponent(filePath)}`;
            });
        }
        
        const cancelButton = extractionElement.querySelector('.cancel-extraction-button');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                cancelExtraction(cancelButton.dataset.extractionId);
            });
        }
        
        const retryButton = extractionElement.querySelector('.retry-button');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                retryExtraction(retryButton.dataset.extractionId);
            });
        }
        
        const deleteButton = extractionElement.querySelector('.delete-button');
        if (deleteButton) {
            deleteButton.addEventListener('click', () => {
                deleteExtraction(deleteButton.dataset.extractionId);
            });
        }
        
        // Add remove from list button event handler
        const removeFromListButton = extractionElement.querySelector('.remove-from-list');
        if (removeFromListButton) {
            removeFromListButton.addEventListener('click', () => {
                removeExtractionFromList(removeFromListButton.dataset.downloadId);
            });
        }
    }, 0);
    
    return extractionElement;
}

// Update Functions
function updateDownloadProgress(data) {
    console.log('Updating download progress:', data);
    
    // Si l'élément n'existe pas, recharger la liste des téléchargements
    const downloadElement = document.getElementById(`download-${data.download_id}`);
    if (!downloadElement) {
        console.warn(`Download element for ID ${data.download_id} not found, refreshing downloads list`);
        return loadDownloads();
    }
    
    try {
        // Récupérer les éléments DOM à mettre à jour
        const progressFill = downloadElement.querySelector('.progress-fill');
        const progressPercentage = downloadElement.querySelector('.progress-percentage');
        const progressDetails = downloadElement.querySelector('.progress-details');
        const statusElement = downloadElement.querySelector('.item-status');
        
        if (!progressFill || !progressPercentage || !progressDetails || !statusElement) {
            console.error('Required elements not found in download item', downloadElement);
            return;
        }
        
        // Formater la progression avec 1 décimale
        const formattedProgress = parseFloat(data.progress).toFixed(1);
        
        console.log(`Updating progress bar to ${formattedProgress}% for download ${data.download_id}`);
        
        // Mettre à jour la barre de progression de manière optimisée
        window.requestAnimationFrame(() => {
            // Update progress bar visually
            progressFill.style.width = `${formattedProgress}%`;
            progressPercentage.textContent = `${formattedProgress}%`;
            
            // Mettre à jour la vitesse et l'ETA
            if (data.speed && data.eta) {
                progressDetails.textContent = `${data.speed} - ${data.eta}`;
            } else if (data.speed) {
                progressDetails.textContent = data.speed;
            } else {
                progressDetails.textContent = 'Downloading...';
            }
            
            // Assurer que le statut est bien "Downloading"
            if (statusElement.textContent !== 'Downloading') {
                statusElement.textContent = 'Downloading';
                statusElement.className = 'item-status status-downloading';
                console.log(`Updated status to Downloading for ${data.download_id}`);
            }
        });
        
        // S'assurer que le bouton d'annulation existe
        const actionsContainer = downloadElement.querySelector('.item-actions');
        if (!actionsContainer.querySelector('.cancel-download-button')) {
            actionsContainer.innerHTML = `
                <button class="item-button cancel cancel-download-button" data-download-id="${data.download_id}">
                    <i class="fas fa-times"></i> Cancel
                </button>
            `;
            
            const cancelButton = actionsContainer.querySelector('.cancel-download-button');
            cancelButton.addEventListener('click', () => {
                cancelDownload(cancelButton.dataset.downloadId);
            });
        }
    } catch (error) {
        console.error('Error updating download progress:', error);
    }
}

function updateDownloadComplete(data) {
    console.log('🎯 [DEBUG] updateDownloadComplete called with data:', data);
    const downloadElement = document.getElementById(`download-${data.download_id}`);
    if (!downloadElement) {
        console.error('🔴 [DEBUG] Download element not found for ID:', data.download_id);
        return;
    }
    console.log('✅ [DEBUG] Found download element:', downloadElement);
    
    const progressFill = downloadElement.querySelector('.progress-fill');
    const progressPercentage = downloadElement.querySelector('.progress-percentage');
    const progressDetails = downloadElement.querySelector('.progress-details');
    const statusElement = downloadElement.querySelector('.item-status');
    const actionsContainer = downloadElement.querySelector('.item-actions');
    
    progressFill.style.width = '100%';
    progressPercentage.textContent = '100%';
    progressDetails.textContent = 'Completed';
    
    statusElement.textContent = 'Completed';
    statusElement.className = 'item-status status-completed';
    
    // Get the global_download_id from the existing checkbox
    const existingCheckbox = downloadElement.querySelector('.user-item-checkbox');
    const globalDownloadId = existingCheckbox ? existingCheckbox.dataset.downloadId : '';
    console.log('🔍 [DEBUG] Extracted globalDownloadId:', globalDownloadId, 'from checkbox:', existingCheckbox);
    
    actionsContainer.innerHTML = `
        <button class="item-button extract-button" data-download-id="${data.download_id}" data-title="${data.title}" data-file-path="${data.file_path}" data-video-id="${data.video_id}">
            <i class="fas fa-music"></i> Extract Stems
        </button>
        <button class="item-button open-folder-button" data-file-path="${data.file_path}">
            <i class="fas fa-download"></i> Get File
        </button>
        <button class="item-button remove-from-list" data-download-id="${globalDownloadId}" title="Remove from my list">
            <i class="fas fa-eye-slash"></i> Remove from List
        </button>
    `;
    
    // Add event listeners
    const extractButton = actionsContainer.querySelector('.extract-button');
    extractButton.addEventListener('click', () => {
        openExtractionModal(
            extractButton.dataset.downloadId,
            extractButton.dataset.title,
            extractButton.dataset.filePath,
            extractButton.dataset.videoId
        );
    });
    
    const openFolderButton = actionsContainer.querySelector('.open-folder-button');
    openFolderButton.addEventListener('click', () => {
        const filePath = openFolderButton.dataset.filePath;
        // Handle both Windows (\) and Unix (/) path separators
        const lastBackslash = filePath.lastIndexOf('\\');
        const lastForwardslash = filePath.lastIndexOf('/');
        const lastSeparator = Math.max(lastBackslash, lastForwardslash);
        const folderPath = filePath.substring(0, lastSeparator);
        const title = downloadElement.querySelector('.item-title').textContent;
        
        // Déterminer si l'utilisateur est local ou distant
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        if (isLocalhost) {
            // Pour les utilisateurs locaux, offrir l'option d'ouvrir le dossier localement
            console.log(`Opening folder locally: ${folderPath}`);
            
            fetch('/api/open-folder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': getCsrfToken()
                },
                body: JSON.stringify({ folder_path: folderPath })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('Folder opened successfully');
                    showToast('Folder opened successfully', 'success');
                } else {
                    // Si l'ouverture locale échoue, afficher la modale de téléchargement
                    console.error('Error opening folder:', data.message);
                    showToast(`Couldn't open folder locally. Showing file list instead.`, 'warning');
                    showFilesModal(folderPath, title);
                }
            })
            .catch(error => {
                console.error('Error calling open-folder API:', error);
                showToast('Error opening folder', 'error');
                // Afficher la modale de téléchargement en cas d'erreur
                showFilesModal(folderPath, title);
            });
        } else {
            // Pour les utilisateurs distants, afficher directement la modale de téléchargement
            console.log(`Showing files list for remote user: ${folderPath}`);
            showFilesModal(folderPath, title);
        }
    });
    
    // Add remove from list button event handler
    const removeFromListButton = actionsContainer.querySelector('.remove-from-list');
    if (removeFromListButton) {
        console.log('✅ [DEBUG] Remove button found, adding event listener. ID:', removeFromListButton.dataset.downloadId);
        removeFromListButton.addEventListener('click', () => {
            console.log('🔴 [DEBUG] Remove button clicked! Calling removeDownloadFromList with ID:', removeFromListButton.dataset.downloadId);
            removeDownloadFromList(removeFromListButton.dataset.downloadId);
        });
    } else {
        console.error('🔴 [DEBUG] Remove button not found in actionsContainer');
    }
}

function updateDownloadError(data) {
    const downloadElement = document.getElementById(`download-${data.download_id}`);
    if (!downloadElement) return;
    
    const statusElement = downloadElement.querySelector('.item-status');
    const actionsContainer = downloadElement.querySelector('.item-actions');
    
    statusElement.textContent = 'Error';
    statusElement.className = 'item-status status-error';
    
    actionsContainer.innerHTML = `
        <div class="error-message">${data.error_message}</div>
        <div class="action-buttons">
            <button class="item-button retry-button" data-download-id="${data.download_id}">
                <i class="fas fa-redo"></i> Retry
            </button>
            <button class="item-button delete-button" data-download-id="${data.download_id}">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
    `;
    
    // Add event listeners
    const retryButton = actionsContainer.querySelector('.retry-button');
    retryButton.addEventListener('click', () => {
        retryDownload(retryButton.dataset.downloadId);
    });
    
    const deleteButton = actionsContainer.querySelector('.delete-button');
    deleteButton.addEventListener('click', () => {
        deleteDownload(deleteButton.dataset.downloadId);
    });
}

function updateExtractionProgress(data) {
    const extractionElement = document.getElementById(`extraction-${data.extraction_id}`);
    if (!extractionElement) return;
    
    const progressFill = extractionElement.querySelector('.progress-fill');
    const progressPercentage = extractionElement.querySelector('.progress-percentage');
    const statusElement = extractionElement.querySelector('.item-status');
    
    progressFill.style.width = `${data.progress}%`;
    progressPercentage.textContent = `${data.progress}% - ${data.status_message}`;
    
    if (statusElement.textContent !== 'Extracting') {
        statusElement.textContent = 'Extracting';
        statusElement.className = 'item-status status-extracting';
    }
}

function updateExtractionComplete(data) {
    const extractionElement = document.getElementById(`extraction-${data.extraction_id}`);
    if (!extractionElement) return;
    
    const progressFill = extractionElement.querySelector('.progress-fill');
    const progressPercentage = extractionElement.querySelector('.progress-percentage');
    const statusElement = extractionElement.querySelector('.item-status');
    const actionsContainer = extractionElement.querySelector('.item-actions');
    
    progressFill.style.width = '100%';
    progressPercentage.textContent = '100%';
    
    statusElement.textContent = 'Completed';
    statusElement.className = 'item-status status-completed';
    
    actionsContainer.innerHTML = `
        <div class="action-buttons">
            <button class="item-button open-mixer-button extracted" data-extraction-id="${data.extraction_id}">
                <i class="fas fa-sliders-h"></i> Open Mixer
            </button>
            <button class="item-button open-folder-button" data-file-path="${getFirstOutputPath(data)}" data-extraction-id="${data.extraction_id}">
                <i class="fas fa-download"></i> Get Tracks
            </button>
            <button class="item-button download-zip-button" data-file-path="${data.zip_path || ''}" data-extraction-id="${data.extraction_id}">
                <i class="fas fa-file-archive"></i> Download All (ZIP)
            </button>
        </div>
    `;
    
    // Add event listeners
    const openMixerButton = actionsContainer.querySelector('.open-mixer-button');
    if (openMixerButton) {
        openMixerButton.addEventListener('click', () => {
            const extractionId = openMixerButton.dataset.extractionId;
                
            // Switch to the Mixer tab
            switchToTab('mixer');
            
            // Load extraction in mixer with state persistence
            loadExtractionInMixer(extractionId);
        });
    }
    
    const openFolderButton = actionsContainer.querySelector('.open-folder-button');
    if (openFolderButton) {
        openFolderButton.addEventListener('click', () => {
            const filePath = openFolderButton.dataset.filePath;
            const extractionId = openFolderButton.dataset.extractionId;
            const title = extractionElement.querySelector('.item-title').textContent;
            
            let folderPath = '';
            
            if (filePath) {
                // Handle both Windows (\) and Unix (/) path separators
                const lastBackslash = filePath.lastIndexOf('\\');
                const lastForwardslash = filePath.lastIndexOf('/');
                const lastSeparator = Math.max(lastBackslash, lastForwardslash);
                folderPath = filePath.substring(0, lastSeparator);
            } else {
                console.warn('No file path available for extraction', extractionId);
                showToast('Unable to determine stems location', 'warning');
                return;
            }
            
            // Déterminer si l'utilisateur est local ou distant
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            if (isLocalhost) {
                // Pour les utilisateurs locaux, offrir l'option d'ouvrir le dossier localement
                console.log(`Opening folder locally: ${folderPath}`);
                
                fetch('/api/open-folder', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': getCsrfToken()
                    },
                    body: JSON.stringify({ folder_path: folderPath })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        console.log('Folder opened successfully');
                        showToast('Folder opened successfully', 'success');
                    } else {
                        // Si l'ouverture locale échoue, afficher la modale de téléchargement
                        console.error('Error opening folder:', data.message);
                        showToast(`Couldn't open folder locally. Showing file list instead.`, 'warning');
                        showFilesModal(folderPath, title);
                    }
                })
                .catch(error => {
                    console.error('Error calling open-folder API:', error);
                    showToast('Error opening folder', 'error');
                    // Afficher la modale de téléchargement en cas d'erreur
                    showFilesModal(folderPath, title);
                });
            } else {
                // Pour les utilisateurs distants, afficher directement la modale de téléchargement
                console.log(`Showing files list for remote user: ${folderPath}`);
                showFilesModal(folderPath, title);
            }
        });
    }
    
    const downloadZipButton = actionsContainer.querySelector('.download-zip-button');
    if (downloadZipButton) {
        downloadZipButton.addEventListener('click', () => {
            const filePath = downloadZipButton.dataset.filePath;
            const extractionId = downloadZipButton.dataset.extractionId;
            
            if (!filePath) {
                // Try to create a ZIP on the fly
                showToast('Creating ZIP archive...', 'info');
                createZipForExtraction(extractionId);
                return;
            }
            
            // Check if file exists by trying to download it
            window.location.href = `/api/download-file?file_path=${encodeURIComponent(filePath)}`;
        });
    }
    
    // Also update the corresponding Extract Stems button in Downloads tab
    if (data.video_id) {
        updateDownloadsTabExtractButton(data.video_id, data.extraction_id);
    }
}

function updateDownloadsTabExtractButton(videoId, extractionId) {
    // Find all download elements that match this video_id
    const downloadElements = document.querySelectorAll('#downloadsContainer .download-item');
    
    downloadElements.forEach(downloadElement => {
        const extractButton = downloadElement.querySelector('.extract-button');
        if (extractButton && extractButton.dataset.videoId === videoId) {
            // Update this button to show "Open Mixer" state
            extractButton.innerHTML = '<i class="fas fa-sliders-h"></i> Open Mixer';
            extractButton.className = 'item-button extract-button extracted';
            
            // Remove any existing event listeners by cloning the button
            const newButton = extractButton.cloneNode(true);
            extractButton.parentNode.replaceChild(newButton, extractButton);
            
            // Add new event listener for mixer functionality
            newButton.addEventListener('click', () => {
                // Switch to mixer tab and load this extraction
                switchToTab('mixer');
                loadExtractionInMixer(extractionId);
            });
            
            console.log(`Updated Extract Stems button to Open Mixer for video_id: ${videoId}`);
        }
    });
}

function updateExtractionError(data) {
    const extractionElement = document.getElementById(`extraction-${data.extraction_id}`);
    if (!extractionElement) return;
    
    const statusElement = extractionElement.querySelector('.item-status');
    const actionsContainer = extractionElement.querySelector('.item-actions');
    
    statusElement.textContent = 'Error';
    statusElement.className = 'item-status status-error';
    
    actionsContainer.innerHTML = `
        <div class="error-message">${data.error_message}</div>
        <div class="action-buttons">
            <button class="item-button retry-button" data-extraction-id="${data.extraction_id}">
                <i class="fas fa-redo"></i> Retry
            </button>
            <button class="item-button delete-button" data-extraction-id="${data.extraction_id}">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
    `;
    
    // Add event listeners
    const retryButton = actionsContainer.querySelector('.retry-button');
    retryButton.addEventListener('click', () => {
        retryExtraction(retryButton.dataset.extractionId);
    });
    
    const deleteButton = actionsContainer.querySelector('.delete-button');
    deleteButton.addEventListener('click', () => {
        deleteExtraction(deleteButton.dataset.extractionId);
    });
}

// Action Functions
function cancelDownload(downloadId) {
    console.log('Cancelling download:', downloadId);
    
    // Afficher un indicateur visuel que l'annulation est en cours
    const downloadElement = document.getElementById(`download-${downloadId}`);
    if (downloadElement) {
        const statusElement = downloadElement.querySelector('.item-status');
        statusElement.textContent = 'Cancelling...';
        statusElement.className = 'item-status status-cancelling';
        
        const progressDetails = downloadElement.querySelector('.progress-details');
        progressDetails.textContent = 'Cancelling download...';
    }
    
    fetch(`/api/downloads/${downloadId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Cancel response:', data);
        if (data.success) {
            showToast('Download cancelled', 'info');
            // UI will be updated via WebSocket event, no need to reload
        } else {
            showToast('Error cancelling download', 'error');
            // Only reload if cancellation failed
            loadDownloads();
        }
    })
    .catch(error => {
        console.error('Error cancelling download:', error);
        showToast('Error cancelling download', 'error');
        // Only reload on error
        loadDownloads();
    });
}

function retryDownload(downloadId) {
    // Update UI immediately to show retrying state
    const downloadElement = document.getElementById(`download-${downloadId}`);
    if (downloadElement) {
        const statusElement = downloadElement.querySelector('.item-status');
        const actionsContainer = downloadElement.querySelector('.item-actions');
        
        statusElement.textContent = 'Retrying...';
        statusElement.className = 'item-status status-queued';
        
        // Show cancel button while retrying
        actionsContainer.innerHTML = `
            <button class="item-button cancel cancel-download-button" data-download-id="${downloadId}">
                <i class="fas fa-times"></i> Cancel
            </button>
        `;
        
        const cancelButton = actionsContainer.querySelector('.cancel-download-button');
        cancelButton.addEventListener('click', () => {
            cancelDownload(cancelButton.dataset.downloadId);
        });
    }
    
    fetch(`/api/downloads/${downloadId}/retry`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(`Error: ${data.error}`, 'error');
            // Reload to refresh state if retry failed
            setTimeout(() => loadDownloads(), 500);
            return;
        }
        
        if (data.success) {
            showToast('Download retried', 'success');
            // Update UI to show queued state
            if (downloadElement) {
                const statusElement = downloadElement.querySelector('.item-status');
                const progressFill = downloadElement.querySelector('.progress-fill');
                const progressPercentage = downloadElement.querySelector('.progress-percentage');
                const progressDetails = downloadElement.querySelector('.progress-details');
                
                statusElement.textContent = 'Queued';
                statusElement.className = 'item-status status-queued';
                progressFill.style.width = '0%';
                progressPercentage.textContent = '0%';
                progressDetails.textContent = 'Waiting to start...';
            }
        } else {
            showToast('Error retrying download', 'error');
            setTimeout(() => loadDownloads(), 500);
        }
    })
    .catch(error => {
        console.error('Error retrying download:', error);
        showToast('Error retrying download', 'error');
        setTimeout(() => loadDownloads(), 500);
    });
}

function cancelExtraction(extractionId) {
    fetch(`/api/extractions/${encodeURIComponent(extractionId)}`, {
        method: 'DELETE',
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Extraction cancelled', 'info');
            // UI will be updated via WebSocket event, no need to reload
        } else {
            showToast('Error cancelling extraction', 'error');
            // Only reload if cancellation failed
            loadExtractions();
        }
    })
    .catch(error => {
        console.error('Error cancelling extraction:', error);
        showToast('Error cancelling extraction', 'error');
        // Only reload on error
        loadExtractions();
    });
}

function retryExtraction(extractionId) {
    // Update UI immediately to show retrying state
    const extractionElement = document.getElementById(`extraction-${extractionId}`);
    if (extractionElement) {
        const statusElement = extractionElement.querySelector('.item-status');
        const actionsContainer = extractionElement.querySelector('.item-actions');
        
        statusElement.textContent = 'Retrying...';
        statusElement.className = 'item-status status-queued';
        
        // Show cancel button while retrying
        actionsContainer.innerHTML = `
            <button class="item-button cancel cancel-extraction-button" data-extraction-id="${extractionId}">
                <i class="fas fa-times"></i> Cancel
            </button>
        `;
        
        const cancelButton = actionsContainer.querySelector('.cancel-extraction-button');
        cancelButton.addEventListener('click', () => {
            cancelExtraction(cancelButton.dataset.extractionId);
        });
    }
    
    fetch(`/api/extractions/${encodeURIComponent(extractionId)}/retry`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(`Error: ${data.error}`, 'error');
            setTimeout(() => loadExtractions(), 500);
            return;
        }
        
        if (data.success) {
            showToast('Extraction retried', 'success');
            // Update UI to show queued state
            if (extractionElement) {
                const statusElement = extractionElement.querySelector('.item-status');
                const progressFill = extractionElement.querySelector('.progress-fill');
                const progressPercentage = extractionElement.querySelector('.progress-percentage');
                
                statusElement.textContent = 'Queued';
                statusElement.className = 'item-status status-queued';
                progressFill.style.width = '0%';
                progressPercentage.textContent = '0%';
            }
        } else {
            showToast('Error retrying extraction', 'error');
            // Only reload if retry failed
            loadExtractions();
        }
    })
    .catch(error => {
        console.error('Error retrying extraction:', error);
        showToast('Error retrying extraction', 'error');
        // Only reload on error
        loadExtractions();
    });
}

function deleteDownload(downloadId) {
    if (!confirm('Are you sure you want to delete this download? This will remove it from the list and the database.')) {
        return;
    }
    
    fetch(`/api/downloads/${downloadId}/delete`, {
        method: 'DELETE',
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(`Error: ${data.error}`, 'error');
            return;
        }
        
        if (data.success) {
            showToast('Download deleted', 'success');
            loadDownloads();
        } else {
            showToast('Error deleting download', 'error');
        }
    })
    .catch(error => {
        console.error('Error deleting download:', error);
        showToast('Error deleting download', 'error');
    });
}

function deleteExtraction(extractionId) {
    if (!confirm('Are you sure you want to delete this extraction? This will remove it from the list.')) {
        return;
    }
    
    fetch(`/api/extractions/${encodeURIComponent(extractionId)}/delete`, {
        method: 'DELETE',
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(`Error: ${data.error}`, 'error');
            return;
        }
        
        if (data.success) {
            showToast('Extraction deleted', 'success');
            loadExtractions();
        } else {
            showToast('Error deleting extraction', 'error');
        }
    })
    .catch(error => {
        console.error('Error deleting extraction:', error);
        showToast('Error deleting extraction', 'error');
    });
}

// Settings Functions
function saveSettings() {
    const settings = {
        theme: document.getElementById('themeSelect').value,
        downloads_directory: document.getElementById('downloadsDirectory').value,
        max_concurrent_downloads: parseInt(document.getElementById('maxConcurrentDownloads').value),
        preferred_video_quality: document.getElementById('preferredVideoQuality').value,
        preferred_audio_quality: document.getElementById('preferredAudioQuality').value,
        use_gpu_for_extraction: document.getElementById('useGpuForExtraction').checked,
        default_stem_model: document.getElementById('defaultStemModel').value
    };
    
    fetch('/api/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify(settings)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Settings saved', 'success');
            
            // Apply theme
            if (settings.theme === 'light') {
                document.body.classList.add('light-theme');
            } else {
                document.body.classList.remove('light-theme');
            }
            
            // Close modal
            document.getElementById('settingsModal').style.display = 'none';
            
            // Update app config
            appConfig = { ...appConfig, ...settings };
        } else {
            showToast('Error saving settings', 'error');
        }
    })
    .catch(error => {
        console.error('Error saving settings:', error);
        showToast('Error saving settings', 'error');
    });
}

function checkFfmpegStatus() {
    fetch('/api/config/ffmpeg/check', {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
        .then(response => response.json())
        .then(data => {
            const ffmpegStatus = document.getElementById('ffmpegStatus');
            const downloadFfmpegButton = document.getElementById('downloadFfmpegButton');
            
            if (data.ffmpeg_available && data.ffprobe_available) {
                ffmpegStatus.innerHTML = `
                    <p class="status-ok">FFmpeg is available</p>
                    <p>FFmpeg path: ${data.ffmpeg_path}</p>
                    <p>FFprobe path: ${data.ffprobe_path}</p>
                `;
                downloadFfmpegButton.classList.add('hidden');
            } else {
                ffmpegStatus.innerHTML = `
                    <p class="status-error">FFmpeg is not available</p>
                    <p>FFmpeg ${data.ffmpeg_available ? 'is' : 'is not'} available</p>
                    <p>FFprobe ${data.ffprobe_available ? 'is' : 'is not'} available</p>
                `;
                downloadFfmpegButton.classList.remove('hidden');
            }
        })
        .catch(error => {
            console.error('Error checking FFmpeg status:', error);
            document.getElementById('ffmpegStatus').innerHTML = '<p class="status-error">Error checking FFmpeg status</p>';
        });
}

function downloadFfmpeg() {
    const ffmpegStatus = document.getElementById('ffmpegStatus');
    const downloadFfmpegButton = document.getElementById('downloadFfmpegButton');
    
    ffmpegStatus.innerHTML = '<p>Downloading FFmpeg...</p>';
    downloadFfmpegButton.disabled = true;
    
    fetch('/api/config/ffmpeg/download', {
        method: 'POST',
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            ffmpegStatus.innerHTML = `
                <p class="status-ok">FFmpeg downloaded successfully</p>
                <p>${data.message}</p>
            `;
            downloadFfmpegButton.classList.add('hidden');
            showToast('FFmpeg downloaded successfully', 'success');
        } else {
            ffmpegStatus.innerHTML = `
                <p class="status-error">Error downloading FFmpeg</p>
                <p>${data.message}</p>
            `;
            downloadFfmpegButton.disabled = false;
            showToast('Error downloading FFmpeg', 'error');
        }
    })
    .catch(error => {
        console.error('Error downloading FFmpeg:', error);
        ffmpegStatus.innerHTML = '<p class="status-error">Error downloading FFmpeg</p>';
        downloadFfmpegButton.disabled = false;
        showToast('Error downloading FFmpeg', 'error');
    });
}

function updateGpuStatus() {
    const gpuStatus = document.getElementById('gpuStatus');
    
    if (appConfig.using_gpu) {
        gpuStatus.innerHTML = '<p class="status-ok">GPU acceleration is available and enabled</p>';
    } else {
        gpuStatus.innerHTML = '<p class="status-warning">GPU acceleration is not available</p>';
    }
}

// Fonction pour afficher la liste des fichiers dans un dossier
function showFilesModal(folderPath, title) {
    // Créer ou récupérer la fenêtre modale
    let filesModal = document.getElementById('filesModal');
    
    if (!filesModal) {
        // Créer la modale si elle n'existe pas encore
        filesModal = document.createElement('div');
        filesModal.id = 'filesModal';
        filesModal.className = 'modal';
        
        filesModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="filesModalTitle">Files</h2>
                    <span class="close-button">&times;</span>
                </div>
                <div class="modal-body">
                    <div id="filesContainer" class="files-container">
                        <div class="loading">Loading files...</div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(filesModal);
        
        // Gestionnaire d'événement pour fermer la modale
        filesModal.querySelector('.close-button').addEventListener('click', () => {
            filesModal.style.display = 'none';
        });
        
        // Fermer la modale en cliquant à l'extérieur
        filesModal.addEventListener('click', (e) => {
            if (e.target === filesModal) {
                filesModal.style.display = 'none';
            }
        });
    }
    
    // Mettre à jour le titre
    filesModal.querySelector('#filesModalTitle').textContent = title ? `Files - ${title}` : 'Files';
    
    // Afficher la modale
    filesModal.style.display = 'flex';
    
    // Charger la liste des fichiers
    fetch('/api/list-files', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken(),
            'X-Requested-With': 'XMLHttpRequest'  // Ajout pour indiquer une requête AJAX
        },
        body: JSON.stringify({ folder_path: folderPath }),
        credentials: 'same-origin'  // Inclure les cookies pour l'authentification
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        const filesContainer = filesModal.querySelector('#filesContainer');
        
        if (!data.success) {
            filesContainer.innerHTML = `<div class="error-message">${data.message}</div>`;
            return;
        }
        
        if (data.files.length === 0) {
            filesContainer.innerHTML = '<div class="no-items">No files found</div>';
            return;
        }
        
        // Trier les fichiers par nom
        data.files.sort((a, b) => a.name.localeCompare(b.name));
        
        // Créer la liste des fichiers
        let filesHtml = '<ul class="files-list">';
        
        data.files.forEach(file => {
            const fileSize = formatFileSize(file.size);
            const encodedPath = encodeURIComponent(file.path);
            
            filesHtml += `
                <li class="file-item">
                    <div class="file-info">
                        <span class="file-name">${file.name}</span>
                        <span class="file-size">${fileSize}</span>
                    </div>
                    <a href="/api/download-file?file_path=${encodedPath}" 
                       class="item-button download-button" 
                       download="${file.name}">
                        <i class="fas fa-download"></i> Download
                    </a>
                </li>
            `;
        });
        
        filesHtml += '</ul>';
        filesContainer.innerHTML = filesHtml;
    })
    .catch(error => {
        console.error('Error loading files:', error);
        filesModal.querySelector('#filesContainer').innerHTML = 
            `<div class="error-message">Error loading files: ${error.message}</div>`;
    });
}

// Fonction pour formater la taille des fichiers
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' B';
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    } else if (bytes < 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    } else {
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }
}

// Function to create ZIP archive for extraction on demand
function createZipForExtraction(extractionId) {
    fetch(`/api/extractions/${encodeURIComponent(extractionId)}/create-zip`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.zip_path) {
            showToast('ZIP archive created successfully', 'success');
            // Immediately download the ZIP
            window.location.href = `/api/download-file?file_path=${encodeURIComponent(data.zip_path)}`;
        } else {
            showToast(`Error creating ZIP: ${data.error || 'Unknown error'}`, 'error');
        }
    })
    .catch(error => {
        console.error('Error creating ZIP:', error);
        showToast('Error creating ZIP archive', 'error');
    });
}

// Helper function to get the first output path or construct one
function getFirstOutputPath(item) {
    // Try to get the first output path
    if (item.output_paths && Object.keys(item.output_paths).length > 0) {
        return Object.values(item.output_paths)[0];
    }
    
    // Fallback: try to construct path from audio_path
    if (item.audio_path) {
        // Remove filename and add stems directory
        const lastSlash = Math.max(item.audio_path.lastIndexOf('/'), item.audio_path.lastIndexOf('\\'));
        if (lastSlash !== -1) {
            const directory = item.audio_path.substring(0, lastSlash);
            // Go up one level (from audio to parent) and add stems
            const parentSlash = Math.max(directory.lastIndexOf('/'), directory.lastIndexOf('\\'));
            if (parentSlash !== -1) {
                const parentDir = directory.substring(0, parentSlash);
                return parentDir + '/stems/vocals.mp3'; // Use vocals as default
            }
        }
    }
    
    return ''; // Fallback to empty if nothing works
}

// Utility Functions
function getStatusClass(status) {
    switch (status) {
        case 'queued':
            return 'status-queued';
        case 'downloading':
        case 'extracting':
            return 'status-downloading';
        case 'completed':
            return 'status-completed';
        case 'error':
        case 'failed':
        case 'cancelled':
            return 'status-error';
        case undefined:
        case null:
        case '':
        case 'undefined':
            return 'status-error';
        default:
            return 'status-error';
    }
}

function getStatusText(status) {
    switch (status) {
        case 'queued':
            return 'Queued';
        case 'downloading':
            return 'Downloading';
        case 'extracting':
            return 'Extracting';
        case 'completed':
            return 'Completed';
        case 'error':
        case 'failed':
            return 'Error';
        case 'cancelled':
            return 'Cancelled';
        case undefined:
        case null:
        case '':
        case 'undefined':
            return 'Failed';
        default:
            return 'Failed';
    }
}

function getFileNameFromPath(path) {
    if (!path) return '';
    return path.split('\\').pop().split('/').pop();
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Helper function to validate YouTube video ID
function isValidYouTubeVideoId(videoId) {
    if (!videoId || typeof videoId !== 'string') {
        return false;
    }
    
    // YouTube video IDs are exactly 11 characters
    if (videoId.length !== 11) {
        return false;
    }
    
    // Only alphanumeric, hyphen, and underscore are allowed
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return false;
    }
    
    return true;
}

// Helper function to extract video ID from YouTube URL
function extractVideoId(url) {
    // Check if it's already a video ID (11 characters)
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
        return url;
    }
    
    // Try to extract from URL
    const regExp = /^.*(youtu.be\/|v\/|e\/|u\/\w+\/|embed\/|v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    
    if (match && match[2]) {
        // Validate the extracted video ID
        const extractedId = match[2];
        return isValidYouTubeVideoId(extractedId) ? extractedId : null;
    }
    
    return null;
}

// Display search results
function displaySearchResults(data) {
    console.log('Received search results data:', data);
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = '';
    
    // Check if we have valid data
    if (!data || (Array.isArray(data) && data.length === 0) || 
        (data.items && data.items.length === 0)) {
        console.log('No results found in data');
        resultsContainer.innerHTML = '<div class="no-results">No results found</div>';
        return;
    }
    
    // Normalize data format
    let items = [];
    if (Array.isArray(data)) {
        console.log('Data is an array');
        items = data;
    } else if (data.items && Array.isArray(data.items)) {
        console.log('Data has items array');
        items = data.items;
    } else {
        console.error('Unexpected data format:', data);
        resultsContainer.innerHTML = '<div class="error-message">Error processing search results</div>';
        return;
    }
    
    console.log('Processing', items.length, 'items');
    
    // Add results counter at the top
    const counterElement = document.createElement('div');
    counterElement.className = 'results-counter';
    counterElement.innerHTML = `<strong>Showing ${items.length} results</strong>`;
    resultsContainer.appendChild(counterElement);
    
    // Create result elements
    items.forEach((item, index) => {
        console.log(`Processing item ${index}:`, item);
        
        // Extract video ID
        let videoId;
        if (item.id && typeof item.id === 'object' && item.id.videoId) {
            videoId = item.id.videoId;
        } else if (item.id && typeof item.id === 'string') {
            videoId = item.id;
        } else {
            videoId = item.videoId || '';
        }
        
        // VALIDATE VIDEO ID
        if (!isValidYouTubeVideoId(videoId)) {
            console.warn(`[FRONTEND DEBUG] Invalid video ID found: '${videoId}' (length: ${videoId ? videoId.length : 0}) - skipping result`);
            console.warn(`[FRONTEND DEBUG] Item data:`, item);
            return; // Skip this invalid result
        }
        
        console.log(`[FRONTEND DEBUG] Extracted valid videoId: ${videoId} for title: ${item.snippet?.title || item.title || 'Unknown'}`);
        
        // Extract other information
        const title = item.snippet?.title || item.title || 'Unknown Title';
        const channelTitle = item.snippet?.channelTitle || item.channel?.name || 'Unknown Channel';
        const thumbnailUrl = getThumbnailUrl(item);
        const duration = formatDuration(item.contentDetails?.duration || item.duration);
        
        console.log(`Title: ${title}, Channel: ${channelTitle}, Thumbnail: ${thumbnailUrl}`);
        
        // Create result element
        const resultElement = document.createElement('div');
        resultElement.className = 'search-result';
        resultElement.innerHTML = `
            <img class="result-thumbnail" src="${thumbnailUrl}" alt="${title}">
            <div class="result-info">
                <div class="result-title">${title}</div>
                <div class="result-channel">${channelTitle}</div>
                <div class="result-duration">${duration}</div>
                <div class="result-actions">
                    <button class="result-button play-button" data-video-id="${videoId}">
                        <i class="fas fa-play"></i> Play
                    </button>
                    <button class="result-button download-button" data-video-id="${videoId}" data-title="${title}" data-thumbnail="${thumbnailUrl}">
                        <i class="fas fa-download"></i> Download
                    </button>
                </div>
            </div>
        `;
        
        resultsContainer.appendChild(resultElement);
    });
    
    console.log('Added event listeners to buttons');
    
    // Add event listeners to buttons
    document.querySelectorAll('.play-button').forEach(button => {
        button.addEventListener('click', () => {
            const videoId = button.dataset.videoId;
            window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
        });
    });
    
    document.querySelectorAll('.download-button').forEach(button => {
        button.addEventListener('click', () => {
            const videoId = button.dataset.videoId;
            openDownloadModal(videoId, button.dataset.title, button.dataset.thumbnail);
        });
    });
}

// Helper function to get the best thumbnail URL
function getThumbnailUrl(item) {
    // Handle different API response structures
    if (item.snippet && item.snippet.thumbnails) {
        const thumbnails = item.snippet.thumbnails;
        return thumbnails.medium?.url || thumbnails.default?.url || '';
    } else if (item.thumbnails && Array.isArray(item.thumbnails)) {
        // Find a thumbnail with width between 200 and 400px
        const mediumThumbnail = item.thumbnails.find(thumb => 
            thumb.width >= 200 && thumb.width <= 400
        );
        
        if (mediumThumbnail) {
            return mediumThumbnail.url;
        }
        
        // Fallback to the first thumbnail
        return item.thumbnails[0]?.url || '';
    } else if (item.thumbnail) {
        return item.thumbnail;
    }
    
    return '';
}
// ------------------------------------------------------------------
// CLEANUP TAB FUNCTIONALITY
// ------------------------------------------------------------------

let cleanupData = [];
let cleanupSortColumn = 'created_at';
let cleanupSortDirection = 'desc';

// Load cleanup data from API
function loadCleanupData() {
    const tableBody = document.getElementById('cleanupTableBody');
    if (!tableBody) return;
    
    // Show loading
    tableBody.innerHTML = '<tr class="loading-row"><td colspan="8"><div class="loading">Loading downloads...</div></td></tr>';
    
    fetch('/api/admin/cleanup/downloads', {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Raw API response:', data);
        
        // Handle both direct array and wrapped object responses
        if (Array.isArray(data)) {
            cleanupData = data;
        } else if (data && Array.isArray(data.downloads)) {
            cleanupData = data.downloads;
        } else if (data && data.error) {
            throw new Error(data.error);
        } else {
            cleanupData = [];
        }
        
        console.log('Processed cleanup data:', cleanupData.length, 'items');
        renderCleanupTable();
        initializeCleanupEventListeners();
    })
    .catch(error => {
        console.error('Error loading cleanup data:', error);
        tableBody.innerHTML = '<tr class="error-row"><td colspan="8"><div class="error-message">Failed to load downloads. Check console for details.</div></td></tr>';
        showToast(`Failed to load cleanup data: ${error.message}`, 'error');
        
        // Log additional debugging info
        console.error('Cleanup API Error Details:', {
            error: error,
            message: error.message,
            stack: error.stack
        });
    });
}

// Render the cleanup table
function renderCleanupTable() {
    const tableBody = document.getElementById('cleanupTableBody');
    if (!tableBody) return;
    
    // Ensure cleanupData is a valid array
    if (!Array.isArray(cleanupData)) {
        console.error('cleanupData is not an array:', cleanupData);
        tableBody.innerHTML = '<tr class="error-row"><td colspan="8"><div class="error-message">Invalid data format</div></td></tr>';
        return;
    }
    
    // Sort data
    const sortedData = [...cleanupData].sort((a, b) => {
        let aVal = a[cleanupSortColumn];
        let bVal = b[cleanupSortColumn];
        
        // Handle different data types
        if (cleanupSortColumn === 'file_size') {
            aVal = parseInt(aVal) || 0;
            bVal = parseInt(bVal) || 0;
        } else if (cleanupSortColumn === 'created_at') {
            aVal = new Date(aVal);
            bVal = new Date(bVal);
        } else if (cleanupSortColumn === 'users') {
            aVal = parseInt(aVal) || 0;
            bVal = parseInt(bVal) || 0;
        } else {
            aVal = String(aVal || '').toLowerCase();
            bVal = String(bVal || '').toLowerCase();
        }
        
        if (cleanupSortDirection === 'asc') {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
    });
    
    if (sortedData.length === 0) {
        tableBody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state">No downloads found</div></td></tr>';
        return;
    }
    
    tableBody.innerHTML = '';
    
    sortedData.forEach(item => {
        const row = createCleanupTableRow(item);
        tableBody.appendChild(row);
    });
    
    updateTableSortHeaders();
}

// Create a table row for cleanup data
function createCleanupTableRow(item) {
    const row = document.createElement('tr');
    row.dataset.downloadId = item.global_id;
    
    // Add selection class if checked
    if (document.querySelector(`#cleanup-checkbox-${item.global_id}`)?.checked) {
        row.classList.add('selected');
    }
    
    const extractedStatus = item.extracted ? 
        `<span class="status-badge extracted">✓ Extracted</span>` : 
        `<span class="status-badge not-extracted">⊘ Not Extracted</span>`;
    
    const fileSize = item.file_size ? formatFileSize(item.file_size) : 'N/A';
    const createdAt = item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A';
    const userCount = item.user_count || 0;
    
    row.innerHTML = `
        <td class="checkbox-column">
            <input type="checkbox" id="cleanup-checkbox-${item.global_id}" value="${item.global_id}">
        </td>
        <td class="video-id-column">
            <span class="video-id" title="${item.video_id}">${item.video_id}</span>
        </td>
        <td class="title-column">
            <span class="title" title="${item.title || 'N/A'}">${truncateText(item.title || 'N/A', 50)}</span>
        </td>
        <td class="users-column">${userCount}</td>
        <td class="size-column">${fileSize}</td>
        <td class="extracted-column">${extractedStatus}</td>
        <td class="date-column">${createdAt}</td>
        <td class="actions-column">
            <button class="row-action danger" onclick="deleteDownload(${item.global_id})" title="Delete Download">
                <i class="fas fa-trash"></i>
            </button>
            ${item.extracted ? `
                <button class="row-action warning" onclick="resetExtraction(${item.global_id})" title="Reset Extraction">
                    <i class="fas fa-undo"></i>
                </button>
            ` : ''}
        </td>
    `;
    
    return row;
}

// Initialize cleanup event listeners
function initializeCleanupEventListeners() {
    // Bulk selection
    const selectAllCheckbox = document.getElementById('selectAllDownloads');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', handleSelectAll);
    }
    
    const headerSelectAll = document.getElementById('headerSelectAll');
    if (headerSelectAll) {
        headerSelectAll.addEventListener('change', handleSelectAll);
    }
    
    // Individual checkboxes
    document.querySelectorAll('#cleanupTableBody input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', handleRowSelection);
    });
    
    // Bulk action buttons
    const bulkDeleteButton = document.getElementById('bulkDeleteButton');
    if (bulkDeleteButton) {
        bulkDeleteButton.addEventListener('click', handleBulkDelete);
    }
    
    const bulkResetButton = document.getElementById('bulkResetExtractionsButton');
    if (bulkResetButton) {
        bulkResetButton.addEventListener('click', handleBulkReset);
    }
    
    const refreshButton = document.getElementById('refreshCleanupButton');
    if (refreshButton) {
        refreshButton.addEventListener('click', loadCleanupData);
    }
    
    // Table sorting
    document.querySelectorAll('.cleanup-table th.sortable').forEach(header => {
        header.addEventListener('click', handleTableSort);
    });
    
    // Update button states
    updateBulkButtonStates();
}

// Handle select all checkbox
function handleSelectAll(event) {
    const isChecked = event.target.checked;
    
    // Update all row checkboxes
    document.querySelectorAll('#cleanupTableBody input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = isChecked;
        const row = checkbox.closest('tr');
        if (row) {
            row.classList.toggle('selected', isChecked);
        }
    });
    
    // Sync both select all checkboxes
    const selectAllMain = document.getElementById('selectAllDownloads');
    const selectAllHeader = document.getElementById('headerSelectAll');
    if (selectAllMain && selectAllHeader) {
        selectAllMain.checked = isChecked;
        selectAllHeader.checked = isChecked;
    }
    
    updateBulkButtonStates();
}

// Handle individual row selection
function handleRowSelection(event) {
    const checkbox = event.target;
    const row = checkbox.closest('tr');
    
    if (row) {
        row.classList.toggle('selected', checkbox.checked);
    }
    
    // Update select all checkbox states
    const allCheckboxes = document.querySelectorAll('#cleanupTableBody input[type="checkbox"]');
    const checkedCount = document.querySelectorAll('#cleanupTableBody input[type="checkbox"]:checked').length;
    const allSelected = checkedCount === allCheckboxes.length && allCheckboxes.length > 0;
    
    const selectAllMain = document.getElementById('selectAllDownloads');
    const selectAllHeader = document.getElementById('headerSelectAll');
    if (selectAllMain && selectAllHeader) {
        selectAllMain.checked = allSelected;
        selectAllHeader.checked = allSelected;
    }
    
    updateBulkButtonStates();
}

// Update bulk button enabled/disabled states
function updateBulkButtonStates() {
    const selectedCheckboxes = document.querySelectorAll('#cleanupTableBody input[type="checkbox"]:checked');
    const hasSelection = selectedCheckboxes.length > 0;
    
    const bulkDeleteButton = document.getElementById('bulkDeleteButton');
    const bulkResetButton = document.getElementById('bulkResetExtractionsButton');
    
    if (bulkDeleteButton) {
        bulkDeleteButton.disabled = !hasSelection;
    }
    
    if (bulkResetButton) {
        bulkResetButton.disabled = !hasSelection;
    }
}

// Handle table sorting
function handleTableSort(event) {
    const header = event.target;
    const newSortColumn = header.dataset.sort;
    
    if (cleanupSortColumn === newSortColumn) {
        // Toggle direction if same column
        cleanupSortDirection = cleanupSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New column, default to desc for most fields
        cleanupSortColumn = newSortColumn;
        cleanupSortDirection = newSortColumn === 'title' ? 'asc' : 'desc';
    }
    
    renderCleanupTable();
}

// Update table sort headers
function updateTableSortHeaders() {
    document.querySelectorAll('.cleanup-table th.sortable').forEach(header => {
        header.classList.remove('sorted-asc', 'sorted-desc');
        if (header.dataset.sort === cleanupSortColumn) {
            header.classList.add(`sorted-${cleanupSortDirection}`);
        }
    });
}

// Handle bulk delete
function handleBulkDelete() {
    const selectedIds = Array.from(document.querySelectorAll('#cleanupTableBody input[type="checkbox"]:checked'))
        .map(cb => parseInt(cb.value));
    
    if (selectedIds.length === 0) {
        showToast('No downloads selected', 'warning');
        return;
    }
    
    if (!confirm(`Are you sure you want to permanently delete ${selectedIds.length} download(s)? This will remove all files and cannot be undone.`)) {
        return;
    }
    
    performBulkOperation('/api/admin/cleanup/downloads/bulk-delete', selectedIds, 'Deleting');
}

// Handle bulk reset
function handleBulkReset() {
    const selectedIds = Array.from(document.querySelectorAll('#cleanupTableBody input[type="checkbox"]:checked'))
        .map(cb => parseInt(cb.value));
    
    if (selectedIds.length === 0) {
        showToast('No downloads selected', 'warning');
        return;
    }
    
    if (!confirm(`Are you sure you want to reset extraction status for ${selectedIds.length} download(s)? This will remove stems files but keep the original downloads.`)) {
        return;
    }
    
    performBulkOperation('/api/admin/cleanup/downloads/bulk-reset', selectedIds, 'Resetting');
}

// Perform bulk operation with progress tracking
function performBulkOperation(endpoint, downloadIds, operationName) {
    const progressDiv = document.getElementById('bulkProgress');
    const progressText = document.getElementById('bulkProgressText');
    const progressFill = document.getElementById('bulkProgressFill');
    
    // Show progress
    if (progressDiv) {
        progressDiv.style.display = 'block';
        progressText.textContent = `${operationName} ${downloadIds.length} item(s)...`;
        progressFill.style.width = '0%';
    }
    
    // Disable buttons during operation
    document.getElementById('bulkDeleteButton').disabled = true;
    document.getElementById('bulkResetExtractionsButton').disabled = true;
    document.getElementById('refreshCleanupButton').disabled = true;
    
    fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({ download_ids: downloadIds })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const successCount = data.deleted_count || data.reset_count || 0;
            const totalSize = data.total_size_freed || 0;
            
            let message = `${operationName} completed: ${successCount}/${data.total_count} items processed`;
            if (totalSize > 0) {
                message += `, ${formatFileSize(totalSize)} freed`;
            }
            
            showToast(message, 'success');
            
            // Animate progress to 100%
            if (progressFill) {
                progressFill.style.width = '100%';
            }
            
            // Reload data after a short delay
            setTimeout(() => {
                loadCleanupData();
                if (progressDiv) {
                    progressDiv.style.display = 'none';
                }
            }, 1500);
        } else {
            throw new Error(data.error || 'Operation failed');
        }
    })
    .catch(error => {
        console.error(`Error in bulk ${operationName.toLowerCase()}:`, error);
        showToast(`Error: ${error.message}`, 'error');
        
        if (progressDiv) {
            progressDiv.style.display = 'none';
        }
        
        // Re-enable buttons
        document.getElementById('bulkDeleteButton').disabled = false;
        document.getElementById('bulkResetExtractionsButton').disabled = false;
        document.getElementById('refreshCleanupButton').disabled = false;
        
        updateBulkButtonStates();
    });
}

// Delete single download
function deleteDownload(downloadId) {
    if (!confirm('Are you sure you want to permanently delete this download? This cannot be undone.')) {
        return;
    }
    
    fetch(`/api/admin/cleanup/downloads/${downloadId}`, {
        method: 'DELETE',
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Download deleted successfully', 'success');
            loadCleanupData(); // Refresh table
        } else {
            throw new Error(data.error || 'Delete failed');
        }
    })
    .catch(error => {
        console.error('Error deleting download:', error);
        showToast(`Error: ${error.message}`, 'error');
    });
}

// Reset single extraction
function resetExtraction(downloadId) {
    if (!confirm('Are you sure you want to reset the extraction status? This will remove stems files but keep the download.')) {
        return;
    }
    
    fetch(`/api/admin/cleanup/downloads/${downloadId}/reset-extraction`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Extraction status reset successfully', 'success');
            loadCleanupData(); // Refresh table
        } else {
            throw new Error(data.error || 'Reset failed');
        }
    })
    .catch(error => {
        console.error('Error resetting extraction:', error);
        showToast(`Error: ${error.message}`, 'error');
    });
}

// Utility function to truncate text
function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// ============ USER VIEW MANAGEMENT FUNCTIONS ============

// Remove download from user's personal list
function removeDownloadFromList(downloadId) {
    if (!confirm('Remove this download from your list? This will not delete the actual file.')) {
        return;
    }
    
    fetch(`/api/user/downloads/${downloadId}/remove-from-list`, {
        method: 'DELETE',
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => {
        console.log('Response status:', response.status);
        return response.text();
    })
    .then(data => {
        console.log('Raw response:', data);
        return JSON.parse(data);
    })
    .then(data => {
        if (data.success) {
            showToast(data.message, 'success');
            // Remove the element from DOM
            const downloadElement = document.getElementById(`download-${downloadId}`);
            if (downloadElement) {
                downloadElement.remove();
            }
            // Update management controls visibility
            updateUserManagementControls();
        } else {
            throw new Error(data.error || 'Remove failed');
        }
    })
    .catch(error => {
        console.error('Error removing download from list:', error);
        showToast(`Error: ${error.message}`, 'error');
    });
}

// Remove extraction from user's personal list
function removeExtractionFromList(downloadId) {
    if (!confirm('Remove this extraction from your list? This will not delete the actual stems.')) {
        return;
    }
    
    fetch(`/api/user/extractions/${downloadId}/remove-from-list`, {
        method: 'DELETE',
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(data.message, 'success');
            // Remove the element from DOM - find by download ID since extraction elements use extraction-{id} format
            const extractionElements = document.querySelectorAll('.extraction-item');
            extractionElements.forEach(element => {
                const checkbox = element.querySelector('.user-item-checkbox');
                if (checkbox && checkbox.dataset.downloadId === downloadId) {
                    element.remove();
                }
            });
            // Update management controls visibility
            updateUserManagementControls();
        } else {
            throw new Error(data.error || 'Remove failed');
        }
    })
    .catch(error => {
        console.error('Error removing extraction from list:', error);
        showToast(`Error: ${error.message}`, 'error');
    });
}

// Bulk remove downloads from user's list
function bulkRemoveDownloads() {
    const selectedCheckboxes = document.querySelectorAll('#downloadsContainer .user-item-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        showToast('No downloads selected', 'warning');
        return;
    }
    
    const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    
    if (!confirm(`Remove ${selectedIds.length} download(s) from your list? This will not delete the actual files.`)) {
        return;
    }
    
    fetch('/api/user/downloads/bulk-remove-from-list', {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({
            download_ids: selectedIds
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(`Removed ${data.removed_count} download(s) from your list`, 'success');
            // Remove elements from DOM
            selectedCheckboxes.forEach(checkbox => {
                const downloadElement = checkbox.closest('.download-item');
                if (downloadElement) {
                    downloadElement.remove();
                }
            });
            // Update management controls
            updateUserManagementControls();
        } else {
            throw new Error(data.error || 'Bulk remove failed');
        }
    })
    .catch(error => {
        console.error('Error bulk removing downloads:', error);
        showToast(`Error: ${error.message}`, 'error');
    });
}

// Bulk remove extractions from user's list
function bulkRemoveExtractions() {
    const selectedCheckboxes = document.querySelectorAll('#extractionsContainer .user-item-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        showToast('No extractions selected', 'warning');
        return;
    }
    
    const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    
    if (!confirm(`Remove ${selectedIds.length} extraction(s) from your list? This will not delete the actual stems.`)) {
        return;
    }
    
    fetch('/api/user/extractions/bulk-remove-from-list', {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({
            download_ids: selectedIds
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(`Removed ${data.removed_count} extraction(s) from your list`, 'success');
            // Remove elements from DOM
            selectedCheckboxes.forEach(checkbox => {
                const extractionElement = checkbox.closest('.extraction-item');
                if (extractionElement) {
                    extractionElement.remove();
                }
            });
            // Update management controls
            updateUserManagementControls();
        } else {
            throw new Error(data.error || 'Bulk remove failed');
        }
    })
    .catch(error => {
        console.error('Error bulk removing extractions:', error);
        showToast(`Error: ${error.message}`, 'error');
    });
}

// Update visibility and state of user management controls
function updateUserManagementControls() {
    // Update downloads management controls
    const downloadsContainer = document.getElementById('downloadsContainer');
    const downloadsManagementControls = document.getElementById('downloadsManagementControls');
    const downloadItems = downloadsContainer.querySelectorAll('.download-item');
    
    if (downloadItems.length > 0) {
        downloadsManagementControls.style.display = 'block';
    } else {
        downloadsManagementControls.style.display = 'none';
    }
    
    // Update extractions management controls
    const extractionsContainer = document.getElementById('extractionsContainer');
    const extractionsManagementControls = document.getElementById('extractionsManagementControls');
    const extractionItems = extractionsContainer.querySelectorAll('.extraction-item');
    
    if (extractionItems.length > 0) {
        extractionsManagementControls.style.display = 'block';
    } else {
        extractionsManagementControls.style.display = 'none';
    }
    
    // Update bulk action button states
    updateBulkActionButtons();
}

// Update bulk action button states based on selection
function updateBulkActionButtons() {
    // Downloads bulk button
    const selectedDownloads = document.querySelectorAll('#downloadsContainer .user-item-checkbox:checked');
    const bulkRemoveDownloadsButton = document.getElementById('bulkRemoveDownloadsButton');
    const selectAllUserDownloads = document.getElementById('selectAllUserDownloads');
    
    if (bulkRemoveDownloadsButton) {
        bulkRemoveDownloadsButton.disabled = selectedDownloads.length === 0;
    }
    
    // Update select all checkbox state for downloads
    if (selectAllUserDownloads) {
        const totalDownloads = document.querySelectorAll('#downloadsContainer .user-item-checkbox');
        if (totalDownloads.length === 0) {
            selectAllUserDownloads.indeterminate = false;
            selectAllUserDownloads.checked = false;
        } else if (selectedDownloads.length === totalDownloads.length) {
            selectAllUserDownloads.indeterminate = false;
            selectAllUserDownloads.checked = true;
        } else if (selectedDownloads.length > 0) {
            selectAllUserDownloads.indeterminate = true;
        } else {
            selectAllUserDownloads.indeterminate = false;
            selectAllUserDownloads.checked = false;
        }
    }
    
    // Extractions bulk button
    const selectedExtractions = document.querySelectorAll('#extractionsContainer .user-item-checkbox:checked');
    const bulkRemoveExtractionsButton = document.getElementById('bulkRemoveExtractionsButton');
    const selectAllUserExtractions = document.getElementById('selectAllUserExtractions');
    
    if (bulkRemoveExtractionsButton) {
        bulkRemoveExtractionsButton.disabled = selectedExtractions.length === 0;
    }
    
    // Update select all checkbox state for extractions
    if (selectAllUserExtractions) {
        const totalExtractions = document.querySelectorAll('#extractionsContainer .user-item-checkbox');
        if (totalExtractions.length === 0) {
            selectAllUserExtractions.indeterminate = false;
            selectAllUserExtractions.checked = false;
        } else if (selectedExtractions.length === totalExtractions.length) {
            selectAllUserExtractions.indeterminate = false;
            selectAllUserExtractions.checked = true;
        } else if (selectedExtractions.length > 0) {
            selectAllUserExtractions.indeterminate = true;
        } else {
            selectAllUserExtractions.indeterminate = false;
            selectAllUserExtractions.checked = false;
        }
    }
}

// Initialize user management functionality
function initializeUserManagement() {
    // Setup select all checkboxes
    const selectAllUserDownloads = document.getElementById('selectAllUserDownloads');
    if (selectAllUserDownloads) {
        selectAllUserDownloads.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('#downloadsContainer .user-item-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            updateBulkActionButtons();
        });
    }
    
    const selectAllUserExtractions = document.getElementById('selectAllUserExtractions');
    if (selectAllUserExtractions) {
        selectAllUserExtractions.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('#extractionsContainer .user-item-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            updateBulkActionButtons();
        });
    }
    
    // Setup bulk action buttons
    const bulkRemoveDownloadsButton = document.getElementById('bulkRemoveDownloadsButton');
    if (bulkRemoveDownloadsButton) {
        bulkRemoveDownloadsButton.addEventListener('click', bulkRemoveDownloads);
    }
    
    const bulkRemoveExtractionsButton = document.getElementById('bulkRemoveExtractionsButton');
    if (bulkRemoveExtractionsButton) {
        bulkRemoveExtractionsButton.addEventListener('click', bulkRemoveExtractions);
    }
    
    // Setup event delegation for individual checkboxes
    document.addEventListener('change', function(event) {
        if (event.target.classList.contains('user-item-checkbox')) {
            updateBulkActionButtons();
        }
    });
}

// Call initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUserManagement);
} else {
    initializeUserManagement();
}

// ============ LIBRARY TAB FUNCTIONS ============

let currentLibraryFilter = 'all';
let currentLibrarySearch = '';

// Load library content
function loadLibrary(filter = currentLibraryFilter, search = currentLibrarySearch) {
    const libraryContainer = document.getElementById('libraryContainer');
    if (!libraryContainer) return;
    
    // Show loading state
    libraryContainer.innerHTML = '<div class="library-loading"><i class="fas fa-spinner fa-spin"></i> Loading library...</div>';
    
    // Update current filter and search
    currentLibraryFilter = filter;
    currentLibrarySearch = search;
    
    // Build query parameters
    const params = new URLSearchParams();
    if (filter !== 'all') params.append('filter', filter);
    if (search.trim()) params.append('search', search.trim());
    
    fetch(`/api/library?${params.toString()}`, {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            displayLibraryItems(data.items);
            updateLibraryStats(data.total_count, data.filter, data.search);
        } else {
            libraryContainer.innerHTML = `<div class="library-loading">Error: ${data.error}</div>`;
            showToast(`Error loading library: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        console.error('Error loading library:', error);
        libraryContainer.innerHTML = '<div class="library-loading">Error loading library</div>';
        showToast('Error loading library', 'error');
    });
}

// Display library items
function displayLibraryItems(items) {
    const libraryContainer = document.getElementById('libraryContainer');
    
    if (items.length === 0) {
        libraryContainer.innerHTML = '<div class="library-loading">No items found in library</div>';
        return;
    }
    
    libraryContainer.innerHTML = '';
    
    items.forEach(item => {
        const libraryItem = createLibraryItem(item);
        libraryContainer.appendChild(libraryItem);
    });
}

// Create library item element
function createLibraryItem(item) {
    const itemElement = document.createElement('div');
    itemElement.className = 'library-item';
    itemElement.id = `library-item-${item.id}`;
    
    // Format file size
    const fileSize = item.file_size ? formatFileSize(item.file_size) : 'Unknown';
    
    // Format creation date
    const createdDate = new Date(item.created_at).toLocaleDateString();
    
    // Determine badge class and text
    let badgeClass = item.badge_type;
    let badgeText = item.badge_type === 'both' ? 'Download & Extract' : 
                   item.badge_type === 'download' ? 'Download' : 'Extract';
    
    itemElement.innerHTML = `
        <div class="library-item-header">
            <div class="library-item-info">
                <div class="library-item-title">${item.title}</div>
                <div class="library-item-meta">
                    <span>Video ID: ${item.video_id}</span>
                    <span>Users: ${item.user_count}</span>
                    <span>Size: ${fileSize}</span>
                    <span>Created: ${createdDate}</span>
                </div>
            </div>
            <div class="library-item-badges">
                <span class="library-badge ${badgeClass}">${badgeText}</span>
            </div>
        </div>
        <div class="library-item-actions">
            ${item.can_add_download ? `
                <button class="library-action-button" data-action="add-download" data-id="${item.id}">
                    <i class="fas fa-plus"></i> Add Download
                </button>
            ` : ''}
            ${item.can_add_extraction ? `
                <button class="library-action-button" data-action="add-extraction" data-id="${item.id}">
                    <i class="fas fa-plus"></i> Add Extraction
                </button>
            ` : ''}
            ${!item.can_add_download && !item.can_add_extraction ? `
                <span class="library-action-button secondary" disabled>
                    <i class="fas fa-check"></i> Already in your list
                </span>
            ` : ''}
        </div>
    `;
    
    // Add event listeners for action buttons
    itemElement.querySelectorAll('.library-action-button[data-action]').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            const id = button.dataset.id;
            
            if (action === 'add-download') {
                addLibraryDownload(id, button);
            } else if (action === 'add-extraction') {
                addLibraryExtraction(id, button);
            }
        });
    });
    
    return itemElement;
}

// Add download from library to user's list
function addLibraryDownload(globalDownloadId, button) {
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    button.disabled = true;
    
    fetch(`/api/library/${globalDownloadId}/add-download`, {
        method: 'POST',
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(data.message, 'success');
            button.innerHTML = '<i class="fas fa-check"></i> Added to Downloads';
            button.classList.add('secondary');
            button.disabled = true;
            
            // Refresh downloads tab if it's loaded
            if (typeof loadDownloads === 'function') {
                loadDownloads();
            }
        } else {
            showToast(`Error: ${data.error}`, 'error');
            button.innerHTML = originalText;
            button.disabled = false;
        }
    })
    .catch(error => {
        console.error('Error adding download:', error);
        showToast('Error adding download from library', 'error');
        button.innerHTML = originalText;
        button.disabled = false;
    });
}

// Add extraction from library to user's list
function addLibraryExtraction(globalDownloadId, button) {
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    button.disabled = true;
    
    fetch(`/api/library/${globalDownloadId}/add-extraction`, {
        method: 'POST',
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(data.message, 'success');
            button.innerHTML = '<i class="fas fa-check"></i> Added to Extractions';
            button.classList.add('secondary');
            button.disabled = true;
            
            // Refresh extractions tab if it's loaded
            if (typeof loadExtractions === 'function') {
                loadExtractions();
            }
        } else {
            showToast(`Error: ${data.error}`, 'error');
            button.innerHTML = originalText;
            button.disabled = false;
        }
    })
    .catch(error => {
        console.error('Error adding extraction:', error);
        showToast('Error adding extraction from library', 'error');
        button.innerHTML = originalText;
        button.disabled = false;
    });
}

// Update library stats display
function updateLibraryStats(totalCount, filter, search) {
    const statsElement = document.getElementById('libraryItemCount');
    if (!statsElement) return;
    
    let filterText = '';
    if (filter === 'downloads') filterText = ' downloads';
    else if (filter === 'extractions') filterText = ' extractions';
    else filterText = ' items';
    
    let searchText = search ? ` matching "${search}"` : '';
    
    statsElement.textContent = `${totalCount}${filterText}${searchText}`;
}

// Format file size for display
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Initialize library tab event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Filter buttons
    document.querySelectorAll('.filter-button').forEach(button => {
        button.addEventListener('click', () => {
            // Update active filter button
            document.querySelectorAll('.filter-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Load library with new filter
            const filter = button.dataset.filter;
            loadLibrary(filter, currentLibrarySearch);
        });
    });
    
    // Search functionality
    const searchInput = document.getElementById('librarySearchInput');
    const searchButton = document.getElementById('librarySearchButton');
    
    if (searchButton) {
        searchButton.addEventListener('click', () => {
            const searchQuery = searchInput ? searchInput.value : '';
            loadLibrary(currentLibraryFilter, searchQuery);
        });
    }
    
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const searchQuery = searchInput.value;
                loadLibrary(currentLibraryFilter, searchQuery);
            }
        });
    }
});