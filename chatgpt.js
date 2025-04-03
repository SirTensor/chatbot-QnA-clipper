// --- START OF FILE chatgpt.js ---

/**
 * ChatGPT-specific extraction logic for Chatbot Q&A Clipper
 */

// Wrap the entire script in an IIFE to prevent variable leakage
(function() {
  // Check if this extractor is already registered
  if (window.QAClipperExtractors && window.QAClipperExtractors.chatgpt) {
    console.log('ChatGPT extractor already registered, skipping re-registration.');
    return;
  }

  const ChatGPTExtractor = {
    /**
     * Site identifier
     */
    siteId: 'chatgpt',

    /**
     * Checks if the current page is ChatGPT
     * @returns {Boolean} - True if current page is ChatGPT
     */
    isMatch: function() {
      return window.location.hostname.includes('chat.openai.com') ||
             window.location.hostname.includes('chatgpt.com');
    },

    /**
     * Extracts raw Q&A data from ChatGPT conversations
     * Uses multiple strategies to find conversation elements.
     * @returns {Array} - Array of objects with type, content, and optional images
     */
    extractRawData: function() {
      console.log('Starting ChatGPT raw data extraction');

      try {
        // --- START OF MODIFICATION ---
        // STRATEGY 1: Prioritize role-based selectors (most reliable)
        let messageElements = document.querySelectorAll('[data-message-author-role]');
        console.log('Using primary selector [data-message-author-role], found:', messageElements.length);

        // If the primary selector finds elements, process them
        if (messageElements.length > 0) {
          return this.extractFromRoleBasedElements(messageElements);
        }

        // If the primary selector finds *nothing*, throw an error immediately.
        // This prevents falling back to less reliable selectors that might grab sidebar content.
        throw new Error('No conversation content found using the primary [data-message-author-role] selector. ChatGPT UI may have changed, or no chat is visible.');

        // --- END OF MODIFICATION ---


        // --- ORIGINAL FALLBACK STRATEGIES (Now effectively disabled by the throw above) ---
        /*
        let messageGroups; // Variable to hold elements found by fallback strategies

        // STRATEGY 2: Look for conversation turn containers
        messageGroups = document.querySelectorAll('article[data-testid^="conversation-turn-"]');
        if (messageGroups.length === 0) {
            // Original fallback (more generic)
            messageGroups = document.querySelectorAll('div[class*="conversation-turn"]');
            console.log('Fallback 1a: Using conversation-turn class pattern, found:', messageGroups.length);
        } else {
            console.log('Fallback 1b: Using conversation-turn testid pattern, found:', messageGroups.length);
        }


        // STRATEGY 3: Structural pattern matching within main content
        if (messageGroups.length === 0) {
          const mainContent = document.querySelector('main') || document.body;
          // Adjusted selector for common structure based on provided HTML
          const chatContainers = mainContent.querySelectorAll('article > div > div > div.group\\/conversation-turn');
          messageGroups = Array.from(chatContainers).filter(container => {
            return container.textContent.trim().length > 5 &&
                   (container.querySelector('p, pre, code, ol, ul, img, .text-message') != null);
          });
          console.log('Fallback 2: Using structural pattern matching, found:', messageGroups.length);
        }

        // STRATEGY 4: Class-based selectors (most brittle, last resort)
        if (messageGroups.length === 0) {
          // Combine potentially relevant class selectors
          messageGroups = document.querySelectorAll('.text-base, .group, .markdown, div[class*="prose"], div[class*="message"], .text-message');
          console.log('Fallback 3: Using class-based selectors, found:', messageGroups.length);
        }

        // Check if any fallback strategy found elements
        if (messageGroups.length > 0) {
          console.warn('Using fallback selectors. Extraction might be less accurate.');
          // Process elements found by fallbacks (requires more guessing for user/assistant)
          return this.extractFromGenericElements(messageGroups);
        }

        // If no elements found by any strategy (This part is now technically unreachable due to the earlier throw)
        throw new Error('No conversation content found using any method. ChatGPT UI may have changed, or no chat is visible.');
        */

      } catch (error) {
        if (!error.message.includes('No conversation content found')) {
          console.error('Unexpected error during ChatGPT extraction process:', error);
        } else {
            // "No content" 오류는 특별히 로그할 필요 없음 (상위에서 처리)
            // console.warn('No content found, propagating error for handling.'); // 필요하다면 warn 레벨로 로깅
        }
        // Re-throw the error so the content script can catch it and report it
        throw error;
      }
    },

    /**
     * Processes elements identified by data-message-author-role (preferred method)
     * @param {NodeList} elements - Elements with data-message-author-role attributes
     * @returns {Array} - Array of processed data objects
     */
    extractFromRoleBasedElements: function(elements) {
      console.log("Processing role-based elements...");
      const rawDataArray = [];

      elements.forEach(element => {
        const role = element.getAttribute('data-message-author-role');
        let markdown = '';
        let images = []; // Store images for both user and assistant

        try {
          // Use a more specific selector for the actual content if available
          const contentWrapper = element.querySelector('.markdown') ||
                                 element.querySelector('div[class*="prose"]') ||
                                 element.querySelector('.text-message') ||
                                 element; // Fallback to the element itself

          // Extract HTML and convert to markdown
          if (contentWrapper && contentWrapper.innerHTML.trim()) {
              const html = contentWrapper.innerHTML;
              const contentElement = window.QAClipper.Utils.parseHTML(html);
              markdown = window.QAClipper.Utils.htmlToMarkdown(contentElement);
          } else {
              markdown = '';
              console.log(`No direct text content found in role=${role} element's typical wrappers.`);
          }


          // --- Image Extraction ---
          const parentArticle = element.closest('article[data-testid^="conversation-turn-"]');
          const imageContainer = parentArticle || element;

          imageContainer.querySelectorAll('img').forEach(img => {
            if (img.src && !img.src.startsWith('data:')) {
              const isOaiDomain = img.src.includes('oaiusercontent.com');
              const looksLikeContent = img.naturalWidth > 32 && img.naturalHeight > 32;

              if (isOaiDomain || looksLikeContent) {
                 if (!images.includes(img.src)) {
                    images.push(img.src);
                    console.log(`Found image (role=${role}): ${img.src}`);
                 }
              } else {
                if(img.closest('button') == null && (img.naturalWidth > 16 || img.naturalHeight > 16)) {
                    if (!images.includes(img.src)) {
                        console.log(`Including fallback image src (role=${role}): ${img.src}`);
                        images.push(img.src);
                    }
                } else {
                    console.log(`Skipping potential icon/button image (role=${role}): ${img.src}`);
                }
              }
            }
          });

        } catch (innerError) {
           console.error(`Error processing element with role ${role}:`, innerError, element);
           markdown = element.textContent.trim();
           images = [];
        }


        // Add to results array based on role, including entry if either markdown text OR images were found.
        if (role === 'user') {
          if (markdown || images.length > 0) {
            rawDataArray.push({
              type: 'user',
              content: markdown,
              images: images
            });
          }
        } else if (role === 'assistant') {
           if (markdown || images.length > 0) {
             rawDataArray.push({
               type: 'assistant',
               content: markdown,
               images: images
             });
           }
        }
      });

      console.log(`Extracted ${rawDataArray.length} items from role-based elements`);
      if (rawDataArray.length === 0) {
        // This case should ideally not happen if elements.length > 0, but added warning just in case.
        console.warn('Found role-based elements but extracted no Q&A pairs. Check content or inner selectors.');
         // Throw specific error if no actual pairs were extracted despite finding elements
         throw new Error('Found message containers but failed to extract Q&A pairs. Check content structure.');
      }
      return rawDataArray;
    },

    /**
     * Processes elements found by fallback strategies (less reliable)
     * Tries to guess user vs assistant based on structure or common classes.
     * NOTE: This function is now unlikely to be called due to the changes in extractRawData.
     * @param {NodeList} elements - Generic elements potentially representing messages
     * @returns {Array} - Array of processed data objects
     */
    extractFromGenericElements: function(elements) {
      // This function remains unchanged but is unlikely to be executed now.
      console.warn("Executing fallback extractFromGenericElements. This should ideally not happen with the new logic.");
      const rawDataArray = [];

      elements.forEach((element, index) => {
        let type = 'unknown';
        if (element.querySelector('.markdown, div[class*="prose"], pre, code, ol, ul, table, .agent-turn')) {
          type = 'assistant';
        }
        else if (!element.querySelector('.agent-turn') && element.textContent.trim().length > 0) {
           type = 'user';
        }

        if (type === 'unknown') {
            console.warn("Fallback: Could not determine type for element:", element);
            return;
        }

        try {
           let markdown = '';
           let images = [];
           const contentWrapper = element.querySelector('.markdown') ||
                                  element.querySelector('div[class*="prose"]') ||
                                  element.querySelector('.text-message') ||
                                  element;

           if (contentWrapper && contentWrapper.innerHTML.trim()) {
               const html = contentWrapper.innerHTML;
               const contentElement = window.QAClipper.Utils.parseHTML(html);
               markdown = window.QAClipper.Utils.htmlToMarkdown(contentElement);
           } else {
               markdown = element.textContent.trim();
           }


          element.querySelectorAll('img').forEach(img => {
            if (img.src && !img.src.startsWith('data:')) {
              const isOaiDomain = img.src.includes('oaiusercontent.com');
              const looksLikeContent = img.naturalWidth > 32 && img.naturalHeight > 32;
              if (isOaiDomain || looksLikeContent) {
                 if (!images.includes(img.src)) images.push(img.src);
              } else if (img.closest('button') == null && (img.naturalWidth > 16 || img.naturalHeight > 16)) {
                 if (!images.includes(img.src)) images.push(img.src);
              }
            }
          });

          if (markdown || images.length > 0) {
             rawDataArray.push({
               type: type,
               content: markdown,
               images: images
             });
          }

        } catch (innerError) {
           console.error(`Error processing generic element guessed as ${type}:`, innerError, element);
           const fallbackMarkdown = element.textContent.trim();
           if (fallbackMarkdown) {
               rawDataArray.push({ type: type, content: fallbackMarkdown, images: [] });
           }
        }
      });

      console.log(`Extracted ${rawDataArray.length} items using fallback method.`);
       const mergedData = [];
       if (rawDataArray.length > 0) {
           mergedData.push(rawDataArray[0]);
           for (let i = 1; i < rawDataArray.length; i++) {
               const last = mergedData[mergedData.length - 1];
               const current = rawDataArray[i];
               if (last.type === current.type && !(current.images.length > 0 && !current.content)) {
                   last.content += "\n\n" + current.content;
                   last.images = (last.images || []).concat(current.images || []);
               } else {
                   mergedData.push(current);
               }
           }
       }
       console.log(`Merged data length (fallback): ${mergedData.length}`);
      return mergedData;
    }
  };

  // Register the extractor
  if (!window.QAClipperExtractors) {
    window.QAClipperExtractors = {};
  }

  if (!window.QAClipperExtractors[ChatGPTExtractor.siteId]) {
     window.QAClipperExtractors[ChatGPTExtractor.siteId] = ChatGPTExtractor;
     console.log(`ChatGPT extractor (${ChatGPTExtractor.siteId}) registered.`);
  }

})(); // End of IIFE
// --- END OF FILE chatgpt.js ---