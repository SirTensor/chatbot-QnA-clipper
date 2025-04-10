// claudeConfig.js (v5 - Table Handling)

(function() {
  // Initialization check to prevent re-running the script if already loaded
  if (window.claudeConfig && window.claudeConfig.version >= 5) {
    // console.log("Claude config already initialized (v" + window.claudeConfig.version + "), skipping.");
    return;
  }

  // --- Helper Functions ---

  /**
   * Checks if an HTML element should be skipped during markdown conversion.
   * Skips elements handled by dedicated processors (code blocks, artifact buttons).
   * @param {HTMLElement} element - The element to check.
   * @returns {boolean} - True if the element should be skipped.
   */
  function shouldSkipElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    const selectors = window.claudeConfig?.selectors;
    if (!selectors) return false; // Config not loaded yet
    const tagNameLower = element.tagName.toLowerCase();

    // Never skip heading elements (h1-h6) or blockquotes
    if (tagNameLower.match(/^h[1-6]$/) || tagNameLower === 'blockquote') return false;

    // Skip elements handled by dedicated functions
    return tagNameLower === 'pre' || // Handled by processCodeBlock
           element.closest(selectors.artifactButton); // Check if element is INSIDE an artifact button/cell
  }

   /**
   * Processes artifact buttons/cells within assistant messages to extract title only.
   * @param {HTMLElement} artifactCellEl - The artifact cell element (`div.artifact-block-cell`).
   * @returns {object|null} - An interactive_block content item with title only.
   */
  function processArtifactButton(artifactCellEl) { // Renamed parameter for clarity
    const selectors = window.claudeConfig.selectors;
    // Find title within the artifact cell div
    const titleElement = artifactCellEl.querySelector(selectors.artifactTitle);
    const title = titleElement ? titleElement.textContent?.trim() : '[Artifact]'; // Default title

    // console.log(`[Claude Extractor v5] Found artifact cell with title: "${title}". Code extraction skipped.`);

    // Return an interactive_block item with only the title
    return {
        type: 'interactive_block',
        title: title,
        code: null, // Explicitly set code to null
        language: null // Explicitly set language to null
    };
  }

  // --- Main Configuration Object ---
  const claudeConfig = {
    platformName: 'Claude',
    version: 5, // Update config version identifier
    selectors: {
      // Container for a single turn (user or assistant)
      turnContainer: 'div[data-test-render-count]',

      // --- User Turn Selectors ---
      userMessageContainer: 'div[data-testid="user-message"]',
      userText: 'p.whitespace-pre-wrap',
      userCodeBlock: 'pre',
      userHeading: 'h1, h2, h3, h4, h5, h6',
      userList: 'ol, ul',
      userContentContainer: 'div.font-claude-message',
      userImageThumbnailContainer: 'div.group\\/thumbnail',
      userImageElement: 'img[alt]',
      userFileThumbnailContainer: 'div[data-testid="file-thumbnail"]',
      userFileName: 'h3',
      userFileType: 'p',
      userFilePreviewContent: 'div.whitespace-pre-wrap',

      // --- Assistant Turn Selectors ---
      assistantMessageContainer: 'div.font-claude-message',
      // Selector for the grid *inside* a tabindex div (used in v5 logic)
      assistantContentGridInTabindex: ':scope > div.grid-cols-1',
      // Selector for content elements *inside* the grid (used in v5 logic)
      assistantContentElementsInGrid: ':scope > :is(p, ol, ul, pre, h1, h2, h3, h4, h5, h6, blockquote)',

      // --- Content Block Selectors (within assistant turn) ---
      listItem: 'li',
      codeBlockContainer: 'pre', // Still needed for processCodeBlock if found
      codeBlockContent: 'code', // Match all code elements, not just those with language classes
      codeBlockLangIndicator: 'div.text-text-500.absolute, div.text-text-300.absolute', // Multiple indicator options
      codeBlockOuterContainer: 'pre > div > div > pre.code-block__code', // Special case for deeply nested code blocks
      
      // --- Table Selectors (no longer used, turndown handles tables) ---
      tableContainer: 'pre.font-styrene', // The pre element containing the table
      tableElement: 'table', // The actual table element

      // --- Heading Selectors ---
      headingElements: 'h1, h2, h3, h4, h5, h6', // Explicit selector for headings

      // --- Artifact (Interactive Block) Selectors ---
      artifactContainerDiv: 'div.py-2', // The div containing the artifact button/cell
      artifactButton: 'div.artifact-block-cell', // The inner div passed to processArtifactButton
      artifactTitle: 'div.leading-tight', // Title text within the artifact cell

      // --- Unused Selectors ---
      imageContainerAssistant: null,
      imageElementAssistant: null,
      imageCaption: null,
    },

    // --- Extraction Functions ---

    getRole: (turnElement) => {
      if (turnElement.querySelector(claudeConfig.selectors.userMessageContainer)) return 'user';
      if (turnElement.querySelector(claudeConfig.selectors.assistantMessageContainer)) return 'assistant';
      return null;
    },

    /**
     * Basic extraction of user text without preserving full structure.
     * @param {HTMLElement} turnElement - The user turn container element.
     * @returns {String|null} - The extracted text as markdown or null if none found.
     * @deprecated - Use extractUserContent instead for better structure preservation
     */
    extractUserText: (turnElement) => {
      const textElements = turnElement.querySelectorAll(claudeConfig.selectors.userText);
      if (!textElements || textElements.length === 0) return null;
      
      const text = Array.from(textElements).map(el => 
        QAClipper.Utils.htmlToMarkdown(el, { 
          skipElementCheck: shouldSkipElement,
          platformName: 'claude'
        }).trim()
      ).join('\n');
      
      return text || null;
    },

    /**
     * Extracts structured content from a user turn, preserving formatting.
     * @param {HTMLElement} turnElement - The user turn container element.
     * @returns {Array<object>} - An array of content items (text, code_block).
     */
    extractUserContent: (turnElement) => {
      const contentItems = [];
      const selectors = claudeConfig.selectors;
      const userContainer = turnElement.querySelector(selectors.userMessageContainer);
      if (!userContainer) {
        return [];
      }
      
      // Process all user content in order
      const elements = userContainer.querySelectorAll(':scope > *');
      if (!elements || elements.length === 0) {
        // Fall back to extractUserText for legacy support
        const text = claudeConfig.extractUserText(turnElement);
        if (text) QAClipper.Utils.addTextItem(contentItems, text);
        return contentItems;
      }
      
      Array.from(elements).forEach((element) => {
        const tagNameLower = element.tagName.toLowerCase();
        
        // Handle headings (h1-h6)
        if (tagNameLower.match(/^h[1-6]$/)) {
          const markdownText = QAClipper.Utils.claudeHeadingHandler(element, {
            skipElementCheck: shouldSkipElement
          });
          
          if (markdownText) {
            QAClipper.Utils.addTextItem(contentItems, markdownText);
          }
        }
        // Handle paragraphs and text
        else if (tagNameLower === 'p' || element.matches(selectors.userText)) {
          const markdownText = QAClipper.Utils.htmlToMarkdown(element, {
            skipElementCheck: shouldSkipElement,
            platformName: 'claude'
          }).trim();
          
          if (markdownText) {
            QAClipper.Utils.addTextItem(contentItems, markdownText);
          }
        }
        // Handle lists (ul, ol)
        else if (tagNameLower === 'ul' || tagNameLower === 'ol') {
          const listItems = Array.from(element.children).filter(child => child.tagName.toLowerCase() === 'li');
          const listStylePrefix = tagNameLower === 'ol' ? '1. ' : '* '; // Base prefix
          const indentSpaces = '  '; // Indentation for multi-line items
          
          listItems.forEach((listItem, index) => {
            let nodesForMarkdown = []; // Accumulate nodes to be processed
            
            Array.from(listItem.childNodes).forEach(listItemChild => {
              if (listItemChild.nodeType === Node.ELEMENT_NODE && listItemChild.tagName.toLowerCase() === 'pre') {
                // Try to handle the <pre> with the dedicated handler
                const codeBlockItem = QAClipper.Utils.claudeCodeBlockHandler(listItemChild, { 
                  skipElementCheck: shouldSkipElement,
                  isUserMessage: true
                });
                
                if (codeBlockItem) {
                  // If handler succeeds, process accumulated nodes before adding the code block
                  if (nodesForMarkdown.length > 0) {
                    const tempContainer = document.createElement('div');
                    nodesForMarkdown.forEach(node => tempContainer.appendChild(node.cloneNode(true)));
                    const textMarkdown = QAClipper.Utils.htmlToMarkdown(tempContainer, { 
                      skipElementCheck: shouldSkipElement, 
                      platformName: 'claude' 
                    }).trim();
                    
                    if (textMarkdown) {
                      // Add accumulated text with list prefix and indentation
                      const currentPrefix = tagNameLower === 'ol' ? `${index + 1}. ` : listStylePrefix;
                      QAClipper.Utils.addTextItem(contentItems, currentPrefix + textMarkdown.replace(/\n/g, '\n' + indentSpaces));
                    }
                    nodesForMarkdown = []; // Reset accumulator
                  }
                  // Add the code block itself
                  contentItems.push(codeBlockItem);
                } else {
                  // If handler fails, treat this <pre> as a normal node for markdown conversion
                  nodesForMarkdown.push(listItemChild);
                }
              } else {
                // Accumulate other node types (Text, spans, nested lists, etc.)
                nodesForMarkdown.push(listItemChild);
              }
            });
            
            // Process any remaining accumulated nodes
            if (nodesForMarkdown.length > 0) {
              const tempContainer = document.createElement('div');
              nodesForMarkdown.forEach(node => tempContainer.appendChild(node.cloneNode(true)));
              const textMarkdown = QAClipper.Utils.htmlToMarkdown(tempContainer, { 
                skipElementCheck: shouldSkipElement, 
                platformName: 'claude' 
              }).trim();
              
              if (textMarkdown) {
                // Add remaining text with list prefix and indentation
                const currentPrefix = tagNameLower === 'ol' ? `${index + 1}. ` : listStylePrefix;
                QAClipper.Utils.addTextItem(contentItems, currentPrefix + textMarkdown.replace(/\n/g, '\n' + indentSpaces));
              }
            }
          });
        }
        // Handle code blocks
        else if (tagNameLower === 'pre') {
          const codeBlockItem = QAClipper.Utils.claudeCodeBlockHandler(element, {
            skipElementCheck: shouldSkipElement,
            isUserMessage: true
          });
          
          if (codeBlockItem) {
            contentItems.push(codeBlockItem);
          } else {
            // If not a code block, use normal markdown conversion
            const markdownText = QAClipper.Utils.htmlToMarkdown(element, {
              skipElementCheck: shouldSkipElement,
              platformName: 'claude'
            }).trim();
            
            if (markdownText) {
              QAClipper.Utils.addTextItem(contentItems, markdownText);
            }
          }
        }
        // Handle div containers (might contain other content)
        else if (tagNameLower === 'div') {
          // Check for code blocks or headings inside
          const nestedCodeBlock = element.querySelector(selectors.codeBlockContainer);
          const nestedHeading = element.querySelector(selectors.headingElements);
          const nestedList = element.querySelector(selectors.userList);
          
          if (nestedCodeBlock || nestedHeading || nestedList) {
            // If there are special elements inside, process them individually
            if (nestedCodeBlock) {
              const codeBlockItem = QAClipper.Utils.claudeCodeBlockHandler(nestedCodeBlock, {
                skipElementCheck: shouldSkipElement,
                isUserMessage: true
              });
              
              if (codeBlockItem) {
                contentItems.push(codeBlockItem);
              }
            }
            
            if (nestedHeading) {
              const markdownText = QAClipper.Utils.claudeHeadingHandler(nestedHeading, {
                skipElementCheck: shouldSkipElement
              });
              
              if (markdownText) {
                QAClipper.Utils.addTextItem(contentItems, markdownText);
              }
            }
            
            if (nestedList) {
              const markdownText = QAClipper.Utils.htmlToMarkdown(nestedList, {
                skipElementCheck: shouldSkipElement,
                platformName: 'claude'
              }).trim();
              
              if (markdownText) {
                QAClipper.Utils.addTextItem(contentItems, markdownText);
              }
            }
          } else {
            // If no special elements, convert the entire div
            const markdownText = QAClipper.Utils.htmlToMarkdown(element, {
              skipElementCheck: shouldSkipElement,
              platformName: 'claude'
            }).trim();
            
            if (markdownText) {
              QAClipper.Utils.addTextItem(contentItems, markdownText);
            }
          }
        }
        // Handle other elements as simple text
        else {
          const markdownText = QAClipper.Utils.htmlToMarkdown(element, {
            skipElementCheck: shouldSkipElement,
            platformName: 'claude'
          }).trim();
          
          if (markdownText) {
            QAClipper.Utils.addTextItem(contentItems, markdownText);
          }
        }
      });
      
      return contentItems;
    },

    extractUserUploadedImages: (turnElement) => {
      const images = [];
      const selectors = claudeConfig.selectors;
      turnElement.querySelectorAll(selectors.userImageThumbnailContainer).forEach(container => {
        const imgElement = container.querySelector(selectors.userImageElement);
        if (imgElement) {
          const src = imgElement.getAttribute('src');
          const alt = imgElement.getAttribute('alt')?.trim() || 'User Uploaded Image';
          let absoluteSrc = src;
          if (src && !src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
              try { absoluteSrc = new URL(src, window.location.origin).href; }
              catch (e) { console.error("[Claude Extractor v5] Error creating absolute URL for image:", e, src); }
          }
          if (absoluteSrc && !absoluteSrc.startsWith('blob:') && !absoluteSrc.startsWith('data:')) {
             images.push({ type: 'image', sourceUrl: absoluteSrc, isPreviewOnly: src !== absoluteSrc, extractedContent: alt });
          }
        }
      });
      return images;
    },

    extractUserUploadedFiles: (turnElement) => {
        const files = [];
        const selectors = claudeConfig.selectors;
        turnElement.querySelectorAll(selectors.userFileThumbnailContainer).forEach(container => {
            const nameElement = container.querySelector(selectors.userFileName);
            const typeElement = container.querySelector(selectors.userFileType);
            const previewElement = container.querySelector(selectors.userFilePreviewContent);
            const fileName = nameElement ? nameElement.textContent?.trim() : null;
            let fileType = typeElement ? typeElement.textContent?.trim().split('\n')[0] : 'File';
            if (fileType && fileType.includes('line')) { fileType = fileType.split(' ')[0]; }
            let previewContent = previewElement ? previewElement.textContent?.trim() : null;
            if (fileName) {
                files.push({ type: 'file', fileName: fileName, fileType: fileType, isPreviewOnly: !previewContent, extractedContent: previewContent });
            }
        });
        return files;
    },

    /**
     * Extracts structured content items from an assistant turn by processing direct children.
     * @param {HTMLElement} turnElement - The assistant turn container element.
     * @returns {Array<object>} - An array of content items (text, code_block, interactive_block).
     */
    extractAssistantContent: (turnElement) => {
      const contentItems = [];
      const selectors = claudeConfig.selectors;
      const assistantContainer = turnElement.querySelector(selectors.assistantMessageContainer);
      if (!assistantContainer) {
          console.warn("[Claude Extractor v5] Assistant message container not found.");
          return [];
      }

      // Log basic debug info but don't extract headings directly anymore
      // console.log("[Claude Extractor v5] DEBUG: Looking for heading elements using selector:", selectors.headingElements);
      const directHeadings = assistantContainer.querySelectorAll(selectors.headingElements);
      // console.log(`[Claude Extractor v5] DEBUG: Found ${directHeadings.length} heading elements directly in assistantContainer`);

      // Process direct children to maintain content order
      // console.log(`[Claude Extractor v5] Processing direct children of assistant container.`);
      const directChildren = Array.from(assistantContainer.children);

      directChildren.forEach((child, index) => {
          const tagNameLower = child.tagName.toLowerCase();
          // console.log(`[Claude Extractor v5] Processing Child #${index}: <${tagNameLower}>`);
          let item = null; // Define item here

          // Case 1: Child is a container for text, lists, or code blocks (div with tabindex)
          if (tagNameLower === 'div' && child.hasAttribute('tabindex')) {
              // console.log("  -> Handling as Text/List/Code Container (tabindex div)");
              // Find the grid inside this div
              const gridInside = child.querySelector(selectors.assistantContentGridInTabindex);
              if (gridInside) {
                  //  Process content elements
                  const contentElements = gridInside.querySelectorAll(selectors.assistantContentElementsInGrid);
                                    
                  // Don't process headings first anymore - process all content elements in order
                  // when we loop through contentElements below
                  
                  // Process content elements in document order
                  contentElements.forEach(contentElement => {
                      const contentTagName = contentElement.tagName.toLowerCase();
                      // console.log(`[Claude Extractor v5] Processing Grid Element: <${contentTagName}>`);
                      item = null; // Reset item for each element
                      
                      // Handle heading elements h1-h6
                      if (contentTagName.match(/^h[1-6]$/)) {
                          // Process heading using the utility function
                          const markdownText = QAClipper.Utils.claudeHeadingHandler(contentElement, {
                              skipElementCheck: shouldSkipElement
                          });
                          
                          if (markdownText) {
                              QAClipper.Utils.addTextItem(contentItems, markdownText);
                          }
                      }
                      // Handle paragraphs
                      else if (contentTagName === 'p') {
                          const markdownText = QAClipper.Utils.htmlToMarkdown(contentElement, { 
                            skipElementCheck: shouldSkipElement,
                            platformName: 'claude'
                          }).trim();
                          if (markdownText) QAClipper.Utils.addTextItem(contentItems, markdownText);
                      }
                      // Handle lists (ol, ul) - REVISED LOGIC v2 (Restore detailed handling for nested elements)
                      else if (contentTagName === 'ul' || contentTagName === 'ol') {
                          const listItems = Array.from(contentElement.children).filter(child => child.tagName.toLowerCase() === 'li');
                          const listStylePrefix = contentTagName === 'ol' ? '1. ' : '* '; // Base prefix
                          const indentSpaces = '  '; // Indentation for multi-line items within a list item

                          listItems.forEach((listItem, index) => {
                              let nodesForMarkdown = []; // Accumulate nodes to be processed by Turndown

                              Array.from(listItem.childNodes).forEach(listItemChild => {
                                  if (listItemChild.nodeType === Node.ELEMENT_NODE && listItemChild.tagName.toLowerCase() === 'pre') {
                                      // Try to handle the <pre> with the dedicated handler
                                      const codeBlockItem = QAClipper.Utils.claudeCodeBlockHandler(listItemChild, { skipElementCheck: shouldSkipElement, isUserMessage: true });
                                      
                                      if (codeBlockItem) {
                                          // If handler succeeds, process accumulated nodes before adding the code block
                                          if (nodesForMarkdown.length > 0) {
                                              const tempContainer = document.createElement('div');
                                              nodesForMarkdown.forEach(node => tempContainer.appendChild(node.cloneNode(true)));
                                              const textMarkdown = QAClipper.Utils.htmlToMarkdown(tempContainer, { skipElementCheck: shouldSkipElement, platformName: 'claude' }).trim();
                                              if (textMarkdown) {
                                                  // Add accumulated text with list prefix and indentation
                                                  // Use the correct index for ordered lists
                                                  const currentPrefix = contentTagName === 'ol' ? `${index + 1}. ` : listStylePrefix;
                                                  QAClipper.Utils.addTextItem(contentItems, currentPrefix + textMarkdown.replace(/\n/g, '\n' + indentSpaces));
                                              }
                                              nodesForMarkdown = []; // Reset accumulator
                                          }
                                          // Add the code block itself
                                          contentItems.push(codeBlockItem);
                                      } else {
                                          // If handler fails, treat this <pre> as a normal node for markdown conversion
                                          nodesForMarkdown.push(listItemChild);
                                      }
                                  } else {
                                      // Accumulate other node types (Text, spans, nested lists, etc.)
                                      nodesForMarkdown.push(listItemChild);
                                  }
                              });

                              // After processing all children, process any remaining accumulated nodes
                              if (nodesForMarkdown.length > 0) {
                                  const tempContainer = document.createElement('div');
                                  nodesForMarkdown.forEach(node => tempContainer.appendChild(node.cloneNode(true)));
                                  const textMarkdown = QAClipper.Utils.htmlToMarkdown(tempContainer, { skipElementCheck: shouldSkipElement, platformName: 'claude' }).trim();
                                  if (textMarkdown) {
                                      // Add remaining text with list prefix and indentation
                                      // Use the correct index for ordered lists
                                      const currentPrefix = contentTagName === 'ol' ? `${index + 1}. ` : listStylePrefix;
                                      QAClipper.Utils.addTextItem(contentItems, currentPrefix + textMarkdown.replace(/\n/g, '\n' + indentSpaces));
                                  }
                              }
                          });
                      } 
                      // Handle pre (could be code or plain text/table) - This handles PRE elements *outside* lists
                      else if (contentTagName === 'pre') {
                          let handled = false; // Flag to ensure only one path handles the <pre>

                          // Try dedicated handler first for known code structures
                          const isComplexNestedStructure = contentElement.querySelector('div > div > pre.code-block__code > code') ||
                                                         contentElement.querySelector('div > pre > code');
                          const hasSimpleCode = contentElement.querySelector('code');

                          if (isComplexNestedStructure || hasSimpleCode) {
                              const potentialItem = QAClipper.Utils.claudeCodeBlockHandler(contentElement, {
                                  skipElementCheck: shouldSkipElement
                              });
                              if (potentialItem) { // Check if handler actually returned a valid item
                                  item = potentialItem; // Assign to item for later push
                                  handled = true;
                              }
                          }

                          // If not handled by the dedicated handler (or handler returned null), treat as plain text/table
                          if (!handled) {
                              const markdownText = QAClipper.Utils.htmlToMarkdown(contentElement, {
                                skipElementCheck: shouldSkipElement, // Turndown should process this <pre> now
                                platformName: 'claude'
                              }).trim();
                              if (markdownText) {
                                // Directly add as text item, don't use 'item' variable
                                QAClipper.Utils.addTextItem(contentItems, markdownText);
                                handled = true; // Mark as handled
                              }
                          }
                          // Optional: Log if <pre> was completely empty or unhandled
                          // if (!handled) { console.warn(`[Claude Extractor v5] Unhandled or empty <pre>:`, contentElement); }

                      }
                      // Handle artifact buttons/cells
                      else if (contentElement.closest(selectors.artifactButton)) { // Check for artifacts *after* other specific types
                          item = processArtifactButton(contentElement.closest(selectors.artifactButton)); // Pass the correct artifact element
                          // Note: No need to push item here, handled by the final check below
                      }
                      // Handle blockquote elements
                      else if (contentTagName === 'blockquote') {
                          // Process blockquote content with special handling
                          const markdownText = QAClipper.Utils.htmlToMarkdown(contentElement, { 
                            skipElementCheck: shouldSkipElement,
                            platformName: 'claude'
                          }).trim();
                          
                          // Further ensure each line starts with '>'
                          if (markdownText) {
                              const lines = markdownText.split('\n');
                              const prefixedLines = lines.map(line => 
                                line.startsWith('> ') ? line : '> ' + line
                              );
                              const finalText = prefixedLines.join('\n');
                              QAClipper.Utils.addTextItem(contentItems, finalText);
                          }
                      }
                      // Handle other elements (should not occur)
                      else {
                          console.warn(`[Claude Extractor v5] Unhandled grid element: <${contentTagName}>`, contentElement);
                          // Optionally try a generic markdown conversion as a fallback
                          // const fallbackMarkdown = QAClipper.Utils.htmlToMarkdown(contentElement, { skipElementCheck: shouldSkipElement, platformName: 'claude' }).trim();
                          // if (fallbackMarkdown) QAClipper.Utils.addTextItem(contentItems, fallbackMarkdown);
                      }
                      
                      // Push 'item' ONLY if it was assigned (by code block or artifact handler in this iteration)
                      if (item) {
                           contentItems.push(item);
                      }
                  });
              }
          }
          // Case 2: Child is the container for an artifact button
          else if (child.matches(selectors.artifactContainerDiv)) { // Handle div.py-2
             // Find the interactive cell *inside* this container
             const artifactCell = child.querySelector(selectors.artifactButton); // artifactButton selects div.artifact-block-cell
             if (artifactCell) {
                 // console.log("  -> Handling as Artifact Container Div");
                 item = processArtifactButton(artifactCell); // Pass the cell div
                 if (item) contentItems.push(item);
             } else {
                  console.warn("  -> Found artifact container div, but no artifact cell inside. Skipping.");
             }
          }
          // Case 3: Child is a direct code block (not inside a tabindex div)
          else if (tagNameLower === 'pre') {
              // Direct call to claudeCodeBlockHandler - we've improved the handler to detect all cases
              item = QAClipper.Utils.claudeCodeBlockHandler(child, {
                  skipElementCheck: shouldSkipElement
              });
              
              if (item) contentItems.push(item);
          }
          // Case 4: Child is a direct heading (not inside a tabindex div)
          else if (tagNameLower.match(/^h[1-6]$/)) {
              // Process heading using the utility function
              const markdownText = QAClipper.Utils.claudeHeadingHandler(child, {
                  skipElementCheck: shouldSkipElement
              });
              
              if (markdownText) {
                  QAClipper.Utils.addTextItem(contentItems, markdownText);
              }
          }
          // Case 5: Child is a direct paragraph or list
          else if (tagNameLower === 'p' || tagNameLower === 'ul' || tagNameLower === 'ol') {
              const markdownText = QAClipper.Utils.htmlToMarkdown(child, { 
                skipElementCheck: shouldSkipElement,
                platformName: 'claude'
              }).trim();
              if (markdownText) QAClipper.Utils.addTextItem(contentItems, markdownText);
          }
          // Case 6: Unhandled element (should not occur)
          else {
              // console.warn(`[Claude Extractor v5] Unhandled element: <${tagNameLower}>`);
          }
      });

      return contentItems;
    }
  };

  // --- Export Configuration ---
  window.claudeConfig = claudeConfig;
})();