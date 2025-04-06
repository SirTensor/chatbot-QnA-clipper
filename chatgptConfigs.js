// chatgptConfigs.js (v17 - Nested Bullet Point Fix)

(function() {
    // Initialization check
    // v17: Increment version number
    if (window.chatgptConfig && window.chatgptConfig.version === 17) { return; }

    // --- Helper Functions ---

    function shouldSkipElement(element) { // Unchanged
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
      const selectors = window.chatgptConfig?.selectors;
      if (!selectors) return false;
      const tagNameLower = element.tagName.toLowerCase();
      return (element.matches(selectors.codeBlockContainer)) ||
             (element.matches(selectors.imageContainerAssistant)) ||
             (element.matches(selectors.interactiveBlockContainer)) ||
             (element.closest(selectors.interactiveBlockContainer)) ||
             (element.closest(selectors.userMessageContainer) && element.matches('span.hint-pill'));
    }

    /**
     * Process a list element (ul/ol) and its children, including nested lists
     * @param {HTMLElement} el - The list element to process
     * @param {string} listType - Either 'ul' or 'ol'
     * @param {number} level - Indentation level for nested lists (0 for top level)
     * @returns {object|null} - The processed list content or null if empty
     */
    function processList(el, listType, level = 0) {
        let lines = []; 
        let itemIndex = 0;
        const listItems = el.querySelectorAll(':scope > li');
        
        listItems.forEach(li => {
            // Use a custom approach to get only the direct text content, excluding nested lists
            // First, clone the li element to avoid modifying the original
            const liClone = li.cloneNode(true);
            
            // Remove any nested lists from the clone
            const nestedLists = Array.from(liClone.querySelectorAll('ul, ol'));
            nestedLists.forEach(nestedList => {
                if (nestedList.parentNode) {
                    nestedList.parentNode.removeChild(nestedList);
                }
            });
            
            // Now get the text content without nested lists
            const itemText = QAClipper.Utils.htmlToMarkdown(liClone, { 
                skipElementCheck: shouldSkipElement 
            }).trim();
            
            if (itemText) {
                // Generate proper marker based on list type
                const marker = listType === 'ul' ? '-' : `${itemIndex + 1}.`;
                // Add indentation based on nesting level
                const indent = '  '.repeat(level);
                
                // Add main list item text
                lines.push(`${indent}${marker} ${itemText.replace(/\n+/g, ' ')}`);
                
                // Process any nested lists within this list item
                const nestedLists = li.querySelectorAll(':scope > ul, :scope > ol');
                nestedLists.forEach(nestedList => {
                    const nestedType = nestedList.tagName.toLowerCase();
                    const nestedContent = processList(nestedList, nestedType, level + 1);
                    
                    if (nestedContent && nestedContent.content) {
                        // For nested lists, directly append each line to maintain hierarchy
                        lines = lines.concat(nestedContent.content.split('\n'));
                    }
                });
                
                if (listType === 'ol') itemIndex++;
            }
        });
        
        return lines.length > 0 ? { type: 'text', content: lines.join('\n') } : null;
    }

    function processCodeBlock(el) { // Unchanged
        const selectors = window.chatgptConfig.selectors;
        const wrapperDiv = el.querySelector(':scope > div.contain-inline-size');
        const langIndicatorContainer = wrapperDiv ? wrapperDiv.querySelector(':scope > div:first-child') : el.querySelector(':scope > div:first-child[class*="flex items-center"]');
        let language = null; if (langIndicatorContainer) { language = langIndicatorContainer.textContent?.trim(); }
        if (!language || ['text', ''].includes(language.toLowerCase())) language = null;
        const codeElement = el.querySelector(selectors.codeBlockContent);
        const code = codeElement ? codeElement.textContent.trimEnd() : '';
        if (!code.trim() && !language) return null;
        return { type: 'code_block', language: language, content: code };
    }

     function processAssistantImage(el) { // Unchanged
         const selectors = window.chatgptConfig.selectors;
         const targetImgElement = el.querySelector(selectors.imageElementAssistant);
         if (!targetImgElement) {
             console.error("[Extractor v17] Image element not found using selector:", selectors.imageElementAssistant, "in container:", el);
             const anyImg = el.querySelector('img[src*="oaiusercontent"]');
             if (!anyImg) return null;
             console.warn("[Extractor v17] Using broader fallback image search.");
             targetImgElement = anyImg;
         }
         const src = targetImgElement.getAttribute('src');
         if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
             console.error("[Extractor v17] Selected image has invalid src:", src);
             return null;
         }
         let altText = targetImgElement.getAttribute('alt')?.trim();
         const extractedContent = (altText && altText !== "생성된 이미지") ? altText : "Generated Image";
         try {
             const absoluteSrc = new URL(src, window.location.origin).href;
             return { type: 'image', src: absoluteSrc, alt: altText || "Generated Image", extractedContent: extractedContent };
         }
         catch (e) {
             console.error("[Extractor v17] Error parsing assistant image URL:", e, src);
             return null;
         }
     }

     function processInteractiveBlock(el) { // Unchanged
        console.log("[Extractor v17] Processing Interactive Block:", el);
        const selectors = window.chatgptConfig.selectors;
        let title = null; let code = null; let language = null;
        const titleElement = el.querySelector(selectors.interactiveBlockTitle);
        if (titleElement) { title = titleElement.textContent?.trim(); }
        const codeLines = el.querySelectorAll(selectors.interactiveBlockCodeMirrorContent);
        if (codeLines.length > 0) {
            let codeContent = '';
            codeLines.forEach(line => { codeContent += line.textContent + '\n'; });
            code = codeContent.trimEnd();
        } else {
             console.log("[Extractor v17] CodeMirror content not found in interactive block:", el);
              const preCode = el.querySelector('pre > code');
              if(preCode) {
                  console.log("[Extractor v17] Found fallback pre>code inside interactive block.");
                  code = preCode.textContent.trimEnd();
              }
        }
        if (title) { /* ... language guessing ... */
            const lowerTitle = title.toLowerCase();
            if (lowerTitle.includes('cpp') || lowerTitle.includes('c++')) language = 'cpp';
            else if (lowerTitle.includes('python') || lowerTitle.endsWith('.py')) language = 'python';
            else if (lowerTitle.includes('javascript') || lowerTitle.endsWith('.js')) language = 'javascript';
            else if (lowerTitle.includes('html')) language = 'html';
            else if (lowerTitle.includes('css')) language = 'css';
        }
        if (title || code) {
            return { type: 'interactive_block', title: title || '[Interactive Block]', code: code, language: language };
        } else {
            console.error("[Extractor v17] Failed to extract title or code from interactive block:", el);
            return null;
        }
     }

    function processTableToMarkdown(tableElement) { // Unchanged
        if (!tableElement || tableElement.tagName.toLowerCase() !== 'table') {
            return null;
        }

        const markdownRows = [];
        let columnCount = 0;

        // Process Header (thead)
        const thead = tableElement.querySelector(':scope > thead');
        if (thead) {
            const headerRow = thead.querySelector(':scope > tr');
            if (headerRow) {
                const headerCells = Array.from(headerRow.querySelectorAll(':scope > th'));
                columnCount = headerCells.length;
                if (columnCount > 0) {
                    const headerContent = headerCells.map(th => QAClipper.Utils.htmlToMarkdown(th, { skipElementCheck: shouldSkipElement, ignoreTags: ['table', 'tr', 'th', 'td'] }).trim().replace(/\|/g, '\\|')); // Escape pipes in headers
                    markdownRows.push(`| ${headerContent.join(' | ')} |`);
                    // Add separator line
                    markdownRows.push(`|${'---|'.repeat(columnCount)}`);
                }
            }
        }

        if (columnCount === 0) { // Abort if no header found
            console.warn("[Extractor v17] Table has no header (thead > tr > th). Cannot generate Markdown.", tableElement);
            return null;
        }

        // Process Body (tbody)
        const tbody = tableElement.querySelector(':scope > tbody');
        if (tbody) {
            const bodyRows = tbody.querySelectorAll(':scope > tr');
            bodyRows.forEach(row => {
                const cells = Array.from(row.querySelectorAll(':scope > td'));
                // Ensure row has the same number of cells as the header
                if (cells.length === columnCount) {
                    const cellContent = cells.map(td => QAClipper.Utils.htmlToMarkdown(td, { skipElementCheck: shouldSkipElement, ignoreTags: ['table', 'tr', 'th', 'td'] }).trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')); // Escape pipes and replace newlines in cells
                    markdownRows.push(`| ${cellContent.join(' | ')} |`);
                } else {
                    console.warn("[Extractor v17] Table row skipped due to column count mismatch.", row);
                }
            });
        }

        return markdownRows.length > 2 ? markdownRows.join('\n') : null; // Need header + separator + at least one data row
    }


    // --- Main Configuration Object ---
    const chatgptConfig = {
      platformName: 'ChatGPT',
      version: 17, // v17: Updated version identifier
      selectors: { // Unchanged selectors
        turnContainer: 'article[data-testid^="conversation-turn-"]',
        userMessageContainer: 'div[data-message-author-role="user"]',
        userText: 'div[data-message-author-role="user"] .whitespace-pre-wrap',
        userImageContainer: 'div[data-message-author-role="user"] div.overflow-hidden.rounded-lg img[src]',
        userFileContainer: 'div[data-message-author-role="user"] div[class*="group text-token-text-primary"]',
        userFileName: 'div.truncate.font-semibold',
        userFileType: 'div.text-token-text-secondary.truncate',
        relevantBlocksInTextContainer: `
          div.markdown.prose > p,
          div.markdown.prose > ul,
          div.markdown.prose > ol,
          div.markdown.prose > pre,
          div.markdown.prose > h1,
          div.markdown.prose > h2,
          div.markdown.prose > h3,
          div.markdown.prose > h4,
          div.markdown.prose > h5,
          div.markdown.prose > h6,
          div.markdown.prose > hr,
          div.markdown.prose > table,
          div.markdown.prose > div.overflow-x-auto > table, /* Handle tables inside overflow container */
          :scope > pre /* Pre directly under assistant container (less common) */
        `,
        assistantTextContainer: 'div[data-message-author-role="assistant"] .markdown.prose',
        listItem: 'li',
        codeBlockContainer: 'pre',
        codeBlockContent: 'code',
        codeBlockLangIndicatorContainer: ':scope > div.contain-inline-size > div:first-child, :scope > div:first-child[class*="flex items-center"]',
        imageContainerAssistant: 'div.group\\/imagegen-image',
        imageElementAssistant: 'img[alt="생성된 이미지"][src*="oaiusercontent"]',
        imageCaption: null,
        interactiveBlockContainer: 'div[id^="textdoc-message-"]',
        interactiveBlockTitle: 'span.min-w-0.truncate',
        interactiveBlockCodeMirrorContent: 'div.cm-content .cm-line',
      },

      // --- Extraction Functions ---
      getRole: (turnElement) => { /* Unchanged */
          const messageElement = turnElement.querySelector(':scope div[data-message-author-role]'); return messageElement ? messageElement.getAttribute('data-message-author-role') : null; },
      extractUserText: (turnElement) => { /* Unchanged */
          const textElement = turnElement.querySelector(chatgptConfig.selectors.userText); return textElement ? QAClipper.Utils.htmlToMarkdown(textElement, { skipElementCheck: shouldSkipElement }).trim() || null : null; },
      extractUserUploadedImages: (turnElement) => { /* Unchanged */
          const images = []; const imageElements = turnElement.querySelectorAll(chatgptConfig.selectors.userImageContainer); imageElements.forEach(imgElement => { const src = imgElement.getAttribute('src'); if (src && !src.startsWith('data:') && !src.startsWith('blob:')) { let altText = imgElement.getAttribute('alt')?.trim(); const extractedContent = altText && altText !== "업로드한 이미지" ? altText : "User Uploaded Image"; try { const absoluteSrc = new URL(src, window.location.origin).href; images.push({ type: 'image', sourceUrl: absoluteSrc, isPreviewOnly: false, extractedContent: extractedContent }); } catch (e) { console.error("[Extractor v17] Error parsing user image URL:", e, src); } } }); return images; },
      extractUserUploadedFiles: (turnElement) => { /* Unchanged */
          const files = []; const fileContainers = turnElement.querySelectorAll(chatgptConfig.selectors.userFileContainer); fileContainers.forEach(container => { const nameElement = container.querySelector(chatgptConfig.selectors.userFileName); const typeElement = container.querySelector(chatgptConfig.selectors.userFileType); const fileName = nameElement ? nameElement.textContent?.trim() : null; let fileType = typeElement ? typeElement.textContent?.trim() : 'File'; if (fileType && fileType.includes(' ') && !['kB', 'MB', 'GB'].some(unit => fileType.endsWith(unit))) { fileType = fileType.split(' ')[0]; } else if (fileType && ['kB', 'MB', 'GB'].some(unit => fileType.endsWith(unit))) { fileType = 'File'; } if (fileName) { const previewContent = null; files.push({ type: 'file', fileName: fileName, fileType: fileType, isPreviewOnly: !previewContent, extractedContent: previewContent }); } }); return files; },

      /**
       * v17: Updated extraction function to properly handle nested lists
       */
      extractAssistantContent: (turnElement) => {
          const contentItems = [];
          const selectors = chatgptConfig.selectors;

          // 1. Process Images (Outside main text flow)
          const imageContainers = turnElement.querySelectorAll(`:scope > div ${selectors.imageContainerAssistant}`);
          imageContainers.forEach(imageContainer => {
              const imageItem = processAssistantImage(imageContainer);
              if (imageItem) contentItems.push(imageItem);
          });

          // 2. Process Interactive Blocks (Outside main text flow)
          const interactiveBlocks = turnElement.querySelectorAll(`:scope > div ${selectors.interactiveBlockContainer}`);
           interactiveBlocks.forEach(interactiveBlock => {
               const interactiveItem = processInteractiveBlock(interactiveBlock);
               if (interactiveItem) contentItems.push(interactiveItem);
           });

          // 3. Process Main Text/Markdown Container
          const textContainer = turnElement.querySelector(selectors.assistantTextContainer);
          if (textContainer) {
              const relevantElements = textContainer.querySelectorAll(selectors.relevantBlocksInTextContainer);
              processRelevantElements(relevantElements, contentItems);
          } else if (contentItems.length === 0) {
               console.warn("[v17] Assistant text container (.prose) not found and no other blocks either in turn:", turnElement);
          }

          return contentItems;
      },

    }; // End chatgptConfig


    /**
     * v17: Updated helper function to process relevant elements found within the text container
     * with improved handling for nested lists
     */
     function processRelevantElements(elements, contentItems) {
         const processedElements = new Set();
         let consecutiveMdBlockElements = [];

         function flushMdBlock() {
             if (consecutiveMdBlockElements.length > 0) {
                 const tempDiv = document.createElement('div');
                 consecutiveMdBlockElements.forEach(el => tempDiv.appendChild(el.cloneNode(true)));
                 const combinedMarkdown = QAClipper.Utils.htmlToMarkdown(tempDiv, { skipElementCheck: shouldSkipElement }).trim();
                 if (combinedMarkdown) {
                     QAClipper.Utils.addTextItem(contentItems, combinedMarkdown);
                 }
                 consecutiveMdBlockElements = [];
             }
         }

         elements.forEach((element) => {
             if (processedElements.has(element)) return;

             const tagNameLower = element.tagName.toLowerCase();
             const isTableContainer = tagNameLower === 'table' || (tagNameLower === 'div' && element.classList.contains('overflow-x-auto') && element.querySelector(':scope > table'));
             const tableElement = isTableContainer ? (tagNameLower === 'table' ? element : element.querySelector(':scope > table')) : null;

             const isStandardMdBlock = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr'].includes(tagNameLower);
             let handledSeparately = false;

             // --- Handle Special Blocks (Code, Lists, Tables) ---
             if (tagNameLower === 'pre') {
                 flushMdBlock();
                 const item = processCodeBlock(element);
                 if (item) contentItems.push(item);
                 processedElements.add(element);
                 element.querySelectorAll('*').forEach(child => processedElements.add(child));
                 handledSeparately = true;
             }
             else if (tagNameLower === 'ul' || tagNameLower === 'ol') {
                 flushMdBlock();
                 // Call the updated processList function with level=0 for top-level lists
                 const listItem = processList(element, tagNameLower, 0);
                 if (listItem) contentItems.push(listItem);
                 processedElements.add(element);
                 element.querySelectorAll('*').forEach(child => processedElements.add(child));
                 handledSeparately = true;
             }
             else if (tableElement) {
                 flushMdBlock();
                 const tableMarkdown = processTableToMarkdown(tableElement);
                 if (tableMarkdown) {
                     QAClipper.Utils.addTextItem(contentItems, tableMarkdown);
                 } else {
                     console.warn("[Extractor v17] Failed to manually process table to Markdown:", tableElement);
                 }
                 processedElements.add(element);
                 processedElements.add(tableElement);
                 tableElement.querySelectorAll('*').forEach(child => processedElements.add(child));
                 handledSeparately = true;
             }

             // --- Accumulate Standard Blocks ---
             if (!handledSeparately) {
                 if (isStandardMdBlock) {
                     consecutiveMdBlockElements.push(element);
                     processedElements.add(element);
                 } else {
                     flushMdBlock();
                     if (!isTableContainer) {
                        console.warn(`  -> Fallback [Text Container]: Unhandled element: <${tagNameLower}>`, element);
                        const fallbackText = QAClipper.Utils.htmlToMarkdown(element, { skipElementCheck: shouldSkipElement }).trim();
                        if (fallbackText) {
                            QAClipper.Utils.addTextItem(contentItems, fallbackText);
                        }
                        processedElements.add(element);
                     }
                 }
             }
         });
         flushMdBlock(); // Final flush
     } // End processRelevantElements


    // Assign the config object to the window
    window.chatgptConfig = chatgptConfig;
    console.log("chatgptConfig initialized (v17 - Nested List Fix)");

})();