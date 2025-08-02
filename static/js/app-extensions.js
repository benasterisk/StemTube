// Tab state management
const TAB_STORAGE_KEY = 'stemtube_active_tab';

// Switch to a specific tab and save state
function switchToTab(tabId) {
    // Update active tab button
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    const targetButton = document.querySelector(`[data-tab="${tabId}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    }
    
    // Update active tab content
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    const targetTab = document.getElementById(`${tabId}Tab`);
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // Update left panel content based on active tab
    updateLeftPanelContent(tabId);
    
    // Save current tab to localStorage
    try {
        localStorage.setItem(TAB_STORAGE_KEY, tabId);
    } catch (error) {
        console.warn('Could not save tab state to localStorage:', error);
    }
}

// Restore the last active tab on page load
function restoreActiveTab() {
    try {
        const savedTab = localStorage.getItem(TAB_STORAGE_KEY);
        if (savedTab) {
            // Check if the saved tab still exists (user might not be admin anymore, etc.)
            const tabButton = document.querySelector(`[data-tab="${savedTab}"]`);
            const tabContent = document.getElementById(`${savedTab}Tab`);
            
            if (tabButton && tabContent) {
                switchToTab(savedTab);
                return;
            }
        }
    } catch (error) {
        console.warn('Could not restore tab state from localStorage:', error);
    }
    
    // Fallback: switch to first available tab (admin tab if user is admin, otherwise downloads)
    const firstTab = document.querySelector('.tab-button');
    if (firstTab) {
        switchToTab(firstTab.dataset.tab);
    } else {
        // Ultimate fallback
        switchToTab('downloads');
    }
}

// Left panel content management functions

// Update left panel content based on active tab
function updateLeftPanelContent(tabId) {
    // Hide all left panel content
    document.querySelectorAll('.left-panel-content').forEach(content => {
        content.style.display = 'none';
    });
    
    // Show appropriate content based on tab
    switch (tabId) {
        case 'downloads':
        case 'admin':
            document.getElementById('searchContent').style.display = 'flex';
            break;
        case 'extractions':
            document.getElementById('downloadsContent').style.display = 'flex';
            // Load downloads list for extraction if not already loaded
            loadDownloadsForExtraction();
            break;
        case 'mixer':
            document.getElementById('extractionsContent').style.display = 'flex';
            // Load extractions list for mixer if not already loaded
            loadExtractionsForMixer();
            // Restore mixer state if needed
            restoreMixerIfNeeded();
            break;
        default:
            document.getElementById('searchContent').style.display = 'flex';
            break;
    }
}

// Load downloads data specifically for extraction panel
function loadDownloadsForExtraction() {
    fetch('/api/downloads', {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.ok ? response.json() : Promise.reject('Failed to load downloads'))
    .then(data => updateDownloadsListForExtraction(data))
    .catch(error => {
        console.error('Error loading downloads for extraction:', error);
        const container = document.getElementById('downloadsListForExtraction');
        if (container) {
            container.innerHTML = '<div class="empty-state">Failed to load downloads</div>';
        }
    });
}

// Load extractions data specifically for mixer panel
function loadExtractionsForMixer() {
    fetch('/api/extractions', {
        headers: {
            'X-CSRF-Token': getCsrfToken()
        }
    })
    .then(response => response.ok ? response.json() : Promise.reject('Failed to load extractions'))
    .then(data => updateExtractionsListForMixer(data))
    .catch(error => {
        console.error('Error loading extractions for mixer:', error);
        const container = document.getElementById('extractionsListForMixer');
        if (container) {
            container.innerHTML = '<div class="empty-state">Failed to load extractions</div>';
        }
    });
}

// Update downloads list for extraction (called from loadDownloads)
function updateDownloadsListForExtraction(data) {
    const container = document.getElementById('downloadsListForExtraction');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Filter completed downloads
    const completedDownloads = data.filter(item => item.status === 'completed');
    
    if (completedDownloads.length === 0) {
        container.innerHTML = '<div class="empty-state">No downloads available for extraction</div>';
        return;
    }
    
    // Sort by creation time (newest first)
    completedDownloads.sort((a, b) => {
        const timeA = isNaN(a.created_at) ? new Date(a.created_at) : new Date(parseInt(a.created_at) * 1000);
        const timeB = isNaN(b.created_at) ? new Date(b.created_at) : new Date(parseInt(b.created_at) * 1000);
        return timeB - timeA;
    });
    
    completedDownloads.forEach(item => {
        const compactElement = createCompactDownloadElement(item);
        container.appendChild(compactElement);
    });
}

// Update extractions list for mixer (called from loadExtractions)
function updateExtractionsListForMixer(data) {
    const container = document.getElementById('extractionsListForMixer');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Filter completed extractions
    const completedExtractions = data.filter(item => item.status === 'completed');
    
    if (completedExtractions.length === 0) {
        container.innerHTML = '<div class="empty-state">No extractions available for mixing</div>';
        return;
    }
    
    // Sort by creation time (newest first)
    completedExtractions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    completedExtractions.forEach(item => {
        const compactElement = createCompactExtractionElement(item);
        container.appendChild(compactElement);
    });
}

// Create compact download element for extraction panel
function createCompactDownloadElement(item) {
    const itemId = item.download_id || item.id || item.video_id;
    
    const element = document.createElement('div');
    element.className = 'download-item-compact';
    element.dataset.downloadId = itemId;
    element.dataset.videoId = item.video_id;
    
    element.innerHTML = `
        <div class="compact-item-title" title="${item.title}">${item.title}</div>
        <div class="compact-item-status">Ready for extraction</div>
    `;
    
    element.addEventListener('click', () => {
        // Clear selection
        document.querySelectorAll('.download-item-compact').forEach(el => {
            el.classList.remove('selected');
        });
        element.classList.add('selected');
        
        // Open extraction modal for this download
        openExtractionModal(item.video_id, item.title, item.file_path);
    });
    
    return element;
}

// Create compact extraction element for mixer panel
function createCompactExtractionElement(item) {
    const itemId = item.extraction_id || item.id || item.video_id;
    
    const element = document.createElement('div');
    element.className = 'extraction-item-compact';
    element.dataset.extractionId = itemId;
    element.dataset.videoId = item.video_id;
    
    const stemCount = item.stems_paths ? Object.keys(item.stems_paths).length : 4;
    
    element.innerHTML = `
        <div class="compact-item-title" title="${item.title}">${item.title}</div>
        <div class="compact-item-status">${stemCount} stems • ${item.model || 'htdemucs'}</div>
    `;
    
    element.addEventListener('click', () => {
        // Clear selection
        document.querySelectorAll('.extraction-item-compact').forEach(el => {
            el.classList.remove('selected');
        });
        element.classList.add('selected');
        
        // Load this extraction in the mixer
        loadExtractionInMixer(itemId);
    });
    
    return element;
}

// Load extraction in mixer
function loadExtractionInMixer(extractionId) {
    const mixerFrame = document.getElementById('mixerFrame');
    if (mixerFrame) {
        // Save the active extraction ID for persistence
        saveMixerState({ activeExtractionId: extractionId });
        
        // Update the mixer iframe src to load specific extraction
        mixerFrame.src = `/mixer?extraction_id=${encodeURIComponent(extractionId)}`;
        
        // Show loading indicator
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv) {
            loadingDiv.style.display = 'block';
        }
        mixerFrame.style.display = 'none';
        
        showToast(`Loading extraction in mixer...`, 'info');
    }
}

// Mixer state persistence
const MIXER_STATE_KEY = 'stemtube_mixer_state';

// Save mixer state to localStorage
function saveMixerState(state) {
    try {
        const currentState = getMixerState();
        const newState = { ...currentState, ...state };
        localStorage.setItem(MIXER_STATE_KEY, JSON.stringify(newState));
    } catch (error) {
        console.warn('Could not save mixer state to localStorage:', error);
    }
}

// Get mixer state from localStorage
function getMixerState() {
    try {
        const state = localStorage.getItem(MIXER_STATE_KEY);
        return state ? JSON.parse(state) : {};
    } catch (error) {
        console.warn('Could not load mixer state from localStorage:', error);
        return {};
    }
}

// Clear mixer state
function clearMixerState() {
    try {
        localStorage.removeItem(MIXER_STATE_KEY);
    } catch (error) {
        console.warn('Could not clear mixer state from localStorage:', error);
    }
}

// Restore mixer on tab switch to mixer
function restoreMixerIfNeeded() {
    const mixerState = getMixerState();
    if (mixerState.activeExtractionId) {
        const mixerFrame = document.getElementById('mixerFrame');
        if (mixerFrame && !mixerFrame.src.includes('extraction_id=')) {
            // Only restore if no extraction is currently loaded
            loadExtractionInMixer(mixerState.activeExtractionId);
        }
    }
}

// Initialize left panel content on page load
document.addEventListener('DOMContentLoaded', () => {
    // Restore the last active tab or default to downloads
    restoreActiveTab();
});