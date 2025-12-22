// --- Internationalization (i18n) Helper Functions ---

/**
 * RTL (Right-to-Left) languages list
 */
const RTL_LANGUAGES = ['ar', 'fa', 'he'];

/**
 * Gets a localized message from the _locales directory
 * @param {string} messageName - The message key from messages.json
 * @param {string|string[]} [substitutions] - Optional substitution strings
 * @returns {string} The localized message
 */
function getMessage(messageName, substitutions) {
  return chrome.i18n.getMessage(messageName, substitutions) || messageName;
}

/**
 * Checks if the current UI language is RTL and applies dir attribute
 */
function applyRTLDirection() {
  const uiLanguage = (chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || navigator.language || '';
  const baseLang = uiLanguage.toLowerCase().split('-')[0];

  if (RTL_LANGUAGES.includes(baseLang)) {
    document.documentElement.setAttribute('dir', 'rtl');
    document.body.classList.add('rtl');
  } else {
    document.documentElement.setAttribute('dir', 'ltr');
    document.body.classList.remove('rtl');
  }
}

function getDefaultLabelStyle() {
  const uiLanguage = (chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || navigator.language || '';
  const fullLang = uiLanguage.toLowerCase().replace('-', '_');
  const baseLang = uiLanguage.toLowerCase().split('-')[0];

  // Handle Chinese variants: putonghua (Simplified) vs guoyu (Traditional)
  if (baseLang === 'zh') {
    if (fullLang === 'zh_tw' || fullLang === 'zh_hk' || fullLang === 'zh_mo') {
      return 'guoyu';
    }
    return 'putonghua';
  }

  const languageMap = {
    ko: 'korean',
    ja: 'japanese',
    vi: 'vietnamese',
    id: 'indonesian',
    hi: 'hindi',
    es: 'spanish',
    pt: 'portuguese',
    fr: 'french',
    de: 'german',
    it: 'italian',
    ru: 'russian',
    ar: 'arabic',
    sw: 'swahili',
    uk: 'ukrainian',
    nl: 'dutch',
    pl: 'polish',
    tr: 'turkish',
    th: 'thai',
    fa: 'persian',
    he: 'hebrew',
    fil: 'filipino'
  };

  return languageMap[baseLang] || 'qa';
}

/**
 * Reorders the label style dropdown to put user's language at the very top
 */
function reorderLabelStyleDropdown() {
  const select = document.getElementById('labelStyle');
  if (!select) return;

  const userStyle = getDefaultLabelStyle();
  // Universal options - no reordering needed for these
  const universalOptions = ['qa', 'prompt', 'short'];
  if (universalOptions.includes(userStyle)) return;

  // Find the user's option and move it to the very top
  const userOption = select.querySelector(`option[value="${userStyle}"]`);
  if (!userOption) return;

  select.insertBefore(userOption, select.firstChild);
}

/**
 * Applies i18n translations to all elements with data-i18n attributes
 */
function applyI18n() {
  // Translate text content
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const messageName = element.getAttribute('data-i18n');
    const message = getMessage(messageName);
    if (message) {
      element.textContent = message;
    }
  });

  // Translate placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const messageName = element.getAttribute('data-i18n-placeholder');
    const message = getMessage(messageName);
    if (message) {
      element.placeholder = message;
    }
  });

  // Translate tooltips (data-tooltip attributes)
  document.querySelectorAll('[data-i18n-tooltip]').forEach(element => {
    const messageName = element.getAttribute('data-i18n-tooltip');
    const message = getMessage(messageName);
    if (message) {
      element.setAttribute('data-tooltip', message);
    }
  });
}

/**
 * Creates a single tooltip element and positions it so it never overflows the popup
 */
function setupHelpTooltips() {
  const icons = Array.from(document.querySelectorAll('.help-icon'));
  if (!icons.length) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'help-tooltip';
  document.body.appendChild(tooltip);

  const margin = 8;

  const hideTooltip = () => {
    tooltip.classList.remove('visible');
  };

  const positionTooltip = (target) => {
    const iconRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);
    left = Math.max(margin, Math.min(viewportWidth - tooltipRect.width - margin, left));

    let top = iconRect.bottom + margin;
    if (top + tooltipRect.height + margin > viewportHeight) {
      top = iconRect.top - tooltipRect.height - margin;
    }
    top = Math.max(margin, Math.min(viewportHeight - tooltipRect.height - margin, top));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const showTooltip = (event) => {
    const icon = event.currentTarget;
    const text = icon.getAttribute('data-tooltip');
    if (!text) return;
    tooltip.textContent = text;
    positionTooltip(icon);
    tooltip.classList.add('visible');
  };

  icons.forEach(icon => {
    icon.setAttribute('tabindex', '0');
    icon.addEventListener('mouseenter', showTooltip);
    icon.addEventListener('mouseleave', hideTooltip);
    icon.addEventListener('focus', showTooltip);
    icon.addEventListener('blur', hideTooltip);
  });
}

// --- Settings Management Functions ---

/**
 * Save format settings to storage whenever they change
 */
function saveSettings() {
  const settings = {
    headerLevel: document.getElementById('headerLevel').value,
    labelStyle: document.getElementById('labelStyle').value,
    numberFormat: document.getElementById('numberFormat').value,
    imageFormat: document.getElementById('imageFormat').value,
    imageLabel: document.getElementById('imageLabel').value,
    includePlatform: document.getElementById('includePlatform').checked,
    excludeFileCitations: document.getElementById('excludeFileCitations').checked,
    includePseudoQuotes: document.getElementById('includePseudoQuotes').checked
  };

  // Save to local storage
  chrome.storage.local.set({ formatSettings: settings }, () => {
    // console.log('Saved settings:', settings);
  });
  return settings;
}

/**
 * Function to show manual copy UI when automatic clipboard fails
 * @param {string} text - The text to display for manual copying
 */
function showManualCopyUI(text) {
  if (!text) return;
  
  // Hide normal UI and show manual copy UI
  document.getElementById('normalUI').style.display = 'none';
  document.getElementById('manualCopyUI').style.display = 'block';
  
  // Set the text content
  document.getElementById('extractedTextArea').value = text;
}

/**
 * Update the displayed shortcut from Chrome's commands API
 */
function updateShortcutDisplay() {
  chrome.commands.getAll((commands) => {
    const extractCommand = commands.find(cmd => cmd.name === 'trigger-extraction');
    const shortcutElement = document.getElementById('currentShortcut');
    
    if (extractCommand && extractCommand.shortcut) {
      shortcutElement.textContent = extractCommand.shortcut;
    } else {
      shortcutElement.textContent = getMessage('shortcutNotSet');
    }
  });
}

/**
 * Function to update status message
 * @param {string} message - The status message to display
 */
function updateStatus(message) {
  const statusDiv = document.getElementById('status');
  if (statusDiv) {
    statusDiv.textContent = message;
  }
}

// --- Initialize Popup ---

// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', () => {
  // Apply RTL direction if needed
  applyRTLDirection();
  // Apply i18n translations
  applyI18n();
  // Reorder label style dropdown to put user's language at top
  reorderLabelStyleDropdown();
  setupHelpTooltips();

  // Load settings
  chrome.storage.local.get('formatSettings', (data) => {
    const defaultLabelStyle = getDefaultLabelStyle();

    if (data.formatSettings) {
      document.getElementById('headerLevel').value = data.formatSettings.headerLevel || '2';
      document.getElementById('labelStyle').value = data.formatSettings.labelStyle || defaultLabelStyle;
      document.getElementById('numberFormat').value = data.formatSettings.numberFormat || 'space';

      document.getElementById('includePlatform').checked = data.formatSettings.includePlatform || false;
      document.getElementById('excludeFileCitations').checked = data.formatSettings.excludeFileCitations !== undefined ? data.formatSettings.excludeFileCitations : true;
      document.getElementById('includePseudoQuotes').checked = data.formatSettings.includePseudoQuotes || false;

      // Set image format options if they exist
      if (data.formatSettings.imageFormat) {
        document.getElementById('imageFormat').value = data.formatSettings.imageFormat;
      }

      if (data.formatSettings.imageLabel) {
        document.getElementById('imageLabel').value = data.formatSettings.imageLabel;
      }
    } else {
      // No saved settings - set defaults including excludeFileCitations checked
      document.getElementById('excludeFileCitations').checked = true;
      document.getElementById('labelStyle').value = defaultLabelStyle;
    }
  });
  
  // Update the shortcut display
  updateShortcutDisplay();
  
  // Add change listeners to all selects
  document.getElementById('headerLevel').addEventListener('change', saveSettings);
  document.getElementById('labelStyle').addEventListener('change', saveSettings);
  document.getElementById('numberFormat').addEventListener('change', saveSettings);
  document.getElementById('imageFormat').addEventListener('change', saveSettings);
  document.getElementById('imageLabel').addEventListener('change', saveSettings);
  document.getElementById('imageLabel').addEventListener('input', saveSettings);

  document.getElementById('includePlatform').addEventListener('change', saveSettings);
  document.getElementById('excludeFileCitations').addEventListener('change', saveSettings);
  document.getElementById('includePseudoQuotes').addEventListener('change', saveSettings);
  
  // Add click handler for the shortcut config link
  document.getElementById('shortcutConfigLink').addEventListener('click', (e) => {
    e.preventDefault();
    // Open Chrome's extensions shortcut page
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
  
  // Handle the copy button click
  document.getElementById('copyButton').addEventListener('click', () => {
    updateStatus(getMessage('statusExtracting'));
    
    // Just send a message to the background script to start extraction
    chrome.runtime.sendMessage({ action: 'start-extraction' }, (response) => {
      if (chrome.runtime.lastError) {
        updateStatus(getMessage('statusError', chrome.runtime.lastError.message));
        return;
      }
      
      // Don't update status here - wait for extraction-complete message instead
      if (!response || !response.success) {
        if (response && response.error === 'Ignoring rapid trigger (debounce)') {
          updateStatus(getMessage('statusWaitDebounce'));
        } else if (response && response.error) {
          updateStatus(getMessage('statusError', response.error));
        } else {
          updateStatus(getMessage('statusStartError'));
        }
      }
    });
  });
  
  // Add event listeners for manual copy UI
  document.getElementById('manualCopyButton').addEventListener('click', () => {
    const textArea = document.getElementById('extractedTextArea');
    textArea.select();
    document.execCommand('copy');
    updateStatus(getMessage('statusCopied'));
    
    // Return to normal UI after brief delay
    setTimeout(() => {
      document.getElementById('manualCopyUI').style.display = 'none';
      document.getElementById('normalUI').style.display = 'block';
    }, 1500);
  });
  
  document.getElementById('backButton').addEventListener('click', () => {
    document.getElementById('manualCopyUI').style.display = 'none';
    document.getElementById('normalUI').style.display = 'block';
  });
});

// --- Runtime Message Listener ---

// Listen for runtime messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'clipboard-failed' && request.text) {
    showManualCopyUI(request.text);
    sendResponse({ success: true });
  }
  
  // Handle extraction complete message
  if (request.action === 'extraction-complete') {
    if (request.success) {
      updateStatus(request.message || getMessage('statusCopied'));
    } else {
      updateStatus(getMessage('statusError', request.message || 'Extraction failed'));
    }
    sendResponse({ received: true });
  }
  
  return true;
});
