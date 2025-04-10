// geminiConfigs.js (v31 - All Headings Support Simplified)

(function() {
    // Initialization check
    // v31: Increment version number and add h1-h6 support
    if (window.geminiConfig && window.geminiConfig.version >= 31) { return; }

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
             tagNameLower === 'blockquote' || // Skip blockquotes for dedicated processing
             tagNameLower === 'table'; // Skip table at top level
    }

    /**
     * Processes list elements (ul, ol) into markdown text.
     * Updated to handle blockquotes within list items correctly
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
            // Create a working copy to process direct content
            const liClone = li.cloneNode(true);
            
            // Find all nested elements we want to handle separately 
            const nestedLists = Array.from(li.querySelectorAll(':scope > ul, :scope > ol'));
            const blockquotes = Array.from(li.querySelectorAll(':scope > blockquote'));
            
            // Remove nested elements from clone
            Array.from(liClone.querySelectorAll('ul, ol, blockquote')).forEach(nestedEl => {
                if (nestedEl.parentNode) {
                    nestedEl.parentNode.removeChild(nestedEl);
                }
            });
            
            // Get direct text content
            const directContent = QAClipper.Utils.htmlToMarkdown(liClone, {
                ignoreTags: ['ul', 'ol', 'blockquote']
            }).trim();
            
            // Marker for this list item 
            const marker = listType === 'ul' ? '-' : `${startNum + itemIndex}.`;
            const indent = '  '.repeat(nestLevel);
            const nestedIndent = '  '.repeat(nestLevel + 1);
            
            let contentAdded = false;
            
            // 1. Process direct content first (if any)
            if (directContent) {
                lines.push(`${indent}${marker} ${directContent}`);
                contentAdded = true;
            }
            
            // 2. Process blockquotes - maintain proper indentation and list structure
            if (blockquotes.length > 0) {
                blockquotes.forEach(bq => {
                    // Process each blockquote
                    const blockquoteContent = processNestedBlockquote(bq);
                    
                    if (blockquoteContent) {
                        const bqLines = blockquoteContent.split('\n');
                        
                        // If there was no direct content yet, add the list marker to the first line
                        if (!contentAdded) {
                            lines.push(`${indent}${marker} ${bqLines[0]}`);
                            // Add remaining lines with proper indentation
                            for (let i = 1; i < bqLines.length; i++) {
                                lines.push(`${nestedIndent}${bqLines[i]}`);
                            }
                            contentAdded = true;
                        } else {
                            // Otherwise indent all blockquote lines under the list item
                            bqLines.forEach(line => {
                                lines.push(`${nestedIndent}${line}`);
                            });
                        }
                    }
                });
            }
            
            // 3. Process nested lists
            if (nestedLists.length > 0) {
                nestedLists.forEach(nestedList => {
                    const nestedType = nestedList.tagName.toLowerCase();
                    const nestedResult = processList(nestedList, nestedType, nestLevel + 1);
                    
                    if (nestedResult && nestedResult.content) {
                        const nestedLines = nestedResult.content.split('\n');
                        
                        // If there was no content yet, add the list marker to the first line
                        if (!contentAdded) {
                            // Extract the first line and add our marker
                            const firstLine = nestedLines[0].replace(/^\s*[-*0-9.]+\s+/, '');
                            lines.push(`${indent}${marker} ${firstLine}`);
                            
                            // Add the remaining lines as is
                            for (let i = 1; i < nestedLines.length; i++) {
                                lines.push(nestedLines[i]);
                            }
                            contentAdded = true;
                        } else {
                            // Just add the nested list content
                            lines.push(nestedResult.content);
                        }
                    }
                });
            }
            
            // If no content was added for this list item, add an empty item
            if (!contentAdded) {
                lines.push(`${indent}${marker} `);
            }
            
            // Always increment index for ordered lists
            if (listType === 'ol') {
                itemIndex++;
            }
        });
        
        return lines.length > 0 ? { type: 'text', content: lines.join('\n') } : null;
    }
    
    /**
     * Process nested blockquotes within list items
     * @param {HTMLElement} blockquote - The blockquote element 
     * @returns {string} - The processed blockquote content with proper markers
     */
    function processNestedBlockquote(blockquote) {
        const lines = [];
        
        // Process all child nodes
        Array.from(blockquote.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                    lines.push(`> ${text}`);
                }
            } 
            else if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                
                // Handle nested blockquotes recursively
                if (tagName === 'blockquote') {
                    const nestedContent = processNestedBlockquote(node);
                    if (nestedContent) {
                        // Add an additional '>' to each line for nesting
                        nestedContent.split('\n').forEach(line => {
                            lines.push(`>${line}`);
                        });
                    }
                }
                // Handle paragraphs and other elements
                else {
                    const content = QAClipper.Utils.htmlToMarkdown(node, {
                        ignoreTags: ['blockquote']
                    }).trim();
                    
                    if (content) {
                        content.split('\n').forEach(line => {
                            lines.push(`> ${line}`);
                        });
                    }
                }
            }
        });
        
        return lines.join('\n');
    }

    /**
     * Comprehensive blockquote processor that preserves hierarchy and nested content
     * @param {HTMLElement} element - The blockquote element to process
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
        
        for (let i = 0; i < childNodes.length; i++) {
            const node = childNodes[i];
            
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
                continue;
            }
            
            // Handle element nodes
            if (node.nodeType === Node.ELEMENT_NODE) {
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
                    continue;
                }
                
                // Handle paragraphs
                if (tagName === 'p') {
                    // If the previous element was a nested blockquote, add an empty line with just the blockquote prefix
                    if (previousWasNestedBlockquote) {
                        resultLines.push(`${prefix}`);
                        previousWasNestedBlockquote = false;
                    }
                    
                    // Add a blank line before paragraphs if needed
                    if (resultLines.length > 0 && !previousWasBlock) {
                        resultLines.push(`${prefix}`);
                    }
                    
                    // Use markdown conversion to handle formatting correctly
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
                    continue;
                }
                
                // Handle nested blockquotes
                if (tagName === 'blockquote') {
                    // Add spacing before nested blockquote if needed
                    if (resultLines.length > 0 && !previousWasBlock) {
                        resultLines.push(`${prefix}`);
                    }
                    
                    const nestedContent = processBlockquote(node, nestLevel + 1);
                    if (nestedContent) {
                        resultLines.push(nestedContent);
                        // No extra blank line after a blockquote - it already has its own spacing
                        previousWasBlock = true;
                        previousWasNestedBlockquote = true;
                    }
                    continue;
                }
                
                // Handle lists
                if (tagName === 'ul' || tagName === 'ol') {
                    // If the previous element was a nested blockquote, add an empty line with just the blockquote prefix
                    if (previousWasNestedBlockquote) {
                        resultLines.push(`${prefix}`);
                        previousWasNestedBlockquote = false;
                    }
                    
                    // Add spacing before list if needed
                    if (resultLines.length > 0 && !previousWasBlock) {
                        resultLines.push(`${prefix}`);
                    }
                    
                    const listResult = processListInBlockquote(node, tagName, 0, nestLevel);
                    if (listResult && listResult.content) {
                        resultLines.push(listResult.content);
                        // Don't add blank line after a list
                        previousWasBlock = false;
                    }
                    continue;
                }
                
                // Handle other elements (like spans, strong, etc.)
                if (previousWasNestedBlockquote) {
                    resultLines.push(`${prefix}`);
                    previousWasNestedBlockquote = false;
                }
                
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
     * Process a list element within a blockquote with proper formatting
     * @param {HTMLElement} el - The list element (ul or ol)
     * @param {string} listType - 'ul' or 'ol'
     * @param {number} listLevel - The nesting level of the list (0 for top level)
     * @param {number} blockquoteLevel - The nesting level of the parent blockquote
     * @returns {object|null} - A text content item or null
     */
    function processListInBlockquote(el, listType, listLevel = 0, blockquoteLevel = 0) {
        let lines = [];
        let startNum = 1;
        if (listType === 'ol') {
            startNum = parseInt(el.getAttribute('start') || '1', 10);
            if (isNaN(startNum)) startNum = 1;
        }
        
        let itemIndex = 0;
        el.querySelectorAll(':scope > li').forEach(li => {
            // Create the blockquote prefix
            const bqPrefix = '> '.repeat(blockquoteLevel + 1);
            
            // Create the list marker and indentation
            const marker = listType === 'ul' ? '-' : `${startNum + itemIndex}.`;
            const indent = '  '.repeat(listLevel);
            
            // Create a working copy to process direct content
            const liClone = li.cloneNode(true);
            
            // Track original elements to process separately
            let originalNestedLists = Array.from(li.querySelectorAll(':scope > ul, :scope > ol'));
            let originalNestedBq = Array.from(li.querySelectorAll(':scope > blockquote'));
            
            // Remove nested lists and blockquotes from clone
            Array.from(liClone.querySelectorAll('ul, ol, blockquote')).forEach(nestedEl => {
                if (nestedEl.parentNode) {
                    nestedEl.parentNode.removeChild(nestedEl);
                }
            });
            
            // Process direct content first (without nested elements)
            let directContent = QAClipper.Utils.htmlToMarkdown(liClone, {
                ignoreTags: ['ul', 'ol', 'blockquote']
            }).trim();
            
            if (directContent) {
                lines.push(`${bqPrefix}${indent}${marker} ${directContent}`);
                if (listType === 'ol') itemIndex++;
            }
            
            // Process nested blockquotes within this item
            originalNestedBq.forEach(bq => {
                // For nested blockquotes, increase the blockquote level
                const nestedBqContent = processBlockquote(bq, blockquoteLevel + 1);
                if (nestedBqContent) {
                    if (!directContent) {
                        // If no direct content, add marker to first line
                        const bqLines = nestedBqContent.split('\n');
                        if (bqLines.length > 0) {
                            // Keep blockquote marker but add list marker
                            bqLines[0] = `${bqPrefix}${indent}${marker} ${bqLines[0].substring(bqPrefix.length)}`;
                            lines.push(bqLines.join('\n'));
                            if (listType === 'ol') itemIndex++;
                            directContent = true;
                        }
                    } else {
                        // Add nested blockquote with proper indentation
                        const nestedIndent = '  '.repeat(listLevel + 1);
                        lines.push(nestedBqContent);
                    }
                }
            });
            
            // Process any nested lists
            originalNestedLists.forEach(nestedList => {
                const nestedType = nestedList.tagName.toLowerCase();
                const nestedResult = processListInBlockquote(nestedList, nestedType, listLevel + 1, blockquoteLevel);
                if (nestedResult && nestedResult.content) {
                    if (!directContent) {
                        // If no direct content, format first line with list marker
                        const nestedLines = nestedResult.content.split('\n');
                        if (nestedLines.length > 0) {
                            // Format first line with list marker while preserving blockquote prefix
                            const firstLine = nestedLines[0].substring(bqPrefix.length); // Remove bq prefix
                            nestedLines[0] = `${bqPrefix}${indent}${marker} ${firstLine.trimStart()}`;
                            lines.push(nestedLines.join('\n'));
                            if (listType === 'ol') itemIndex++;
                            directContent = true;
                        }
                    } else {
                        lines.push(nestedResult.content);
                    }
                }
            });
            
            // If no content was added for this list item, add an empty item
            if (!directContent) {
                lines.push(`${bqPrefix}${indent}${marker} `);
                if (listType === 'ol') itemIndex++;
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
        // console.log("  -> [Table Processor v31] Processing table:", tableElement);

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
                    // console.log(`  -> [Table Processor v31] Header found in thead with ${columnCount} columns.`);
                } else { } // console.log("  -> [Table Processor v31] thead row found but no 'th' cells.");
            } else { } // console.log("  -> [Table Processor v31] 'thead' found but no 'tr' inside.");
        } else { } // console.log("  -> [Table Processor v31] No 'thead' found in table.");

        // If no header found in thead, try tbody
        const tbody = tableElement.querySelector(':scope > tbody');
        if (columnCount === 0 && tbody) {
            // console.log("  -> [Table Processor v31] Attempting to find header row in 'tbody'.");
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
                     // console.log(`  -> [Table Processor v31] Found 'th' header row in 'tbody' with ${columnCount} columns.`);
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
                        console.warn(`  -> [Table Processor v31] Using first 'tbody' row with TDs as header (${columnCount} columns).`);
                    }
                }
            }
        }

        // Abort if no header could be determined
        if (columnCount === 0) {
            console.warn("[Extractor v31 - Table] Table has no discernible header. Cannot generate Markdown.", tableElement);
            return null;
        }

        // Process Body (tbody)
        if (tbody) {
            const bodyRows = tbody.querySelectorAll(':scope > tr');
            // console.log(`  -> [Table Processor v31] Processing ${bodyRows.length} rows in 'tbody'.`);
            bodyRows.forEach((row, rowIndex) => {
                // *** v30: ADDED CHECK ***: Skip the row if it was identified as the tbody header row
                if (row === tbodyHeaderRow) {
                    // console.log(`  -> [Table Processor v31] Skipping row ${rowIndex+1} as it was used as tbody header.`);
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
                    console.warn(`  -> [Table Processor v31] Data row ${rowIndex+1} skipped. Expected ${columnCount} 'td' cells, found ${cells.length}.`, row);
                }
            });
        } else {
            // console.log("  -> [Table Processor v31] No 'tbody' found in table.");
        }

        // Need header + separator (already counted in headerRowCount) + optional data rows
        if (headerRowCount > 0) { // Check if header was successfully added
             // console.log("  -> [Table Processor v31] Successfully generated Markdown table.");
             // Ensure there's at least header + separator before joining
             return markdownRows.length >= 2 ? markdownRows.join('\n') : null;
        } else {
             // This path shouldn't be reached if columnCount > 0 check passed, but added for safety
             console.warn("  -> [Table Processor v31] Failed to generate valid Markdown (header processing failed).");
             return null;
        }
    }


    // --- Main Configuration Object ---
    const geminiConfig = {
      platformName: 'Gemini',
      version: 31, // v31: Config version identifier
      selectors: {
        turnContainer: 'user-query, model-response',
        userMessageContainer: 'user-query', userText: '.query-text',
        userImageContainer: 'user-query-file-preview', userImageLink: 'a[href^="https://lens.google.com/uploadbyurl?url="]',
        userFileContainer: '.file-preview-container', userFileItem: '.file-upload-link', userFileName: '.new-file-name', userFileType: '.new-file-type',
        assistantContentArea: 'div.markdown.markdown-main-panel',
        // Added all heading levels (h1-h6) to relevantBlocks
        relevantBlocks: 'p, h1, h2, h3, h4, h5, h6, ul, ol, code-block, single-image, div.attachment-container.immersive-entry-chip, table, blockquote',
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
                      } catch (e) { console.error("[Extractor v31] Error parsing user image URL:", e, href); }
                  }
              }
          });
          return images;
      },
      extractUserUploadedFiles: (turnElement) => { const f=[]; turnElement.querySelectorAll(':scope '+geminiConfig.selectors.userFileContainer).forEach(c=>{const nE=c.querySelector(geminiConfig.selectors.userFileName),tE=c.querySelector(geminiConfig.selectors.userFileType); if(nE){const n=nE.textContent?.trim(),t=tE?.textContent?.trim()||'U';let eC=null;const p=c.querySelector('.file-preview-content,.text-preview,pre');if(p)eC=p.textContent?.trim()||null; if(n)f.push({type:'file',fileName:n,fileType:t,isPreviewOnly:!eC,extractedContent:eC});}}); return f; },
      extractSideContainerCode: () => { return null; },

      /**
       * Extracts structured content using querySelectorAll.
       * v31: Added handling for all heading tags (h1-h6) and blockquotes.
       */
      extractAssistantContent: (turnElement) => {
          const contentItems = [];
          const contentArea = turnElement.querySelector(geminiConfig.selectors.assistantContentArea);
          if (!contentArea) { console.warn("[Extractor v31] Gemini markdown content area not found."); return []; }

          // console.log("[Extractor v31] Starting assistant extraction (Added h1-h6 and blockquote support)");

          const relevantElements = contentArea.querySelectorAll(geminiConfig.selectors.relevantBlocks);
          // console.log(`[Extractor v31] Found ${relevantElements.length} relevant block elements.`);
          const processedElements = new Set();

          relevantElements.forEach((element, index) => {
              if (processedElements.has(element)) return;

              const tagNameLower = element.tagName.toLowerCase();
              const isHeading = tagNameLower.match(/^h[1-6]$/);
              const isBlockquote = tagNameLower === 'blockquote';
              const isInteractiveBlock = element.matches(geminiConfig.selectors.interactiveBlockContainer);
              const isImageContainer = element.matches(geminiConfig.selectors.imageContainerAssistant);
              const isCodeBlock = tagNameLower === 'code-block';
              const isTable = tagNameLower === 'table';

              // console.log(`[Extractor v31] Processing Element #${index}: <${tagNameLower}>`);
              let item = null;

              // --- Process based on type ---
              if (isHeading) {
                  // console.log(`  -> Handling as Heading (${tagNameLower})`);
                  
                  // Simple heading processing without separate function
                  const level = parseInt(tagNameLower.charAt(1));
                  const headingMarkup = '#'.repeat(level);
                  const headingText = element.textContent.trim();
                  
                  if (headingText) {
                      QAClipper.Utils.addTextItem(contentItems, `${headingMarkup} ${headingText}`);
                  }
                  
                  processedElements.add(element);
              }
              else if (isBlockquote) {
                  // console.log("  -> Handling as Blockquote");
                  
                  // Process the blockquote using the dedicated function
                  // Starting at nesting level 0 for top-level blockquotes
                  const blockquoteMarkdown = processBlockquote(element, 0);
                  if (blockquoteMarkdown) {
                      QAClipper.Utils.addTextItem(contentItems, blockquoteMarkdown);
                  }
                  
                  // Mark the blockquote and all its children as processed
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isInteractiveBlock) {
                  // console.log("  -> Handling as Interactive Block");
                  const titleElement = element.querySelector(geminiConfig.selectors.interactiveBlockTitle);
                  const title = titleElement ? titleElement.textContent?.trim() : '[Interactive Block]';
                  contentItems.push({ type: 'interactive_block', title: title, code: null, language: null });
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isCodeBlock) {
                  // console.log("  -> Handling as Code Block");
                  item = processCodeBlock(element);
                  if (item) contentItems.push(item);
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isTable) { // Use the updated table processor
                   // console.log("  -> Handling as Table");
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
                  // console.log(`  -> Handling as ${tagNameLower.toUpperCase()}`);
                  // Use our improved processList function for better handling of nested elements
                  item = processList(element, tagNameLower, 0);
                  if (item) contentItems.push(item);
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
               else if (isImageContainer) {
                   // console.log("  -> Handling as Direct Image Container");
                   item = processImage(element);
                   if (item) contentItems.push(item);
                   processedElements.add(element);
                   element.querySelectorAll('*').forEach(child => processedElements.add(child));
               }
              else if (tagNameLower === 'p') {
                   // console.log("  -> Handling as P tag");
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

          // console.log("[Extractor v31] Final contentItems generated:", JSON.stringify(contentItems, null, 2));
          return contentItems;
      }, // End extractAssistantContent

    }; // End geminiConfig

    window.geminiConfig = geminiConfig;
    // console.log("geminiConfig initialized (v31 - Added h1-h6 and blockquote support)");
})(); // End of IIFE