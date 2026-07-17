chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.source !== "lich-page" || !sender.tab?.id) {
    return false
  }

  if (message.type === "get-zoom") {
    chrome.tabs.getZoom(sender.tab.id, (zoom) => {
      sendResponse({ ok: !chrome.runtime.lastError, zoom })
    })
    return true
  }

  if (message.type === "set-zoom" && typeof message.zoom === "number") {
    chrome.tabs.setZoom(sender.tab.id, message.zoom, () => {
      sendResponse({ ok: !chrome.runtime.lastError, zoom: message.zoom })
    })
    return true
  }

  return false
})

chrome.tabs.onZoomChange.addListener(({ tabId, newZoomFactor }) => {
  chrome.tabs.sendMessage(
    tabId,
    {
      source: "lich-background",
      type: "zoom-changed",
      zoom: newZoomFactor,
    },
    () => {
      void chrome.runtime.lastError
    },
  )
})
