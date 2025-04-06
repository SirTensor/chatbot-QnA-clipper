// geminiConfigs.js (v30 - Fixed nested list formatting)

(function() {
    // Initialization check
    // v30: Increment version number
    if (window.geminiConfig && window.geminiConfig.version >= 30) { return; }
  
    // --- Helper Functions ---
  
    /**
     * Determines if an element should be skipped during markdown conversion at the top level.
     * @param {HTMLElement} element - The element to check
     * @returns {boolean} - True if the element should be skipped by the generic markdown converter.
     */
    function shouldSkipElement(element) {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
      const selectors = window.geminiConfig?.selectors;
      if (!selectors) return false;
      const tagNameLower = element.tagName.toLowerCase();
  
      // Skip elements handled by dedicated processors
      return (selectors.interactiveBlockContainer && element.matches(selectors.interactiveBlockContainer)) ||
             (selectors.imageContainerAssistant && element.matches(selectors.imageContainerAssistant)) ||
             tagNameLower === 'code-block' ||
             tagNameLower === 'ul' || tagNameLower === 'ol' || tagNameLower === 'pre' ||
             tagNameLower === 'table'; // Skip table at top level
    }
  
    /**
     * Processes list elements (ul, ol) into markdown text.
     * v30: Improved nested list support by preserving line breaks in nested elements
     * and proper code formatting for HTML tags
     * @param {HTMLElement} el - The list element (ul or ol).
     * @param {string} listType - 'ul' or 'ol'.
     * @param {number} nestLevel - The nesting level of the list (0 for top level).
     * @returns {object|null} - A text content item or null.
     */
    function processList(el, listType, nestLevel = 0) {
        let lines = [];
        let startNum = 1;
        if (listType === 'ol') {
            startNum = parseInt(el.getAttribute('start') || '1', 10);
            if (isNaN(startNum)) startNum = 1;
        }
        let itemIndex = 0;
        el.querySelectorAll(':scope > li').forEach(li => {
            // First, get the direct text content of this list item (before any nested lists)
            let directContent = '';
            for (let node of li.childNodes) {
                // Skip nested lists
                if (node.nodeType === Node.ELEMENT_NODE && 
                    (node.tagName.toLowerCase() === 'ul' || node.tagName.toLowerCase() === 'ol')) {
                    continue;
                }
                
                // For text or non-list elements, add to direct content
                if (node.nodeType === Node.TEXT_NODE) {
                    directContent += node.textContent;
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    // Get element content with proper code formatting
                    let elementContent = QAClipper.Utils.htmlToMarkdown(node, {
                        ignoreTags: ['ul', 'ol']
                    });
                    
                    // Enhanced HTML tag handling: wrap HTML tags in backticks
                    elementContent = elementContent.replace(/<(\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?)>/g, '`<$1>`');
                    
                    directContent += elementContent;
                }
            }
            
            // Trim and format the direct content
            directContent = directContent.trim();
            
            if (directContent) {
                const marker = listType === 'ul' ? '-' : `${startNum + itemIndex}.`;
                const indent = '  '.repeat(nestLevel);
                lines.push(`${indent}${marker} ${directContent}`);
                if (listType === 'ol') itemIndex++;
                
                // Process any nested lists
                const nestedLists = li.querySelectorAll(':scope > ul, :scope > ol');
                nestedLists.forEach(nestedList => {
                    const nestedType = nestedList.tagName.toLowerCase();
                    const nestedResult = processList(nestedList, nestedType, nestLevel + 1);
                    if (nestedResult && nestedResult.content) {
                        lines.push(nestedResult.content);
                    }
                });
            }
        });
        return lines.length > 0 ? { type: 'text', content: lines.join('\n') } : null;
    }
  
    /**
     * Processes code block elements into a structured object.
     * @param {HTMLElement} el - The code-block element.
     * @returns {object|null} - A code_block content item or null.
     */
    function processCodeBlock(el) {
        const contentSelector = geminiConfig.selectors.codeBlockContent || 'pre>code';
        const langSelector = geminiConfig.selectors.codeBlockLangIndicator || 'div.code-block-decoration>span';
        const codeElement = el.querySelector(contentSelector);
        const code = codeElement ? (codeElement.innerText || codeElement.textContent || '') : '';
        const langElement = el.querySelector(langSelector);
        const language = langElement ? langElement.textContent?.trim() : null;
        return code.trim() ? { type: 'code_block', language: language, content: code.trim() } : null;
    }
  
    /**
     * Processes image elements into a structured object.
     * @param {HTMLElement} el - The image container or image element.
     * @returns {object|null} - An image content item or null.
     */
    function processImage(el) {
        const captionSelector = geminiConfig.selectors.imageCaption || 'div.caption';
        const imgSelector = geminiConfig.selectors.imageElementAssistant || 'img.image.loaded';
        let imgElement = null, captionElement = null;
        const containerSelector = geminiConfig.selectors.imageContainerAssistant || 'single-image';
  
        if (el.matches(containerSelector)) {
            imgElement = el.querySelector(imgSelector);
            captionElement = el.querySelector(captionSelector);
        } else if (el.matches(imgSelector)) {
            imgElement = el;
            const container = el.closest(containerSelector);
            if (container) captionElement = container.querySelector(captionSelector);
        }
  
        if (!imgElement) return null;
        const src = imgElement.getAttribute('src');
        if (!src || src.startsWith('blob:') || src.startsWith('data:')) return null;
  
        let altText = captionElement ? captionElement.textContent?.trim() : null;
        if (!altText) altText = imgElement.getAttribute('alt')?.trim();
        if (!altText) altText = "Image";
  
        const absoluteSrc = new URL(src, window.location.origin).href;
        return { type: 'image', src: absoluteSrc, alt: altText, extractedContent: altText };
    }
  
    /**
     * v30: Manually processes an HTML table element into a Markdown table string.
     * Added logic to skip tbody header row during data processing.
     * @param {HTMLTableElement} tableElement - The table element to process.
     * @returns {string|null} - The Markdown table string or null if invalid.
     */
    function processTableToMarkdown(tableElement) {
        if (!tableElement || tableElement.tagName.toLowerCase() !== 'table') {
            return null;
        }
        console.log("  -> [Table Processor v30] Processing table:", tableElement);
  
        const markdownRows = [];
        let columnCount = 0;
        let headerRowCount = 0; // To count rows added for header/separator
        let tbodyHeaderRow = null; // v30: To store the row if header is found in tbody
  
        // Process Header (thead)
        const thead = tableElement.querySelector(':scope > thead');
        if (thead) {
            const headerRow = thead.querySelector('tr');
            if (headerRow) {
                const headerCells = Array.from(headerRow.querySelectorAll(':scope > th'));
                columnCount = headerCells.length;
                if (columnCount > 0) {
                    const headerContent = headerCells.map(th =>
                        QAClipper.Utils.htmlToMarkdown(th, { ignoreTags: ['table'] })
                        .trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')
                    );
                    markdownRows.push(`| ${headerContent.join(' | ')} |`);
                    markdownRows.push(`|${'---|'.repeat(columnCount)}`);
                    headerRowCount = 2; // Header + Separator
                    console.log(`  -> [Table Processor v30] Header found in thead with ${columnCount} columns.`);
                } else { console.log("  -> [Table Processor v30] thead row found but no 'th' cells."); }
            } else { console.log("  -> [Table Processor v30] 'thead' found but no 'tr' inside."); }
        } else { console.log("  -> [Table Processor v30] No 'thead' found in table."); }
  
        // If no header found in thead, try tbody
        const tbody = tableElement.querySelector(':scope > tbody');
        if (columnCount === 0 && tbody) {
            console.log("  -> [Table Processor v30] Attempting to find header row in 'tbody'.");
            const firstRow = tbody.querySelector(':scope > tr');
            if (firstRow) {
                // v30: Store the potential header row from tbody
                tbodyHeaderRow = firstRow;
                const potentialHeaderCells = Array.from(firstRow.querySelectorAll(':scope > th'));
                if (potentialHeaderCells.length > 0) {
                     columnCount = potentialHeaderCells.length;
                     const headerContent = potentialHeaderCells.map(th =>
                         QAClipper.Utils.htmlToMarkdown(th, { ignoreTags: ['table'] })
                         .trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')
                     );
                     markdownRows.push(`| ${headerContent.join(' | ')} |`);
                     markdownRows.push(`|${'---|'.repeat(columnCount)}`);
                     headerRowCount = 2;
                     console.log(`  -> [Table Processor v30] Found 'th' header row in 'tbody' with ${columnCount} columns.`);
                } else {
                    const firstRowTds = Array.from(firstRow.querySelectorAll(':scope > td'));
                    if (firstRowTds.length > 0) {
                        columnCount = firstRowTds.length;
                        const headerContent = firstRowTds.map(td =>
                           QAClipper.Utils.htmlToMarkdown(td, { ignoreTags: ['table'] })
                           .trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')
                        );
                        markdownRows.push(`| ${headerContent.join(' | ')} |`);
                        markdownRows.push(`|${'---|'.repeat(columnCount)}`);
                        headerRowCount = 2;
                        console.warn(`  -> [Table Processor v30] Using first 'tbody' row with TDs as header (${columnCount} columns).`);
                    }
                }
            }
        }
  
        // Abort if no header could be determined
        if (columnCount === 0) {
            console.warn("[Extractor v30 - Table] Table has no discernible header. Cannot generate Markdown.", tableElement);
            return null;
        }
  
        // Process Body (tbody)
        if (tbody) {
            const bodyRows = tbody.querySelectorAll(':scope > tr');
            console.log(`  -> [Table Processor v30] Processing ${bodyRows.length} rows in 'tbody'.`);
            bodyRows.forEach((row, rowIndex) => {
                // *** v30: ADDED CHECK ***: Skip the row if it was identified as the tbody header row
                if (row === tbodyHeaderRow) {
                    console.log(`  -> [Table Processor v30] Skipping row ${rowIndex+1} as it was used as tbody header.`);
                    return; // Skip this iteration
                }
  
                // Now, look for data cells (td) in the remaining rows
                const cells = Array.from(row.querySelectorAll(':scope > td'));
                if (cells.length === columnCount) {
                    const cellContent = cells.map(td =>
                        QAClipper.Utils.htmlToMarkdown(td, { ignoreTags: ['table'] })
                        .trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')
                    );
                    markdownRows.push(`| ${cellContent.join(' | ')} |`);
                } else {
                    // This warning should now only appear for actual data rows with mismatched columns
                    console.warn(`  -> [Table Processor v30] Data row ${rowIndex+1} skipped. Expected ${columnCount} 'td' cells, found ${cells.length}.`, row);
                }
            });
        } else {
            console.log("  -> [Table Processor v30] No 'tbody' found in table.");
        }
  
        // Need header + separator (already counted in headerRowCount) + optional data rows
        if (headerRowCount > 0) { // Check if header was successfully added
             console.log("  -> [Table Processor v30] Successfully generated Markdown table.");
             // Ensure there's at least header + separator before joining
             return markdownRows.length >= 2 ? markdownRows.join('\n') : null;
        } else {
             // This path shouldn't be reached if columnCount > 0 check passed, but added for safety
             console.warn("  -> [Table Processor v30] Failed to generate valid Markdown (header processing failed).");
             return null;
        }
    }
  
  
    // --- Main Configuration Object ---
    const geminiConfig = {
      platformName: 'Gemini',
      version: 30, // v30: Config version identifier
      selectors: {
        turnContainer: 'user-query, model-response',
        userMessageContainer: 'user-query', userText: '.query-text',
        userImageContainer: 'user-query-file-preview', userImageLink: 'a[href^="https://lens.google.com/uploadbyurl?url="]',
        userFileContainer: '.file-preview-container', userFileItem: '.file-upload-link', userFileName: '.new-file-name', userFileType: '.new-file-type',
        assistantContentArea: 'div.markdown.markdown-main-panel',
        relevantBlocks: 'p, ul, ol, code-block, single-image, div.attachment-container.immersive-entry-chip, table',
        listItem: 'li',
        codeBlockContent: 'pre > code', codeBlockLangIndicator: 'div.code-block-decoration > span',
        imageContainerAssistant: 'single-image', imageElementAssistant: 'img.image.loaded', imageCaption: 'div.caption', imageElement: 'img',
        sideContainer: 'code-immersive-panel', sideContainerContent: '.view-line', sideContainerLangIndicator: 'data-mode-id',
        interactiveBlockContainer: 'div.attachment-container.immersive-entry-chip',
        interactiveBlockTitle: 'div[data-test-id="artifact-text"]',
        interactiveBlockContent: null,
      },
  
      // --- Extraction Functions ---
      getRole: (turnElement) => {if(!turnElement||typeof turnElement.tagName!=='string')return null;const t=turnElement.tagName.toLowerCase();if(t==='user-query')return 'user';if(t==='model-response')return 'assistant';return null; },
      extractUserText: (turnElement) => {
          const e = turnElement.querySelector(':scope .query-text');
          return e ? QAClipper.Utils.htmlToMarkdown(e, { skipElementCheck: shouldSkipElement }).trim() || null : null;
      },
      extractUserUploadedImages: (turnElement) => {
          const images = [];
          const containerSelector = geminiConfig.selectors.userImageContainer;
          const linkSelector = geminiConfig.selectors.userImageLink;
          const imgSelector = 'img';
          turnElement.querySelectorAll(`:scope ${containerSelector}`).forEach(container => {
              const linkElement = container.querySelector(linkSelector);
              const imgElement = container.querySelector(imgSelector);
              if (linkElement && imgElement) {
                  const href = linkElement.getAttribute('href');
                  if (href) {
                      try {
                          const urlParams = new URLSearchParams(new URL(href).search);
                          const encodedUrl = urlParams.get('url');
                          if (encodedUrl) {
                              const decodedUrl = decodeURIComponent(encodedUrl);
                              let altText = imgElement.getAttribute('alt')?.trim();
                              const extractedContent = altText || "User Uploaded Image";
                              images.push({ type: 'image', sourceUrl: decodedUrl, isPreviewOnly: false, extractedContent: extractedContent });
                          }
                      } catch (e) { console.error("[Extractor v30] Error parsing user image URL:", e, href); }
                  }
              }
          });
          return images;
      },
      extractUserUploadedFiles: (turnElement) => { const f=[]; turnElement.querySelectorAll(':scope '+geminiConfig.selectors.userFileContainer).forEach(c=>{const nE=c.querySelector(geminiConfig.selectors.userFileName),tE=c.querySelector(geminiConfig.selectors.userFileType); if(nE){const n=nE.textContent?.trim(),t=tE?.textContent?.trim()||'U';let eC=null;const p=c.querySelector('.file-preview-content,.text-preview,pre');if(p)eC=p.textContent?.trim()||null; if(n)f.push({type:'file',fileName:n,fileType:t,isPreviewOnly:!eC,extractedContent:eC});}}); return f; },
      extractSideContainerCode: () => { return null; },
  
      /**
       * Extracts structured content using querySelectorAll.
       * v30: Uses updated processList function for better nested list support
       */
      extractAssistantContent: (turnElement) => {
          const contentItems = [];
          const contentArea = turnElement.querySelector(geminiConfig.selectors.assistantContentArea);
          if (!contentArea) { console.warn("[Extractor v30] Gemini markdown content area not found."); return []; }
  
          console.log("[Extractor v30] Starting assistant extraction (Fixed nested list formatting)");
  
          const relevantElements = contentArea.querySelectorAll(geminiConfig.selectors.relevantBlocks);
          console.log(`[Extractor v30] Found ${relevantElements.length} relevant block elements.`);
          const processedElements = new Set();
  
          relevantElements.forEach((element, index) => {
              if (processedElements.has(element)) return;
  
              const tagNameLower = element.tagName.toLowerCase();
              const isInteractiveBlock = element.matches(geminiConfig.selectors.interactiveBlockContainer);
              const isImageContainer = element.matches(geminiConfig.selectors.imageContainerAssistant);
              const isCodeBlock = tagNameLower === 'code-block';
              const isTable = tagNameLower === 'table';
  
              console.log(`[Extractor v30] Processing Element #${index}: <${tagNameLower}>`);
              let item = null;
  
              // --- Process based on type ---
              if (isInteractiveBlock) {
                  console.log("  -> Handling as Interactive Block");
                  const titleElement = element.querySelector(geminiConfig.selectors.interactiveBlockTitle);
                  const title = titleElement ? titleElement.textContent?.trim() : '[Interactive Block]';
                  contentItems.push({ type: 'interactive_block', title: title, code: null, language: null });
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isCodeBlock) {
                  console.log("  -> Handling as Code Block");
                  item = processCodeBlock(element);
                  if (item) contentItems.push(item);
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isTable) { // Use the updated table processor
                   console.log("  -> Handling as Table");
                   const tableMarkdown = processTableToMarkdown(element);
                   if (tableMarkdown) {
                       QAClipper.Utils.addTextItem(contentItems, tableMarkdown);
                   } else {
                       console.warn("  -> Table processing failed, attempting fallback text extraction.");
                       const fallbackText = QAClipper.Utils.htmlToMarkdown(element, {
                           skipElementCheck: (el) => el.tagName.toLowerCase() === 'table'
                       }).trim();
                       if (fallbackText) {
                          QAClipper.Utils.addTextItem(contentItems, `[Fallback Table Content]\n${fallbackText}`);
                       }
                   }
                   processedElements.add(element);
                   element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (tagNameLower === 'ul' || tagNameLower === 'ol') {
                  console.log(`  -> Handling as ${tagNameLower.toUpperCase()}`);
                  // v30: Use the updated processList function with proper nesting support
                  item = processList(element, tagNameLower, 0);
                  if (item) contentItems.push(item);
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
               else if (isImageContainer) {
                   console.log("  -> Handling as Direct Image Container");
                   item = processImage(element);
                   if (item) contentItems.push(item);
                   processedElements.add(element);
                   element.querySelectorAll('*').forEach(child => processedElements.add(child));
               }
              else if (tagNameLower === 'p') {
                   console.log("  -> Handling as P tag");
                   const blockMarkdown = QAClipper.Utils.htmlToMarkdown(element, {
                     skipElementCheck: shouldSkipElement
                   }).trim();
                   if (blockMarkdown) {
                       QAClipper.Utils.addTextItem(contentItems, blockMarkdown);
                   }
                   processedElements.add(element);
              }
              else { // Fallback
                   console.warn(`  -> Unhandled relevant block type: <${tagNameLower}>. Attempting text extraction.`, element);
                   const fallbackText = QAClipper.Utils.htmlToMarkdown(element, {
                     skipElementCheck: shouldSkipElement
                   }).trim();
                   if (fallbackText) {
                      QAClipper.Utils.addTextItem(contentItems, fallbackText);
                   }
                   processedElements.add(element);
                   element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
          }); // End loop
  
          console.log("[Extractor v30] Final contentItems generated:", JSON.stringify(contentItems, null, 2));
          return contentItems;
      }, // End extractAssistantContent
  
    }; // End geminiConfig
  
    window.geminiConfig = geminiConfig;
    console.log("geminiConfig initialized (v30 - Fixed nested list formatting)");
  })(); // End of IIFE