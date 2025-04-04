// claudeConfigs.js

// Wrap in an immediately invoked function expression (IIFE) to prevent duplicate declarations
// when the script is injected multiple times
(function() {
  // Only set up if not already initialized
  if (window.claudeConfig) {
    console.log("claudeConfig already initialized, skipping re-initialization");
    return;
  }

  /**
   * Configuration structure for the Claude platform.
   * Selectors and logic based on analysis of claude.ai DOM structure
   */
  const claudeConfig = {
    platformName: 'Claude',
    selectors: {
      // --- General ---
      turnContainer: 'div[data-test-render-count]', // Container for a full user or assistant turn
      // Role detection relies on checking for user/assistant specific message containers within the turnContainer

      // --- User Turn Specific ---
      userMessageContainer: 'div[data-testid="user-message"]', // Main container for user message text
      userText: 'div[data-testid="user-message"]', // Often the same as container, holds the text
      userImageContainer: '.relative.group/thumbnail', // Container often holding image previews (needs verification)
      userImageItem: 'img', // User attachments are primarily images currently

      userFileContainer: 'div.pb-2 div[class*="uploaded-file"]', // Container for file uploads
      userFileItem: 'a[href*="download"]', // File download links
      userFileName: 'div.text-sm', // File name element
      userFileType: 'div.text-xs', // File type/size element
      // userAttachmentFileName: '', // Not typically shown directly for user images
      // userAttachmentImageSrc: '', // Source is attribute of the img tag itself

      // --- Assistant Turn Specific ---
      assistantContentArea: 'div.font-claude-message div[tabindex="0"] > div', // The direct parent of diverse content blocks (p, pre, div.py-2 etc.)
      // Selectors for different content item types within the assistant's response:
      // These are checked against *direct children* of assistantContentArea in extractAssistantContent
      textContentBlock: 'p, ul, ol, blockquote', // Standard text/list elements
      codeBlockContainer: 'pre', // Container for a full code block
      codeBlockContent: 'code', // The actual code element inside the container (often has language class)
      codeBlockLangIndicatorClassPrefix: 'language-', // Class prefix on the code element (e.g., class="language-python")
      interactiveBlockContainer: 'div.py-2', // Container for artifact buttons (often followed by code)
      interactiveBlockButton: 'button.flex.text-left', // The button itself within the container
      interactiveBlockTitle: 'button.flex.text-left div.leading-tight.text-sm', // Title within the button
      interactiveBlockType: 'button.flex.text-left div.text-sm.text-text-300', // Type text within the button (e.g., "Code · 123 lines")
      // interactiveBlockCode is handled by checking the next sibling of interactiveBlockContainer if it's a 'pre'
      imageElement: 'img', // Selector for images within the assistant response
      // imageAltText is the 'alt' attribute of the img element

      // Claude side container (Artifact) selectors
      sideContainer: '.max-md:absolute', // Container for artifact buttons and content
      sideContainerContent: '.prismjs.code-block__code', 
      sideContainerLangIndicatorClassPrefix: 'language-', 
    },

    /**
     * Determines the role ('user' or 'assistant') of a given turn element.
     * @param {Element} turnElement - The DOM element representing a conversation turn (matching selectors.turnContainer).
     * @returns {'user'|'assistant'|null} The role, or null if indeterminable.
     */
    getRole: (turnElement) => {
      // Check for the presence of user or assistant specific message containers
      if (turnElement.querySelector(claudeConfig.selectors.userMessageContainer)) {
        return 'user';
      } else if (turnElement.querySelector('div.font-claude-message')) { // Use the broader assistant message wrapper for role detection
        return 'assistant';
      }
      // console.warn("Claude role detection: Neither user nor assistant container found in:", turnElement);
      return null; // Explicitly return null if role cannot be determined
    },

    /**
     * Extracts the primary text content from a user turn element.
     * @param {Element} turnElement - The user turn DOM element.
     * @returns {string|null} The extracted text, or null if not found.
     */
    extractUserText: (turnElement) => {
      const textElement = turnElement.querySelector(claudeConfig.selectors.userText);
      // Use textContent and trim; null if element not found or no text
      return textElement ? textElement.textContent?.trim() || null : null;
    },

    /**
     * Extracts uploaded image attachments from a user turn element.
     * @param {Element} turnElement - The user turn DOM element.
     * @returns {Array<UserImage>} An array of UserImage objects.
     */
    extractUserUploadedImages: (turnElement) => {
      const images = [];
      const processedSources = new Set(); // Avoid duplicates

      // Look for images within the specific preview container first
      const specificPreviewContainer = turnElement.querySelector(claudeConfig.selectors.userImageContainer);
      if (specificPreviewContainer) {
        specificPreviewContainer.querySelectorAll(claudeConfig.selectors.userImageItem).forEach(img => {
          const src = img.getAttribute('src');
          if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
            const absoluteSrc = src.startsWith('/') ? new URL(src, window.location.origin).href : src;
            if (!processedSources.has(absoluteSrc)) {
              images.push({
                type: 'image',
                sourceUrl: absoluteSrc,
                isPreviewOnly: true,
                extractedContent: img.getAttribute('alt') || null, // Get alt text as content if available
              });
              processedSources.add(absoluteSrc);
            }
          }
        });
      }

      // Fallback: Look for images that might be direct children or in other containers *before* the message text
      // This is less reliable and might need adjustment based on structure variations
      const userMessageElement = turnElement.querySelector(claudeConfig.selectors.userMessageContainer);
      if (userMessageElement) {
          let sibling = userMessageElement.previousElementSibling;
          while (sibling) {
              sibling.querySelectorAll(claudeConfig.selectors.userImageItem).forEach(img => {
                   const src = img.getAttribute('src');
                   if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
                      const absoluteSrc = src.startsWith('/') ? new URL(src, window.location.origin).href : src;
                      // Only add if not already found via the specific container
                      if (!processedSources.has(absoluteSrc)) {
                          images.push({
                          type: 'image',
                          sourceUrl: absoluteSrc,
                          isPreviewOnly: true,
                          extractedContent: img.getAttribute('alt') || null, // Get alt text as content if available
                          });
                          processedSources.add(absoluteSrc);
                      }
                   }
              });
              sibling = sibling.previousElementSibling;
          }
      }

      return images;
    },

    /**
     * Extracts uploaded file attachments (non-images) from a user turn element.
     * @param {Element} turnElement - The user turn DOM element.
     * @returns {Array<UserFile>} An array of UserFile objects.
     */
    extractUserUploadedFiles: (turnElement) => {
      const files = [];
      const processedFiles = new Set(); // Avoid duplicates

      // Find file containers
      const fileContainers = turnElement.querySelectorAll(claudeConfig.selectors.userFileContainer);
      fileContainers.forEach(container => {
        const fileLink = container.querySelector(claudeConfig.selectors.userFileItem);
        const fileNameElement = container.querySelector(claudeConfig.selectors.userFileName);
        const fileTypeElement = container.querySelector(claudeConfig.selectors.userFileType);
        
        if (fileLink && fileNameElement) {
          const fileName = fileNameElement.textContent?.trim();
          const fileType = fileTypeElement?.textContent?.trim()?.split('·')[0]?.trim() || 'Unknown';
          
          // Try to find content preview if available (e.g., text content shown in the UI)
          let extractedContent = null;
          const contentPreview = container.querySelector('.file-content-preview') || 
                                 container.querySelector('pre') || 
                                 container.querySelector('.preview-text');
          if (contentPreview) {
            extractedContent = contentPreview.textContent?.trim() || null;
          }
          
          if (fileName && !processedFiles.has(fileName)) {
            files.push({
              type: 'file',
              fileName: fileName,
              fileType: fileType,
              isPreviewOnly: false,
              extractedContent: extractedContent
            });
            processedFiles.add(fileName);
          }
        }
      });

      return files;
    },

    /**
     * Extracts code from the side container (Artifact) that appears when interacting with an interactive block
     * @returns {Object|null} An object containing code and language, or null if not found
     */
    extractSideContainerCode: () => {
      // Find the side container in the DOM
      const sideContainer = document.querySelector(claudeConfig.selectors.sideContainer);
      if (!sideContainer) return null;
      
      // Find the content elements with the actual code
      const codeBlocks = sideContainer.querySelectorAll(claudeConfig.selectors.sideContainerContent);
      if (!codeBlocks || codeBlocks.length === 0) return null;
      
      // Use the first code block found (assuming only one is relevant)
      const codeBlock = codeBlocks[0];
      
      // Extract code content from all spans
      let code = '';
      const spans = codeBlock.querySelectorAll('span');
      if (spans && spans.length > 0) {
        spans.forEach(span => {
          code += span.textContent || '';
        });
      } else {
        // Fallback: get text directly from code block if no spans
        code = codeBlock.textContent || '';
      }
      
      // Try to determine the language from the class attribute
      let language = null;
      const classes = codeBlock.className.split(' ');
      for (const cls of classes) {
        if (cls.startsWith(claudeConfig.selectors.sideContainerLangIndicatorClassPrefix)) {
          language = cls.substring(claudeConfig.selectors.sideContainerLangIndicatorClassPrefix.length);
          break;
        }
      }
      
      return code.trim() ? { code: code.trim(), language } : null;
    },

    /**
     * Extracts the structured content items from an assistant turn element.
     * Implements the "Unified Content Stream" approach by iterating through direct children
     * of the `assistantContentArea`.
     * @param {Element} turnElement - The assistant turn DOM element (matching selectors.turnContainer).
     * @returns {Array<ContentItem>} An array of ContentItem objects preserving order.
     */
    extractAssistantContent: (turnElement) => {
      const contentItems = [];
      const contentArea = turnElement.querySelector(claudeConfig.selectors.assistantContentArea);

      if (!contentArea) {
        console.warn("Claude assistant content area not found with selector:", claudeConfig.selectors.assistantContentArea);
        return [];
      }

      // Iterate through direct child nodes of the content area to maintain order
      contentArea.childNodes.forEach((node, index) => {
        // ---- 1. Element Node Handling ----
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node; // Alias for clarity

          // ---- Code Block (`pre`) ----
          if (element.matches(claudeConfig.selectors.codeBlockContainer)) {
            const codeElement = element.querySelector(claudeConfig.selectors.codeBlockContent);
            const content = codeElement ? codeElement.textContent || '' : element.textContent || '';
            let language = null;
            if (codeElement) {
              const langClass = Array.from(codeElement.classList).find(cls => cls.startsWith(claudeConfig.selectors.codeBlockLangIndicatorClassPrefix));
              if (langClass) {
                language = langClass.substring(claudeConfig.selectors.codeBlockLangIndicatorClassPrefix.length);
              }
            }
             
            // Add as a standalone code block - no longer checking for association with interactive blocks
            contentItems.push({ type: 'code_block', language, content });
          }

          // ---- Interactive Block (Artifact Button Container `div.py-2`) ----
          else if (element.matches(claudeConfig.selectors.interactiveBlockContainer) && element.querySelector(claudeConfig.selectors.interactiveBlockButton)) {
            const titleElement = element.querySelector(claudeConfig.selectors.interactiveBlockTitle);
            const typeElement = element.querySelector(claudeConfig.selectors.interactiveBlockType);

            const title = titleElement?.textContent?.trim() || 'Untitled Artifact';
            const typeText = typeElement?.textContent?.trim().split('·')[0].trim() || 'Unknown'; // Extract base type

            // Try to get code from the side container
            const sideContainerData = claudeConfig.extractSideContainerCode();
            
            const interactiveItem = {
              type: 'interactive_block',
              title: title,
              code: sideContainerData?.code || null,
              language: sideContainerData?.language || null,
              platformSpecificData: {
                claudeArtifactType: typeText,
              }
            };
            contentItems.push(interactiveItem);
          }

          // ---- Image (`img`) ----
          // Ensure it's not inside an interactive block button (already handled)
          else if (element.matches(claudeConfig.selectors.imageElement) && !element.closest(claudeConfig.selectors.interactiveBlockButton)) {
            const src = element.getAttribute('src');
            const alt = element.getAttribute('alt');
            const width = element.naturalWidth || element.width;
            const height = element.naturalHeight || element.height;

            // Basic filtering for potentially meaningful images vs tiny icons
            // Exclude blob/data URIs as they aren't easily portable
            if (src && !src.startsWith('blob:') && !src.startsWith('data:') && (width > 32 || height > 32)) {
               const absoluteSrc = src.startsWith('/') ? new URL(src, window.location.origin).href : src;
               contentItems.push({
                  type: 'image',
                  src: absoluteSrc,
                  alt: alt || null // Use null if alt is empty
               });
            }
          }

          // ---- Standard Text/List Content (`p`, `ul`, `ol`, `blockquote`) ----
          // Make sure it's not *part* of an already handled block (e.g., text inside artifact button)
          else if (element.matches(claudeConfig.selectors.textContentBlock) && !element.closest(claudeConfig.selectors.interactiveBlockButton)) {
            // Extract semantic HTML content for potential conversion later
            // Or just use textContent for simplicity? Let's try textContent first.
            const text = element.textContent?.trim();
            if (text) {
              // Merge with previous text item if possible
              const lastItem = contentItems.length > 0 ? contentItems[contentItems.length - 1] : null;
              if (lastItem && lastItem.type === 'text') {
                // Use template literal for correct newline handling
                lastItem.content += `

${text}`;
              } else {
                contentItems.push({ type: 'text', content: text });
              }
            }
          }

          // ---- Fallback for Unhandled Element Nodes ----
          // Capture text content of other unexpected elements if they seem substantial
          else if (!element.matches(claudeConfig.selectors.codeBlockContainer) && /* already handled */
                   !element.matches(claudeConfig.selectors.interactiveBlockContainer) && /* already handled */
                   !element.matches(claudeConfig.selectors.imageElement) /* already handled */ )
          {
               const fallbackText = element.textContent?.trim();
               if (fallbackText && fallbackText.length > 10) { // Avoid capturing tiny bits of text/whitespace
                  console.warn("Claude: Unhandled element type in assistant content, capturing text:", element);
                  const lastItem = contentItems.length > 0 ? contentItems[contentItems.length - 1] : null;
                   if (lastItem && lastItem.type === 'text') {
                       // Use template literal for correct newline handling
                       lastItem.content += `

${fallbackText}`;
                   } else {
                       contentItems.push({ type: 'text', content: fallbackText });
                   }
               }
          }
        }
        // ---- 2. Text Node Handling ----
        // Capture text nodes that are direct children of the contentArea (e.g., simple text replies)
        else if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (text) {
            const lastItem = contentItems.length > 0 ? contentItems[contentItems.length - 1] : null;
            if (lastItem && lastItem.type === 'text') {
              lastItem.content += ' ' + text; // Append to previous text block with a space
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
  window.claudeConfig = claudeConfig;
  console.log("claudeConfig initialized successfully");
})(); 