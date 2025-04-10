// chatgptConfigs.js (v18 - Nested Blockquote Fix)

(function() {
    // Initialization check
    // v18: Increment version number
    if (window.chatgptConfig && window.chatgptConfig.version === 18) { return; }

    // --- Helper Functions ---

    function shouldSkipElement(element) { // Unchanged
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
      const selectors = window.chatgptConfig?.selectors;
      if (!selectors) return false;
      const tagNameLower = element.tagName.toLowerCase();
      return (element.matches(selectors.codeBlockContainer)) ||
             (element.matches(selectors.imageContainerAssistant)) ||
             (element.matches(selectors.interactiveBlockContainer)) ||
             (element.closest(selectors.interactiveBlockContainer)) ||
             (element.closest(selectors.userMessageContainer) && element.matches('span.hint-pill'));
    }

    /**
     * Improved markdown conversion function that preserves advanced formatting
     * @param {HTMLElement} element - The element to convert
     * @param {Object} options - Conversion options
     * @returns {string} - The markdown representation
     */
    function enhancedHtmlToMarkdown(element, options = {}) {
        // Clone the element to avoid modifying the original
        const clone = element.cloneNode(true);
        
        // Process headings to ensure they use markdown syntax
        const headings = clone.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(heading => {
            const level = parseInt(heading.tagName.substring(1));
            const hashes = '#'.repeat(level);
            const text = heading.textContent.trim();
            
            // Create a replacement element
            const replacementText = document.createTextNode(`${hashes} ${text}`);
            const replacementParagraph = document.createElement('p');
            replacementParagraph.appendChild(replacementText);
            
            // Replace the heading with our markdown-style paragraph
            heading.parentNode.replaceChild(replacementParagraph, heading);
        });
        
        // Process strikethrough elements
        const strikeElements = clone.querySelectorAll('s, del, strike');
        strikeElements.forEach(strikeEl => {
            // Get the text content
            const text = strikeEl.textContent;
            
            // Create a new text node with markdown strikethrough syntax
            const replacementText = document.createTextNode(`~~${text}~~`);
            
            // Replace the element with our markdown-style text
            strikeEl.parentNode.replaceChild(replacementText, strikeEl);
        });
        
        // Call the original markdown converter with our pre-processed clone
        return QAClipper.Utils.htmlToMarkdown(clone, options).trim();
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
                    
                    // Use enhanced markdown conversion to handle strikethrough correctly
                    const content = enhancedHtmlToMarkdown(node, {
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
                    
                    const listResult = processList(node, tagName, 0, true, nestLevel);
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
                
                const inlineContent = enhancedHtmlToMarkdown(node, {
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
     * Process a list element (ul/ol) and its children, including nested lists, code blocks, and blockquotes within items
     * @param {HTMLElement} el - The list element to process
     * @param {string} listType - Either 'ul' or 'ol'
     * @param {number} level - Indentation level for nested lists (0 for top level)
     * @param {boolean} isWithinBlockquote - Flag to indicate if this list is within a blockquote
     * @param {number} blockquoteLevel - The nesting level of the parent blockquote (if any)
     * @returns {object|null} - The processed list content or null if empty
     */
     function processList(el, listType, level = 0, isWithinBlockquote = false, blockquoteLevel = 0) {
         let lines = [];
         // Initialize itemIndex based on the 'start' attribute for <ol>, default to 0 otherwise
         let itemIndex = 0;
         if (listType === 'ol') {
            const startAttribute = el.getAttribute('start');
            if (startAttribute) {
                const startIndex = parseInt(startAttribute, 10);
                // Ensure startIndex is a valid number before using it
                if (!isNaN(startIndex) && startIndex > 0) {
                    itemIndex = startIndex - 1; // Adjust because we use itemIndex + 1 later
                } else {
                     console.warn(`[Extractor v18 processList] Invalid 'start' attribute found: ${startAttribute}`, el);
                }
            }
         }
         const listItems = el.querySelectorAll(':scope > li');

         listItems.forEach(li => {
             const liClone = li.cloneNode(true);
             let originalPreElements = []; // Store original <pre> elements found within this LI
             let originalBlockquotes = []; // Store original blockquote elements

             // Find and remove nested lists, PRE elements, and blockquotes from the clone
             // Keep track of the original elements to process them later in order
             const nestedElementsToRemove = Array.from(liClone.querySelectorAll('ul, ol, pre, blockquote'));
             nestedElementsToRemove.forEach(nestedEl => {
                 const tagNameLower = nestedEl.tagName.toLowerCase();
                 if (tagNameLower === 'pre') {
                     // Map the PRE in the clone back to the original LI's PRE elements based on order
                     try {
                        const allOriginalPres = Array.from(li.querySelectorAll('pre'));
                        // Find the index of this 'pre' among *all* 'pre' elements within the clone *at this point*
                        // This relies on querySelectorAll order being stable and consistent between original and clone before removal
                        const currentIndexInClone = Array.from(liClone.querySelectorAll('pre')).indexOf(nestedEl);
                        if (currentIndexInClone !== -1 && currentIndexInClone < allOriginalPres.length) {
                            originalPreElements.push(allOriginalPres[currentIndexInClone]);
                        } else {
                            console.warn("[Extractor v18 processList] Could not map cloned PRE back to original. Index:", currentIndexInClone, "Original count:", allOriginalPres.length, nestedEl);
                        }
                     } catch (e) {
                         console.error("[Extractor v18 processList] Error mapping PRE elements:", e, nestedEl);
                     }
                 } else if (tagNameLower === 'blockquote') {
                     // Map blockquotes similar to PRE elements
                     try {
                        const allOriginalBlockquotes = Array.from(li.querySelectorAll('blockquote'));
                        const currentIndexInClone = Array.from(liClone.querySelectorAll('blockquote')).indexOf(nestedEl);
                        if (currentIndexInClone !== -1 && currentIndexInClone < allOriginalBlockquotes.length) {
                            originalBlockquotes.push(allOriginalBlockquotes[currentIndexInClone]);
                        } else {
                            console.warn("[Extractor v18 processList] Could not map cloned blockquote back to original. Index:", currentIndexInClone, "Original count:", allOriginalBlockquotes.length, nestedEl);
                        }
                     } catch (e) {
                         console.error("[Extractor v18 processList] Error mapping blockquote elements:", e, nestedEl);
                     }
                 }
                 // Remove the nested element from the clone
                 if (nestedEl.parentNode) {
                     nestedEl.parentNode.removeChild(nestedEl);
                 }
             });

             // Now get the text content without nested lists/pre blocks/blockquotes
             // Use enhanced markdown conversion to handle strikethrough correctly
             const itemText = enhancedHtmlToMarkdown(liClone, {
                 skipElementCheck: shouldSkipElement
             }).trim();

             let itemHasContent = false; // Track if we added text or code for this LI

             // 1. Process the main item text (if any)
             if (itemText) {
                 const marker = listType === 'ul' ? '-' : `${itemIndex + 1}.`;
                 const indent = '  '.repeat(level);
                 const textIndent = '  '.repeat(level + 2); // Indentation for continuation lines
                 
                 // If within a blockquote, each line needs proper '>' prefixes based on nesting level
                 const bqPrefix = isWithinBlockquote ? '> '.repeat(blockquoteLevel + 1) : '';

                 const itemTextLines = itemText.split('\n').filter(line => line.trim());
                 const formattedText = itemTextLines.map((line, idx) => {
                     return idx === 0 ? `${bqPrefix}${indent}${marker} ${line}` : `${bqPrefix}${textIndent}${line}`;
                 }).join('\n');
                 lines.push(formattedText);
                 itemHasContent = true;
             }

             // 2. Process the extracted PRE elements (if any) in order
             if (originalPreElements.length > 0) {
                 const codeBlockIndent = '  '.repeat(level + 2); // Code blocks indented like continuation text

                 // Determine prefix/indent for the first line of the first code block
                 const marker = listType === 'ul' ? '-' : `${itemIndex + 1}.`;
                 // If no text preceded, the first line of code needs the list marker and base indent
                 const firstCodeBlockInitialIndent = itemHasContent ? codeBlockIndent : '  '.repeat(level);
                 const firstCodeBlockPrefix = itemHasContent ? '' : `${marker} `;
                 
                 // Apply blockquote prefix if needed with correct nesting level
                 const bqPrefix = isWithinBlockquote ? '> '.repeat(blockquoteLevel + 1) : '';

                 originalPreElements.forEach((preEl, preIndex) => {
                     const codeItem = processCodeBlock(preEl);
                     if (codeItem) {
                         let codeContentLines = [];
                         const lang = codeItem.language || '';
                         codeContentLines.push(`\`\`\`${lang}`);
                         codeContentLines = codeContentLines.concat(codeItem.content.split('\n'));
                         codeContentLines.push('```');

                         const formattedCodeLines = codeContentLines.map((line, idx) => {
                             if (!itemHasContent && preIndex === 0 && idx === 0) {
                                 // First line of the *very first* block in an LI *with no preceding text*
                                 return `${bqPrefix}${firstCodeBlockInitialIndent}${firstCodeBlockPrefix}${line}`;
                             } else {
                                 // Subsequent lines, or code blocks after text, or subsequent code blocks
                                 return `${bqPrefix}${codeBlockIndent}${line}`;
                             }
                         }).join('\n');
                         lines.push(formattedCodeLines);
                         itemHasContent = true; // Mark that this LI produced content
                     }
                 });
             }
             
             // 3. Process blockquotes within list items
             if (originalBlockquotes.length > 0) {
                 // Apply blockquote prefix with correct nesting level
                 const bqLevel = isWithinBlockquote ? blockquoteLevel : 0;
                 
                 originalBlockquotes.forEach((bqElement) => {
                     // Process the blockquote with the current nesting level
                     const bqContent = processBlockquote(bqElement, bqLevel);
                     
                     if (bqContent) {
                         // If this is the first content in the list item, add the list marker
                         if (!itemHasContent) {
                             const marker = listType === 'ul' ? '-' : `${itemIndex + 1}.`;
                             const indent = '  '.repeat(level);
                             
                             // Split the first line to insert the marker
                             const lines = bqContent.split('\n');
                             if (lines.length > 0) {
                                 // Find where to insert the marker (after the prefix)
                                 const firstLine = lines[0];
                                 const prefixEnd = firstLine.indexOf('>') + 1;
                                 
                                 lines[0] = firstLine.substring(0, prefixEnd) + 
                                           ` ${indent}${marker} ` + 
                                           firstLine.substring(prefixEnd + 1);
                                 
                                 lines.push(lines.join('\n'));
                             }
                         } else {
                             lines.push(bqContent);
                         }
                         
                         itemHasContent = true;
                     }
                 });
             }

             // 4. Process nested lists (using original LI)
             const nestedLists = li.querySelectorAll(':scope > ul, :scope > ol');
             nestedLists.forEach(nestedList => {
                 const nestedType = nestedList.tagName.toLowerCase();
                 // Pass the blockquote nesting level
                 const nestedResult = processList(nestedList, nestedType, level + 1, isWithinBlockquote, blockquoteLevel);

                 if (nestedResult && nestedResult.content) {
                     // The result from processList is already formatted text block with indents
                     lines.push(nestedResult.content);
                     itemHasContent = true; // Mark that this LI produced content (via nesting)
                 }
             });

             // Increment index only if the list item actually produced some output
             // AND only if it's an ordered list. For <ul>, the index doesn't matter for output.
             if (itemHasContent && listType === 'ol') {
                 itemIndex++;
             }
         });

         return lines.length > 0 ? { type: 'text', content: lines.join('\n') } : null;
     }

    function processCodeBlock(el) { // Unchanged
        const selectors = window.chatgptConfig.selectors;
        const wrapperDiv = el.querySelector(':scope > div.contain-inline-size');
        const langIndicatorContainer = wrapperDiv ? wrapperDiv.querySelector(':scope > div:first-child') : el.querySelector(':scope > div:first-child[class*="flex items-center"]');
        let language = null; if (langIndicatorContainer) { language = langIndicatorContainer.textContent?.trim(); }
        if (!language || ['text', ''].includes(language.toLowerCase())) language = null;
        const codeElement = el.querySelector(selectors.codeBlockContent);
        const code = codeElement ? codeElement.textContent.trimEnd() : '';
        if (!code.trim() && !language) return null;
        return { type: 'code_block', language: language, content: code };
    }

    function processAssistantImage(el) { // Unchanged
         const selectors = window.chatgptConfig.selectors;
         const targetImgElement = el.querySelector(selectors.imageElementAssistant);
         if (!targetImgElement) {
             console.error("[Extractor v18] Image element not found using selector:", selectors.imageElementAssistant, "in container:", el);
             const anyImg = el.querySelector('img[src*="oaiusercontent"]');
             if (!anyImg) return null;
             console.warn("[Extractor v18] Using broader fallback image search.");
             targetImgElement = anyImg;
         }
         const src = targetImgElement.getAttribute('src');
         if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
             console.error("[Extractor v18] Selected image has invalid src:", src);
             return null;
         }
         let altText = targetImgElement.getAttribute('alt')?.trim();
         const extractedContent = (altText && altText !== "생성된 이미지") ? altText : "Generated Image";
         try {
             const absoluteSrc = new URL(src, window.location.origin).href;
             return { type: 'image', src: absoluteSrc, alt: altText || "Generated Image", extractedContent: extractedContent };
         }
         catch (e) {
             console.error("[Extractor v18] Error parsing assistant image URL:", e, src);
             return null;
         }
     }

     function processInteractiveBlock(el) { // Unchanged
        // console.log("[Extractor v18] Processing Interactive Block:", el);
        const selectors = window.chatgptConfig.selectors;
        let title = null; let code = null; let language = null;
        const titleElement = el.querySelector(selectors.interactiveBlockTitle);
        if (titleElement) { title = titleElement.textContent?.trim(); }
        const codeLines = el.querySelectorAll(selectors.interactiveBlockCodeMirrorContent);
        if (codeLines.length > 0) {
            let codeContent = '';
            codeLines.forEach(line => { codeContent += line.textContent + '\n'; });
            code = codeContent.trimEnd();
        } else {
             // console.log("[Extractor v18] CodeMirror content not found in interactive block:", el);
              const preCode = el.querySelector('pre > code');
              if(preCode) {
                  // console.log("[Extractor v18] Found fallback pre>code inside interactive block.");
                  code = preCode.textContent.trimEnd();
              }
        }
        if (title) { /* ... language guessing ... */
            const lowerTitle = title.toLowerCase();
            if (lowerTitle.includes('cpp') || lowerTitle.includes('c++')) language = 'cpp';
            else if (lowerTitle.includes('python') || lowerTitle.endsWith('.py')) language = 'python';
            else if (lowerTitle.includes('javascript') || lowerTitle.endsWith('.js')) language = 'javascript';
            else if (lowerTitle.includes('html')) language = 'html';
            else if (lowerTitle.includes('css')) language = 'css';
        }
        if (title || code) {
            return { type: 'interactive_block', title: title || '[Interactive Block]', code: code, language: language };
        } else {
            console.error("[Extractor v18] Failed to extract title or code from interactive block:", el);
            return null;
        }
     }

    function processTableToMarkdown(tableElement) { // Unchanged
        if (!tableElement || tableElement.tagName.toLowerCase() !== 'table') {
            return null;
        }

        const markdownRows = [];
        let columnCount = 0;

        // Process Header (thead)
        const thead = tableElement.querySelector(':scope > thead');
        if (thead) {
            const headerRow = thead.querySelector(':scope > tr');
            if (headerRow) {
                const headerCells = Array.from(headerRow.querySelectorAll(':scope > th'));
                columnCount = headerCells.length;
                if (columnCount > 0) {
                    const headerContent = headerCells.map(th => QAClipper.Utils.htmlToMarkdown(th, { skipElementCheck: shouldSkipElement, ignoreTags: ['table', 'tr', 'th', 'td'] }).trim().replace(/\|/g, '\\|')); // Escape pipes in headers
                    markdownRows.push(`| ${headerContent.join(' | ')} |`);
                    // Add separator line
                    markdownRows.push(`|${'---|'.repeat(columnCount)}`);
                }
            }
        }

        if (columnCount === 0) { // Abort if no header found
            console.warn("[Extractor v18] Table has no header (thead > tr > th). Cannot generate Markdown.", tableElement);
            return null;
        }

        // Process Body (tbody)
        const tbody = tableElement.querySelector(':scope > tbody');
        if (tbody) {
            const bodyRows = tbody.querySelectorAll(':scope > tr');
            bodyRows.forEach(row => {
                const cells = Array.from(row.querySelectorAll(':scope > td'));
                // Ensure row has the same number of cells as the header
                if (cells.length === columnCount) {
                    const cellContent = cells.map(td => QAClipper.Utils.htmlToMarkdown(td, { skipElementCheck: shouldSkipElement, ignoreTags: ['table', 'tr', 'th', 'td'] }).trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')); // Escape pipes and replace newlines in cells
                    markdownRows.push(`| ${cellContent.join(' | ')} |`);
                } else {
                    console.warn("[Extractor v18] Table row skipped due to column count mismatch.", row);
                }
            });
        }

        return markdownRows.length > 2 ? markdownRows.join('\n') : null; // Need header + separator + at least one data row
    }

    /**
     * v18: Updated helper function to process relevant elements found within the text container
     * with improved handling for nested lists and blockquotes
     */
     function processRelevantElements(elements, contentItems) {
         const processedElements = new Set();
         let consecutiveMdBlockElements = [];

         function flushMdBlock() {
             if (consecutiveMdBlockElements.length > 0) {
                 const tempDiv = document.createElement('div');
                 consecutiveMdBlockElements.forEach(el => tempDiv.appendChild(el.cloneNode(true)));
                 const combinedMarkdown = enhancedHtmlToMarkdown(tempDiv, { skipElementCheck: shouldSkipElement }).trim();
                 if (combinedMarkdown) {
                     QAClipper.Utils.addTextItem(contentItems, combinedMarkdown);
                 }
                 consecutiveMdBlockElements = [];
             }
         }

         elements.forEach((element) => {
             if (processedElements.has(element)) return;

             const tagNameLower = element.tagName.toLowerCase();
             const isTableContainer = 
               tagNameLower === 'table' || 
               (tagNameLower === 'div' && 
                 (element.classList.contains('overflow-x-auto') || 
                  element.classList.contains('tableContainer')) && 
                 element.querySelector(':scope > table')) ||
               element.querySelector('.tableContainer > table');
             const tableElement = isTableContainer ? (tagNameLower === 'table' ? element : element.querySelector(':scope > table')) : null;

             const isStandardMdBlock = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr'].includes(tagNameLower);
             let handledSeparately = false;

             // --- Handle Special Blocks (Code, Lists, Tables, Blockquotes) ---
             if (tagNameLower === 'pre') {
                 // Handle PRE blocks only if they are DIRECT children of the main container
                 // PRE blocks inside lists are now handled by processList
                 flushMdBlock();
                 const item = processCodeBlock(element);
                 if (item) contentItems.push(item);
                 processedElements.add(element);
                 element.querySelectorAll('*').forEach(child => processedElements.add(child));
                 handledSeparately = true;
             }
             else if (tagNameLower === 'ul' || tagNameLower === 'ol') {
                 flushMdBlock();
                 // Call the updated processList function which now handles PRE inside LIs
                 const listItem = processList(element, tagNameLower, 0, false, 0);
                 if (listItem) contentItems.push(listItem);
                 processedElements.add(element);
                 element.querySelectorAll('*').forEach(child => processedElements.add(child));
                 handledSeparately = true;
             }
             else if (tableElement) {
                 flushMdBlock();
                 // Check if table element itself or its container was already processed (e.g., nested)
                 if (processedElements.has(element) || processedElements.has(tableElement)) return;
                 const tableMarkdown = processTableToMarkdown(tableElement);
                 if (tableMarkdown) {
                     QAClipper.Utils.addTextItem(contentItems, tableMarkdown);
                 } else {
                     console.warn("[Extractor v18] Failed to manually process table to Markdown:", tableElement);
                 }
                 processedElements.add(element);
                 processedElements.add(tableElement);
                 // Add container and table descendants to processed set
                 element.querySelectorAll('*').forEach(child => processedElements.add(child));
                 handledSeparately = true;
             }
             else if (tagNameLower === 'blockquote') {
                 flushMdBlock();
                 if (processedElements.has(element)) return;
                 
                 // Use the improved blockquote processing function with level 0 for top-level
                 const blockquoteMarkdown = processBlockquote(element, 0);
                 if (blockquoteMarkdown) {
                     QAClipper.Utils.addTextItem(contentItems, blockquoteMarkdown);
                 }
                 processedElements.add(element);
                 element.querySelectorAll('*').forEach(child => processedElements.add(child));
                 handledSeparately = true;
             }

             // --- Accumulate Standard Blocks ---
             if (!handledSeparately) {
                 if (isStandardMdBlock) {
                     consecutiveMdBlockElements.push(element);
                     processedElements.add(element);
                 } else {
                     flushMdBlock();
                     if (!isTableContainer) {
                        console.warn(`  -> Fallback [Text Container]: Unhandled element: <${tagNameLower}>`, element);
                        const fallbackText = enhancedHtmlToMarkdown(element, { skipElementCheck: shouldSkipElement }).trim();
                        if (fallbackText) {
                            QAClipper.Utils.addTextItem(contentItems, fallbackText);
                        }
                        processedElements.add(element);
                     }
                 }
             }
         });
         flushMdBlock(); // Final flush
     } // End processRelevantElements

    /**
     * v18: Updated extraction function for better structure preservation
     */
    function extractAssistantContent(turnElement) {
        const contentItems = [];
        const selectors = chatgptConfig.selectors;

        // 1. Process Images (Outside main text flow)
        const imageContainers = turnElement.querySelectorAll(`:scope > div ${selectors.imageContainerAssistant}`);
        imageContainers.forEach(imageContainer => {
            const imageItem = processAssistantImage(imageContainer);
            if (imageItem) contentItems.push(imageItem);
        });

        // 2. Process Interactive Blocks (Outside main text flow)
        const interactiveBlocks = turnElement.querySelectorAll(`:scope > div ${selectors.interactiveBlockContainer}`);
        interactiveBlocks.forEach(interactiveBlock => {
            const interactiveItem = processInteractiveBlock(interactiveBlock);
            if (interactiveItem) contentItems.push(interactiveItem);
        });

        // 3. Process Main Text/Markdown Container - improved handling of structure
        const textContainer = turnElement.querySelector(selectors.assistantTextContainer);
        if (textContainer) {
            // First, identify top-level blockquotes to process them as complete units
            const topLevelBlockquotes = Array.from(textContainer.querySelectorAll(':scope > blockquote'));
            const topLevelBlockquoteIds = new Set(topLevelBlockquotes.map(el => el.getAttribute('data-temp-id') || 
                                                                          (el.setAttribute('data-temp-id', `bq-${Math.random().toString(36).substring(2, 10)}`), 
                                                                           el.getAttribute('data-temp-id'))));
            
            // Get all relevant elements, ensuring we don't break apart blockquotes
            const relevantElements = Array.from(textContainer.querySelectorAll(selectors.relevantBlocksInTextContainer))
                .filter(el => {
                    // Keep an element if:
                    // 1. It's a top-level blockquote, or
                    // 2. It's not inside any blockquote
                    const isTopLevelBlockquote = el.tagName.toLowerCase() === 'blockquote' && 
                                                 topLevelBlockquoteIds.has(el.getAttribute('data-temp-id'));
                    const isInsideBlockquote = el.closest('blockquote') !== null;
                    
                    return isTopLevelBlockquote || !isInsideBlockquote;
                });
            
            // Group consecutive elements by type to maintain proper spacing
            const elementGroups = [];
            let currentGroup = { type: null, elements: [] };
            
            relevantElements.forEach(el => {
                const tagName = el.tagName.toLowerCase();
                
                // Determine element type for grouping
                let elType = 'block';
                if (tagName === 'blockquote') elType = 'blockquote';
                else if (tagName === 'ul' || tagName === 'ol') elType = 'list';
                
                // Start a new group if type changes
                if (currentGroup.type !== elType && currentGroup.elements.length > 0) {
                    elementGroups.push(currentGroup);
                    currentGroup = { type: elType, elements: [el] };
                } else {
                    currentGroup.type = elType;
                    currentGroup.elements.push(el);
                }
            });
            
            // Add the last group if it has elements
            if (currentGroup.elements.length > 0) {
                elementGroups.push(currentGroup);
            }
            
            // Process each group with appropriate spacing
            elementGroups.forEach((group, index) => {
                // Process the elements in this group
                processRelevantElements(group.elements, contentItems);
                
                // Add blank line after blockquotes when the next group is not a blockquote
                if (group.type === 'blockquote' && index < elementGroups.length - 1 && elementGroups[index + 1].type !== 'blockquote') {
                    // Add an empty text item to create a blank line
                    QAClipper.Utils.addTextItem(contentItems, '');
                }
            });
            
            // Clean up temporary IDs
            topLevelBlockquotes.forEach(el => el.removeAttribute('data-temp-id'));
        } else if (contentItems.length === 0) {
            console.warn("[v18] Assistant text container (.prose) not found and no other blocks either in turn:", turnElement);
        }

        return contentItems;
    }

    // --- Main Configuration Object ---
    const chatgptConfig = {
      platformName: 'ChatGPT',
      version: 18, // v18: Updated version identifier for blockquote fix
      selectors: { // Unchanged selectors
        turnContainer: 'article[data-testid^="conversation-turn-"]',
        userMessageContainer: 'div[data-message-author-role="user"]',
        userText: 'div[data-message-author-role="user"] .whitespace-pre-wrap',
        userImageContainer: 'div[data-message-author-role="user"] div.overflow-hidden.rounded-lg img[src]',
        userFileContainer: 'div[data-message-author-role="user"] div[class*="group text-token-text-primary"]',
        userFileName: 'div.truncate.font-semibold',
        userFileType: 'div.text-token-text-secondary.truncate',
        relevantBlocksInTextContainer: `
          div.markdown.prose > p,
          div.markdown.prose > ul,
          div.markdown.prose > ol,
          div.markdown.prose > pre,
          div.markdown.prose > h1,
          div.markdown.prose > h2,
          div.markdown.prose > h3,
          div.markdown.prose > h4,
          div.markdown.prose > h5,
          div.markdown.prose > h6,
          div.markdown.prose > hr,
          div.markdown.prose > blockquote,
          div.markdown.prose > table,
          div.markdown.prose > div.overflow-x-auto > table,
          div.markdown.prose div.tableContainer > table,
          :scope > pre /* Pre directly under assistant container (less common) */
        `,
        assistantTextContainer: 'div[data-message-author-role="assistant"] .markdown.prose',
        listItem: 'li',
        codeBlockContainer: 'pre',
        codeBlockContent: 'code',
        codeBlockLangIndicatorContainer: ':scope > div.contain-inline-size > div:first-child, :scope > div:first-child[class*="flex items-center"]',
        imageContainerAssistant: 'div.group\\/imagegen-image',
        imageElementAssistant: 'img[alt="생성된 이미지"][src*="oaiusercontent"]',
        imageCaption: null,
        interactiveBlockContainer: 'div[id^="textdoc-message-"]',
        interactiveBlockTitle: 'span.min-w-0.truncate',
        interactiveBlockCodeMirrorContent: 'div.cm-content .cm-line',
      },

      // --- Extraction Functions ---
      getRole: (turnElement) => { /* Unchanged */
          const messageElement = turnElement.querySelector(':scope div[data-message-author-role]'); return messageElement ? messageElement.getAttribute('data-message-author-role') : null; },
      extractUserText: (turnElement) => { /* Unchanged */
          const textElement = turnElement.querySelector(chatgptConfig.selectors.userText); return textElement ? QAClipper.Utils.htmlToMarkdown(textElement, { skipElementCheck: shouldSkipElement }).trim() || null : null; },
      extractUserUploadedImages: (turnElement) => { /* Unchanged */
          const images = []; const imageElements = turnElement.querySelectorAll(chatgptConfig.selectors.userImageContainer); imageElements.forEach(imgElement => { const src = imgElement.getAttribute('src'); if (src && !src.startsWith('data:') && !src.startsWith('blob:')) { let altText = imgElement.getAttribute('alt')?.trim(); const extractedContent = altText && altText !== "업로드한 이미지" ? altText : "User Uploaded Image"; try { const absoluteSrc = new URL(src, window.location.origin).href; images.push({ type: 'image', sourceUrl: absoluteSrc, isPreviewOnly: false, extractedContent: extractedContent }); } catch (e) { console.error("[Extractor v18] Error parsing user image URL:", e, src); } } }); return images; },
      extractUserUploadedFiles: (turnElement) => { /* Unchanged */
          const files = []; const fileContainers = turnElement.querySelectorAll(chatgptConfig.selectors.userFileContainer); fileContainers.forEach(container => { const nameElement = container.querySelector(chatgptConfig.selectors.userFileName); const typeElement = container.querySelector(chatgptConfig.selectors.userFileType); const fileName = nameElement ? nameElement.textContent?.trim() : null; let fileType = typeElement ? typeElement.textContent?.trim() : 'File'; if (fileType && fileType.includes(' ') && !['kB', 'MB', 'GB'].some(unit => fileType.endsWith(unit))) { fileType = fileType.split(' ')[0]; } else if (fileType && ['kB', 'MB', 'GB'].some(unit => fileType.endsWith(unit))) { fileType = 'File'; } if (fileName) { const previewContent = null; files.push({ type: 'file', fileName: fileName, fileType: fileType, isPreviewOnly: !previewContent, extractedContent: previewContent }); } }); return files; },

      /**
       * v18: Updated extraction function for better structure preservation
       */
      extractAssistantContent: extractAssistantContent,

    }; // End chatgptConfig


    // Assign the config object to the window
    window.chatgptConfig = chatgptConfig;
    console.log("chatgptConfig initialized (v18 - Nested Blockquote Fix)");

})();