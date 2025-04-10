/**
 * Utility functions for the Chatbot Q&A Clipper extension
 * Using module pattern to avoid global namespace pollution
 */

// Create a self-contained module using IIFE
(function() {
  // Create the utilities object with all functions
  const Utils = {
    /**
     * Converts HTML to Markdown using TurndownService
     * @param {HTMLElement} element - HTML element to convert
     * @param {Object} options - Optional configuration options
     * @param {Function} options.skipElementCheck - Optional callback function that takes an element and returns 
     *                                              true if it should be skipped
     * @param {Array} options.ignoreTags - Array of tag names to ignore during conversion
     * @param {String} options.platformName - Platform name ('claude', 'chatgpt', 'gemini', etc.) to apply platform-specific rules
     * @returns {String} - Markdown text
     */
    htmlToMarkdown: function(element, options = {}) {
      // Early return for null or empty elements
      if (!element || !element.childNodes) return '';
      
      // Create a Turndown service instance
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        emDelimiter: '*',
        strongDelimiter: '**'
      });
      
      // Add rule for strikethrough (before platform-specific rules)
      turndownService.addRule('strikethrough', {
        filter: ['del', 's', 'strike'], // Handle <del>, <s>, and <strike>
        replacement: function (content) {
          // Ensure content isn't just whitespace before adding delimiters
          const trimmedContent = content.trim();
          if (!trimmedContent) return ''; // Return empty if content is blank after trim
          // Return content wrapped in ~~, preserving original whitespace if content wasn't just whitespace
          return '~~' + content + '~~';
        }
      });
      
      // Add rule for blockquotes
      turndownService.addRule('blockquote', {
        filter: ['blockquote'],
        replacement: function (content) {
          const trimmedContent = content.trim();
          if (!trimmedContent) return '';
          
          // Split content by newlines and ensure each line has '>' prefix
          const lines = trimmedContent.split('\n');
          // Make sure each line starts with '> '
          const prefixedLines = lines.map(line => line.startsWith('> ') ? line : '> ' + line);
          
          return prefixedLines.join('\n');
        }
      });
      
      // Add platform-specific table rules
      this.addPlatformTableRules(turndownService, options.platformName || 'default');
      
      // Add platform-specific heading rules
      this.addPlatformHeadingRules(turndownService, options.platformName || 'default');
      
      // Add platform-specific code block rules
      this.addPlatformCodeBlockRules(turndownService, options.platformName || 'default');
      
      // Add platform-specific blockquote rules
      this.addPlatformBlockquoteRules(turndownService, options.platformName || 'default');
      
      // Configure tags to ignore (if any)
      const tagsToIgnore = [];
      
      // Add any additional tags from options
      if (options.ignoreTags && Array.isArray(options.ignoreTags)) {
        options.ignoreTags.forEach(tag => {
          if (!tagsToIgnore.includes(tag)) {
            tagsToIgnore.push(tag);
          }
        });
      }
      
      // Remove all tags that should be ignored
      tagsToIgnore.forEach(tag => {
        turndownService.remove(tag);
      });
      
      // Handle skip element check if provided
      if (typeof options.skipElementCheck === 'function') {
        // Clone the element to avoid modifying the original
        const clonedElement = element.cloneNode(true);
        
        // Find and remove elements that should be skipped
        const elementsToRemove = [];
        const processNode = (node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (options.skipElementCheck(node)) {
              elementsToRemove.push(node);
            } else {
              Array.from(node.childNodes).forEach(processNode);
            }
          }
        };
        
        Array.from(clonedElement.childNodes).forEach(processNode);
        elementsToRemove.forEach(node => {
          if (node.parentNode) {
            node.parentNode.removeChild(node);
          }
        });
        
        // Return the markdown conversion of the modified clone
        return turndownService.turndown(clonedElement);
      }
      
      // Standard conversion if no skip function
      return turndownService.turndown(element);
    },

    /**
     * Adds platform-specific table rules to the Turndown service
     * @param {TurndownService} turndownService - The Turndown service instance
     * @param {String} platformName - The platform name ('claude', 'chatgpt', 'gemini', etc.)
     */
    addPlatformTableRules: function(turndownService, platformName) {
      // Default table rule - works for most platforms
      const defaultTableRule = {
        filter: ['table'],
        replacement: function(content, node) {
          // Process table to markdown
          const rows = Array.from(node.querySelectorAll('tr'));
          if (!rows.length) return '';
          
          const markdownRows = [];
          
          // Process header row
          const headerRow = rows[0];
          const headerCells = Array.from(headerRow.querySelectorAll('th'));
          
          // If we have header cells
          if (headerCells.length > 0) {
            const headerContent = headerCells.map(th => 
              turndownService.turndown(th).trim().replace(/\|/g, '\\|')
            );
            markdownRows.push(`| ${headerContent.join(' | ')} |`);
            markdownRows.push(`|${'---|'.repeat(headerCells.length)}`);
          }
          // If no TH cells, use the first row as header
          else {
            const firstRowCells = Array.from(headerRow.querySelectorAll('td'));
            if (firstRowCells.length > 0) {
              const firstRowContent = firstRowCells.map(td => 
                turndownService.turndown(td).trim().replace(/\|/g, '\\|')
              );
              markdownRows.push(`| ${firstRowContent.join(' | ')} |`);
              markdownRows.push(`|${'---|'.repeat(firstRowCells.length)}`);
            }
          }
          
          // Process body rows, skipping the header if we used it
          const startIdx = (headerCells.length === 0 && rows.length > 1) ? 1 : 0;
          
          for (let i = startIdx; i < rows.length; i++) {
            // Skip the first row if it was used as header
            if (i === 0 && headerCells.length > 0) continue;
            
            const row = rows[i];
            const cells = Array.from(row.querySelectorAll('td'));
            
            if (cells.length > 0) {
              const cellContent = cells.map(td => 
                turndownService.turndown(td).trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')
              );
              markdownRows.push(`| ${cellContent.join(' | ')} |`);
            }
          }
          
          return markdownRows.length > 0 ? '\n\n' + markdownRows.join('\n') + '\n\n' : '';
        }
      };

      // Claude-specific table rule - handles Claude's unique table structure
      const claudeTableRule = {
        filter: ['table'],
        replacement: function(content, node) {
          // Process table to markdown
          const rows = Array.from(node.querySelectorAll('tr'));
          if (!rows.length) return '';
          
          const markdownRows = [];
          
          // Process header row
          const thead = node.querySelector('thead');
          let headerCells = [];
          let startDataRowIdx = 0;
          
          if (thead) {
            const headerRow = thead.querySelector('tr');
            if (headerRow) {
              headerCells = Array.from(headerRow.querySelectorAll('th'));
              if (headerCells.length > 0) {
                const headerContent = headerCells.map(th => 
                  turndownService.turndown(th).trim().replace(/\|/g, '\\|')
                );
                markdownRows.push(`| ${headerContent.join(' | ')} |`);
                markdownRows.push(`|${'---|'.repeat(headerCells.length)}`);
              }
            }
          } else {
            // No thead, use first row as header
            if (rows.length > 0) {
              const firstRow = rows[0];
              headerCells = Array.from(firstRow.querySelectorAll('th'));
              
              // If first row has th cells, use them as header
              if (headerCells.length > 0) {
                const headerContent = headerCells.map(th => 
                  turndownService.turndown(th).trim().replace(/\|/g, '\\|')
                );
                markdownRows.push(`| ${headerContent.join(' | ')} |`);
                markdownRows.push(`|${'---|'.repeat(headerCells.length)}`);
                startDataRowIdx = 1; // Skip first row for data
              } else {
                // Use td cells from first row as header
                const tdCells = Array.from(firstRow.querySelectorAll('td'));
                if (tdCells.length > 0) {
                  const headerContent = tdCells.map(td => 
                    turndownService.turndown(td).trim().replace(/\|/g, '\\|')
                  );
                  markdownRows.push(`| ${headerContent.join(' | ')} |`);
                  markdownRows.push(`|${'---|'.repeat(tdCells.length)}`);
                  startDataRowIdx = 1; // Skip first row for data
                  headerCells = tdCells; // Use these as reference for column count
                }
              }
            }
          }
          
          const columnCount = headerCells.length;
          
          // Process body rows
          const tbody = node.querySelector('tbody');
          if (tbody) {
            const bodyRows = Array.from(tbody.querySelectorAll('tr'));
            for (let i = startDataRowIdx; i < bodyRows.length; i++) {
              const row = bodyRows[i];
              const cells = Array.from(row.querySelectorAll('td'));
              
              // Only process rows with correct number of cells
              if (cells.length === columnCount || columnCount === 0) {
                const cellContent = cells.map(td => 
                  turndownService.turndown(td).trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ').replace(/&lt;br&gt;/g, ' ')
                );
                markdownRows.push(`| ${cellContent.join(' | ')} |`);
              }
            }
          }
          
          return markdownRows.length > 0 ? '\n\n' + markdownRows.join('\n') + '\n\n' : '';
        }
      };
      
      // ChatGPT-specific table rule
      const chatgptTableRule = {
        filter: ['table'],
        replacement: function(content, node) {
          // Similar to default rule but with ChatGPT-specific adjustments if needed
          // For now, we'll use the default implementation
          return defaultTableRule.replacement(content, node);
        }
      };
      
      // Gemini-specific table rule
      const geminiTableRule = {
        filter: ['table'],
        replacement: function(content, node) {
          // Similar to default rule but with Gemini-specific adjustments if needed
          // For now, we'll use the default implementation
          return defaultTableRule.replacement(content, node);
        }
      };
      
      // Add the appropriate rule based on platform
      switch (platformName.toLowerCase()) {
        case 'claude':
          turndownService.addRule('tableRule', claudeTableRule);
          break;
        case 'chatgpt':
          turndownService.addRule('tableRule', chatgptTableRule);
          break;
        case 'gemini': 
          turndownService.addRule('tableRule', geminiTableRule);
          break;
        default:
          turndownService.addRule('tableRule', defaultTableRule);
      }
    },

    /**
     * Adds platform-specific heading rules to the Turndown service
     * @param {TurndownService} turndownService - The Turndown service instance
     * @param {String} platformName - The platform name ('claude', 'chatgpt', 'gemini', etc.)
     */
    addPlatformHeadingRules: function(turndownService, platformName) {
      // Claude-specific heading rule - handles all heading levels h1-h6
      const claudeHeadingRule = {
        filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        replacement: function(content, node) {
          // Get heading level from tag name (h1 -> 1, h2 -> 2, etc.)
          const level = parseInt(node.tagName.substring(1));
          // Create the appropriate markdown heading with the right number of # characters
          const headingLevel = '#'.repeat(level) + ' ';
          const headingText = content.trim();
          
          return headingLevel + headingText;
        }
      };
      
      // Enhanced Claude-specific heading handler function that can be called directly
      // This function handles both successful turndown conversions and fallbacks
      this.claudeHeadingHandler = function(element, options = {}) {
        const tagNameLower = element.tagName.toLowerCase();
        if (!tagNameLower.match(/^h[1-6]$/)) return null;
        
        // Try using Turndown first
        let markdownText = this.htmlToMarkdown(element, {
          ...(options || {}),
          platformName: 'claude'
        }).trim();
        
        // If Turndown fails, create markdown manually
        if (!markdownText || !markdownText.startsWith('#')) {
          const level = parseInt(tagNameLower.substring(1));
          const headingText = element.textContent.trim();
          markdownText = '#'.repeat(level) + ' ' + headingText;
        }
        
        return markdownText;
      };
      
      // Add the appropriate rule based on platform
      switch (platformName.toLowerCase()) {
        case 'claude':
          turndownService.addRule('headingRule', claudeHeadingRule);
          break;
        // Add other platform-specific heading rules as needed
        default:
          // Default heading rule is already part of Turndown's core rules
          break;
      }
    },

    /**
     * Adds platform-specific code block rules to the Turndown service
     * @param {TurndownService} turndownService - The Turndown service instance
     * @param {String} platformName - The platform name ('claude', 'chatgpt', 'gemini', etc.)
     */
    addPlatformCodeBlockRules: function(turndownService, platformName) {
      // Claude-specific code block rule
      const claudeCodeBlockRule = {
        filter: ['pre'],
        replacement: function(content, node) {
          // --- Enhanced logic to handle nested structures ---
          let codeElement = null;
          let code = '';
          let language = 'text'; // Default language

          // Check for various nested code structures common in Claude
          const nestedPreCode1 = node.querySelector('div > div > pre > code');
          const nestedPreCode2 = node.querySelector('div > pre > code');
          const directCode = node.querySelector('code');
          const complexNestedCode = node.querySelector('.code-block__code > code'); // Handles the structure inside the LI

          if (complexNestedCode) {
              codeElement = complexNestedCode;
              code = codeElement.textContent.trim();
          } else if (nestedPreCode1) {
              codeElement = nestedPreCode1;
              code = codeElement.textContent.trim();
          } else if (nestedPreCode2) {
              codeElement = nestedPreCode2;
              code = codeElement.textContent.trim();
          } else if (directCode) {
              codeElement = directCode;
              code = codeElement.textContent.trim();
          } else {
              // Fallback: Treat as plain text if no recognizable code structure
              code = node.textContent.trim(); // Use the raw text content of the <pre>
          }

          // If no code content found (even as fallback), return empty string or original content
          if (!code) {
              // console.warn("[Turndown Rule] Empty <pre> block found:", node);
              return ''; // Or maybe return '\n\n' + content + '\n\n' if needed? Empty seems safer.
          }

          // --- Language Detection ---
          // Try language indicator first (covers cases where codeElement might be missing)
          const langIndicator = node.querySelector('div.text-text-300.absolute, div.text-text-500.absolute');
          if (langIndicator) {
              const indicatorText = langIndicator.textContent?.trim();
              if (indicatorText && indicatorText.toLowerCase() !== "") {
                  language = indicatorText.toLowerCase();
              }
          }

          // If no indicator found, check code element class (if codeElement exists)
          if (language === 'text' && codeElement) {
              const langClass = Array.from(codeElement.classList || []).find(cls => cls.startsWith('language-'));
              if (langClass) {
                  language = langClass.replace('language-', '');
              }
          }
          // --- End Language Detection ---

          // Return formatted code block
          // Add extra newlines for separation, consistent with Turndown's default block behavior
          return '\n\n```' + language + '\n' + code + '\n```\n\n';
        }
      };
      
      // Add the appropriate rule based on platform
      switch (platformName.toLowerCase()) {
        case 'claude':
          turndownService.addRule('codeBlockRule', claudeCodeBlockRule);
          break;
        // Add other platform-specific code block rules as needed  
        default:
          // Default code block rule is already part of Turndown's core rules
          break;
      }
    },
    
    /**
     * Adds platform-specific blockquote rules to the Turndown service
     * @param {TurndownService} turndownService - The Turndown service instance
     * @param {String} platformName - The platform name ('claude', 'chatgpt', 'gemini', etc.)
     */
    addPlatformBlockquoteRules: function(turndownService, platformName) {
      // Claude-specific blockquote rule
      const claudeBlockquoteRule = {
        filter: ['blockquote', 'div.quote', 'div.blockquote'],
        replacement: function(content, node) {
          const trimmedContent = content.trim();
          if (!trimmedContent) return '';
          
          // Process content line by line to ensure proper blockquote formatting
          const lines = trimmedContent.split('\n');
          const prefixedLines = lines.map(line => {
            // Skip adding '> ' if the line already starts with it
            return line.startsWith('> ') ? line : '> ' + line;
          });
          
          // Ensure proper spacing before and after blockquote
          return '\n\n' + prefixedLines.join('\n') + '\n\n';
        }
      };
      
      // Add the appropriate rule based on platform
      switch (platformName.toLowerCase()) {
        case 'claude':
          turndownService.addRule('blockquoteRule', claudeBlockquoteRule);
          break;
        // Add other platform-specific blockquote rules as needed
        default:
          // Default blockquote rule is already part of Turndown's core rules
          break;
      }
    },

    /**
     * Direct handler for Claude code blocks, can be called from extractAssistantContent
     * @param {HTMLElement} element - The <pre> element to process
     * @param {Object} options - Optional configuration options
     * @returns {Object|null} - A code_block content item or null
     */
    claudeCodeBlockHandler: function(element, options = {}) {
      const tagNameLower = element.tagName.toLowerCase();
      if (tagNameLower !== 'pre') return null;
      
      let codeElement = null;
      let code = '';
      let language = 'text'; // Default language
      
      // Case 1: Element itself is a code-block__code
      if (element.classList.contains('code-block__code')) {
        codeElement = element.querySelector('code');
        if (codeElement) {
          code = codeElement.textContent.trim();
        }
      }
      // Case 2: Element contains a nested structure with code-block__code
      else if (element.querySelector('.code-block__code')) {
        const nestedCodeBlock = element.querySelector('.code-block__code');
        codeElement = nestedCodeBlock.querySelector('code');
        if (codeElement) {
          code = codeElement.textContent.trim();
        }
      }
      // Case 3: Element is a simple pre with code
      else {
        codeElement = element.querySelector('code');
        if (codeElement) {
          code = codeElement.textContent.trim();
        }
      }
      
      // Case 4: Element has deeply nested pre > div > div > pre > code structure
      if (!code) {
        const nestedPreCode = element.querySelector('div > div > pre > code');
        if (nestedPreCode) {
          code = nestedPreCode.textContent.trim();
          codeElement = nestedPreCode;
        }
      }
      
      // Case 5: Element has pre > div > pre > code structure
      if (!code) {
        const nestedPreCode = element.querySelector('div > pre > code');
        if (nestedPreCode) {
          code = nestedPreCode.textContent.trim();
          codeElement = nestedPreCode;
        }
      }
      
      // Case 6: Element is a user message pre with or without code (simpler structure)
      if (!code && options.isUserMessage) {
        if (element.textContent) {
          code = element.textContent.trim();
        }
      }
      
      // Last resort: just use the element's own text content
      if (!code) {
        code = element.textContent.trim();
      }
      
      if (!code) return null; // Skip empty code blocks
      
      // Language detection
      if (codeElement) {
        // Check for language- classes
        const langClass = Array.from(codeElement.classList || []).find(cls => cls.startsWith('language-'));
        if (langClass) {
          language = langClass.replace('language-', '');
        }
      }
      
      // Look for language indicator element (Claude specific)
      const langIndicator = element.querySelector('div.text-text-300.absolute, div.text-text-500.absolute');
      if (langIndicator) {
        const indicatorText = langIndicator.textContent?.trim();
        if (indicatorText && indicatorText.toLowerCase() !== "") {
          language = indicatorText.toLowerCase();
        }
      }
      
      // Return code block object
      return {
        type: 'code_block',
        language: language,
        content: code
      };
    },

    /**
     * Adds a text item to the items array, merging consecutive text items with paragraph separator
     * @param {Array} items - Array of content items to append to
     * @param {String} text - Text content to add
     */
    addTextItem: function(items, text) {
      const trimmedText = text?.trim();
      if (!trimmedText) return;
      const lastItem = items.at(-1);
      if (lastItem?.type === 'text') {
          // Append with paragraph separation if adding to existing text
          lastItem.content += `\n\n${trimmedText}`;
      } else {
          items.push({ type: 'text', content: trimmedText });
      }
    },

    /**
     * Parses an HTML string into DOM elements
     * @param {String} htmlString - HTML string to parse
     * @returns {HTMLElement} - Parsed DOM element
     */
    parseHTML: function(htmlString) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      return doc.body;
    }
  };

  // Set up the QAClipper namespace in the appropriate context
  if (typeof window !== 'undefined') {
    // For content scripts (browser context)
    if (!window.QAClipper) {
      window.QAClipper = {};
    }
    window.QAClipper.Utils = Utils;
  } else if (typeof self !== 'undefined') {
    // For ServiceWorker context (background.js)
    if (!self.QAClipper) {
      self.QAClipper = {};
    }
    self.QAClipper.Utils = Utils;
  } else if (typeof module !== 'undefined' && module.exports) {
    // For CommonJS (if needed)
    module.exports = { Utils: Utils };
  }
})(); 