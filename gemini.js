// --- START OF FILE gemini.js ---

/**
 * Gemini-specific extraction logic for Chatbot Q&A Clipper
 * Leverages insights from Tampermonkey script regarding Gemini's structure.
 */

// Wrap the entire script in an IIFE to prevent variable leakage
(function() {
    // Check if this extractor is already registered
    if (window.QAClipperExtractors && window.QAClipperExtractors.gemini) {
      console.log('Gemini extractor already registered, skipping re-registration.');
      return;
    }
  
    const GeminiExtractor = {
      /**
       * Site identifier
       */
      siteId: 'gemini',
  
      /**
       * Checks if the current page is Gemini
       * @returns {Boolean} - True if current page is Gemini
       */
      isMatch: function() {
        // Covers both /app/* and /gem/* paths
        return window.location.hostname.includes('gemini.google.com');
      },
  
      /**
       * Extracts raw Q&A data from Gemini conversations.
       * Primary strategy uses semantic tags <user-query> and <model-response>.
       * @returns {Array} - Array of objects with type, content, and optional images
       */
      extractRawData: function() {
        console.log('Starting Gemini raw data extraction');
  
        try {
          // STRATEGY 1: Use semantic turn containers <user-query> and <model-response>
          // These seem to be the most stable identifiers based on analysis and the Tampermonkey script.
          // We query them together to maintain the conversation order.
          let turnElements = document.querySelectorAll('user-query, model-response');
          console.log('Using user-query/model-response selector, found:', turnElements.length);
  
          if (turnElements.length > 0) {
            return this.extractFromTurnContainers(turnElements);
          }
  
          // --- FALLBACK STRATEGIES (If primary fails) ---
          // Strategy 2: Look for query text and response containers separately
          // This is less ideal as pairing might be harder, but could work if the main tags change.
          let queryElements = document.querySelectorAll('.query-text');
          let responseElements = document.querySelectorAll('.response-container .markdown, model-response .markdown'); // Keep original TS selectors
          console.log(`Fallback Strategy 2: Found ${queryElements.length} queries, ${responseElements.length} responses.`);
  
          if (queryElements.length > 0 || responseElements.length > 0) {
             console.warn('Using fallback selectors (.query-text, .markdown). Pairing might be less accurate.');
             // Note: Implementing a reliable pairing fallback is complex.
             // For now, we'll prioritize the primary strategy and throw if it fails.
             // A future improvement could involve trying to pair these elements based on proximity or index.
             // return this.extractFromGenericElements(queryElements, responseElements); // <-- Placeholder for future implementation
          }
  
          // If no elements found by any strategy
          throw new Error('No conversation content found using primary method (user-query, model-response). Gemini UI may have changed, or no chat is visible.');
  
        } catch (error) {
          // console.error('Error during Gemini extraction process:', error);
          // Re-throw the error so the content script can catch it and report it
          throw error;
        }
      },
  
      /**
       * Processes elements identified by <user-query> and <model-response> tags.
       * @param {NodeList} elements - Nodelist containing user-query and model-response elements in order.
       * @returns {Array} - Array of processed data objects { type, content, images }
       */
      extractFromTurnContainers: function(elements) {
        console.log("Processing semantic turn containers...");
        const rawDataArray = [];
  
        elements.forEach(element => {
          const tagName = element.tagName.toLowerCase();
          let data = null;
  
          try {
            if (tagName === 'user-query') {
              // --- Process User Turn ---
              const queryTextElement = element.querySelector('.query-text');
              const userText = queryTextElement ? queryTextElement.innerText.trim() : '';
  
              // Extract user uploaded images using selectors from Tampermonkey script
              const userImages = this.extractUserImages(element);
  
              // Only add if there's text or an image
              if (userText || userImages.length > 0) {
                data = {
                  type: 'user',
                  // User input is usually plain text, no need for markdown conversion unless HTML is possible
                  content: userText,
                  images: userImages
                };
              }
  
            } else if (tagName === 'model-response') {
              // --- Process Assistant Turn ---
              const contentWrapper = element.querySelector('.markdown'); // Main content area
              let assistantMarkdown = '';
              let assistantImages = [];
  
              if (contentWrapper) {
                // Extract HTML and convert to markdown for text content
                const html = contentWrapper.innerHTML;
                const contentElement = window.QAClipper.Utils.parseHTML(html);
                assistantMarkdown = window.QAClipper.Utils.htmlToMarkdown(contentElement);
  
                // Extract images generated by the assistant (likely within the .markdown div)
                assistantImages = this.extractAssistantImages(contentWrapper);
              } else {
                 console.warn("Could not find .markdown content wrapper within model-response:", element);
                 // Fallback: maybe grab all text content?
                 assistantMarkdown = element.textContent.trim();
              }
  
  
              // Only add if there's text or an image
              if (assistantMarkdown || assistantImages.length > 0) {
                data = {
                  type: 'assistant',
                  content: assistantMarkdown,
                  images: assistantImages // Include AI generated images
                };
              }
            }
  
            // Add the processed data object to the array if it was created
            if (data) {
              rawDataArray.push(data);
            }
  
          } catch (innerError) {
             console.error(`Error processing Gemini element <${tagName}>:`, innerError, element);
             // Attempt basic text fallback for this element
             const fallbackText = element.textContent.trim();
             if (fallbackText) {
                // Guess type based on tag, push minimal data
                const type = tagName === 'user-query' ? 'user' : 'assistant';
                rawDataArray.push({ type: type, content: fallbackText, images: [] });
                console.warn(`Pushed basic text content as fallback for errored element <${tagName}>`);
             }
          }
        });
  
        console.log(`Extracted ${rawDataArray.length} items from semantic turn containers`);
        if (rawDataArray.length === 0 && elements.length > 0) {
          console.warn('Found turn containers but extracted no Q&A pairs. Check inner selectors or content.');
        }
        return rawDataArray;
      },
  
      /**
       * Extracts user-uploaded image URLs from within a <user-query> element.
       * Uses selectors identified in the Tampermonkey script.
       * @param {HTMLElement} userQueryElement - The <user-query> element.
       * @returns {Array<string>} - Array of valid image source URLs.
       */
      extractUserImages: function(userQueryElement) {
          const images = [];
          // Selectors from Tampermonkey script
          const imgSelectors = '.file-preview-container img.preview-image, img[data-test-id="uploaded-img"]';
          userQueryElement.querySelectorAll(imgSelectors).forEach(img => {
              const src = img.getAttribute('src');
              // Filter out blob URLs (cannot be directly used/copied) and null/empty src
              if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
                  if (!images.includes(src)) { // Avoid duplicates
                      images.push(src);
                      console.log(`Found user image: ${src}`);
                  }
              } else if (src && src.startsWith('blob:')) {
                   console.log(`Skipping user image (blob URL): ${src}`);
                   // Optionally add a placeholder string if needed:
                   // if (!images.includes('[User Uploaded Image: Blob URL]')) images.push('[User Uploaded Image: Blob URL]');
              }
          });
          return images;
      },
  
       /**
       * Extracts AI-generated image URLs from within a model response content element.
       * @param {HTMLElement} contentWrapper - The .markdown element (or similar) containing the AI response.
       * @returns {Array<string>} - Array of valid image source URLs.
       */
      extractAssistantImages: function(contentWrapper) {
          const images = [];
          if (!contentWrapper) return images;
  
          contentWrapper.querySelectorAll('img').forEach(img => {
              const src = img.getAttribute('src');
              // Filter out blob/data URIs and potentially small decorative images
              if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
                   // Basic heuristic: ignore tiny images likely used for UI elements
                   const width = img.naturalWidth || img.width;
                   const height = img.naturalHeight || img.height;
                   if (width > 32 && height > 32) { // Adjust threshold if needed
                      if (!images.includes(src)) { // Avoid duplicates
                          images.push(src);
                          console.log(`Found assistant image: ${src}`);
                      }
                   } else {
                       console.log(`Skipping potentially small/decorative assistant image: ${src} (w:${width}, h:${height})`);
                   }
              }
          });
          return images;
      }
  
      // Placeholder for fallback strategy implementation if needed later
      /*
      extractFromGenericElements: function(queryElements, responseElements) {
          console.log("Processing generic elements (fallback - NOT FULLY IMPLEMENTED)...");
          const rawDataArray = [];
          // TODO: Implement logic to process and pair queryElements and responseElements
          // This is complex and error-prone. Requires careful DOM analysis and pairing logic.
          // For now, rely on the primary strategy.
          console.error("Fallback extraction strategy for Gemini is not yet implemented.");
          return rawDataArray;
      }
      */
    };
  
    // Register the extractor
    if (!window.QAClipperExtractors) {
      window.QAClipperExtractors = {};
    }
  
    // Only register if not already present
    if (!window.QAClipperExtractors[GeminiExtractor.siteId]) {
       window.QAClipperExtractors[GeminiExtractor.siteId] = GeminiExtractor;
       console.log(`Gemini extractor (${GeminiExtractor.siteId}) registered.`);
    }
  
  })(); // End of IIFE
  // --- END OF FILE gemini.js ---