// Simple and reliable fix: Add periodic refresh when user is waiting for extraction
// This goes in static/js/app.js

// Track if user is waiting for an extraction to complete
let waitingForExtraction = false;
let extractionPollInterval = null;

// Function to start polling when user gets "pending" popup
function startExtractionPolling() {
    if (waitingForExtraction) return; // Already polling
    
    waitingForExtraction = true;
    console.log('[EXTRACTION POLL] Starting periodic refresh while waiting');
    
    // Poll every 10 seconds while waiting
    extractionPollInterval = setInterval(() => {
        console.log('[EXTRACTION POLL] Refreshing extraction list...');
        loadExtractions();
    }, 10000); // 10 seconds
    
    // Stop polling after 5 minutes max
    setTimeout(() => {
        stopExtractionPolling();
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

// Call startExtractionPolling() when user gets "currently extracted by another user" popup
// Call stopExtractionPolling() when user sees the new extraction or leaves the page

// This is a simple, reliable fallback that doesn't rely on WebSocket broadcasting