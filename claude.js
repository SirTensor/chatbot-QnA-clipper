// --- START OF FILE claude.js ---

/**
 * Claude.ai-specific extraction logic for Chatbot Q&A Clipper
 * Based on analysis of claude.ai DOM structure as of late 2024 / early 2025.
 * Handles user messages, assistant messages, user images, artifacts, and code blocks.
 */

// Wrap the entire script in an IIFE to prevent variable leakage
(function() {
  // Check if this extractor is already registered
  if (window.QAClipperExtractors && window.QAClipperExtractors.claude) {
    console.log('Claude extractor already registered, skipping re-registration.');
    return;
  }

  const ClaudeExtractor = {
    /**
     * Site identifier
     */
    siteId: 'claude',

    /**
     * Checks if the current page is Claude.ai
     * @returns {Boolean} - True if current page is Claude.ai
     */
    isMatch: function() {
      return window.location.hostname.includes('claude.ai');
    },

    /**
     * Extracts raw Q&A data from Claude conversations.
     * Uses turn containers and specific selectors for user/assistant content.
     * @returns {Array} - Array of objects with type, content, and optional images/code
     */
    extractRawData: function() {
      console.log('Starting Claude raw data extraction');

      try {
        // STRATEGY: Identify individual turn containers.
        // `div[data-test-render-count]` seems to wrap each message block reliably.
        const turnElements = document.querySelectorAll('div[data-test-render-count]');
        console.log('Using turn container selector [data-test-render-count], found:', turnElements.length);

        if (turnElements.length === 0) {
          // Try finding chat messages wrapper if the above fails
          const chatWrapper = document.querySelector('div[data-testid="chat-messages"]');
          if (chatWrapper) {
             const children = chatWrapper.children;
             console.log('Fallback: Using children of [data-testid="chat-messages"], found:', children.length);
             // Basic grouping attempt - very fragile, assumes pairs or simple structure
             // This part might need significant refinement based on actual structure
             const potentialTurns = [];
             let currentGroup = null;
             for(const child of children) {
                // Heuristic: Look for user/assistant markers or structural breaks.
                // This is a placeholder - needs specific selectors for Claude's structure within chat-messages
                if (child.querySelector('div[data-testid="user-message"]') || child.querySelector('div.font-claude-message')) {
                    potentialTurns.push(child);
                } else if (potentialTurns.length > 0 && child.textContent.trim().length > 0) {
                    // Append potentially related content if it doesn't look like a new turn start
                    // This is risky, might merge unrelated things.
                    // potentialTurns[potentialTurns.length - 1].appendChild(child.cloneNode(true));
                }
             }
             // If potentialTurns were found via fallback, use them. Otherwise, throw error.
             if(potentialTurns.length > 0) {
                 turnElements = potentialTurns;
             } else {
                 throw new Error('No conversation turns found using [data-test-render-count] or fallback [data-testid="chat-messages"] children. Claude UI may have changed, or no chat is visible.');
             }

          } else {
             throw new Error('No conversation turns found using [data-test-render-count] or fallback [data-testid="chat-messages"]. Claude UI may have changed, or no chat is visible.');
          }
        }


        const rawDataArray = [];

        turnElements.forEach((turnElement, index) => {
          try {
            // Check if it's a user turn
            const userMsgElement = turnElement.querySelector('div[data-testid="user-message"]');
            if (userMsgElement) {
              const userText = userMsgElement.textContent.trim();
              const userImages = this.extractUserImages(turnElement);

              // Add user turn if it has text or images
              if (userText || userImages.length > 0) {
                rawDataArray.push({
                  type: 'user',
                  content: userText,
                  images: userImages
                });
              }
            } else {
              // Check if it's an assistant turn
              const assistantMsgElement = turnElement.querySelector('div.font-claude-message');
              if (assistantMsgElement) {
                // Extract content, images, artifacts, and potential code blocks
                const { content, images, artifacts, codeBlocks } = this.extractAssistantContent(assistantMsgElement);
                let finalContent = content; // Start with base markdown text

                // --- Assemble final content ---
                // 1. Append artifact information and associated code
                artifacts.forEach(artifact => {
                  finalContent += `\n\n[Artifact: ${artifact.type} - "${artifact.title}"]`;
                  if (artifact.code) {
                     // Format the extracted code block found and associated
                     finalContent += `\n\`\`\`${artifact.language || ''}\n${artifact.code.trim()}\n\`\`\`\n`;
                  } else if (artifact.type.toLowerCase().includes('image') || artifact.type.toLowerCase().includes('svg')) {
                     // Specific message for visual artifacts if code wasn't found structurally linked
                     finalContent += `\n(Visual content for this artifact is rendered externally or code block linkage not found)\n`;
                  } else {
                     // Generic placeholder if no code was found linked to this artifact
                     finalContent += `\n(Code/Content for this artifact not found or linked in the message structure)\n`;
                  }
                });

                // 2. Append any other standalone code blocks found (not linked to an artifact)
                codeBlocks.forEach(block => {
                    // Check if this code block was already associated with an artifact
                    const isAssociated = artifacts.some(a => a.code === block.code && a.language === block.language);
                    if (!isAssociated) {
                         finalContent += `\n\n\`\`\`${block.language || ''}\n${block.code.trim()}\n\`\`\`\n`;
                    }
                });


                // Add assistant turn if it has text, images, or artifacts/code
                if (finalContent.trim() || images.length > 0) {
                  rawDataArray.push({
                    type: 'assistant',
                    content: finalContent.trim(),
                    images: images // Add standard assistant images (non-artifact)
                  });
                }
              } else {
                 // console.warn(`Turn element ${index + 1} is neither user nor assistant, skipping.`, turnElement);
                 // Attempt to capture generic content if structure isn't recognized
                 const genericContent = turnElement.textContent?.trim();
                 if (genericContent && genericContent.length > 10) { // Avoid tiny/empty fragments
                     console.log(`Turn element ${index + 1} not recognized as user/assistant. Capturing generic content.`);
                     rawDataArray.push({ type: 'unknown', content: genericContent, images: [] });
                 } else {
                     console.warn(`Turn element ${index + 1} is neither user nor assistant and has minimal content, skipping.`, turnElement);
                 }
              }
            }
          } catch (turnError) {
            const errorMsg = `Error processing turn element ${index + 1}: ${turnError.message}`;
            console.error(errorMsg, turnError.stack, turnElement);
            const fallbackText = turnElement.textContent?.trim();
            if (fallbackText && fallbackText.length > 10) {
                 rawDataArray.push({ type: 'unknown', content: `[Error processing this part: ${turnError.message}]\n${fallbackText}`, images: [] });
            }
          }
        });

        console.log(`Extracted ${rawDataArray.length} items from Claude conversation`);

        if (rawDataArray.length === 0 && turnElements.length > 0) {
           throw new Error('Found conversation structure but failed to extract any valid Q&A pairs. Check inner selectors or content format.');
        }
        if (rawDataArray.length === 0) {
           throw new Error('No conversation content found or extracted.');
        }

        return rawDataArray;
      } catch (error) {
        console.error('Error during Claude extraction process:', error);
        throw error; // Re-throw for the content script
      }
    },

    /**
     * Extracts user-uploaded image URLs from a user turn container.
     * @param {HTMLElement} turnElement - The main container for the user turn.
     * @returns {Array<string>} - Array of valid image source URLs.
     */
    extractUserImages: function(turnElement) {
        const images = [];
        // Selector for user image previews might need adjustment
        // Look for divs containing images before the main user message div
        const potentialImageContainers = turnElement.querySelectorAll('div:has(> img):not([data-testid="user-message"])'); // Experimental: find divs with direct img children, exclude message div

        potentialImageContainers.forEach(container => {
            // Ensure this container is structurally *before* the user message if possible
            // Or check if it's within a known image preview area class if one exists
            // For now, we'll be permissive
             container.querySelectorAll('img').forEach(img => {
                const src = img.getAttribute('src');
                if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
                    const absoluteSrc = src.startsWith('/') ? window.location.origin + src : src;
                     if (!images.includes(absoluteSrc)) {
                        images.push(absoluteSrc);
                        // console.log(`Found user image: ${absoluteSrc}`);
                    }
                } else if (src && src.startsWith('blob:')) {
                     // console.log(`Skipping user image (blob URL): ${src}`);
                }
            });
        });

        // Fallback/alternative selector based on previous findings
        // Escape dot in class name 'mx-0.5' -> 'mx-0\\.5'
        const specificPreviewContainer = turnElement.querySelector('div.mx-0\\.5.mb-3');
        if (specificPreviewContainer) {
             specificPreviewContainer.querySelectorAll('img').forEach(img => {
                 const src = img.getAttribute('src');
                 if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
                     const absoluteSrc = src.startsWith('/') ? window.location.origin + src : src;
                     if (!images.includes(absoluteSrc)) { // Avoid duplicates
                         images.push(absoluteSrc);
                         // console.log(`Found user image (fallback selector): ${absoluteSrc}`);
                     }
                 }
             });
        }
        return images;
    },

    /**
     * Extracts text content, standard images, artifact info, and potentially linked code blocks from an assistant message element.
     * @param {HTMLElement} assistantMsgElement - The <div class="font-claude-message ..."> element.
     * @returns {object} - An object { content: string, images: Array<string>, artifacts: Array<object>, codeBlocks: Array<object> }
     */
    extractAssistantContent: function(assistantMsgElement) {
        let markdownContent = '';
        const images = [];
        const artifacts = [];
        const allCodeBlocks = []; // Store all found code blocks temporarily, associated or not

        // Selectors for different content types within the assistant message
        // Includes paragraphs, lists, artifact buttons, and code blocks (`pre`)
        const contentSelector = 'div[tabindex="0"] > div > :is(p, ul, ol, pre, div.py-2)'; // div.py-2 often contains buttons
        const imageSelector = 'div[tabindex="0"] > div img'; // Standard images

        // --- Step 1: Extract standard images (not part of artifact previews) ---
        assistantMsgElement.querySelectorAll(imageSelector).forEach(img => {
             // Ensure the image is not inside an artifact button/preview
            if (!img.closest('button.flex.text-left') && !img.closest('div.py-2 > button')) {
                const src = img.getAttribute('src');
                if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
                    const width = img.naturalWidth || img.width;
                    const height = img.naturalHeight || img.height;
                    // Basic filtering for potentially meaningful images vs icons
                    if (width > 32 || height > 32) { // Adjusted threshold
                        const absoluteSrc = src.startsWith('/') ? window.location.origin + src : src;
                        if (!images.includes(absoluteSrc)) {
                            images.push(absoluteSrc);
                        }
                    }
                }
            }
        });

        // --- Step 2: Process primary content elements in order (text, lists, code, artifacts) ---
        const contentElements = assistantMsgElement.querySelectorAll(contentSelector);
        let lastArtifactButtonContainer = null; // Track the container of the last found artifact button

        contentElements.forEach(element => {
            // --- Handle Standard Text/List Content ---
             if (element.matches('p, ul, ol')) {
                 const html = element.outerHTML;
                 try {
                     const parsedHtml = window.QAClipper.Utils.parseHTML(html);
                     markdownContent += window.QAClipper.Utils.htmlToMarkdown(parsedHtml) + '\n\n';
                 } catch (parseError) {
                     console.warn("Error parsing HTML for markdown conversion, using textContent as fallback:", parseError, element);
                     markdownContent += element.textContent.trim() + '\n\n';
                 }
                 lastArtifactButtonContainer = null; // Reset artifact tracking

            // --- Handle Artifact Button Container (div.py-2) ---
            } else if (element.matches('div.py-2')) {
                const button = element.querySelector('button.flex.text-left');
                if (button) {
                     const titleElement = button.querySelector('div.leading-tight.text-sm');
                     const typeElement = button.querySelector('div.text-sm.text-text-300'); // Adjust selector if needed
                     const title = titleElement ? titleElement.textContent.trim() : 'Untitled Artifact';
                     // Clean up type text (e.g., "코드 · 123 lines")
                     let type = typeElement ? typeElement.textContent.trim().split('·')[0].trim() : 'Unknown';

                     const artifactData = {
                         title: title,
                         type: type,
                         code: null, // Initialize code as null
                         language: null,
                         artifactContainerElement: element // Store the container (div.py-2)
                     };
                     artifacts.push(artifactData);
                     lastArtifactButtonContainer = element; // Track this container
                     // console.log(`Found artifact button: "${title}" (${type})`);
                } else {
                    // If div.py-2 doesn't contain the expected button, treat as regular content?
                    // Or ignore? Let's ignore for now to avoid adding noise.
                    lastArtifactButtonContainer = null;
                }

            // --- Handle Code Block (<pre>) ---
            } else if (element.tagName === 'PRE') {
                const codeElement = element.querySelector('code[class*="language-"]');
                const codeContent = codeElement ? codeElement.textContent || '' : element.textContent || '';
                const language = codeElement ? (codeElement.className.match(/language-(\S+)/)?.[1] || '') : '';

                const codeBlockData = {
                    code: codeContent,
                    language: language,
                    element: element // Store the <pre> element
                };
                allCodeBlocks.push(codeBlockData); // Add to the list of all found code blocks

                 // ** NEW Association Logic:** Check if this <pre> is the *next sibling*
                 // of the *container* of the last found artifact button.
                 if (lastArtifactButtonContainer && element === lastArtifactButtonContainer.nextElementSibling) {
                     // Find the artifact associated with lastArtifactButtonContainer
                     const associatedArtifact = artifacts.find(a => a.artifactContainerElement === lastArtifactButtonContainer);
                     if (associatedArtifact && !associatedArtifact.code) { // Associate only if not already found
                         associatedArtifact.code = codeContent;
                         associatedArtifact.language = language;
                         // console.log(`Associated code block with artifact "${associatedArtifact.title}" via nextElementSibling`);
                     }
                 }
                 lastArtifactButtonContainer = null; // Reset artifact tracking after processing <pre>
            }
        });

        // --- Step 3: Clean up and return ---
        // Remove the temporary container element reference from artifacts
        artifacts.forEach(a => delete a.artifactContainerElement);

        return {
             content: markdownContent.trim(),
             images: images,
             artifacts: artifacts, // Artifacts (some might have code associated now)
             codeBlocks: allCodeBlocks // All found code blocks (associated or standalone)
         };
    }

  };

  // Register the extractor
  if (!window.QAClipperExtractors) {
    window.QAClipperExtractors = {};
  }

  if (!window.QAClipperExtractors[ClaudeExtractor.siteId]) {
     window.QAClipperExtractors[ClaudeExtractor.siteId] = ClaudeExtractor;
     console.log(`Claude extractor (${ClaudeExtractor.siteId}) registered.`);
  }

})(); // End of IIFE
// --- END OF FILE claude.js ---