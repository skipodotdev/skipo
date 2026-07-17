window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "lich-app") return

  chrome.runtime.sendMessage(
    {
      source: "lich-page",
      type: event.data.type,
      zoom: event.data.zoom,
    },
    (response) => {
      const ok = !chrome.runtime.lastError && !!response?.ok
      window.postMessage(
        {
          source: "lich-zoom-extension",
          id: event.data.id,
          ok,
          zoom: response?.zoom,
        },
        window.location.origin,
      )
    },
  )
})

chrome.runtime.onMessage.addListener((message) => {
  if (message?.source !== "lich-background" || message.type !== "zoom-changed") {
    return false
  }
  window.postMessage(
    {
      source: "lich-zoom-extension",
      type: "zoom-changed",
      zoom: message.zoom,
    },
    window.location.origin,
  )
  return false
})
