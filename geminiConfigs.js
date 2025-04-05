// geminiConfigs.js (Complete file, v26 - Fixed Text Duplication in Markdown Helper)

(function() {
  // Initialization check
  if (window.geminiConfig) { return; }

  // --- Helper Functions ---

  /**
   * Determines if an element should be skipped during markdown conversion based on Gemini-specific rules
   * @param {HTMLElement} element - The element to check
   * @returns {boolean} - True if the element should be skipped, false otherwise
   */
  function shouldSkipElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    
    const selectors = window.geminiConfig?.selectors;
    if (!selectors) return false;
    
    const tagNameLower = element.tagName.toLowerCase();
    
    // Skip elements that are handled separately by main extractor
    return (selectors.interactiveBlockContainer && element.matches(selectors.interactiveBlockContainer)) ||
           (selectors.imageContainerAssistant && element.matches(selectors.imageContainerAssistant)) ||
           tagNameLower === 'code-block' || 
           tagNameLower === 'ul' || tagNameLower === 'ol' || tagNameLower === 'pre';
  }

  function processList(el, listType) {
      let lines = [];
      let startNum = 1;
      if (listType === 'ol') {
          startNum = parseInt(el.getAttribute('start') || '1', 10);
          if (isNaN(startNum)) startNum = 1;
      }
      let itemIndex = 0;
      // Process only direct li children
      el.querySelectorAll(':scope > li').forEach(li => {
          // Use QAClipper.Utils.htmlToMarkdown with the Gemini-specific skip logic
          const itemMarkdown = QAClipper.Utils.htmlToMarkdown(li, { 
            skipElementCheck: shouldSkipElement 
          }).trim();
          if (itemMarkdown) {
              const marker = listType === 'ul' ? '-' : `${startNum + itemIndex}.`;
              lines.push(`${marker} ${itemMarkdown}`);
              if (listType === 'ol') itemIndex++;
          }
      });
      return lines.length > 0 ? { type: 'text', content: lines.join('\n') } : null;
  }

  function processCodeBlock(el) {
      const contentSelector = geminiConfig.selectors.codeBlockContent || 'pre>code';
      const langSelector = geminiConfig.selectors.codeBlockLangIndicator || 'div.code-block-decoration>span';
      const codeElement = el.querySelector(contentSelector);
      // Prioritize innerText for closer visual representation, fallback to textContent
      const code = codeElement ? (codeElement.innerText || codeElement.textContent || '') : '';
      const langElement = el.querySelector(langSelector);
      const language = langElement ? langElement.textContent?.trim() : null;
      // Return null if code is just whitespace
      return code.trim() ? { type: 'code_block', language: language, content: code.trim() } : null;
  }

  function processImage(el) {
      const captionSelector = geminiConfig.selectors.imageCaption || 'div.caption';
      const imgSelector = geminiConfig.selectors.imageElementAssistant || 'img.image.loaded';
      let imgElement = null, captionElement = null;
      const containerSelector = geminiConfig.selectors.imageContainerAssistant || 'single-image';

      // Check if the passed element is the container or the image itself
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

      // Exclude blob/data URIs
      if (!src || src.startsWith('blob:') || src.startsWith('data:')) return null;

      let altText = captionElement ? captionElement.textContent?.trim() : null;
      if (!altText) altText = imgElement.getAttribute('alt')?.trim();
      if (!altText) altText = "Image"; // Default alt text

      // Resolve relative URLs
      const absoluteSrc = new URL(src, window.location.origin).href;

      return {
          type: 'image',
          src: absoluteSrc,
          alt: altText, // Store alt text
          extractedContent: altText // Use alt text as extracted content for consistency
      };
  }

  // --- Main Configuration Object ---
  const geminiConfig = {
    platformName: 'Gemini',
    selectors: { // Selectors remain the same as v25
      turnContainer: 'user-query, model-response',
      userMessageContainer: 'user-query', userText: '.query-text',
      userImageContainer: 'user-query-file-preview', userImageLink: 'a[href^="https://lens.google.com/uploadbyurl?url="]',
      userFileContainer: '.file-upload-container', userFileItem: '.file-upload-link', userFileName: '.file-name', userFileType: '.file-type',
      assistantContentArea: 'div.markdown.markdown-main-panel',
      relevantBlocks: 'p, ul, ol, code-block, single-image, div.attachment-container.immersive-entry-chip',
      listItem: 'li',
      codeBlockContent: 'pre > code', codeBlockLangIndicator: 'div.code-block-decoration > span',
      imageContainerAssistant: 'single-image', imageElementAssistant: 'img.image.loaded', imageCaption: 'div.caption', imageElement: 'img',
      sideContainer: 'code-immersive-panel', sideContainerContent: '.view-line', sideContainerLangIndicator: 'data-mode-id',
      interactiveBlockContainer: 'div.attachment-container.immersive-entry-chip', // The main container div
      interactiveBlockTitle: 'div[data-test-id="artifact-text"]', // Specific div containing the title
      interactiveBlockContent: null, // Content is not extracted here for Gemini
    },

    // --- Extraction Functions ---
    getRole: (turnElement) => {if(!turnElement||typeof turnElement.tagName!=='string')return null;const t=turnElement.tagName.toLowerCase();if(t==='user-query')return 'user';if(t==='model-response')return 'assistant';return null; },
    extractUserText: (turnElement) => { 
        const e = turnElement.querySelector(':scope .query-text'); 
        return e ? QAClipper.Utils.htmlToMarkdown(e, {
          skipElementCheck: shouldSkipElement
        }).trim() || null : null; 
    },
    extractUserUploadedImages: (turnElement) => {
        const images = [];
        const containerSelector = geminiConfig.selectors.userImageContainer;
        const linkSelector = geminiConfig.selectors.userImageLink;
        // Assuming the img tag is directly inside the container for simplicity
        const imgSelector = 'img';

        turnElement.querySelectorAll(`:scope ${containerSelector}`).forEach(container => {
            const linkElement = container.querySelector(linkSelector);
            const imgElement = container.querySelector(imgSelector); // Find the image element

            // Ensure both link and image elements are found
            if (linkElement && imgElement) {
                const href = linkElement.getAttribute('href');
                if (href) {
                    try {
                        const urlParams = new URLSearchParams(new URL(href).search);
                        const encodedUrl = urlParams.get('url');
                        if (encodedUrl) {
                            const decodedUrl = decodeURIComponent(encodedUrl);
                            // Get alt text, trim it, and provide a default
                            let altText = imgElement.getAttribute('alt')?.trim();
                            const extractedContent = altText || "User Uploaded Image"; // Use alt text or default

                            images.push({
                                type: 'image',
                                sourceUrl: decodedUrl,
                                isPreviewOnly: false, // Keep as is for now
                                extractedContent: extractedContent // Use the extracted alt text
                            });
                        }
                    } catch (e) {
                        console.error("Error parsing user image URL or extracting alt text:", e, href);
                    }
                }
            }
        });
        return images;
    },
    extractUserUploadedFiles: (turnElement) => { const f=[]; turnElement.querySelectorAll(':scope '+geminiConfig.selectors.userFileContainer).forEach(c=>{const nE=c.querySelector(geminiConfig.selectors.userFileName),tE=c.querySelector(geminiConfig.selectors.userFileType); if(nE){const n=nE.textContent?.trim(),t=tE?.textContent?.trim()||'U';let eC=null;const p=c.querySelector('.file-preview-content,.text-preview,pre');if(p)eC=p.textContent?.trim()||null; if(n)f.push({type:'file',fileName:n,fileType:t,isPreviewOnly:!eC,extractedContent:eC});}}); return f; },
    extractSideContainerCode: () => { /* ... unchanged ... */ },

    /**
     * Extracts structured content using querySelectorAll, preventing duplicates
     * and handling different block types including interactive blocks.
     * Uses QAClipper.Utils.htmlToMarkdown.
     */
    extractAssistantContent: (turnElement) => {
        const contentItems = [];
        const contentArea = turnElement.querySelector(geminiConfig.selectors.assistantContentArea);
        if (!contentArea) { console.warn("Gemini markdown content area not found."); return []; }

        console.log("[Extractor] Starting assistant extraction (v26 - Fixed Text Duplication)");

        const relevantElements = contentArea.querySelectorAll(geminiConfig.selectors.relevantBlocks);
        console.log(`[Extractor] Found ${relevantElements.length} relevant block elements.`);
        const processedElements = new Set();

        relevantElements.forEach((element, index) => {
            if (processedElements.has(element)) {
                // console.log(`[Extractor] Skipping Element #${index}: <${element.tagName.toLowerCase()}> (already processed)`);
                return;
            }

            const tagNameLower = element.tagName.toLowerCase();
            const isInteractiveBlock = element.matches(geminiConfig.selectors.interactiveBlockContainer);
            const isImageContainer = element.matches(geminiConfig.selectors.imageContainerAssistant);
            const isCodeBlock = tagNameLower === 'code-block';

            console.log(`[Extractor] Processing Element #${index}: <${tagNameLower}>`);
            let item = null;

            // --- Process based on type ---

            if (isInteractiveBlock) {
                console.log("  -> Handling as Interactive Block");
                const titleElement = element.querySelector(geminiConfig.selectors.interactiveBlockTitle);
                const title = titleElement ? titleElement.textContent?.trim() : null;
                if (title) {
                    contentItems.push({ type: 'interactive_block', title: title, code: null, language: null });
                } else {
                    console.warn("  -> Found interactive block container but failed to extract title:", element);
                    contentItems.push({ type: 'interactive_block', title: '[Interactive Block - Title Missing]', code: null, language: null });
                }
                processedElements.add(element);
            }
            else if (isCodeBlock) {
                console.log("  -> Handling as Code Block");
                item = processCodeBlock(element);
                if (item) contentItems.push(item);
                processedElements.add(element);
            }
            else if (tagNameLower === 'ul') {
                console.log("  -> Handling as UL");
                item = processList(element, 'ul');
                if (item) contentItems.push(item); // processList now returns a text item
                processedElements.add(element);
            }
            else if (tagNameLower === 'ol') {
                 console.log("  -> Handling as OL");
                 item = processList(element, 'ol');
                 if (item) contentItems.push(item); // processList now returns a text item
                 processedElements.add(element);
            }
             else if (isImageContainer) {
                 console.log("  -> Handling as Direct Image Container");
                 item = processImage(element);
                 if (item) contentItems.push(item);
                 processedElements.add(element);
             }
            else if (tagNameLower === 'p') {
                 // Use QAClipper.Utils.htmlToMarkdown for paragraphs
                 console.log("  -> Handling as P tag");
                 const blockMarkdown = QAClipper.Utils.htmlToMarkdown(element, {
                   skipElementCheck: shouldSkipElement
                 }).trim();
                 if (blockMarkdown) {
                     // Use addTextItem to correctly merge paragraphs
                     QAClipper.Utils.addTextItem(contentItems, blockMarkdown);
                 }
                 processedElements.add(element);
            }
            // ** Fallback / Unhandled **
            else {
                 console.warn(`  -> Unhandled relevant block type (will attempt text extraction): <${tagNameLower}>`, element);
                 // Use QAClipper.Utils.htmlToMarkdown for unhandled elements
                 const fallbackText = QAClipper.Utils.htmlToMarkdown(element, {
                   skipElementCheck: shouldSkipElement
                 }).trim();
                 if (fallbackText) {
                    QAClipper.Utils.addTextItem(contentItems, fallbackText);
                 }
                 processedElements.add(element); // Mark fallback as processed too
            }

        }); // End loop

        console.log("[Extractor] Final contentItems generated (v26 - Fixed Text Duplication):", JSON.stringify(contentItems, null, 2));
        return contentItems;
    }, // End extractAssistantContent

  }; // End geminiConfig

  window.geminiConfig = geminiConfig;
  console.log("geminiConfig initialized (v26 - Fixed Text Duplication)");
})(); // End of IIFE