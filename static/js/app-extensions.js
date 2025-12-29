// Tab state management
const TAB_STORAGE_KEY = 'stemtube_active_tab';

// Check extraction status for a video (shared function)
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

// Grant access to existing extraction (shared function)
async function grantExtractionAccess(videoId, element) {
    try {
        const originalHTML = element.innerHTML;
        element.innerHTML = '<div class="compact-item-title">Granting access...</div><div class="compact-item-status">Please wait</div>';
        
        const response = await fetch('/api/extractions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify({
                video_id: videoId,
                grant_access_only: true
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to grant access');
        }
        
        const result = await response.json();
        
        // Success - show success message and switch to mixer
        showToast('Access granted! Opening mixer...', 'success');
        
        // Switch to mixer tab and load this extraction
        switchToTab('mixer');
        loadExtractionInMixer(result.extraction_id);
        
    } catch (error) {
        console.error('Error granting access:', error);
        element.innerHTML = originalHTML;
        showToast('Failed to grant access. Please try again.', 'error');
    }
}

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
    
    // Refresh data when switching to specific tabs
    if (tabId === 'downloads') {
        loadDownloads(); // Refresh downloads list
    } else if (tabId === 'library') {
        loadLibrary(); // Load library content
    } else if (tabId === 'admin') {
        // Initialize admin section to users by default
        setTimeout(() => switchAdminSection('users'), 100);
    }
    
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
            document.getElementById('searchContent').style.display = 'flex';
            break;
        case 'admin':
            document.getElementById('adminMenuContent').style.display = 'flex';
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
async function updateDownloadsListForExtraction(data) {
    const container = document.getElementById('downloadsListForExtraction');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Filtering downloads...</div>';
    
    // Filter completed downloads
    const completedDownloads = data.filter(item => item.status === 'completed');
    
    if (completedDownloads.length === 0) {
        container.innerHTML = '<div class="empty-state">No downloads available for extraction</div>';
        return;
    }
    
    // Filter downloads based on extraction status
    const actionableDownloads = [];
    
    for (const item of completedDownloads) {
        try {
            // Check extraction status for each download
            const extractionStatus = await checkExtractionStatus(item.video_id);
            
            // Include downloads that are:
            // 1. Not extracted yet (status: 'not_extracted')
            // 2. Extracted by someone else but user has no access (status: 'extracted_no_access')
            if (extractionStatus.status === 'not_extracted' || extractionStatus.status === 'extracted_no_access') {
                actionableDownloads.push({
                    ...item,
                    extractionStatus: extractionStatus
                });
            }
        } catch (error) {
            console.warn('Error checking extraction status for', item.video_id, error);
            // On error, assume not extracted and include it
            actionableDownloads.push({
                ...item,
                extractionStatus: { status: 'not_extracted' }
            });
        }
    }
    
    container.innerHTML = '';
    
    if (actionableDownloads.length === 0) {
        container.innerHTML = '<div class="empty-state">No downloads available for extraction</div>';
        return;
    }
    
    // Sort by creation time (newest first)
    actionableDownloads.sort((a, b) => {
        const timeA = isNaN(a.created_at) ? new Date(a.created_at) : new Date(parseInt(a.created_at) * 1000);
        const timeB = isNaN(b.created_at) ? new Date(b.created_at) : new Date(parseInt(b.created_at) * 1000);
        return timeB - timeA;
    });
    
    actionableDownloads.forEach(item => {
        const compactElement = createCompactDownloadElement(item);
        if (compactElement) {
            container.appendChild(compactElement);
        }
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
        if (compactElement) {
            container.appendChild(compactElement);
        } else {
            console.warn('Failed to create compact element for extraction:', item);
        }
    });
}

// Create compact download element for extraction panel
function createCompactDownloadElement(item) {
    const itemId = item.download_id || item.id || item.video_id;
    
    const element = document.createElement('div');
    element.className = 'download-item-compact';
    element.dataset.downloadId = itemId;
    element.dataset.videoId = item.video_id;
    
    // Determine status text based on extraction status
    let statusText = 'Ready for extraction';
    let statusClass = '';
    
    if (item.extractionStatus) {
        if (item.extractionStatus.status === 'extracted_no_access') {
            statusText = 'Already extracted - click for access';
            statusClass = 'extracted-no-access';
        }
    }
    
    element.innerHTML = `
        <div class="compact-item-title" title="${item.title}">${item.title}</div>
        <div class="compact-item-status ${statusClass}">${statusText}</div>
    `;
    
    element.addEventListener('click', () => {
        // Clear selection
        document.querySelectorAll('.download-item-compact').forEach(el => {
            el.classList.remove('selected');
        });
        element.classList.add('selected');
        
        // Check extraction status to determine action
        if (item.extractionStatus && item.extractionStatus.status === 'extracted_no_access') {
            // Extracted by someone else - grant access directly
            grantExtractionAccess(item.video_id, element);
        } else {
            // Not extracted - open extraction modal
            openExtractionModal(itemId, item.title, item.file_path, item.video_id);
        }
    });
    
    return element;
}

// Function to get expected stem count based on model name
function getExpectedStemCount(modelName) {
    if (!modelName) return 4;

    const stemCounts = {
        'htdemucs': 4,
        'htdemucs_ft': 4,
        'htdemucs_6s': 6,
        'mdx_extra': 4,
        'mdx_extra_q': 4
    };

    // Handle variations in model names - normalize to lowercase and remove special chars
    const normalizedModel = modelName.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // Check for exact matches first
    if (stemCounts[normalizedModel]) {
        return stemCounts[normalizedModel];
    }

    // Check for partial matches (e.g., "HTDemucs 6-stem" -> 6)
    if (normalizedModel.includes('6s') || normalizedModel.includes('6_stem')) {
        return 6;
    }

    // Default to 4 stems for unknown models
    return 4;
}

// Create compact extraction element for mixer panel
function createCompactExtractionElement(item) {
    // Use extraction_id from API (format: download_X for historical, timestamp_X for live)
    const itemId = item.extraction_id;

    if (!itemId) {
        console.error('No extraction_id found for item:', item);
        return null;
    }

    const element = document.createElement('div');
    element.className = 'extraction-item-compact';
    element.dataset.extractionId = itemId;
    element.dataset.videoId = item.video_id;

    // Use actual stems_paths if available, otherwise get expected count from model
    const stemCount = item.stems_paths ?
        Object.keys(item.stems_paths).length :
        getExpectedStemCount(item.model_name);
    
    element.innerHTML = `
        <div class="compact-item-title" title="${item.title}">${item.title}</div>
        <div class="compact-item-status">${stemCount} stems • ${item.model_name || 'HTDemucs (4 stems)'}</div>
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

// Admin menu functionality
function switchAdminSection(sectionName) {
    // Update active admin menu item
    document.querySelectorAll('.admin-menu-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeItem = document.querySelector(`[data-admin-section="${sectionName}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }
    
    // Show/hide admin sections
    document.querySelectorAll('.admin-section').forEach(section => {
        section.style.display = 'none';
    });
    
    const targetSection = document.getElementById(`${sectionName}Section`);
    if (targetSection) {
        targetSection.style.display = 'block';
        
        // Load data for the specific section if needed
        if (sectionName === 'cleanup') {
            // Load cleanup data if switching to cleanup section
            // The cleanup functionality should already be initialized
            if (typeof loadCleanupData === 'function') {
                loadCleanupData();
            }
        } else if (sectionName === 'users') {
            // Load admin iframe for users section
            const adminFrame = document.getElementById('adminFrame');
            if (adminFrame) {
                adminFrame.style.display = 'block';
                // Hide loading text
                const loadingDiv = adminFrame.previousElementSibling;
                if (loadingDiv && loadingDiv.classList.contains('loading')) {
                    loadingDiv.style.display = 'none';
                }
            }
        }
    }
}

// Initialize left panel content on page load
document.addEventListener('DOMContentLoaded', () => {
    // Restore the last active tab or default to downloads
    restoreActiveTab();
    
    // Initialize admin menu event listeners
    document.querySelectorAll('.admin-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const sectionName = item.dataset.adminSection;
            if (sectionName) {
                switchAdminSection(sectionName);
            }
        });
    });
    
    // Initialize with users section by default for admin tab
    switchAdminSection('users');

    // Listen for song title messages from mixer iframe
    window.addEventListener('message', (event) => {
        if (event.data.type === 'mixer_song_title') {
            const mixerSongTitleDisplay = document.getElementById('mixer-song-title-display');
            if (mixerSongTitleDisplay && event.data.title) {
                mixerSongTitleDisplay.textContent = event.data.title;
                console.log('[MIXER TITLE] Updated parent window with song title:', event.data.title);
            }
        }
    });
});