// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only process messages with the right action
  if (message.action === 'copy-to-clipboard' && message.text) {
    // Perform the clipboard operation
    copyToClipboard(message.text)
      .then(success => {
        sendResponse({ success });
      })
      .catch(error => {
        console.error('Error in offscreen document:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates we'll respond asynchronously
  }
});

// Function to copy text to clipboard
async function copyToClipboard(text) {
  try {
    // Create a textarea element
    const textarea = document.createElement('textarea');
    textarea.value = text;
    
    // Make the textarea non-editable to avoid flashing
    textarea.setAttribute('readonly', '');
    
    // Hide the element
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    
    // Add to DOM
    document.body.appendChild(textarea);
    
    // Select the text
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    
    // Execute the copy command
    const success = document.execCommand('copy');
    
    // Clean up
    document.body.removeChild(textarea);
    
    return success;
  } catch (error) {
    console.error('Clipboard operation failed:', error);
    throw error;
  }
} 