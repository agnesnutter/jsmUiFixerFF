/* JSM UI Fixer - Content Script */

let isEnabled = true;
let observer = null;

// Read config from local storage, default to true
chrome.storage.local.get({ enabled: true }, (items) => {
  isEnabled = items.enabled;
  if (isEnabled) {
    startScanning();
  }
});

// Listen for configuration changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.enabled) {
    const newVal = changes.enabled.newValue;
    if (newVal !== isEnabled) {
      isEnabled = newVal;
      if (isEnabled) {
        startScanning();
      } else {
        stopScanningAndRestore();
      }
    }
  }
});

// Listen for popup messages requesting stats
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getStats') {
    const count = document.querySelectorAll('.jsm-reply-header-toggle').length;
    sendResponse({ count, isEnabled });
  }
  return true; // Keep message channel open for async response
});

/**
 * Checks if the text matches standard email reply headers (Gmail, Outlook, Apple Mail, etc.).
 */
function isEmailReplyHeader(text) {
  if (!text || text.length > 1000) return false;
  text = text.trim();
  // Strip common leading email quote characters (e.g. >, |, spaces)
  const cleaned = text.replace(/^[>\s|]+/, '').trim();

  // Pattern 1: Gmail and standard clients "On [Date/Time], [Name] <[Email]> wrote:"
  if (/^On\s+[\s\S]+?wrote\s*:\s*$/i.test(cleaned)) {
    // Reduce false positives by checking for dates, times, or email constructs
    const hasYear = /\b20\d{2}\b/.test(cleaned);
    const hasMonth = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)/i.test(cleaned);
    const hasTime = /\b\d{1,2}:\d{2}\b/.test(cleaned);
    const hasEmail = /<[^>]+@[^>]+>|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(cleaned);
    const hasAt = /\bat\b/i.test(cleaned);

    if ((hasYear ? 1 : 0) + (hasMonth ? 1 : 0) + (hasTime ? 1 : 0) + (hasEmail ? 1 : 0) + (hasAt ? 1 : 0) >= 2) {
      return true;
    }
  }

  // Pattern 2: Outlook -----Original Message-----
  if (/^-+\s*Original\s+Message\s*-+/i.test(cleaned)) {
    return true;
  }

  // Pattern 3: Outlook From/Sent style headers
  if (/^From\s*:\s*[\s\S]+?\bSent\s*:/i.test(cleaned) || /^From\s*:\s*[\s\S]+?\bDate\s*:/i.test(cleaned)) {
    return true;
  }

  return false;
}

/**
 * Finds leaf block elements under a root element that match the email header criteria.
 * Uses a TreeWalker to process text nodes globally (resilient to td, font, span tags).
 */
function findHeaderBlocks(root) {
  if (!root) return [];
  const matches = [];

  // 1. Find matches by traversing text nodes (catches custom markup like tables/td/font/span)
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node;
  while (node = walker.nextNode()) {
    const text = node.nodeValue;
    if (isEmailReplyHeader(text)) {
      // Find the block-like ancestor of this text node (skip inline tags)
      let ancestor = node.parentElement;
      const inlineTags = ['span', 'font', 'b', 'i', 'strong', 'em', 'a', 'u'];
      
      while (ancestor && inlineTags.includes(ancestor.tagName.toLowerCase())) {
        ancestor = ancestor.parentElement;
      }
      
      if (ancestor && 
          !ancestor.hasAttribute('data-jsm-fixer-processed') && 
          !ancestor.classList.contains('jsm-reply-header-toggle')) {
        matches.push(ancestor);
      }
    }
  }

  // 2. Fallback check for elements where text is split, but overall innerText matches
  const fallbackSelectors = 'p, div, li, td, blockquote, font';
  const elements = root.querySelectorAll(fallbackSelectors);
  
  for (const el of elements) {
    if (el.hasAttribute('data-jsm-fixer-processed') || el.classList.contains('jsm-reply-header-toggle')) {
      continue;
    }
    // Only look at leaf-like elements for matches
    if (el.querySelector(fallbackSelectors)) {
      continue;
    }
    if (isEmailReplyHeader(el.innerText)) {
      if (!matches.includes(el)) {
        matches.push(el);
      }
    }
  }

  return matches;
}

/**
 * Ascends DOM to locate the enclosing Jira comment or description field container.
 */
function getCommentContainer(el) {
  const selectors = [
    '[data-testid="comment-body"]',
    '[data-testid="issue.views.field.rich-text.description"]', // Issue details description field
    '[data-testid="issue.activity.comment"]', // Comment base wrapper
    '[data-testid^="activity-comment"]',
    '[data-testid="comment-base"]',
    '.comment-content',
    '.ak-renderer-document', // Atlassian Rich Text Editor document canvas
    '.issue-comment',
    '.ak-side-comments-wrapper',
    '.js-comment-activity',
    '.activity-comment',
    '.jsd-request-comment',
    '.cv-request-comment',
    '.request-comment'
  ];

  for (const selector of selectors) {
    const container = el.parentElement ? el.parentElement.closest(selector) : null;
    if (container) return container;
  }

  // Fallback structural scan: climb up until hitting page boundary
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const tagName = parent.tagName.toLowerCase();
    if (tagName === 'article' || parent.classList.contains('comment') || parent.id.includes('comment')) {
      return parent;
    }
    parent = parent.parentElement;
  }

  return el.parentElement; // Absolute fallback
}

/**
 * Processes a detected reply header: hides it and subsequent quote content by using toggle classes.
 */
function processHeaderBlock(headerBlock) {
  if (headerBlock.hasAttribute('data-jsm-fixer-processed')) {
    return;
  }

  // Skip if we are inside a contenteditable editor to avoid breaking edit fields
  if (headerBlock.closest('[contenteditable="true"]') || 
      headerBlock.closest('.ak-editor-area') || 
      headerBlock.closest('.ak-editor-content-area')) {
    return;
  }

  // Mark it immediately so we do not attempt double processing
  headerBlock.setAttribute('data-jsm-fixer-processed', 'true');

  const commentContainer = getCommentContainer(headerBlock);
  if (!commentContainer) {
    return;
  }

  // Create collapsible header widget
  const headerWrapper = document.createElement('div');
  headerWrapper.className = 'jsm-reply-header-toggle collapsed';

  const icon = document.createElement('span');
  icon.className = 'jsm-reply-toggle-icon';
  headerWrapper.appendChild(icon);

  const titleText = document.createElement('span');
  titleText.className = 'jsm-reply-header-text';
  // Use clean version of original header text
  titleText.innerText = headerBlock.innerText.replace(/^[>\s|]+/, '').trim();
  headerWrapper.appendChild(titleText);

  // Find all ancestor elements up to the comment/description container
  const ancestors = [];
  let parent = headerBlock.parentElement;
  while (parent && parent !== commentContainer) {
    ancestors.push(parent);
    parent = parent.parentElement;
  }
  headerWrapper.ancestors = ancestors;

  // Insert the toggle widget before the original header element
  // Pause observer during DOM modifications to prevent mutation observer from firing on our own additions
  if (observer) {
    observer.disconnect();
  }

  headerBlock.parentNode.insertBefore(headerWrapper, headerBlock);

  if (observer && isEnabled) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Add the collapsed parent classes to ancestors on next animation frame
  requestAnimationFrame(() => {
    ancestors.forEach(el => el.classList.add('jsm-collapsed-parent'));
  });

  // Attach toggle click event
  headerWrapper.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const isCollapsed = headerWrapper.classList.contains('collapsed');
    
    requestAnimationFrame(() => {
      if (isCollapsed) {
        headerWrapper.classList.remove('collapsed');
        headerWrapper.classList.add('expanded');
        ancestors.forEach(el => el.classList.remove('jsm-collapsed-parent'));
      } else {
        headerWrapper.classList.remove('expanded');
        headerWrapper.classList.add('collapsed');
        ancestors.forEach(el => el.classList.add('jsm-collapsed-parent'));
      }
    });
  });
}

/**
 * Performs full scan of the DOM for header elements.
 */
function scanPage() {
  const matches = findHeaderBlocks(document.body);
  matches.forEach(processHeaderBlock);
}

/**
 * Start page scanning and observe dynamic comment changes.
 */
function startScanning() {
  // Run scan once initially
  scanPage();

  // Set up observer to process comments loaded dynamically
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          let targetNode = null;
          if (node.nodeType === Node.ELEMENT_NODE) {
            targetNode = node;
          } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            targetNode = node.parentElement;
          }

          if (targetNode) {
            const matches = findHeaderBlocks(targetNode);
            matches.forEach(processHeaderBlock);
          }
        });
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Remove all UI edits and restore original document layout.
 */
function stopScanningAndRestore() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  const toggles = document.querySelectorAll('.jsm-reply-header-toggle');
  toggles.forEach(toggle => {
    const ancestors = toggle.ancestors || [];
    requestAnimationFrame(() => {
      ancestors.forEach(el => {
        if (el && el.classList) {
          el.classList.remove('jsm-collapsed-parent');
        }
      });
      toggle.remove();
    });
  });

  const processed = document.querySelectorAll('[data-jsm-fixer-processed]');
  processed.forEach(el => el.removeAttribute('data-jsm-fixer-processed'));
}
