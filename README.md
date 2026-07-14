# JSM UI Fixer

**JSM UI Fixer** is a lightweight Firefox extension designed to clean up and declutter the Jira Service Management (JSM) ticket interface. It automatically detects and collapses long, messy email reply chains (often created when users reply to JSM tickets via email, appending standard and previous conversations) in comments and ticket descriptions.

Via a toggle, you can read tickets without combing through paragraphs of repeated historical email threads, while preserving the ability to expand and inspect the original headers and quotes at any time.

## Summary

When agents look at tickets in Jira Service Management, they can be overwhelmed by comments that contain full email reply trails (e.g., "On Tuesday, Jul 14, John Doe wrote..."). These trails repeat old conversations and stack up, making the comment thread extremely long and hard to navigate.

**JSM UI Fixer** runs in the background of Jira pages:
1. **Scans** comments and description fields for standard email headers.
2. **Replaces** the clutter with an interactive toggle button representing the header.
3. **Hides** the quoted text trailing after that header.
4. **Allows** you to click the button to expand and show the original email chain if needed.
5. **Tracks** how many reply chains have been cleaned up on the current page, visible via the extension popup.

## Installation

### Temporary install (for development/testing)

1.  Clone this repository locally.
2.  Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3.  Click **Load Temporary Add-on**.
4.  Select the `manifest.json` file in this project's directory.
5.  Open any Jira Service Management ticket and watch long reply chains disappear!

Note: temporary add-ons are removed when Firefox restarts, so you'll need to reload it each session.

### Permanent install

1. Download the [latest release](https://github.com/agnesnutter/jsmUiFixerFF/releases/latest) and download the .xpi file.
2. Follow the prompts to install with the desired permissions.

Note: The extension will not auto-update. If there are updates, you will need to re-download from the above link.
