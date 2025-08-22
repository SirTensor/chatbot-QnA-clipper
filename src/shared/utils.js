/**
 * Utility functions for the Chatbot Q&A Clipper extension
 * Using module pattern to avoid global namespace pollution
 */

// Create a self-contained module using IIFE
(function() {
  // Create the utilities object with all functions
  const Utils = {
    /**
     * Converts HTML to Markdown
     * @param {HTMLElement} element - HTML element to convert
     * @param {Object} options - Optional configuration options
     * @param {Function} options.skipElementCheck - Optional callback function that takes an element and returns 
     *                                              true if it should be skipped, false otherwise
     * @returns {String} - Markdown text
     */
    htmlToMarkdown: function(element, options = {}) {
      // Early return for null or empty elements
      if (!element || !element.childNodes) return '';
      
      // Check if this element should be skipped based on the provided callback
      if (element.nodeType === Node.ELEMENT_NODE && typeof options.skipElementCheck === 'function') {
        if (options.skipElementCheck(element)) {
          return '';
        }
      }
      
      let markdown = '';

      element.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          let text = node.textContent;
          // 1. Convert non-breaking spaces (U+00A0) to regular spaces
          text = text.replace(/\u00A0/g, ' ');
          // 2. Collapse only explicit newlines and tabs to a single space
          text = text.replace(/[\n\t]+/g, ' ');
          // DO NOT collapse multiple spaces here to preserve intentional spacing from &nbsp;
          // Append if text remains (it might be only spaces)
          if (text) markdown += text;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = node.tagName.toLowerCase();

          // Check if this child element should be skipped
          if (typeof options.skipElementCheck === 'function' && options.skipElementCheck(node)) {
            return; // Skip this node entirely
          }

          // Process content recursively with same options
          const content = this.htmlToMarkdown(node, options);

          if (tag === 'strong' || tag === 'b') {
            markdown += `**${content}**`;
          } else if (tag === 'em' || tag === 'i') {
            markdown += `*${content}*`;
          } else if (tag === 'p') {
            markdown += `${content}\n\n`;
          } else if (tag === 'ul' || tag === 'ol') {
            node.querySelectorAll('li').forEach(li => {
              const marker = tag === 'ul' ? '-' : '1.';
              markdown += `${marker} ${this.htmlToMarkdown(li, options)}\n`;
            });
          } else if (tag === 'code') {
            // Handle code blocks specially - don't add backticks if already in a code-block
            if (!node.closest('code-block')) {
              markdown += `\`${content}\``;
            } else {
              markdown += content; // Pass content through if already in code-block
            }
          } else if (tag === 'pre') {
            markdown += `\`\`\`\n${content}\n\`\`\`\n`;
          } else if (tag === 'table') {
            markdown += this.tableToMarkdown(node) + '\n\n';
          } else if (tag === 'hr') {
            markdown += `---\n\n`;
          } else if (tag === 'h1') {
            markdown += `# ${content}\n\n`;
          } else if (tag === 'h2') {
            markdown += `## ${content}\n\n`;
          } else if (tag === 'h3') {
            markdown += `### ${content}\n\n`;
          } else if (tag === 'h4') {
            markdown += `#### ${content}\n\n`;
          } else if (tag === 'h5') {
            markdown += `##### ${content}\n\n`;
          } else if (tag === 'h6') {
            markdown += `###### ${content}\n\n`;
          } else if (tag === 'a') {
            const href = node.getAttribute('href');
            if (href) {
              markdown += `[${content}](${href})`;
            } else {
              markdown += content;
            }
          } else if (tag === 'br') {
            markdown += '\n';
          } else if (tag === 'span' && (node.classList.contains('math-inline') || node.classList.contains('katex'))) {
            // Handle KaTeX inline math - covers both direct katex and math-inline containers
            let latex = null;
            
            // Try to find LaTeX source in nested structure first
            const mathML = node.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
            if (mathML) {
              latex = mathML.textContent.trim();
            }
            
            // If no LaTeX source found, try alternative extraction methods for Gemini
            if (!latex) {
              // Look for nested katex elements
              const katexElement = node.querySelector('.katex');
              if (katexElement) {
                const nestedMathML = katexElement.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
                if (nestedMathML) {
                  latex = nestedMathML.textContent.trim();
                }
              }
            }
            
            if (latex) {
              markdown += `$${latex}$`;
            } else {
              // Fallback: For Gemini, try to reconstruct LaTeX from text content
              const katexHtml = node.querySelector('.katex-html');
              if (katexHtml) {
                const mathText = katexHtml.textContent.trim();
                if (mathText) {
                  // Simple LaTeX reconstruction for common patterns
                  let reconstructedLatex = mathText;
                  // Convert superscripts (like x²) to LaTeX format (x^2)
                  reconstructedLatex = reconstructedLatex.replace(/([a-zA-Z])([²³⁴⁵⁶⁷⁸⁹¹⁰])/g, (match, base, sup) => {
                    const supMap = {'²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '¹': '1', '⁰': '0'};
                    return `${base}^{${supMap[sup] || sup}}`;
                  });
                  // Convert fractions (simple case)
                  reconstructedLatex = reconstructedLatex.replace(/(\w+)\/(\w+)/g, '\\frac{$1}{$2}');
                  // Convert square roots
                  reconstructedLatex = reconstructedLatex.replace(/√\(([^)]+)\)/g, '\\sqrt{$1}');
                  reconstructedLatex = reconstructedLatex.replace(/√([a-zA-Z0-9]+)/g, '\\sqrt{$1}');
                  // Convert Greek letters if present
                  reconstructedLatex = reconstructedLatex.replace(/α/g, '\\alpha').replace(/β/g, '\\beta').replace(/γ/g, '\\gamma');
                  // Convert ± symbol
                  reconstructedLatex = reconstructedLatex.replace(/±/g, '\\pm');
                  // Convert ≠ symbol  
                  reconstructedLatex = reconstructedLatex.replace(/≠/g, '\\neq');
                  
                  markdown += `$${reconstructedLatex}$`;
                } else {
                  markdown += content;
                }
              } else {
                markdown += content;
              }
            }
          } else if (tag === 'span' && (node.classList.contains('math-display') || node.classList.contains('katex-display'))) {
            // Handle KaTeX display math - covers both direct katex-display and math-display containers
            let latex = null;
            
            // Try to find LaTeX source in nested structure first
            const mathML = node.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
            if (mathML) {
              latex = mathML.textContent.trim();
            }
            
            // If no LaTeX source found, try alternative extraction methods
            if (!latex) {
              const katexElement = node.querySelector('.katex');
              if (katexElement) {
                const nestedMathML = katexElement.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
                if (nestedMathML) {
                  latex = nestedMathML.textContent.trim();
                }
              }
            }
            
            if (latex) {
              markdown += `$$${latex}$$`;
            } else {
              // Fallback: For Gemini, try to reconstruct LaTeX from text content  
              const katexHtml = node.querySelector('.katex-html');
              if (katexHtml) {
                const mathText = katexHtml.textContent.trim();
                if (mathText) {
                  // Simple LaTeX reconstruction for common patterns
                  let reconstructedLatex = mathText;
                  // Convert superscripts (like x²) to LaTeX format (x^2)
                  reconstructedLatex = reconstructedLatex.replace(/([a-zA-Z])([²³⁴⁵⁶⁷⁸⁹¹⁰])/g, (match, base, sup) => {
                    const supMap = {'²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '¹': '1', '⁰': '0'};
                    return `${base}^{${supMap[sup] || sup}}`;
                  });
                  // Convert fractions (simple case)
                  reconstructedLatex = reconstructedLatex.replace(/(\w+)\/(\w+)/g, '\\frac{$1}{$2}');
                  // Convert square roots
                  reconstructedLatex = reconstructedLatex.replace(/√\(([^)]+)\)/g, '\\sqrt{$1}');
                  reconstructedLatex = reconstructedLatex.replace(/√([a-zA-Z0-9]+)/g, '\\sqrt{$1}');
                  // Convert Greek letters if present
                  reconstructedLatex = reconstructedLatex.replace(/α/g, '\\alpha').replace(/β/g, '\\beta').replace(/γ/g, '\\gamma');
                  // Convert ± symbol
                  reconstructedLatex = reconstructedLatex.replace(/±/g, '\\pm');
                  // Convert ≠ symbol  
                  reconstructedLatex = reconstructedLatex.replace(/≠/g, '\\neq');
                  
                  markdown += `$$${reconstructedLatex}$$`;
                } else {
                  markdown += content;
                }
              } else {
                markdown += content;
              }
            }
          } else {
            markdown += content;
          }
        }
      });

      return markdown;
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
     * Converts a table element to Markdown format
     * @param {HTMLTableElement} table - Table element to convert
     * @returns {String} - Markdown table
     */
    tableToMarkdown: function(table) {
      let markdown = '';
      const rows = table.querySelectorAll('tr');

      if (rows.length === 0) return markdown;

      const headers = rows[0].querySelectorAll('th, td');
      if (headers.length > 0) {
        markdown += '| ' + Array.from(headers).map(h => h.textContent.trim()).join(' | ') + ' |\n';
        markdown += '| ' + Array(headers.length).fill('---').join(' | ') + ' |\n';
      }

      rows.forEach((row, index) => {
        if (index === 0 && row.querySelector('th')) return;
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
          markdown += '| ' + Array.from(cells).map(c => c.textContent.trim()).join(' | ') + ' |\n';
        }
      });

      return markdown.trim();
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