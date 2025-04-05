# Chatbot Q&A Clipper

A Chrome extension that extracts and formats Q&A conversations from AI chatbot platforms into well-structured markdown.

## Supported Platforms

- **ChatGPT** (chatgpt.com)
- **Gemini** (gemini.google.com)
- **Claude** (claude.ai)

## Features

- **One-Click Extraction**: Extract entire conversations with a single click or keyboard shortcut
- **Customizable Formatting**: Configure header levels, label styles, and number formats
- **Image Support**: Captures and properly formats images shared in conversations
- **Code Block Handling**: Preserves code syntax highlighting and formatting
- **Clipboard Integration**: Automatically copies formatted content to your clipboard
- **Keyboard Shortcut**: Quick access via customizable keyboard shortcut (default: Alt+3)

## Installation

### From Chrome Web Store
*Coming soon*

### Manual Installation
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the extension directory

## Usage

1. Navigate to any supported chatbot website (ChatGPT, Claude, or Gemini)
2. Have a conversation with the chatbot
3. Click the extension icon in your browser toolbar
4. Click "Copy Q&A to Clipboard" or use the keyboard shortcut (Alt+3 by default)
5. The formatted conversation is now in your clipboard, ready to be pasted anywhere

## Customization Options

### Header Format
Choose heading level from H1 to H5:
- `# Question 1` (H1)
- `## Question 1` (H2)
- `### Question 1` (H3)
- etc.

### Label Style
Select from various label formats:
- Question/Answer (English)
- Prompt/Response
- Q/A (Short form)
- Various language options (Korean, Chinese, Japanese, etc.)

### Number Format
Customize how numbers appear:
- `Question 1` (Space before number)
- `Question-1` (Dash, no space)
- `Question: 1` (Colon format)
- And many more variations

### Image URL Format
Choose how image links are formatted:
- `[Image URL]: https://...` (Bracketed)
- `![Image URL](https://...)` (Markdown)
- `https://...` (Plain URL)

### Other Options
- Include platform name in the output
- Custom image labels

## Keyboard Shortcut

The default keyboard shortcut is **Alt+3**. You can customize this:
1. Go to `chrome://extensions/shortcuts`
2. Find "Chatbot Q&A Clipper"
3. Click the pencil icon next to "Extract Q&A from the current chat"
4. Set your preferred keyboard combination

## Privacy

- This extension only accesses content on supported chatbot websites
- No data is sent to remote servers
- All processing happens locally in your browser
- No tracking or analytics are included
- **Clipboard Security**: Since this extension copies content to your clipboard, be cautious when using it on shared or public computers. Your conversation data remains in the clipboard and could be accessed by the next person using the computer. Always clear your clipboard before leaving a public computer, or avoid using the extension on shared devices.

## How It Works

The extension scans the current webpage's DOM to identify conversation elements based on platform-specific selectors. It extracts both user and assistant messages, including text, code blocks, and images, then formats the content according to your preferences.

## Troubleshooting

- **Extension not working**: Make sure you're on a supported website and have an active conversation
- **Missing content**: Some dynamic content may need time to load before extraction
- **Format issues**: Try adjusting the format settings in the popup

## License

This project is licensed under the MIT License - see the LICENSE file for details. 