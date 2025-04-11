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
             tagNameLower === 'response-element' || // Skip response-element for dedicated processing
             tagNameLower === 'table'; // Skip table at top level
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
            const indent = '  '.repeat(nestLevel);
            const nestedIndent = '  '.repeat(nestLevel + 1);
            const codeBlockIndent = '  '.repeat(nestLevel + 2); // Extra indentation for code blocks
            
            let contentAdded = false;
            
            // 1. Process direct content first (if any)
            if (directContent) {
                lines.push(`${indent}${marker} ${directContent}`);
                contentAdded = true;
            }
            
            // 2. Process code blocks within this list item
            if (codeBlocks.length > 0) {
                codeBlocks.forEach((codeEl, idx) => {
                    let codeItem = null;
                    
                    // Check if it's a Gemini code-block element or a regular pre element
                    if (codeEl.tagName.toLowerCase() === 'code-block') {
                        // Process Gemini-specific code block
                        // Find language indicator and code content
                        const langElement = codeEl.querySelector('.code-block-decoration > span');
                        const language = langElement ? langElement.textContent?.trim() : null;
                        
                        const codeElement = codeEl.querySelector('code[data-test-id="code-content"]');
                        const codeContent = codeElement ? codeElement.textContent?.trim() : '';
                        
                        if (codeContent) {
                            codeItem = { 
                                type: 'code_block', 
                                language: language, 
                                content: codeContent
                            };
                        }
                    } else {
                        // Use regular process for pre elements
                        codeItem = processCodeBlock(codeEl);
                    }
                    
                    if (codeItem) {
                        // Format code block with proper indentation
                        let codeContentLines = [];
                        const lang = codeItem.language || '';
                        codeContentLines.push(`\`\`\`${lang}`);
                        codeContentLines = codeContentLines.concat(codeItem.content.split('\n'));
                        codeContentLines.push('```');
                        
                        // Add list marker to first line if no content added yet
                        if (!contentAdded) {
                            const firstLine = codeContentLines[0];
                            lines.push(`${indent}${marker} ${firstLine}`);
                            
                            // Add remaining lines with proper indentation
                            for (let i = 1; i < codeContentLines.length; i++) {
                                lines.push(`${codeBlockIndent}${codeContentLines[i]}`);
                            }
                            contentAdded = true;
                        } else {
                            // Just add the code block with proper indentation for all lines
                            codeContentLines.forEach(line => {
                                lines.push(`${codeBlockIndent}${line}`);
                            });
                        }
                    }
                });
            }
            
            // 3. Process blockquotes - maintain proper indentation and list structure
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
                    // Ensure space after '>' marker
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
                        // Make sure there's a space after each additional '>'
                        nestedContent.split('\n').forEach(line => {
                            // Ensure there's a space after all '>' characters
                            const spacedLine = line.replace(/^(>+)(\S)/g, '$1 $2');
                            lines.push(`>${spacedLine}`);
                        });
                    }
                }
                // Handle lists specially to ensure proper formatting
                else if (tagName === 'ul' || tagName === 'ol') {
                    // Process the list specially to maintain proper markers and indentation
                    const listItems = node.querySelectorAll('li');
                    const isOrdered = tagName === 'ol';
                    let startIndex = 1;
                    
                    if (isOrdered) {
                        const startAttr = node.getAttribute('start');
                        if (startAttr) {
                            const parsedStart = parseInt(startAttr, 10);
                            if (!isNaN(parsedStart)) {
                                startIndex = parsedStart;
                            }
                        }
                    }
                    
                    listItems.forEach((li, idx) => {
                        const marker = isOrdered ? `${startIndex + idx}.` : '-';
                        const listItemContent = QAClipper.Utils.htmlToMarkdown(li, {
                            ignoreTags: ['ul', 'ol', 'blockquote']
                        }).trim();
                        
                        if (listItemContent) {
                            // Ensure space after '>' marker and proper list marker
                            lines.push(`> ${marker} ${listItemContent}`);
                        }
                    });
                }
                // Handle paragraphs and other elements
                else {
                    const content = QAClipper.Utils.htmlToMarkdown(node, {
                        ignoreTags: ['blockquote']
                    }).trim();
                    
                    if (content) {
                        content.split('\n').forEach(line => {
                            // Ensure space after '>' marker
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
                
                // Handle lists - ensure proper spacing and markers are preserved
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
                    
                    // Use dedicated function to process the list inside blockquote
                    // Make sure we always include a space after the blockquote marker
                    const listResult = processListInBlockquote(node, tagName, 0, nestLevel);
                    if (listResult && listResult.content) {
                        // Ensure each line has proper spacing after the blockquote marker
                        const formattedContent = listResult.content.replace(/^(>+)(\S)/gm, '$1 $2');
                        resultLines.push(formattedContent);
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
            // Create the blockquote prefix - ensure there's a space after '>'
            const bqPrefix = '> '.repeat(blockquoteLevel + 1);
            
            // Create the list marker and indentation
            const marker = listType === 'ul' ? '-' : `${startNum + itemIndex}.`;
            const indent = '  '.repeat(listLevel);
            const codeBlockIndent = '  '.repeat(listLevel + 2);
            
            // Create a working copy to process direct content
            const liClone = li.cloneNode(true);
            
            // Track original elements to process separately
            let originalNestedLists = Array.from(li.querySelectorAll(':scope > ul, :scope > ol'));
            let originalNestedBq = Array.from(li.querySelectorAll(':scope > blockquote'));
            
            // For Gemini, code blocks are inside response-element > code-block elements
            let originalCodeBlocks = [];
            const responseElements = Array.from(li.querySelectorAll(':scope > response-element'));
            responseElements.forEach(respEl => {
                const codeBlockEls = respEl.querySelectorAll('code-block');
                codeBlockEls.forEach(codeBlock => {
                    originalCodeBlocks.push(codeBlock);
                });
            });
            
            // Also check for direct code-block and pre elements
            Array.from(li.querySelectorAll(':scope > code-block, :scope > pre')).forEach(codeEl => {
                originalCodeBlocks.push(codeEl);
            });
            
            // Remove nested lists, blockquotes, and code blocks from clone
            Array.from(liClone.querySelectorAll('ul, ol, blockquote, code-block, pre, response-element')).forEach(nestedEl => {
                if (nestedEl.parentNode) {
                    nestedEl.parentNode.removeChild(nestedEl);
                }
            });
            
            // Process direct content first (without nested elements)
            let directContent = QAClipper.Utils.htmlToMarkdown(liClone, {
                ignoreTags: ['ul', 'ol', 'blockquote', 'code-block', 'pre', 'response-element']
            }).trim();
            
            if (directContent) {
                // Ensure space after the blockquote marker
                lines.push(`${bqPrefix}${indent}${marker} ${directContent}`);
                if (listType === 'ol') itemIndex++;
            }
            
            // Process code blocks within this item
            if (originalCodeBlocks.length > 0) {
                originalCodeBlocks.forEach(codeEl => {
                    let codeItem = null;
                    
                    // Check if it's a Gemini code-block element or a regular pre element
                    if (codeEl.tagName.toLowerCase() === 'code-block') {
                        // Process Gemini-specific code block
                        // Find language indicator and code content
                        const langElement = codeEl.querySelector('.code-block-decoration > span');
                        const language = langElement ? langElement.textContent?.trim() : null;
                        
                        const codeElement = codeEl.querySelector('code[data-test-id="code-content"]');
                        const codeContent = codeElement ? codeElement.textContent?.trim() : '';
                        
                        if (codeContent) {
                            codeItem = { 
                                type: 'code_block', 
                                language: language, 
                                content: codeContent
                            };
                        }
                    } else {
                        // Use regular process for pre elements
                        codeItem = processCodeBlock(codeEl);
                    }
                    
                    if (codeItem) {
                        // Format code block with proper indentation
                        let codeContentLines = [];
                        const lang = codeItem.language || '';
                        codeContentLines.push(`\`\`\`${lang}`);
                        codeContentLines = codeContentLines.concat(codeItem.content.split('\n'));
                        codeContentLines.push('```');
                        
                        // Add list marker to first line if no direct content yet
                        if (!directContent) {
                            const firstLine = codeContentLines[0];
                            // Ensure space after the blockquote marker
                            lines.push(`${bqPrefix}${indent}${marker} ${firstLine}`);
                            
                            // Add remaining lines with proper indentation and prefix
                            for (let i = 1; i < codeContentLines.length; i++) {
                                lines.push(`${bqPrefix}${codeBlockIndent}${codeContentLines[i]}`);
                            }
                            directContent = true;
                            if (listType === 'ol') itemIndex++;
                        } else {
                            // Just add the code block with proper indentation for all lines
                            codeContentLines.forEach(line => {
                                lines.push(`${bqPrefix}${codeBlockIndent}${line}`);
                            });
                        }
                    }
                });
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
                            // Ensure proper spacing after the '>' marker
                            const firstLine = bqLines[0].substring(bqPrefix.length).trimStart();
                            bqLines[0] = `${bqPrefix}${indent}${marker} ${firstLine}`;
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
                            const firstLine = nestedLines[0].substring(bqPrefix.length).trimStart(); // Remove bq prefix and ensure trimmed
                            nestedLines[0] = `${bqPrefix}${indent}${marker} ${firstLine}`;
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
                // Ensure space after blockquote marker
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
        // Added all heading levels (h1-h6) to relevantBlocks and response-element for nested code blocks
        relevantBlocks: 'p, h1, h2, h3, h4, h5, h6, ul, ol, code-block, single-image, div.attachment-container.immersive-entry-chip, table, blockquote, response-element',
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
       * Updated to handle Gemini's response-element and code-block structure.
       */
      extractAssistantContent: (turnElement) => {
          const contentItems = [];
          const contentArea = turnElement.querySelector(geminiConfig.selectors.assistantContentArea);
          if (!contentArea) { console.warn("[Extractor v31] Gemini markdown content area not found."); return []; }

          // To preserve ordering, we need to process all children in document order
          const allContentNodes = Array.from(contentArea.childNodes);
          const processedElements = new Set();

          // Process nodes in document order to maintain proper sequence
          allContentNodes.forEach((node) => {
              if (processedElements.has(node) || node.nodeType !== Node.ELEMENT_NODE) return;
              
              const element = node;
              const tagNameLower = element.tagName.toLowerCase();
              const isHeading = tagNameLower.match(/^h[1-6]$/);
              const isBlockquote = tagNameLower === 'blockquote';
              const isInteractiveBlock = element.matches(geminiConfig.selectors.interactiveBlockContainer || '');
              const isImageContainer = element.matches(geminiConfig.selectors.imageContainerAssistant || '');
              const isCodeBlock = tagNameLower === 'code-block';
              const isResponseElement = tagNameLower === 'response-element';
              const isTable = tagNameLower === 'table';
              const isList = tagNameLower === 'ul' || tagNameLower === 'ol';
              const isParagraph = tagNameLower === 'p';
              
              let item = null;
              
              // Process based on element type to maintain proper ordering
              if (isResponseElement) {
                  // Process response-element container
                  const codeBlocks = element.querySelectorAll('code-block');
                  if (codeBlocks.length > 0) {
                      codeBlocks.forEach(codeBlock => {
                          if (processedElements.has(codeBlock)) return;
                          
                          // Process the code block
                          const langElement = codeBlock.querySelector('.code-block-decoration > span');
                          const language = langElement ? langElement.textContent?.trim() : null;
                          
                          const codeElement = codeBlock.querySelector('code[data-test-id="code-content"]');
                          const codeContent = codeElement ? codeElement.textContent?.trim() : '';
                          
                          if (codeContent) {
                              contentItems.push({ 
                                  type: 'code_block', 
                                  language: language, 
                                  content: codeContent
                              });
                          }
                          
                          // Mark as processed
                          processedElements.add(codeBlock);
                      });
                  }
                  processedElements.add(element);
              }
              else if (isHeading) {
                  const level = parseInt(tagNameLower.charAt(1));
                  const headingMarkup = '#'.repeat(level);
                  const headingText = element.textContent.trim();
                  
                  if (headingText) {
                      QAClipper.Utils.addTextItem(contentItems, `${headingMarkup} ${headingText}`);
                  }
                  
                  processedElements.add(element);
              }
              else if (isBlockquote) {
                  const blockquoteMarkdown = processBlockquote(element, 0);
                  if (blockquoteMarkdown) {
                      QAClipper.Utils.addTextItem(contentItems, blockquoteMarkdown);
                  }
                  
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isInteractiveBlock) {
                  const titleElement = element.querySelector(geminiConfig.selectors.interactiveBlockTitle);
                  const title = titleElement ? titleElement.textContent?.trim() : '[Interactive Block]';
                  contentItems.push({ type: 'interactive_block', title: title, code: null, language: null });
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isCodeBlock) {
                  // Check if it's a direct code-block element
                  const langElement = element.querySelector('.code-block-decoration > span');
                  const language = langElement ? langElement.textContent?.trim() : null;
                  
                  const codeElement = element.querySelector('code[data-test-id="code-content"]');
                  const codeContent = codeElement ? codeElement.textContent?.trim() : '';
                  
                  if (codeContent) {
                      item = { 
                          type: 'code_block', 
                          language: language, 
                          content: codeContent
                      };
                  } else {
                      // Fallback to the standard processCodeBlock function
                      item = processCodeBlock(element);
                  }
                  
                  if (item) contentItems.push(item);
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isTable) {
                  const tableMarkdown = processTableToMarkdown(element);
                  if (tableMarkdown) {
                      QAClipper.Utils.addTextItem(contentItems, tableMarkdown);
                  } else {
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
              else if (isList) {
                  item = processList(element, tagNameLower, 0);
                  if (item) contentItems.push(item);
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isImageContainer) {
                  item = processImage(element);
                  if (item) contentItems.push(item);
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
              else if (isParagraph) {
                  const blockMarkdown = QAClipper.Utils.htmlToMarkdown(element, {
                    skipElementCheck: shouldSkipElement
                  }).trim();
                  if (blockMarkdown) {
                      QAClipper.Utils.addTextItem(contentItems, blockMarkdown);
                  }
                  processedElements.add(element);
              }
              else if (element.nodeType === Node.TEXT_NODE) {
                  // Handle text nodes
                  const text = element.textContent.trim();
                  if (text) {
                      QAClipper.Utils.addTextItem(contentItems, text);
                  }
              }
              else { // Fallback for other elements
                  const fallbackText = QAClipper.Utils.htmlToMarkdown(element, {
                    skipElementCheck: shouldSkipElement
                  }).trim();
                  if (fallbackText) {
                     QAClipper.Utils.addTextItem(contentItems, fallbackText);
                  }
                  processedElements.add(element);
                  element.querySelectorAll('*').forEach(child => processedElements.add(child));
              }
          });

          return contentItems;
      }, // End extractAssistantContent

    }; // End geminiConfig

    window.geminiConfig = geminiConfig;
    // console.log("geminiConfig initialized (v31 - Added h1-h6 and blockquote support)");
})(); // End of IIFE