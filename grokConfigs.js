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
           element.matches(selectors.assistantCodeBlockInnerContainer) || // Skip inner code div (handled by processCodeBlock)
           element.tagName.toLowerCase() === 'blockquote'; // Skip blockquotes (handled by processBlockquote)
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
   * @param {number} [level=0] - The nesting level (for indentation).
   * @param {boolean} [isWithinBlockquote=false] - Whether the list is within a blockquote.
   * @param {number} [blockquoteLevel=0] - The nesting level of the parent blockquote.
   * @returns {object|null} - A text content item { type: 'text', content: '...' } or null.
   */
  function processList(el, listType, level = 0, isWithinBlockquote = false, blockquoteLevel = 0) {
    let processedItems = []; // Store fully processed list item strings
    let startNum = 1;
    if (listType === 'ol') {
      startNum = parseInt(el.getAttribute('start') || '1', 10);
      if (isNaN(startNum)) startNum = 1;
    }
    let itemIndex = 0;

    // Calculate indent based on level - 2 spaces per level for Grok style
    const indent = '  '.repeat(level);
    // Add blockquote prefix if list is within blockquote
    const bqPrefix = isWithinBlockquote ? '> '.repeat(blockquoteLevel) : '';

    el.querySelectorAll(':scope > li').forEach(li => {
      // 1. Find any nested lists first to handle them separately
      const nestedLists = li.querySelectorAll(':scope > ul, :scope > ol');
      const nestedListElements = Array.from(nestedLists);
      
      // 2. Check for blockquotes to handle them separately too
      const blockquotes = li.querySelectorAll(':scope > blockquote');
      const blockquoteElements = Array.from(blockquotes);
      
      // 3. Find code blocks to handle them separately
      const codeBlocks = li.querySelectorAll(':scope > div.not-prose');
      const codeBlockElements = Array.from(codeBlocks);
      
      // 4. Clone the li to remove nested elements for clean text extraction
      const liClone = li.cloneNode(true);
      
      // 5. Remove nested lists and blockquotes from the clone
      nestedListElements.forEach((nestedList, index) => {
        const selector = `:scope > ${nestedList.tagName.toLowerCase()}`;
        const nestedListInClone = liClone.querySelector(selector);
        if (nestedListInClone) {
          liClone.removeChild(nestedListInClone);
        }
      });
      
      blockquoteElements.forEach((blockquote, index) => {
        const selector = ':scope > blockquote';
        const blockquoteInClone = liClone.querySelector(selector);
        if (blockquoteInClone) {
          liClone.removeChild(blockquoteInClone);
        }
      });
      
      // 6. Remove code blocks from the clone too
      codeBlockElements.forEach((codeBlock, index) => {
        const selector = ':scope > div.not-prose';
        const codeBlockInClone = liClone.querySelector(selector);
        if (codeBlockInClone) {
          liClone.removeChild(codeBlockInClone);
        }
      });
      
      // 7. Process the clean clone to get the item's direct content
      const itemMarkdown = processChildNodes(liClone);
      const trimmedItemMarkdown = itemMarkdown.trim();

      if (trimmedItemMarkdown || nestedListElements.length > 0 || blockquoteElements.length > 0 || codeBlockElements.length > 0) {
        // 8. Calculate marker
        const marker = listType === 'ul' ? '-' : `${startNum + itemIndex}.`;
        
        // 9. Assemble the line with blockquote prefix if needed
        let line = `${bqPrefix}${indent}${marker} ${trimmedItemMarkdown}`;

        // 10. Add the assembled line to our results
        processedItems.push(line);
        
        // 11. Process nested lists recursively
        nestedListElements.forEach(nestedList => {
          const nestedListType = nestedList.tagName.toLowerCase();
          const nestedResult = processList(nestedList, nestedListType, level + 1, isWithinBlockquote, blockquoteLevel);
          if (nestedResult) {
            nestedResult.content.split('\n').forEach(nestedLine => {
              processedItems.push(nestedLine);
            });
          }
        });
        
        // 12. Process blockquotes
        blockquoteElements.forEach(blockquote => {
          const bqContent = processBlockquote(blockquote, isWithinBlockquote ? blockquoteLevel : 0);
          if (bqContent) {
            // Calculate indentation for nested blockquotes
            const nestedIndent = '  '.repeat(level + 1);
            const indentedBqContent = bqContent.split('\n').map(line => {
              // If already within a blockquote, don't change the prefix, just add indentation
              if (isWithinBlockquote) {
                return line;
              }
              // Otherwise, indent the blockquote content relative to the list
              return `${nestedIndent}${line}`;
            }).join('\n');
            
            processedItems.push(indentedBqContent);
          }
        });
        
        // 13. Process code blocks nested within list items
        codeBlockElements.forEach(codeBlock => {
          const innerCodeContainer = codeBlock.querySelector(window.grokConfig.selectors.assistantCodeBlockInnerContainer);
          if (innerCodeContainer) {
            const codeItem = processCodeBlock(innerCodeContainer);
            if (codeItem) {
              const lang = codeItem.language || '';
              
              // Calculate indentation for nested code blocks
              const nestedIndent = '  '.repeat(level + 1);
              
              // Format the code with proper list indentation and blockquote prefix if needed
              const codeLines = codeItem.content.split('\n');
              const codeIndent = isWithinBlockquote ? `${bqPrefix}${nestedIndent}` : nestedIndent;
              
              // Add opening fence with correct indentation
              processedItems.push(`${codeIndent}\`\`\`${lang}`);
              
              // Add each line of code with correct indentation
              codeLines.forEach(line => {
                processedItems.push(`${codeIndent}${line}`);
              });
              
              // Add closing fence with correct indentation
              processedItems.push(`${codeIndent}\`\`\``);
            }
          }
        });

        if (listType === 'ol') itemIndex++;
      }
    });

    // Join all processed items with a single newline
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
   * Processes blockquote elements and their child elements
   * @param {HTMLElement} element - The blockquote element
   * @param {number} nestLevel - The nesting level of the blockquote (0 for top level)
   * @returns {string} - Formatted blockquote content with correct '>' prefixes
   */
  function processBlockquote(element, nestLevel = 0) {
    // Create the proper prefix based on nesting level
    const prefix = '> '.repeat(nestLevel + 1);
    
    // Initialize the result array to store all processed content lines
    const resultLines = [];
    
    // Process all child nodes in order to maintain structure
    const childNodes = Array.from(element.childNodes);
    
    // Track if we need to add extra line spacing
    let previousWasBlock = false;
    let previousWasNestedBlockquote = false;
    
    childNodes.forEach(node => {
      // Handle text nodes (including whitespace)
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) {
          // If the previous element was a nested blockquote, add an empty line with just the blockquote prefix
          if (previousWasNestedBlockquote) {
            resultLines.push(`${prefix}`);
            previousWasNestedBlockquote = false;
          }
          
          // Only add non-empty text nodes
          resultLines.push(`${prefix}${text}`);
          previousWasBlock = false;
        }
      }
      
      // Handle element nodes
      else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        
        // Handle headings - convert to Markdown style headings
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          // Add a blank line before headings if needed
          if (resultLines.length > 0 && !previousWasBlock) {
            resultLines.push(`${prefix}`);
          }
          
          // Reset the nested blockquote flag
          previousWasNestedBlockquote = false;
          
          // Extract the heading level number from the tag
          const level = parseInt(tagName.substring(1));
          const hashes = '#'.repeat(level);
          
          // Extract content without formatting as markdown
          const headingText = node.textContent.trim();
          
          // Format as Markdown heading
          resultLines.push(`${prefix}${hashes} ${headingText}`);
          
          // Add a blank line after the heading
          resultLines.push(`${prefix}`);
          previousWasBlock = true;
        }
        
        // Handle paragraphs
        else if (tagName === 'p') {
          // If the previous element was a nested blockquote, add an empty line with just the blockquote prefix
          if (previousWasNestedBlockquote) {
            resultLines.push(`${prefix}`);
            previousWasNestedBlockquote = false;
          }
          
          // Add a blank line before paragraphs if needed
          if (resultLines.length > 0 && !previousWasBlock) {
            resultLines.push(`${prefix}`);
          }
          
          // Convert paragraph content to markdown
          const content = processNode(node);
          
          if (content) {
            content.split('\n').forEach(line => {
              resultLines.push(`${prefix}${line}`);
            });
            
            // Add a blank line after paragraphs
            resultLines.push(`${prefix}`);
            previousWasBlock = true;
          }
        }
        
        // Handle code blocks (div.not-prose elements)
        else if (node.matches(window.grokConfig.selectors.assistantCodeBlockOuterContainer)) {
          // Add spacing before code block if needed
          if (resultLines.length > 0 && !previousWasBlock) {
            resultLines.push(`${prefix}`);
          }
          
          const innerCodeContainer = node.querySelector(window.grokConfig.selectors.assistantCodeBlockInnerContainer);
          if (innerCodeContainer) {
            const codeItem = processCodeBlock(innerCodeContainer);
            if (codeItem) {
              const lang = codeItem.language || '';
              
              // Add proper blockquote formatting to each line of the code block
              resultLines.push(`${prefix}\`\`\`${lang}`);
              
              const codeLines = codeItem.content.split('\n');
              codeLines.forEach(line => {
                resultLines.push(`${prefix}${line}`);
              });
              
              resultLines.push(`${prefix}\`\`\``);
              
              // Add a blank line after the code block
              resultLines.push(`${prefix}`);
              previousWasBlock = true;
            }
          }
        }
        
        // Handle nested blockquotes
        else if (tagName === 'blockquote') {
          // Add spacing before nested blockquote if needed
          if (resultLines.length > 0 && !previousWasBlock) {
            resultLines.push(`${prefix}`);
          }
          
          const nestedContent = processBlockquote(node, nestLevel + 1);
          if (nestedContent) {
            resultLines.push(nestedContent);
            previousWasBlock = true;
            previousWasNestedBlockquote = true;
          }
        }
        
        // Handle lists
        else if (tagName === 'ul' || tagName === 'ol') {
          // If the previous element was a nested blockquote, add an empty line with just the blockquote prefix
          if (previousWasNestedBlockquote) {
            resultLines.push(`${prefix}`);
            previousWasNestedBlockquote = false;
          }

          // Add spacing before list if needed
          if (resultLines.length > 0 && !previousWasBlock) {
            resultLines.push(`${prefix}`);
          }

          // Process the list: start at level 0 within the blockquote context,
          // pass isWithinBlockquote=true, and the correct blockquoteLevel.
          const listResult = processList(node, tagName, 0, true, nestLevel + 1);
          if (listResult) {
            // listResult.content already includes the content
            resultLines.push(listResult.content);
            previousWasBlock = false;
          }
        }
        
        // Handle other elements (like spans, strong, etc.)
        else if (previousWasNestedBlockquote) {
          resultLines.push(`${prefix}`);
          previousWasNestedBlockquote = false;
          
          const inlineContent = processNode(node);
          
          if (inlineContent) {
            inlineContent.split('\n').forEach(line => {
              resultLines.push(`${prefix}${line}`);
            });
            previousWasBlock = false;
          }
        }
        
        else {
          const inlineContent = processNode(node);
          
          if (inlineContent) {
            inlineContent.split('\n').forEach(line => {
              resultLines.push(`${prefix}${line}`);
            });
            previousWasBlock = false;
          }
        }
      }
    });
    
    // Clean up redundant blank lines
    const cleanedLines = [];
    for (let i = 0; i < resultLines.length; i++) {
      const line = resultLines[i];
      const isBlankLine = line.trim() === prefix.trim();
      
      // Skip consecutive blank lines
      if (isBlankLine && i > 0 && resultLines[i-1].trim() === prefix.trim()) {
        continue;
      }
      
      cleanedLines.push(line);
    }
    
    // Remove trailing blank line if exists
    if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length-1].trim() === prefix.trim()) {
      cleanedLines.pop();
    }
    
    return cleanedLines.join('\n');
  }

  /**
   * Recursively processes a DOM node and its children to generate Markdown text.
   * **Updated in v7:** Also handles table elements and blockquotes.
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
        if (tagName === 'blockquote') {
            const blockquoteContent = processBlockquote(node, 0);
            // Return ONLY the blockquote content; spacing handled by processChildNodes
            return blockquoteContent || '';
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
      assistantRelevantBlocks: ':scope > :is(p, h1, h2, h3, h4, h5, h6, ol, ul, div.not-prose, div.grid, div.overflow-x-auto, blockquote)',
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
      blockquoteContainer: 'blockquote',
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
     * Extracts structured content items (text, code, images, lists, tables, blockquotes) from an assistant's message bubble.
     * Iterates through relevant block-level elements within the bubble and processes them accordingly.
     * **Updated in v7:** Added blockquote handling.
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
          // NEW IN v7: Handle Blockquotes
          else if (tagNameLower === 'blockquote') {
              // console.log(`  -> Handling as Blockquote`);
              const blockquoteContent = processBlockquote(block, 0);
              if (blockquoteContent) {
                  QAClipper.Utils.addTextItem(contentItems, blockquoteContent);
              }
              processedElements.add(block);
              // Mark children as processed because processBlockquote handled them
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