// claudeConfig.js (v13 - Handle Claude Opus 4.6 reasoning UI, keep full assistant response extraction)

(function() {
  // Initialization check to prevent re-running the script if already loaded
  if (window.claudeConfig && window.claudeConfig.version >= 13) {
    // console.log("Claude config already initialized (v" + window.claudeConfig.version + "), skipping.");
    return;
  }

  // --- Helper Functions ---

  /**
   * Checks if an element is a Claude thinking/reasoning block that should be skipped.
   * These blocks contain the AI's internal reasoning and have a toggle button to show/hide.
   * @param {HTMLElement} element - The element to check
   * @returns {boolean} - True if this is a thinking block
   */
  function isThinkingBlock(element) {
    if (!element || element.tagName.toLowerCase() !== 'div') return false;

    // Check for the characteristic classes of thinking blocks:
    // They have font-ui, border-0.5, border-border-300, rounded-lg classes
    const hasThinkingClasses = element.classList.contains('border-0.5') &&
                               element.classList.contains('border-border-300') &&
                               element.classList.contains('rounded-lg') &&
                               element.classList.contains('font-ui');

    if (!hasThinkingClasses) return false;

    // Additionally verify by checking for the toggle button that's characteristic of thinking blocks
    // The button has class "group/row" and is used to expand/collapse the thinking content
    const toggleButton = element.querySelector('button.group\\/row');

    return toggleButton !== null;
  }

  /**
   * Checks if a content grid belongs to Claude's reasoning/thinking UI section.
   * New Claude layouts can include multiple `standard-markdown` blocks per response:
   * one (or more) for reasoning and one for the final answer. We only want the final answer.
   * @param {HTMLElement} gridElement - Candidate markdown grid element.
   * @param {HTMLElement} assistantContainer - Assistant response root container.
   * @returns {boolean} - True if this grid is part of reasoning UI.
   */
  function isReasoningContentGrid(gridElement, assistantContainer) {
    if (!gridElement || !assistantContainer) return false;

    let current = gridElement;
    while (current && current !== assistantContainer) {
      // Legacy reasoning card detection
      if (isThinkingBlock(current)) return true;

      // Claude Opus 4.6 reasoning branch: row-start-1 contains status toggle + reasoning markdown
      if (current.classList?.contains('row-start-1') &&
          current.querySelector('button.group\\/status')) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  /**
   * Converts del (strikethrough) elements to markdown syntax within the given element
   * Must be called on a cloned element before htmlToMarkdown processing
   * @param {HTMLElement} element - The cloned element to process (will be modified in place)
   */
  function convertDelToMarkdown(element) {
    const delElements = element.querySelectorAll('del');
    delElements.forEach(delEl => {
      const delText = delEl.textContent;
      const replacement = document.createTextNode(`~~${delText}~~`);
      delEl.parentNode.replaceChild(replacement, delEl);
    });
  }

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
    
    // Skip KaTeX elements as they are handled by dedicated processing
    const isKaTeXElement = element.classList.contains('katex') ||
                          element.classList.contains('katex-display') ||
                          element.classList.contains('katex-mathml') ||
                          element.classList.contains('katex-html');

    // Skip table container divs (div.overflow-x-auto containing a table)
    const isTableContainer = tagNameLower === 'div' &&
                            element.classList.contains('overflow-x-auto') &&
                            element.querySelector(':scope > table');

    return tagNameLower === 'ul' ||
           tagNameLower === 'ol' ||
           isStandalonePre || // Only skip standalone pre elements
           tagNameLower === 'table' || // Skip tables (handled separately)
           tagNameLower === 'blockquote' || // Skip blockquotes (handled separately)
           isKaTeXElement || // Skip KaTeX elements (handled by processKaTeX)
           isTableContainer || // Skip table container divs (handled by processTableToMarkdown)
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

      // Find and process code blocks within the li before removing them
      // Look for both old pre elements and new div container structure
      const codeBlocksInLi = Array.from(li.querySelectorAll(':scope > pre, :scope > div.relative[class*="group/copy"]'));
      let codeBlocksContent = '';

      if (codeBlocksInLi.length > 0) {
        // Process each code block and collect their content
        codeBlocksInLi.forEach(codeBlockElement => {
          const codeItem = processCodeBlock(codeBlockElement);
          if (codeItem && codeItem.type === 'code_block') {
            const languageSpec = codeItem.language ? `${codeItem.language}` : '';
            codeBlocksContent += `\`\`\`${languageSpec}\n${codeItem.content}\n\`\`\``;
          } else if (codeItem && codeItem.type === 'text') {
            // This handles table markdown output
            codeBlocksContent += `${codeItem.content}`;
          }

          // Remove the code block element from the clone to prevent duplicate processing
          const tagName = codeBlockElement.tagName.toLowerCase();
          if (tagName === 'pre') {
            // Handle old pre elements
            const preInClone = liClone.querySelector(`:scope > pre[data-testid="${codeBlockElement.getAttribute('data-testid')}"]`);
            if (preInClone) {
              liClone.removeChild(preInClone);
            } else {
              // If we can't find by data-testid, find the corresponding position
              const preElements = liClone.querySelectorAll(':scope > pre');
              if (preElements.length > 0) {
                const index = Array.from(li.querySelectorAll(':scope > pre')).indexOf(codeBlockElement);
                if (index >= 0 && index < preElements.length) {
                  liClone.removeChild(preElements[index]);
                }
              }
            }
          } else if (tagName === 'div') {
            // Handle new div container structure
            const divContainers = liClone.querySelectorAll(':scope > div.relative[class*="group/copy"]');
            if (divContainers.length > 0) {
              const index = Array.from(li.querySelectorAll(':scope > div.relative[class*="group/copy"]')).indexOf(codeBlockElement);
              if (index >= 0 && index < divContainers.length) {
                liClone.removeChild(divContainers[index]);
              }
            }
          }
        });
      }

      // Find and process tables within the li (wrapped in div.overflow-x-auto)
      const tableContainersInLi = Array.from(li.querySelectorAll(':scope > div.overflow-x-auto'));
      let tablesContent = '';

      if (tableContainersInLi.length > 0) {
        tableContainersInLi.forEach(tableContainer => {
          const tableElement = tableContainer.querySelector(':scope > table');
          if (tableElement) {
            const tableItem = processTableToMarkdown(tableElement);
            if (tableItem && tableItem.type === 'text') {
              tablesContent += `${tableItem.content}`;
            }
          }

          // Remove the table container from the clone to prevent duplicate processing
          const tableContainersInClone = liClone.querySelectorAll(':scope > div.overflow-x-auto');
          if (tableContainersInClone.length > 0) {
            const index = Array.from(li.querySelectorAll(':scope > div.overflow-x-auto')).indexOf(tableContainer);
            if (index >= 0 && index < tableContainersInClone.length) {
              liClone.removeChild(tableContainersInClone[index]);
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

      // Convert del (strikethrough) elements to markdown before processing
      convertDelToMarkdown(liClone);

      // Get the markdown for the li content *without* the nested lists and blockquotes
      let itemMarkdown = QAClipper.Utils.htmlToMarkdown(liClone, {
        skipElementCheck: shouldSkipElement,
      }).trim();
      
      // If no markdown content was extracted but we have code blocks, 
      // try to extract just the text content
      if (!itemMarkdown && codeBlocksContent) {
        const textContent = liClone.textContent?.trim();
        if (textContent) {
          itemMarkdown = textContent;
        }
      }

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

      // Append the tables content to the nested content
      if (tablesContent) {
        // Calculate the indentation for nested tables within this list item
        const nestedElementIndent = '    '.repeat(level + 1);

        // Indent each line of the table content
        const indentedTablesContent = tablesContent.split('\n').map(line => {
          return `${nestedElementIndent}${line}`;
        }).join('\n');

        nestedContent += '\n' + indentedTablesContent;
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
   * Processes code block elements (either <pre> or container <div> elements).
   * @param {HTMLElement} el - The container element (could be <pre> or <div>).
   * @returns {object|null} - A code_block content item or null.
   */
  function processCodeBlock(el) {
    const selectors = window.claudeConfig.selectors;
    
    // Special handling: case of table container (table pre)
    const tableElement = el.querySelector('table');
    if (tableElement) {
      return processTableToMarkdown(tableElement);
    }
    
    // Check if this is the new div container structure
    let preElement = null;
    let codeElement = null;
    let langIndicatorElement = null;
    
    if (el.tagName.toLowerCase() === 'div') {
      // New structure: div container with pre.code-block__code inside
      preElement = el.querySelector('pre.code-block__code');
      if (preElement) {
        codeElement = preElement.querySelector('code');
        // Look for language indicator in the container div
        langIndicatorElement = el.querySelector('div.text-text-500.font-small');
      }
    } else if (el.tagName.toLowerCase() === 'pre') {
      // Old structure: direct pre element
      preElement = el;
      codeElement = el.querySelector(selectors.codeBlockContent) || el.querySelector('code');
      langIndicatorElement = el.querySelector(selectors.codeBlockLangIndicator);
    }
    
    // Extract code text
    const code = codeElement ? codeElement.textContent : '';
    
    // Language detection - try multiple approaches
    let language = null;
    
    // Method 1: Check for language- classes on code element
    if (codeElement) {
        const langClass = Array.from(codeElement.classList || []).find(cls => cls.startsWith('language-'));
        if (langClass) {
            language = langClass.replace('language-', '');
        }
    }
    
    // Method 2: Check the language indicator div (new structure priority)
    if (!language && langIndicatorElement) {
        const indicatorText = langIndicatorElement.textContent?.trim();
        language = indicatorText && indicatorText.toLowerCase() !== "" ? 
                   indicatorText.toLowerCase() : "text";
    }
    
    // Method 3: Try to infer language from other div.text-text-500.text-xs elements
    if (!language) {
        const langDivs = el.querySelectorAll('div.text-text-500.text-xs, div.text-text-500.font-small');
        for (const div of langDivs) {
            const langText = div.textContent?.trim().toLowerCase();
            if (langText && langText !== '') {
                language = langText;
                break;
            }
        }
    }

    // Method 4: Check old selector pattern
    if (!language) {
        const oldLangIndicator = el.querySelector(selectors.codeBlockLangIndicator);
        if (oldLangIndicator) {
            const indicatorText = oldLangIndicator.textContent?.trim();
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
      console.warn("[Claude Extractor v7] Invalid table element:", tableElement);
      return null;
    }

    // console.log("[Claude Extractor v7] Processing table to Markdown");
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
      console.warn("[Claude Extractor v7] Table has no header (thead > tr > th). Trying fallback to first row.");
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
      console.warn("[Claude Extractor v7] Cannot determine table structure. Skipping.");
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
            }).trim().replace(/\|/g, '\\|').replace(/\n+/g, '<br>'); // Escape pipes and convert line breaks to <br> for markdown table cells
          });
          markdownRows.push(`| ${cellContent.join(' | ')} |`);
        } else {
          console.warn("[Claude Extractor v7] Table row skipped due to column count mismatch:", cells.length, "vs", columnCount);
        }
      }
    }

    // Check if there is at least a header + separator + data row
    const markdownTable = markdownRows.length > 2 ? markdownRows.join('\n') : null;
    // console.log("[Claude Extractor v7] Generated Markdown table:", markdownTable);
    
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

  /**
   * Processes KaTeX math expressions and converts them to LaTeX markdown format
   * @param {HTMLElement} element - The KaTeX container element
   * @returns {string|null} - The extracted LaTeX source or null
   */
  function processKaTeX(element) {
    // Look for the annotation element that contains the original LaTeX source
    const annotationElement = element.querySelector('annotation[encoding="application/x-tex"]');
    if (annotationElement) {
      const latexSource = annotationElement.textContent.trim();
      if (latexSource) {
        // Check if this is a display math (block) or inline math
        const isDisplayMath = element.closest('.katex-display') !== null;
        const result = isDisplayMath ? `$$${latexSource}$$` : `$${latexSource}$`;
        console.log("[Claude Extractor v9] KaTeX processed:", { isDisplayMath, latexSource, result });
        return result;
      }
    }
    console.log("[Claude Extractor v9] KaTeX element found but no LaTeX source:", element);
    return null;
  }

  /**
   * Helper function to process individual content elements
   * @param {HTMLElement} element - The element to process
   * @param {Array} contentItems - Array to add processed items to
   * @param {Object} selectors - Selector configuration
   */
  function processContentElement(element, contentItems, selectors) {
      const tagNameLower = element.tagName.toLowerCase();
      let item = null;

      if (tagNameLower === 'p') {
          // Special handling for whitespace-pre-wrap paragraphs (preserves line breaks)
          if (element.classList.contains('whitespace-pre-wrap')) {
              // For whitespace-pre-wrap, we need to preserve the exact text including line breaks
              // First, clone the element to avoid modifying the original
              const clonedElement = element.cloneNode(true);
              
              // Replace inline code elements with markdown syntax
              const codeElements = clonedElement.querySelectorAll('code');
              codeElements.forEach(codeEl => {
                  const codeText = codeEl.textContent;
                  const replacement = document.createTextNode(`\`${codeText}\``);
                  codeEl.parentNode.replaceChild(replacement, codeEl);
              });
              
              // Replace strong elements with markdown syntax
              const strongElements = clonedElement.querySelectorAll('strong');
              strongElements.forEach(strongEl => {
                  const strongText = strongEl.textContent;
                  const replacement = document.createTextNode(`**${strongText}**`);
                  strongEl.parentNode.replaceChild(replacement, strongEl);
              });
              
              // Replace em elements with markdown syntax
              const emElements = clonedElement.querySelectorAll('em');
              emElements.forEach(emEl => {
                  const emText = emEl.textContent;
                  const replacement = document.createTextNode(`*${emText}*`);
                  emEl.parentNode.replaceChild(replacement, emEl);
              });
              
              // Get the text content which preserves line breaks
              const textWithLineBreaks = clonedElement.textContent.trim();
              
              if (textWithLineBreaks) {
                  QAClipper.Utils.addTextItem(contentItems, textWithLineBreaks);
              }
          } else {
              // First check if this paragraph contains KaTeX elements
              const katexElements = element.querySelectorAll('.katex-display, .katex:not(.katex-display .katex)');
              if (katexElements.length > 0) {
                  // Process the paragraph with KaTeX elements
                  let processedText = '';
                  const childNodes = Array.from(element.childNodes);
                  
                  childNodes.forEach(node => {
                      if (node.nodeType === Node.TEXT_NODE) {
                          processedText += node.textContent;
                      } else if (node.nodeType === Node.ELEMENT_NODE) {
                          const katexContainer = node.closest('.katex-display') || (node.classList && node.classList.contains('katex-display'));
                          const inlineKatex = node.classList && node.classList.contains('katex') && !katexContainer;
                          
                          if (katexContainer || inlineKatex) {
                              const katexMath = processKaTeX(node);
                              if (katexMath) {
                                  processedText += katexMath;
                              }
                          } else {
                              // For non-KaTeX elements, handle inline markdown formatting
                              // htmlToMarkdown only processes children, not the element itself
                              const tagName = node.tagName.toLowerCase();
                              const innerContent = QAClipper.Utils.htmlToMarkdown(node, { skipElementCheck: shouldSkipElement }).trim();
                              
                              if (tagName === 'strong' || tagName === 'b') {
                                  processedText += `**${innerContent}**`;
                              } else if (tagName === 'em' || tagName === 'i') {
                                  processedText += `*${innerContent}*`;
                              } else if (tagName === 'code') {
                                  processedText += `\`${innerContent}\``;
                              } else if (tagName === 'a') {
                                  const href = node.getAttribute('href');
                                  if (href) {
                                      processedText += `[${innerContent}](${href})`;
                                  } else {
                                      processedText += innerContent;
                                  }
                              } else if (innerContent) {
                                  processedText += innerContent;
                              }
                          }
                      }
                  });
                  
                  if (processedText.trim()) {
                      QAClipper.Utils.addTextItem(contentItems, processedText.trim());
                  }
              } else {
                  // Regular paragraph without KaTeX
                  const markdownText = QAClipper.Utils.htmlToMarkdown(element, { skipElementCheck: shouldSkipElement }).trim();
                  if (markdownText) QAClipper.Utils.addTextItem(contentItems, markdownText);
              }
          }
      } else if (tagNameLower === 'span') {
          // Check if this is a KaTeX container at the top level
          if (element.classList.contains('katex-display') || element.classList.contains('katex')) {
              const katexMath = processKaTeX(element);
              if (katexMath) {
                  QAClipper.Utils.addTextItem(contentItems, katexMath);
              }
          } else {
              // Regular span processing
              const spanMarkdown = QAClipper.Utils.htmlToMarkdown(element, { skipElementCheck: shouldSkipElement }).trim();
              if (spanMarkdown) {
                  QAClipper.Utils.addTextItem(contentItems, spanMarkdown);
              }
          }
      } else if (tagNameLower === 'ul') {
          const listMarkdown = processList(element, 'ul', 0);
          if (listMarkdown) contentItems.push({ type: 'text', content: listMarkdown });
      } else if (tagNameLower === 'ol') {
          const listMarkdown = processList(element, 'ol', 0);
          if (listMarkdown) contentItems.push({ type: 'text', content: listMarkdown });
      } else if (tagNameLower === 'pre') {
          // Check if the pre element contains a table first
          const tableElement = element.querySelector(selectors.tableElement);
          if (tableElement) {
              // Process as a table if found
              item = processTableToMarkdown(tableElement);
          } else {
              // Process as a code block if no table is found
              item = processCodeBlock(element);
          }
          if (item) contentItems.push(item);
      } else if (tagNameLower === 'blockquote') {
          const blockquoteContent = processBlockquote(element, 0);
          if (blockquoteContent) {
              QAClipper.Utils.addTextItem(contentItems, blockquoteContent);
          }
      } else if (tagNameLower.match(/^h[1-6]$/)) { // Handle headings h1-h6
          const level = parseInt(tagNameLower.substring(1), 10);
          const prefix = '#'.repeat(level);
          const headingText = QAClipper.Utils.htmlToMarkdown(element, {
              skipElementCheck: shouldSkipElement
          }).trim();
          if (headingText) {
              QAClipper.Utils.addTextItem(contentItems, `${prefix} ${headingText}`);
          }
      } else if (tagNameLower === 'hr') { // Handle horizontal rules
          QAClipper.Utils.addTextItem(contentItems, '---');
      } else if (tagNameLower === 'div') {
          // Check if this is a table container (div.overflow-x-auto containing a table)
          const tableElement = element.querySelector(':scope > table');
          if (tableElement && element.classList.contains('overflow-x-auto')) {
              // This is a table container - process the table
              item = processTableToMarkdown(tableElement);
              if (item) contentItems.push(item);
          }
          // Check if this is a code block container with the new structure
          else if (element.querySelector('pre.code-block__code')) {
              // This is a code block container - process it
              item = processCodeBlock(element); // Pass the container div, not just the pre
              if (item) contentItems.push(item);
          } else {
              // Check for KaTeX elements in the div
              const katexElements = element.querySelectorAll('.katex-display, .katex:not(.katex-display .katex)');
              if (katexElements.length > 0) {
                  // Process each KaTeX element separately
                  katexElements.forEach(katexEl => {
                      const katexMath = processKaTeX(katexEl);
                      if (katexMath) {
                          QAClipper.Utils.addTextItem(contentItems, katexMath);
                      }
                  });
              } else {
                  // For other divs, try generic markdown conversion
                  const divMarkdown = QAClipper.Utils.htmlToMarkdown(element, { skipElementCheck: shouldSkipElement }).trim();
                  if (divMarkdown) {
                      QAClipper.Utils.addTextItem(contentItems, divMarkdown);
                  }
              }
          }
      }
  }

  // --- Main Configuration Object ---
  const claudeConfig = {
    platformName: 'Claude',
    version: 13, // Handle Opus 4.6 reasoning UI, keep full assistant response extraction
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
      assistantMessageContainer: 'div.font-claude-response',
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
      tableContainer: 'div.overflow-x-auto, pre.font-styrene', // Container divs or pre elements containing tables
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
          // Special handling for whitespace-pre-wrap paragraphs
          if (child.classList.contains('whitespace-pre-wrap')) {
            // For whitespace-pre-wrap, we need to preserve the exact text including line breaks
            // First, clone the element to avoid modifying the original
            const clonedChild = child.cloneNode(true);
            
            // Replace inline code elements with markdown syntax
            const codeElements = clonedChild.querySelectorAll('code');
            codeElements.forEach(codeEl => {
              const codeText = codeEl.textContent;
              const replacement = document.createTextNode(`\`${codeText}\``);
              codeEl.parentNode.replaceChild(replacement, codeEl);
            });
            
            // Replace strong elements with markdown syntax
            const strongElements = clonedChild.querySelectorAll('strong');
            strongElements.forEach(strongEl => {
              const strongText = strongEl.textContent;
              const replacement = document.createTextNode(`**${strongText}**`);
              strongEl.parentNode.replaceChild(replacement, strongEl);
            });
            
            // Replace em elements with markdown syntax
            const emElements = clonedChild.querySelectorAll('em');
            emElements.forEach(emEl => {
              const emText = emEl.textContent;
              const replacement = document.createTextNode(`*${emText}*`);
              emEl.parentNode.replaceChild(replacement, emEl);
            });
            
            // Replace del (strikethrough) elements with markdown syntax
            convertDelToMarkdown(clonedChild);
            
            // Get the text content which preserves line breaks
            const textWithLineBreaks = clonedChild.textContent.trim();
            
            if (textWithLineBreaks) {
              QAClipper.Utils.addTextItem(contentItems, textWithLineBreaks);
            }
          } else {
            // For regular paragraphs, clone and convert del tags before markdown conversion
            const clonedChild = child.cloneNode(true);
            convertDelToMarkdown(clonedChild);
            const markdownText = QAClipper.Utils.htmlToMarkdown(clonedChild, { skipElementCheck: shouldSkipElement }).trim();
            if (markdownText) QAClipper.Utils.addTextItem(contentItems, markdownText);
          }
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
            const clonedChild = child.cloneNode(true);
            convertDelToMarkdown(clonedChild);
            const headingText = QAClipper.Utils.htmlToMarkdown(clonedChild, { skipElementCheck: shouldSkipElement }).trim();
            if (headingText) {
                QAClipper.Utils.addTextItem(contentItems, `${prefix} ${headingText}`);
            }
        } else {
            // For other elements, try a generic conversion
             const clonedChild = child.cloneNode(true);
             convertDelToMarkdown(clonedChild);
             const fallbackText = QAClipper.Utils.htmlToMarkdown(clonedChild, { skipElementCheck: shouldSkipElement }).trim();
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
              catch (e) { console.error("[Claude Extractor v7] Error creating absolute URL for image:", e, src); }
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
      const contentGridSelector = 'div.standard-markdown, div.grid-cols-1.grid.gap-2\\.5, div[class*="grid-cols-1"][class*="grid"][class*="gap-"]';
      const assistantContainer = turnElement.querySelector(selectors.assistantMessageContainer);
      
      if (!assistantContainer) {
          console.warn("[Claude Extractor v8] Assistant container not found");
          return contentItems;
      }

      // Process all direct children of the assistant container to handle multiple content blocks
      const directChildren = Array.from(assistantContainer.children);
      
      directChildren.forEach((child) => {
          const tagNameLower = child.tagName.toLowerCase();

          // Skip thinking/reasoning blocks (the collapsible section showing AI's internal reasoning)
          if (isThinkingBlock(child)) {
              return;
          }

          // Skip flex spacing elements
          if (child.classList.contains('flex') && child.classList.contains('flex-col') && child.classList.contains('gap-2')) {
              return;
          }

          if (tagNameLower === 'div') {
              // Collect candidate blocks in DOM order so text + artifact can coexist in one container.
              const candidateBlocks = [];
              if (child.matches(contentGridSelector) || child.matches(selectors.artifactButton)) {
                  candidateBlocks.push(child);
              }
              candidateBlocks.push(...child.querySelectorAll(`${contentGridSelector}, ${selectors.artifactButton}`));

              // De-duplicate while preserving order
              const seen = new Set();
              const orderedBlocks = candidateBlocks.filter((element) => {
                  if (seen.has(element)) return false;
                  seen.add(element);
                  return true;
              });

              let handledSubBlocks = false;

              orderedBlocks.forEach((block) => {
                  if (block.matches(selectors.artifactButton)) {
                      const item = processArtifactButton(block);
                      if (item) contentItems.push(item);
                      handledSubBlocks = true;
                      return;
                  }

                  if (isReasoningContentGrid(block, assistantContainer)) {
                      return;
                  }

                  // Process children of each non-reasoning content grid
                  const gridChildren = Array.from(block.children);
                  if (gridChildren.length > 0) {
                      gridChildren.forEach((gridChild) => {
                          processContentElement(gridChild, contentItems, selectors);
                      });
                      handledSubBlocks = true;
                  } else {
                      processContentElement(block, contentItems, selectors);
                      handledSubBlocks = true;
                  }
              });

              if (orderedBlocks.length === 0 && !handledSubBlocks) {
                  // If no grid found, process this div directly
                  processContentElement(child, contentItems, selectors);
              }
          } else {
              // Process non-div elements directly
              processContentElement(child, contentItems, selectors);
          }
      });

      // console.log("[Claude Extractor v13] Final assistant contentItems:", JSON.stringify(contentItems, null, 2));
      return contentItems;
    }, // End extractAssistantContent

  }; // End claudeConfig

  // Assign to window object
  window.claudeConfig = claudeConfig;
  console.log("claudeConfig.js initialized (v" + claudeConfig.version + ") - handle Opus 4.6 reasoning UI and extract full assistant response");

})(); // End of IIFE
