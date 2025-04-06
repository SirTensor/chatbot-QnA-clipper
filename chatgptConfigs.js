// --- START OF FILE chatgptConfigs.js ---

// chatgptConfigs.js (v14 - Correct Interactive Block Processing)

(function() {
    // Initialization check
    if (window.chatgptConfig && window.chatgptConfig.version === 14) { return; }
  
    // --- Helper Functions ---
  
    function shouldSkipElement(element) {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
      const selectors = window.chatgptConfig?.selectors;
      if (!selectors) return false;
      const tagNameLower = element.tagName.toLowerCase();
  
      // Skip elements handled by dedicated extractors/processors
      // Ensure code blocks, image containers, and interactive containers are skipped
      return (element.matches(selectors.codeBlockContainer)) ||
             (element.matches(selectors.imageContainerAssistant)) ||
             (element.matches(selectors.interactiveBlockContainer)) ||
             // Skip internal parts of interactive block if somehow targeted directly
             (element.closest(selectors.interactiveBlockContainer)) ||
             (element.closest(selectors.userMessageContainer) && element.matches('span.hint-pill'));
    }
  
    function processList(el, listType) { // Unchanged
        let lines = []; let itemIndex = 0;
        const listItems = el.querySelectorAll(':scope > li');
        listItems.forEach(li => {
            const itemMarkdown = QAClipper.Utils.htmlToMarkdown(li, { skipElementCheck: shouldSkipElement, ignoreTags: ['ul', 'ol'] }).trim();
            if (itemMarkdown) {
                const marker = listType === 'ul' ? '-' : `${itemIndex + 1}.`;
                lines.push(`${marker} ${itemMarkdown.replace(/\n+/g, ' ')}`);
                if (listType === 'ol') itemIndex++;
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
  
     function processAssistantImage(el) { // Unchanged from v13
         // console.log("[Extractor v14] Processing Image Container:", el);
         const selectors = window.chatgptConfig.selectors;
         const targetImgElement = el.querySelector(selectors.imageElementAssistant);
         if (!targetImgElement) { /* ... fallback ... */
             console.error("[Extractor v14] Image element not found using selector:", selectors.imageElementAssistant, "in container:", el);
             const anyImg = el.querySelector('img[src*="oaiusercontent"]'); if (!anyImg) return null;
             console.warn("[Extractor v14] Using broader fallback image search."); targetImgElement = anyImg; }
         const src = targetImgElement.getAttribute('src');
         if (!src || src.startsWith('data:') || src.startsWith('blob:')) { /* ... error ... */ console.error("[Extractor v14] Selected image has invalid src:", src); return null; }
         // console.log("[Extractor v14] Successfully selected image src:", src);
         let altText = targetImgElement.getAttribute('alt')?.trim(); const extractedContent = (altText && altText !== "생성된 이미지") ? altText : "Generated Image";
         try { const absoluteSrc = new URL(src, window.location.origin).href; return { type: 'image', src: absoluteSrc, alt: altText || "Generated Image", extractedContent: extractedContent }; }
         catch (e) { console.error("[Extractor v14] Error parsing assistant image URL:", e, src); return null; }
     }
  
     /**
      * v14: Processes interactive block container to extract title and code.
      * Returns a single 'interactive_block' item.
      */
     function processInteractiveBlock(el) {
        console.log("[Extractor v14] Processing Interactive Block:", el);
        const selectors = window.chatgptConfig.selectors;
        let title = null;
        let code = null;
        let language = null;
  
        // 1. Extract Title
        const titleElement = el.querySelector(selectors.interactiveBlockTitle);
        if (titleElement) {
            title = titleElement.textContent?.trim();
        }
  
        // 2. Extract Code from CodeMirror lines
        const codeLines = el.querySelectorAll(selectors.interactiveBlockCodeMirrorContent);
        if (codeLines.length > 0) {
            let codeContent = '';
            codeLines.forEach(line => { codeContent += line.textContent + '\n'; });
            code = codeContent.trimEnd(); // Remove final trailing newline only
        } else {
             console.log("[Extractor v14] CodeMirror content not found in interactive block:", el);
             // As a fallback, check if there's a simple <pre><code> inside the interactive block
              const preCode = el.querySelector('pre > code');
              if(preCode) {
                  console.log("[Extractor v14] Found fallback pre>code inside interactive block.");
                  code = preCode.textContent.trimEnd();
              }
        }
  
  
        // 3. Guess Language (optional, based on title)
        if (title) {
            const lowerTitle = title.toLowerCase();
            if (lowerTitle.includes('cpp') || lowerTitle.includes('c++')) language = 'cpp';
            else if (lowerTitle.includes('python') || lowerTitle.endsWith('.py')) language = 'python';
            else if (lowerTitle.includes('javascript') || lowerTitle.endsWith('.js')) language = 'javascript';
            else if (lowerTitle.includes('html')) language = 'html';
            else if (lowerTitle.includes('css')) language = 'css';
        }
  
        // Only return an item if we found at least a title or code
        if (title || code) {
            return {
                type: 'interactive_block',
                title: title || '[Interactive Block]', // Provide default title if missing
                code: code,
                language: language
            };
        } else {
            console.error("[Extractor v14] Failed to extract title or code from interactive block:", el);
            return null; // Indicate failure to extract meaningful content
        }
     }
  
  
    // --- Main Configuration Object ---
    const chatgptConfig = {
      platformName: 'ChatGPT',
      version: 14, // Config version identifier
      selectors: {
        turnContainer: 'article[data-testid^="conversation-turn-"]',
        userMessageContainer: 'div[data-message-author-role="user"]',
        userText: 'div[data-message-author-role="user"] .whitespace-pre-wrap',
        userImageContainer: 'div[data-message-author-role="user"] div.overflow-hidden.rounded-lg img[src]',
        userFileContainer: 'div[data-message-author-role="user"] div[class*="group text-token-text-primary"]',
        userFileName: 'div.truncate.font-semibold',
        userFileType: 'div.text-token-text-secondary.truncate',
        // v14: Selector for blocks *within* the text container
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
          div.markdown.prose > table,
          :scope > pre /* Pre directly under text container */
        `,
        assistantTextContainer: 'div[data-message-author-role="assistant"]',
        listItem: 'li',
        codeBlockContainer: 'pre',
        codeBlockContent: 'code',
        codeBlockLangIndicatorContainer: ':scope > div.contain-inline-size > div:first-child, :scope > div:first-child[class*="flex items-center"]',
        imageContainerAssistant: 'div.group\\/imagegen-image',
        imageElementAssistant: 'img[alt="생성된 이미지"][src*="oaiusercontent"]', // Simple selector
        imageCaption: null,
        interactiveBlockContainer: 'div[id^="textdoc-message-"]', // To find the block
        interactiveBlockTitle: 'span.min-w-0.truncate', // For title within the block
        // v14: Added selector for code lines within interactive block
        interactiveBlockCodeMirrorContent: 'div.cm-content .cm-line',
      },
  
      // --- Extraction Functions ---
      getRole: (turnElement) => { /* Unchanged */
          const messageElement = turnElement.querySelector(':scope div[data-message-author-role]'); return messageElement ? messageElement.getAttribute('data-message-author-role') : null; },
      extractUserText: (turnElement) => { /* Unchanged */
          const textElement = turnElement.querySelector(chatgptConfig.selectors.userText); return textElement ? QAClipper.Utils.htmlToMarkdown(textElement, { skipElementCheck: shouldSkipElement }).trim() || null : null; },
      extractUserUploadedImages: (turnElement) => { /* Unchanged */
          const images = []; const imageElements = turnElement.querySelectorAll(chatgptConfig.selectors.userImageContainer); imageElements.forEach(imgElement => { const src = imgElement.getAttribute('src'); if (src && !src.startsWith('data:') && !src.startsWith('blob:')) { let altText = imgElement.getAttribute('alt')?.trim(); const extractedContent = altText && altText !== "업로드한 이미지" ? altText : "User Uploaded Image"; try { const absoluteSrc = new URL(src, window.location.origin).href; images.push({ type: 'image', sourceUrl: absoluteSrc, isPreviewOnly: false, extractedContent: extractedContent }); } catch (e) { console.error("Error parsing user image URL:", e, src); } } }); return images; },
      extractUserUploadedFiles: (turnElement) => { /* Unchanged */
          const files = []; const fileContainers = turnElement.querySelectorAll(chatgptConfig.selectors.userFileContainer); fileContainers.forEach(container => { const nameElement = container.querySelector(chatgptConfig.selectors.userFileName); const typeElement = container.querySelector(chatgptConfig.selectors.userFileType); const fileName = nameElement ? nameElement.textContent?.trim() : null; let fileType = typeElement ? typeElement.textContent?.trim() : 'File'; if (fileType && fileType.includes(' ') && !['kB', 'MB', 'GB'].some(unit => fileType.endsWith(unit))) { fileType = fileType.split(' ')[0]; } else if (fileType && ['kB', 'MB', 'GB'].some(unit => fileType.endsWith(unit))) { fileType = 'File'; } if (fileName) { const previewContent = null; files.push({ type: 'file', fileName: fileName, fileType: fileType, isPreviewOnly: !previewContent, extractedContent: previewContent }); } }); return files; },
  
      /**
       * v14: Extracts content by finding image/interactive/text containers separately.
       */
      extractAssistantContent: (turnElement) => {
          const contentItems = [];
          const selectors = chatgptConfig.selectors;
  
          // console.log("[v14] Processing assistant turn:", turnElement);
  
          // 1. Find and Process Image Container(s)
          const imageContainer = turnElement.querySelector(`:scope ${selectors.imageContainerAssistant}`);
          if (imageContainer) {
              // console.log("[v14] Found image container:", imageContainer);
              const imageItem = processAssistantImage(imageContainer);
              if (imageItem) contentItems.push(imageItem);
          }
  
          // 2. Find and Process Interactive Block(s)
          const interactiveBlock = turnElement.querySelector(`:scope ${selectors.interactiveBlockContainer}`);
           if (interactiveBlock) {
               // console.log("[v14] Found interactive block:", interactiveBlock);
               // Call the updated function which extracts title AND code
               const interactiveItem = processInteractiveBlock(interactiveBlock);
               if (interactiveItem) contentItems.push(interactiveItem);
               // Code is handled within processInteractiveBlock, no need to look for following <pre> specifically for this
           }
  
          // 3. Find and Process the Main Text/Code Container
          const textContainer = turnElement.querySelector(selectors.assistantTextContainer);
          if (textContainer) {
              // console.log("[v14] Found text container:", textContainer);
              const relevantElements = textContainer.querySelectorAll(selectors.relevantBlocksInTextContainer);
              // console.log(`[v14] Found ${relevantElements.length} relevant elements inside text container.`);
              processRelevantElements(relevantElements, contentItems);
          } else if (contentItems.length === 0) { // Only warn if nothing else was found either
               console.warn("[v14] Assistant text container not found and no other blocks either in turn:", turnElement);
          }
  
          console.log("[Extractor - ChatGPT v14] Final contentItems:", JSON.stringify(contentItems, null, 2));
          return contentItems;
      },
  
    }; // End chatgptConfig
  
  
    /**
     * Helper function to process relevant elements found *within the text container*.
     * It should NOT handle interactive blocks here anymore.
     */
     function processRelevantElements(elements, contentItems) { // v12 logic (Markdown grouping)
         const processedElements = new Set();
         let consecutiveMdBlockElements = [];
  
         function flushMdBlock() {
             if (consecutiveMdBlockElements.length > 0) {
                 const tempDiv = document.createElement('div');
                 consecutiveMdBlockElements.forEach(el => tempDiv.appendChild(el.cloneNode(true)));
                 const combinedMarkdown = QAClipper.Utils.htmlToMarkdown(tempDiv, { skipElementCheck: shouldSkipElement }).trim();
                 if (combinedMarkdown) { QAClipper.Utils.addTextItem(contentItems, combinedMarkdown); }
                 consecutiveMdBlockElements = [];
             }
         }
  
         elements.forEach((element) => {
             if (processedElements.has(element)) return;
             const tagNameLower = element.tagName.toLowerCase();
             const isStandardMdBlock = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'table'].includes(tagNameLower);
             let handledSeparately = false;
  
             // --- Handle Special Blocks (within text container) ---
             // Interactive blocks are handled OUTSIDE this function
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
                 const listItem = processList(element, tagNameLower);
                 if (listItem) contentItems.push(listItem);
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
                     console.warn(`  -> Fallback [Text Container]: Unhandled element: <${tagNameLower}>`, element);
                     const fallbackText = QAClipper.Utils.htmlToMarkdown(element, { skipElementCheck: shouldSkipElement }).trim();
                     if (fallbackText) { QAClipper.Utils.addTextItem(contentItems, fallbackText); }
                     processedElements.add(element);
                 }
             }
         });
         flushMdBlock(); // Final flush
     } // End processRelevantElements
  
  
    window.chatgptConfig = chatgptConfig;
    console.log("chatgptConfig initialized (v14)");
  
  })();
  // --- END OF FILE chatgptConfigs.js ---