// geminiConfigs.js (v40 - Added artifactType extraction for interactive blocks)

(function() {
    // Initialization check
    // v41: Updated to skip thinking process and focus only on actual response content
    if (window.geminiConfig && window.geminiConfig.version >= 41) { return; }

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
             tagNameLower === 'response-element' || // Skip response-element for dedicated processing
             tagNameLower === 'table'; // Skip table at top level
    }

    /**
     * v37: Enhanced code block processing that handles mixed content with proper indentation tracking
     * @param {HTMLElement} codeEl - The code-block element
     * @returns {Array} - Array of content items (code blocks and text)
     */
    function processEnhancedCodeBlock(codeEl) {
        const results = [];
        let language = null;
        
        // Get language from decoration if available
        const langElement = codeEl.querySelector('.code-block-decoration > span');
        if (langElement) {
            language = langElement.textContent?.trim();
        }
        
        // Get code content
        const codeElement = codeEl.querySelector('code[data-test-id="code-content"]');
        if (codeElement) {
            // v37: Don't use trim() as it removes meaningful leading/trailing spaces
            // Only remove leading/trailing newlines while preserving internal spacing
            let rawContent = codeElement.textContent || '';
            rawContent = rawContent.replace(/^\n+/, '').replace(/\n+$/, '');
            
            // v37: Enhanced mixed content handling with proper code block language detection and indentation
            if (rawContent.includes('```') && (rawContent.includes('- ') || rawContent.includes('1.'))) {
                // This is mixed content, need to split it properly
                const lines = rawContent.split('\n');
                let currentCodeLines = [];
                let currentMarkdownLines = [];
                let inCodeBlock = true; // Start assuming we're in code
                let currentCodeLanguage = language; // Track language for current code block
                let codeBlockIndent = ''; // Track indentation level for code blocks
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const trimmedLine = line.trim();
                    
                    // Check for transitions
                    if (trimmedLine === '```') {
                        // End of current code block
                        if (currentCodeLines.length > 0) {
                            results.push({
                                type: 'code_block',
                                language: currentCodeLanguage,
                                content: currentCodeLines.join('\n'),
                                indentLevel: codeBlockIndent
                            });
                            currentCodeLines = [];
                        }
                        inCodeBlock = false;
                        continue;
                    }
                    
                    // Check for start of markdown list
                    if (trimmedLine.match(/^-\s/) || trimmedLine.match(/^\d+\.\s/)) {
                        // This is markdown content
                        if (currentCodeLines.length > 0 && inCodeBlock) {
                            // Save current code block
                            results.push({
                                type: 'code_block',
                                language: currentCodeLanguage,
                                content: currentCodeLines.join('\n'),
                                indentLevel: codeBlockIndent
                            });
                            currentCodeLines = [];
                        }
                        inCodeBlock = false;
                        currentMarkdownLines.push(line);
                        continue;
                    }
                    
                    // Check for return to code (```python or similar)
                    const codeBlockMatch = trimmedLine.match(/^```(\w+)$/);
                    if (codeBlockMatch) {
                        // Save accumulated markdown
                        if (currentMarkdownLines.length > 0) {
                            results.push({
                                type: 'text',
                                content: currentMarkdownLines.join('\n').trim()
                            });
                            currentMarkdownLines = [];
                        }
                        
                        // Use the actual indentation from the ```python line itself
                        const actualIndentMatch = line.match(/^(\s*)/);
                        codeBlockIndent = actualIndentMatch ? actualIndentMatch[1] : '';
                        
                        // Set language for the new code block
                        currentCodeLanguage = codeBlockMatch[1];
                        inCodeBlock = true;
                        continue;
                    }
                    
                    // Accumulate content based on current mode
                    if (inCodeBlock) {
                        currentCodeLines.push(line);
                    } else {
                        currentMarkdownLines.push(line);
                    }
                }
                
                // Handle remaining content
                if (currentCodeLines.length > 0) {
                    results.push({
                        type: 'code_block',
                        language: currentCodeLanguage,
                        content: currentCodeLines.join('\n'),
                        indentLevel: codeBlockIndent
                    });
                }
                if (currentMarkdownLines.length > 0) {
                    results.push({
                        type: 'text',
                        content: currentMarkdownLines.join('\n').trim()
                    });
                }
            } else {
                // Simple case - just code content
                if (rawContent) {
                    results.push({
                        type: 'code_block',
                        language: language,
                        content: rawContent
                    });
                }
            }
        }
        
        return results.length > 0 ? results : [null];
    }

    /**
     * Processes list elements (ul, ol) into markdown text.
     * Updated to handle code blocks and blockquotes within list items correctly
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
            // Special handling for Gemini's response-element and code-block elements 
            const nestedLists = Array.from(li.querySelectorAll(':scope > ul, :scope > ol'));
            const blockquotes = Array.from(li.querySelectorAll(':scope > blockquote'));
            
            // For Gemini, code blocks are inside response-element > code-block elements
            const codeBlocks = [];
            const responseElements = Array.from(li.querySelectorAll(':scope > response-element'));
            responseElements.forEach(respEl => {
                const codeBlockEls = respEl.querySelectorAll('code-block');
                codeBlockEls.forEach(codeBlock => {
                    codeBlocks.push(codeBlock);
                });
            });
            
            // Also check for direct code-block and pre elements
            Array.from(li.querySelectorAll(':scope > code-block, :scope > pre')).forEach(codeEl => {
                codeBlocks.push(codeEl);
            });
            
            // Remove nested elements from clone
            Array.from(liClone.querySelectorAll('ul, ol, blockquote, code-block, pre, response-element')).forEach(nestedEl => {
                if (nestedEl.parentNode) {
                    nestedEl.parentNode.removeChild(nestedEl);
                }
            });
            
            // Get direct text content
            const directContent = QAClipper.Utils.htmlToMarkdown(liClone, {
                ignoreTags: ['ul', 'ol', 'blockquote', 'code-block', 'pre', 'response-element']
            }).trim();
            
            // Marker for this list item 
            const marker = listType === 'ul' ? '-' : `${startNum + itemIndex}.`;
            const indent = '    '.repeat(nestLevel);
            const nestedIndent = '    '.repeat(nestLevel + 1);
            
            let contentAdded = false;
            
            // 1. Process direct content first (if any)
            if (directContent) {
                const contentLines = directContent.split('\n');
                if (contentLines.length > 0) {
                    // First line with marker
                    lines.push(`${indent}${marker} ${contentLines[0]}`);
                    // Remaining lines with nested indentation
                    for (let i = 1; i < contentLines.length; i++) {
                        lines.push(`${nestedIndent}${contentLines[i]}`);
                    }
                    contentAdded = true;
                }
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
            
            // 3. Process code blocks within this list item
            if (codeBlocks.length > 0) {
                codeBlocks.forEach((codeEl, idx) => {
                    // v37: Use enhanced code block processing (now returns array)
                    const codeItems = processEnhancedCodeBlock(codeEl);
                    
                    codeItems.forEach(codeItem => {
                        if (!codeItem) return;
                        
                        if (codeItem.type === 'code_block') {
                            // Format code block with proper indentation
                            let codeContentLines = [];
                            const lang = codeItem.language || '';
                            codeContentLines.push(`\`\`\`${lang}`);
                            
                            // Add code lines with trimmed whitespace for consistent indentation
                            codeItem.content.split('\n').forEach(codeLine => {
                                const trimmedCodeLine = codeLine.replace(/^\s*/, '');
                                codeContentLines.push(trimmedCodeLine);
                            });
                            codeContentLines.push('```');

                            // Add the list marker line ONLY if no direct content was added before.
                            if (!contentAdded) {
                                 lines.push(`${indent}${marker} `); // Add marker on its own line
                                 contentAdded = true;
                            }

                            // Indent and add all code block lines using nestedIndent
                            codeContentLines.forEach(line => {
                                lines.push(`${nestedIndent}${line}`);
                            });
                        } else if (codeItem.type === 'text') {
                            // Handle extracted markdown content
                            const textLines = codeItem.content.split('\n');
                            
                            if (!contentAdded) {
                                lines.push(`${indent}${marker} ${textLines[0]}`);
                                for (let i = 1; i < textLines.length; i++) {
                                    lines.push(`${nestedIndent}${textLines[i]}`);
                                }
                                contentAdded = true;
                            } else {
                                textLines.forEach(line => {
                                    lines.push(`${nestedIndent}${line}`);
                                });
                            }
                        }
                    });
                });
            }
            
            // 4. Process nested lists
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
     * Helper function to process lists recursively within a blockquote.
     * @param {HTMLElement} listElement - The UL or OL element.
     * @param {Array<string>} lines - The array to push formatted lines to.
     * @param {number} level - The nesting level within the blockquote (0 for top-level list inside bq).
     * @param {Map<HTMLElement, boolean>} processedElements - To avoid infinite loops or reprocessing.
     */
    function processListInsideBlockquote(listElement, lines, level, processedElements) {
        if (processedElements.has(listElement)) return;
        processedElements.set(listElement, true);
    
        const isOrdered = listElement.tagName.toLowerCase() === 'ol';
        let startIdx = 1;
        if (isOrdered) {
            const startAttr = listElement.getAttribute('start');
            if (startAttr) {
                const parsed = parseInt(startAttr, 10);
                if (!isNaN(parsed)) startIdx = parsed;
            }
        }
    
        const indent = '    '.repeat(level);
        const listItems = listElement.querySelectorAll(':scope > li');
    
        listItems.forEach((item, idx) => {
            const marker = isOrdered ? `${startIdx + idx}.` : '-';
    
            // Process direct content of the list item
            const itemClone = item.cloneNode(true);
            // Remove only nested lists for direct content extraction
            Array.from(itemClone.querySelectorAll('ul, ol')).forEach(el => { 
                 if (el.parentNode) el.parentNode.removeChild(el);
            });
            const directContent = QAClipper.Utils.htmlToMarkdown(itemClone, { ignoreTags: ['ul', 'ol'] }).trim();
    
            // Add the line with blockquote prefix and indentation
            const linePrefix = `> ${indent}${marker} `;
            if (directContent) {
                const contentLines = directContent.split('\n');
                // Add the first line with the marker
                lines.push(linePrefix + contentLines[0]); 
                
                // Calculate continuation indent based on marker length
                const continuationIndent = ' '.repeat(marker.length + 1);
                
                // Add subsequent lines with proper continuation indentation
                for (let i = 1; i < contentLines.length; i++) {
                    // Use blockquote prefix, list level indent, and continuation indent
                    // Trim the line content itself to avoid leading spaces interfering
                    lines.push(`> ${indent}${continuationIndent}${contentLines[i].trim()}`);
                }
            } else {
                // Add '> - ' or '> 1. ' even if item is empty
                lines.push(linePrefix.trimEnd()); 
            }
    
            // Recursively process nested lists within this item
            const nestedLists = item.querySelectorAll(':scope > ul, :scope > ol');
            nestedLists.forEach(nestedList => {
                processListInsideBlockquote(nestedList, lines, level + 1, processedElements);
            });
        });
    }
    
        /**
     * v34: Enhanced blockquote processing that handles complex nested structures
     * Handles nested lists, code blocks, and other blockquotes recursively
     * @param {HTMLElement} blockquote - The blockquote element 
     * @returns {string} - The processed blockquote content with proper markers and nesting.
     */
    function processNestedBlockquote(blockquote) {
        const lines = [];
        const processedElements = new Set(); // Track processed elements to avoid duplication

        Array.from(blockquote.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) lines.push(`> ${text}`); 
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (processedElements.has(node)) return; // Skip if already processed
                
                const tagName = node.tagName.toLowerCase();

                if (tagName === 'blockquote') {
                    // Handle nested blockquotes recursively
                    const nestedContent = processNestedBlockquote(node);
                    if (nestedContent) {
                        nestedContent.split('\n').forEach(line => lines.push(`>${line}`)); 
                    }
                    processedElements.add(node);
                } 
                else if (tagName === 'ul' || tagName === 'ol') {
                    // v34: Enhanced list processing within blockquotes
                    const listResult = processList(node, tagName, 0);
                    if (listResult && listResult.content) {
                        // Add blockquote markers to each line of the list
                        listResult.content.split('\n').forEach(line => {
                            lines.push(`> ${line}`);
                        });
                    }
                    processedElements.add(node);
                }
                else if (tagName === 'response-element') {
                    // v38: Handle response-element containing code blocks using original indentation
                    const codeBlocks = node.querySelectorAll('code-block');
                    codeBlocks.forEach(codeBlock => {
                        const codeItems = processEnhancedCodeBlock(codeBlock);
                        codeItems.forEach(codeItem => {
                            if (!codeItem) return;
                            
                            if (codeItem.type === 'code_block') {
                                const lang = codeItem.language || '';
                                // Use the original indentation from the mixed content
                                const effectiveIndent = codeItem.indentLevel || '';
                                lines.push(`> ${effectiveIndent}\`\`\`${lang}`);
                                codeItem.content.split('\n').forEach(codeLine => {
                                    // Remove leading whitespace from code content and apply consistent indentation
                                    const trimmedCodeLine = codeLine.replace(/^\s*/, '');
                                    lines.push(`> ${effectiveIndent}${trimmedCodeLine}`);
                                });
                                lines.push(`> ${effectiveIndent}\`\`\``);
                            } else if (codeItem.type === 'text') {
                                codeItem.content.split('\n').forEach(textLine => {
                                    lines.push(`> ${textLine}`);
                                });
                            }
                        });
                        processedElements.add(codeBlock);
                    });
                    processedElements.add(node);
                }
                else if (tagName === 'code-block') {
                    // v34: Direct code block processing
                    const codeItems = processEnhancedCodeBlock(node);
                    codeItems.forEach(codeItem => {
                        if (!codeItem) return;
                        
                        if (codeItem.type === 'code_block') {
                            const lang = codeItem.language || '';
                            const indent = codeItem.indentLevel || '';
                            lines.push(`> ${indent}\`\`\`${lang}`);
                            codeItem.content.split('\n').forEach(codeLine => {
                                // Remove leading whitespace from code content and apply consistent indentation
                                const trimmedCodeLine = codeLine.replace(/^\s*/, '');
                                lines.push(`> ${indent}${trimmedCodeLine}`);
                            });
                            lines.push(`> ${indent}\`\`\``);
                        } else if (codeItem.type === 'text') {
                            codeItem.content.split('\n').forEach(textLine => {
                                lines.push(`> ${textLine}`);
                            });
                        }
                    });
                    processedElements.add(node);
                }
                else {
                    // Handle paragraphs and other elements
                    const content = QAClipper.Utils.htmlToMarkdown(node, { 
                        skipElementCheck: (el) => processedElements.has(el),
                        ignoreTags: ['blockquote', 'ul', 'ol', 'response-element', 'code-block'] 
                    }).trim(); 
                    if (content) {
                        content.split('\n').forEach(line => lines.push(`> ${line}`));
                    }
                    processedElements.add(node);
                }
            }
        });

        // Clean up consecutive empty markers
        const cleanedLines = [];
        let lastLineWasEmptyMarker = false;
        for (const line of lines) {
            const isEmptyMarker = line.trim() === '>'; 
            if (!(isEmptyMarker && lastLineWasEmptyMarker)) {
                cleanedLines.push(line);
            }
            lastLineWasEmptyMarker = isEmptyMarker;
        }
        
        // Remove leading/trailing empty markers
        while (cleanedLines.length > 0 && cleanedLines[0].trim() === '>') cleanedLines.shift();
        while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1].trim() === '>') cleanedLines.pop();

        return cleanedLines.join('\n');
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
     * v32: Fixed to recognize td elements in thead as headers (Gemini uses td instead of th in thead).
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
                // Gemini uses 'td' elements in thead instead of 'th', so check both
                const headerCells = Array.from(headerRow.querySelectorAll(':scope > th, :scope > td'));
                columnCount = headerCells.length;
                if (columnCount > 0) {
                    const headerContent = headerCells.map(cell =>
                        QAClipper.Utils.htmlToMarkdown(cell, { ignoreTags: ['table'] })
                        .trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')
                    );
                    markdownRows.push(`| ${headerContent.join(' | ')} |`);
                    markdownRows.push(`|${'---|'.repeat(columnCount)}`);
                    headerRowCount = 2; // Header + Separator
                    // console.log(`  -> [Table Processor v31] Header found in thead with ${columnCount} columns.`);
                } else { } // console.log("  -> [Table Processor v31] thead row found but no 'th' or 'td' cells.");
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

    /**
     * Process blockquote content that contains lists, fixing the issue with duplicated items
     * @param {HTMLElement} element - The blockquote element to process
     * @param {Array} resultLines - The array to collect result lines
     */
    function processBlockquoteChildrenForList(element, resultLines) {
        // Process child nodes of blockquote to correctly handle nested lists
        Array.from(element.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                    resultLines.push(`> ${text}`);
                }
            } 
            else if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                
                // Handle paragraphs
                if (tagName === 'p') {
                    const pContent = QAClipper.Utils.htmlToMarkdown(node).trim();
                    if (pContent) {
                        pContent.split('\n').forEach(line => {
                            resultLines.push(`> ${line}`);
                        });
                    }
                }
                // Special handling for lists to fix the nesting issue
                else if (tagName === 'ul' || tagName === 'ol') {
                    const isOrdered = tagName === 'ol';
                    let startIdx = 1;
                    
                    if (isOrdered) {
                        const startAttr = node.getAttribute('start');
                        if (startAttr) {
                            const parsed = parseInt(startAttr, 10);
                            if (!isNaN(parsed)) {
                                startIdx = parsed;
                            }
                        }
                    }
                    
                    // Process top-level list items
                    const items = node.querySelectorAll(':scope > li');
                    
                    items.forEach((item, idx) => {
                        // Create marker based on list type
                        const marker = isOrdered ? `${startIdx + idx}.` : '-';
                        
                        // Process direct content of the list item (excluding nested elements)
                        const itemClone = item.cloneNode(true);
                        const nestedElements = itemClone.querySelectorAll('ul, ol, blockquote, pre, code');
                        nestedElements.forEach(el => {
                            if (el.parentNode) {
                                el.parentNode.removeChild(el);
                            }
                        });
                        
                        const directContent = QAClipper.Utils.htmlToMarkdown(itemClone).trim();
                        
                        // Add direct content with proper formatting
                        if (directContent) {
                            resultLines.push(`> ${marker} ${directContent}`);
                        } else {
                            resultLines.push(`> ${marker} `);
                        }
                        
                        // Process nested lists - key change: track processed items to avoid duplication
                        const nestedLists = item.querySelectorAll(':scope > ul, :scope > ol');
                        if (nestedLists.length > 0) {
                            nestedLists.forEach(nestedList => {
                                processNestedListInBlockquote(nestedList, resultLines, 1);
                            });
                        }
                    });
                }
                // Handle nested blockquotes
                else if (tagName === 'blockquote') {
                    // Recursively process nested blockquotes
                    const nestedLines = [];
                    processBlockquoteChildrenForList(node, nestedLines);
                    
                    // Add additional '>' prefix to each line
                    nestedLines.forEach(line => {
                        resultLines.push(`>${line}`);
                    });
                }
                // Default handling for other elements
                else {
                    const content = QAClipper.Utils.htmlToMarkdown(node).trim();
                    if (content) {
                        content.split('\n').forEach(line => {
                            resultLines.push(`> ${line}`);
                        });
                    }
                }
            }
        });
    }
    
    /**
     * Process nested lists within blockquotes to prevent duplicate items
     * @param {HTMLElement} list - The list element
     * @param {Array} resultLines - The array to collect result lines
     * @param {number} depth - The nesting depth
     */
    function processNestedListInBlockquote(list, resultLines, depth) {
        const isOrdered = list.tagName.toLowerCase() === 'ol';
        let startIdx = 1;
        
        if (isOrdered) {
            const startAttr = list.getAttribute('start');
            if (startAttr) {
                const parsed = parseInt(startAttr, 10);
                if (!isNaN(parsed)) {
                    startIdx = parsed;
                }
            }
        }
        
        const indent = '    '.repeat(depth);
        const items = list.querySelectorAll(':scope > li');
        
        items.forEach((item, idx) => {
            // Create marker based on list type
            const marker = isOrdered ? `${startIdx + idx}.` : '-';
            
            // Process direct content (excluding nested elements)
            const itemClone = item.cloneNode(true);
            const nestedElements = itemClone.querySelectorAll('ul, ol, blockquote, pre, code');
            nestedElements.forEach(el => {
                if (el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
            
            const directContent = QAClipper.Utils.htmlToMarkdown(itemClone).trim();
            
            // Add properly indented item
            if (directContent) {
                resultLines.push(`> ${indent}${marker} ${directContent}`);
            } else {
                resultLines.push(`> ${indent}${marker} `);
            }
            
            // Process deeper nested lists
            const deeperLists = item.querySelectorAll(':scope > ul, :scope > ol');
            if (deeperLists.length > 0) {
                deeperLists.forEach(deeperList => {
                    processNestedListInBlockquote(deeperList, resultLines, depth + 1);
                });
            }
        });
    }

    // --- Main Configuration Object ---
          const geminiConfig = {
        platformName: 'Gemini',
        version: 41, // v41: Updated to skip thinking process and focus only on actual response content
      selectors: {
        turnContainer: 'user-query, model-response',
        userMessageContainer: 'user-query', userText: '.query-text',
        userImageContainer: 'user-query-file-preview', userImageLink: 'a[href^="https://lens.google.com/uploadbyurl?url="]',
        userFileContainer: '.file-preview-container', userFileItem: '.file-upload-link', userFileName: '.new-file-name', userFileType: '.new-file-type',
        assistantContentArea: 'div.markdown.markdown-main-panel',
        // Added all heading levels (h1-h6) to relevantBlocks and response-element for nested code blocks
        relevantBlocks: 'p, h1, h2, h3, h4, h5, h6, ul, ol, code-block, single-image, div.attachment-container.immersive-entry-chip, table, blockquote, response-element, hr',
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
          const textElement = turnElement.querySelector(':scope .query-text');
          if (!textElement) return null;

          // v33: Get innerHTML to handle <br> and potential <p> tags manually for user text
          let html = textElement.innerHTML;

          // Replace <br> and </p> (potentially used for lines) with single newlines
          html = html.replace(/<br\s*\/?>/gi, '\n');
          html = html.replace(/<\/p>/gi, '\n');

          // Remove all other HTML tags
          html = html.replace(/<[^>]*>/g, '');

          // Decode HTML entities (like &nbsp;, &amp;, &lt;, &gt;)
          // Create a temporary element to leverage the browser's decoding
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = html;
          let decodedText = tempDiv.textContent || tempDiv.innerText || '';

          // Collapse multiple consecutive newlines into one
          decodedText = decodedText.replace(/\n\s*\n/g, '\n');

          // Trim final result
          return decodedText.trim() || null;
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
       * Updated to handle Gemini's response-element and code-block structure.
       * v32: Refactored to use querySelectorAll(relevantBlocks) and processed set for nesting.
       * v41: Updated to skip thinking process (model-thoughts) and focus only on actual response content.
       */
      extractAssistantContent: (turnElement) => {
          const contentItems = [];
          
          // v41: First check if there are thinking elements - if so, look for actual response content
          const thinkingElements = turnElement.querySelectorAll('model-thoughts');
          let contentArea = null;
          
          if (thinkingElements.length > 0) {
              // When thinking process is visible, look specifically for the actual response content
              const responseContent = turnElement.querySelector('message-content.model-response-text');
              if (responseContent) {
                  contentArea = responseContent.querySelector('div.markdown.markdown-main-panel');
              }
              
              // Fallback: if the above didn't work, try alternative selectors
              if (!contentArea) {
                  contentArea = turnElement.querySelector('message-content[class*="model-response-text"] div.markdown');
              }
          } else {
              // Normal case - no thinking process visible
              contentArea = turnElement.querySelector(geminiConfig.selectors.assistantContentArea);
          }
          
          if (!contentArea) { console.warn("[Extractor v41] Gemini markdown content area not found."); return []; }

          // v32: Use querySelectorAll to find all potentially relevant elements, regardless of nesting
          const relevantElements = Array.from(contentArea.querySelectorAll(geminiConfig.selectors.relevantBlocks));
          const processedElements = new Set(); // To avoid processing elements multiple times

          relevantElements.forEach((element) => {
              // Skip if already processed as part of a larger element (e.g., list item handled by processList)
              if (processedElements.has(element)) return;

              const tagNameLower = element.tagName.toLowerCase();
              const isHeading = tagNameLower.match(/^h[1-6]$/);
              const isBlockquote = tagNameLower === 'blockquote';
              // v32: Check specific selector for interactive block, not just parent
              const isInteractiveBlock = geminiConfig.selectors.interactiveBlockContainer && element.matches(geminiConfig.selectors.interactiveBlockContainer);
              const isImageContainer = geminiConfig.selectors.imageContainerAssistant && element.matches(geminiConfig.selectors.imageContainerAssistant);
              const isCodeBlock = tagNameLower === 'code-block';
              const isResponseElement = tagNameLower === 'response-element'; // May contain code blocks
              const isTable = tagNameLower === 'table';
              const isList = tagNameLower === 'ul' || tagNameLower === 'ol';
              const isParagraph = tagNameLower === 'p'; // Paragraphs might contain other things now
              const isHorizontalRule = tagNameLower === 'hr';

              let item = null;

              // Process based on element type, ensuring not already processed
              // Order prioritizes container types (lists, tables, etc.) that might contain others

              if (isList) {
                  // processList handles its own children
                  item = processList(element, tagNameLower, 0);
                  if (item) contentItems.push(item);
                  processedElements.add(element);
                  // Mark all descendants as processed because processList handles them
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isTable) {
                  const tableMarkdown = processTableToMarkdown(element);
                  if (tableMarkdown) {
                      QAClipper.Utils.addTextItem(contentItems, tableMarkdown);
                  } else {
                      // Fallback for tables that couldn't be parsed
                      const fallbackText = QAClipper.Utils.htmlToMarkdown(element, {
                          skipElementCheck: (el) => el.tagName.toLowerCase() === 'table'
                      }).trim();
                      if (fallbackText) {
                         QAClipper.Utils.addTextItem(contentItems, `[Fallback Table Content]\\n${fallbackText}`);
                      }
                  }
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isBlockquote) {
                  // v34: Enhanced blockquote processing with better nested structure handling
                  const blockquoteMarkdown = processNestedBlockquote(element);
                  if (blockquoteMarkdown) {
                      QAClipper.Utils.addTextItem(contentItems, blockquoteMarkdown);
                  }
                  processedElements.add(element);
                  // Mark all descendants as processed since processNestedBlockquote handles them comprehensively
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isCodeBlock) { // Direct code-block element
                  const items = processEnhancedCodeBlock(element);
                  items.forEach(item => {
                      if (item) contentItems.push(item);
                  });
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isResponseElement) { // response-element might contain code blocks
                  // Handle code blocks specifically within response-element
                  const codeBlocks = element.querySelectorAll('code-block');
                  codeBlocks.forEach(codeBlock => {
                      if (processedElements.has(codeBlock)) return; // Skip if already processed
                      const codeItems = processEnhancedCodeBlock(codeBlock);
                      codeItems.forEach(codeItem => {
                          if (codeItem) contentItems.push(codeItem);
                      });
                      processedElements.add(codeBlock);
                      codeBlock.querySelectorAll('*').forEach(child => processedElements.add(child));
                  });
                  processedElements.add(element); // Mark the response-element itself as processed
              }
              else if (isInteractiveBlock) { // v32: Explicit check using the selector
                  const titleElement = element.querySelector(geminiConfig.selectors.interactiveBlockTitle);
                  const title = titleElement ? titleElement.textContent?.trim() : '[Interactive Block]';
                  
                  // v40: Extract timestamp information as artifactType for Gemini
                  let artifactType = null;
                  const timestampElement = element.querySelector('span[data-test-id="creation-timestamp"]');
                  if (timestampElement) {
                      artifactType = timestampElement.textContent?.trim();
                  }
                  
                  // v32: Push as interactive block type with artifactType
                  contentItems.push({ 
                      type: 'interactive_block', 
                      title: title, 
                      artifactType: artifactType, // Add artifactType for Gemini 
                      code: null, 
                      language: null 
                  });
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child)); // Mark children processed
              }
              else if (isImageContainer) {
                  item = processImage(element);
                  if (item) contentItems.push(item);
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isHorizontalRule) {
                  // Add horizontal rule as markdown
                  QAClipper.Utils.addTextItem(contentItems, '---');
                  processedElements.add(element);
              }
              else if (isHeading) {
                  const level = parseInt(tagNameLower.charAt(1));
                  const headingMarkup = '#'.repeat(level);
                  const headingText = QAClipper.Utils.htmlToMarkdown(element, { skipElementCheck: shouldSkipElement }).trim(); // Process content
                  if (headingText) {
                      QAClipper.Utils.addTextItem(contentItems, `${headingMarkup} ${headingText}`);
                  }
                  processedElements.add(element);
                  // Mark children as processed since we took the whole heading content
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isParagraph) {
                  // Paragraphs are processed last; only add their *direct* text content
                  // if they weren't part of a larger structure already processed.
                  // Use htmlToMarkdown but *only* if no block elements were inside it.
                  const blockMarkdown = QAClipper.Utils.htmlToMarkdown(element, {
                     // v32: Crucially, skipElementCheck prevents double-processing of elements handled above
                     skipElementCheck: (el) => processedElements.has(el) || shouldSkipElement(el)
                  }).trim();
                  if (blockMarkdown) {
                      QAClipper.Utils.addTextItem(contentItems, blockMarkdown);
                  }
                  processedElements.add(element);
                  // Don't mark all children processed here, as htmlToMarkdown respects skipElementCheck
              }
              // Add any other specific element handling here if needed

          }); // End forEach relevantElements

          return contentItems;
      }, // End extractAssistantContent

    }; // End geminiConfig

    window.geminiConfig = geminiConfig;
    // console.log("geminiConfig initialized (v41 - Updated to skip thinking process and focus only on actual response content)");

    /**
     * Special fixed version to handle blockquotes with nested lists
     * This specifically addresses the problem in the test case
     * @param {HTMLElement} blockquote - The blockquote element
     * @returns {string} - Properly formatted markdown
     */
    function processFixedBlockquote(blockquote) {
        const resultLines = [];
        
        // Process all child elements
        Array.from(blockquote.children).forEach(child => {
            const tagName = child.tagName.toLowerCase();
            
            // Special handling for lists
            if (tagName === 'ul' || tagName === 'ol') {
                // Process the list with our fixed function
                processFixedListInBlockquote(child, resultLines, 0, tagName === 'ol');
            }
            else {
                // Process non-list content
                const content = QAClipper.Utils.htmlToMarkdown(child).trim();
                if (content) {
                    content.split('\n').forEach(line => {
                        resultLines.push(`> ${line}`);
                    });
                }
            }
        });
        
        // Clean up empty lines
        const cleanedLines = [];
        let prevLineIsEmpty = false;
        
        for (const line of resultLines) {
            const isEmpty = line.trim() === '>';
            if (isEmpty && prevLineIsEmpty) continue;
            cleanedLines.push(line);
            prevLineIsEmpty = isEmpty;
        }
        
        // Remove empty lines at beginning and end
        while (cleanedLines.length > 0 && cleanedLines[0].trim() === '>') {
            cleanedLines.shift();
        }
        while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1].trim() === '>') {
            cleanedLines.pop();
        }
        
        return cleanedLines.join('\n');
    }

    /**
     * Process lists in blockquotes with proper handling of nested items
     * @param {HTMLElement} list - The list element
     * @param {Array} resultLines - Array to collect output
     * @param {number} level - Indentation level
     * @param {boolean} isOrdered - Whether this is an ordered list
     */
    function processFixedListInBlockquote(list, resultLines, level, isOrdered) {
        const indent = '    '.repeat(level);
        let startIndex = 1;
        
        if (isOrdered) {
            const startAttr = list.getAttribute('start');
            if (startAttr) {
                const parsed = parseInt(startAttr, 10);
                if (!isNaN(parsed)) {
                    startIndex = parsed;
                }
            }
        }
        
        // Process each list item at this level
        const listItems = list.querySelectorAll(':scope > li');
        
        listItems.forEach((item, idx) => {
            const marker = isOrdered ? `${startIndex + idx}.` : '-';
            
            // Process direct text content (excluding nested elements)
            const itemClone = item.cloneNode(true);
            
            // Remove all nested elements from clone
            Array.from(itemClone.querySelectorAll('ul, ol, blockquote')).forEach(el => {
                if (el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
            
            // Get direct content
            const directContent = QAClipper.Utils.htmlToMarkdown(itemClone).trim();
            
            // Add direct content line
            if (directContent) {
                resultLines.push(`> ${indent}${marker} ${directContent}`);
            } else {
                resultLines.push(`> ${indent}${marker} `);
            }
            
            // Process nested lists
            const nestedLists = item.querySelectorAll(':scope > ul, :scope > ol');
            
            nestedLists.forEach(nestedList => {
                const nestedIsOrdered = nestedList.tagName.toLowerCase() === 'ol';
                processFixedListInBlockquote(nestedList, resultLines, level + 1, nestedIsOrdered);
            });
        });
    }
})(); // End of IIFE