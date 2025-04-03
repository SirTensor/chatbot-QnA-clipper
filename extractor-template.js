/**
 * Template for creating a new chatbot site extractor
 * Replace SITENAME with your actual site name (lowercase, no spaces)
 * 
 * IMPLEMENTATION GUIDE:
 * 1. Focus on semantic selectors (data attributes, roles) over style classes
 * 2. Implement multiple fallback strategies for finding content
 * 3. Include detailed comments explaining selector choices
 * 4. Provide specific error messages when extraction fails
 */

// Wrap the entire script in an IIFE to prevent variable leakage
(function() {
  // Check if this extractor is already registered
  if (window.QAClipperExtractors && window.QAClipperExtractors.SITENAME) {
    return;
  }

  const SITENAMEExtractor = {
    /**
     * Site identifier - should be a unique lowercase string
     */
    siteId: 'SITENAME',
    
    /**
     * Checks if the current page matches this extractor
     * @returns {Boolean} - True if current page matches
     */
    isMatch: function() {
      // Replace with your site's domain check
      // Include all possible domains where this chatbot might be hosted
      return window.location.hostname.includes('SITENAME.com') || 
             window.location.hostname.includes('chat.SITENAME.com');
    },
    
    /**
     * Extracts raw Q&A data from the site
     * @returns {Array} - Array of objects with type, content, and optional images
     */
    extractRawData: function() {
      console.log('Starting SITENAME raw data extraction');
      
      try {
        // STRATEGY 1: Try data-attribute selectors (most reliable)
        // Most modern web applications use data attributes for component identification
        let messageContainers = document.querySelectorAll('[data-message-role], [data-conversation-item]');
        console.log('Using data attributes selector, found:', messageContainers.length);
        
        // STRATEGY 2: Try semantic role selectors or stable container patterns
        if (messageContainers.length === 0) {
          // Example: Find by ARIA roles or common container patterns
          messageContainers = document.querySelectorAll('[role="listitem"], .conversation-item');
          console.log('Using semantic roles selector, found:', messageContainers.length);
        }
        
        // STRATEGY 3: Try structural patterns based on DOM hierarchy
        if (messageContainers.length === 0) {
          // Find the main content area first (more stable approach)
          const mainContent = document.querySelector('main') || document.body;
          
          // Look for typical chat patterns - alternating content blocks
          const possibleContainers = mainContent.querySelectorAll('div > div');
          
          // Filter to containers that look like message containers
          messageContainers = Array.from(possibleContainers).filter(container => {
            // Message containers typically have substantial content
            return container.textContent.trim().length > 20 &&
                   // Usually have some structure like paragraphs or formatted text
                   (container.querySelectorAll('p, pre, code').length > 0);
          });
          
          console.log('Using structural pattern matching, found:', messageContainers.length);
        }
        
        if (messageContainers.length === 0) {
          throw new Error('No conversation content found. Make sure you are viewing a chat with messages.');
        }

        const rawDataArray = [];
        
        // Iterate through message containers to find user and AI messages
        for (let i = 0; i < messageContainers.length; i++) {
          const container = messageContainers[i];
          
          // HELPER FUNCTIONS: Detect message types based on content/attributes
          const isUserMessage = (element) => {
            // Check for direct role indicators
            if (element.getAttribute('data-message-role') === 'user' || 
                element.getAttribute('data-author') === 'user') {
              return true;
            }
            
            // Check for typical user message styling
            // User messages often have distinct styling or positioning
            const style = window.getComputedStyle(element);
            const isRightAligned = style.textAlign === 'right' || 
                                   style.alignSelf === 'flex-end' ||
                                   style.marginLeft === 'auto';
            
            // Some sites use different background colors for user vs assistant
            const hasDifferentBackground = style.backgroundColor !== 'transparent' && 
                                          style.backgroundColor !== 'rgba(0, 0, 0, 0)';
                                          
            return isRightAligned || hasDifferentBackground;
          };
          
          const isAssistantMessage = (element) => {
            // Check for direct role indicators
            if (element.getAttribute('data-message-role') === 'assistant' || 
                element.getAttribute('data-author') === 'assistant' ||
                element.getAttribute('data-author') === 'bot') {
              return true;
            }
            
            // AI responses often contain formatted elements
            return element.querySelectorAll('pre, code, ol, ul, table').length > 0;
          };
          
          // Find user and assistant elements
          let userElement = container.querySelector('[data-message-role="user"]');
          let assistantElement = container.querySelector('[data-message-role="assistant"]');
          
          // If not found by data attributes, try other methods
          if (!userElement || !assistantElement) {
            // Check if the container itself is a message
            if (isUserMessage(container)) {
              userElement = container;
            } else if (isAssistantMessage(container)) {
              assistantElement = container;
            } else {
              // Check all children to find messages
              const children = Array.from(container.children);
              children.forEach(child => {
                if (isUserMessage(child) && !userElement) {
                  userElement = child;
                } else if (isAssistantMessage(child) && !assistantElement) {
                  assistantElement = child;
                }
              });
            }
          }

          // Process user message
          if (userElement && userElement.textContent.trim()) {
            // Extract HTML and convert to markdown to preserve formatting
            const userHtml = userElement.innerHTML;
            const userContentElement = window.QAClipper.Utils.parseHTML(userHtml);
            const userMarkdown = window.QAClipper.Utils.htmlToMarkdown(userContentElement);
            
            // Extract image URLs if any
            const userImages = [];
            userElement.querySelectorAll('img').forEach(img => {
              if (img.src && !img.src.startsWith('data:')) {
                userImages.push(img.src);
              }
            });
            
            rawDataArray.push({
              type: 'user',
              content: userMarkdown,
              images: userImages
            });
          }
          
          // Process AI message
          if (assistantElement && assistantElement.textContent.trim()) {
            // Extract HTML and convert to markdown to preserve formatting
            const aiHtml = assistantElement.innerHTML;
            const aiContentElement = window.QAClipper.Utils.parseHTML(aiHtml);
            const aiMarkdown = window.QAClipper.Utils.htmlToMarkdown(aiContentElement);
            
            rawDataArray.push({
              type: 'assistant',
              content: aiMarkdown
            });
          }
        }
        
        console.log(`Extracted ${rawDataArray.length} items from SITENAME`);
        
        if (rawDataArray.length === 0) {
          throw new Error('No Q&A pairs found in the conversation. The site may have updated its UI structure.');
        }

        return rawDataArray;
      } catch (error) {
        console.error('Error in SITENAME extraction:', error);
        throw error;
      }
    }
  };
  
  // Register the extractor
  if (!window.QAClipperExtractors) {
    window.QAClipperExtractors = {};
  }
  
  window.QAClipperExtractors[SITENAMEExtractor.siteId] = SITENAMEExtractor;
})(); 