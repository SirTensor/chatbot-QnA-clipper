// --- Updated grokConfigs.js (v7 - Table Handling) ---

/**
 * Configuration for extracting Q&A data from Grok (grok.com)
 * Version: 7 (Added table processing)
 */
(function() {
  // Initialization check
  if (window.grokConfig && window.grokConfig.version >= 7) { // Updated version check
    console.log("Grok config already initialized (v" + window.grokConfig.version + "), skipping.");
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

    // Skip image grids (handled by processAssistantImageGrid or main loop)
    // Skip anything inside a user attachment chip
    // Skip the *inner* container of code blocks so processNode doesn't process its content directly
    // Skip lists elements as they are handled by processList/processNode's list handling
    // Skip table elements as they are handled by processTable
    return element.matches(selectors.assistantImageGrid) ||
           element.closest(selectors.userAttachmentChip) ||
           element.matches(selectors.assistantCodeBlockInnerContainer) ||
           element.tagName.toLowerCase() === 'ul' || // Handled by processNode/processList
           element.tagName.toLowerCase() === 'ol' || // Handled by processNode/processList
           element.tagName.toLowerCase() === 'table'; // Handled by processTable
  }

  /**
   * Processes <li> elements within a <ul> or <ol> list, handling nested structures.
   * Uses a custom node processing logic to correctly handle inline formatting and nested blocks.
   * @param {HTMLElement} el - The <ul> or <ol> element.
   * @param {string} listType - 'ul' or 'ol'.
   * @returns {object|null} - A text content item { type: 'text', content: '...' } or null.
   */
  function processList(el, listType) {
    let lines = [];
    let startNum = 1;
    if (listType === 'ol') {
      startNum = parseInt(el.getAttribute('start') || '1', 10);
      if (isNaN(startNum)) startNum = 1;
    }
    let itemIndex = 0;

    el.querySelectorAll(':scope > li').forEach(li => {
      // Use processChildNodes which now correctly handles nested blocks via processNode
      const itemMarkdown = processChildNodes(li).trim();
      if (itemMarkdown) {
        const marker = listType === 'ul' ? '-' : `${startNum + itemIndex}.`;
        // Calculate indentation based on the nesting level relative to the message bubble
        const indentation = '  '.repeat(getNestingLevel(li, 'ul, ol'));
        // Add the item, preserving newlines from nested code blocks handled by processNode
        lines.push(`${indentation}${marker} ${itemMarkdown}`);
        if (listType === 'ol') itemIndex++;
      }
    });
    // Join list items with a single newline for the final text block content
    return lines.length > 0 ? { type: 'text', content: lines.join('\n') } : null;
  }

   /**
    * Calculates the nesting level of a list item relative to the message bubble.
    * @param {HTMLElement} element - The list item element (<li>).
    * @param {string} listSelectors - CSS selectors for list tags (e.g., 'ul, ol').
    * @returns {number} - The nesting level (0 for top-level list items within the bubble).
    */
   function getNestingLevel(element, listSelectors) {
        let level = 0;
        let parent = element.parentElement;
        while (parent) {
            // Stop counting when we reach the message bubble or body
            if (parent.matches(window.grokConfig.selectors.messageBubble) || parent.tagName === 'BODY') {
                break;
            }
            // Increment level for each ancestor list element
            if (parent.matches(listSelectors)) {
                level++;
            }
            parent = parent.parentElement;
        }
        // The level represents the number of parent lists between the item and the bubble
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

        // *** Handle block elements encountered during recursion ***
        const tagName = node.tagName.toLowerCase();

        // Handle Code Blocks first
        if (node.matches(selectors.assistantCodeBlockOuterContainer)) {
            console.log("  [processNode v7] Handling nested Code Block (div.not-prose)");
            const innerCodeContainer = node.querySelector(selectors.assistantCodeBlockInnerContainer);
            if (innerCodeContainer) {
                const codeItem = processCodeBlock(innerCodeContainer); // Get structured data
                if (codeItem) {
                    // Format it directly into Markdown here
                    const lang = codeItem.language || '';
                    const codeContent = (codeItem.content || '').trimEnd(); // Preserve internal whitespace/newlines
                    // Return standard markdown block format; add surrounding newlines for separation
                    return `\n\`\`\`${lang}\n${codeContent}\n\`\`\`\n`;
                }
            }
            return ''; // Skip if inner container not found or no code
        }
        // Handle nested Image Grids
        if (node.matches(selectors.assistantImageGrid)) {
            console.log("  [processNode v7] Handling nested Image Grid");
            const imageItems = processAssistantImageGrid(node);
            // Format images simply here. Add newlines for separation.
            return '\n' + imageItems.map(img => `[${img.alt}]: ${img.src}`).join('\n') + '\n';
        }
        // *** Handle nested lists ***
        if (tagName === 'ul' || tagName === 'ol') {
            console.log("  [processNode v7] Handling nested List <" + tagName + ">");
            // Use processList to get the formatted list object { type: 'text', content: '...' }
            const listData = processList(node, tagName);
            // Return the formatted list content string. Add surrounding newlines for block separation.
            return listData ? '\n' + listData.content + '\n' : '';
        }
        // *** NEW IN v7: Handle tables ***
        if (tagName === 'table' || (tagName === 'div' && node.classList.contains('overflow-x-auto'))) {
            console.log("  [processNode v7] Handling nested Table");
            // Generate Markdown for the table
            const tableMarkdown = processTableToMarkdown(node);
            // Return the markdown with surrounding newlines for block separation
            return tableMarkdown ? '\n' + tableMarkdown + '\n' : '';
        }

        // Skip elements that should be handled by higher-level loops or are irrelevant
        if (shouldSkipElement(node)) {
            return '';
        }

        // --- Handle Inline Elements ---
        // Recursively process children *before* applying formatting for inline tags
        let content = processChildNodes(node);

        if (tagName === 'strong' || tagName === 'b') { return `**${content}**`; }
        if (tagName === 'em' || tagName === 'i') { return `*${content}*`; }
        if (tagName === 'a') { const href = node.getAttribute('href'); return href ? `[${content}](${href})` : content; }
        if (tagName === 'br') { return '\n'; } // Handle line breaks
        if (node.matches(selectors.inlineCodeSpan)) { return `\`${node.textContent?.trim()}\``; } // Handle inline code spans

        // For other elements (like spans, divs not handled above), just return their processed children's content
        return content;
    }

    // Ignore other node types (comments, etc.)
    return '';
  }

  /**
   * Iterates over the child nodes of an element and concatenates their
   * Markdown representations obtained from `processNode`.
   * @param {HTMLElement} element - The parent element.
   * @returns {string} - The combined Markdown string of all child nodes.
   */
  function processChildNodes(element) {
    let markdown = '';
    if (element.childNodes) {
      element.childNodes.forEach(child => {
        markdown += processNode(child); // Append results directly
      });
    }
    // Trim leading/trailing whitespace from the final combined string for the element's content
    return markdown.trim();
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
    extractUserText: (turnElement) => { /* ... unchanged ... */ const textElement = turnElement.querySelector(grokConfig.selectors.userTextContainer); return textElement ? processChildNodes(textElement).trim() || null : null; },
    extractUserUploadedImages: (turnElement) => { /* ... unchanged ... */ const images = []; const selectors = grokConfig.selectors; turnElement.querySelectorAll(selectors.userAttachmentChip).forEach(chip => { const imgPreviewDiv = chip.querySelector(selectors.userAttachmentImagePreviewDiv); const filenameElement = chip.querySelector(selectors.userAttachmentFilename); if (imgPreviewDiv && filenameElement) { const filename = filenameElement.textContent?.trim(); const style = imgPreviewDiv.getAttribute('style'); const match = style?.match(/url\("?([^")]+)"?\)/); const previewUrl = match ? match[1] : null; if (filename && previewUrl) { const fullUrl = getFullImageUrlFromPreview(previewUrl); if (fullUrl) { images.push({ type: 'image', sourceUrl: fullUrl, isPreviewOnly: true, extractedContent: filename }); } } } }); return images; },
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

      console.log(`[Grok Extractor v7] Processing assistant message bubble.`);
      // Select the relevant block elements directly within the message bubble
      const relevantBlocks = assistantContainer.querySelectorAll(selectors.assistantRelevantBlocks);
      const processedElements = new Set(); // Keep track of processed elements

      relevantBlocks.forEach((block, index) => {
          // Skip if this element was already processed as part of a larger block
          if (processedElements.has(block)) return;

          const tagNameLower = block.tagName.toLowerCase();
          console.log(`[Grok Extractor v7] Processing Block #${index}: <${tagNameLower}>`);
          let item = null; // To hold the result of processing functions

          // --- Process based on block type ---

          // Check Image Grid First
          if (block.matches(selectors.assistantImageGrid)) {
              console.log("  -> Handling as Top-Level Image Grid");
              const imageItems = processAssistantImageGrid(block);
              contentItems.push(...imageItems); // Add extracted image items
              processedElements.add(block);
              block.querySelectorAll('*').forEach(child => processedElements.add(child));
          }
          // Check for Code Block Outer Container
          else if (block.matches(selectors.assistantCodeBlockOuterContainer)) {
              console.log("  -> Handling as Top-Level Code Block");
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
                   console.log("  -> 'div.not-prose' found, but no inner code container. Skipping as code block.");
              }
              processedElements.add(block);
              block.querySelectorAll('*').forEach(child => processedElements.add(child));
          }
          // NEW IN v7: Handle Tables
          else if (tagNameLower === 'div' && block.classList.contains('overflow-x-auto')) {
              console.log("  -> Handling as Table Container");
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
                  console.log("  -> div.overflow-x-auto found, but no table inside. Skipping.");
              }
          }
          // Handle Lists (using processList which uses processChildNodes -> processNode that now handles nested blocks)
          else if (tagNameLower === 'ul' || tagNameLower === 'ol') {
              console.log(`  -> Handling as ${tagNameLower.toUpperCase()} List`);
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
              console.log(`  -> Handling as ${tagNameLower.toUpperCase()}`);
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

      console.log("[Grok Extractor v7] Final assistant contentItems:", JSON.stringify(contentItems, null, 2));
      return contentItems; // Return the array of extracted content items
    }, // End extractAssistantContent

  }; // End grokConfig

  // Assign the configuration to the window object
  window.grokConfig = grokConfig;
  console.log("grokConfig.js initialized (v" + grokConfig.version + ")");

})(); // End of IIFE
// --- END OF UPDATED FILE grokConfigs.js ---