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
   * Skips elements handled by dedicated processors (lists, code blocks, artifact buttons).
   * @param {HTMLElement} element - The element to check.
   * @returns {boolean} - True if the element should be skipped.
   */
  function shouldSkipElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    const selectors = window.claudeConfig?.selectors;
    if (!selectors) return false; // Config not loaded yet
    const tagNameLower = element.tagName.toLowerCase();

    // Skip elements handled by dedicated functions
    return tagNameLower === 'ul' ||
           tagNameLower === 'ol' ||
           tagNameLower === 'pre' || // Handled by processCodeBlock
           tagNameLower === 'table' || // Skip tables (handled separately)
           element.closest(selectors.artifactButton); // Check if element is INSIDE an artifact button/cell
  }

  /**
   * Processes <li> elements within a <ul> or <ol> list.
   * @param {HTMLElement} el - The <ul> or <ol> element.
   * @param {string} listType - 'ul' or 'ol'.
   * @param {number} [level=0] - The nesting level (for indentation).
   * @returns {string} - The Markdown representation of the list. Returns an empty string if the list is empty.
   */
  function processList(el, listType, level = 0) {
    let lines = [];
    let startNum = 1;
    if (listType === 'ol') {
      startNum = parseInt(el.getAttribute('start') || '1', 10);
      if (isNaN(startNum)) startNum = 1;
    }
    let itemIndex = 0;
    const indent = '  '.repeat(level); // 2 spaces per level

    // Process only direct li children
    el.querySelectorAll(':scope > li').forEach(li => {
      // Clone the li to manipulate it without affecting the original DOM
      const liClone = li.cloneNode(true);

      // Find and remove direct child ul/ol elements from the clone
      const nestedListsInClone = Array.from(liClone.children).filter(child =>
        child.tagName.toLowerCase() === 'ul' || child.tagName.toLowerCase() === 'ol'
      );
      nestedListsInClone.forEach(list => liClone.removeChild(list));

      // Get the markdown for the li content *without* the nested lists
      // This should preserve inline formatting like <strong>, <code> etc.
      let itemMarkdown = QAClipper.Utils.htmlToMarkdown(liClone, {
        skipElementCheck: shouldSkipElement,
        // No need to ignore ul/ol here as they were removed from the clone
      }).trim();

      // Recursively process the *original* nested lists found directly within the li
      let nestedListContent = '';
      li.querySelectorAll(':scope > ul, :scope > ol').forEach(nestedList => {
         const nestedListType = nestedList.tagName.toLowerCase();
         const nestedResult = processList(nestedList, nestedListType, level + 1);
         if (nestedResult) {
             // Add a newline before appending nested list content
             nestedListContent += '\n' + nestedResult;
         }
      });

      // Combine the item markdown and nested list content
      if (itemMarkdown || nestedListContent.trim()) {
        const marker = listType === 'ul' ? '-' : `${startNum + itemIndex}.`;

        // Assemble the line: marker, item content, then nested content
        let line = `${indent}${marker} ${itemMarkdown}`;

        // Append nested list content if it exists
        if (nestedListContent.trim()) {
            // If itemMarkdown was empty, avoid extra space after marker
            if (!itemMarkdown) {
                line = `${indent}${marker}`;
            }
            line += nestedListContent; // nestedListContent already starts with \n
        }

        // Add the processed line to our list
        lines.push(line);

        if (listType === 'ol') itemIndex++;
      }
    });
    // Return the joined lines, or an empty string if no lines were generated
    return lines.length > 0 ? lines.join('\n') : '';
  }

  /**
   * Processes <pre> elements containing code blocks.
   * @param {HTMLElement} el - The <pre> element.
   * @returns {object|null} - A code_block content item or null.
   */
  function processCodeBlock(el) {
    const selectors = window.claudeConfig.selectors;
    
    // Special handling: case of table container (table pre)
    const tableElement = el.querySelector('table');
    if (tableElement) {
      return processTableToMarkdown(tableElement);
    }
    
    // General code block processing
    const codeElement = el.querySelector(selectors.codeBlockContent);
    // If no code element is found using the specific selector, try a more general approach
    const actualCodeElement = codeElement || el.querySelector('code');
    
    // Extract code text, default to empty string if element not found
    const code = actualCodeElement ? actualCodeElement.textContent : '';
    
    // Language detection - try multiple approaches
    let language = null;
    
    if (actualCodeElement) {
        // Method 1: Check for language- classes
        const langClass = Array.from(actualCodeElement.classList || []).find(cls => cls.startsWith('language-'));
        if (langClass) {
            language = langClass.replace('language-', '');
        }
        
        // Method 2: Special handling for pre > code without language class
        if (!language && actualCodeElement.parentElement === el && !langClass) {
            // This is a plain code block without language specification
            language = "text";  // Use "text" as fallback language identifier
        }
    }
    
    // Method 3: Check the language indicator div if class name fails
    if (!language) {
        const langIndicator = el.querySelector(selectors.codeBlockLangIndicator);
        if (langIndicator) {
            const indicatorText = langIndicator.textContent?.trim();
            language = indicatorText && indicatorText.toLowerCase() !== "" ? 
                       indicatorText.toLowerCase() : "text";
        }
    }
    
    // Final fallback - if we have code content but no language was detected
    if (!language && code.trim()) {
        language = "text";  // Default to "text" for unlabeled code blocks
    }

    // Return null if code is just whitespace
    return code.trim() ? { type: 'code_block', language: language, content: code.trimEnd() } : null;
  }

  /**
   * Converts table elements to Markdown table strings.
   * @param {HTMLTableElement} tableElement - The table element to process
   * @returns {object|null} - A text item containing the Markdown table or null
   */
  function processTableToMarkdown(tableElement) {
    if (!tableElement || tableElement.tagName.toLowerCase() !== 'table') {
      console.warn("[Claude Extractor v5] Invalid table element:", tableElement);
      return null;
    }

    // console.log("[Claude Extractor v5] Processing table to Markdown");
    const markdownRows = [];
    let columnCount = 0;

    // Header processing (thead)
    const thead = tableElement.querySelector(':scope > thead');
    if (thead) {
      const headerRow = thead.querySelector(':scope > tr');
      if (headerRow) {
        const headerCells = Array.from(headerRow.querySelectorAll(':scope > th'));
        columnCount = headerCells.length;
        if (columnCount > 0) {
          const headerContent = headerCells.map(th => {
            // Convert cell content to Markdown (escape pipe characters)
            return QAClipper.Utils.htmlToMarkdown(th, { 
              skipElementCheck: shouldSkipElement, 
              ignoreTags: ['table', 'tr', 'th', 'td'] 
            }).trim().replace(/\|/g, '\\|');
          });
          markdownRows.push(`| ${headerContent.join(' | ')} |`);
          // Add separator line
          markdownRows.push(`|${'---|'.repeat(columnCount)}`);
        }
      }
    }

    if (columnCount === 0) {
      console.warn("[Claude Extractor v5] Table has no header (thead > tr > th). Trying fallback to first row.");
      // If there is no header, attempt to use the first row as the header
      const firstRow = tableElement.querySelector(':scope > tbody > tr:first-child');
      if (firstRow) {
        const cells = Array.from(firstRow.querySelectorAll(':scope > td'));
        columnCount = cells.length;
        if (columnCount > 0) {
          const firstRowContent = cells.map(td => {
            return QAClipper.Utils.htmlToMarkdown(td, {
              skipElementCheck: shouldSkipElement,
              ignoreTags: ['table', 'tr', 'th', 'td']
            }).trim().replace(/\|/g, '\\|');
          });
          markdownRows.push(`| ${firstRowContent.join(' | ')} |`);
          markdownRows.push(`|${'---|'.repeat(columnCount)}`);
        }
      }
    }

    if (columnCount === 0) {
      console.warn("[Claude Extractor v5] Cannot determine table structure. Skipping.");
      return null;
    }

    // Body processing (tbody)
    const tbody = tableElement.querySelector(':scope > tbody');
    if (tbody) {
      const bodyRows = tbody.querySelectorAll(':scope > tr');
      // If thead was absent and the first row was used as header, skip the first row
      const startIdx = markdownRows.length === 2 && !thead ? 1 : 0;
      
      for (let i = startIdx; i < bodyRows.length; i++) {
        const row = bodyRows[i];
        const cells = Array.from(row.querySelectorAll(':scope > td'));
        
        // Check if the number of cells matches the column count
        if (cells.length === columnCount) {
          const cellContent = cells.map(td => {
            return QAClipper.Utils.htmlToMarkdown(td, {
              skipElementCheck: shouldSkipElement,
              ignoreTags: ['table', 'tr', 'th', 'td']
            }).trim().replace(/\|/g, '\\|').replace(/\n+/g, ' '); // Escape pipes and handle line breaks
          });
          markdownRows.push(`| ${cellContent.join(' | ')} |`);
        } else {
          console.warn("[Claude Extractor v5] Table row skipped due to column count mismatch:", cells.length, "vs", columnCount);
        }
      }
    }

    // Check if there is at least a header + separator + data row
    const markdownTable = markdownRows.length > 2 ? markdownRows.join('\n') : null;
    // console.log("[Claude Extractor v5] Generated Markdown table:", markdownTable);
    
    return markdownTable ? { type: 'text', content: markdownTable } : null;
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
      assistantContentElementsInGrid: ':scope > :is(p, ol, ul, pre, h1, h2, h3, h4, h5, h6)',

      // --- Content Block Selectors (within assistant turn) ---
      listItem: 'li',
      codeBlockContainer: 'pre', // Still needed for processCodeBlock if found
      codeBlockContent: 'code[class*="language-"]',
      codeBlockLangIndicator: 'div.text-text-300.absolute',
      
      // --- Table Selectors ---
      tableContainer: 'pre.font-styrene', // The pre element containing the table
      tableElement: 'table', // The actual table element

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

    extractUserText: (turnElement) => {
      const textElements = turnElement.querySelectorAll(claudeConfig.selectors.userText);
      if (!textElements || textElements.length === 0) return null;
      
      const lines = Array.from(textElements).map(el => 
        QAClipper.Utils.htmlToMarkdown(el, { skipElementCheck: shouldSkipElement }).trim()
      );
      const combinedText = lines.join('\n'); // Join with a standard newline character
      return combinedText || null;
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
                  // Find table containers first (Added in v5)
                  const tableContainers = gridInside.querySelectorAll(selectors.tableContainer);
                  if (tableContainers.length > 0) {
                      // console.log(`  -> Found ${tableContainers.length} table containers`);
                      tableContainers.forEach(tableContainer => {
                          const tableElement = tableContainer.querySelector(selectors.tableElement);
                          if (tableElement) {
                              // console.log("  -> Processing table element");
                              const tableItem = processTableToMarkdown(tableElement);
                              if (tableItem) contentItems.push(tableItem);
                          }
                      });
                  }
                  
                  //  Process existing content elements
                  const contentElements = gridInside.querySelectorAll(selectors.assistantContentElementsInGrid);
                  contentElements.forEach(contentElement => {
                      const contentTagName = contentElement.tagName.toLowerCase();
                      // console.log(`    -> Processing Grid Element: <${contentTagName}>`);
                      if (contentTagName === 'p') {
                          const markdownText = QAClipper.Utils.htmlToMarkdown(contentElement, { skipElementCheck: shouldSkipElement }).trim();
                          if (markdownText) QAClipper.Utils.addTextItem(contentItems, markdownText);
                      } else if (contentTagName === 'ul') {
                          const listMarkdown = processList(contentElement, 'ul', 0); // Pass level 0
                          if (listMarkdown) contentItems.push({ type: 'text', content: listMarkdown }); // Push result directly
                      } else if (contentTagName === 'ol') {
                          const listMarkdown = processList(contentElement, 'ol', 0); // Pass level 0
                          if (listMarkdown) contentItems.push({ type: 'text', content: listMarkdown }); // Push result directly
                      } else if (contentTagName === 'pre') {
                          const hasTable = contentElement.querySelector(selectors.tableElement);
                          if (hasTable) {
                              item = processTableToMarkdown(hasTable);
                          } else {
                              item = processCodeBlock(contentElement);
                          }
                          if (item) contentItems.push(item);
                      } else if (contentTagName.match(/^h[1-6]$/)) { // Handle headings h1-h6
                          const level = parseInt(contentTagName.substring(1), 10);
                          const prefix = '#'.repeat(level);
                          const headingText = QAClipper.Utils.htmlToMarkdown(contentElement, { 
                              skipElementCheck: shouldSkipElement,
                              // Optionally ignore specific tags within headings if needed
                              // ignoreTags: [] 
                          }).trim();
                          if (headingText) {
                              QAClipper.Utils.addTextItem(contentItems, `${prefix} ${headingText}`);
                          }
                      } else {
                          // console.log(`    -> Skipping unhandled grid element: <${contentTagName}>`);
                      }
                  });
              } else {
                   console.warn("  -> Grid not found inside tabindex div. Trying to process direct content.");
                   // Fallback: If grid is not found, find content elements directly within the tabindex div
                   // Include headings h1-h6 in fallback as well
                   const directContent = child.querySelectorAll(':scope > :is(p, ol, ul, pre, h1, h2, h3, h4, h5, h6)');
                   directContent.forEach(contentElement => {
                        const contentTagName = contentElement.tagName.toLowerCase();
                        if (contentTagName === 'p') {
                            const markdownText = QAClipper.Utils.htmlToMarkdown(contentElement, { skipElementCheck: shouldSkipElement }).trim();
                            if (markdownText) QAClipper.Utils.addTextItem(contentItems, markdownText);
                        }
                        else if (contentTagName === 'ul') { 
                            const listMarkdown = processList(contentElement, 'ul', 0); // Pass level 0
                            if (listMarkdown) contentItems.push({ type: 'text', content: listMarkdown }); // Push result directly
                        }
                        else if (contentTagName === 'ol') {
                            const listMarkdown = processList(contentElement, 'ol', 0); // Pass level 0
                            if (listMarkdown) contentItems.push({ type: 'text', content: listMarkdown }); // Push result directly
                        }
                        else if (contentTagName === 'pre') {
                            const hasTable = contentElement.querySelector(selectors.tableElement);
                            if (hasTable) {
                                item = processTableToMarkdown(hasTable);
                            } else {
                                item = processCodeBlock(contentElement);
                            }
                            if (item) contentItems.push(item);
                        } else if (contentTagName.match(/^h[1-6]$/)) { // Handle headings h1-h6 in fallback
                            const level = parseInt(contentTagName.substring(1), 10);
                            const prefix = '#'.repeat(level);
                            const headingText = QAClipper.Utils.htmlToMarkdown(contentElement, { 
                                skipElementCheck: shouldSkipElement 
                            }).trim();
                            if (headingText) {
                                QAClipper.Utils.addTextItem(contentItems, `${prefix} ${headingText}`);
                            }
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
          // Case 3: Unhandled direct child
          else {
              console.warn(`  -> Skipping unhandled direct child type <${tagNameLower}>`);
          }
      }); // End forEach loop

      // console.log("[Claude Extractor v5] Final assistant contentItems:", JSON.stringify(contentItems, null, 2));
      return contentItems;
    }, // End extractAssistantContent

  }; // End claudeConfig

  // Assign to window object
  window.claudeConfig = claudeConfig;
  // console.log("claudeConfig.js initialized (v" + claudeConfig.version + ")");

})(); // End of IIFE