// extractor.js

// Wrap in an immediately invoked function expression (IIFE) to prevent duplicate declarations
// when the script is injected multiple times
(function() {
  // Only set up if already initialized
  if (window.extractConversation) {
    console.log("extractConversation already initialized, skipping re-initialization");
    return;
  }

  /**
   * Identifies the current chatbot platform based on URL or other identifiers.
   * @returns {string|null} 'claude', 'chatgpt', 'gemini', or null if unidentified.
   */
  function identifyPlatform() {
    const currentUrl = window.location.href;
    const hostname = window.location.hostname;
    
    console.log('Chatbot Clipper: Attempting to identify platform. URL:', currentUrl, 'Hostname:', hostname);
    
    if (currentUrl.includes('claude.ai')) {
      return 'claude';
    } else if (hostname === 'chat.openai.com' || currentUrl.includes('chat.openai.com') || 
               hostname.endsWith('.chatgpt.com') || hostname === 'chatgpt.com') {
      return 'chatgpt';
    } else if (currentUrl.includes('gemini.google.com')) {
      return 'gemini';
    }
    
    // Additional checks for ChatGPT - check DOM elements specific to ChatGPT
    if (document.querySelector('[data-testid^="conversation-turn-"]') || 
        document.querySelector('[data-message-author-role]')) {
      console.log('Chatbot Clipper: Identified ChatGPT by DOM elements');
      return 'chatgpt';
    }
    
    console.error('Chatbot Clipper: Could not identify platform. URL:', currentUrl, 'Hostname:', hostname);
    return null;
  }

  /**
   * Dynamically loads the configuration script for the identified platform.
   * @param {string} platform - The identified platform ('claude', 'chatgpt', or 'gemini')
   * @returns {Promise<boolean>} - Resolves to true if loading was successful, false otherwise
   */
  function loadPlatformConfig(platform) {
    return new Promise((resolve, reject) => {
      console.log(`Chatbot Clipper: Attempting to load config for platform: ${platform}`);
      
      // Check if config is already loaded
      if ((platform === 'claude' && window.claudeConfig) || 
          (platform === 'chatgpt' && window.chatgptConfig) || 
          (platform === 'gemini' && window.geminiConfig)) {
        console.log(`${platform} config already loaded`);
        resolve(true);
        return;
      }

      // For chatgpt, try direct initialization as fallback
      if (platform === 'chatgpt' && !window.chatgptConfig) {
        try {
          // Check if the required script is available in the extension
          const manifestSrc = chrome.runtime.getURL(`${platform}Configs.js`);
          console.log(`Attempting to load ${platform} config from: ${manifestSrc}`);
        } catch (err) {
          console.warn(`Error checking for config script: ${err.message}`);
        }
      }

      // If not loaded, inject the appropriate script
      const scriptPath = `${platform}Configs.js`;
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(scriptPath);
      script.onload = () => {
        console.log(`Successfully loaded ${platform} config`);
        
        // Verify the global config object was created
        if ((platform === 'chatgpt' && window.chatgptConfig) ||
            (platform === 'claude' && window.claudeConfig) ||
            (platform === 'gemini' && window.geminiConfig)) {
          console.log(`Verified ${platform} config object is available`);
          resolve(true);
        } else {
          console.error(`${platform} config script loaded but global config object not found!`);
          reject(new Error(`${platform} config not initialized properly`));
        }
      };
      script.onerror = (error) => {
        console.error(`Failed to load ${platform} config:`, error);
        console.error(`Script path attempted: ${script.src}`);
        reject(new Error(`Failed to load ${platform} config: ${error.message || 'Unknown error'}`));
      };
      (document.head || document.documentElement).appendChild(script);
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

      console.log(`Chatbot Clipper: Platform identified as ${platform}`);

      // Dynamically load the platform-specific config
      try {
        await loadPlatformConfig(platform);
        console.log(`Chatbot Clipper: Successfully loaded ${platform} configuration`);
      } catch (loadError) {
        console.error(`Chatbot Clipper: Failed to load platform configuration:`, loadError);
        throw new Error(`Failed to load ${platform} configuration: ${loadError.message}`);
      }

      // Get the appropriate config from the window object
      const configKey = `${platform}Config`;
      const config = window[configKey];
      if (!config) {
        console.error(`Chatbot Clipper: No configuration found for platform: ${platform}`);
        throw new Error(`Configuration for ${platform} not found after loading`);
      }

      console.log(`Chatbot Clipper: Starting extraction for ${platform}...`);

      // Race against timeout
      return await Promise.race([
        (async () => {
          // --- Core Extraction Logic ---
          // 1. Select all conversation turn elements using config.selectors.turnContainer
          const turnElements = Array.from(document.querySelectorAll(config.selectors.turnContainer));
          if (!turnElements || turnElements.length === 0) {
            console.warn(`Chatbot Clipper: No conversation turns found for selector: ${config.selectors.turnContainer}`);
            // Decide if we should return null or an empty conversation object
            return { platform, conversationTurns: [] }; 
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
  console.log("extractConversation initialized successfully");
})(); 