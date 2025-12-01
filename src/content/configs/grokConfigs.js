// --- Updated grokConfigs.js (v24 - Use $...$ for inline math) ---

/**
 * Configuration for extracting Q&A data from Grok (grok.com)
 * Version: 24 (Use $...$ for inline math)
 */
(function() {
  // Initialization check
  if (window.grokConfig && window.grokConfig.version >= 24) { // Updated version check
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
           element.tagName.toLowerCase() === 'blockquote' || // Skip blockquotes (handled by processBlockquote)
           (element.tagName.toLowerCase() === 'span' && element.classList.contains('katex-html')); // Skip KaTeX HTML rendering (we use LaTeX source)
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

    // Calculate indent based on level - 3 spaces per level
    let indent = '';
    let bqPrefix = '';
    
    if (isWithinBlockquote) {
      // Determine if we're in a complex nested structure (like ordered list > blockquote > list)
      // by checking the parent structure
      const parentList = el.closest('ol');
      const isComplexNesting = parentList && parentList.closest('blockquote');
      
      if (isComplexNesting && blockquoteLevel >= 2) {
        // Complex nesting pattern like html_1.md
        if (blockquoteLevel === 2) {
          bqPrefix = '>      > '; // 6 spaces between > markers
          indent = level > 0 ? '   '.repeat(level) : '';
        } else if (blockquoteLevel === 3) {
          bqPrefix = '>      >     > '; // 6 spaces, then 5 spaces
          indent = level > 0 ? '   '.repeat(level) : '';
        } else if (blockquoteLevel === 4) {
          bqPrefix = '>      >     >     > '; // Pattern continues
          indent = level > 0 ? '   '.repeat(level) : '';
        } else if (blockquoteLevel === 5) {
          bqPrefix = '>      >     >     >     > ';
          indent = level > 0 ? '   '.repeat(level) : '';
        } else {
          // For even deeper levels
          let fullPrefix = '> ';
          for (let i = 1; i < blockquoteLevel; i++) {
            if (i === 1) {
              fullPrefix += '     > '; // 6 spaces after first >
            } else {
              fullPrefix += '    > '; // 5 spaces for subsequent levels
            }
          }
          bqPrefix = fullPrefix;
          indent = level > 0 ? '   '.repeat(level) : '';
        }
      } else {
        // Simple blockquote nesting
        if (blockquoteLevel === 1) {
          bqPrefix = '> ';
          indent = level > 0 ? '   '.repeat(level) : '';
        } else if (blockquoteLevel === 2) {
          bqPrefix = '> > ';
          indent = level > 0 ? '   '.repeat(level) : '';
        } else if (blockquoteLevel === 3) {
          bqPrefix = '> > > ';
          indent = level > 0 ? '   '.repeat(level) : '';
        } else {
          bqPrefix = '> '.repeat(blockquoteLevel);
          indent = level > 0 ? '   '.repeat(level) : '';
        }
      }
    } else {
      // Normal list indentation when not in blockquote
      // Use 2 spaces per level to match standard markdown conventions
      indent = '  '.repeat(level);
    }

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
      
      // 6. Replace code blocks in the clone with placeholders to preserve ordering
      const codeBlocksInClone = liClone.querySelectorAll(':scope > div.not-prose');
      codeBlockElements.forEach((codeBlock, index) => {
        const codeBlockInClone = codeBlocksInClone[index];
        if (codeBlockInClone) {
          const placeholderText = `[[CODE_BLOCK_${index}]]`;
          const textNodeFactory = liClone.ownerDocument || document;
          const placeholderNode = textNodeFactory.createTextNode(placeholderText);
          codeBlockInClone.parentNode.replaceChild(placeholderNode, codeBlockInClone);
        }
      });
      
      // 7. Process the clean clone to get the item's direct content
      const itemMarkdown = processChildNodes(liClone);
      const trimmedItemMarkdown = itemMarkdown.trim();

      if (trimmedItemMarkdown || nestedListElements.length > 0 || blockquoteElements.length > 0 || codeBlockElements.length > 0) {
        // 8. Calculate marker - use appropriate markers based on context
        let marker;
        if (listType === 'ul') {
          // Use '*' for lists inside complex nested blockquotes with wide spacing
          const hasWideSpacing = bqPrefix.includes('     >'); // 5+ spaces indicates complex nesting
          if (hasWideSpacing && level === 0) {
            marker = '*';
          } else {
            marker = '-';
          }
        } else {
          marker = `${startNum + itemIndex}.`;
        }
        
        const markerLength = marker.length + 1; // +1 for the space after marker
        const continuationIndent = ' '.repeat(markerLength); // Indent for continuation lines
        const itemLines = [];
        let markerAdded = false;

        const ensureMarkerLine = () => {
          if (!markerAdded) {
            itemLines.push(`${bqPrefix}${indent}${marker}`);
            markerAdded = true;
          }
        };

        const addTextBlock = (textBlock) => {
          if (!textBlock) return;
          const lines = textBlock.split('\n').filter(line => line.trim());
          lines.forEach(line => {
            if (!markerAdded) {
              itemLines.push(`${bqPrefix}${indent}${marker} ${line}`);
              markerAdded = true;
            } else {
              itemLines.push(`${bqPrefix}${indent}${continuationIndent}${line}`);
            }
          });
        };

        const addCodeBlock = (codeIndex) => {
          const codeBlock = codeBlockElements[codeIndex];
          if (!codeBlock) return;
          const innerCodeContainer = codeBlock.querySelector(window.grokConfig.selectors.assistantCodeBlockInnerContainer);
          if (!innerCodeContainer) return;
          const codeItem = processCodeBlock(innerCodeContainer);
          if (!codeItem) return;

          if (!markerAdded) {
            itemLines.push(`${bqPrefix}${indent}${marker}`);
            markerAdded = true;
          }
          
          const nestedIndent = '   '.repeat(level + 1); // 3 spaces per level
          let codeIndent;
          
          if (isWithinBlockquote) {
            // Add 3-space indentation for code blocks in list items within blockquotes
            codeIndent = `${bqPrefix}   ${nestedIndent}`;
          } else {
            codeIndent = nestedIndent;
          }
          
          const lang = codeItem.language || '';
          
          // Add opening fence with correct indentation
          itemLines.push(`${codeIndent}\`\`\`${lang}`);
          
          // Add each line of code with correct indentation
          codeItem.content.split('\n').forEach(line => {
            itemLines.push(`${codeIndent}${line}`);
          });
          
          // Add closing fence with correct indentation
          itemLines.push(`${codeIndent}\`\`\``);
        };

        // 9. Reconstruct list item content in DOM order using placeholders
        const placeholderRegex = /\[\[CODE_BLOCK_(\d+)\]\]/g;
        let lastIndex = 0;
        let match;
        let hasOrderedParts = false;

        while ((match = placeholderRegex.exec(trimmedItemMarkdown)) !== null) {
          const textSegment = trimmedItemMarkdown.slice(lastIndex, match.index).trim();
          if (textSegment) {
            addTextBlock(textSegment);
            hasOrderedParts = true;
          }
          addCodeBlock(parseInt(match[1], 10));
          hasOrderedParts = true;
          lastIndex = placeholderRegex.lastIndex;
        }

        const trailingText = trimmedItemMarkdown.slice(lastIndex).trim();
        if (trailingText) {
          addTextBlock(trailingText);
          hasOrderedParts = true;
        }

        // If there were no placeholders/text segments but we still have text, add it
        if (!hasOrderedParts && trimmedItemMarkdown) {
          addTextBlock(trimmedItemMarkdown);
        }
        
        // 11. Process nested lists recursively
        nestedListElements.forEach(nestedList => {
          const nestedListType = nestedList.tagName.toLowerCase();
          const nestedResult = processList(nestedList, nestedListType, level + 1, isWithinBlockquote, blockquoteLevel);
          if (nestedResult) {
            ensureMarkerLine();
            nestedResult.content.split('\n').forEach(nestedLine => {
              itemLines.push(nestedLine);
            });
          }
        });
        
        // 12. Process blockquotes
        blockquoteElements.forEach(blockquote => {
          const bqContent = processBlockquote(blockquote, isWithinBlockquote ? blockquoteLevel : 0);
          if (bqContent) {
            ensureMarkerLine();
            // For blockquotes inside list items, apply parent list's indentation
            const nestedIndent = '   '.repeat(level + 1); // 3 spaces per level
            
            // Split content into lines and apply proper indentation
            const lines = bqContent.split('\n');
            lines.forEach(line => {
              if (line.trim()) {
                // If we're already in a blockquote, only add 3-space indentation for nested code blocks
                // Regular blockquote content should not get extra indentation
                if (isWithinBlockquote) {
                  itemLines.push(line);
                } else {
                  // Otherwise, add the parent list's indentation before the blockquote marker
                  itemLines.push(`${nestedIndent}${line}`);
                }
              }
            });
          }
        });
        
        // Commit all lines for this list item
        itemLines.forEach(line => processedItems.push(line));

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
   * Handles multiple code block structures:
   * 1. Original: div.relative > div.flex > span.font-mono + div[style] > code
   * 2. New (@container/code-block): div.relative > div.border > div.flex > span.font-mono + div.shiki > pre > code
   * @param {HTMLElement} innerEl - The inner container element (`div.relative`).
   * @returns {object|null} - A structured code_block object { type: 'code_block', ... } or null.
   */
  function processCodeBlock(innerEl) {
    const selectors = window.grokConfig.selectors;
    
    // Try original selectors first
    let langElement = innerEl.querySelector(selectors.assistantCodeBlockLang);
    let codeElement = innerEl.querySelector(selectors.assistantCodeBlockContent);
    
    // If not found, try alternative selectors for new structure (@container/code-block)
    if (!codeElement) {
      // New structure: div.border > div.shiki > pre > code
      codeElement = innerEl.querySelector('pre > code') || innerEl.querySelector('code');
    }
    
    if (!langElement) {
      // New structure: div.border > div.flex > span.font-mono.text-xs
      langElement = innerEl.querySelector('span.font-mono.text-xs');
    }

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
      const viewerLabel = gridEl.closest('[data-testid="image-viewer"]')?.getAttribute('aria-label')?.trim();
      gridEl.querySelectorAll(selectors.assistantImageElement).forEach(imgElement => {
          const src = imgElement.getAttribute('src');
          if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
              try {
                  const absoluteSrc = new URL(src, window.location.origin).href;
                  const altText = imgElement.getAttribute('alt')?.trim() || viewerLabel || "Image";
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
   * Processes a table element and converts it to Markdown format (added in v7).
   * @param {HTMLElement} tableElement - The table element or its container.
   * @returns {string|null} - Markdown representation of the table or null if invalid.
   */
  function processTableToMarkdown(tableElement) {
      // If we were passed a container div, find the table inside it
      const table = tableElement.tagName.toLowerCase() === 'table' 
          ? tableElement 
          : tableElement.querySelector('table');
      
      if (!table) {
                      console.warn("[Grok Extractor v10] No table found in element:", tableElement);
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
                      console.warn("[Grok Extractor v10] Could not determine column count for table:", table);
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
   * Processes a list item within a blockquote context, maintaining proper formatting
   * @param {HTMLElement} liElement - The list item element
   * @param {number} blockquoteLevel - The blockquote nesting level
   * @returns {object|null} - Object with title and content array, or null
   */
  function processListItemInBlockquote(liElement, blockquoteLevel) {
    const prefix = '> '.repeat(blockquoteLevel);
    
    // Extract the direct text content (title) from the li element
    let title = '';
    const contentLines = [];
    
    // Process all child nodes to separate direct text from nested structures
    Array.from(liElement.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) {
          title += text;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        
        // Direct text elements (like <p>, <strong>) contribute to title
        if (['p', 'strong', 'b', 'em', 'i', 'span'].includes(tagName)) {
          const textContent = node.textContent.trim();
          if (textContent) {
            title += textContent;
          }
        }
        // Nested structures (lists, blockquotes, code blocks) go to content
        else if (tagName === 'ul' || tagName === 'ol') {
          // Add empty line before nested list
          contentLines.push(`${prefix}`);
          
          // Process nested list with proper indentation
          const nestedListResult = processList(node, tagName, 1, true, blockquoteLevel);
          if (nestedListResult) {
            nestedListResult.content.split('\n').forEach(line => {
              contentLines.push(line);
            });
          }
        }
        else if (tagName === 'blockquote') {
          // Add empty line before nested blockquote
          contentLines.push(`${prefix}`);
          
          // Process nested blockquote
          const nestedBlockquoteContent = processBlockquote(node, blockquoteLevel);
          if (nestedBlockquoteContent) {
            nestedBlockquoteContent.split('\n').forEach(line => {
              contentLines.push(line);
            });
          }
        }
        else if (node.matches(window.grokConfig.selectors.assistantCodeBlockOuterContainer)) {
          // Add empty line before code block
          contentLines.push(`${prefix}`);
          
          // Process code block
          const innerCodeContainer = node.querySelector(window.grokConfig.selectors.assistantCodeBlockInnerContainer);
          if (innerCodeContainer) {
            const codeItem = processCodeBlock(innerCodeContainer);
            if (codeItem) {
              const lang = codeItem.language || '';
              
              contentLines.push(`${prefix}\`\`\`${lang}`);
              codeItem.content.split('\n').forEach(line => {
                contentLines.push(`${prefix}${line}`);
              });
              contentLines.push(`${prefix}\`\`\``);
            }
          }
        }
      }
    });
    
    return title.trim() ? { 
      title: title.trim(), // Keep the title as-is, including bold markers
      content: contentLines.length > 0 ? contentLines : null 
    } : null;
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
          // Only add non-empty text nodes
          resultLines.push(`${prefix}${text}`);
          previousWasBlock = false;
          previousWasNestedBlockquote = false;
        }
      }
      
      // Handle element nodes
      else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        
        // Handle headings - convert to Markdown style headings
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          // Extract the heading level number from the tag
          const level = parseInt(tagName.substring(1));
          const hashes = '#'.repeat(level);
          
          // Extract content without formatting as markdown
          const headingText = node.textContent.trim();
          
          // Format as Markdown heading
          resultLines.push(`${prefix}${hashes} ${headingText}`);
          
          previousWasBlock = false;
          previousWasNestedBlockquote = false;
        }
        
        // Handle paragraphs
        else if (tagName === 'p') {
          // Convert paragraph content to markdown
          const content = processNode(node);
          
          if (content) {
            content.split('\n').forEach(line => {
              resultLines.push(`${prefix}${line}`);
            });
            previousWasBlock = false;
            previousWasNestedBlockquote = false;
          }
        }
        
        // Handle code blocks (div.not-prose elements)
        else if (node.matches(window.grokConfig.selectors.assistantCodeBlockOuterContainer)) {
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
              
              previousWasBlock = false;
              previousWasNestedBlockquote = false;
            }
          }
        }
        
        // Handle nested blockquotes
        else if (tagName === 'blockquote') {
          const nestedContent = processBlockquote(node, nestLevel + 1);
          if (nestedContent) {
            resultLines.push(nestedContent);
            previousWasBlock = false;
            previousWasNestedBlockquote = false;
          }
        }
        
        // Handle ordered lists (ol) - process each child element sequentially
        else if (tagName === 'ol') {

          // For ordered lists in blockquotes, we need to process each child element in order
          // This includes both <li> elements and any code blocks that appear between them
          let listItemNumber = 1;
          let hasProcessedAnyItems = false;
          
          Array.from(node.childNodes).forEach(childNode => {
            if (childNode.nodeType === Node.ELEMENT_NODE) {
              const childTagName = childNode.tagName.toLowerCase();
              
              if (childTagName === 'li') {
                // Process the list item with correct numbering and blockquote context
                // We need to handle nested structures within the list item
                const processedLiContent = processListItemInBlockquote(childNode, nestLevel + 1);
                if (processedLiContent) {
                  // Check if we're in a complex nested structure
                  const isComplexStructure = element.closest('ol') && nestLevel >= 1;
                  
                  if (isComplexStructure) {
                    // For complex structures, format differently
                    resultLines.push(`${prefix}   ${listItemNumber}. ${processedLiContent.title}`);
                  } else {
                    // Add the numbered list item with bold
                    resultLines.push(`${prefix}${listItemNumber}. **${processedLiContent.title}**`);
                  }
                  
                  // Add any nested content with proper indentation
                  if (processedLiContent.content) {
                    processedLiContent.content.forEach(line => {
                      resultLines.push(line);
                    });
                  }
                  
                  listItemNumber++;
                  hasProcessedAnyItems = true;
                }
              }
              // Handle code blocks that appear as direct children of <ol> (between <li> elements)
              else if (childNode.matches(window.grokConfig.selectors.assistantCodeBlockOuterContainer)) {
                const innerCodeContainer = childNode.querySelector(window.grokConfig.selectors.assistantCodeBlockInnerContainer);
                if (innerCodeContainer) {
                  const codeItem = processCodeBlock(innerCodeContainer);
                  if (codeItem) {
                    const lang = codeItem.language || '';
                    

                    
                    // Add code block with proper blockquote formatting
                    resultLines.push(`${prefix}\`\`\`${lang}`);
                    
                    const codeLines = codeItem.content.split('\n');
                    codeLines.forEach(line => {
                      resultLines.push(`${prefix}${line}`);
                    });
                    
                    resultLines.push(`${prefix}\`\`\``);
                  }
                }
              }
            }
          });
          
          previousWasBlock = false;
        }
        
        // Handle unordered lists
        else if (tagName === 'ul') {

          // Process the list: start at level 0 within the blockquote context,
          // pass isWithinBlockquote=true, and the correct blockquoteLevel.
          const listResult = processList(node, tagName, 0, true, nestLevel + 1);
          if (listResult) {
            // processList already handles the blockquote prefixes correctly
            // Just split and add the lines
            const lines = listResult.content.split('\n');
            lines.forEach((line, idx) => {
              if (line.trim()) {
                resultLines.push(line);
              } else if (idx < lines.length - 1) {
                // Preserve empty lines between list items in complex nesting
                resultLines.push(prefix.trim());
              }
            });
            previousWasBlock = false;
          }
        }
        
        // Handle other elements (like spans, strong, etc.)
        else {
          const inlineContent = processNode(node);
          
          if (inlineContent) {
            inlineContent.split('\n').forEach(line => {
              resultLines.push(`${prefix}${line}`);
            });
            previousWasBlock = false;
            previousWasNestedBlockquote = false;
          }
        }
      }
    });
    
    // Return the result without extra cleanup to match html_1.md format
    return resultLines.join('\n');
  }

  /**
   * Extracts LaTeX source code from KaTeX span elements
   * @param {HTMLElement} katexElement - The span.katex element
   * @returns {string|null} - The LaTeX source code or null if not found
   */
  function extractKaTexSource(katexElement) {
    // Look for the annotation element with LaTeX source
    const annotation = katexElement.querySelector('annotation[encoding="application/x-tex"]');
    if (annotation && annotation.textContent) {
      return annotation.textContent.trim();
    }
    return null;
  }



  /**
   * Processes interactive block (artifact) containers to extract block information
   * @param {HTMLElement} interactiveContainer - The interactive block container element
   * @returns {object|null} - Interactive block content item or null if not found
   */
  function processInteractiveBlock(interactiveContainer) {
    const selectors = window.grokConfig.selectors;
    
    // Extract title from the container
    const titleElement = interactiveContainer.querySelector(selectors.interactiveBlockTitle);
    const title = titleElement ? titleElement.textContent.trim() : null;
    
    // Extract type - it's the second .text-fg-secondary.text-sm element (not the title)
    const typeElements = interactiveContainer.querySelectorAll(selectors.interactiveBlockType);
    let artifactType = null;
    
    // Look for the type element that's not the title
    for (const typeElement of typeElements) {
      const text = typeElement.textContent.trim();
      // Skip if this element contains the title text or if it's empty
      if (text && text !== title) {
        artifactType = text;
        break;
      }
    }
    
    if (!title) {
      console.warn('[Grok Extractor] No title found for interactive block:', interactiveContainer);
      return null;
    }
    
    // Return interactive_block content item
    return {
      type: 'interactive_block',
      title: title,
      artifactType: artifactType || 'Artifact', // Default if type not found
      code: null, // No code content available from HTML
      language: null
    };
  }

  /**
   * Processes chart containers with iframes to extract chart information
   * @param {HTMLElement} chartContainer - The div.py-2 container element
   * @returns {string|null} - Chart markdown representation or null if not found
   */
  function processChartContainer(chartContainer) {
    const selectors = window.grokConfig.selectors;
    const chartFrame = chartContainer.querySelector(selectors.chartFrame);
    
    if (!chartFrame) {
      return null;
    }
    
    const iframe = chartFrame.querySelector(selectors.chartIframe);
    if (!iframe) {
      return null;
    }
    
    const src = iframe.getAttribute('src');
    if (!src || !src.includes('chartjs')) {
      return null;
    }
    
    // Chart configuration inaccessible due to cross-origin iframe restrictions
    return `\`\`\`chartjs\n// Chart configuration unavailable: Cross-origin iframe prevents data extraction\n// Source: ${src}\n\`\`\``;
  }

      /**
     * Recursively processes a DOM node and its children to generate Markdown text.
     * **Updated in v10:** Added KaTeX/LaTeX extraction support.
     * @param {Node} node - The DOM node to process.
     * @returns {string} - The Markdown representation of the node and its children.
     */
  function processNode(node) {
    const selectors = window.grokConfig?.selectors;
    if (!selectors) return ''; // Config must be loaded

    // Handle text nodes
    if (node.nodeType === Node.TEXT_NODE) {
      const textContent = node.textContent || '';
      
      // Check if this text node should preserve line breaks and indentation
      // Look for parent elements with white-space: pre-wrap or whitespace-pre-wrap class
      let shouldPreserveFormatting = false;
      let parent = node.parentElement;
      
      while (parent && !shouldPreserveFormatting) {
        if (parent.classList.contains('whitespace-pre-wrap') ||
            parent.classList.contains('break-words')) {
          shouldPreserveFormatting = true;
        }
        parent = parent.parentElement;
      }
      
      if (shouldPreserveFormatting) {
        // Preserve line breaks and indentation - only convert tabs to spaces
        return textContent.replace(/\t/g, '  ');
      } else {
        // Replace tabs/newlines with a single space, collapse multiple spaces to one
        return textContent.replace(/[\t\n\r]+/g, ' ').replace(/ {2,}/g, ' ');
      }
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
        if (tagName === 'table' || (tagName === 'div' && node.classList.contains('table-container'))) {
            const tableMarkdown = processTableToMarkdown(node);
            // Return ONLY the table content; spacing handled by processChildNodes
            return tableMarkdown || '';
        }
        if (tagName === 'blockquote') {
            const blockquoteContent = processBlockquote(node, 0);
            // Return ONLY the blockquote content; spacing handled by processChildNodes
            return blockquoteContent || '';
        }
        if (tagName === 'hr') {
            // Return horizontal rule as markdown
            return '---';
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
        
        // Handle KaTeX display math containers (katex-display > katex)
        if (tagName === 'span' && node.classList.contains('katex-display')) {
          const katexElement = node.querySelector('.katex');
          if (katexElement) {
            const latexSource = extractKaTexSource(katexElement);
            if (latexSource) {
              return `$$\n${latexSource}\n$$`;
            }
          }
          // If we can't extract LaTeX, fall back to processing children
          return processChildNodes(node);
        }
        
        // Handle KaTeX inline math expressions
        if (tagName === 'span' && node.classList.contains('katex')) {
          // Skip if this katex element is inside a katex-display (already handled above)
          if (node.parentElement && node.parentElement.classList.contains('katex-display')) {
            return '';
          }
          
          const latexSource = extractKaTexSource(node);
          if (latexSource) {
            // Check if this KaTeX is the only significant content in a paragraph
            // If so, treat it as display math
            const parentP = node.closest('p');
            if (parentP) {
              // Get all text content from the paragraph, excluding the KaTeX element
              const paragraphClone = parentP.cloneNode(true);
              const katexElements = paragraphClone.querySelectorAll('.katex');
              katexElements.forEach(el => el.remove());
              const remainingText = paragraphClone.textContent.trim();
              
              // If there's no other significant text, treat as display math
              if (!remainingText) {
                return `$$\n${latexSource}\n$$`;
              }
            }
            
            // Otherwise treat as inline math
            return `$${latexSource}$`;
          }
          // If we can't extract LaTeX, fall back to processing children
          return processChildNodes(node);
        }
        
        let content = processChildNodes(node); // Process children first for inlines

        if (tagName === 'strong' || tagName === 'b') { return `**${content}**`; }
        if (tagName === 'em' || tagName === 'i') { return `*${content}*`; }
        if (tagName === 'del' || tagName === 's' || tagName === 'strike') { return `~~${content}~~`; } // Handle strikethrough
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
    version: 24, // Updated config version - Use $...$ for inline math
    selectors: {
      turnContainer: 'div.relative.group.flex.flex-col.justify-center[class*="items-"]',
      userMessageIndicator: '.items-end',
      assistantMessageIndicator: '.items-start',
      messageBubble: 'div.message-bubble',
      userTextContainer: 'div.message-bubble p.break-words',
      userAttachmentChip: 'div.flex.flex-row.items-center.rounded-xl.bg-chip',
      userAttachmentFilename: 'span.truncate',
      userAttachmentImagePreviewDiv: 'div[style*="background-image"]',
      userAttachmentImageFigure: 'figure',
      userAttachmentImageElement: 'figure img',
      userAttachmentFileIcon: 'figure svg.lucide[role="img"]',
      assistantContentContainer: 'div.response-content-markdown',
      assistantRelevantBlocks: ':scope > :is(p.break-words, h1, h2, h3, h4, h5, h6, ol, ul, div.not-prose, div.grid, div.table-container, div.py-2, blockquote, hr, span.katex-display, div.relative:has(div.table-container))',
      listItem: 'li',
      assistantCodeBlockOuterContainer: 'div.not-prose',
      assistantCodeBlockInnerContainer: ':scope > div.relative, div.not-prose > div.relative',
      assistantCodeBlockLang: ':scope > div.flex > span.font-mono.text-xs',
      assistantCodeBlockContent: ':scope > div[style*="display: block"] > code[style*="white-space: pre"]',
      assistantImageGrid: 'div.grid',
      assistantImageElement: 'img.object-cover.relative',
      inlineCodeSpan: 'span.text-sm.px-1.rounded-sm.\\!font-mono',
      assistantTableContainer: 'div.table-container',
      assistantTable: 'table',
      blockquoteContainer: 'blockquote',
      katexContainer: 'span.katex',
      katexMathML: 'span.katex-mathml',
      katexHTML: 'span.katex-html',
      katexDisplayContainer: 'span.katex-display',
      chartContainer: 'div.py-2',
      chartFrame: 'div.h-\\[500px\\].bg-surface-l1.rounded-xl.overflow-hidden.border.border-border',
      chartIframe: 'iframe[src*="artifacts.grokusercontent.com"]',
      imageCaption: null,
      interactiveBlockContainer: 'div.flex.cursor-pointer.rounded-2xl[id^="artifact_card_"]',
      interactiveBlockTitle: '.font-medium.text-sm',
      interactiveBlockType: '.text-fg-secondary.text-sm',
      assistantImageViewer: '[data-testid=\"image-viewer\"]',
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

      // First try to find the response-content-markdown container
      const contentContainer = userBubble.querySelector('div.response-content-markdown');
      const targetContainer = contentContainer || userBubble;

      // Process ALL child nodes of the target container using the existing recursive node processor.
      // This handles various structures (multiple <p>, <div>, text nodes, etc.) within the user message.
      const fullText = processChildNodes(targetContainer).trim();

      // console.log("[Grok Extractor] Extracted user text (processed container):", fullText || "null");
      return fullText || null; // Return null if the result is an empty string
    },
    /**
     * Extracts user uploaded images from attachment chips in a user turn.
     * Handles two different HTML structures:
     * 1. Legacy: div[style*="background-image"] with span.truncate for filename
     * 2. New: figure > img with src attribute
     * @param {HTMLElement} turnElement - The user turn container element.
     * @returns {Array<object>} - An array of image objects.
     */
    extractUserUploadedImages: (turnElement) => {
      const images = [];
      const selectors = grokConfig.selectors;
      
      turnElement.querySelectorAll(selectors.userAttachmentChip).forEach(chip => {
        // Try new structure first: figure > img
        const imgElement = chip.querySelector(selectors.userAttachmentImageElement);
        if (imgElement) {
          const src = imgElement.getAttribute('src');
          if (src && src.includes('assets.grok.com')) {
            const fullUrl = getFullImageUrlFromPreview(src);
            if (fullUrl) {
              images.push({
                type: 'image',
                sourceUrl: fullUrl,
                isPreviewOnly: true,
                extractedContent: 'User Uploaded Image'
              });
            }
          }
          return; // Skip legacy check if figure/img found
        }
        
        // Fallback to legacy structure: div[style*="background-image"]
        const imgPreviewDiv = chip.querySelector(selectors.userAttachmentImagePreviewDiv);
        const filenameElement = chip.querySelector(selectors.userAttachmentFilename);
        if (imgPreviewDiv && filenameElement) {
          const filename = filenameElement.textContent?.trim();
          const style = imgPreviewDiv.getAttribute('style');
          const match = style?.match(/url\("?([^")]+)"?\)/);
          const previewUrl = match ? match[1] : null;
          if (filename && previewUrl) {
            const fullUrl = getFullImageUrlFromPreview(previewUrl);
            if (fullUrl) {
              images.push({
                type: 'image',
                sourceUrl: fullUrl,
                isPreviewOnly: true,
                extractedContent: filename
              });
            }
          }
        }
      });
      
      return images;
    },
    extractUserUploadedFiles: (turnElement) => { /* ... unchanged ... */ const files = []; const selectors = grokConfig.selectors; turnElement.querySelectorAll(selectors.userAttachmentChip).forEach(chip => { const fileIcon = chip.querySelector(selectors.userAttachmentFileIcon); const filenameElement = chip.querySelector(selectors.userAttachmentFilename); if (fileIcon && filenameElement && !chip.querySelector(selectors.userAttachmentImagePreviewDiv)) { const fileName = filenameElement.textContent?.trim(); if (fileName) { files.push({ type: 'file', fileName: fileName, fileType: 'File', isPreviewOnly: true, extractedContent: null }); } } }); return files; },

          /**
       * Extracts structured content items (text, code, images, lists, tables, blockquotes, interactive blocks) from an assistant's message bubble.
       * Iterates through relevant block-level elements within the bubble and processes them accordingly.
       * **Updated in v11:** Added interactive block/artifact extraction support.
       * @param {HTMLElement} turnElement - The assistant turn container element.
       * @returns {Array<object>} - An array of structured content items.
       */
    extractAssistantContent: (turnElement) => {
      const contentItems = [];
      const selectors = grokConfig.selectors;
      
      // Find the message bubble within the turn element
      const messageBubble = turnElement.querySelector(selectors.messageBubble);
      if (!messageBubble) {
        console.warn("[Grok Extractor] Assistant message bubble not found.");
        return [];
      }
      
      // Process ALL direct children of the message bubble in DOM order
      // This includes both response-content-markdown containers AND interactive block containers
      // Updated to handle the nested structure: message-bubble > div.relative > response-content-markdown
      const hasContentContainer = !!messageBubble.querySelector(selectors.assistantContentContainer);
      const directChildren = Array.from(messageBubble.children);
      const allElements = [];
      const addedElements = new Set();
      const addElement = (element, type, parent) => {
        if (!element || addedElements.has(element)) return;
        allElements.push({ element, type, parent });
        addedElements.add(element);
      };
      const relevantSelector = selectors.assistantRelevantBlocks;
      const nestedRelevantSelector = relevantSelector.replace(/:scope\\s*>\\s*/g, ''); // Allow nested blocks when no content container
      
      directChildren.forEach(child => {
        // Check if this is a response-content-markdown container directly
        if (child.matches(selectors.assistantContentContainer)) {
          // Add all relevant blocks within this content container
          const relevantBlocks = child.querySelectorAll(selectors.assistantRelevantBlocks);
          relevantBlocks.forEach(block => {
            addElement(block, 'content', child);
          });
        }
        // Check if this child contains response-content-markdown containers (nested structure)
        // Use querySelectorAll to find ALL content containers (there may be multiple, e.g., before/after interactive blocks)
        else {
          const contentContainers = child.querySelectorAll(selectors.assistantContentContainer);
          contentContainers.forEach(contentContainer => {
            // Add all relevant blocks within each content container
            const relevantBlocks = contentContainer.querySelectorAll(selectors.assistantRelevantBlocks);
            relevantBlocks.forEach(block => {
              addElement(block, 'content', contentContainer);
            });
          });
          // Check if this child contains interactive blocks (like div.py-1)
          const interactiveBlocks = child.querySelectorAll(selectors.interactiveBlockContainer);
          interactiveBlocks.forEach(block => {
            addElement(block, 'interactive', child);
          });
        }
      });

      // Fallback: capture content blocks directly under the bubble (only when no markdown container was found)
      // Prevents tables nested inside lists from being extracted twice/out of order when a container exists.
      if (!hasContentContainer || allElements.length === 0) {
        const fallbackBlocks = new Set([
          ...messageBubble.querySelectorAll(relevantSelector),
          ...messageBubble.querySelectorAll(nestedRelevantSelector)
        ]);
        fallbackBlocks.forEach(block => addElement(block, 'content', messageBubble));

        const fallbackInteractiveBlocks = messageBubble.querySelectorAll(selectors.interactiveBlockContainer);
        fallbackInteractiveBlocks.forEach(block => addElement(block, 'interactive', messageBubble));
      }
      // Capture standalone image viewers that may sit outside markdown containers
      const imageViewers = messageBubble.querySelectorAll(selectors.assistantImageViewer);
      imageViewers.forEach(viewer => {
        viewer.querySelectorAll(selectors.assistantImageGrid).forEach(grid => addElement(grid, 'content', viewer));
      });
      
      // Sort elements by their DOM position
      allElements.sort((a, b) => {
        const position = a.element.compareDocumentPosition(b.element);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });
      
      // Process elements in correct DOM order
      const processedElements = new Set(); // Keep track of processed elements

      allElements.forEach((elementInfo, index) => {
          const block = elementInfo.element;
          const elementType = elementInfo.type;
          
          // Skip if this element was already processed as part of a larger block
          if (processedElements.has(block)) return;
          
          if (elementType === 'interactive') {
            // Process interactive block
            const interactiveItem = processInteractiveBlock(block);
            if (interactiveItem) {
              contentItems.push(interactiveItem);
            }
            processedElements.add(block);
            block.querySelectorAll('*').forEach(child => processedElements.add(child));
            return; // Skip the rest of the processing for interactive blocks
          }
          
          // Process regular content blocks (elementType === 'content')
          const tagNameLower = block.tagName.toLowerCase();
          // console.log(`[Grok Extractor v12] Processing Block #${index}: <${tagNameLower}>`);
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
          // Check for Code Block or Chart Container (both use div.not-prose)
          else if (block.matches(selectors.assistantCodeBlockOuterContainer)) {
              // Check if it's a chart container first
              const chartContainer = block.querySelector('div.py-2');
              if (chartContainer) {
                  // console.log("  -> Found chart container in div.not-prose");
                  const chartContent = processChartContainer(chartContainer);
                  if (chartContent) {
                      // console.log("  -> Handling as Chart Container");
                      QAClipper.Utils.addTextItem(contentItems, chartContent);
                      processedElements.add(block);
                      block.querySelectorAll('*').forEach(child => processedElements.add(child));
                  } else {
                      // console.log("  -> div.py-2 found but no chart detected, treating as code block");
                      // Try to handle as code block
                      const innerCodeContainer = block.querySelector(selectors.assistantCodeBlockInnerContainer);
                      if (innerCodeContainer) {
                          item = processCodeBlock(innerCodeContainer);
                          if (item) contentItems.push(item);
                      }
                      processedElements.add(block);
                      block.querySelectorAll('*').forEach(child => processedElements.add(child));
                  }
              } else {
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
          }
          // Handle Tables (added in v7)
          else if (tagNameLower === 'div' && block.classList.contains('table-container')) {
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
                  // console.log("  -> div.table-container found, but no table inside. Skipping.");
              }
          }
          // Handle div.relative wrapping table-container (added in v16)
          else if (tagNameLower === 'div' && block.classList.contains('relative')) {
              // Check if there's a table-container inside
              const tableContainer = block.querySelector('div.table-container');
              if (tableContainer) {
                  const tableElement = tableContainer.querySelector('table');
                  if (tableElement) {
                      // Process the table to markdown
                      const tableMarkdown = processTableToMarkdown(tableContainer);
                      if (tableMarkdown) {
                          QAClipper.Utils.addTextItem(contentItems, tableMarkdown);
                      } else {
                          console.warn("  -> Failed to convert table to markdown:", tableElement);
                      }
                      processedElements.add(block);
                      processedElements.add(tableContainer);
                      processedElements.add(tableElement);
                      tableElement.querySelectorAll('*').forEach(child => processedElements.add(child));
                  }
              }
          }
          // Handle Lists (using processList which uses processChildNodes -> processNode that now handles nested blocks)
          else if (tagNameLower === 'ul' || tagNameLower === 'ol') {
              // console.log(`  -> Handling as ${tagNameLower.toUpperCase()} List`);
              item = processList(block, tagNameLower, 0, false, 0); // Start with level 0, not in blockquote
              if (item) {
                  // Add the text item containing the fully formatted list (including nested items/blocks)
                  QAClipper.Utils.addTextItem(contentItems, item.content);
              }
              processedElements.add(block);
              // Mark children as processed because processList->processChildNodes handled them
              block.querySelectorAll('*').forEach(child => processedElements.add(child));
          }
                      // Handle Blockquotes (added complex nesting support in v9, KaTeX support in v10)
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
          // Handle Horizontal Rules (HR tags)
          else if (tagNameLower === 'hr') {
              // console.log(`  -> Handling as Horizontal Rule`);
              QAClipper.Utils.addTextItem(contentItems, '---');
              processedElements.add(block);
          }
          // Handle KaTeX Display Math
          else if (tagNameLower === 'span' && block.classList.contains('katex-display')) {
              // console.log(`  -> Handling as KaTeX Display Math`);
              const katexElement = block.querySelector('.katex');
              if (katexElement) {
                  const latexSource = extractKaTexSource(katexElement);
                  if (latexSource) {
                      QAClipper.Utils.addTextItem(contentItems, `$$\n${latexSource}\n$$`);
                  }
              }
              processedElements.add(block);
              block.querySelectorAll('*').forEach(child => processedElements.add(child));
          }
          // Handle Chart Containers
          else if (tagNameLower === 'div' && block.classList.contains('py-2')) {
              // console.log(`  -> Checking for Chart Container`);
              const chartContent = processChartContainer(block);
              if (chartContent) {
                  // console.log(`  -> Handling as Chart Container`);
                  QAClipper.Utils.addTextItem(contentItems, chartContent);
                  processedElements.add(block);
                  block.querySelectorAll('*').forEach(child => processedElements.add(child));
              } else {
                  // console.log(`  -> div.py-2 found but no chart detected, handling as regular div`);
                  // Handle as regular paragraph/div
                  const markdownContent = processChildNodes(block).trim();
                  if (markdownContent) {
                      QAClipper.Utils.addTextItem(contentItems, markdownContent);
                  }
                  processedElements.add(block);
                  block.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
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
                              console.warn(`[Grok Extractor v12]   -> Skipping unhandled direct block type <${tagNameLower}>`, block);
                processedElements.add(block);
            }
        }); // End forEach loop over allElements

      // console.log("[Grok Extractor v12] Final assistant contentItems:", JSON.stringify(contentItems, null, 2));
      return contentItems; // Return the array of extracted content items
    }, // End extractAssistantContent

  }; // End grokConfig

  // Assign the configuration to the window object
  window.grokConfig = grokConfig;
  // console.log("grokConfig.js initialized (v" + grokConfig.version + ")");

})(); // End of IIFE
// --- END OF UPDATED FILE grokConfigs.js (v24) ---
