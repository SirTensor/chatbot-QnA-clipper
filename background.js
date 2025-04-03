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
        imageLabel: 'Image URL'
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

  // Handle the inject-extractor action
  if (request.action === 'inject-extractor') {
    console.log('Received request to inject extractor:', request.script);

    // We need the tab ID. Prefer sender.tab if available, otherwise query active tab.
    let targetTabId = sender.tab?.id;

    const injectAction = async (tabId) => {
      if (!tabId) {
         throw new Error('No valid tab ID found for injection');
      }
      if (!request.script) {
         throw new Error('No script specified for injection');
      }
      // Inject the requested extractor script
      const success = await injectExtractorScript(tabId, request.script);
      return {
        success: success,
        error: success ? null : 'Failed to inject extractor script'
      };
    };

    if (targetTabId) {
        injectAction(targetTabId)
            .then(sendResponse)
            .catch(error => {
                console.error(`Error injecting into sender tab ${targetTabId}:`, error);
                sendResponse({ success: false, error: error.message || 'Unknown injection error' });
            });
    } else {
        // Fallback to querying active tab if sender tab context is missing
        console.warn("Sender tab ID missing for inject-extractor, querying active tab.");
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs || tabs.length === 0 || !tabs[0].id) {
                const errorMsg = chrome.runtime.lastError?.message || 'No active tab found for injection fallback';
                console.error(errorMsg);
                sendResponse({ success: false, error: errorMsg });
                return;
            }
            targetTabId = tabs[0].id;
            injectAction(targetTabId)
                .then(sendResponse)
                .catch(error => {
                    console.error(`Error injecting into active tab ${targetTabId}:`, error);
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

// Function to inject site-specific extractor script
async function injectExtractorScript(tabId, scriptName) {
   if (!tabId || !scriptName) {
    console.error("injectExtractorScript: Missing tabId or scriptName");
    return false;
  }
  try {
    console.log(`Attempting to inject ${scriptName} into tab ${tabId}`);
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [scriptName]
    });

    // Send message *after* successful injection
    // Use a try-catch for sendMessage as the content script might not be ready immediately
    try {
        await chrome.tabs.sendMessage(tabId, {
            action: 'extractor-injected',
            script: scriptName
        });
         console.log(`Successfully injected ${scriptName} and notified content script in tab ${tabId}`);
         return true;
    } catch (messageError) {
        // This can happen if the content script isn't listening yet, which might be okay
        console.warn(`Successfully injected ${scriptName}, but failed to notify content script in tab ${tabId}: ${messageError.message}. Might be timing issue.`);
        return true; // Injection itself succeeded
    }

  } catch (error) {
    console.error(`Failed to inject ${scriptName} into tab ${tabId}:`, error);
    // Try to provide more context if possible
    if (error.message.includes("Cannot access contents of url")) {
        console.warn(`Injection failed: Likely a permissions issue or protected page (e.g., chrome://). URL check might be needed.`);
    } else if (error.message.includes("No tab with id")) {
        console.warn(`Injection failed: Tab ${tabId} may have been closed.`);
    }
    return false;
  }
}

// Function to ensure content script is loaded
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
        console.log(`Content script already loaded and responded on tab ${tabId}:`, response.extractors || 'No extractor info');
         // Even if loaded, ensure *our* specific extractors are present if needed
        if (response.extractors && response.extractors.registered && response.extractors.registered.length > 0) {
          return true;
        } else {
          console.warn(`Content script pinged on tab ${tabId}, but no QAClipper extractors registered. Will attempt injection.`);
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

    // 2. Inject if ping failed or script needs injection
    const manifest = chrome.runtime.getManifest();
    // Ensure content_scripts exists and has the expected structure
    const contentScriptDefs = manifest.content_scripts;
    if (!contentScriptDefs || !Array.isArray(contentScriptDefs) || contentScriptDefs.length === 0 || !contentScriptDefs[0].js) {
        console.error("Manifest content_scripts definition is missing or invalid.");
        return false;
    }
    const scriptsToInject = contentScriptDefs[0].js; // Get JS files from first definition
    // Fallback if somehow manifest is wrong
    const defaultScripts = ['utils.js', 'content.js'];
    const effectiveScripts = Array.isArray(scriptsToInject) && scriptsToInject.length > 0 ? scriptsToInject : defaultScripts;


    console.log(`Injecting content scripts into tab ${tabId}: ${effectiveScripts.join(', ')}`);
    for (const script of effectiveScripts) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId, allFrames: false }, // Inject only into main frame
          files: [script]
        });
        console.log(`Successfully injected ${script} into tab ${tabId}`);
      } catch (injectionError) {
         console.error(`Failed to inject script ${script} into tab ${tabId}:`, injectionError);
         // If core content.js fails, stop. utils.js might be less critical?
         if (script === 'content.js') {
            throw new Error(`Core content script injection failed: ${injectionError.message}`); // Re-throw to stop the process
         }
      }
    }

    // 3. Verify injection with a second ping
    try {
       // Add a small delay before the second ping to allow script initialization
       await new Promise(resolve => setTimeout(resolve, 100));
      const verifyResponse = await chrome.tabs.sendMessage(tabId, { action: 'ping' }, { frameId: 0 });
      if (verifyResponse && verifyResponse.pong) {
        console.log(`Content script injection into tab ${tabId} verified successfully.`);
        return true;
      } else {
        console.warn(`Content script injection verification failed for tab ${tabId} - unexpected response:`, verifyResponse);
        return false; // Verification failed
      }
    } catch (verifyErr) {
      console.error(`Content script injection verification failed for tab ${tabId}:`, verifyErr);
      return false; // Verification failed
    }
  } catch (error) {
    // Catch errors from the overall process, including re-thrown injection errors
    console.error(`Error ensuring content script is loaded for tab ${tabId}:`, error);
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

    // URL VALIDATION
    // Define supported hostnames
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

    try {
      // Check if URL exists
      if (!tabUrl) {
        throw new Error('Tab URL is missing');
      }

      const url = new URL(tabUrl);
      const protocol = url.protocol;
      const hostname = url.hostname;

      // Protocol validation
      const isHttpProtocol = protocol === 'http:' || protocol === 'https:';
      
      // Hostname validation
      let isHostnameSupported = false;
      if (isHttpProtocol) {
        for (const supportedHost of supportedHostnames) {
          if (hostname === supportedHost || hostname.endsWith('.' + supportedHost)) {
            isHostnameSupported = true;
            break;
          }
        }
      }

      // If URL is unsupported, notify and exit
      if (!isHttpProtocol || !isHostnameSupported) {
        console.warn(`Unsupported page at ${tabUrl} (protocol: ${protocol}, hostname: ${hostname})`);
        
        // Send message to popup regardless of page type
        sendMessageToPopup({
          action: 'extraction-complete',
          success: false,
          message: 'Unsupported page.'
        });
        
        // Only attempt toast on HTTP/HTTPS pages (will fail on chrome:// etc.)
        if (isHttpProtocol) {
          await showToast(currentTabId, 'Unsupported page.', 3000);
        }
        
        return; // Stop execution
      }
      
      // URL validation passed - log and continue
      console.log(`URL validation passed for ${hostname}`);
    } catch (urlError) {
      console.error(`URL validation error:`, urlError);
      sendMessageToPopup({
        action: 'extraction-complete',
        success: false,
        message: 'Error: Invalid page URL.'
      });
      return; // Stop execution
    }

    // Ensure content script is loaded
    const scriptLoaded = await ensureContentScriptLoaded(currentTabId);
    if (!scriptLoaded) {
      console.error(`Failed to ensure content script is loaded for tab ${currentTabId}.`);
      // Try to show toast on the specific tab if possible
      await showToast(currentTabId, 'Error: Could not load extension scripts.', 3000);
      // Notify popup if it's open
      sendMessageToPopup({
        action: 'extraction-complete',
        success: false,
        message: 'Error: Could not load required extension scripts on the page.'
      });
      return; // Stop execution
    }
    console.log(`Content script confirmed loaded for tab ${currentTabId}`);


    // Get the format settings
    const data = await chrome.storage.local.get('formatSettings');
    const formatSettings = data.formatSettings || {};
    console.log('Using format settings:', formatSettings);


    // Send message to content script to extract raw data
    // Add timeout for sendMessage in case content script hangs
    let response;
    try {
        response = await chrome.tabs.sendMessage(currentTabId, { action: 'extractRawData' });
        console.log(`Received response from content script on tab ${currentTabId}:`, response);
    } catch (commsError) {
         console.error(`Error communicating with content script on tab ${currentTabId}:`, commsError);
         throw new Error(`Failed to get data from content script: ${commsError.message}`);
    }


    // Check for errors reported by the content script
    if (response && response.error) {
      // Check if this is a "no content found" scenario
      const isNoContentError = response.error.includes("No conversation content found") || 
                              response.error.includes("No content found") ||
                              response.error.includes("conversation not found") ||
                              response.error.includes("content elements not found");
      
      if (isNoContentError) {
        // Handle as an informational scenario rather than an error
        console.warn(`No conversation content on tab ${currentTabId} (${tabUrl}):`, response.error);
        await showToast(currentTabId, `No conversation found to extract.`, 3000);
        // Notify popup if it's open
        sendMessageToPopup({
          action: 'extraction-complete',
          success: false,
          message: `No conversation found to extract.`
        });
      } else {
        // Handle as a true error (original behavior)
        console.error(`Content script error on tab ${currentTabId} (${tabUrl}):`, response.error, response.diagnostics || '');
        const displayError = response.error.length > 100 ? response.error.substring(0, 97) + '...' : response.error;
        await showToast(currentTabId, `Error: ${displayError}`, 4000);
        // Notify popup if it's open
        sendMessageToPopup({
          action: 'extraction-complete',
          success: false,
          message: `Extraction Error: ${response.error}` // Send full error to popup
        });
      }
      return; // Stop execution
    }

    // If we have data, format it using the formatter
    if (response && response.data) {
      if (!Array.isArray(response.data)) {
         console.error(`Invalid data received from content script (not an array) on tab ${currentTabId}:`, response.data);
         throw new Error('Invalid data format received from content script.');
      }
      console.log(`Received ${response.data.length} raw items from ${response.site || 'unknown site'} extractor on tab ${currentTabId}`);


      // Format the data using our formatter
      const formattedText = formatter.formatData(response.data, formatSettings);
      console.log(`Formatted text length for tab ${currentTabId}: ${formattedText.length}`);
      // console.log('Formatted Text:\n', formattedText); // Uncomment for debugging


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
      // Handle case where response is valid but has no data/error (or unexpected structure)
      console.error(`Extraction response from tab ${currentTabId} invalid or missing data:`, response);
      const noDataMessage = 'Error: No data extracted. Ensure conversation is visible and try again.';
      await showToast(currentTabId, noDataMessage, 3000);
      sendMessageToPopup({
        action: 'extraction-complete',
        success: false,
        message: noDataMessage
      });
    }
  } catch (error) {
    // --- CATCH BLOCK WITH IMPROVED ERROR HANDLING ---
    console.error(`Error during extractQA for tab ${currentTabId || 'UNKNOWN'} (URL: ${tabUrl || 'UNKNOWN'}):`, error);
    const errorMessage = error.message || 'An unexpected error occurred during extraction or copying.';

    // Try to show error toast in the current tab, but wrap in try/catch
    if (currentTabId) {
      try {
        // Check if tab still exists before showing toast
        const tabExists = await chrome.tabs.get(currentTabId).catch(() => null);
        if (tabExists) {
            console.log(`Attempting to show error toast on valid tab ${currentTabId}`);
            // Shorten message for toast if too long
            const toastErrorMessage = errorMessage.length > 70 ? errorMessage.substring(0, 67) + '...' : errorMessage;
            await showToast(currentTabId, `Error: ${toastErrorMessage}`, 3500);
        } else {
            console.warn(`Tab ${currentTabId} no longer exists, cannot show error toast.`);
        }
      } catch (toastError) {
        // Catch errors specifically from showToast or tabs.get
        console.error(`Failed to show error toast for tab ${currentTabId}:`, toastError);
      }
    } else {
        console.error('Cannot show error toast because active tab ID was not available or lost.');
    }

    // ALWAYS attempt to notify the popup about the error.
    console.log('Sending error message to popup (if open)');
    sendMessageToPopup({
      action: 'extraction-complete',
      success: false,
      message: errorMessage // Send the full error message to the popup
    });
    // --- END OF CATCH BLOCK ---
  }
}
// --- END OF FILE background.js ---