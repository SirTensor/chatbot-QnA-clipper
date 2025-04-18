# Chatbot Q&A Clipper

A Chrome extension that extracts and formats Q&A conversations from AI chatbot platforms into well-structured markdown.

## Supported Platforms

- **ChatGPT** (chatgpt.com)
- **Gemini** (gemini.google.com)
- **Claude** (claude.ai)
- **Grok** (grok.com)

## Features

- **One-Click Extraction**: Extract entire conversations with a single click or keyboard shortcut
- **Customizable Formatting**: Configure header levels, label styles, and number formats
- **Image Support**: Captures and properly formats image URLs shared in conversations
- **Code Block Handling**: Preserves code syntax highlighting and formatting
- **Clipboard Integration**: Automatically copies formatted content to your clipboard
- **Keyboard Shortcut**: Quick access via customizable keyboard shortcut (default: Alt+3)

## Installation

### From Chrome Web Store

You can install the extension directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/pblpjemjhgflddhdajfkieakdmmellmh).

### Manual Installation
1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" (toggle in the top-right corner).
4. Click "Load unpacked" and select the extension directory **where you downloaded or cloned the repository**.
5. **Important:** Keep this directory in place. Chrome loads the extension directly from this folder, so if you move or delete it, the extension will stop working.

## Usage

1. Navigate to any supported chatbot website (ChatGPT, Claude, Gemini, Grok)
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
- `Question:1` (Colon format)
- And many more variations

### Image URL Format
Choose how image links are formatted:
- `[Image URL]: https://...` (Bracketed)
- `![Image URL](https://...)` (Markdown)
- `https://...` (Plain URL)

### Other Options
- Custom image labels
- Include platform name in the output

## Keyboard Shortcut

The default keyboard shortcut is **Alt+3**. You can customize this:
1. Go to `chrome://extensions/shortcuts`
2. Find "Chatbot Q&A Clipper"
3. Click the pencil icon next to "Extract Q&A from the current chat"
4. Set your preferred keyboard combination

## How It Works

The extension scans the current webpage's DOM to identify conversation elements based on platform-specific selectors. It extracts both user and assistant messages, including text, code blocks, and images, then formats the content according to your preferences.

## Troubleshooting

- **Extension not working**: Make sure you're on a supported website and have an active conversation
- **Missing content**: Some dynamic content may need time to load before extraction. If content seems incomplete, try **refreshing the page**, scrolling through the entire conversation, waiting a few moments, and then extracting again.
- **Format issues**: Try adjusting the format settings in the popup

## Privacy

- This extension only accesses content on supported chatbot websites
- No data is sent to remote servers
- All processing happens locally in your browser
- No tracking or analytics are included
- For more detailed information, please see the full [Privacy Policy](PRIVACY-POLICY.md).

## Important Notes & Limitations

- **Clipboard Security**: Since this extension copies content to your clipboard, be cautious when using it on shared or public computers. Your conversation data remains in the clipboard and could be accessed by the next person using the computer. Always clear your clipboard before leaving a public computer, or avoid using the extension on shared devices.
- **Potential Omissions**: While the extension aims for accuracy, the complexity of chatbot interfaces means that occasionally, some parts of the conversation (especially complex structure content) might be missed during the extraction process. **It is recommended to briefly review the extracted content for completeness.**
- **Dynamic Loading**: Content that loads dynamically (e.g., as you scroll) might require you to ensure the relevant parts of the conversation are visible on the page before triggering the extraction.
- **Interactive Content Limitation**: Certain interactive elements within chats, such as Claude's Artifacts and the Canvas of ChatGPT and Gemini, often require a specific user action (e.g., clicking a button) to fully display their content. This extension currently extracts the *visible* part or title of these blocks but may not capture the full underlying content that requires interaction.
- **Website Structure Changes**: The extension relies on the specific HTML structure of these sites; major updates can temporarily prevent the extension from working correctly. Updates to the extension will be provided immediately upon confirmation of any changes to the website structure. As another option, such compatibility issues can be resolved by manually editing the selectors in the platform configuration files (e.g., `chatgptConfigs.js`, `geminiConfigs.js`, `claudeConfigs.js`, `grokConfigs.js`).

## License

- The code for this project is licensed under the MIT License - see the `LICENSE` file for details.
- Icons used in this extension are from [uxwing.com](https://uxwing.com/). For full icon license details, please visit [uxwing.com/license](https://uxwing.com/license/).