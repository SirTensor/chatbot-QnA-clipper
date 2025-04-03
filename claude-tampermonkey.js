// ==UserScript==
// @name         Claude SVG Code Extractor & Copier
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Finds SVG code blocks on claude.ai, extracts the pure SVG, and adds a button to copy it.
// @match        https://claude.ai/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @author       Your Name (or leave blank)
// ==/UserScript==

(function() {
    'use strict';

    // --- Styling for the button ---
    GM_addStyle(`
        #copy-svg-button {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999; /* Ensure it's on top */
            padding: 10px 18px;
            background-color: #4CAF50; /* Green */
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            transition: background-color 0.3s ease;
        }
        #copy-svg-button:hover {
            background-color: #45a049; /* Darker Green */
        }
        #copy-svg-button.copied {
             background-color: #007bff; /* Blue for copied state */
        }
    `);

    // --- Function to extract SVG code ---
    function extractSvgCode(codeElement) {
        if (!codeElement) return null;

        let svgCode = '';
        const walker = document.createTreeWalker(
            codeElement,
            NodeFilter.SHOW_TEXT, // Only process text nodes
            null,
            false
        );

        let currentNode;
        while (currentNode = walker.nextNode()) {
            svgCode += currentNode.nodeValue;
        }
        return svgCode.trim(); // Trim leading/trailing whitespace
    }

    // --- Create and add the button ---
    function addButton() {
        // Remove existing button if any (useful for dynamic page updates)
        const existingButton = document.getElementById('copy-svg-button');
        if (existingButton) {
            existingButton.remove();
        }

        // Check if there's an SVG code block present *now*
        const svgCodeElement = document.querySelector('code.language-svg');
        if (!svgCodeElement) {
            console.log("Tampermonkey: No SVG code block found on the page currently.");
            return; // Don't add the button if no SVG found
        }

        const button = document.createElement('button');
        button.id = 'copy-svg-button';
        button.textContent = 'Copy SVG Code';

        button.addEventListener('click', () => {
            // Find the element again in case the page updated
            const currentSvgCodeElement = document.querySelector('code.language-svg');
            const svgString = extractSvgCode(currentSvgCodeElement);

            if (svgString) {
                GM_setClipboard(svgString);
                console.log("SVG code copied to clipboard:", svgString);

                // Provide visual feedback
                button.textContent = 'Copied!';
                button.classList.add('copied');
                setTimeout(() => {
                    button.textContent = 'Copy SVG Code';
                    button.classList.remove('copied');
                }, 2000); // Revert after 2 seconds
            } else {
                console.error("Tampermonkey: Could not find or extract SVG code on click.");
                alert("Error: Could not find SVG code to copy.");
            }
        });

        document.body.appendChild(button);
        console.log("Tampermonkey: Copy SVG button added.");
    }

    // --- Initial setup ---
    // Use a small delay or MutationObserver if content loads dynamically
    // Simple approach: try adding the button after a short delay
    // A more robust approach uses MutationObserver (more complex)

    // Let's try adding the button initially
    addButton();

    // Optional: Set up a MutationObserver to re-add the button if the DOM changes significantly
    // This helps if the SVG code block appears *after* the initial page load.
    const observer = new MutationObserver((mutationsList, observer) => {
        // Check if an SVG code block exists or if the button is missing
        const svgExists = document.querySelector('code.language-svg');
        const buttonExists = document.getElementById('copy-svg-button');

        // If SVG exists but button doesn't, try adding the button
        if (svgExists && !buttonExists) {
            console.log("Tampermonkey: Detected potential SVG block, attempting to add button.");
            addButton();
        }
        // Optional: If button exists but SVG doesn't, remove button? (Could be annoying)
        // else if (!svgExists && buttonExists) {
        //    buttonExists.remove();
        // }
    });

    // Start observing the body for changes in children
    observer.observe(document.body, { childList: true, subtree: true });

    // Note: Disconnect the observer if the script is ever unloaded (less critical in Tampermonkey)
    // window.addEventListener('unload', () => observer.disconnect());


})();