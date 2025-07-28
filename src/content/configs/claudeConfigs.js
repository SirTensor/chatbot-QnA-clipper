// claudeConfig.js (v6 - Blockquote Support)

(function() {
  // Initialization check to prevent re-running the script if already loaded
  if (window.claudeConfig && window.claudeConfig.version >= 6) {
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

    // Skip top-level elements handled by dedicated functions
    // Note: We don't skip pre elements in list items, only standalone pre elements
    const isInListItem = element.closest('li') !== null;
    const isStandalonePre = tagNameLower === 'pre' && !isInListItem;
    
    return tagNameLower === 'ul' ||
           tagNameLower === 'ol' ||
           isStandalonePre || // Only skip standalone pre elements
           tagNameLower === 'table' || // Skip tables (handled separately)
           tagNameLower === 'blockquote' || // Skip blockquotes (handled separately)
           element.closest(selectors.artifactButton); // Check if element is INSIDE an artifact button/cell
  }

  /**
   * Processes <li> elements within a <ul> or <ol> list.
   * @param {HTMLElement} el - The <ul> or <ol> element.
   * @param {string} listType - 'ul' or 'ol'.
   * @param {number} [level=0] - The nesting level (for indentation).
   * @param {boolean} [isWithinBlockquote=false] - Whether the list is within a blockquote.
   * @param {number} [blockquoteLevel=0] - The nesting level of the parent blockquote.
   * @returns {string} - The Markdown representation of the list. Returns an empty string if the list is empty.
   */
  function processList(el, listType, level = 0, isWithinBlockquote = false, blockquoteLevel = 0) {
    let lines = [];
    let startNum = 1;
    if (listType === 'ol') {
      startNum = parseInt(el.getAttribute('start') || '1', 10);
      if (isNaN(startNum)) startNum = 1;
    }
    let itemIndex = 0;
    
    // Calculate indent based on level - 4 spaces per level
    const indent = '    '.repeat(level);
    const bqPrefix = isWithinBlockquote ? '> '.repeat(blockquoteLevel) : '';

    // Process only direct li children
    el.querySelectorAll(':scope > li').forEach(li => {
      // Clone the li to manipulate it without affecting the original DOM
      const liClone = li.cloneNode(true);

      // Find and process pre elements (code blocks) within the li before removing them
      const codeBlocksInLi = Array.from(li.querySelectorAll(':scope > pre'));
      let codeBlocksContent = '';
      
      if (codeBlocksInLi.length > 0) {
        // Process each code block and collect their content
        codeBlocksInLi.forEach(preElement => {
          const codeItem = processCodeBlock(preElement);
          if (codeItem && codeItem.type === 'code_block') {
            const languageSpec = codeItem.language ? `${codeItem.language}` : '';
            codeBlocksContent += `\`\`\`${languageSpec}\n${codeItem.content}\n\`\`\``;
          } else if (codeItem && codeItem.type === 'text') {
            // This handles table markdown output
            codeBlocksContent += `${codeItem.content}`;
          }
          
          // Also remove the pre element from the clone to prevent duplicate processing
          const preInClone = liClone.querySelector(`:scope > pre[data-testid="${preElement.getAttribute('data-testid')}"]`);
          if (preInClone) {
            liClone.removeChild(preInClone);
          } else {
            // If we can't find by data-testid, find the corresponding position
            const preElements = liClone.querySelectorAll(':scope > pre');
            if (preElements.length > 0) {
              const index = Array.from(li.querySelectorAll(':scope > pre')).indexOf(preElement);
              if (index >= 0 && index < preElements.length) {
                liClone.removeChild(preElements[index]);
              }
            }
          }
        });
      }

      // Find and remove direct child ul/ol elements from the clone
      const nestedListsInClone = Array.from(liClone.children).filter(child =>
        child.tagName.toLowerCase() === 'ul' || child.tagName.toLowerCase() === 'ol'
      );
      nestedListsInClone.forEach(list => liClone.removeChild(list));

      // Also find and remove blockquotes to handle them separately
      const blockquotesInClone = Array.from(liClone.children).filter(child => 
        child.tagName.toLowerCase() === 'blockquote'
      );
      blockquotesInClone.forEach(bq => liClone.removeChild(bq));

      // Get the markdown for the li content *without* the nested lists and blockquotes
      let itemMarkdown = QAClipper.Utils.htmlToMarkdown(liClone, {
        skipElementCheck: shouldSkipElement,
      }).trim();

      // Recursively process the *original* nested lists found directly within the li
      let nestedContent = '';
      li.querySelectorAll(':scope > ul, :scope > ol').forEach(nestedList => {
         const nestedListType = nestedList.tagName.toLowerCase();
         // Keep consistent indentation across nested lists
         const nestedResult = processList(nestedList, nestedListType, level + 1, isWithinBlockquote, blockquoteLevel);
         if (nestedResult) {
             // Add a newline before appending nested list content
             nestedContent += '\n' + nestedResult;
         }
      });

      // Process any blockquotes within the list item
      li.querySelectorAll(':scope > blockquote').forEach(bq => {
        // Process the blockquote, treating it as the first level within this list item context.
        const bqContent = processBlockquote(bq, 0);

        if (bqContent) {
          // Calculate the indentation for nested elements within this list item (level + 1).
          const nestedElementIndent = '    '.repeat(level + 1);

          // Prepend the standard nested indentation to each line of the blockquote content.
          const indentedBqContent = bqContent.split('\n').map(line =>
            `${nestedElementIndent}${line}`
          ).join('\n');

          nestedContent += '\n' + indentedBqContent;
        }
      });

      // Append the code blocks content to the nested content
      if (codeBlocksContent) {
        // Calculate the indentation for nested code blocks within this list item
        const nestedElementIndent = '    '.repeat(level + 1);
        
        // Indent each line of the code block content
        const indentedCodeBlockContent = codeBlocksContent.split('\n').map(line => {
          // Removed special handling for blank lines as \n\n was the likely cause
          return `${nestedElementIndent}${line}`;
        }).join('\n');
        
        nestedContent += '\n' + indentedCodeBlockContent;
      }

      // Combine the item markdown and nested content
      if (itemMarkdown || nestedContent.trim()) {
        const marker = listType === 'ul' ? '-' : `${startNum + itemIndex}.`;

        // Assemble the line: blockquote prefix (if applicable), indentation, marker, item content.
        let line = `${bqPrefix}${indent}${marker} ${itemMarkdown}`;

        // Append nested list content if it exists
        if (nestedContent.trim()) {
            // If itemMarkdown was empty, avoid extra space after marker.
            // Ensure bqPrefix and indent are still applied.
            if (!itemMarkdown) {
                line = `${bqPrefix}${indent}${marker}`;
            }
            line += nestedContent; // nestedContent already starts with \n and has prefixes/indentation
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
    
    // Method 4: Try to infer language from div.text-text-500.text-xs with language name
    // This is especially useful for code blocks in list items
    if (!language) {
        const langDivs = el.querySelectorAll('div.text-text-500.text-xs');
        for (const div of langDivs) {
            const langText = div.textContent?.trim().toLowerCase();
            if (langText && langText !== '') {
                language = langText;
                break;
            }
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
      console.warn("[Claude Extractor v6] Invalid table element:", tableElement);
      return null;
    }

    // console.log("[Claude Extractor v6] Processing table to Markdown");
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
      console.warn("[Claude Extractor v6] Table has no header (thead > tr > th). Trying fallback to first row.");
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
      console.warn("[Claude Extractor v6] Cannot determine table structure. Skipping.");
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
          console.warn("[Claude Extractor v6] Table row skipped due to column count mismatch:", cells.length, "vs", columnCount);
        }
      }
    }

    // Check if there is at least a header + separator + data row
    const markdownTable = markdownRows.length > 2 ? markdownRows.join('\n') : null;
    // console.log("[Claude Extractor v6] Generated Markdown table:", markdownTable);
    
    return markdownTable ? { type: 'text', content: markdownTable } : null;
  }

   /**
   * Processes artifact buttons/cells within assistant messages to extract title and type.
   * @param {HTMLElement} artifactCellEl - The artifact cell element (`div.artifact-block-cell`).
   * @returns {object|null} - An interactive_block content item with title and type.
   */
  function processArtifactButton(artifactCellEl) { // Renamed parameter for clarity
    const selectors = window.claudeConfig.selectors;
    // Find title within the artifact cell div
    const titleElement = artifactCellEl.querySelector(selectors.artifactTitle);
    const title = titleElement ? titleElement.textContent?.trim() : '[Artifact]'; // Default title

    // Find artifact type - just extract whatever text is there
    // Try multiple possible selectors for type element
    let typeElement = artifactCellEl.querySelector('div[class*="text-sm"][class*="text-text-300"]');
    if (!typeElement) {
      typeElement = artifactCellEl.querySelector('.text-sm.text-text-300');
    }
    if (!typeElement) {
      typeElement = artifactCellEl.querySelector('div.text-sm');
    }
    
    let artifactType = 'Code'; // Default fallback
    if (typeElement) {
      // Clean up the text but keep everything including version info
      const rawText = typeElement.textContent?.trim() || '';
      artifactType = rawText.replace(/\s+/g, ' ').replace(/&nbsp;/g, '').replace(/\u00A0/g, '').trim() || 'Code';
    }

    // Return an interactive_block item with title and artifact type
    return {
        type: 'interactive_block',
        title: title,
        artifactType: artifactType, // Add artifact type
        code: null, // Explicitly set code to null
        language: null // Explicitly set language to null
    };
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
          const content = QAClipper.Utils.htmlToMarkdown(node, {
            skipElementCheck: shouldSkipElement
          }).trim();
          
          if (content) {
            content.split('\n').forEach(line => {
              resultLines.push(`${prefix}${line}`);
            });
            
            // Add a blank line after paragraphs
            resultLines.push(`${prefix}`);
            previousWasBlock = true;
          }
        }
        
        // Handle code blocks (pre elements)
        else if (tagName === 'pre') {
          // Add spacing before code block if needed
          if (resultLines.length > 0 && !previousWasBlock) {
            resultLines.push(`${prefix}`);
          }
          
          // Process the code block
          const codeItem = processCodeBlock(node);
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
            // processList already adds the bqPrefix (>), so just push the content.
            resultLines.push(listResult);
            previousWasBlock = false;
          }
        }
        
        // Handle other elements (like spans, strong, etc.)
        else if (previousWasNestedBlockquote) {
          resultLines.push(`${prefix}`);
          previousWasNestedBlockquote = false;
          
          const inlineContent = QAClipper.Utils.htmlToMarkdown(node, {
            skipElementCheck: shouldSkipElement
          }).trim();
          
          if (inlineContent) {
            inlineContent.split('\n').forEach(line => {
              resultLines.push(`${prefix}${line}`);
            });
            previousWasBlock = false;
          }
        }
        
        else {
          const inlineContent = QAClipper.Utils.htmlToMarkdown(node, {
            skipElementCheck: shouldSkipElement
          }).trim();
          
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

  // --- Main Configuration Object ---
  const claudeConfig = {
    platformName: 'Claude',
    version: 6, // Update config version identifier for blockquote support
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
      // Selector for the grid *inside* a tabindex div (used in v6 logic)
      assistantContentGridInTabindex: ':scope > div.grid-cols-1',
      // Selector for content elements *inside* the grid (used in v6 logic)
      assistantContentElementsInGrid: ':scope > :is(p, ol, ul, pre, h1, h2, h3, h4, h5, h6, blockquote, div)',

      // --- Content Block Selectors (within assistant turn) ---
      listItem: 'li',
      // Selector for pre elements nested inside list items
      nestedCodeBlockInListItem: 'li > pre',
      codeBlockContainer: 'pre', // Still needed for processCodeBlock if found
      codeBlockContent: 'code[class*="language-"]',
      codeBlockLangIndicator: 'div.text-text-300.absolute',
      
      // --- Blockquote Selector ---
      blockquoteContainer: 'blockquote',
      
      // --- Table Selectors ---
      tableContainer: 'pre.font-styrene', // The pre element containing the table
      tableElement: 'table', // The actual table element

      // --- Artifact (Interactive Block) Selectors ---
      artifactContainerDiv: 'div.py-2, div.pt-2.pb-3, div.pt-3.pb-3, div[class*="pt-"][class*="pb-"]', // The div containing the artifact button/cell
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
      const userMessageContainer = turnElement.querySelector(claudeConfig.selectors.userMessageContainer);
      if (!userMessageContainer) return null;

      // Use a similar approach to extractAssistantContent for user messages
      const contentItems = [];
      const selectors = claudeConfig.selectors;

      // Process direct children of the user message container
      const directChildren = Array.from(userMessageContainer.children);

      directChildren.forEach((child) => {
        const tagNameLower = child.tagName.toLowerCase();
        let item = null;

        // Handle common block elements like p, ul, ol, blockquote
        if (tagNameLower === 'p') {
          const markdownText = QAClipper.Utils.htmlToMarkdown(child, { skipElementCheck: shouldSkipElement }).trim();
          if (markdownText) QAClipper.Utils.addTextItem(contentItems, markdownText);
        } else if (tagNameLower === 'ul') {
          const listMarkdown = processList(child, 'ul', 0);
          if (listMarkdown) QAClipper.Utils.addTextItem(contentItems, listMarkdown); // Add text content
        } else if (tagNameLower === 'ol') {
          const listMarkdown = processList(child, 'ol', 0);
          if (listMarkdown) QAClipper.Utils.addTextItem(contentItems, listMarkdown); // Add text content
        } else if (tagNameLower === 'blockquote') {
          const blockquoteContent = processBlockquote(child, 0);
          if (blockquoteContent) {
            QAClipper.Utils.addTextItem(contentItems, blockquoteContent);
          }
        } else if (tagNameLower.match(/^h[1-6]$/)) { // Handle headings h1-h6
            const level = parseInt(tagNameLower.substring(1), 10);
            const prefix = '#'.repeat(level);
            const headingText = QAClipper.Utils.htmlToMarkdown(child, { skipElementCheck: shouldSkipElement }).trim();
            if (headingText) {
                QAClipper.Utils.addTextItem(contentItems, `${prefix} ${headingText}`);
            }
        } else {
            // For other elements, try a generic conversion
             const fallbackText = QAClipper.Utils.htmlToMarkdown(child, { skipElementCheck: shouldSkipElement }).trim();
             if (fallbackText) {
                 QAClipper.Utils.addTextItem(contentItems, fallbackText);
             }
             // Optionally log unhandled tags: console.warn("Unhandled user message tag:", tagNameLower);
        }
      });

      // Combine all processed text items into a single string
      const combinedText = contentItems.map(item => item.content).join('\n\n'); // Add double newline between blocks

      return combinedText.trim() || null;
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
              catch (e) { console.error("[Claude Extractor v6] Error creating absolute URL for image:", e, src); }
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
          console.warn("[Claude Extractor v6] Assistant message container not found.");
          return [];
      }

      const directChildren = Array.from(assistantContainer.children);

      directChildren.forEach((child, index) => {
          const tagNameLower = child.tagName.toLowerCase();
          let item = null; // Define item here

          // First check if this element contains an artifact anywhere inside it
          const artifactCell = child.querySelector && child.querySelector(selectors.artifactButton);
          if (artifactCell) {
              item = processArtifactButton(artifactCell);
              if (item) contentItems.push(item);
              return; // Skip further processing for this element
          }

          // Case 1: Child is a container for text, lists, or code blocks (any div)
          if (tagNameLower === 'div') {
              // console.log("  -> Handling as Text/List/Code Container (div)");
              // Find the grid inside this div - look for grid-cols-1 grid class
              const gridInside = child.querySelector('div.grid-cols-1.grid, div.grid.grid-cols-1');
              if (gridInside) {
                  // Process existing content elements within the grid
                  const contentElements = gridInside.querySelectorAll(selectors.assistantContentElementsInGrid);
                  contentElements.forEach(contentElement => {
                      const contentTagName = contentElement.tagName.toLowerCase();
                      // console.log(`    -> Processing Grid Element: <${contentTagName}>`);

                      if (contentTagName === 'p') {
                          const markdownText = QAClipper.Utils.htmlToMarkdown(contentElement, { skipElementCheck: shouldSkipElement }).trim();
                          if (markdownText) QAClipper.Utils.addTextItem(contentItems, markdownText);
                      } else if (contentTagName === 'ul') {
                          const listMarkdown = processList(contentElement, 'ul', 0);
                          if (listMarkdown) contentItems.push({ type: 'text', content: listMarkdown });
                      } else if (contentTagName === 'ol') {
                          const listMarkdown = processList(contentElement, 'ol', 0);
                          if (listMarkdown) contentItems.push({ type: 'text', content: listMarkdown });
                      } else if (contentTagName === 'pre') {
                          // Check if the pre element contains a table first
                          const tableElement = contentElement.querySelector(selectors.tableElement);
                          if (tableElement) {
                              // Process as a table if found
                              item = processTableToMarkdown(tableElement);
                          } else {
                              // Process as a code block if no table is found
                              item = processCodeBlock(contentElement);
                          }
                          if (item) contentItems.push(item);
                      } else if (contentTagName === 'blockquote') {
                          const blockquoteContent = processBlockquote(contentElement, 0);
                          if (blockquoteContent) {
                              QAClipper.Utils.addTextItem(contentItems, blockquoteContent);
                          }
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
                      } else if (contentTagName === 'div') {
                          // Check if this div is a code block container
                          // Look for the pattern: div.relative with pre element inside
                          if (contentElement.classList.contains('relative') || 
                              contentElement.querySelector('pre.code-block__code') ||
                              contentElement.querySelector('pre[class*="code-block"]')) {
                              
                              // Find the pre element inside this container (may be nested in another div)
                              const preElement = contentElement.querySelector('pre');
                              if (preElement) {
                                  // Check if the pre element contains a table first
                                  const tableElement = preElement.querySelector(selectors.tableElement);
                                  if (tableElement) {
                                      // Process as a table if found
                                      item = processTableToMarkdown(tableElement);
                                  } else {
                                      // Process as a code block if no table is found
                                      item = processCodeBlock(preElement);
                                  }
                                  if (item) contentItems.push(item);
                              } else {
                                  // console.log(`    -> Code block container div found but no pre element inside`);
                              }
                          } else {
                              // For other divs, try generic markdown conversion
                              const divMarkdown = QAClipper.Utils.htmlToMarkdown(contentElement, { skipElementCheck: shouldSkipElement }).trim();
                              if (divMarkdown) {
                                  QAClipper.Utils.addTextItem(contentItems, divMarkdown);
                              }
                          }
                      } else {
                          // console.log(`    -> Skipping unhandled grid element: <${contentTagName}>`);
                      }
                  });
              } else {
                   // console.warn("  -> Grid not found inside div. Trying to process direct content.");
                   // Fallback: If grid is not found, find content elements directly within the div
                   const directContent = child.querySelectorAll(':scope > :is(p, ol, ul, pre, h1, h2, h3, h4, h5, h6, blockquote, div)');
                   directContent.forEach(contentElement => {
                        const contentTagName = contentElement.tagName.toLowerCase();
                        if (contentTagName === 'p') {
                            const markdownText = QAClipper.Utils.htmlToMarkdown(contentElement, { skipElementCheck: shouldSkipElement }).trim();
                            if (markdownText) QAClipper.Utils.addTextItem(contentItems, markdownText);
                        }
                        else if (contentTagName === 'ul') {
                            const listMarkdown = processList(contentElement, 'ul', 0);
                            if (listMarkdown) contentItems.push({ type: 'text', content: listMarkdown });
                        }
                        else if (contentTagName === 'ol') {
                            const listMarkdown = processList(contentElement, 'ol', 0);
                            if (listMarkdown) contentItems.push({ type: 'text', content: listMarkdown });
                        }
                        else if (contentTagName === 'pre') {
                            // Check if the pre element contains a table first in fallback path
                            const tableElement = contentElement.querySelector(selectors.tableElement);
                            if (tableElement) {
                                // Process as a table if found
                                item = processTableToMarkdown(tableElement);
                            } else {
                                // Process as a code block if no table is found
                                item = processCodeBlock(contentElement);
                            }
                            if (item) contentItems.push(item);
                        }
                        else if (contentTagName === 'blockquote') {
                            const blockquoteContent = processBlockquote(contentElement, 0);
                            if (blockquoteContent) {
                                QAClipper.Utils.addTextItem(contentItems, blockquoteContent);
                            }
                        } 
                        else if (contentTagName.match(/^h[1-6]$/)) { // Handle headings h1-h6 in fallback
                            const level = parseInt(contentTagName.substring(1), 10);
                            const prefix = '#'.repeat(level);
                            const headingText = QAClipper.Utils.htmlToMarkdown(contentElement, { 
                                skipElementCheck: shouldSkipElement 
                            }).trim();
                            if (headingText) {
                                QAClipper.Utils.addTextItem(contentItems, `${prefix} ${headingText}`);
                            }
                        }
                        else if (contentTagName === 'div') {
                            // Check if this div is a code block container (fallback path)
                            // Look for the pattern: div.relative with pre element inside
                            if (contentElement.classList.contains('relative') || 
                                contentElement.querySelector('pre.code-block__code') ||
                                contentElement.querySelector('pre[class*="code-block"]')) {
                                
                                // Find the pre element inside this container (may be nested in another div)
                                const preElement = contentElement.querySelector('pre');
                                if (preElement) {
                                    // Check if the pre element contains a table first
                                    const tableElement = preElement.querySelector(selectors.tableElement);
                                    if (tableElement) {
                                        // Process as a table if found
                                        item = processTableToMarkdown(tableElement);
                                    } else {
                                        // Process as a code block if no table is found
                                        item = processCodeBlock(preElement);
                                    }
                                    if (item) contentItems.push(item);
                                } else {
                                    // console.log(`    -> Code block container div found but no pre element inside (fallback)`);
                                }
                            } else {
                                // For other divs, try generic markdown conversion
                                const divMarkdown = QAClipper.Utils.htmlToMarkdown(contentElement, { skipElementCheck: shouldSkipElement }).trim();
                                if (divMarkdown) {
                                    QAClipper.Utils.addTextItem(contentItems, divMarkdown);
                                }
                            }
                        }
                   });
              }
          }
          // Case 2: Unhandled direct child (artifacts are already handled above)
          else {
              // Skip unhandled elements
          }
      }); // End forEach loop

      // console.log("[Claude Extractor v6] Final assistant contentItems:", JSON.stringify(contentItems, null, 2));
      return contentItems;
    }, // End extractAssistantContent

  }; // End claudeConfig

  // Assign to window object
  window.claudeConfig = claudeConfig;
  // console.log("claudeConfig.js initialized (v" + claudeConfig.version + ")");

})(); // End of IIFE