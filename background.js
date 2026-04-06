const DATABASE_ID = '338ec58fa370806eae65d96aaf557e7d';

// Keep service worker alive
const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20000);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'saveBrick') {
    saveBrick(msg).then(sendResponse);
    return true;
  }
  if (msg.action === 'ping') {
    sendResponse({ pong: true });
    return true;
  }
});

async function saveBrick({ text, source, url }) {
  try {
    const config = await chrome.storage.sync.get(['notionKey', 'claudeKey']);
    const notionKey = config.notionKey;
    const claudeKey = config.claudeKey;

    if (!notionKey) {
      console.error('Capture Brick: No Notion key set.');
      return { success: false, reason: 'no_key' };
    }

    let tags = [];
    if (claudeKey && text) {
      try {
        const tagRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': claudeKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 80,
            messages: [{
              role: 'user',
              content: `Return ONLY a JSON array of 2-3 lowercase tags for this insight. No preamble, no markdown, just the array. Example: ["strategy","product"]\n\nText: ${text.slice(0, 600)}`
            }]
          })
        });
        const tagData = await tagRes.json();
        const raw = tagData.content?.[0]?.text?.trim() || '[]';
        tags = JSON.parse(raw.replace(/```json|```/g, '').trim());
        if (!Array.isArray(tags)) tags = [];
      } catch (e) {
        tags = [];
      }
    }

    const safeText = (text || '').slice(0, 2000);
    const safeSource = source || 'Unknown source';
    const safeUrl = url || null;

    const notionRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: DATABASE_ID },
        properties: {
          Brick: {
            title: [{ text: { content: safeSource } }]
          },
          URL: {
            url: safeUrl
          },
          Tags: {
            multi_select: tags.slice(0, 5).map(t => ({ name: String(t).slice(0, 50) }))
          },
          Date: {
            date: { start: new Date().toISOString().split('T')[0] }
          },
          'Raw Text': {
            rich_text: [{ text: { content: safeText } }]
          }
        }
      })
    });

    if (notionRes.ok) {
      return { success: true };
    } else {
      const err = await notionRes.json();
      console.error('Capture Brick: Notion error', JSON.stringify(err));
      return { success: false, reason: JSON.stringify(err) };
    }

  } catch (e) {
    console.error('Capture Brick: Unexpected error', e);
    return { success: false, reason: e.message };
  }
}
