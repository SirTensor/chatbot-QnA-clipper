// Add a cleanup for unused variables at the beginning of the file
// Save format settings to storage whenever they change
function saveSettings() {
  const settings = {
    headerLevel: document.getElementById('headerLevel').value,
    labelStyle: document.getElementById('labelStyle').value,
    numberFormat: document.getElementById('numberFormat').value,
    imageFormat: document.getElementById('imageFormat').value,
    imageLabel: document.getElementById('imageLabel').value,
    includePlatform: document.getElementById('includePlatform').checked
  };
  
  // Save to local storage
  chrome.storage.local.set({ formatSettings: settings }, () => {
    // console.log('Saved settings:', settings);
  });
  return settings;
}

// Function to show manual copy UI when automatic clipboard fails
function showManualCopyUI(text) {
  if (!text) return;
  
  // Hide normal UI and show manual copy UI
  document.getElementById('normalUI').style.display = 'none';
  document.getElementById('manualCopyUI').style.display = 'block';
  
  // Set the text content
  document.getElementById('extractedTextArea').value = text;
}

// Update the displayed shortcut from Chrome's commands API
function updateShortcutDisplay() {
  chrome.commands.getAll((commands) => {
    const extractCommand = commands.find(cmd => cmd.name === 'trigger-extraction');
    const shortcutElement = document.getElementById('currentShortcut');
    
    if (extractCommand && extractCommand.shortcut) {
      shortcutElement.textContent = extractCommand.shortcut;
    } else {
      shortcutElement.textContent = 'No shortcut set';
    }
  });
}

// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', () => {
  // Load settings
  chrome.storage.local.get('formatSettings', (data) => {
    if (data.formatSettings) {
      document.getElementById('headerLevel').value = data.formatSettings.headerLevel || '2';
      document.getElementById('labelStyle').value = data.formatSettings.labelStyle || 'qa';
      document.getElementById('numberFormat').value = data.formatSettings.numberFormat || 'space';

      document.getElementById('includePlatform').checked = data.formatSettings.includePlatform || false;
      
      // Set image format options if they exist
      if (data.formatSettings.imageFormat) {
        document.getElementById('imageFormat').value = data.formatSettings.imageFormat;
      }
      
      if (data.formatSettings.imageLabel) {
        document.getElementById('imageLabel').value = data.formatSettings.imageLabel;
      }
    }
  });
  
  // Update the shortcut display
  updateShortcutDisplay();
  
  // Add change listeners to all selects
  document.getElementById('headerLevel').addEventListener('change', saveSettings);
  document.getElementById('labelStyle').addEventListener('change', saveSettings);
  document.getElementById('numberFormat').addEventListener('change', saveSettings);
  document.getElementById('imageFormat').addEventListener('change', saveSettings);
  document.getElementById('imageLabel').addEventListener('change', saveSettings);
  document.getElementById('imageLabel').addEventListener('input', saveSettings);

  document.getElementById('includePlatform').addEventListener('change', saveSettings);
  
  // Add click handler for the shortcut config link
  document.getElementById('shortcutConfigLink').addEventListener('click', (e) => {
    e.preventDefault();
    // Open Chrome's extensions shortcut page
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
  
  // Handle the copy button click
  document.getElementById('copyButton').addEventListener('click', () => {
    updateStatus('Extracting Q&A...');
    
    // Just send a message to the background script to start extraction
    chrome.runtime.sendMessage({ action: 'start-extraction' }, (response) => {
      if (chrome.runtime.lastError) {
        updateStatus('Error: ' + chrome.runtime.lastError.message);
        return;
      }
      
      // Don't update status here - wait for extraction-complete message instead
      if (!response || !response.success) {
        if (response && response.error === 'Ignoring rapid trigger (debounce)') {
          updateStatus('Please wait before clicking again.');
        } else if (response && response.error) {
          updateStatus('Error: ' + response.error);
        } else {
          updateStatus('Error starting extraction');
        }
      }
    });
  });
  
  // Add event listeners for manual copy UI
  document.getElementById('manualCopyButton').addEventListener('click', () => {
    const textArea = document.getElementById('extractedTextArea');
    textArea.select();
    document.execCommand('copy');
    updateStatus('Copied to clipboard!');
    
    // Return to normal UI after brief delay
    setTimeout(() => {
      document.getElementById('manualCopyUI').style.display = 'none';
      document.getElementById('normalUI').style.display = 'block';
    }, 1500);
  });
  
  document.getElementById('backButton').addEventListener('click', () => {
    document.getElementById('manualCopyUI').style.display = 'none';
    document.getElementById('normalUI').style.display = 'block';
  });
});

// Listen for runtime messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'clipboard-failed' && request.text) {
    showManualCopyUI(request.text);
    sendResponse({ success: true });
  }
  
  // Handle extraction complete message
  if (request.action === 'extraction-complete') {
    if (request.success) {
      updateStatus(request.message || 'Q&A copied to clipboard!');
    } else {
      updateStatus('Error: ' + (request.message || 'Extraction failed'));
    }
    sendResponse({ received: true });
  }
  
  return true;
});

// Function to update status message
function updateStatus(message) {
  const statusDiv = document.getElementById('status');
  if (statusDiv) {
    statusDiv.textContent = message;
  }
} 