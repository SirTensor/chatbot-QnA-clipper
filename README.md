# Chatbot Q&A Clipper Chrome Extension

This Chrome extension allows you to easily copy questions and answers from various chatbot websites (ChatGPT, Claude, Google Bard) in a formatted way.

## Features

- Extracts questions and answers from supported chatbot websites
- Formats the content in a clean, numbered Q&A format
- One-click copying to clipboard
- Supports multiple chatbot platforms
- Easy to extend for new chatbot sites

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory

## Usage

1. Navigate to a supported chatbot website (ChatGPT, Claude, Gemini, etc.)
2. Click the extension icon in your Chrome toolbar
3. Click the "Copy Q&A to Clipboard" button
4. The formatted Q&A will be copied to your clipboard

## Supported Websites

- ChatGPT (chat.openai.com)
- Claude (claude.ai)
- Gemini (gemini.google.com)
- Grok (grok.x.ai)
- DeepSeek (chat.deepseek.com)

## Format

The copied text will be formatted as follows:

```
## Question 1

[Question content]

## Answer 1

[Answer content]

## Question 2

[Question content]

## Answer 2

[Answer content]
```

## Architecture

The extension follows a modular architecture:

- `background.js`: Central controller that orchestrates the extraction process
- `content.js`: Bridge between background.js and site-specific extractors
- `formatter.js`: Handles formatting raw data into markdown
- Site-specific extractors (e.g., `chatgpt.js`, `claude.js`): Handle extraction for each supported site
- `popup.js`: Manages UI and user settings

## Adding Support for a New Chatbot Site

To add support for a new chatbot site (e.g., abcde.com):

1. Create a new extractor file (e.g., `abcde.js`) using the template below:

```javascript
/**
 * abcde.com-specific extraction logic for Chatbot Q&A Clipper
 */

(function() {
  // Check if this extractor is already registered
  if (window.QAClipperExtractors && window.QAClipperExtractors.abcde) {
    return;
  }

  const AbcdeExtractor = {
    /**
     * Site identifier
     */
    siteId: 'abcde',
    
    /**
     * Checks if the current page is abcde
     * @returns {Boolean} - True if current page is abcde
     */
    isMatch: function() {
      return window.location.hostname.includes('abcde.com');
    },
    
    /**
     * Extracts raw Q&A data from abcde conversations
     * @returns {Array} - Array of objects with type, content, and optional images
     */
    extractRawData: function() {
      console.log('Starting abcde raw data extraction');
      
      try {
        // Find message containers on the page - update these selectors based on the site's HTML structure
        const messageContainers = document.querySelectorAll('YOUR_SELECTOR_HERE');
        
        if (messageContainers.length === 0) {
          throw new Error('No conversation content found.');
        }

        const rawDataArray = [];
        
        // Iterate through message containers to find user and AI messages
        for (let i = 0; i < messageContainers.length; i++) {
          const container = messageContainers[i];
          
          // Find user message elements - update these selectors
          const userElement = container.querySelector('USER_MESSAGE_SELECTOR');
          
          // Find AI response elements - update these selectors
          const assistantElement = container.querySelector('AI_RESPONSE_SELECTOR');

          // Process user message
          if (userElement && userElement.textContent.trim()) {
            const userText = userElement.textContent.trim();
            
            // Extract image URLs if any
            const userImages = [];
            userElement.querySelectorAll('img').forEach(img => {
              if (img.src && !img.src.startsWith('data:')) {
                userImages.push(img.src);
              }
            });
            
            rawDataArray.push({
              type: 'user',
              content: userText,
              images: userImages
            });
          }
          
          // Process AI message
          if (assistantElement && assistantElement.textContent.trim()) {
            rawDataArray.push({
              type: 'assistant',
              content: assistantElement.innerText.trim()
            });
          }
        }
        
        return rawDataArray;
      } catch (error) {
        console.error('Error in abcde extraction:', error);
        throw error;
      }
    }
  };
  
  // Register the extractor
  if (!window.QAClipperExtractors) {
    window.QAClipperExtractors = {};
  }
  
  window.QAClipperExtractors[AbcdeExtractor.siteId] = AbcdeExtractor;
})();
```

2. Update `manifest.json` to include your new site and script:

   a. Add the site URL to `host_permissions`:
   ```json
   "host_permissions": [
     ...,
     "https://abcde.com/*"
   ]
   ```

   b. Add the site URL to `content_scripts.matches`:
   ```json
   "matches": [
     ...,
     "https://abcde.com/*"
   ]
   ```

   c. Add your script to `content_scripts.js`:
   ```json
   "js": [
     "utils.js",
     ...,
     "abcde.js",
     "content.js"
   ]
   ```

3. Reload the extension in Chrome

That's it! The extension will now automatically detect and support your new chatbot site.

## Development

To modify or enhance the extension:

1. Make your changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

## License

MIT License 