# Chatbot Q&A Clipper

A Chrome extension that extracts and formats Q&A conversations from AI chatbot platforms into well-structured markdown.

## Supported Platforms

- **ChatGPT** (chatgpt.com)
- **Gemini** (gemini.google.com)
- **Claude** (claude.ai)
- **Grok** (grok.com)

## Features

- **One-Click Extraction**: Extract conversations with a single click or keyboard shortcut
- **Capture Preservation**: Temporarily preserve captured messages while scrolling where supported
- **Full Scan**: Scan long conversations and copy the assembled result where supported
- **Customizable Formatting**: Configure header levels, label styles, number formats, image labels, and platform-specific options
- **Image URL Support**: Captures and properly formats image URLs shared in conversations
- **Code Block Handling**: Preserves code blocks and language labels where available
- **Clipboard Integration**: Automatically copies formatted content to your clipboard
- **Keyboard Shortcut**: Quick access via customizable keyboard shortcut (default: Alt+3)

## Installation

### From Chrome Web Store

You can install the extension directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/pblpjemjhgflddhdajfkieakdmmellmh).

### Manual Installation
1. Go to the [Releases page](https://github.com/SirTensor/chatbot-QnA-clipper/releases).
2. From the latest release's "Assets" section, download the distribution `.zip` file (e.g., `chatbot-clipper-v1.x.x.zip`).
3. Unzip the downloaded file.
4. Open Chrome and navigate to `chrome://extensions/`.
5. Enable "Developer mode" (toggle in the top-right corner).
6. Click "Load unpacked" and select the unzipped extension directory.
7. **Important:** Keep this directory in place. Chrome loads the extension directly from this folder, so if you move or delete it, the extension will stop working.

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
- `#### Question 1` (H4)
- `##### Question 1` (H5)

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
- Exclude file citation badges from copied output where supported
- Include quote marks extracted from CSS pseudo-elements where supported

### Capture Options
These options appear only on platforms where temporary capture preservation is supported.

- **Preserve while scrolling**: Temporarily keeps captured messages in memory for the current tab/session so long conversations can be copied more completely after scrolling through them.
- **Clear captured content**: Clears the temporary captured-message cache for the current tab/session.
- **Full Scan then Copy**: Scrolls through the current conversation, assembles captured messages, and copies the result where supported.

## Keyboard Shortcut

The default keyboard shortcut is **Alt+3**. You can customize this:
1. Go to `chrome://extensions/shortcuts`
2. Find "Chatbot Q&A Clipper"
3. Click the pencil icon next to "Extract Q&A from the current chat"
4. Set your preferred keyboard combination

## How It Works

The extension uses platform-specific selectors to read conversation elements from supported chatbot pages. It extracts user and assistant messages, including text, code blocks, tables, math content, and image URLs where available, then formats the result according to your preferences.

Where supported, the extension can temporarily preserve captured messages in browser memory for the current tab/session while you scroll. The Full Scan option uses this temporary capture flow to assemble longer conversations before copying. Conversation content is not uploaded or persistently stored by the extension.

## Troubleshooting

- **Extension not working**: Make sure you're on a supported website and have an active conversation
- **Missing content**: Some dynamic content may need time to load before extraction. If content seems incomplete, try **refreshing the page**, scrolling through the entire conversation, waiting a few moments, and then extracting again.
- **Format issues**: Try adjusting the format settings in the popup

## Privacy

- This extension only accesses content on supported chatbot websites
- No data is sent to remote servers
- All processing happens locally in your browser
- Formatting and capture preferences are stored locally with `chrome.storage.local`
- Captured-message content may be kept temporarily in browser memory for the current tab/session when supported capture preservation or Full Scan features are used
- No tracking or analytics are included
- For more detailed information, please see the full [Privacy Policy](PRIVACY-POLICY.md).

## Important Notes & Limitations

- **Clipboard Security**: Since this extension copies content to your clipboard, be cautious when using it on shared or public computers. Your conversation data remains in the clipboard and could be accessed by the next person using the computer. Always clear your clipboard before leaving a public computer, or avoid using the extension on shared devices.
- **Potential Omissions**: While the extension aims for accuracy, the complexity of chatbot interfaces means that occasionally, some parts of the conversation (especially complex structure content) might be missed during the extraction process. **It is recommended to briefly review the extracted content for completeness.**
- **Dynamic Loading**: Content that loads dynamically (e.g., as you scroll) might require you to ensure the relevant parts of the conversation are visible on the page before triggering the extraction. Where supported, use "Preserve while scrolling" or "Full Scan then Copy" when you need a more complete copy of a long conversation.
- **Interactive Content Limitation**: Certain interactive elements within chats, such as Claude's Artifacts and the Canvas of ChatGPT and Gemini, often require a specific user action (e.g., clicking a button) to fully display their content. This extension currently extracts the *visible* part or title of these blocks but may not capture the full underlying content that requires interaction.
- **Website Structure Changes**: The extension relies on the specific HTML structure of these sites; major updates can temporarily prevent the extension from working correctly. Updates to the extension will be provided immediately upon confirmation of any changes to the website structure. As another option, such compatibility issues can be resolved by manually editing the selectors in the platform configuration files (e.g., `chatgptConfigs.js`, `geminiConfigs.js`, `claudeConfigs.js`, `grokConfigs.js`).

## License

- The source code and project documentation are licensed under the MIT License - see the `LICENSE` file for details.
- Icons used in this extension are from [uxwing.com](https://uxwing.com/) and are not covered by the project's MIT License. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and [uxwing.com/license](https://uxwing.com/license/) for details.
