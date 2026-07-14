/* JSM UI Fixer Popup JS */

document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('enableToggle');
  const collapsedCount = document.getElementById('collapsedCount');
  const statsCard = document.getElementById('statsCard');
  const nonJiraCard = document.getElementById('nonJiraCard');

  // Load initial settings
  chrome.storage.local.get({ enabled: true }, (items) => {
    toggle.checked = items.enabled;
  });

  // Handle toggle switch state changes
  toggle.addEventListener('change', () => {
    const isEnabled = toggle.checked;
    chrome.storage.local.set({ enabled: isEnabled });
  });

  // Query active tab stats
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url) {
      const url = tab.url;
      const isJira = url.includes('.atlassian.net') || url.includes('.jira.com');

      if (isJira) {
        // Send a message to content.js script on the current page to retrieve statistics
        chrome.tabs.sendMessage(tab.id, { action: 'getStats' }, (response) => {
          if (chrome.runtime.lastError) {
            // Content script not loaded yet (e.g. page needs a refresh)
            collapsedCount.textContent = '0';
            return;
          }
          if (response) {
            collapsedCount.textContent = response.count || '0';
          }
        });
      } else {
        // Hide stats card and show domain warning
        statsCard.style.display = 'none';
        nonJiraCard.style.display = 'flex';
      }
    } else {
      // Hide stats if no active tab URL is accessible
      statsCard.style.display = 'none';
      nonJiraCard.style.display = 'flex';
    }
  } catch (err) {
    console.error('Failed to query tab statistics:', err);
    statsCard.style.display = 'none';
    nonJiraCard.style.display = 'flex';
  }
});
