// --- Updated grokConfigs.js (v7 - Table Handling) ---

/**
 * Configuration for extracting Q&A data from Grok (grok.com)
 * Version: 7 (Added table processing)
 */
(function() {
  // Initialization check
  if (window.grokConfig && window.grokConfig.version >= 7) { // Updated version check
    // console.log("Grok config already initialized (v" + window.grokConfig.version + "), skipping.");
    return;
  }

  // --- Helper Functions ---

  /**
   * Checks if an HTML element should be skipped during markdown conversion or processing.
   * Skips elements handled by dedicated processors (image grids, user attachment chips)
   * or elements *inside* a code block that processNode shouldn't recurse into.
   * @param {HTMLElement} element - The element to check.
   * @returns {boolean} - True if the element should be skipped.
   */
  function shouldSkipElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    const selectors = window.grokConfig?.selectors;
    if (!selectors) return false; // Config not loaded yet

    // Keep skips for things genuinely handled by specific processors or needing exclusion
    return element.matches(selectors.assistantImageGrid) || // Handled by processAssistantImageGrid
           element.closest(selectors.userAttachmentChip) || // Skip content inside user attachment chips
           element.matches(selectors.assistantCodeBlockInnerContainer); // Skip inner code div (handled by processCodeBlock)
           // REMOVED: Lists (ul/ol) and tables are now processed by processNode/processList/processTableToMarkdown
           // element.tagName.toLowerCase() === 'ul' ||
           // element.tagName.toLowerCase() === 'ol' ||
           // element.tagName.toLowerCase() === 'table';
  }

  /**
   * Processes <li> elements within a <ul> or <ol> list, handling nested structures.
   * Uses a custom node processing logic to correctly handle inline formatting and nested blocks.
   * @param {HTMLElement} el - The <ul> or <ol> element.
   * @param {string} listType - 'ul' or 'ol'.
   * @returns {object|null} - A text content item { type: 'text', content: '...' } or null.
   */
  function processList(el, listType) {
    let processedItems = []; // Store fully processed list item strings
    let startNum = 1;
    if (listType === 'ol') {
      startNum = parseInt(el.getAttribute('start') || '1', 10);
      if (isNaN(startNum)) startNum = 1;
    }
    let itemIndex = 0;

    el.querySelectorAll(':scope > li').forEach(li => {
      // 1. Get raw content of the list item
      const itemMarkdown = processChildNodes(li); // Keep internal structure/newlines
      const trimmedItemMarkdown = itemMarkdown.trim(); // Use trimmed version for existence check

      if (trimmedItemMarkdown) {
        // 2. Calculate base indentation for this <li> level
        const baseNestingLevel = getNestingLevel(li, 'ul, ol');
        const baseIndentString = '  '.repeat(baseNestingLevel); // e.g., "  " or "    "

        // 3. Determine the marker
        const marker = listType === 'ul' ? '-' : `${startNum + itemIndex}.`;
        const markerString = `${marker} `; // e.g., "- " or "1. "

        // 4. Calculate indentation for subsequent lines within this <li>
        //    This should align with the text *after* the marker.
        const subsequentIndentString = baseIndentString + ' '.repeat(markerString.length); // e.g., "   " or "    "

        // 5. Split the item content into lines
        const itemLines = itemMarkdown.split('\n');

        // 6. Process each line
        const formattedLines = itemLines.map((line, lineIndex) => {
            const trimmedLine = line.trim(); // Trim individual lines for clean processing
            if (lineIndex === 0) {
                // First line gets base indent + marker + content
                return `${baseIndentString}${markerString}${trimmedLine}`;
            } else {
                 // Subsequent lines get the calculated subsequent indent + content
                 // Only add indent if the line actually has content after trimming
                return trimmedLine ? `${subsequentIndentString}${trimmedLine}` : '';
            }
        }).filter(line => line); // Remove empty lines potentially created by trimming

        // 7. Add the fully formatted lines for this item to our results
        processedItems.push(...formattedLines); // Add each processed line individually

        if (listType === 'ol') itemIndex++;
      }
    });

    // 8. Join all processed lines from all items with a single newline
    //    processNode calling this will handle spacing around the entire list block
    return processedItems.length > 0 ? { type: 'text', content: processedItems.join('\n') } : null;
  }

   /**
    * Calculates the nesting level of a list item relative to the message bubble.
    * A level of 0 means the list containing the item is a direct child of the message bubble.
    * @param {HTMLElement} listItemElement - The list item element (<li>).
    * @param {string} listSelectors - CSS selectors for list tags (e.g., 'ul, ol').
    * @returns {number} - The nesting level (0 for top-level list items within the bubble).
    */
   function getNestingLevel(listItemElement, listSelectors) {
        let level = 0;
        // Start checking from the parent of the list element containing the list item
        let listElement = listItemElement.parentElement;

        // Ensure we have a valid list element containing the item
        if (!listElement || !listElement.matches(listSelectors)) {
            // Should not happen if called correctly, but provides safety
            return 0;
        }

        let ancestor = listElement.parentElement; // Start search from the list's parent

        while (ancestor) {
            // Stop counting when we reach the message bubble or body
            if (ancestor.matches(window.grokConfig.selectors.messageBubble) || ancestor.tagName === 'BODY') {
                break;
            }
            // Increment level for each ANCESTOR list element found
            if (ancestor.matches(listSelectors)) {
                level++;
            }
            ancestor = ancestor.parentElement;
        }
        // The level now represents the number of parent lists *containing* this list.
        return level;
   }

  /**
   * Processes the inner code block container (`div.relative` inside `div.not-prose`).
   * Extracts language and code content.
   * @param {HTMLElement} innerEl - The inner container element (`div.relative`).
   * @returns {object|null} - A structured code_block object { type: 'code_block', ... } or null.
   */
  function processCodeBlock(innerEl) {
    const selectors = window.grokConfig.selectors;
    const langElement = innerEl.querySelector(selectors.assistantCodeBlockLang);
    const codeElement = innerEl.querySelector(selectors.assistantCodeBlockContent);

    const language = langElement ? langElement.textContent?.trim().toLowerCase() : null;
    const code = codeElement ? codeElement.textContent : ''; // Preserve whitespace

    // Return structured data, not formatted markdown
    return code.trim() ? { type: 'code_block', language: language, content: code.trimEnd() } : null;
  }

  /**
   * Processes an image grid container (`div.grid`) to extract individual images.
   * @param {HTMLElement} gridEl - The image grid container element.
   * @returns {Array<object>} - An array of image content items { type: 'image', ... }.
   */
  function processAssistantImageGrid(gridEl) {
      const images = [];
      const selectors = window.grokConfig.selectors;
      gridEl.querySelectorAll(selectors.assistantImageElement).forEach(imgElement => {
          const src = imgElement.getAttribute('src');
          if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
              try {
                  const absoluteSrc = new URL(src, window.location.origin).href;
                  const altText = imgElement.getAttribute('alt')?.trim() || "Image";
                  images.push({
                      type: 'image',
                      src: absoluteSrc,
                      alt: altText,
                      extractedContent: altText
                  });
              } catch (e) {
                  console.error("[Grok Extractor] Error processing image URL:", e, src);
              }
          }
      });
      return images;
  }

  /**
   * NEW IN v7: Processes a table element and converts it to Markdown format.
   * @param {HTMLElement} tableElement - The table element or its container.
   * @returns {string|null} - Markdown representation of the table or null if invalid.
   */
  function processTableToMarkdown(tableElement) {
      // If we were passed a container div, find the table inside it
      const table = tableElement.tagName.toLowerCase() === 'table' 
          ? tableElement 
          : tableElement.querySelector('table');
      
      if (!table) {
          console.warn("[Grok Extractor v7] No table found in element:", tableElement);
          return null;
      }

      const rows = [];
      let columnCount = 0;

      // Process Table Header (thead)
      const thead = table.querySelector('thead');
      if (thead) {
          const headerRow = thead.querySelector('tr');
          if (headerRow) {
              const headerCells = Array.from(headerRow.querySelectorAll('th'));
              columnCount = headerCells.length;
              
              if (columnCount > 0) {
                  // Create header row
                  const headerContent = headerCells.map(th => {
                      // Process the content of each header cell
                      let cellText = processChildNodes(th).trim();
                      // Escape pipe characters in content
                      return cellText.replace(/\|/g, '\\|');
                  });
                  
                  rows.push(`| ${headerContent.join(' | ')} |`);
                  
                  // Add separator row (with alignment if specified)
                  rows.push(`| ${Array(columnCount).fill('---').join(' | ')} |`);
              }
          }
      }

      // If no header was found, try to determine column count from the first body row
      if (columnCount === 0) {
          const firstRow = table.querySelector('tbody > tr');
          if (firstRow) {
              columnCount = firstRow.querySelectorAll('td').length;
              // Create a default header row with empty cells
              if (columnCount > 0) {
                  rows.push(`| ${Array(columnCount).fill('').join(' | ')} |`);
                  rows.push(`| ${Array(columnCount).fill('---').join(' | ')} |`);
              }
          }
      }

      if (columnCount === 0) {
          console.warn("[Grok Extractor v7] Could not determine column count for table:", table);
          return null;
      }

      // Process Table Body (tbody)
      const tbody = table.querySelector('tbody');
      if (tbody) {
          const bodyRows = tbody.querySelectorAll('tr');
          bodyRows.forEach(row => {
              const cells = Array.from(row.querySelectorAll('td'));
              
              // Skip empty rows
              if (cells.length === 0) return;
              
              // Process cells (pad if necessary to match header)
              const processedCells = [];
              
              for (let i = 0; i < columnCount; i++) {
                  if (i < cells.length) {
                      // Process cell content
                      let cellText = processChildNodes(cells[i]).trim();
                      // Replace newlines with spaces and escape pipes
                      cellText = cellText.replace(/\n+/g, ' ').replace(/\|/g, '\\|');
                      processedCells.push(cellText);
                  } else {
                      // Pad with empty cells if row has fewer cells than the header
                      processedCells.push('');
                  }
              }
              
              rows.push(`| ${processedCells.join(' | ')} |`);
          });
      }

      // Return null if we only have header rows with no data
      return rows.length > 1 ? rows.join('\n') : null;
  }

  /**
   * Recursively processes a DOM node and its children to generate Markdown text.
   * **Updated in v7:** Also handles table elements.
   * @param {Node} node - The DOM node to process.
   * @returns {string} - The Markdown representation of the node and its children.
   */
  function processNode(node) {
    const selectors = window.grokConfig?.selectors;
    if (!selectors) return ''; // Config must be loaded

    // Handle text nodes
    if (node.nodeType === Node.TEXT_NODE) {
      // Replace tabs/newlines with a single space, collapse multiple spaces to one
      return (node.textContent || '').replace(/[\t\n\r]+/g, ' ').replace(/ {2,}/g, ' ');
    }

    // Handle element nodes
    if (node.nodeType === Node.ELEMENT_NODE) {

        const tagName = node.tagName.toLowerCase();

        // *** Handle SPECIAL block elements first (they add their own newlines) ***
        if (node.matches(selectors.assistantCodeBlockOuterContainer)) {
            const innerCodeContainer = node.querySelector(selectors.assistantCodeBlockInnerContainer);
            if (innerCodeContainer) {
                const codeItem = processCodeBlock(innerCodeContainer);
                if (codeItem) {
                    const lang = codeItem.language || '';
                    const codeContent = (codeItem.content || '').trimEnd();
                    // Return standard markdown block format; add surrounding newlines for separation
                    return `\n\`\`\`${lang}\n${codeContent}\n\`\`\`\n`;
                }
            }
            return ''; // Skip if inner container not found or no code
        }
        if (node.matches(selectors.assistantImageGrid)) {
            const imageItems = processAssistantImageGrid(node);
            // Add newlines for separation.
            return '\n' + imageItems.map(img => `[${img.alt}]: ${img.src}`).join('\n') + '\n';
        }
        if (tagName === 'ul' || tagName === 'ol') {
            const listData = processList(node, tagName);
            // Return ONLY the list content; spacing handled by processChildNodes
            return listData ? listData.content : '';
        }
        if (tagName === 'table' || (tagName === 'div' && node.classList.contains('overflow-x-auto'))) {
            const tableMarkdown = processTableToMarkdown(node);
            // Return ONLY the table content; spacing handled by processChildNodes
            return tableMarkdown || '';
        }

        // Skip elements meant to be handled differently or ignored
        if (shouldSkipElement(node)) {
            return '';
        }

        // *** Handle HEADINGS (Add Markdown prefix) ***
        if (tagName.startsWith('h') && tagName.length === 2) {
            const level = parseInt(tagName.substring(1), 10);
            const prefix = '#'.repeat(level) + ' ';
            // Process children WITHOUT trim - let parent processChildNodes handle spacing/trimming
            return prefix + processChildNodes(node);
        }

        // *** Handle PARAGRAPHS and DIVS (Treat as simple block containers) ***
        if (tagName === 'p' || tagName === 'div') {
             // Process children WITHOUT trim - let parent processChildNodes handle spacing/trimming
            return processChildNodes(node);
        }

        // --- Handle INLINE Elements --- (if not a block handled above)
        let content = processChildNodes(node); // Process children first for inlines

        if (tagName === 'strong' || tagName === 'b') { return `**${content}**`; }
        if (tagName === 'em' || tagName === 'i') { return `*${content}*`; }
        if (tagName === 'a') { const href = node.getAttribute('href'); return href ? `[${content}](${href})` : content; }
        if (tagName === 'br') { return '\n'; } // Handle line breaks
        if (node.matches(selectors.inlineCodeSpan)) { return `\`${node.textContent?.trim()}\``; } // Handle inline code spans

        // For unhandled inline elements (like spans), just return their children's content
        return content;
    }

    // Ignore other node types (comments, etc.)
    return '';
  }

  /**
   * Iterates over the child nodes of an element, processes them using processNode,
   * concatenates the results, and handles spacing and trimming appropriately.
   * @param {HTMLElement} element - The parent element.
   * @returns {string} - The combined Markdown string of all child nodes.
   */
  function processChildNodes(element) {
    let markdown = '';
    let needsLeadingSpace = false; // Track if the next inline content needs a leading space

    if (element.childNodes) {
      element.childNodes.forEach(child => {
        const processedContent = processNode(child); // Gets raw content (could have leading/trailing spaces)
        // Skip truly empty results (null, undefined, empty string), but allow results that are just a single space ' '
        if (!processedContent && processedContent !== ' ') {
             return;
        }

        const trimmedContent = processedContent.trim(); // Trim here for logic checks

        // Handle content that was ONLY whitespace (original was ' ', trimmed is '')
        if (!trimmedContent && processedContent === ' ') {
            if (markdown && !markdown.endsWith(' ') && !markdown.endsWith('\n')) {
                 needsLeadingSpace = true; // Mark that next non-space inline needs a space
            }
            // Don't append the space itself yet, wait for subsequent non-space content
            return;
        }

        // Skip if trimming resulted in empty content (and it wasn't just a space)
        if (!trimmedContent) {
            return;
        }


        const currentNodeIsBlock = isBlockElement(child);

        if (currentNodeIsBlock) {
          // Ensure block elements are separated by a blank line
           // Check if markdown has content AND doesn't already end with a double newline
           if (markdown && !markdown.endsWith('\n\n')) {
              // Add one newline if it ends with one, two otherwise
              markdown += markdown.endsWith('\n') ? '\n' : '\n\n';
           }
          markdown += trimmedContent; // Append the trimmed block content
          // Ensure block ends with at least one newline, preparing for next element
           if (!markdown.endsWith('\n')) {
               markdown += '\n';
           }
          needsLeadingSpace = false; // Reset space requirement after a block
        } else { // Inline or text node
           if (needsLeadingSpace) {
               markdown += ' '; // Add the required leading space
               needsLeadingSpace = false; // Reset tracker
           } else if (markdown && !markdown.endsWith(' ') && !markdown.endsWith('\n')) {
               // Add space if needed between previous content and this inline content,
               // but only if the previous content wasn't already a block ending in newline.
               markdown += ' ';
           }
           markdown += trimmedContent; // Append the trimmed inline content

           // If the original processed content ended with a space, the next inline might need one
           needsLeadingSpace = processedContent.endsWith(' ');

        }
      });
    }
    // Final trim of the entire result
    return markdown.trim();
  }

  /**
   * Helper function to check if a node is a block-level element for spacing purposes.
   * Includes standard blocks and custom blocks handled by processNode.
   * @param {Node} node - The DOM node to check.
   * @returns {boolean} - True if the node is considered a block element.
   */
  function isBlockElement(node) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
      const tagName = node.tagName.toLowerCase();
      const selectors = window.grokConfig?.selectors;

      // Standard HTML block tags
      const blockTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'div', 'blockquote', 'hr', 'pre'];
      if (blockTags.includes(tagName)) {
          return true;
      }

      // Custom block-like containers from selectors
      if (selectors && (node.matches(selectors.assistantCodeBlockOuterContainer) || node.matches(selectors.assistantImageGrid) || node.matches(selectors.assistantTableContainer))) {
          return true;
      }

      return false;
  }

  /**
   * Constructs the full image URL from a preview URL found in user attachment chips.
   * Assumes preview URL structure like '.../preview-image' and full URL '.../content'.
   * @param {string} previewUrl - The URL extracted from the style attribute (e.g., background-image).
   * @returns {string|null} - The constructed full image URL or null if input is invalid/pattern mismatch.
   */
  function getFullImageUrlFromPreview(previewUrl) {
    if (!previewUrl) return null;
    if (previewUrl.includes('assets.grok.com') && previewUrl.includes('/preview-image')) {
        return previewUrl.replace('/preview-image', '/content');
    }
    console.warn("[Grok Extractor] User image preview URL doesn't match expected pattern:", previewUrl);
    return null;
  }


  // --- Main Configuration Object ---
  const grokConfig = {
    platformName: 'Grok',
    version: 7, // Updated config version
    selectors: {
      turnContainer: 'div.relative.group.flex.flex-col.justify-center[class*="items-"]',
      userMessageIndicator: '.items-end',
      assistantMessageIndicator: '.items-start',
      messageBubble: 'div.message-bubble',
      userTextContainer: 'div.message-bubble p.break-words',
      userAttachmentChip: 'div.flex.flex-row.items-center.rounded-xl.bg-chip',
      userAttachmentFilename: 'span.truncate',
      userAttachmentImagePreviewDiv: 'div[style*="background-image"]',
      userAttachmentFileIcon: 'svg[aria-label="Text File"]',
      assistantContentContainer: 'div.message-bubble',
      assistantRelevantBlocks: ':scope > :is(p, h1, h2, h3, h4, h5, h6, ol, ul, div.not-prose, div.grid, div.overflow-x-auto)',
      listItem: 'li',
      assistantCodeBlockOuterContainer: 'div.not-prose',
      assistantCodeBlockInnerContainer: 'div.not-prose > div.relative',
      assistantCodeBlockLang: ':scope > div.flex > span.font-mono.text-xs',
      assistantCodeBlockContent: ':scope > div[style*="display: block"] > code[style*="white-space: pre"]',
      assistantImageGrid: 'div.grid',
      assistantImageElement: 'img.object-cover.relative',
      inlineCodeSpan: 'span.text-sm.px-1.rounded-sm.\\!font-mono',
      assistantTableContainer: 'div.overflow-x-auto',
      assistantTable: 'table',
      imageCaption: null,
      interactiveBlockContainer: null,
      interactiveBlockTitle: null,
      interactiveBlockContent: null,
    },

    // --- Extraction Functions ---
    getRole: (turnElement) => { /* ... unchanged ... */ if (!turnElement) return null; if (turnElement.matches(grokConfig.selectors.userMessageIndicator)) return 'user'; if (turnElement.matches(grokConfig.selectors.assistantMessageIndicator)) return 'assistant'; console.warn("[Grok Extractor] Could not determine role for turn:", turnElement); return null; },
    /**
     * Extracts text content from a user's message bubble.
     * Handles cases where the message is split across multiple paragraph elements.
     * @param {HTMLElement} turnElement - The user turn container element.
     * @returns {string|null} - The combined text content or null if none found.
     */
    extractUserText: (turnElement) => {
      const userBubble = turnElement.querySelector(grokConfig.selectors.messageBubble);
      if (!userBubble) {
        // console.warn("[Grok Extractor] User message bubble not found in turn:", turnElement);
        return null;
      }

      // Process ALL child nodes of the bubble using the existing recursive node processor.
      // This handles various structures (multiple <p>, <div>, text nodes, etc.) within the user message.
      const fullText = processChildNodes(userBubble).trim();

      // console.log("[Grok Extractor] Extracted user text (processed bubble):", fullText || "null");
      return fullText || null; // Return null if the result is an empty string
    },
    extractUserUploadedImages: (turnElement) => { /* ... unchanged ... */ const images = []; const selectors = grokConfig.selectors; turnElement.querySelectorAll(selectors.userAttachmentChip).forEach(chip => { const imgPreviewDiv = chip.querySelector(selectors.userAttachmentImagePreviewDiv); const filenameElement = chip.querySelector(selectors.userAttachmentFilename); if (imgPreviewDiv && filenameElement) { const filename = filenameElement.textContent?.trim(); const style = imgPreviewDiv.getAttribute('style'); const match = style?.match(/url\\("?([^")]+)"?\\)/); const previewUrl = match ? match[1] : null; if (filename && previewUrl) { const fullUrl = getFullImageUrlFromPreview(previewUrl); if (fullUrl) { images.push({ type: 'image', sourceUrl: fullUrl, isPreviewOnly: true, extractedContent: filename }); } } } }); return images; },
    extractUserUploadedFiles: (turnElement) => { /* ... unchanged ... */ const files = []; const selectors = grokConfig.selectors; turnElement.querySelectorAll(selectors.userAttachmentChip).forEach(chip => { const fileIcon = chip.querySelector(selectors.userAttachmentFileIcon); const filenameElement = chip.querySelector(selectors.userAttachmentFilename); if (fileIcon && filenameElement && !chip.querySelector(selectors.userAttachmentImagePreviewDiv)) { const fileName = filenameElement.textContent?.trim(); if (fileName) { files.push({ type: 'file', fileName: fileName, fileType: 'File', isPreviewOnly: true, extractedContent: null }); } } }); return files; },

    /**
     * Extracts structured content items (text, code, images, lists, tables) from an assistant's message bubble.
     * Iterates through relevant block-level elements within the bubble and processes them accordingly.
     * **Updated in v7:** Added table handling with processTableToMarkdown.
     * @param {HTMLElement} turnElement - The assistant turn container element.
     * @returns {Array<object>} - An array of structured content items.
     */
    extractAssistantContent: (turnElement) => {
      const contentItems = [];
      const selectors = grokConfig.selectors;
      const assistantContainer = turnElement.querySelector(selectors.assistantContentContainer);
      if (!assistantContainer) {
        console.warn("[Grok Extractor] Assistant message bubble not found.");
        return [];
      }

      // console.log(`[Grok Extractor v7] Processing assistant message bubble.`);
      // Select the relevant block elements directly within the message bubble
      const relevantBlocks = assistantContainer.querySelectorAll(selectors.assistantRelevantBlocks);
      const processedElements = new Set(); // Keep track of processed elements

      relevantBlocks.forEach((block, index) => {
          // Skip if this element was already processed as part of a larger block
          if (processedElements.has(block)) return;

          const tagNameLower = block.tagName.toLowerCase();
          // console.log(`[Grok Extractor v7] Processing Block #${index}: <${tagNameLower}>`);
          let item = null; // To hold the result of processing functions

          // --- Process based on block type ---

          // Check Image Grid First
          if (block.matches(selectors.assistantImageGrid)) {
              // console.log("  -> Handling as Top-Level Image Grid");
              const imageItems = processAssistantImageGrid(block);
              contentItems.push(...imageItems); // Add extracted image items
              processedElements.add(block);
              block.querySelectorAll('*').forEach(child => processedElements.add(child));
          }
          // Check for Code Block Outer Container
          else if (block.matches(selectors.assistantCodeBlockOuterContainer)) {
              // console.log("  -> Handling as Top-Level Code Block");
              const innerCodeContainer = block.querySelector(selectors.assistantCodeBlockInnerContainer);
              if (innerCodeContainer) {
                  // Double-check it's not an image grid (unlikely due to order)
                  if (!block.matches(selectors.assistantImageGrid)) {
                       item = processCodeBlock(innerCodeContainer); // Get structured code data
                       if (item) contentItems.push(item); // Add the code_block item
                  } else {
                       console.warn("  -> Element matched both image grid and code block outer container, prioritizing image grid (already handled).");
                  }
              } else {
                   // console.log("  -> 'div.not-prose' found, but no inner code container. Skipping as code block.");
              }
              processedElements.add(block);
              block.querySelectorAll('*').forEach(child => processedElements.add(child));
          }
          // NEW IN v7: Handle Tables
          else if (tagNameLower === 'div' && block.classList.contains('overflow-x-auto')) {
              // console.log("  -> Handling as Table Container");
              // Check if there's a table inside
              const tableElement = block.querySelector('table');
              if (tableElement) {
                  // Process the table to markdown
                  const tableMarkdown = processTableToMarkdown(block);
                  if (tableMarkdown) {
                      // Add the table markdown as a text item
                      QAClipper.Utils.addTextItem(contentItems, tableMarkdown);
                  } else {
                      console.warn("  -> Failed to convert table to markdown:", tableElement);
                  }
                  processedElements.add(block);
                  processedElements.add(tableElement);
                  tableElement.querySelectorAll('*').forEach(child => processedElements.add(child));
              } else {
                  // console.log("  -> div.overflow-x-auto found, but no table inside. Skipping.");
              }
          }
          // Handle Lists (using processList which uses processChildNodes -> processNode that now handles nested blocks)
          else if (tagNameLower === 'ul' || tagNameLower === 'ol') {
              // console.log(`  -> Handling as ${tagNameLower.toUpperCase()} List`);
              item = processList(block, tagNameLower); // processList returns { type: 'text', content: '...' }
              if (item) {
                  // Add the text item containing the fully formatted list (including nested items/blocks)
                  QAClipper.Utils.addTextItem(contentItems, item.content);
              }
              processedElements.add(block);
              // Mark children as processed because processList->processChildNodes handled them
              block.querySelectorAll('*').forEach(child => processedElements.add(child));
          }
          // Handle Paragraphs and Headings (using processChildNodes -> processNode that now handles nested blocks)
          else if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagNameLower)) {
              // console.log(`  -> Handling as ${tagNameLower.toUpperCase()}`);
              // Use processChildNodes which now handles nested blocks via processNode
              // It will return a string potentially containing formatted blocks (like code, lists)
              const markdownContent = processChildNodes(block).trim();
              if (markdownContent) {
                  let prefix = '';
                  if (tagNameLower.startsWith('h')) {
                      prefix = '#'.repeat(parseInt(tagNameLower.substring(1), 10)) + ' ';
                  }
                  // Add the potentially multi-line content (including formatted blocks) as a single text item
                  QAClipper.Utils.addTextItem(contentItems, prefix + markdownContent);
              }
              processedElements.add(block);
              // Mark children as processed because processChildNodes handled them
              block.querySelectorAll('*').forEach(child => processedElements.add(child));
          }
          // --- Fallback / Unhandled ---
          else {
              console.warn(`[Grok Extractor v7]   -> Skipping unhandled direct block type <${tagNameLower}>`, block);
              processedElements.add(block);
          }
      }); // End forEach loop over relevantBlocks

      // console.log("[Grok Extractor v7] Final assistant contentItems:", JSON.stringify(contentItems, null, 2));
      return contentItems; // Return the array of extracted content items
    }, // End extractAssistantContent

  }; // End grokConfig

  // Assign the configuration to the window object
  window.grokConfig = grokConfig;
  // console.log("grokConfig.js initialized (v" + grokConfig.version + ")");

})(); // End of IIFE
// --- END OF UPDATED FILE grokConfigs.js ---