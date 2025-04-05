// --- START OF FILE chatgptConfigs.js ---

// chatgptConfigs.js (v13 - Corrected Image Container Finding Logic)

(function() {
  // Initialization check
  if (window.chatgptConfig && window.chatgptConfig.version === 13) { return; }

  // --- Helper Functions ---

  function shouldSkipElement(element) { // Unchanged
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    const selectors = window.chatgptConfig?.selectors;
    if (!selectors) return false;
    const tagNameLower = element.tagName.toLowerCase();
    return (element.matches(selectors.codeBlockContainer)) ||
           (element.matches(selectors.imageContainerAssistant) && !element.closest('div.markdown.prose')) ||
           (element.matches(selectors.interactiveBlockContainer)) ||
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

   function processAssistantImage(el) { // Uses v9 simplified logic
       // console.log("[Extractor v13] Processing Image Container:", el);
       const selectors = window.chatgptConfig.selectors;
       const targetImgElement = el.querySelector(selectors.imageElementAssistant);
       if (!targetImgElement) {
           console.error("[Extractor v13] Image element not found using selector:", selectors.imageElementAssistant, "in container:", el);
           const anyImg = el.querySelector('img[src*="oaiusercontent"]');
           if (!anyImg) return null;
           console.warn("[Extractor v13] Using broader fallback image search.");
           targetImgElement = anyImg;
       }
       const src = targetImgElement.getAttribute('src');
       if (!src || src.startsWith('data:') || src.startsWith('blob:')) { console.error("[Extractor v13] Selected image has invalid src:", src); return null; }
       // console.log("[Extractor v13] Successfully selected image src:", src);
       let altText = targetImgElement.getAttribute('alt')?.trim();
       const extractedContent = (altText && altText !== "생성된 이미지") ? altText : "Generated Image";
       try { const absoluteSrc = new URL(src, window.location.origin).href; return { type: 'image', src: absoluteSrc, alt: altText || "Generated Image", extractedContent: extractedContent }; }
       catch (e) { console.error("[Extractor v13] Error parsing assistant image URL:", e, src); return null; }
   }

   function processInteractiveBlockTitle(el) { // Unchanged
      const selectors = window.chatgptConfig.selectors;
      const titleElement = el.querySelector(selectors.interactiveBlockTitle);
      const title = titleElement ? titleElement.textContent?.trim() : null;
      if (title) return { type: 'text', content: `> **${title}**` };
      return { type: 'text', content: `> [Interactive Block]` };
   }

  // --- Main Configuration Object ---
  const chatgptConfig = {
    platformName: 'Chatgpt',
    version: 13, // Config version identifier
    selectors: {
      turnContainer: 'article[data-testid^="conversation-turn-"]',
      userMessageContainer: 'div[data-message-author-role="user"]',
      userText: 'div[data-message-author-role="user"] .whitespace-pre-wrap',
      userImageContainer: 'div[data-message-author-role="user"] div.overflow-hidden.rounded-lg img[src]',
      userFileContainer: 'div[data-message-author-role="user"] div[class*="group text-token-text-primary"]',
      userFileName: 'div.truncate.font-semibold',
      userFileType: 'div.text-token-text-secondary.truncate',
      // relevantBlocksInTextContainer: Simplified selector for blocks *within* the text container
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
      // Selector for the main text container itself
      assistantTextContainer: 'div[data-message-author-role="assistant"]',
      listItem: 'li',
      codeBlockContainer: 'pre',
      codeBlockContent: 'code',
      codeBlockLangIndicatorContainer: ':scope > div.contain-inline-size > div:first-child, :scope > div:first-child[class*="flex items-center"]',
      // v13: Direct selector for image container (used in extractAssistantContent)
      imageContainerAssistant: 'div.group\\/imagegen-image',
      // v13: Selector for img *within* the container (used in processAssistantImage)
      imageElementAssistant: 'img[alt="생성된 이미지"][src*="oaiusercontent"]',
      imageCaption: null,
      // v13: Direct selector for interactive block (used in extractAssistantContent)
      interactiveBlockContainer: 'div[id^="textdoc-message-"]',
      interactiveBlockTitle: 'span.min-w-0.truncate',
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
     * v13: Extracts content by finding image/interactive/text containers separately within the turn.
     */
    extractAssistantContent: (turnElement) => {
        const contentItems = [];
        const selectors = chatgptConfig.selectors;

        console.log("[v13] Processing assistant turn:", turnElement);

        // 1. Find and Process Image Container(s) - Use direct selector
        const imageContainer = turnElement.querySelector(`:scope ${selectors.imageContainerAssistant}`);
        if (imageContainer) {
            console.log("[v13] Found image container:", imageContainer);
            const imageItem = processAssistantImage(imageContainer);
            if (imageItem) contentItems.push(imageItem);
        } else {
             console.log("[v13] No image container found using selector:", selectors.imageContainerAssistant);
        }

        // 2. Find and Process Interactive Block(s) - Use direct selector (TITLE ONLY)
        const interactiveBlock = turnElement.querySelector(`:scope ${selectors.interactiveBlockContainer}`);
         if (interactiveBlock) {
             console.log("[v13] Found interactive block:", interactiveBlock);
             const titleItem = processInteractiveBlockTitle(interactiveBlock);
             if (titleItem) contentItems.push(titleItem);
             // Code is expected in a following <pre> tag found in step 3
         } else {
              console.log("[v13] No interactive block found using selector:", selectors.interactiveBlockContainer);
         }

        // 3. Find and Process the Main Text/Code Container
        const textContainer = turnElement.querySelector(selectors.assistantTextContainer);
        if (textContainer) {
            console.log("[v13] Found text container:", textContainer);
            const relevantElements = textContainer.querySelectorAll(selectors.relevantBlocksInTextContainer);
            console.log(`[v13] Found ${relevantElements.length} relevant elements inside text container.`);
            processRelevantElements(relevantElements, contentItems); // Process elements *within* text container
        } else {
             console.warn("[v13] Assistant text container not found in turn:", turnElement);
             // If text container is missing, but we found image/interactive, that might be okay.
             // If nothing found at all, it's an empty turn.
        }

        console.log("[Extractor - ChatGPT v13] Final contentItems:", JSON.stringify(contentItems, null, 2));
        return contentItems;
    },

  }; // End chatgptConfig


  /**
   * Helper function to process relevant elements found *within the text container*.
   */
   function processRelevantElements(elements, contentItems) { // v12 logic (Markdown grouping)
       const processedElements = new Set();
       let consecutiveMdBlockElements = [];

       function flushMdBlock() {
           if (consecutiveMdBlockElements.length > 0) {
               // console.log(`  -> Flushing ${consecutiveMdBlockElements.length} accumulated MD blocks.`);
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
           const isStandardMdBlock = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'table'].includes(tagNameLower); // No need to check closest('prose') anymore
           let handledSeparately = false;

           // --- Handle Special Blocks First (Interrupt Grouping) ---
           // Images & Interactive titles are handled *outside* this function now
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
                   flushMdBlock(); // Flush before fallback
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
  console.log("chatgptConfig initialized (v13)");

})();
// --- END OF FILE chatgptConfigs.js ---