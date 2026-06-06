# Privacy Policy for Chatbot Q&A Clipper

**Effective Date:** June 5, 2026

Thank you for using Chatbot Q&A Clipper (the "Extension"). This Privacy Policy explains what information the Extension handles and how that information is used.

**Core Principle: Local Processing**

The Extension is designed to work locally in your browser.

*   The developer does not receive your chatbot conversation content.
*   The Extension does not send your chatbot conversation content to remote servers.
*   The Extension does not include tracking, analytics, advertising, or profiling code.
*   The Extension does not sell, share, or transfer your data to third parties.

**Information the Extension Handles Locally**

The Extension must access and process certain information on your device to provide its features.

1.  **Website Content From Supported Chatbot Tabs**
    *   **What:** On supported chatbot websites (ChatGPT, Gemini, Claude, Grok), the Extension may read visible conversation content from the page. This can include user messages, assistant messages, code snippets, table content, math content, quoted text, file citation labels, and image URLs displayed in the chat.
    *   **Why:** This access is required to extract the conversation and format it as Markdown according to your settings.
    *   **How:** The Extension reads the page's Document Object Model (DOM) locally in your browser. Conversation content is not uploaded or sent externally. Where supported, features such as "Preserve while scrolling" and "Full Scan then Copy" may temporarily keep captured conversation content in memory for the current tab/session so the Extension can assemble a more complete copy.

2.  **User Configuration Settings**
    *   **What:** The Extension stores your formatting and capture preferences, including header level, label style, number format, image URL format, custom image label, include platform name, file citation handling, quote mark handling, and preserve-while-scrolling preference.
    *   **Why:** These settings let the Extension remember your preferred output format and capture behavior.
    *   **How:** These settings are saved locally using Chrome's `chrome.storage.local` API. They are not synced by the Extension and are not sent externally.

3.  **Clipboard Output**
    *   **What:** When you trigger a copy action, the Extension places the formatted Markdown text on your system clipboard. If automatic clipboard access fails, the formatted text may be displayed in the popup's manual copy UI so you can copy it yourself.
    *   **Why:** Copying formatted Markdown is the main purpose of the Extension.
    *   **How:** Clipboard handling occurs locally through Chrome extension APIs.

**How We Use the Handled Information**

Information handled by the Extension is used only to provide the Extension's user-facing features:

*   **To Extract Conversation Data:** Read conversation content from supported chatbot pages.
*   **To Temporarily Preserve Captured Messages:** Keep captured messages in local browser memory for the current tab/session when needed for scrolling preservation or Full Scan.
*   **To Format Content:** Apply your chosen Markdown formatting options.
*   **To Copy to Clipboard:** Place the final formatted Markdown text on your system clipboard when you trigger copying.
*   **To Store Settings:** Save your preferences locally for future use.

**Data Storage**

*   **Conversation Content:** Conversation content is not persistently stored by the Extension. It may exist temporarily in browser memory while the Extension extracts, formats, copies, or displays it in the manual copy UI. Where supported, temporary captured content may also be kept in memory for the current tab/session when preserve-while-scrolling or Full Scan is used. This temporary cache is local to your browser, is not synced or uploaded, and is cleared when the tab/session lifecycle ends, when the conversation changes, or when you use the clear captured content control.
*   **Configuration Settings:** Your preferences are stored locally using `chrome.storage.local` and persist until you change them, clear extension storage, or uninstall the Extension.

**Data Sharing and Limited Use**

We do not share data handled by the Extension with anyone.

The Extension's use of information received from Chrome extension APIs is limited to providing its single-purpose functionality: extracting supported chatbot conversations and copying them as Markdown. The Extension does not use this information for advertising, analytics, tracking, profiling, model training, creditworthiness, lending, or resale.

**Permissions Justification**

The Extension requests the following permissions:

*   **`activeTab`:** To identify and act on the current tab when you use the Extension.
*   **`scripting`:** To run the extraction code on supported chatbot pages.
*   **`host_permissions`:** To allow extraction only on the supported chatbot websites (ChatGPT, Gemini, Claude, Grok).
*   **`clipboardWrite`:** To copy the final formatted Markdown text to your system clipboard.
*   **`offscreen`:** Required by Chrome Manifest V3 for clipboard writing from the Extension's background context.
*   **`storage`:** To save your formatting and capture preferences locally.
*   **`commands`:** To provide the configurable keyboard shortcut.

**Security**

The Extension relies on the security protections built into Google Chrome and the Chrome extension framework. Because conversation processing stays local, the developer does not operate a server that stores your conversation content. You should still treat copied content carefully because it remains on your system clipboard until overwritten or cleared.

**Changes to This Privacy Policy**

We may update this Privacy Policy from time to time. We encourage you to review this policy periodically for any changes.

**Contact Us**

If you have any questions or concerns about this Privacy Policy or the Extension's practices, please contact us at: tensoredcode@gmail.com
