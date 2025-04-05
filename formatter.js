// --- START OF FILE formatter.js ---

/**
 * Formatter module for Chatbot Q&A Clipper extension
 * Responsible for converting structured conversation data into formatted markdown/plain text
 */

const formatter = {
  /**
   * Formats the structured conversation data into markdown text according to user settings
   * @param {object} extractedData - The object returned by extractor.js { platform, conversationTurns: [...] }
   * @param {object} settings - User format settings
   * @returns {string} - Formatted markdown text
   */
  formatData: function(extractedData, settings = {}) {
    console.log("[Formatter] Starting formatData with settings:", settings);
    const headerLevel = settings.headerLevel || '1';
    const labelStyle = settings.labelStyle || 'qa';
    const numberFormat = settings.numberFormat || 'space';
    const imageFormat = settings.imageFormat || 'bracketed';
    const imageLabel = settings.imageLabel || '';  // Allow empty string intentionally
    const includePlatform = settings.includePlatform || false;

    const headerPrefix = '#'.repeat(parseInt(headerLevel));
    let formattedText = '';

    if (includePlatform && extractedData.platform) {
      formattedText += `# ${extractedData.platform}\n`;
    }

    let pairIndex = 0;

    extractedData.conversationTurns.forEach((turn, turnIdx) => {
        console.log(`[Formatter] Processing Turn #${turnIdx}, Role: ${turn.role}`);
        if (turn.role === 'user') {
            pairIndex++;
            const qLabel = this.getLabelByStyle(labelStyle, 'question');
            const numStr = this.getNumberFormat(numberFormat, pairIndex);
            formattedText += `${headerPrefix} ${qLabel}${numStr}\n\n`;
            if (turn.textContent?.trim()) formattedText += `${turn.textContent.trim()}\n\n`;
            if (turn.userAttachments?.length > 0) {
                 let attachTxt = '';
                 turn.userAttachments.forEach(a => attachTxt += this.formatUserAttachment(a, imageFormat, imageLabel));
                 formattedText += attachTxt + '\n';
            }
        } else if (turn.role === 'assistant') {
            const aLabel = this.getLabelByStyle(labelStyle, 'answer');
            const numStr = this.getNumberFormat(numberFormat, pairIndex);
            formattedText += `${headerPrefix} ${aLabel}${numStr}\n\n`;

            if (turn.contentItems?.length > 0) {
                turn.contentItems.forEach((item, itemIdx) => {
                    console.log(`  [Formatter] Formatting Assistant Item #${itemIdx} (Type: ${item.type})`);
                    const itemTextResult = this.formatContentItem(item, imageFormat, imageLabel);
                    // console.log(`    [Formatter] Item #${itemIdx} Result:\n${itemTextResult}`);
                    formattedText += itemTextResult;
                });
            } else {
                formattedText += '> (No assistant content extracted)\n\n';
            }
            // Ensure trailing newline after assistant turn
             if (!formattedText.endsWith('\n\n')) {
                 formattedText += formattedText.endsWith('\n') ? '\n' : '\n\n';
             }
        } else { // Unknown role
             formattedText += `> [Unknown Role - Turn ${turn.turnIndex || turnIdx}]\n\n`;
             if (turn.textContent?.trim()) formattedText += `${turn.textContent.trim()}\n\n`;
        }
    });

    // console.log("[Formatter] Final formatted text length:", formattedText.length);
    return formattedText.trimEnd(); // Trim only trailing whitespace
  },

  /**
   * Formats a single ContentItem. Ensures correct Markdown syntax and spacing.
   */
  formatContentItem: function(item, imageFormat, defaultImageLabel) {
    let itemText = '';
    switch (item.type) {
      case 'text':
        // Text content (paragraphs, lists) already has internal newlines. Add paragraph break AFTER.
        itemText = `${item.content || ''}\n\n`;
        break;
      case 'code_block':
        // ** RESTORED/VERIFIED Code block formatting **
        const lang = item.language || '';
        // Ensure content has a trailing newline before closing backticks
        const codeContent = (item.content || '').endsWith('\n') ? item.content : (item.content || '') + '\n';
        itemText = "```" + lang + "\n" + codeContent + "```\n\n"; // Add ``` and paragraph break
        break;
      case 'interactive_block':
        itemText += `> [${item.title || 'Untitled'}]\n`;
        if (item.code) { /* ... code handling ... */ }
        itemText += '\n'; // Ensure blank line after
        break;
      case 'image':
        // formatImageUrl adds ONE trailing newline. Add the second one for paragraph spacing.
        itemText = this.formatImageUrl(item.src, item.alt, imageFormat, defaultImageLabel);
        itemText += '\n';
        break;
      default:
        console.warn('[Formatter] Unknown content item type:', item.type);
        itemText = `> [Unsupported Content Type: ${item.type}]\n\n`;
    }
    return itemText;
  },

  // formatUserAttachment, getLabelByStyle, getNumberFormat, formatImageUrl remain the same as v19/v14
  formatUserAttachment: function(attachment, imageFormat, defaultImageLabel) { /* ... unchanged ... */ let o='';if(attachment.type==='image'){const a=attachment.extractedContent||defaultImageLabel;o=this.formatImageUrl(attachment.sourceUrl,a,imageFormat,defaultImageLabel);if(!o.endsWith('\n\n'))o+='\n';}else if(attachment.type==='file'&&attachment.fileName){o=`> [User File Attached: ${attachment.fileName}]\n`;if(attachment.extractedContent){const l=attachment.fileType||'';o+=`\`\`\`${l}\n${attachment.extractedContent}\n\`\`\`\n`;}else if(attachment.isPreviewOnly){o+='> (Preview only)\n';}o+='\n';}else if(attachment.type==='code_snippet'){let t="> [User Code Snippet Attached";if(attachment.language)t+=` (${attachment.language})`;t+="]\n";o=t;if(attachment.extractedContent){const l=attachment.language||'';o+="```"+l+"\n"+attachment.extractedContent+"\n```\n";}o+='\n';}else{o=`> [Unsupported User Attachment: ${attachment.type||'Unknown'}]\n\n`;}return o; },
  getLabelByStyle: function(labelStyle, type) { /* ... unchanged ... */ const l={'qa':{question:'Question',answer:'Answer'},'prompt':{question:'Prompt',answer:'Response'},'short':{question:'Q',answer:'A'},'korean':{question:'질문',answer:'답변'},'chinese':{question:'问题',answer:'回答'},'japanese':{question:'質問',answer:'回答'},'vietnamese':{question:'Câu hỏi',answer:'Trả lời'},'indonesian':{question:'Pertanyaan',answer:'Jawaban'},'hindi':{question:'प्रश्न',answer:'उत्तर'},'spanish':{question:'Pregunta',answer:'Respuesta'},'portuguese':{question:'Pergunta',answer:'Resposta'},'french':{question:'Question',answer:'Réponse'},'german':{question:'Frage',answer:'Antwort'},'italian':{question:'Domanda',answer:'Risposta'},'russian':{question:'Вопрос',answer:'Ответ'},'arabic':{question:'سؤال',answer:'جواب'},'swahili':{question:'Swali',answer:'Jibu'}}; return(l[labelStyle]||l['qa'])[type]; },
  getNumberFormat: function(numberFormat, index) { /* ... unchanged ... */ switch(numberFormat){case 'noSpace':return `${index}`;case 'space':return ` ${index}`;case 'dashNoSpace':return `-${index}`;case 'dash':return `- ${index}`;case 'spaceDashNoSpace':return ` -${index}`;case 'spaceDash':return ` - ${index}`;case 'colonNoSpace':return `:${index}`;case 'colon':return `: ${index}`;case 'spaceColonNoSpace':return ` :${index}`;case 'spaceColon':return ` : ${index}`;default:return ` ${index}`;} },
  formatImageUrl: function(url, alt, imageFormat, userImageLabel) {
    // New priority order:
    // 1. If userImageLabel is empty, use alt text
    // 2. If userImageLabel has value, use it
    // 3. If both are missing/empty, use default "Image URL"
    
    const label = userImageLabel === '' 
                ? (alt?.trim() || 'Image URL') 
                : (userImageLabel || 'Image URL');
                
    let fUrl = '';
    switch(imageFormat) {
      case 'markdown':
        fUrl = `![${label}](${url})`;
        break;
      case 'plain':
        fUrl = `${url}`;
        break;
      case 'bracketed':
      default:
        fUrl = `[${label}]: ${url}`;
        break;
    }
    return fUrl + '\n';
  }
};

// Export the formatter
if (typeof module !== 'undefined' && module.exports) { module.exports = formatter; }
else { self.formatter = formatter; }

// --- END OF FILE formatter.js ---