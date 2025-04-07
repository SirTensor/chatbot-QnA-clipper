// extractor.js

// Wrap in an immediately invoked function expression (IIFE) to prevent duplicate declarations
// when the script is injected multiple times
(function() {
  // Only set up if already initialized
  if (window.extractConversation) {
    // console.log("extractConversation already initialized, skipping re-initialization");
    return;
  }

  /**
   * Identifies the current chatbot platform based on URL or other identifiers.
   * @returns {string|null} 'claude', 'chatgpt', 'gemini', or null if unidentified.
   */
  function identifyPlatform() {
    const currentUrl = window.location.href;
    const hostname = window.location.hostname;
    
    // console.log('Chatbot Clipper: Attempting to identify platform. URL:', currentUrl, 'Hostname:', hostname);
    
    if (hostname === 'chat.openai.com' || currentUrl.includes('chat.openai.com') || 
               hostname.endsWith('.chatgpt.com') || hostname === 'chatgpt.com') {
      return 'chatgpt';
    } else if (currentUrl.includes('gemini.google.com')) {
      return 'gemini';
    } else if (currentUrl.includes('claude.ai')) {
      return 'claude';
    } else if (currentUrl.includes('grok.com')) {
      return 'grok';
    }

    
    // Additional checks for ChatGPT - check DOM elements specific to ChatGPT
    if (document.querySelector('[data-testid^="conversation-turn-"]') || 
        document.querySelector('[data-message-author-role]')) {
      // console.log('Chatbot Clipper: Identified ChatGPT by DOM elements');
      return 'chatgpt';
    }
    
    console.error('Chatbot Clipper: Could not identify platform. URL:', currentUrl, 'Hostname:', hostname);
    return null;
  }

  /**
   * Checks if the configuration for the identified platform is loaded.
   * Does NOT attempt to load configs anymore - relies on background.js to have loaded them.
   * @param {string} platform - The identified platform ('claude', 'chatgpt', or 'gemini')
   * @returns {Promise<boolean>} - Resolves to true if config exists, rejects if not
   */
  function loadPlatformConfig(platform) {
    return new Promise((resolve, reject) => {
      // console.log(`Chatbot Clipper: Checking if config exists for platform: ${platform}`);
      
      // Check if config is already loaded
      if ((platform === 'chatgpt' && window.chatgptConfig) || 
          (platform === 'gemini' && window.geminiConfig) ||
          (platform === 'claude' && window.claudeConfig) ||
          (platform === 'grok' && window.grokConfig)) {
        // console.log(`${platform} config is loaded and available`);
        resolve(true);
        return;
      }

      // If config is not loaded, reject with error
      console.error(`${platform} config not found on window object. Background script may have failed to inject it.`);
      reject(new Error(`${platform} configuration not loaded. Please try refreshing the page or report this issue.`));
    });
  }

  /**
   * Main function to orchestrate the extraction process.
   * @returns {Promise<object|null>} A promise that resolves with the extracted conversation object or null if failed.
   */
  async function extractConversation() {
    // Add timeout protection
    let extractionTimeout;
    const timeoutPromise = new Promise((_, reject) => {
      extractionTimeout = setTimeout(() => {
        reject(new Error('Extraction timed out internally after 20 seconds'));
      }, 20000);
    });

    try {
      const platform = identifyPlatform();
      if (!platform) {
        const diagnosticInfo = {
          url: window.location.href,
          hostname: window.location.hostname,
          documentReady: document.readyState === 'complete',
          chatgptSelectors: {
            conversationTurns: document.querySelectorAll('div[data-testid^="conversation-turn-"]').length,
            messageRoles: document.querySelectorAll('[data-message-author-role]').length
          }
        };
        
        console.error('Chatbot Clipper: Platform identification failed', diagnosticInfo);
        throw new Error(`Could not identify chatbot platform. Are you on a supported site? ${window.location.hostname}`);
      }

      // console.log(`Chatbot Clipper: Platform identified as ${platform}`);

      // Check if the platform-specific config is available
      try {
        await loadPlatformConfig(platform);
        // console.log(`Chatbot Clipper: ${platform} configuration is available`);
      } catch (loadError) {
        console.error(`Chatbot Clipper: Configuration for ${platform} not available:`, loadError);
        throw new Error(`Configuration for ${platform} not available: ${loadError.message}`);
      }

      // Get the appropriate config from the window object
      const configKey = `${platform}Config`;
      const config = window[configKey];
      if (!config) {
        console.error(`Chatbot Clipper: No configuration found for platform: ${platform}`);
        throw new Error(`Configuration for ${platform} not found after loading`);
      }

      // console.log(`Chatbot Clipper: Starting extraction for ${platform}...`);

      // Race against timeout
      return await Promise.race([
        (async () => {
          // --- Core Extraction Logic ---
          // 1. Select all conversation turn elements using config.selectors.turnContainer
          const turnElements = Array.from(document.querySelectorAll(config.selectors.turnContainer));
          if (!turnElements || turnElements.length === 0) {
            // console.log(`Chatbot Clipper: No conversation turns found for selector: ${config.selectors.turnContainer}`);
            // Return a valid empty conversation structure rather than null
            // console.log(`Chatbot Clipper: Returning empty conversation structure for ${platform} - this is normal for new chats`);
            return { 
              platform, 
              conversationTurns: [] 
            }; 
          }

          const conversationTurns = [];
          let turnIndex = 0;

          // 2. Iterate through each turn element
          for (const turnElement of turnElements) {
            try {
              // 3. Determine the role (user/assistant) using config.getRole(turnElement)
              const role = config.getRole(turnElement);

              let turnData = {
                turnIndex: turnIndex++,
                role: role || 'unknown', // Default to 'unknown' if role cannot be determined
                textContent: null,
                userAttachments: null,
                contentItems: null,
              };

              // 4. Based on role, call specific extraction functions from the config
              if (role === 'user') {
                turnData.textContent = config.extractUserText(turnElement);
                // Update to use the new image and file extraction functions
                const userImages = config.extractUserUploadedImages(turnElement) || [];
                const userFiles = config.extractUserUploadedFiles(turnElement) || [];
                // Combine both types of attachments into a single array
                turnData.userAttachments = [...userImages, ...userFiles];
              } else if (role === 'assistant') {
                // This function will return the array of ContentItem objects
                turnData.contentItems = config.extractAssistantContent(turnElement);
              } else {
                console.warn(`Chatbot Clipper: Unknown role detected for turn element:`, turnElement);
                // Optionally try to extract some generic text content if role is unknown
                // turnData.textContent = extractGenericText(turnElement); 
              }
              
              conversationTurns.push(turnData);
            } catch (turnError) {
              console.error(`Error processing turn ${turnIndex}:`, turnError);
              // Continue with next turn instead of failing completely
            }
          }

          // 5. Return the final structured object
          return {
            platform: platform,
            conversationTurns: conversationTurns,
          };
        })(),
        timeoutPromise
      ]);
    } catch (error) {
      console.error(`Chatbot Clipper: Error during extraction:`, error);
      return null; // Indicate failure
    } finally {
      // Clean up timeout
      if (extractionTimeout) clearTimeout(extractionTimeout);
    }
  }

  // Expose to window scope so content.js can call it
  window.extractConversation = extractConversation;
  // console.log("extractConversation initialized successfully");
})(); 