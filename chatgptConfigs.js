// chatgptConfigs.js

// Wrap in an immediately invoked function expression (IIFE) to prevent duplicate declarations
// when the script is injected multiple times
(function() {
  // Only set up if not already initialized
  if (window.chatgptConfig) {
    console.log("chatgptConfig already initialized, skipping re-initialization");
    return;
  }

  /**
   * Configuration structure for the ChatGPT platform.
   * Selectors and logic based on analysis of chat.openai.com DOM structure
   */
  const chatgptConfig = {
    platformName: 'ChatGPT',
    selectors: {
      // --- General ---
      // Each turn container often holds one user message OR one assistant message block.
      // We might need to adjust the main extractor loop if turns aren't strictly paired within one container.
      // For now, assuming extractor.js iterates through these and determines role for each.
      turnContainer: 'div[data-testid^="conversation-turn-"]', // Matches the article element in old script

      // --- User Turn Specific ---
      // Find the element with role='user' within the turnContainer
      userMessageContainer: '[data-message-author-role="user"]', 
      // Content selectors *within* the userMessageContainer
      userText: '.markdown, div[class*="prose"], .text-message',
      userImageContainer: 'button[aria-haspopup="dialog"]',
      userImageItem: 'img', // User images appear within the user message container

      userFileContainer: '.file-attachment-container', // Container for file attachments
      userFileItem: '.file-attachment-link', // File download link
      userFileName: '.file-attachment-name', // File name element
      userFileType: '.file-attachment-type', // File type indicator

      // --- Assistant Turn Specific ---
      // Find the element with role='assistant' within the turnContainer
      assistantMessageContainer: '[data-message-author-role="assistant"]',
      // Content area *within* the assistantMessageContainer. Process children of the first match.
      assistantContentArea: '.markdown, div[class*="prose"], .text-message',
      // Selectors for specific item types within the assistantContentArea
      textContentBlock: 'p, ul, ol, blockquote, h1, h2, h3, h4, h5, h6, table', // Added headings and tables
      codeBlockContainer: 'pre',
      codeBlockContent: 'code',
      codeBlockLangIndicatorClassPrefix: 'language-',

      imageElement: 'img',
      // ChatGPT interactive block selectors (placeholders, to be updated with specific details)
      interactiveBlockContainer: '.chat-plugin-element', // Placeholder for tool/plugin output container
      interactiveBlockButton: '.chat-plugin-title', // Placeholder for interactive title element
      interactiveBlockTitle: '.chat-plugin-title-text', // Placeholder for title text element
      interactiveBlockType: '.chat-plugin-type', // Placeholder for type indicator
      // ChatGPT side container (Canvas) selectors
      sideContainer: '.popover flex',
      sideContainerContent: '.cm-content',
      sideContainerLangIndicator: 'data-language',
    },

    /**
     * Determines the role ('user' or 'assistant') of a given turn element.
     * @param {Element} turnElement - The DOM element matching selectors.turnContainer.
     * @returns {'user'|'assistant'|null} The role, or null if indeterminable.
     */
    getRole: (turnElement) => {
      // Check if userMessageContainer exists.
      if (turnElement.querySelector(chatgptConfig.selectors.userMessageContainer)) {
        return 'user';
      // If userMessageContainer doesn't exist, check if assistantMessageContainer exists.
      } else if (turnElement.querySelector(chatgptConfig.selectors.assistantMessageContainer)) {
        return 'assistant';
      }
      // Return null if neither exists.
      return null; 
    },

    /**
     * Extracts the primary text content from a user turn element.
     * @param {Element} turnElement - The user turn DOM element (matching turnContainer).
     * @returns {string|null} The extracted text, or null if not found.
     */
    extractUserText: (turnElement) => {
      const userMsgContainer = turnElement.querySelector(chatgptConfig.selectors.userMessageContainer);
      if (!userMsgContainer) return null;

      const textElement = userMsgContainer.querySelector(chatgptConfig.selectors.userText);
      // Fallback to the container itself if specific content selectors fail
      const target = textElement || userMsgContainer;
      
      // Attempt to get text content, excluding potential code blocks inside user messages if any
      let text = '';
      target.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
              text += node.textContent;
          } else if (node.nodeType === Node.ELEMENT_NODE && !node.matches('pre') /* Exclude code blocks */) {
              // Crude way to exclude image alt text or other non-primary text
              if (!node.matches('img')) { 
                 text += node.textContent; 
              }
          }
      });

      return text.trim() || null;
    },

    /**
     * Extracts uploaded image attachments from a user turn element.
     * @param {Element} turnElement - The user turn DOM element (matching turnContainer).
     * @returns {Array<UserImage>} An array of UserImage objects.
     */
    extractUserUploadedImages: (turnElement) => {
      const images = [];
      const userMsgContainer = turnElement.querySelector(chatgptConfig.selectors.userMessageContainer);
      if (!userMsgContainer) return images;

      // Find the specific container for images within the user message container
      const imageContainer = userMsgContainer.querySelector(chatgptConfig.selectors.userImageContainer);
      // If the specific image container isn't found, fall back to searching within the whole user message container
      // This provides some robustness if the DOM structure varies slightly.
      const searchScope = imageContainer || userMsgContainer;

      // Search for image items within the determined scope
      searchScope.querySelectorAll(chatgptConfig.selectors.userImageItem).forEach(img => {
        const src = img.getAttribute('src');
        // Filter based on src and size, similar to old logic
        if (src && !src.startsWith('data:')) {
          const isOaiDomain = src.includes('oaiusercontent.com');
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          const looksLikeContent = width > 32 && height > 32;

          if (isOaiDomain || looksLikeContent) {
             // Basic check to avoid adding tiny icons that might slip through
             if(width > 16 && height > 16) {
                  images.push({
                    type: 'image',
                    sourceUrl: new URL(src, window.location.origin).href, // Ensure absolute URL
                    isPreviewOnly: true,
                    extractedContent: img.getAttribute('alt') || null, // Get alt text as content if available
                  });
             }
          }
        }
      });
      return images;
    },

    /**
     * Extracts uploaded file attachments (non-images) from a user turn element.
     * @param {Element} turnElement - The user turn DOM element.
     * @returns {Array<UserFile>} An array of UserFile objects.
     */
    extractUserUploadedFiles: (turnElement) => {
      const files = [];
      const userMsgContainer = turnElement.querySelector(chatgptConfig.selectors.userMessageContainer);
      if (!userMsgContainer) return files;

      const fileContainers = userMsgContainer.querySelectorAll(chatgptConfig.selectors.userFileContainer);
      fileContainers.forEach(container => {
        const fileLink = container.querySelector(chatgptConfig.selectors.userFileItem);
        const fileNameElement = container.querySelector(chatgptConfig.selectors.userFileName);
        const fileTypeElement = container.querySelector(chatgptConfig.selectors.userFileType);
        
        if (fileNameElement) {
          const fileName = fileNameElement.textContent?.trim();
          const fileType = fileTypeElement?.textContent?.trim() || 'Unknown';
          
          // Try to find content preview if available
          let extractedContent = null;
          const contentPreview = container.querySelector('.file-content-preview') || 
                                 container.querySelector('pre') || 
                                 container.querySelector('.file-content');
          if (contentPreview) {
            extractedContent = contentPreview.textContent?.trim() || null;
          }
          
          if (fileName) {
            files.push({
              type: 'file',
              fileName: fileName,
              fileType: fileType,
              isPreviewOnly: false,
              extractedContent: extractedContent
            });
          }
        }
      });

      return files;
    },

    /**
     * Extracts code from the side container (Canvas) that appears when interacting with an interactive block
     * @returns {Object|null} An object containing code and language, or null if not found
     */
    extractSideContainerCode: () => {
      // Find the side container in the DOM (Canvas in ChatGPT)
      const sideContainer = document.querySelector(chatgptConfig.selectors.sideContainer);
      if (!sideContainer) return null;
      
      // Find the content element with the actual code
      const contentElement = sideContainer.querySelector(chatgptConfig.selectors.sideContainerContent);
      if (!contentElement) return null;
      
      // Extract the code content
      const code = contentElement.textContent?.trim() || '';
      
      // Try to determine the language
      let language = null;
      const langIndicator = contentElement.getAttribute(chatgptConfig.selectors.sideContainerLangIndicator) || 
                           contentElement.parentElement?.getAttribute(chatgptConfig.selectors.sideContainerLangIndicator);
      
      if (langIndicator) {
        language = langIndicator;
      }
      
      return code ? { code, language } : null;
    },

    /**
     * Extracts the structured content items from an assistant turn element.
     * @param {Element} turnElement - The assistant turn DOM element (matching turnContainer).
     * @returns {Array<ContentItem>} An array of ContentItem objects preserving order.
     */
    extractAssistantContent: (turnElement) => {
      const contentItems = [];
      const assistantMsgContainer = turnElement.querySelector(chatgptConfig.selectors.assistantMessageContainer);
      if (!assistantMsgContainer) return contentItems;

      const contentArea = assistantMsgContainer.querySelector(chatgptConfig.selectors.assistantContentArea);
      const targetArea = contentArea || assistantMsgContainer; // Fallback to message container

      if (!targetArea) {
          console.warn("ChatGPT assistant content area not found within:", assistantMsgContainer);
          return [];
      }

      // Iterate through direct child nodes of the target content area
      targetArea.childNodes.forEach(node => {
        // ---- 1. Element Node Handling ----
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node;

          // ---- Code Block (`pre`) ----
          if (element.matches(chatgptConfig.selectors.codeBlockContainer)) {
            const codeElement = element.querySelector(chatgptConfig.selectors.codeBlockContent);
            const content = codeElement ? codeElement.textContent || '' : element.textContent || '';
            let language = null;
            if (codeElement) {
               // Try extracting language from class name (e.g., class="language-python")
              const langClass = Array.from(codeElement.classList).find(cls => cls.startsWith(chatgptConfig.selectors.codeBlockLangIndicatorClassPrefix));
              if (langClass) {
                language = langClass.substring(chatgptConfig.selectors.codeBlockLangIndicatorClassPrefix.length);
              } else {
                // Fallback: Check parent div for language attribute (sometimes used)
                const parentWithLang = element.closest('div[class*="language-"]');
                if (parentWithLang) {
                     const langClassDiv = Array.from(parentWithLang.classList).find(cls => cls.startsWith(chatgptConfig.selectors.codeBlockLangIndicatorClassPrefix));
                     if(langClassDiv) {
                         language = langClassDiv.substring(chatgptConfig.selectors.codeBlockLangIndicatorClassPrefix.length);
                     }
                }
              }
            }
            
            // Add as a standalone code block - no longer checking for association with interactive blocks
            contentItems.push({ type: 'code_block', language, content });
          }

          // ---- Interactive Block ----
          else if (element.matches(chatgptConfig.selectors.interactiveBlockContainer) && 
                   element.querySelector(chatgptConfig.selectors.interactiveBlockButton)) {
            const titleElement = element.querySelector(chatgptConfig.selectors.interactiveBlockTitle);
            const typeElement = element.querySelector(chatgptConfig.selectors.interactiveBlockType);
            
            const title = titleElement?.textContent?.trim() || 'Untitled Plugin/Tool';
            const typeText = typeElement?.textContent?.trim() || 'Unknown'; 
            
            // Try to get code from the side container
            const sideContainerData = chatgptConfig.extractSideContainerCode();
            
            const interactiveItem = {
              type: 'interactive_block',
              title: title,
              code: sideContainerData?.code || null,
              language: sideContainerData?.language || null,
              platformSpecificData: {
                chatgptToolType: typeText,
              }
            };
            contentItems.push(interactiveItem);
          }

          // ---- Image (`img`) ----
          else if (element.matches(chatgptConfig.selectors.imageElement)) {
              const src = element.getAttribute('src');
              const alt = element.getAttribute('alt');
              // Filter based on src and size, similar to user image logic
              if (src && !src.startsWith('data:')) {
                   const isOaiDomain = src.includes('oaiusercontent.com');
                   const width = element.naturalWidth || element.width;
                   const height = element.naturalHeight || element.height;
                   const looksLikeContent = width > 32 && height > 32;

                   if ((isOaiDomain || looksLikeContent) && width > 16 && height > 16) {
                       contentItems.push({
                          type: 'image',
                          src: new URL(src, window.location.origin).href, // Ensure absolute URL
                          alt: alt || null,
                          extractedContent: alt || null
                       });
                   }
              }
          }
          
          // ---- Standard Text/List/Table/Heading Content ----
          else if (element.matches(chatgptConfig.selectors.textContentBlock)) {
             // Use textContent for simplicity; complex HTML-to-Markdown is avoided
             const text = element.textContent?.trim();
             if (text) {
                 // Merge with previous text item if possible
                 const lastItem = contentItems.length > 0 ? contentItems[contentItems.length - 1] : null;
                 if (lastItem && lastItem.type === 'text') {
                   lastItem.content += `\n\n${text}`; // Add paragraph break
                 } else {
                   contentItems.push({ type: 'text', content: text });
                 }
             }
          }

          // ---- Fallback for Unhandled Element Nodes ----
          // Capture text content of other unexpected elements if they seem substantial
          else if (!element.matches(chatgptConfig.selectors.codeBlockContainer) && 
                   !element.matches(chatgptConfig.selectors.imageElement)) { // Avoid re-capturing handled types
               const fallbackText = element.textContent?.trim();
               if (fallbackText && fallbackText.length > 5) { // Avoid tiny fragments
                  console.warn("ChatGPT: Unhandled element type in assistant content, capturing text:", element);
                  const lastItem = contentItems.length > 0 ? contentItems[contentItems.length - 1] : null;
                   if (lastItem && lastItem.type === 'text') {
                       lastItem.content += `\n\n${fallbackText}`;
                   } else {
                       contentItems.push({ type: 'text', content: fallbackText });
                   }
               }
          }
        }
        // ---- 2. Text Node Handling ----
        // Capture text nodes that are direct children of the contentArea
        else if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (text) {
            const lastItem = contentItems.length > 0 ? contentItems[contentItems.length - 1] : null;
            if (lastItem && lastItem.type === 'text') {
              lastItem.content += ' ' + text; // Append with space
            } else {
              contentItems.push({ type: 'text', content: text });
            }
          }
        }
      }); // End loop through childNodes

      return contentItems;
    },
  };

  // Expose to window scope
  window.chatgptConfig = chatgptConfig;
  console.log("chatgptConfig initialized successfully");
})(); 