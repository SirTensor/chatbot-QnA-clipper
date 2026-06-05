const CLIPBOARD_NONCE_TTL_MS = 30000;
const clipboardNonces = new Map();

function isAuthorizedClipboardSender(sender) {
  if (!sender || sender.id !== chrome.runtime.id) {
    return false;
  }

  if (sender.tab) {
    return false;
  }

  return !sender.url || sender.url.startsWith(chrome.runtime.getURL(''));
}

function pruneExpiredClipboardNonces(now = Date.now()) {
  clipboardNonces.forEach((expiresAt, nonce) => {
    if (expiresAt <= now) {
      clipboardNonces.delete(nonce);
    }
  });
}

function registerClipboardNonce(nonce) {
  if (typeof nonce !== 'string' || !nonce) {
    return false;
  }

  const now = Date.now();
  pruneExpiredClipboardNonces(now);
  clipboardNonces.set(nonce, now + CLIPBOARD_NONCE_TTL_MS);
  return true;
}

function consumeClipboardNonce(nonce) {
  if (typeof nonce !== 'string' || !nonce) {
    return false;
  }

  const now = Date.now();
  pruneExpiredClipboardNonces(now);

  const expiresAt = clipboardNonces.get(nonce);
  if (!expiresAt || expiresAt <= now) {
    clipboardNonces.delete(nonce);
    return false;
  }

  clipboardNonces.delete(nonce);
  return true;
}

// Listen for clipboard messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const isClipboardAction = message.action === 'register-clipboard-nonce' || message.action === 'copy-to-clipboard';
  if (!isClipboardAction) {
    return false;
  }

  if (!isAuthorizedClipboardSender(sender)) {
    sendResponse({ success: false, error: 'Invalid sender' });
    return false;
  }

  if (message.action === 'register-clipboard-nonce') {
    sendResponse({ success: registerClipboardNonce(message.nonce) });
    return false;
  }

  if (typeof message.text !== 'string') {
    sendResponse({ success: false, error: 'Invalid clipboard text' });
    return false;
  }

  if (!consumeClipboardNonce(message.nonce)) {
    sendResponse({ success: false, error: 'Invalid clipboard nonce' });
    return false;
  }

  copyToClipboard(message.text)
    .then(success => {
      sendResponse({ success });
    })
    .catch(error => {
      console.error('Error in offscreen document:', error);
      sendResponse({ success: false, error: error.message });
    });
  return true; // Indicates we'll respond asynchronously
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
