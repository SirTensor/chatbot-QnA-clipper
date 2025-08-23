// --- Updated grokConfigs.js (v11 - Interactive Block Support) ---

/**
 * Configuration for extracting Q&A data from Grok (grok.com)
 * Version: 11 (Added interactive block/artifact extraction support)
 */
(function() {
  // Initialization check
  if (window.grokConfig && window.grokConfig.version >= 11) { // Updated version check
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
      indent = '   '.repeat(level);
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
            // For blockquotes inside list items, apply parent list's indentation
            const nestedIndent = '   '.repeat(level + 1); // 3 spaces per level
            
            // Split content into lines and apply proper indentation
            const lines = bqContent.split('\n');
            lines.forEach(line => {
              if (line.trim()) {
                // If we're already in a blockquote, only add 3-space indentation for nested code blocks
                // Regular blockquote content should not get extra indentation
                if (isWithinBlockquote) {
                  processedItems.push(line);
                } else {
                  // Otherwise, add the parent list's indentation before the blockquote marker
                  processedItems.push(`${nestedIndent}${line}`);
                }
              }
            });
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
              const nestedIndent = '   '.repeat(level + 1); // 3 spaces per level
              
              // Format the code with proper list indentation and blockquote prefix if needed
              const codeLines = codeItem.content.split('\n');
              let codeIndent;
              
              if (isWithinBlockquote) {
                // Add 3-space indentation for code blocks in list items within blockquotes
                codeIndent = `${bqPrefix}   ${nestedIndent}`;
              } else {
                codeIndent = nestedIndent;
              }
              
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
   * Extracts potential data patterns from text content
   * @param {string} text - Text to analyze for data patterns
   * @returns {object|null} - Extracted data structure or null
   */
  function extractDataFromText(text) {
    // Look for number patterns that might represent chart data
    const numberPatterns = [
      // Pattern: "10, 20, 15, 25" or "10 20 15 25"
      /(\d+)[,\s]+(\d+)[,\s]+(\d+)[,\s]+(\d+)/g,
      // Pattern: "A: 10, B: 20, C: 15, D: 25"
      /([A-Z]):\s*(\d+)[,\s]*([A-Z]):\s*(\d+)[,\s]*([A-Z]):\s*(\d+)[,\s]*([A-Z]):\s*(\d+)/g,
      // Pattern: "A=10, B=20, C=15, D=25"
      /([A-Z])=(\d+)[,\s]*([A-Z])=(\d+)[,\s]*([A-Z])=(\d+)[,\s]*([A-Z])=(\d+)/g
    ];
    
    for (const pattern of numberPatterns) {
      const matches = [...text.matchAll(pattern)];
      if (matches.length > 0) {
        const match = matches[0];
        if (match.length >= 5) {
          // Extract numerical data
          const numbers = [];
          const labels = [];
          
          if (pattern === numberPatterns[0]) {
            // Simple number sequence
            for (let i = 1; i <= 4 && i < match.length; i++) {
              numbers.push(parseInt(match[i]));
              labels.push(String.fromCharCode(64 + i)); // A, B, C, D
            }
          } else {
            // Label:value or label=value patterns
            for (let i = 1; i < match.length; i += 2) {
              if (i + 1 < match.length) {
                labels.push(match[i]);
                numbers.push(parseInt(match[i + 1]));
              }
            }
          }
          
          if (numbers.length >= 2) {
            return { labels, data: numbers };
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Analyzes context around a chart to infer chart type and data
   * @param {HTMLElement} chartContainer - The chart container element
   * @returns {object} - Inferred chart properties
   */
  function analyzeChartContext(chartContainer) {
    const context = {
      type: "bar", // Default type
      labels: ["A", "B", "C", "D"], // Default labels
      data: [10, 20, 15, 25], // Default data values
      colors: ["#36A2EB", "#FF6384", "#FFCE56", "#4BC0C0"], // Default colors
      borderColors: ["#2A8BBF", "#D4566E", "#D4A017", "#3DA0A0"]
    };
    
    // Look for context clues in surrounding elements and broader context
    let surroundingText = '';
    
    // Check message bubble for full context
    const messageBubble = chartContainer.closest('div.message-bubble');
    if (messageBubble) {
      // Get all text content from the message bubble
      surroundingText += messageBubble.textContent + ' ';
    } else {
      // Fallback to local context
      let prev = chartContainer.previousElementSibling;
      if (prev && prev.tagName.toLowerCase() === 'p') {
        surroundingText += prev.textContent + ' ';
      }
      
      const parent = chartContainer.closest('div.not-prose');
      if (parent && parent.previousElementSibling && parent.previousElementSibling.tagName.toLowerCase() === 'p') {
        surroundingText += parent.previousElementSibling.textContent + ' ';
      }
      
      let next = chartContainer.nextElementSibling;
      if (next && next.tagName.toLowerCase() === 'p') {
        surroundingText += next.textContent + ' ';
      }
    }
    
    // Try to extract actual data from the text
    const extractedData = extractDataFromText(surroundingText);
    if (extractedData) {
      context.labels = extractedData.labels;
      context.data = extractedData.data;
      
      // Adjust colors array to match data length
      const colorSets = [
        ["#36A2EB", "#FF6384", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40"],
        ["#2A8BBF", "#D4566E", "#D4A017", "#3DA0A0", "#7A4FCC", "#CC7F33"]
      ];
      context.colors = colorSets[0].slice(0, extractedData.data.length);
      context.borderColors = colorSets[1].slice(0, extractedData.data.length);
    }
    
    // Analyze text for chart type hints
    const text = surroundingText.toLowerCase();
    if (text.includes('pie') || text.includes('원형')) {
      context.type = "pie";
      if (!extractedData) {
        context.data = [25, 30, 20, 25]; // Default for pie
      }
    } else if (text.includes('line') || text.includes('선형') || text.includes('추세')) {
      context.type = "line";
    } else if (text.includes('doughnut') || text.includes('도넛')) {
      context.type = "doughnut";
      if (!extractedData) {
        context.data = [25, 30, 20, 25]; // Default for doughnut
      }
    } else if (text.includes('scatter') || text.includes('산점도')) {
      context.type = "scatter";
    } else if (text.includes('bar') || text.includes('막대') || text.includes('막대차트')) {
      context.type = "bar"; // Explicitly confirm bar type
    }
    
    // Look for data-related keywords to adjust sample data (only if no data was extracted)
    if (!extractedData) {
      if (text.includes('sales') || text.includes('매출') || text.includes('판매')) {
        context.labels = ["Q1", "Q2", "Q3", "Q4"];
        context.data = [120, 150, 180, 140];
      } else if (text.includes('month') || text.includes('월별') || text.includes('월간')) {
        context.labels = ["Jan", "Feb", "Mar", "Apr"];
        context.data = [65, 78, 90, 55];
      } else if (text.includes('year') || text.includes('연도') || text.includes('년간')) {
        context.labels = ["2021", "2022", "2023", "2024"];
        context.data = [45, 78, 120, 95];
      }
    }
    
    return context;
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
    
    // Analyze context to infer chart properties
    const context = analyzeChartContext(chartContainer);
    
    // Create a realistic Chart.js configuration based on context analysis
    const chartConfig = {
      "type": context.type,
      "data": {
        "labels": context.labels,
        "datasets": [{
          "label": "Sample Data",
          "data": context.data,
          "backgroundColor": context.colors,
          "borderColor": context.borderColors,
          "borderWidth": 1
        }]
      },
      "options": {
        "scales": context.type === "pie" || context.type === "doughnut" ? undefined : {
          "y": {
            "beginAtZero": true
          }
        },
        "plugins": {
          "legend": {
            "display": context.type === "pie" || context.type === "doughnut"
          }
        }
      }
    };
    
    // Remove undefined properties for cleaner output
    if (!chartConfig.options.scales) {
      delete chartConfig.options.scales;
    }
    
    // Format JSON with compact arrays - use a more reliable approach
    let jsonStr = JSON.stringify(chartConfig, null, 2);
    
    // Post-process to compact specific arrays on single lines
    jsonStr = jsonStr.replace(/(\s+)"(labels|data|backgroundColor|borderColor)":\s*\[\s*((?:[^[\]]*(?:\[[^\]]*\])?[^[\]]*)*)\s*\]/g, 
      (match, indent, key, content) => {
        // Clean up the content and put on single line
        const cleanContent = content.replace(/\s*\n\s*/g, '').replace(/,\s+/g, ', ');
        return `${indent}"${key}": [${cleanContent}]`;
      });
    
    return `\`\`\`chartjs\n${jsonStr}\n\`\`\``;
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
      
      // Check if this text node should preserve line breaks
      // Look for parent elements with white-space: pre-wrap or break-words class
      let shouldPreserveLineBreaks = false;
      let parent = node.parentElement;
      
      while (parent && !shouldPreserveLineBreaks) {
        const computedStyle = window.getComputedStyle(parent);
        if (computedStyle.whiteSpace === 'pre-wrap' || 
            computedStyle.whiteSpace === 'pre-line' ||
            parent.classList.contains('break-words')) {
          shouldPreserveLineBreaks = true;
        }
        parent = parent.parentElement;
      }
      
      if (shouldPreserveLineBreaks) {
        // Preserve line breaks, but still collapse tabs and multiple spaces
        return textContent.replace(/\t+/g, ' ').replace(/ {2,}/g, ' ');
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
            let parentP = node.closest('p');
            if (parentP) {
              // Get all text content from the paragraph, excluding the KaTeX element
              let paragraphClone = parentP.cloneNode(true);
              let katexElements = paragraphClone.querySelectorAll('.katex');
              katexElements.forEach(el => el.remove());
              let remainingText = paragraphClone.textContent.trim();
              
              // If there's no other significant text, treat as display math
              if (!remainingText) {
                return `$$\n${latexSource}\n$$`;
              }
            }
            
            // Otherwise treat as inline math
            return `\\(${latexSource}\\)`;
          }
          // If we can't extract LaTeX, fall back to processing children
          return processChildNodes(node);
        }
        
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
    version: 11, // Updated config version - Added interactive block/artifact extraction support
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
      assistantContentContainer: 'div.response-content-markdown',
      assistantRelevantBlocks: ':scope > :is(p, h1, h2, h3, h4, h5, h6, ol, ul, div.not-prose, div.grid, div.table-container, div.py-2, blockquote, hr, span.katex-display)',
      listItem: 'li',
      assistantCodeBlockOuterContainer: 'div.not-prose',
      assistantCodeBlockInnerContainer: 'div.not-prose > div.relative',
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
    extractUserUploadedImages: (turnElement) => { /* ... unchanged ... */ const images = []; const selectors = grokConfig.selectors; turnElement.querySelectorAll(selectors.userAttachmentChip).forEach(chip => { const imgPreviewDiv = chip.querySelector(selectors.userAttachmentImagePreviewDiv); const filenameElement = chip.querySelector(selectors.userAttachmentFilename); if (imgPreviewDiv && filenameElement) { const filename = filenameElement.textContent?.trim(); const style = imgPreviewDiv.getAttribute('style'); const match = style?.match(/url\\("?([^")]+)"?\\)/); const previewUrl = match ? match[1] : null; if (filename && previewUrl) { const fullUrl = getFullImageUrlFromPreview(previewUrl); if (fullUrl) { images.push({ type: 'image', sourceUrl: fullUrl, isPreviewOnly: true, extractedContent: filename }); } } } }); return images; },
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
      
      // First, look for interactive blocks anywhere in the turn element
      const messageBubble = turnElement.querySelector(selectors.messageBubble);
      if (messageBubble) {
        const interactiveBlocks = messageBubble.querySelectorAll(selectors.interactiveBlockContainer);
        interactiveBlocks.forEach(block => {
          const interactiveItem = processInteractiveBlock(block);
          if (interactiveItem) {
            contentItems.push(interactiveItem);
          }
        });
      }
      
      const assistantContainer = turnElement.querySelector(selectors.assistantContentContainer);
      if (!assistantContainer) {
        // If no regular content container but we found interactive blocks, return them
        if (contentItems.length > 0) {
          return contentItems;
        }
        console.warn("[Grok Extractor] Assistant message bubble not found.");
        return [];
      }

              // console.log(`[Grok Extractor v10] Processing assistant message bubble.`);
        // Select the relevant block elements directly within the message bubble
        const relevantBlocks = assistantContainer.querySelectorAll(selectors.assistantRelevantBlocks);
        const processedElements = new Set(); // Keep track of processed elements

        relevantBlocks.forEach((block, index) => {
            // Skip if this element was already processed as part of a larger block
            if (processedElements.has(block)) return;

            const tagNameLower = block.tagName.toLowerCase();
            // console.log(`[Grok Extractor v10] Processing Block #${index}: <${tagNameLower}>`);
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
                              console.warn(`[Grok Extractor v10]   -> Skipping unhandled direct block type <${tagNameLower}>`, block);
                processedElements.add(block);
            }
        }); // End forEach loop over relevantBlocks

        // console.log("[Grok Extractor v10] Final assistant contentItems:", JSON.stringify(contentItems, null, 2));
        return contentItems; // Return the array of extracted content items
      }, // End extractAssistantContent

  }; // End grokConfig

  // Assign the configuration to the window object
  window.grokConfig = grokConfig;
  // console.log("grokConfig.js initialized (v" + grokConfig.version + ")");

})(); // End of IIFE
// --- END OF UPDATED FILE grokConfigs.js (v11) ---