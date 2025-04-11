// chatgptConfigs.js (v23 - Fixed Indentation in Lists and Blockquotes)

(function() {
    // Initialization check
    // v23: Adjusted indentation in lists and blockquotes
    if (window.chatgptConfig && window.chatgptConfig.version === 23) { return; }

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
        
        // Process task list items (checkboxes)
        const checkboxItems = clone.querySelectorAll('li input[type="checkbox"]');
        checkboxItems.forEach(checkbox => {
            const isChecked = checkbox.checked;
            const checkboxMd = isChecked ? '[x] ' : '[ ] ';
            
            // Create a text node with the markdown checkbox syntax
            const replacementText = document.createTextNode(checkboxMd);
            
            // Replace the checkbox with our markdown-style checkbox text
            checkbox.parentNode.replaceChild(replacementText, checkbox);
        });
        
        // Call the original markdown converter with our pre-processed clone
        return QAClipper.Utils.htmlToMarkdown(clone, options).trim();
    }

    /**
     * Comprehensive blockquote processor that preserves hierarchy and nested content
     * with improved code block handling
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
                
                // Handle code blocks (pre elements)
                if (tagName === 'pre') {
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
     * with improved indentation for blockquotes
     */
     function processList(el, listType, level = 0, isWithinBlockquote = false, blockquoteLevel = 0) {
         let lines = [];
         let itemIndex = 0;
         if (listType === 'ol') {
            const startAttribute = el.getAttribute('start');
            if (startAttribute) {
                const startIndex = parseInt(startAttribute, 10);
                if (!isNaN(startIndex) && startIndex > 0) {
                    itemIndex = startIndex - 1;
                } else {
                     console.warn(`[Extractor v20 processList] Invalid 'start' attribute found: ${startAttribute}`, el);
                }
            }
         }
         
         // Track the top-level blockquotes that are direct children of list items
         let listItemsToProcess = Array.from(el.querySelectorAll(':scope > li'));
         
         listItemsToProcess.forEach(li => {
             const liClone = li.cloneNode(true);
             let originalPreElements = [];
             let originalBlockquotes = [];
             let originalNestedLists = [];
             
             // Track all nested elements by type for proper ordering
             const nestedElements = [];
             
             // First, identify all nested elements to preserve their order
             let childNodes = Array.from(li.childNodes);
             for (let i = 0; i < childNodes.length; i++) {
                 const node = childNodes[i];
                 if (node.nodeType === Node.ELEMENT_NODE) {
                     const tagName = node.tagName.toLowerCase();
                     if (tagName === 'ul' || tagName === 'ol') {
                         originalNestedLists.push({
                             element: node,
                             index: i,
                             type: tagName
                         });
                         nestedElements.push({
                             type: 'list',
                             element: node,
                             index: i
                         });
                     } else if (tagName === 'pre') {
                         originalPreElements.push({
                             element: node,
                             index: i
                         });
                         nestedElements.push({
                             type: 'pre',
                             element: node,
                             index: i
                         });
                     } else if (tagName === 'blockquote') {
                         originalBlockquotes.push({
                             element: node,
                             index: i
                         });
                         nestedElements.push({
                             type: 'blockquote',
                             element: node,
                             index: i
                         });
                     }
                 }
             }
             
             // Sort nested elements by their position in the original DOM
             nestedElements.sort((a, b) => a.index - b.index);
             
             // Process the basic text content first (excluding nested elements)
             const textContent = extractListItemTextContent(liClone);
             
             // Determine the list item marker
             const marker = listType === 'ul' ? '-' : `${itemIndex + 1}.`;
             const indent = '    '.repeat(level);
             const textIndent = '    '.repeat(level + 1);
             
             // Apply blockquote prefix if needed
             const bqPrefix = isWithinBlockquote ? '> '.repeat(blockquoteLevel) : '';
             
             let hasAddedContent = false;
             
             // Add the list item text if it exists
             if (textContent && textContent.trim()) {
                 const itemTextLines = textContent.trim().split('\n').filter(line => line.trim());
                 const formattedText = itemTextLines.map((line, idx) => {
                     return idx === 0 ? `${bqPrefix}${indent}${marker} ${line}` : `${bqPrefix}${textIndent}${line}`;
                 }).join('\n');
                 lines.push(formattedText);
                 hasAddedContent = true;
             }
             
             // Process nested elements in their original order
             for (const nestedEl of nestedElements) {
                 if (nestedEl.type === 'pre') {
                     const codeItem = processCodeBlock(nestedEl.element);
                     if (codeItem) {
                         let codeContentLines = [];
                         const lang = codeItem.language || '';
                         codeContentLines.push(`\`\`\`${lang}`);
                         codeContentLines = codeContentLines.concat(codeItem.content.split('\n'));
                         codeContentLines.push('```');
                         
                         const codeBlockIndent = '    '.repeat(level + 1);
                         const firstCodePrefix = hasAddedContent ? '' : `${marker} `;
                         const firstCodeIndent = hasAddedContent ? codeBlockIndent : indent;
                         
                         const formattedCodeLines = codeContentLines.map((line, idx) => {
                             if (!hasAddedContent && idx === 0) {
                                 return `${bqPrefix}${firstCodeIndent}${firstCodePrefix}${line}`;
                             } else {
                                 return `${bqPrefix}${codeBlockIndent}${line}`;
                             }
                         }).join('\n');
                         
                         lines.push(formattedCodeLines);
                         hasAddedContent = true;
                     }
                 } else if (nestedEl.type === 'list') {
                     const nestedList = nestedEl.element;
                     const nestedType = nestedList.tagName.toLowerCase();
                     const nestedResult = processList(nestedList, nestedType, level + 1, isWithinBlockquote, blockquoteLevel);
                     
                     if (nestedResult && nestedResult.content) {
                         // If this is the first content in the list item, add the list marker
                         if (!hasAddedContent) {
                             const firstLine = nestedResult.content.split('\n')[0];
                             const restLines = nestedResult.content.split('\n').slice(1);
                             
                             // Replace indentation with list marker for the first line
                             const newFirstLine = `${bqPrefix}${indent}${marker} ${firstLine.trim().substring(bqPrefix.length + (level+1)*2)}`;
                             lines.push(newFirstLine);
                             
                             if (restLines.length > 0) {
                                 lines.push(restLines.join('\n'));
                             }
                         } else {
                             lines.push(nestedResult.content);
                         }
                         
                         hasAddedContent = true;
                     }
                 } else if (nestedEl.type === 'blockquote') {
                     const blockquote = nestedEl.element;
                     
                     // Skip if already processed
                     if (blockquote.hasAttribute('data-processed')) {
                         continue;
                     }
                     
                     // Mark as processed to avoid duplication
                     blockquote.setAttribute('data-processed', 'true');
                     
                     // Process blockquote with special handling for nested list context
                     // Pass correct indentation level for the list item
                     const bqContent = processBlockquoteInListV2(blockquote, level, textIndent);
                     
                     if (bqContent) {
                         // If this is the first content, we need to add the list marker
                         if (!hasAddedContent) {
                             const bqLines = bqContent.split('\n');
                             const firstLine = bqLines[0];
                             const restLines = bqLines.slice(1);
                             
                             // Add list marker to the first line
                             // Use proper indentation level for the blockquote marker
                             const newFirstLine = `${bqPrefix}${indent}${marker} ${firstLine}`;
                             lines.push(newFirstLine);
                             
                             if (restLines.length > 0) {
                                 lines.push(restLines.join('\n'));
                             }
                         } else {
                             // Add proper indentation to each blockquote line
                             const bqLines = bqContent.split('\n');
                             const formattedBqLines = bqLines.map(line => {
                                 return `${bqPrefix}${textIndent}${line}`;
                             });
                             lines.push(formattedBqLines.join('\n'));
                         }
                         
                         hasAddedContent = true;
                     }
                 }
             }
             
             // Only increment ordered list index if content was added
             if (hasAddedContent && listType === 'ol') {
                 itemIndex++;
             }
             
             // Clean up temporary attributes
             originalBlockquotes.forEach(({ element }) => {
                 element.removeAttribute('data-processed');
             });
         });
         
         return lines.length > 0 ? { type: 'text', content: lines.join('\n') } : null;
     }

    /**
     * Extract text content from a list item while excluding nested elements
     */
    function extractListItemTextContent(liElement) {
        // Create a clone to avoid modifying the original
        const clone = liElement.cloneNode(true);
        
        // Remove all nested lists, blockquotes, and pre elements
        const nestedElements = clone.querySelectorAll('ul, ol, blockquote, pre');
        nestedElements.forEach(el => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
        
        // Now get the markdown from the cleaned clone
        return enhancedHtmlToMarkdown(clone, {
            skipElementCheck: shouldSkipElement
        }).trim();
    }

    /**
     * Simplified blockquote processing for list items that properly handles indentation
     * @param {HTMLElement} blockquote - The blockquote element to process
     * @param {number} listLevel - The indentation level of the parent list
     * @param {string} indentation - The indentation string to apply to each line
     * @returns {string} - Formatted blockquote content
     */
    function processBlockquoteInListV2(blockquote, listLevel, indentation) {
        // Process the blockquote content
        const resultLines = [];
        
        // Process child elements in order
        processBlockquoteChildrenForList(blockquote, resultLines);
        
        return resultLines.join('\n');
    }
    
    /**
     * Helper to process blockquote children for list context
     * @param {HTMLElement} element - The element to process
     * @param {Array} resultLines - Array to collect result lines
     */
    function processBlockquoteChildrenForList(element, resultLines) {
        // Process all child nodes to extract content with structure
        for (const child of element.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent.trim();
                if (text) {
                    resultLines.push(`> ${text}`);
                }
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const tagName = child.tagName.toLowerCase();
                
                if (tagName === 'p') {
                    // Process paragraphs
                    const content = enhancedHtmlToMarkdown(child, {
                        skipElementCheck: shouldSkipElement
                    }).trim();
                    
                    if (content) {
                        content.split('\n').forEach(line => {
                            resultLines.push(`> ${line}`);
                        });
                    }
                } else if (tagName === 'pre') {
                    // Process code blocks inside blockquotes
                    const codeItem = processCodeBlock(child);
                    if (codeItem) {
                        // Add an empty blockquote line before the code block
                        resultLines.push(`>`);
                        
                        // Format code with blockquote prefixes
                        const lang = codeItem.language || '';
                        resultLines.push(`> \`\`\`${lang}`);
                        
                        const codeLines = codeItem.content.split('\n');
                        codeLines.forEach(line => {
                            resultLines.push(`> ${line}`);
                        });
                        
                        resultLines.push(`> \`\`\``);
                    }
                } else if (tagName === 'ul' || tagName === 'ol') {
                    // Process lists inside blockquotes
                    const isOrderedList = tagName === 'ol';
                    const listItems = child.querySelectorAll(':scope > li');
                    let index = 1;
                    
                    // Get the 'start' attribute for ordered lists
                    if (isOrderedList) {
                        const startAttr = child.getAttribute('start');
                        if (startAttr) {
                            const startNum = parseInt(startAttr);
                            if (!isNaN(startNum) && startNum > 0) {
                                index = startNum;
                            }
                        }
                    }
                    
                    // Process each list item
                    listItems.forEach(li => {
                        // Check if the list item contains nested lists
                        const nestedLists = li.querySelectorAll(':scope > ul, :scope > ol');
                        
                        // Get the text content of the list item without nested lists
                        const liClone = li.cloneNode(true);
                        nestedLists.forEach(nestedList => {
                            const correspondingNestedList = liClone.querySelector(`${nestedList.tagName.toLowerCase()}[data-id="${nestedList.getAttribute('data-id')}"]`) || 
                                                          Array.from(liClone.querySelectorAll(nestedList.tagName.toLowerCase()))
                                                               .find(el => el.innerHTML === nestedList.innerHTML);
                            if (correspondingNestedList && correspondingNestedList.parentNode) {
                                correspondingNestedList.parentNode.removeChild(correspondingNestedList);
                            }
                        });
                        
                        const itemContent = enhancedHtmlToMarkdown(liClone, {
                            skipElementCheck: shouldSkipElement
                        }).trim();
                        
                        if (itemContent) {
                            const marker = isOrderedList ? `${index}.` : '-';
                            const lines = itemContent.split('\n');
                            
                            // First line gets the list marker
                            resultLines.push(`> ${marker} ${lines[0]}`);
                            
                            // Any additional lines get proper indentation
                            for (let i = 1; i < lines.length; i++) {
                                resultLines.push(`>     ${lines[i]}`);
                            }
                            
                            // Process nested lists
                            if (nestedLists.length > 0) {
                                nestedLists.forEach(nestedList => {
                                    const nestedTagName = nestedList.tagName.toLowerCase();
                                    const isNestedOrdered = nestedTagName === 'ol';
                                    const nestedItems = nestedList.querySelectorAll(':scope > li');
                                    let nestedIndex = 1;
                                    
                                    // Get start attribute for nested ordered lists
                                    if (isNestedOrdered) {
                                        const nestedStartAttr = nestedList.getAttribute('start');
                                        if (nestedStartAttr) {
                                            const nestedStartNum = parseInt(nestedStartAttr);
                                            if (!isNaN(nestedStartNum) && nestedStartNum > 0) {
                                                nestedIndex = nestedStartNum;
                                            }
                                        }
                                    }
                                    
                                    // Process each nested list item with proper indentation (increased to 4 spaces)
                                    nestedItems.forEach(nestedLi => {
                                        const nestedContent = enhancedHtmlToMarkdown(nestedLi, {
                                            skipElementCheck: shouldSkipElement
                                        }).trim();
                                        
                                        if (nestedContent) {
                                            const nestedMarker = isNestedOrdered ? `${nestedIndex}.` : '-';
                                            const nestedLines = nestedContent.split('\n');
                                            
                                            // Add the nested list item with proper indentation (increased to 4 spaces)
                                            resultLines.push(`>     ${nestedMarker} ${nestedLines[0]}`);
                                            
                                            // Add additional lines with even more indentation
                                            for (let i = 1; i < nestedLines.length; i++) {
                                                resultLines.push(`>         ${nestedLines[i]}`);
                                            }
                                            
                                            if (isNestedOrdered) {
                                                nestedIndex++;
                                            }
                                        }
                                    });
                                });
                            }
                            
                            // Increment counter for ordered lists
                            if (isOrderedList) {
                                index++;
                            }
                        }
                    });
                } else if (tagName === 'blockquote') {
                    // Handle nested blockquotes - add an extra '>' prefix
                    const nestedLines = [];
                    processBlockquoteChildrenForList(child, nestedLines);
                    
                    nestedLines.forEach(line => {
                        resultLines.push(`>${line}`);
                    });
                } else {
                    // Handle other elements
                    const content = enhancedHtmlToMarkdown(child, {
                        skipElementCheck: shouldSkipElement
                    }).trim();
                    
                    if (content) {
                        content.split('\n').forEach(line => {
                            resultLines.push(`> ${line}`);
                        });
                    }
                }
            }
        }
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
             console.error("[Extractor v20] Image element not found using selector:", selectors.imageElementAssistant, "in container:", el);
             const anyImg = el.querySelector('img[src*="oaiusercontent"]');
             if (!anyImg) return null;
             console.warn("[Extractor v20] Using broader fallback image search.");
             targetImgElement = anyImg;
         }
         const src = targetImgElement.getAttribute('src');
         if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
             console.error("[Extractor v20] Selected image has invalid src:", src);
             return null;
         }
         let altText = targetImgElement.getAttribute('alt')?.trim();
         const extractedContent = (altText && altText !== "생성된 이미지") ? altText : "Generated Image";
         try {
             const absoluteSrc = new URL(src, window.location.origin).href;
             return { type: 'image', src: absoluteSrc, alt: altText || "Generated Image", extractedContent: extractedContent };
         }
         catch (e) {
             console.error("[Extractor v20] Error parsing assistant image URL:", e, src);
             return null;
         }
     }

     function processInteractiveBlock(el) { // Unchanged
        // console.log("[Extractor v20] Processing Interactive Block:", el);
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
             // console.log("[Extractor v20] CodeMirror content not found in interactive block:", el);
              const preCode = el.querySelector('pre > code');
              if(preCode) {
                  // console.log("[Extractor v20] Found fallback pre>code inside interactive block.");
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
            console.error("[Extractor v20] Failed to extract title or code from interactive block:", el);
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
            console.warn("[Extractor v20] Table has no header (thead > tr > th). Cannot generate Markdown.", tableElement);
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
                    console.warn("[Extractor v20] Table row skipped due to column count mismatch.", row);
                }
            });
        }

        return markdownRows.length > 2 ? markdownRows.join('\n') : null; // Need header + separator + at least one data row
    }

    /**
     * v20: Improved blockquote processing in lists
     */
     function processRelevantElements(elements, contentItems) {
         const processedElements = new Set();
         let consecutiveMdBlockElements = [];

         function flushMdBlock() {
             if (consecutiveMdBlockElements.length > 0) {
                 const tempDiv = document.createElement('div');
                 consecutiveMdBlockElements.forEach(el => tempDiv.appendChild(el.cloneNode(true)));
                 
                 // Pre-process task lists in the tempDiv before converting to markdown
                 const taskItems = tempDiv.querySelectorAll('li input[type="checkbox"]');
                 taskItems.forEach(checkbox => {
                     const isChecked = checkbox.checked;
                     const checkboxMd = isChecked ? '[x] ' : '[ ] ';
                     
                     // Create a text node with the markdown checkbox syntax
                     const replacementText = document.createTextNode(checkboxMd);
                     
                     // Replace the checkbox with our markdown-style checkbox text
                     checkbox.parentNode.insertBefore(replacementText, checkbox);
                     checkbox.parentNode.removeChild(checkbox);
                 });
                 
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
                 flushMdBlock();
                 const item = processCodeBlock(element);
                 if (item) contentItems.push(item);
                 processedElements.add(element);
                 element.querySelectorAll('*').forEach(child => processedElements.add(child));
                 handledSeparately = true;
             }
             else if (tagNameLower === 'ul' || tagNameLower === 'ol') {
                 flushMdBlock();
                 
                 // Special handling for task lists (lists with checkboxes)
                 const hasCheckboxes = element.querySelector('li input[type="checkbox"]') !== null;
                 
                 if (hasCheckboxes) {
                     // Clone the list to avoid modifying the original
                     const listClone = element.cloneNode(true);
                     
                     // Pre-process all checkboxes in the list
                     const checkboxes = listClone.querySelectorAll('li > input[type="checkbox"]');
                     checkboxes.forEach(checkbox => {
                         const isChecked = checkbox.checked;
                         const checkboxMd = isChecked ? '[x] ' : '[ ] ';
                         const textNode = document.createTextNode(checkboxMd);
                         checkbox.parentNode.insertBefore(textNode, checkbox);
                         checkbox.parentNode.removeChild(checkbox);
                     });
                     
                     // Now process the list with pre-processed checkboxes
                     const listItem = processList(listClone, tagNameLower, 0, false, 0);
                     if (listItem) contentItems.push(listItem);
                 } else {
                     // Normal list processing
                     const listItem = processList(element, tagNameLower, 0, false, 0);
                     if (listItem) contentItems.push(listItem);
                 }
                 
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
                     console.warn("[Extractor v20] Failed to manually process table to Markdown:", tableElement);
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
     }

    /**
     * v20: Updated extraction function for better structure preservation
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
            console.warn("[v20] Assistant text container (.prose) not found and no other blocks either in turn:", turnElement);
        }

        return contentItems;
    }

    // --- Main Configuration Object ---
    const chatgptConfig = {
      platformName: 'ChatGPT',
      version: 23, // v23: Adjusted indentation in lists and blockquotes
      selectors: { // Updated selectors to include task lists
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
        checkboxItem: 'li input[type="checkbox"]',
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
          const images = []; const imageElements = turnElement.querySelectorAll(chatgptConfig.selectors.userImageContainer); imageElements.forEach(imgElement => { const src = imgElement.getAttribute('src'); if (src && !src.startsWith('data:') && !src.startsWith('blob:')) { let altText = imgElement.getAttribute('alt')?.trim(); const extractedContent = altText && altText !== "업로드한 이미지" ? altText : "User Uploaded Image"; try { const absoluteSrc = new URL(src, window.location.origin).href; images.push({ type: 'image', sourceUrl: absoluteSrc, isPreviewOnly: false, extractedContent: extractedContent }); } catch (e) { console.error("[Extractor v21] Error parsing user image URL:", e, src); } } }); return images; },
      extractUserUploadedFiles: (turnElement) => { /* Unchanged */
          const files = []; const fileContainers = turnElement.querySelectorAll(chatgptConfig.selectors.userFileContainer); fileContainers.forEach(container => { const nameElement = container.querySelector(chatgptConfig.selectors.userFileName); const typeElement = container.querySelector(chatgptConfig.selectors.userFileType); const fileName = nameElement ? nameElement.textContent?.trim() : null; let fileType = typeElement ? typeElement.textContent?.trim() : 'File'; if (fileType && fileType.includes(' ') && !['kB', 'MB', 'GB'].some(unit => fileType.endsWith(unit))) { fileType = fileType.split(' ')[0]; } else if (fileType && ['kB', 'MB', 'GB'].some(unit => fileType.endsWith(unit))) { fileType = 'File'; } if (fileName) { const previewContent = null; files.push({ type: 'file', fileName: fileName, fileType: fileType, isPreviewOnly: !previewContent, extractedContent: previewContent }); } }); return files; },

      /**
       * v21: Updated extraction function with improved blockquote and code block handling
       */
      extractAssistantContent: extractAssistantContent,

    }; // End chatgptConfig


    // Assign the config object to the window
    window.chatgptConfig = chatgptConfig;
    console.log("chatgptConfig initialized (v23 - Fixed Indentation in Lists and Blockquotes)");

})();