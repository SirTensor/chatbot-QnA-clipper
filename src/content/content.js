// --- START OF FILE content.js ---

/**
 * Main content script for Chatbot Q&A Clipper extension
 * Acts as a bridge between background.js and the extractor.js logic
 * Assumes all required scripts are injected by background.js
 */

// Wrap the entire script in an IIFE to prevent variable leakage to global scope
(function() {
  // console.log('Content script loaded for Chatbot Q&A Clipper. URL:', window.location.href, 'Hostname:', window.location.hostname);

  // Track if we've initialized already to prevent double initialization
  if (window.qaClipperInitialized) {
    // console.log('Content script already initialized, skipping...');
    return;
  }

  // Mark as initialized
  window.qaClipperInitialized = true;

  // Single message listener for all actions
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // console.log('Content script received message:', request);

    if (request.action === 'extractRawData') {
      let diagnosticData = { // Initialize diagnostics early
        url: window.location.href,
        hostname: window.location.hostname,
        claudeConfigLoaded: !!window.claudeConfig,
        chatgptConfigLoaded: !!window.chatgptConfig,
        geminiConfigLoaded: !!window.geminiConfig,
        grokConfigLoaded: !!window.grokConfig,
        extractConversationLoaded: !!window.extractConversation,
        documentReady: document.readyState === 'complete',
        platformDetected: null,
        selectors: null
      };

      // Log detailed debugging information
      // console.log("ExtractRawData called with diagnostics:", diagnosticData);

      // Ensure the necessary functions are loaded
      if (!window.extractConversation) {
        const errorMsg = "Core extraction script (extractor.js) not loaded correctly. Cannot extract.";
        console.error(errorMsg, diagnosticData);
        sendResponse({ error: errorMsg, diagnostics: diagnosticData });
        return true; // Indicate async response
      }

      // Try to detect platform early to provide more diagnostics
      try {
        let platformClue = null;
        
        if (window.location.href.includes('chatgpt.com')) {
          platformClue = 'chatgpt';
          // Test selectors
          const turnCount = document.querySelectorAll('div[data-testid^="conversation-turn-"]').length;
          diagnosticData.selectors = { platform: 'chatgpt', turnCount: turnCount };
        } else if (window.location.href.includes('gemini.google.com')) {
          platformClue = 'gemini';
          // Test selectors
          const turnCount = document.querySelectorAll('user-query, model-response').length;
          diagnosticData.selectors = { platform: 'gemini', turnCount: turnCount };
        } else if (window.location.href.includes('claude.ai')) {
          platformClue = 'claude';
          // Test selectors
          const turnCount = document.querySelectorAll('div[data-test-render-count]').length;
          diagnosticData.selectors = { platform: 'claude', turnCount: turnCount };
        } else if (window.location.href.includes('grok.com')) {
          platformClue = 'grok';
          const turnSelector = 'div.relative.w-full.flex.flex-col.items-center > div:not(:empty) > div.relative.group.flex.flex-col.justify-center';
          const turnCount = document.querySelectorAll(turnSelector).length;
          diagnosticData.selectors = { platform: 'grok', turnCount: turnCount };
        }
        diagnosticData.platformDetected = platformClue;
        // console.log(`Platform detection test: ${platformClue}, selectors:`, diagnosticData.selectors);
      } catch (selectorError) {
        console.error("Error testing selectors:", selectorError);
      }

      // console.log("Calling window.extractConversation with extra diagnostics:", diagnosticData);

      // Set up a timeout just in case the promise never resolves or rejects
      let extractionTimeout = setTimeout(() => {
        console.error("Content script's extractConversation call timed out after 25 seconds");
        sendResponse({
          error: "Extraction took too long (content script timeout). Please try again.",
          diagnostics: diagnosticData
        });
      }, 25000);

      // Call the globally exposed extractConversation function
      // Pass settings from the request
      const settings = request.settings || {};
      window.extractConversation(settings)
        .then(extractedData => {
          clearTimeout(extractionTimeout); // Clear the timeout
          // console.log("Extraction result:", extractedData);
          if (!extractedData) {
            // Handle cases where extraction failed (e.g., platform not identified, config missing)
            // The extractor.js should log specific errors.
            throw new Error("Extraction process failed. Check console for details.");
          }

          if (!extractedData.conversationTurns || extractedData.conversationTurns.length === 0) {
            // Handle cases where no turns were found
            throw new Error(
              `No conversation content found on ${extractedData.platform || 'the current page'}. ` +
              `Make sure you have an active chat with visible messages.`
            );
          }

          // Add turn counts to diagnostics for debugging
          diagnosticData.extractedTurns = extractedData.conversationTurns.length;
          
          // Send back the new structured data
          // Note: The 'site' property is now 'platform' inside the data object
          sendResponse({ data: extractedData });
        })
        .catch(error => {
          clearTimeout(extractionTimeout); // Clear the timeout
          // Handle errors during the extraction process
          const isNoContentError = error.message.includes("No conversation content found");

          if (isNoContentError) {
            // console.warn(`Extractor reported no content:`, error.message, diagnosticData);
          } else {
            console.error('Error during extraction:', {
              error: error,
              message: error.message,
              stack: error.stack,
              diagnostics: diagnosticData
            });
          }

          const errorMessage = `${error.message || 'Extraction failed'} ` +
                             `(Platform: ${diagnosticData.hostname}). ` +
                             `If this error persists, please report it.`;

          sendResponse({
            error: errorMessage,
            diagnostics: diagnosticData
          });
        });

      return true; // Indicate asynchronous response is expected

    } else if (request.action === 'getDebugInfo') {
      // Return debug info to help troubleshoot issues
      const debugInfo = {
        initialized: window.qaClipperInitialized,
        url: window.location.href,
        hostname: window.location.hostname,
        claudeConfigLoaded: !!window.claudeConfig,
        chatgptConfigLoaded: !!window.chatgptConfig,
        geminiConfigLoaded: !!window.geminiConfig,
        extractConversationLoaded: !!window.extractConversation,
        documentReady: document.readyState === 'complete',
        iframesCount: document.querySelectorAll('iframe').length,
        mainContentPresent: !!document.querySelector('main')
      };

      sendResponse({ debugInfo });
      return true;

    } else if (request.action === 'ping') {
      // Enhanced ping to check if content script and injected scripts are loaded
      const statusInfo = {
        claudeConfigLoaded: !!window.claudeConfig,
        chatgptConfigLoaded: !!window.chatgptConfig,
        geminiConfigLoaded: !!window.geminiConfig,
        extractConversationLoaded: !!window.extractConversation,
      };

      // console.log('Received ping, responding with status:', statusInfo);
      sendResponse({
        pong: true,
        url: window.location.href,
        hostname: window.location.hostname,
        status: statusInfo
      });
      return true;

    } else if (request.action === 'scripts-injected') {
      // Notification that scripts were injected (can be sent from background)
      // console.log(`Received confirmation: Scripts ${request.scripts?.join(', ')} injected.`);
      sendResponse({ success: true });
      return true;

    } else {
        // console.log("Content script received unhandled message action:", request.action);
        return false; // No async response needed for unhandled actions
    }
  });

})();
// --- END OF FILE content.js ---