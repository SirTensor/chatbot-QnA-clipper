# Privacy Policy for Chatbot Q&A Clipper

**Effective Date:** April 7, 2025

Thank you for using Chatbot Q&A Clipper (the "Extension"). This Privacy Policy describes how we handle information when you use our Extension. Your privacy is important to us, and we are committed to transparency about our practices.

**Our Core Principle: Local Processing & No Data Collection**

The fundamental principle of this Extension is that **all processing occurs locally on your computer within your browser.**

*   **We DO NOT collect, transmit, or store any of your personal information.**
*   **We DO NOT collect, transmit, or store the content of your chatbot conversations.**
*   **We DO NOT track your browsing activity across websites.**
*   **We DO NOT share any data with the developer or any third parties.**

**Information the Extension Handles Locally**

While we don't *collect* data in the traditional sense (i.e., sending it to our servers), the Extension needs to *access* and *process* certain information locally on your device to function as intended. This includes:

1.  **Website Content (From Active Chatbot Tabs):**
    *   **What:** When you activate the Extension on a supported chatbot website (ChatGPT, Gemini, Claude, Grok), it needs to access the content of that specific webpage. This includes the text of the conversation (questions and answers), code snippets within the conversation, and the URLs of images displayed in the chat.
    *   **Why:** This access is essential for the Extension's core purpose: to read the conversation data displayed on the page so it can be formatted according to your settings.
    *   **How:** This information is read directly from the Document Object Model (DOM) of the active chatbot tab *only when you initiate the extraction* (via button click or shortcut). It is processed entirely within your browser and is **never sent externally.**

2.  **User Configuration Settings:**
    *   **What:** The Extension stores your preferred formatting options (e.g., header level, label style, number format, image format preferences, custom image label, include platform name setting).
    *   **Why:** To provide a consistent user experience and save you from reconfiguring the formatting options every time you use the Extension.
    *   **How:** These settings are saved locally on your computer using the standard Chrome Storage API (`chrome.storage.local`). This data remains on your device and is **never transmitted externally.**

**How We Use the Handled Information**

The information accessed and processed locally is used *solely* for the following purposes:

*   **To Extract Conversation Data:** Reading the text, code, and image URLs from the active chatbot webpage.
*   **To Format Content:** Applying your chosen formatting rules (header level, labels, numbering, image style) to the extracted data to create Markdown text.
*   **To Copy to Clipboard:** Placing the final formatted Markdown text onto your system's clipboard when you explicitly trigger the copy function.
*   **To Store Settings:** Saving your formatting preferences locally for future use.

**Data Storage**

*   **Conversation Content:** The content of your chatbot conversations is **NEVER stored** by the Extension after it has been processed and copied to your clipboard (or if the copy fails and it's shown in the manual copy UI). It exists only temporarily in your browser's memory during the formatting process.
*   **Configuration Settings:** Your formatting preferences are stored locally on your device using `chrome.storage.local` and persist until you change them or uninstall the Extension.

**Data Sharing**

**We do not share any data handled by the Extension with anyone.**

*   No conversation content is shared.
*   No configuration settings are shared.
*   No personally identifiable information is accessed or shared.
*   All processing and data handling stay within your local browser environment.

**Permissions Justification**

The Extension requests certain permissions to perform its functions. Here's why they are needed:

*   **`activeTab`:** To run the extension only when you explicitly invoke it on the currently active tab, ensuring it only acts when and where you intend. Allows checking the URL of the active tab.
*   **`scripting`:** To inject the necessary code into the active chatbot webpage to read the conversation content and interact with the page's structure.
*   **`host_permissions`:** To allow the `scripting` permission to function specifically on the supported chatbot websites (ChatGPT, Gemini, Claude, Grok) where the extension needs to operate.
*   **`clipboardWrite`:** To copy the final formatted Markdown text to your system clipboard, which is the primary output of the Extension.
*   **`offscreen`:** Required by Chrome Manifest V3 to enable the `clipboardWrite` functionality securely from the extension's background context.
*   **`storage`:** To save your preferred formatting settings locally on your device.

**Security**

We rely on the security measures built into the Google Chrome browser and its extension framework. Since all processing is local and no data is transmitted externally, the risks associated with data breaches on external servers are eliminated for this Extension.

**Changes to This Privacy Policy**

We may update this Privacy Policy from time to time. We encourage you to review this policy periodically for any changes. Your continued use of the Extension after any modifications indicates your acceptance of the updated policy.

**Contact Us**

If you have any questions or concerns about this Privacy Policy or the Extension's practices, please contact us at: tensoredcode@gmail.com
