// chatgptConfigs.js (v24 - Refactored List/Blockquote Nesting)

(function() {
    // Initialization check
    // v29: Fixed LaTeX duplication in headings by processing KaTeX before headings
    if (window.chatgptConfig && window.chatgptConfig.version === 29) { return; }

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

        // Remove file citation elements if setting is enabled
        const config = window.chatgptConfig;
        if (config && config.settings && config.settings.excludeFileCitations) {
            const citationElements = clone.querySelectorAll('span.text-token-text-secondary');
            citationElements.forEach(citation => {
                if (citation.parentNode) {
                    citation.parentNode.removeChild(citation);
                }
            });
        }

        // Fix BR tags to prevent unwanted spaces after line breaks
        const brTags = clone.querySelectorAll('br');
        brTags.forEach(br => {
            // Check if there's a text node immediately after the <br>
            if (br.nextSibling && br.nextSibling.nodeType === Node.TEXT_NODE) {
                // Trim the leading space from the text node after <br>
                br.nextSibling.textContent = br.nextSibling.textContent.replace(/^\s+/, '');
            }
        });
        
        // Process KaTeX elements for LaTeX extraction FIRST (before heading processing)
        const katexInlineElements = clone.querySelectorAll('span.katex');
        katexInlineElements.forEach(katexEl => {
            const mathML = katexEl.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
            if (mathML) {
                const latex = mathML.textContent.trim();
                const replacementText = document.createTextNode(`$${latex}$`);
                katexEl.parentNode.replaceChild(replacementText, katexEl);
            }
        });

        const katexDisplayElements = clone.querySelectorAll('span.katex-display');
        katexDisplayElements.forEach(katexEl => {
            const mathML = katexEl.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
            if (mathML) {
                const latex = mathML.textContent.trim();
                const replacementText = document.createTextNode(`$$${latex}$$`);
                katexEl.parentNode.replaceChild(replacementText, katexEl);
            }
        });

        // Process headings to ensure they use markdown syntax (after KaTeX is already processed)
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
        
        // Process task list items (checkboxes) - handle both li and p containers
        const checkboxItems = clone.querySelectorAll('input[type="checkbox"]');
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
     * Handles lists and nested blockquotes correctly.
     * @param {HTMLElement} element - The blockquote element to process
     * @param {number} nestLevel - The nesting level of the blockquote (0 for top level)
     * @returns {string} - Formatted blockquote content with correct '>' prefixes
     */
    function processBlockquote(element, nestLevel = 0) {
        const prefix = '> '.repeat(nestLevel + 1);
        const resultLines = [];
        let previousNodeRequiresSpace = false; // Track if space needed before next element

        const childNodes = Array.from(element.childNodes);

        for (let i = 0; i < childNodes.length; i++) {
            const node = childNodes[i];

            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                    resultLines.push(`${prefix}${text}`);
                    previousNodeRequiresSpace = true; // Text usually means space before next block
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();

                // Add spacing before block elements if needed
                if (previousNodeRequiresSpace && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'ul', 'ol', 'blockquote'].includes(tagName)) {
                    if (resultLines.length > 0 && resultLines[resultLines.length - 1].trim() !== prefix.trim()) {
                         resultLines.push(prefix.trim()); // Add empty blockquote line for spacing
                    }
                }

                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                    const level = parseInt(tagName.substring(1));
                    const hashes = '#'.repeat(level);
                    const headingText = node.textContent.trim();
                    resultLines.push(`${prefix}${hashes} ${headingText}`);
                    previousNodeRequiresSpace = true;
                } else if (tagName === 'p') {
                    const content = enhancedHtmlToMarkdown(node, { skipElementCheck: shouldSkipElement }).trim();
                    if (content) {
                        content.split('\n').forEach(line => {
                            resultLines.push(`${prefix}${line}`);
                        });
                        previousNodeRequiresSpace = true;
                    } else {
                        // Handle empty paragraphs potentially used for spacing
                        previousNodeRequiresSpace = false; // Don't add extra space after empty <p>
                    }
                } else if (tagName === 'pre') {
                    const codeItem = processCodeBlock(node);
                    if (codeItem) {
                        const lang = codeItem.language || '';
                        resultLines.push(`${prefix}\`\`\`${lang}`);
                        codeItem.content.split('\n').forEach(line => {
                            resultLines.push(`${prefix}${line}`);
                        });
                        resultLines.push(`${prefix}\`\`\``);
                        previousNodeRequiresSpace = true;
                    } else {
                        previousNodeRequiresSpace = false;
                    }
                } else if (tagName === 'blockquote') {
                    // Process nested blockquote recursively
                    const nestedContent = processBlockquote(node, nestLevel + 1);
                    if (nestedContent) {
                        resultLines.push(nestedContent); // nestedContent already has correct prefixes
                        previousNodeRequiresSpace = true;
                    } else {
                        previousNodeRequiresSpace = false;
                    }
                } else if (tagName === 'ul' || tagName === 'ol') {
                    // Process list inside blockquote
                    // Pass `true` for isWithinBlockquote and the *next* blockquote level
                    const listResult = processList(node, tagName, 0, true, nestLevel + 1);
                    if (listResult && listResult.content) {
                        // processList now adds the blockquote prefix, so just add the content
                        resultLines.push(listResult.content);
                        // Lists often handle their own spacing, check last line of listResult
                        const listLines = listResult.content.split('\n');
                        if (listLines.length > 0 && listLines[listLines.length-1].trim() === ('> '.repeat(nestLevel + 1)).trim()) {
                             previousNodeRequiresSpace = false; // List ended with empty bq line
                        } else {
                             previousNodeRequiresSpace = true;
                        }
                    } else {
                         previousNodeRequiresSpace = false;
                    }
                } else {
                    // Handle other inline elements wrapped in the blockquote
                     const inlineContent = enhancedHtmlToMarkdown(node, { skipElementCheck: shouldSkipElement }).trim();
                     if (inlineContent) {
                          // Attempt to merge with the last line if it was also inline content
                          if (resultLines.length > 0 && !previousNodeRequiresSpace) {
                               resultLines[resultLines.length - 1] += ` ${inlineContent}`;
                          } else {
                               resultLines.push(`${prefix}${inlineContent}`);
                          }
                          previousNodeRequiresSpace = false; // Inline content doesn't force block spacing
                     }
                }
            }
        }

        // Clean up redundant blank lines at the end
        while (resultLines.length > 0 && resultLines[resultLines.length - 1].trim() === prefix.trim()) {
            resultLines.pop();
        }
        // Ensure at least one line if the blockquote wasn't empty, even if it's just the prefix
        // if (childNodes.length > 0 && resultLines.length === 0) {
        //     return prefix.trim();
        // }

        return resultLines.join('\n');
    }

     /**
      * Process a list element (ul/ol) and its children.
      * Handles nested lists, code blocks, and blockquotes within items.
      * Correctly applies blockquote prefixes if the list is inside a blockquote.
      * @param {HTMLElement} el - The list element (UL or OL).
      * @param {string} listType - 'ul' or 'ol'.
      * @param {number} level - The nesting level of the list (0 for top level).
      * @param {boolean} isWithinBlockquote - True if this list is inside a blockquote.
      * @param {number} blockquoteLevel - The nesting level of the parent blockquote (0 if not nested).
      * @returns {object|null} - A text content item { type: 'text', content: '...' } or null.
      */
      function processList(el, listType, level = 0, isWithinBlockquote = false, blockquoteLevel = 0) {
         let lines = [];
         let itemIndex = 0; // For ordered lists

         // Determine starting number for ordered lists
         if (listType === 'ol') {
             const startAttribute = el.getAttribute('start');
             if (startAttribute) {
                 const startIndex = parseInt(startAttribute, 10);
                 // Use startIndex - 1 because itemIndex is 0-based initially
                 if (!isNaN(startIndex) && startIndex > 0) {
                     itemIndex = startIndex - 1;
                 }
             }
         }

         // Calculate prefixes based on context
         const bqPrefix = isWithinBlockquote ? '> '.repeat(blockquoteLevel) : '';
         const indent = '    '.repeat(level); // 4 spaces for indentation
         const textIndent = '    '.repeat(level + 1); // Indentation for content following the marker line

         // Process each direct child list item
         const listItemsToProcess = Array.from(el.querySelectorAll(':scope > li'));

         listItemsToProcess.forEach(li => {
             let currentContentLines = []; // Store lines for the current list item
             let hasAddedContent = false; // Track if anything was added for this li
             const marker = listType === 'ul' ? '-' : `${itemIndex + 1}.`;

             // Process child nodes sequentially to preserve order
             const processNodes = (nodes, isFirstLevel = true) => {
                 let textBuffer = ''; // Buffer to accumulate text content
                 
                 const flushTextBuffer = () => {
                     if (textBuffer.trim()) {
                         const textLines = textBuffer.trim().split('\n');
                         textLines.forEach((line, idx) => {
                             if (!hasAddedContent && idx === 0) {
                                 // First content gets the list marker
                                 currentContentLines.push(`${bqPrefix}${indent}${marker} ${line}`);
                                 hasAddedContent = true;
                             } else {
                                 // Subsequent lines need more indentation
                                 currentContentLines.push(`${bqPrefix}${textIndent}${line}`);
                             }
                         });
                         textBuffer = '';
                     }
                 };

                 Array.from(nodes).forEach(node => {
                     if (node.nodeType === Node.TEXT_NODE) {
                         // Accumulate text content
                         const text = node.textContent || '';
                         if (text.trim()) {
                             textBuffer += text;
                         }
                     } else if (node.nodeType === Node.ELEMENT_NODE) {
                         const tagName = node.tagName.toLowerCase();
                         
                         // Handle checkbox items (task list items)
                         if (tagName === 'p' && node.querySelector('input[type="checkbox"]')) {
                             flushTextBuffer(); // Flush any existing text first
                             
                             const checkbox = node.querySelector('input[type="checkbox"]');
                             const isChecked = checkbox.checked;
                             const checkboxMd = isChecked ? '[x]' : '[ ]';
                             
                             // Clone the paragraph to remove checkbox without modifying original
                             const clonedPara = node.cloneNode(true);
                             const clonedCheckbox = clonedPara.querySelector('input[type="checkbox"]');
                             if (clonedCheckbox && clonedCheckbox.parentNode) {
                                 clonedCheckbox.parentNode.removeChild(clonedCheckbox);
                             }

                             // Convert remaining content to markdown (preserving inline code, emphasis, etc.)
                             const textContent = enhancedHtmlToMarkdown(clonedPara, { skipElementCheck: shouldSkipElement }).trim();
                             
                             if (!hasAddedContent) {
                                 // First content gets the list marker with checkbox
                                 currentContentLines.push(`${bqPrefix}${indent}${marker} ${checkboxMd} ${textContent}`);
                                 hasAddedContent = true;
                             } else {
                                 // Subsequent lines need more indentation
                                 currentContentLines.push(`${bqPrefix}${textIndent}${checkboxMd} ${textContent}`);
                             }
                         } else if (tagName === 'pre') {
                             // Flush any accumulated text before processing code block
                             flushTextBuffer();
                             
                             const codeItem = processCodeBlock(node);
                             if (codeItem) {
                                 if (!hasAddedContent) {
                                     // If this is the first element, add the marker line first
                                     currentContentLines.push(`${bqPrefix}${indent}${marker} `);
                                     hasAddedContent = true;
                                 }
                                 const codeBlockIndent = textIndent;
                                 const lang = codeItem.language || '';
                                 currentContentLines.push(`${bqPrefix}${codeBlockIndent}\`\`\`${lang}`);
                                 codeItem.content.split('\n').forEach(line => {
                                     currentContentLines.push(`${bqPrefix}${codeBlockIndent}${line}`);
                                 });
                                 currentContentLines.push(`${bqPrefix}${codeBlockIndent}\`\`\``);
                             }
                         } else if (tagName === 'ul' || tagName === 'ol') {
                             // Flush any accumulated text before processing nested list
                             flushTextBuffer();
                             
                             const nestedResult = processList(node, tagName, level + 1, isWithinBlockquote, blockquoteLevel);
                             if (nestedResult && nestedResult.content) {
                                 if (!hasAddedContent) {
                                     // If first element, need to merge marker with first line of nested list
                                     const nestedLines = nestedResult.content.split('\n');
                                     const firstNestedLine = nestedLines[0] || '';
                                     // Extract content after blockquote prefix and list marker/indent
                                     const firstLineContent = firstNestedLine.substring(bqPrefix.length).trim().replace(/^[-*0-9.]+\s+/, '');
                                     currentContentLines.push(`${bqPrefix}${indent}${marker} ${firstLineContent}`);
                                     // Add rest of the lines
                                     currentContentLines.push(...nestedLines.slice(1));
                                     hasAddedContent = true;
                                 } else {
                                     // Append nested list content directly
                                     currentContentLines.push(nestedResult.content);
                                 }
                             }
                         } else if (tagName === 'blockquote') {
                             // Flush any accumulated text before processing blockquote
                             flushTextBuffer();
                             
                             const bqContent = processBlockquote(node, blockquoteLevel);
                             if (bqContent) {
                                 if (!hasAddedContent) {
                                     // If first element, add marker line first
                                     currentContentLines.push(`${bqPrefix}${indent}${marker} `);
                                     hasAddedContent = true;
                                 }
                                 const bqLines = bqContent.split('\n');
                                 // Indent each line of the blockquote content under the list item
                                 bqLines.forEach(line => {
                                     // line already has its '>' prefixes from processBlockquote
                                     // Indent based on list level, preserving existing '>' prefixes
                                     const effectiveLine = line.startsWith(bqPrefix) ? line.substring(bqPrefix.length) : line;
                                     currentContentLines.push(`${bqPrefix}${textIndent}${effectiveLine}`);
                                 });
                                 if (bqLines.length > 0) hasAddedContent = true;
                             }
                         } else {
                             // For other elements, convert to markdown and add to text buffer
                             const elementMarkdown = enhancedHtmlToMarkdown(node, {
                                 skipElementCheck: shouldSkipElement
                             });
                             if (elementMarkdown.trim()) {
                                 textBuffer += elementMarkdown;
                             }
                         }
                     }
                 });
                 
                 // Flush any remaining text
                 flushTextBuffer();
             };

             // Process all child nodes
             processNodes(li.childNodes);

             // If absolutely nothing was added (e.g., empty <li>), add the marker line
             if (!hasAddedContent) {
                 currentContentLines.push(`${bqPrefix}${indent}${marker} `);
                 hasAddedContent = true;
             }

             // Add the processed lines for this item to the main lines array
             lines.push(...currentContentLines);

             // Increment ordered list counter only if content was added
             if (hasAddedContent && listType === 'ol') {
                 itemIndex++;
             }
         });

         // Return null if no lines were generated, otherwise return the content item
         return lines.length > 0 ? { type: 'text', content: lines.join('\n') } : null;
     }

     /**
      * Extract text content from a list item while excluding nested elements
      * that will be processed separately (ul, ol, blockquote, pre).
      */
     function extractListItemTextContent(liElement) {
         // Create a clone to avoid modifying the original
         const clone = liElement.cloneNode(true);

         // Remove elements that processList handles separately to avoid duplication
         const nestedElements = clone.querySelectorAll('ul, ol, blockquote, pre');
         nestedElements.forEach(el => {
             if (el.parentNode) {
                 el.parentNode.removeChild(el);
             }
         });

         // Convert the remaining HTML (primarily text and inline formatting) to Markdown
         return enhancedHtmlToMarkdown(clone, {
             skipElementCheck: shouldSkipElement // Respect skips for things like images if needed
         }).trim();
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
     * Processes relevant elements within the assistant's response container.
     * Groups consecutive standard markdown elements and processes special blocks individually.
     * v24: Uses updated processBlockquote and processList functions.
     */
     function processRelevantElements(elements, contentItems) {
         const processedElements = new Set();
         let consecutiveMdBlockElements = [];

         function flushMdBlock() {
             if (consecutiveMdBlockElements.length > 0) {
                 const tempDiv = document.createElement('div');
                 consecutiveMdBlockElements.forEach(el => tempDiv.appendChild(el.cloneNode(true)));

                 // Pre-process task lists before converting to markdown
                 const taskItems = tempDiv.querySelectorAll('li input[type="checkbox"]');
                 taskItems.forEach(checkbox => {
                     const isChecked = checkbox.checked;
                     const checkboxMd = isChecked ? '[x] ' : '[ ] ';
                     const replacementText = document.createTextNode(checkboxMd);
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
             const isTableContainer = tagNameLower === 'table' ||
                                    (tagNameLower === 'div' && (element.classList.contains('overflow-x-auto') || element.classList.contains('tableContainer') || 
                                    Array.from(element.classList).some(cls => cls.startsWith('_tableContainer_'))) && element.querySelector(':scope > table, :scope table')) ||
                                    element.querySelector('.tableContainer > table, [class*="_tableContainer_"] table');
             const tableElement = isTableContainer ? (tagNameLower === 'table' ? element : (element.querySelector(':scope > table') || element.querySelector('table'))) : null;

             const isStandardMdBlock = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr'].includes(tagNameLower);
             let handledSeparately = false;

             // --- Handle Special Blocks ---
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
                 // Use the updated processList. It handles checkboxes internally if needed.
                 // Call with default context (level 0, not inside blockquote)
                 const listItem = processList(element, tagNameLower, 0, false, 0);
                 if (listItem) contentItems.push(listItem);
                 processedElements.add(element);
                 element.querySelectorAll('*').forEach(child => processedElements.add(child)); // processList handles children
                 handledSeparately = true;
             }
             else if (tableElement) {
                flushMdBlock();
                if (processedElements.has(element) || processedElements.has(tableElement)) return;
                const tableMarkdown = processTableToMarkdown(tableElement);
                if (tableMarkdown) {
                    QAClipper.Utils.addTextItem(contentItems, tableMarkdown);
                } else { console.warn("[Extractor v24] Failed to process table:", tableElement); }
                processedElements.add(element); // Add container
                processedElements.add(tableElement); // Add table itself
                element.querySelectorAll('*').forEach(child => processedElements.add(child)); // Mark all descendants
                handledSeparately = true;
             }
             else if (tagNameLower === 'blockquote') {
                 flushMdBlock();
                 if (processedElements.has(element)) return;
                 // Use the updated processBlockquote with nestLevel 0 for top-level
                 const blockquoteMarkdown = processBlockquote(element, 0);
                 if (blockquoteMarkdown) {
                     QAClipper.Utils.addTextItem(contentItems, blockquoteMarkdown);
                 }
                 processedElements.add(element);
                 element.querySelectorAll('*').forEach(child => processedElements.add(child)); // processBlockquote handles children
                 handledSeparately = true;
             }
             else if (tagNameLower === 'span' && element.classList.contains('katex-display')) {
                 flushMdBlock();
                 if (processedElements.has(element)) return;
                 // Handle standalone display math
                 const mathML = element.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
                 if (mathML) {
                     const latex = mathML.textContent.trim();
                     QAClipper.Utils.addTextItem(contentItems, `$$${latex}$$`);
                 }
                 processedElements.add(element);
                 element.querySelectorAll('*').forEach(child => processedElements.add(child));
                 handledSeparately = true;
             }
             else if (tagNameLower === 'span' && element.classList.contains('katex')) {
                 flushMdBlock();
                 if (processedElements.has(element)) return;
                 // Handle standalone inline math
                 const mathML = element.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
                 if (mathML) {
                     const latex = mathML.textContent.trim();
                     QAClipper.Utils.addTextItem(contentItems, `$${latex}$`);
                 }
                 processedElements.add(element);
                 element.querySelectorAll('*').forEach(child => processedElements.add(child));
                 handledSeparately = true;
             }

             // --- Accumulate Standard Blocks ---
             if (!handledSeparately) {
                 if (isStandardMdBlock) {
                     consecutiveMdBlockElements.push(element);
                     processedElements.add(element); // Mark element itself as processed
                 } else {
                     flushMdBlock(); // Flush any pending standard blocks
                     // Handle unrecognized elements or containers not processed above
                     if (!isTableContainer) { // Avoid double logging table containers
                        console.warn(`  -> [Fallback Text]: Unhandled element: <${tagNameLower}>`, element);
                        const fallbackText = enhancedHtmlToMarkdown(element, { skipElementCheck: shouldSkipElement }).trim();
                        if (fallbackText) {
                            QAClipper.Utils.addTextItem(contentItems, fallbackText);
                        }
                        processedElements.add(element);
                        // Mark children processed only if using fallback for the container
                        element.querySelectorAll('*').forEach(child => processedElements.add(child));
                     }
                 }
             }
         });
         flushMdBlock(); // Final flush for any remaining standard blocks
     }

    /**
     * v24: Updated extraction function for structure preservation using refactored processors.
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
      version: 29, // v29: Fixed LaTeX duplication in headings by processing KaTeX before headings
      selectors: { // Updated selectors for new table structure
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
          div.markdown.prose > div[class*="_tableContainer_"],
          div.markdown.prose > span.katex-display,
          div.markdown.prose > span.katex,
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
      extractUserText: (turnElement) => {
          const textElement = turnElement.querySelector(chatgptConfig.selectors.userText);
          if (!textElement) return null;

          // Process user content similar to assistant content to handle code blocks
          const contentItems = [];
          
          // Clone the element to avoid modifying the original
          const clone = textElement.cloneNode(true);
          
          // Process code blocks first
          const codeBlocks = Array.from(clone.querySelectorAll('pre'));
          codeBlocks.forEach(preElement => {
              const codeElement = preElement.querySelector('code');
              if (codeElement) {
                  let codeContent = codeElement.textContent.trim();
                  let language = null;
                  
                  // Extract language from the first line if it looks like a language identifier
                  const lines = codeContent.split('\n');
                  if (lines.length > 1 && lines[0].trim().match(/^[a-zA-Z]+$/)) {
                      language = lines[0].trim();
                      codeContent = lines.slice(1).join('\n').trim();
                  }
                  
                  // Add code block to content items
                  const codeMarkdown = language ? `\`\`\`${language}\n${codeContent}\n\`\`\`` : `\`\`\`\n${codeContent}\n\`\`\``;
                  QAClipper.Utils.addTextItem(contentItems, codeMarkdown);
                  
                  // Remove the processed pre element from the clone
                  preElement.remove();
              }
          });
          
          // For elements with whitespace-pre-wrap, preserve the original text content with line breaks
          if (textElement.classList.contains('whitespace-pre-wrap') || 
              getComputedStyle(textElement).whiteSpace === 'pre-wrap' ||
              getComputedStyle(textElement).whiteSpace === 'pre-line') {
              
              // Get the raw text content which preserves line breaks
              const rawText = clone.textContent || clone.innerText || '';
              const trimmedText = rawText.trim();
              
              if (trimmedText) {
                  QAClipper.Utils.addTextItem(contentItems, trimmedText);
              }
          } else {
              // Process remaining text content normally (after removing code blocks)
              const remainingText = QAClipper.Utils.htmlToMarkdown(clone, { 
                  skipElementCheck: shouldSkipElement 
              }).trim();
              
              if (remainingText) {
                  QAClipper.Utils.addTextItem(contentItems, remainingText);
              }
          }
          
          // Combine all content items into a single text
          return contentItems.length > 0 ? contentItems.map(item => item.content).join('\n\n') : null;
      },
      extractUserUploadedImages: (turnElement) => { /* Unchanged */
          const images = []; const imageElements = turnElement.querySelectorAll(chatgptConfig.selectors.userImageContainer); imageElements.forEach(imgElement => { const src = imgElement.getAttribute('src'); if (src && !src.startsWith('data:') && !src.startsWith('blob:')) { let altText = imgElement.getAttribute('alt')?.trim(); const extractedContent = altText && altText !== "업로드한 이미지" ? altText : "User Uploaded Image"; try { const absoluteSrc = new URL(src, window.location.origin).href; images.push({ type: 'image', sourceUrl: absoluteSrc, isPreviewOnly: false, extractedContent: extractedContent }); } catch (e) { console.error("[Extractor v21] Error parsing user image URL:", e, src); } } }); return images; },
      extractUserUploadedFiles: (turnElement) => { /* Unchanged */
          const files = []; const fileContainers = turnElement.querySelectorAll(chatgptConfig.selectors.userFileContainer); fileContainers.forEach(container => { const nameElement = container.querySelector(chatgptConfig.selectors.userFileName); const typeElement = container.querySelector(chatgptConfig.selectors.userFileType); const fileName = nameElement ? nameElement.textContent?.trim() : null; let fileType = typeElement ? typeElement.textContent?.trim() : 'File'; if (fileType && fileType.includes(' ') && !['kB', 'MB', 'GB'].some(unit => fileType.endsWith(unit))) { fileType = fileType.split(' ')[0]; } else if (fileType && ['kB', 'MB', 'GB'].some(unit => fileType.endsWith(unit))) { fileType = 'File'; } if (fileName) { const previewContent = null; files.push({ type: 'file', fileName: fileName, fileType: fileType, isPreviewOnly: !previewContent, extractedContent: previewContent }); } }); return files; },

      /**
       * v24: Uses the updated extractAssistantContent structure which relies on refactored processors.
       */
      extractAssistantContent: extractAssistantContent, // Ensure this points to the outer function

    }; // End chatgptConfig


    // Assign the config object to the window
    window.chatgptConfig = chatgptConfig;
    // console.log("chatgptConfig initialized (v29 - Fixed LaTeX duplication in headings by processing KaTeX before headings)");

})();