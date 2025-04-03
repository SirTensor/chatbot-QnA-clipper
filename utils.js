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
     * @returns {String} - Markdown text
     */
    htmlToMarkdown: function(element) {
      let markdown = '';

      element.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text) markdown += text;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = node.tagName.toLowerCase();
          const text = node.textContent.trim();

          if (tag === 'strong' || tag === 'b') {
            markdown += `**${text}**`;
          } else if (tag === 'em' || tag === 'i') {
            markdown += `*${text}*`;
          } else if (tag === 'p') {
            markdown += `${this.htmlToMarkdown(node)}\n\n`;
          } else if (tag === 'ul' || tag === 'ol') {
            node.querySelectorAll('li').forEach(li => {
              markdown += `- ${this.htmlToMarkdown(li)}\n`;
            });
          } else if (tag === 'code') {
            markdown += `\`${text}\``;
          } else if (tag === 'pre') {
            markdown += `\`\`\`\n${text}\n\`\`\`\n`;
          } else if (tag === 'table') {
            markdown += this.tableToMarkdown(node) + '\n\n';
          } else if (tag === 'hr') {
            markdown += `---\n\n`;
          } else if (tag === 'h1') {
            markdown += `# ${text}\n\n`;
          } else if (tag === 'h2') {
            markdown += `## ${text}\n\n`;
          } else if (tag === 'h3') {
            markdown += `### ${text}\n\n`;
          } else if (tag === 'h4') {
            markdown += `#### ${text}\n\n`;
          } else if (tag === 'h5') {
            markdown += `##### ${text}\n\n`;
          } else if (tag === 'h6') {
            markdown += `###### ${text}\n\n`;
          } else if (tag === 'a') {
            const href = node.getAttribute('href');
            if (href) {
              markdown += `[${text}](${href})`;
            } else {
              markdown += text;
            }
          } else {
            markdown += this.htmlToMarkdown(node);
          }
        }
      });

      return markdown.trim();
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