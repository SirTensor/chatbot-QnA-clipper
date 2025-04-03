// --- START OF FILE content.js ---

/**
 * Main content script for Chatbot Q&A Clipper extension
 * Acts as a bridge between background.js and the site-specific extractors
 */

// Wrap the entire script in an IIFE to prevent variable leakage to global scope
(function() {
  console.log('Content script loaded');

  // Track if we've initialized already to prevent double initialization
  if (window.qaClipperInitialized) {
    console.log('Content script already initialized, skipping...');
    return;
  }

  // Mark as initialized
  window.qaClipperInitialized = true;

  // Ensure extractors container exists
  if (!window.QAClipperExtractors) {
    window.QAClipperExtractors = {};
  }

  // Define site to extractor script mapping
  const siteExtractorMap = {
    'chat.openai.com': 'chatgpt.js',
    'chatgpt.com': 'chatgpt.js',
    'claude.ai': 'claude.js', // Assuming you might add claude.js later
    'gemini.google.com': 'gemini.js',
    // Add mappings for other supported sites here
    // 'grok.x.ai': 'grok.js',
    // 'chat.deepseek.com': 'deepseek.js'
  };

  // Detect the current website and request the appropriate extractor script
  function loadSiteSpecificExtractor() {
    const hostname = window.location.hostname;
    let extractorScript = null;

    // Find matching extractor script
    for (const site in siteExtractorMap) {
      if (hostname.includes(site)) {
        extractorScript = siteExtractorMap[site];
        break;
      }
    }

    if (extractorScript) {
      console.log(`Detected site ${hostname}, requesting extractor: ${extractorScript}`);

      // Request background script to inject the appropriate extractor
      chrome.runtime.sendMessage({
        action: 'inject-extractor',
        script: extractorScript
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error requesting extractor injection:', chrome.runtime.lastError);
          return;
        }

        if (response && response.success) {
          console.log(`Successfully injected ${extractorScript}`);
        } else {
          console.error(`Failed to inject ${extractorScript}:`, response?.error || 'Unknown error');
        }
      });
    } else {
      console.warn(`No matching extractor found for ${hostname}`);
    }
  }

  // Load the site-specific extractor script
  loadSiteSpecificExtractor();

  // Single message listener for all actions
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);

    if (request.action === 'extractRawData') {
      let extractor = null; // Keep extractor in wider scope for catch block
      let diagnosticData = { // Initialize diagnostics early
        url: window.location.href,
        hostname: window.location.hostname,
        availableExtractors: Object.keys(window.QAClipperExtractors || {}),
        matchedExtractor: null,
        documentReady: document.readyState === 'complete'
      };

      try {
        // Find the appropriate extractor for the current site
        extractor = findExtractor();
        diagnosticData.matchedExtractor = extractor?.siteId || null; // Update diagnostics

        if (!extractor) {
          console.error('No supported extractor found for this website:', diagnosticData);

          throw new Error(
            `This website (${window.location.hostname}) is not supported. ` +
            `Available extractors: ${diagnosticData.availableExtractors.join(', ')}. ` +
            `Please navigate to a supported chatbot site (ChatGPT, Claude, Gemini, etc).`
          );
        }

        try {
          // Extract the raw data using the service-specific extractor
          console.log(`Using ${extractor.siteId} extractor to process page content`);
          const rawDataArray = extractor.extractRawData();
          console.log(`${extractor.siteId} extraction succeeded:`, rawDataArray);

          if (!rawDataArray || rawDataArray.length === 0) {
            // This case is typically handled by the extractor throwing an error,
            // but we add a check here for extractors that might return empty arrays instead.
            // The preferred method is for the extractor to throw a specific "no content" error.
             console.warn(`Extractor ${extractor.siteId} returned empty data. Treating as 'no content'.`);
             throw new Error(
               `No conversation content found on ${extractor.siteId}. ` +
               `Make sure you have an active chat with visible messages.`
            );
             // Or, alternatively, send back an empty success response:
             // sendResponse({ site: extractor.siteId, data: [] });
             // return true; // Exit early if sending empty success
          }

          // Send back the site ID and extracted data
          sendResponse({
            site: extractor.siteId,
            data: rawDataArray
          });
        } catch (extractionError) {
           // Log detailed error info for the specific extractor

           // --- START: Modified Error Logging ---
           const isNoContentError = extractionError.message.includes("No conversation content found") ||
                                  extractionError.message.includes("No content found") ||
                                  extractionError.message.includes("conversation not found") ||
                                  extractionError.message.includes("content elements not found");

           // Modify logging based on error type
           if (isNoContentError) {
             // Log "no content" scenarios as warnings, not errors
            //  console.warn(`Extractor (${extractor?.siteId}) reported no content:`, extractionError.message, diagnosticData);
           } else {
             // Log other actual errors as errors
             console.error(`Error in ${extractor?.siteId} extractor:`, {
               error: extractionError,
               message: extractionError.message,
               stack: extractionError.stack,
               diagnostics: diagnosticData
             });
           }
           // --- END: Modified Error Logging ---

           // Create a more detailed error message (this part remains the same)
           const errorMessage = `${extractionError.message || 'Extraction failed'} ` +
                              `(using ${extractor?.siteId || 'unknown'} extractor). ` + // Use optional chaining for safety
                              `If this error persists, please report it as the site may have updated its UI.`;

           // Send the response back (this part also remains the same)
           sendResponse({
             error: errorMessage,
             diagnostics: diagnosticData // Include diagnostics to help users report issues
           });
        }
      } catch (error) {
        // Catch errors from the outer try block (e.g., extractor finding failed)
        console.error('Error in content script extraction setup:', error);
        sendResponse({
          error: error.message,
          site: null,
          diagnostics: diagnosticData // Use already prepared diagnostic data
        });
      }
      return true; // Indicate asynchronous response is expected
    } else if (request.action === 'getDebugInfo') {
      // Return debug info to help troubleshoot issues
      const debugInfo = {
        initialized: window.qaClipperInitialized,
        url: window.location.href,
        hostname: window.location.hostname,
        extractors: Object.keys(window.QAClipperExtractors || {}),
        matchingExtractor: findExtractor()?.siteId || null,
        documentReady: document.readyState === 'complete',
        iframesCount: document.querySelectorAll('iframe').length,
        mainContentPresent: !!document.querySelector('main')
      };

      sendResponse({ debugInfo });
      return true;
    } else if (request.action === 'ping') {
      // Enhanced ping to check if content script is loaded
      const extractorInfo = {
        registered: Object.keys(window.QAClipperExtractors || {}),
        matching: findExtractor()?.siteId || null
      };

      console.log('Received ping, responding with status:', extractorInfo);
      sendResponse({
        pong: true,
        url: window.location.href,
        hostname: window.location.hostname,
        extractors: extractorInfo
      });
      return true;
    } else if (request.action === 'extractor-injected') {
      // Notification that an extractor was injected
      console.log(`Extractor ${request.script} was injected`);
      sendResponse({ success: true });
      return true;
    } else {
        console.log("Content script received unhandled message action:", request.action);
        // Optionally send a response indicating the action wasn't handled
        // sendResponse({ error: `Unhandled action: ${request.action}` });
        // Return false or nothing if no asynchronous response is needed
        return false;
    }
  });

  /**
   * Finds the appropriate extractor for the current site
   * @returns {Object|null} - The extractor object or null if not found
   */
  function findExtractor() {
    if (!window.QAClipperExtractors) {
      console.warn('No extractors registered yet (window.QAClipperExtractors missing)'); // Changed to warn
      return null;
    }

    // Check each registered extractor
    for (const key in window.QAClipperExtractors) {
      try {
        const extractor = window.QAClipperExtractors[key];
        if (extractor && typeof extractor.isMatch === 'function' && extractor.isMatch()) {
          console.log(`Found matching extractor: ${key}`);
          return extractor;
        }
      } catch (err) {
        console.error(`Error checking extractor ${key}:`, err);
      }
    }

    console.log('No matching extractor found for this site');
    return null;
  }
})();
// --- END OF FILE content.js ---