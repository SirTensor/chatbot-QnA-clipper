// --- START OF FILE formatter.js ---

/**
 * Formatter module for Chatbot Q&A Clipper extension
 * Responsible for converting raw data from extractors into formatted markdown
 */

const formatter = {
  /**
   * Formats raw data array into markdown text according to user settings
   * @param {Array} rawDataArray - Array of objects with type, content, and optional images
   * @param {Object} settings - User format settings
   * @returns {String} - Formatted markdown text
   */
  formatData: function(rawDataArray, settings = {}) {
    // Default settings if not provided
    const headerLevel = settings.headerLevel || '2';
    const labelStyle = settings.labelStyle || 'qa';
    const numberFormat = settings.numberFormat || 'space';
    const imageFormat = settings.imageFormat || 'bracketed';
    const imageLabel = settings.imageLabel || 'Image URL';

    // Get header prefix based on header level
    const headerPrefix = '#'.repeat(parseInt(headerLevel));

    let formattedText = '';
    let pairIndex = 0; // Start at 0, will increment to 1 for the first pair
    let hasUserMessageInCurrentPair = false;

    // Process each item in the raw data array
    for (let i = 0; i < rawDataArray.length; i++) {
      const item = rawDataArray[i];

      if (item.type === 'user') {
        // Only increment pairIndex if this is a new pair (after an assistant message or at the start)
        if (!hasUserMessageInCurrentPair) {
          pairIndex++; // Increment pair index for the first user message in a new pair
        }

        hasUserMessageInCurrentPair = true;

        // Format the question/prompt
        const questionLabel = this.getLabelByStyle(labelStyle, 'question');
        const numberStr = this.getNumberFormat(numberFormat, pairIndex);

        formattedText += `${headerPrefix} ${questionLabel}${numberStr}\n\n`;
        if (item.content && item.content.trim()) {
            formattedText += `${item.content.trim()}\n\n`;
        }

        // Add image URLs if any (for user)
        if (item.images && item.images.length > 0) {
          item.images.forEach(url => {
            formattedText += this.formatImageUrl(url, imageFormat, imageLabel);
          });
          formattedText += '\n'; // Add extra newline after image block
        }
      }
      else if (item.type === 'assistant') {
        // Format the answer/response
        const answerLabel = this.getLabelByStyle(labelStyle, 'answer');
        const numberStr = this.getNumberFormat(numberFormat, pairIndex);

        formattedText += `${headerPrefix} ${answerLabel}${numberStr}\n\n`;
         if (item.content && item.content.trim()) {
            formattedText += `${item.content.trim()}\n\n`;
        }

        // Add image URLs if any (for assistant) <-- *** ADDED THIS BLOCK ***
        if (item.images && item.images.length > 0) {
          item.images.forEach(url => {
            formattedText += this.formatImageUrl(url, imageFormat, imageLabel);
          });
          formattedText += '\n'; // Add extra newline after image block
        }

        // Reset the user message flag after processing an assistant message
        hasUserMessageInCurrentPair = false;
      }
    }

    return formattedText.trim();
  },

  /**
   * Gets the appropriate label based on label style
   * @param {String} labelStyle - Label style from settings
   * @param {String} type - 'question' or 'answer'
   * @returns {String} - The appropriate label
   */
  getLabelByStyle: function(labelStyle, type) {
    const labels = {
      'qa': { question: 'Question', answer: 'Answer' },
      'prompt': { question: 'Prompt', answer: 'Response' },
      'short': { question: 'Q', answer: 'A' },
      'korean': { question: '질문', answer: '답변' },
      'chinese': { question: '问题', answer: '回答' },
      'japanese': { question: '質問', answer: '回答' },
      'vietnamese': { question: 'Câu hỏi', answer: 'Trả lời' },
      'indonesian': { question: 'Pertanyaan', answer: 'Jawaban' },
      'hindi': { question: 'प्रश्न', answer: 'उत्तर' },
      'spanish': { question: 'Pregunta', answer: 'Respuesta' },
      'portuguese': { question: 'Pergunta', answer: 'Resposta' },
      'french': { question: 'Question', answer: 'Réponse' },
      'german': { question: 'Frage', answer: 'Antwort' },
      'italian': { question: 'Domanda', answer: 'Risposta' },
      'russian': { question: 'Вопрос', answer: 'Ответ' },
      'arabic': { question: 'سؤال', answer: 'جواب' },
      'swahili': { question: 'Swali', answer: 'Jibu' }
    };

    const defaultLabels = { question: 'Question', answer: 'Answer' };
    return (labels[labelStyle] || defaultLabels)[type];
  },

  /**
   * Formats the number based on number format setting
   * @param {String} numberFormat - Number format from settings
   * @param {Number} index - The index number
   * @returns {String} - Formatted number string
   */
  getNumberFormat: function(numberFormat, index) {
    switch (numberFormat) {
      case 'noSpace': return `${index}`;
      case 'space': return ` ${index}`;
      case 'dashNoSpace': return `-${index}`;
      case 'dash': return `- ${index}`;
      case 'spaceDashNoSpace': return ` -${index}`;
      case 'spaceDash': return ` - ${index}`;
      case 'colonNoSpace': return `:${index}`;
      case 'colon': return `: ${index}`;
      case 'spaceColonNoSpace': return ` :${index}`;
      case 'spaceColon': return ` : ${index}`;
      default: return ` ${index}`;
    }
  },

  /**
   * Formats an image URL according to user preference
   * @param {String} url - The image URL
   * @param {String} imageFormat - Image format from settings
   * @param {String} imageLabel - Image label from settings
   * @returns {String} - Formatted image URL string
   */
  formatImageUrl: function(url, imageFormat, imageLabel) {
    switch (imageFormat) {
      case 'markdown': return `[${imageLabel}](${url})\n`;
      case 'plain': return `${url}\n`;
      case 'bracketed':
      default: return `[${imageLabel}]: ${url}\n`;
    }
  }
};

// Export the formatter for background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = formatter;
} else {
  // For non-module context (Chrome extension)
  self.formatter = formatter;
}
// --- END OF FILE formatter.js ---