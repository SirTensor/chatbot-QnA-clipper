// --- START OF FILE background.js ---

/**
 * Background script for Chatbot Q&A Clipper
 * Central controller that orchestrates the extraction process
 */

// Import the formatter
importScripts('formatter.js');

// Track the last shortcut trigger time to prevent duplicates
let lastTriggerTime = 0;

/**
 * Sends a message to the popup, handling the case where the popup might be closed.
 * @param {object} message - The message object to send.
 */
function sendMessageToPopup(message) {
  chrome.runtime.sendMessage(message, (response) => {
    // chrome.runtime.lastError is set when an error occurs during message sending,
    // especially relevant if the receiving end doesn't exist (popup is closed).
    if (chrome.runtime.lastError) {
      const errorMessage = chrome.runtime.lastError.message;
      // Check if the error is the specific one we expect when the popup is closed.
      if (errorMessage.includes('Receiving end does not exist') || errorMessage.includes('Could not establish connection')) {
        // This is expected if the popup isn't open. Log minimally or ignore.
        // console.log(`Popup not available for message action "${message.action}". Skipping.`);
      } else {
        // Log other unexpected errors.
        console.warn(`Unexpected error sending message (${message.action}) to popup:`, chrome.runtime.lastError);
      }
    } else {
      // Optional: Handle successful response if needed.
      // console.log(`Message action "${message.action}" sent successfully to popup. Response:`, response);
    }
  });
}

// New function to ensure the offscreen document exists
async function ensureOffscreenDocumentExists() {
  // Check if we already have an offscreen document
  if (await chrome.offscreen.hasDocument()) {
    return;
  }
  
  // Create the offscreen document
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['CLIPBOARD'],
    justification: 'Write to the clipboard'
  });
}

// New function to copy text to clipboard using offscreen API
async function copyToClipboardViaOffscreen(text) {
  try {
    // Ensure offscreen document exists
    await ensureOffscreenDocumentExists();
    
    // Send message to the offscreen document
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'copy-to-clipboard',
        text: text
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error in offscreen clipboard operation:', chrome.runtime.lastError);
          resolve(false);
        } else {
          resolve(response && response.success === true);
        }
        
        // Schedule cleanup after copying
        setTimeout(async () => {
          try {
            if (await chrome.offscreen.hasDocument()) {
              await chrome.offscreen.closeDocument();
            }
          } catch (closeError) {
            console.warn('Error closing offscreen document:', closeError);
          }
        }, 500);
      });
    });
  } catch (error) {
    console.error('Error using offscreen API for clipboard:', error);
    return false;
  }
}

// On installation, set up the extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Chatbot Q&A Clipper extension installed');

  // Check the current shortcut settings
  chrome.storage.local.get('formatSettings', (data) => {
    console.log('Current format settings:', data.formatSettings);

    // If no settings exist, initialize with defaults
    if (!data.formatSettings) {
      const defaultSettings = {
        headerLevel: '1',
        labelStyle: 'qa',
        numberFormat: 'space',
        imageFormat: 'bracketed',
        imageLabel: ''
        // Note: customShortcut removed as it's now handled by Chrome's native commands API
      };

      chrome.storage.local.set({ formatSettings: defaultSettings }, () => {
        console.log('Initialized default settings:', defaultSettings);
      });
    }
  });
});

// Listen for commands from the Chrome Commands API
chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);

  // Check if this is our extraction command
  if (command === 'trigger-extraction') {
    // Debounce to prevent multiple rapid triggers (increased debounce time)
    const now = Date.now();
    if (now - lastTriggerTime < 1000) { // Increased to 1000ms
      console.log('Ignoring rapid shortcut trigger');
      return;
    }
    lastTriggerTime = now;

    // Trigger the extraction process
    console.log('Shortcut triggered extraction');
    extractQA(); // Call the async function, but don't need to await here
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start-extraction') {
    console.log('Received extraction request from popup');

    // Apply debounce here too for consistency
    const now = Date.now();
    if (now - lastTriggerTime < 1000) { // Use same debounce as shortcut
      console.log('Ignoring rapid popup trigger');
      sendResponse({ success: false, error: 'Ignoring rapid trigger (debounce)' });
      return false; // Indicate synchronous response
    }
    lastTriggerTime = now;

    // For popup triggers, we need to pre-check URL validity and show errors
    // instead of silently exiting like the global shortcut does
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        // Validate tab exists
        if (!tabs || tabs.length === 0 || !tabs[0] || !tabs[0].id) {
          console.error('No active tab found for popup extraction');
          sendResponse({ success: false, error: 'No active tab found.' });
          sendMessageToPopup({
            action: 'extraction-complete',
            success: false,
            message: 'Error: No active tab found.'
          });
          return;
        }

        const tab = tabs[0];
        const tabId = tab.id;
        const tabUrl = tab.url;

        // Check if URL exists
        if (!tabUrl) {
          console.error('Tab URL is missing for popup extraction');
          sendResponse({ success: false, error: 'Missing page URL.' });
          sendMessageToPopup({
            action: 'extraction-complete',
            success: false,
            message: 'Error: Missing page URL.'
          });
          return;
        }

        // Check if URL uses http/https protocol (excludes chrome://, file://, etc.)
        if (!tabUrl.startsWith('http:') && !tabUrl.startsWith('https:')) {
          console.log(`Non-web URL detected (${tabUrl}) for popup extraction - showing error`);
          sendResponse({ success: false, error: 'Unsupported page.' });
          sendMessageToPopup({
            action: 'extraction-complete',
            success: false,
            message: 'Unsupported page.'
          });
          return;
        }

        // Check if hostname is supported
        const supportedHostnames = [
          'chat.openai.com',
          'chatgpt.com',
          'claude.ai',
          'gemini.google.com',
          'bard.google.com',
          'poe.com',
          'anthropic.com',
          'perplexity.ai'
        ];

        const url = new URL(tabUrl);
        const hostname = url.hostname;
        
        let isHostnameSupported = false;
        for (const supportedHost of supportedHostnames) {
          if (hostname === supportedHost || hostname.endsWith('.' + supportedHost)) {
            isHostnameSupported = true;
            break;
          }
        }

        if (!isHostnameSupported) {
          console.log(`Unsupported hostname ${hostname} for popup extraction - showing error`);
          sendResponse({ success: false, error: 'Unsupported page.' });
          sendMessageToPopup({
            action: 'extraction-complete',
            success: false,
            message: 'Unsupported page.'
          });
          return;
        }

        // All checks passed, proceed with extraction
        extractQA()
          .then(() => {
            // Success is handled within extractQA via sendMessageToPopup
            sendResponse({ success: true }); // Acknowledge the request was processed
          })
          .catch((error) => {
            // Errors are also handled within extractQA via sendMessageToPopup
            console.error('Error during popup-triggered extraction:', error);
            sendResponse({
              success: false,
              error: error.message || 'Unknown error during extraction'
            });
          });
      } catch (error) {
        console.error('Error in popup extraction pre-check:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Unknown error during extraction validation' 
        });
        sendMessageToPopup({
          action: 'extraction-complete',
          success: false,
          message: `Error: ${error.message || 'Unknown error during extraction validation'}`
        });
      }
    });

    // Return true to indicate we'll respond asynchronously
    return true;
  }

  // Handle the inject-scripts action
  if (request.action === 'inject-scripts') {
    console.log('Received request to inject scripts:', request.scripts);

    // Validate scripts array
    if (!request.scripts || !Array.isArray(request.scripts) || request.scripts.length === 0) {
        console.error('Invalid or empty scripts array provided for injection.');
        sendResponse({ success: false, error: 'No scripts specified for injection' });
        return true;
    }

    // We need the tab ID. Prefer sender.tab if available, otherwise query active tab.
    let targetTabId = sender.tab?.id;

    // Use a single async function to handle injection for a given tab ID
    const injectScriptsAction = async (tabId) => {
      if (!tabId) {
         throw new Error('No valid tab ID found for injection');
      }

      // Inject each script sequentially
      for (const scriptName of request.scripts) {
          console.log(`Attempting to inject ${scriptName} into tab ${tabId}`);
          try {
              await chrome.scripting.executeScript({
                  target: { tabId: tabId, allFrames: false }, // Target only the main frame
                  files: [scriptName]
              });
              console.log(`Successfully injected ${scriptName} into tab ${tabId}`);
          } catch (injectionError) {
              console.error(`Failed to inject ${scriptName} into tab ${tabId}:`, injectionError);
              // Decide if we should stop or continue if one script fails
              // For now, let's stop if any script fails
              throw new Error(`Failed to inject script ${scriptName}: ${injectionError.message}`);
          }
      }

      // Optionally, notify the content script *after* all scripts are injected
      try {
          await chrome.tabs.sendMessage(tabId, {
              action: 'scripts-injected',
              scripts: request.scripts
          });
          console.log(`Notified content script about successful injection of all scripts in tab ${tabId}`);
      } catch (messageError) {
          // This might happen if the content script isn't fully ready yet
          console.warn(`Failed to notify content script post-injection in tab ${tabId}: ${messageError.message}. Might be timing issue.`);
      }

      return { success: true }; // Overall success if all injections passed
    };

    // Execute the injection action
    if (targetTabId) {
        injectScriptsAction(targetTabId)
            .then(sendResponse)
            .catch(error => {
                console.error(`Error injecting scripts into sender tab ${targetTabId}:`, error);
                sendResponse({ success: false, error: error.message || 'Unknown injection error' });
            });
    } else {
        // Fallback to querying active tab if sender tab context is missing
        console.warn("Sender tab ID missing for inject-scripts, querying active tab.");
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs || tabs.length === 0 || !tabs[0].id) {
                const errorMsg = chrome.runtime.lastError?.message || 'No active tab found for injection fallback';
                console.error(errorMsg);
                sendResponse({ success: false, error: errorMsg });
                return;
            }
            targetTabId = tabs[0].id;
            injectScriptsAction(targetTabId)
                .then(sendResponse)
                .catch(error => {
                    console.error(`Error injecting scripts into active tab ${targetTabId}:`, error);
                    sendResponse({ success: false, error: error.message || 'Unknown injection error' });
                });
        });
    }

    // Return true to indicate we'll respond asynchronously
    return true;
  }

  // Handle other messages if necessary
  console.log("Received unhandled message:", request);
  return false; // Indicate synchronous response or no handler found

});

// Function to show a toast notification in the tab
async function showToast(tabId, message, duration = 2000) {
  // Check if tabId is valid before proceeding
  if (!tabId) {
    console.warn("Skipping toast: Invalid tabId provided.");
    return;
  }
  try {
    // Optional: Check if the tab still exists before attempting to execute script
    await chrome.tabs.get(tabId);

    await chrome.scripting.executeScript({
      target: { tabId },
      func: (msg, dur) => {
        try {
            // Create or get toast container
            let container = document.querySelector('.qa-clipper-toast-container');
            if (!container) {
            container = document.createElement('div');
            container.className = 'qa-clipper-toast-container';
            // Append directly to body, checking if body exists
            if (document.body) {
                document.body.appendChild(container);
            } else {
                console.error("Toast Error: document.body not found.");
                return; // Cannot add toast if body isn't ready/available
            }
            }

            // Create toast element
            const toast = document.createElement('div');
            toast.className = 'qa-clipper-toast';
            toast.textContent = msg;
            container.appendChild(toast);

            // Show the toast
            setTimeout(() => {
            toast.style.opacity = '1';
            }, 10); // Short delay ensures transition works

            // Remove the toast after duration
            setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                // Check if container and toast still exist before removal
                if (container && container.contains(toast)) {
                    container.removeChild(toast);
                    // Remove container if empty
                    if (container.children.length === 0 && document.body && document.body.contains(container)) {
                         document.body.removeChild(container);
                    }
                }
            }, 300); // Wait for fade out transition
            }, dur);
        } catch(e) {
            console.error("Error inside injected toast function:", e);
        }
      },
      args: [message, duration]
    });
  } catch (error) {
    // Log error, especially if tab doesn't exist or scripting is denied
    if (error.message.includes("No tab with id") || error.message.includes("cannot be scripted")) {
       console.warn(`Failed to show toast on tab ${tabId}: ${error.message}`);
    } else {
       console.error(`Failed to show toast on tab ${tabId}:`, error);
    }
  }
}

// Modify ensureContentScriptLoaded to reflect that specific extractors aren't injected individually anymore
async function ensureContentScriptLoaded(tabId) {
  if (!tabId) {
    console.error("ensureContentScriptLoaded: Invalid tabId");
    return false;
  }
  try {
    // 1. Ping first
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' }, { frameId: 0 }); // Target main frame
      if (response && response.pong === true) {
        console.log(`Content script already loaded and responded on tab ${tabId}:`, response.status || 'No status info');
        // Check if the required global objects from our injected scripts are present
        if (response.status && response.status.extractConversationLoaded) {
             console.log(`Required extraction scripts confirmed loaded on tab ${tabId}.`);
             return true;
        } else {
             console.warn(`Content script pinged on tab ${tabId}, but required extraction scripts are missing. Will attempt injection.`);
             // Proceed to injection phase
        }
      } else {
        console.warn(`Ping to tab ${tabId} received unexpected response:`, response);
        // Proceed to injection
      }
    } catch (err) {
      // Error likely means content script isn't loaded or listening
      if (err.message.includes("Could not establish connection")) {
        console.log(`Content script not responding on tab ${tabId}. Attempting injection.`);
      } else {
         console.warn(`Error pinging content script on tab ${tabId}: ${err.message}. Proceeding with injection attempt.`);
      }
    }

    // 2. Inject core content scripts (if not already loaded) AND our extractor scripts
    const manifest = chrome.runtime.getManifest();
    const contentScriptDefs = manifest.content_scripts;
    if (!contentScriptDefs || !Array.isArray(contentScriptDefs) || contentScriptDefs.length === 0 || !contentScriptDefs[0].js) {
        console.error("Manifest content_scripts definition is missing or invalid.");
        return false;
    }
    const coreContentScripts = contentScriptDefs[0].js;
    // We inject extractor.js and all platform config scripts to ensure availability
    const extractorScripts = ['extractor.js', 'chatgptConfigs.js', 'claudeConfigs.js', 'geminiConfigs.js']; 
    const allScriptsToInject = [...new Set([...coreContentScripts, ...extractorScripts])]; // Combine and deduplicate

    console.log(`Ensuring scripts are loaded in tab ${tabId}: ${allScriptsToInject.join(', ')}`);
    for (const script of allScriptsToInject) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId, allFrames: false }, // Inject only into main frame
          files: [script]
        });
        console.log(`Successfully injected/ensured ${script} into tab ${tabId}`);
      } catch (injectionError) {
         console.error(`Failed to inject script ${script} into tab ${tabId}:`, injectionError);
         // If core content.js or our extractor scripts fail, stop.
         if (script === 'content.js' || script === 'extractor.js') {
            throw new Error(`Core script injection failed (${script}): ${injectionError.message}`); // Re-throw to stop the process
         }
         // For config scripts, log but continue - they might be dynamically loaded later
         console.warn(`Config script injection failed (${script}), will try dynamic loading: ${injectionError.message}`);
      }
    }

    // Success - notify the content script that injection is complete
    try {
      await chrome.tabs.sendMessage(tabId, { 
        action: 'scripts-injected', 
        scripts: allScriptsToInject 
      });
    } catch (notifyError) {
      console.warn(`Unable to notify content script about injection in tab ${tabId}:`, notifyError);
      // This is non-fatal, as the scripts themselves should have loaded
    }

    // Delay to allow scripts to initialize
    await new Promise(resolve => setTimeout(resolve, 150));
    
    return true;
  } catch (error) {
    console.error(`Error ensuring content script loaded in tab ${tabId}:`, error);
    return false;
  }
}

// Function to copy text to clipboard in a tab - KEEP THE OLD FUNCTION FOR BACKWARD COMPATIBILITY
// BUT REPLACE THE ACTUAL IMPLEMENTATION WITH THE NEW APPROACH
async function copyToClipboard(tabId, text) {
  // Check if offscreen API is available
  if (chrome.offscreen) {
    // Use the offscreen approach 
    return await copyToClipboardViaOffscreen(text);
  } else {
    console.warn('Offscreen API not available - falling back to legacy clipboard method');
    // Implementation of the legacy method would go here
    // but since we're not implementing it in this update, just return false
    return false;
  }
}

// Main extraction function - called when user triggers extraction
async function extractQA() {
  let currentTabId = null; // Store tab ID for potential error reporting
  let tabUrl = null; // Store URL for context

  try {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) { // Ensure tab and tab.id exist
      console.error('No active tab found or tab has no ID');
       // Attempt to notify popup even without tab context
      sendMessageToPopup({
        action: 'extraction-complete',
        success: false,
        message: 'Error: No active tab found.'
      });
      return; // Stop execution
    }
    
    // ADDITIONAL VALIDATION CHECKS
    // Check if the URL exists and is a valid http/https URL
    if (!tab.url) {
      console.log('Tab URL is missing - silently ignoring shortcut trigger');
      return; // Silently stop execution without notification
    }
    
    // Check if URL uses http/https protocol (excludes chrome://, file://, etc.)
    if (!tab.url.startsWith('http:') && !tab.url.startsWith('https:')) {
      console.log(`Non-web URL detected (${tab.url}) - silently ignoring shortcut trigger`);
      return; // Silently stop execution without notification
    }
    
    currentTabId = tab.id; // Store the valid tab ID
    tabUrl = tab.url; // Store URL for logging
    console.log(`Starting extraction for tab: ${currentTabId}, URL: ${tabUrl}`);

    // --- REMOVED OLD URL/HOSTNAME VALIDATION BLOCK ---
    // The new extractor.js handles platform identification internally.
    // We still need basic http/https check though.
    try {
       const urlObject = new URL(tabUrl);
       if (!['http:', 'https:'].includes(urlObject.protocol)) {
           console.warn(`Unsupported protocol (${urlObject.protocol}) at ${tabUrl}`);
           sendMessageToPopup({ action: 'extraction-complete', success: false, message: 'Unsupported page protocol.' });
           // Don't show toast for non-web pages where it would fail
           return;
       }
       console.log(`URL protocol check passed for ${tabUrl}`);
    } catch(urlError) {
       console.error(`URL parsing error:`, urlError);
       sendMessageToPopup({ action: 'extraction-complete', success: false, message: 'Error: Invalid page URL.' });
       return; // Stop execution
    }

    // Ensure content script AND necessary extractor scripts are loaded
    const scriptsLoaded = await ensureContentScriptLoaded(currentTabId);
    if (!scriptsLoaded) {
      // Error handling moved inside ensureContentScriptLoaded
      // console.error(`Failed to ensure scripts are loaded for tab ${currentTabId}.`);
      // await showToast(currentTabId, 'Error: Could not load extension scripts.', 3000);
      sendMessageToPopup({
        action: 'extraction-complete',
        success: false,
        message: 'Error: Could not load required extension scripts on the page.'
      });
      return; // Stop execution
    }
    console.log(`Scripts confirmed loaded for tab ${currentTabId}`);

    // Get the format settings
    const data = await chrome.storage.local.get('formatSettings');
    const formatSettings = data.formatSettings || {};
    console.log('Using format settings:', formatSettings);

    // Send message to content script to extract raw data
    let response;
    try {
        // Create our own timeout promise instead of using the unsupported timeout parameter
        const extractionPromise = new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(currentTabId, { action: 'extractRawData' }, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result);
                }
            });
        });
        
        // Our own timeout implementation (30 seconds)
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Extraction took too long or timed out after 30 seconds')), 30000);
        });
        
        // Race the extraction against the timeout
        response = await Promise.race([extractionPromise, timeoutPromise]);
        console.log(`Received response from content script on tab ${currentTabId}:`, response);
    } catch (commsError) {
         // Check if it was a timeout error
         if (commsError.message.includes("Receiving end does not exist") || commsError.message.includes("Could not establish connection")) {
              console.error(`Communication error with content script (might be closed or unloaded):`, commsError);
              throw new Error(`Failed to communicate with the page. Please reload the page and try again.`);
         } else if (commsError.message.includes("message channel closed")) {
              console.error(`Communication error (message channel closed):`, commsError);
              throw new Error(`Connection to the page was lost. Please reload and try again.`);
         } else {
             // Assume other errors might be timeouts or unexpected issues
             console.error(`Error sending/receiving extractRawData message on tab ${currentTabId}:`, commsError);
             throw new Error(`Extraction took too long or failed unexpectedly. Please try again.`);
         }
    }

    // Check for errors reported by the content script
    if (response && response.error) {
      // Simplified error check - rely on error message content
      const isNoContentError = response.error.includes("No conversation content found");

      if (isNoContentError) {
        // Handle as an informational scenario
        console.warn(`No conversation content on tab ${currentTabId} (${tabUrl}):`, response.error);
        await showToast(currentTabId, `No conversation found to extract.`, 3000);
        sendMessageToPopup({
          action: 'extraction-complete',
          success: false,
          message: `No conversation found to extract.`
        });
      } else {
        // Handle as a true error
        console.error(`Content script error on tab ${currentTabId} (${tabUrl}):`, response.error, response.diagnostics || '');
        const displayError = response.error.length > 100 ? response.error.substring(0, 97) + '...' : response.error;
        await showToast(currentTabId, `Error: ${displayError}`, 4000);
        sendMessageToPopup({
          action: 'extraction-complete',
          success: false,
          message: `Extraction Error: ${response.error}`
        });
      }
      return; // Stop execution
    }

    // Ensure data is in the new expected format
    if (response && response.data && response.data.platform && Array.isArray(response.data.conversationTurns)) {
      console.log(`Received ${response.data.conversationTurns.length} items for platform ${response.data.platform} on tab ${currentTabId}`);

      // Format the data using our formatter (needs update for new structure)
      // Pass the entire new data object to the formatter
      const formattedText = formatter.formatData(response.data, formatSettings);
      console.log(`--- Formatter output start (length: ${formattedText.length}) ---`);
      console.log(formattedText); // Output the exact string log
      console.log(`--- Formatter output end ---`);
      console.log(`Attempting to copy to clipboard for tab ${currentTabId}...`);
      console.log(`Formatted text length for tab ${currentTabId}: ${formattedText.length}`);

      // Copy the result to clipboard
      const copySuccess = await copyToClipboard(currentTabId, formattedText);
      console.log(`Clipboard copy success for tab ${currentTabId}: ${copySuccess}`);

      // Show success or error toast and notify popup
      if (copySuccess) {
        await showToast(currentTabId, 'Q&A copied to clipboard!');
        sendMessageToPopup({
          action: 'extraction-complete',
          success: true,
          message: 'Q&A copied to clipboard!'
        });
      } else {
        // Clipboard failure handling (remains the same, but text might be larger)
        console.warn(`Clipboard copy failed for tab ${currentTabId}`);
        await showToast(currentTabId, 'Could not copy. Open extension popup for manual copy.', 4000);
        sendMessageToPopup({
          action: 'clipboard-failed',
          text: formattedText
        });
        sendMessageToPopup({
          action: 'extraction-complete',
          success: false,
          message: 'Could not copy to clipboard. Using manual copy option.'
        });
      }
    } else {
      // Handle case where response structure is incorrect
      console.error(`Extraction response from tab ${currentTabId} has invalid structure:`, response);
      const invalidDataMessage = 'Error: Invalid data received from page. Extraction failed.';
      await showToast(currentTabId, invalidDataMessage, 3000);
      sendMessageToPopup({
        action: 'extraction-complete',
        success: false,
        message: invalidDataMessage
      });
    }
  } catch (error) {
    // Catch errors from the outer try block (e.g., tab query, script loading, communication)
    console.error('Error during main extraction process:', error);
    const errorMessage = error.message || 'Unknown error during extraction';
    // Try to show toast on the specific tab if we have an ID
    if (currentTabId) {
      await showToast(currentTabId, `Error: ${errorMessage}`, 4000);
    }
    // Notify popup if it's open
    sendMessageToPopup({
      action: 'extraction-complete',
      success: false,
      message: `Error: ${errorMessage}`
    });
  }
}
// --- END OF FILE background.js ---