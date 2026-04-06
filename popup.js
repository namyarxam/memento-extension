document.addEventListener('DOMContentLoaded', async () => {
  // Always load saved keys on open
  const config = await chrome.storage.sync.get(['notionKey', 'claudeKey']);
  if (config.notionKey) document.getElementById('notionKey').value = config.notionKey;
  if (config.claudeKey) document.getElementById('claudeKey').value = config.claudeKey;

  document.getElementById('save').addEventListener('click', async () => {
    const notionKey = document.getElementById('notionKey').value.trim();
    const claudeKey = document.getElementById('claudeKey').value.trim();

    if (!notionKey) {
      alert('Notion key is required.');
      return;
    }

    await chrome.storage.sync.set({ notionKey, claudeKey });

    const status = document.getElementById('status');
    status.style.opacity = '1';
    setTimeout(() => { status.style.opacity = '0'; }, 2500);
  });
});
