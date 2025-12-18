const url = location.href;

chrome.runtime.sendMessage({ name: "confirm", url }, (response) => {
  const lastError = chrome.runtime.lastError;
  if (lastError) {
    console.log(lastError.message);
    return;
  }

  if (!response || typeof response.url !== "string") return;

  const isOk = window.confirm(
    `このURLをSlackに送信しますか？\n${response.url}`,
  );
  if (!isOk) return;

  chrome.runtime.sendMessage(
    { name: "notify_slack", url: response.url },
    () => {
      const notifyError = chrome.runtime.lastError;
      if (notifyError) console.log(notifyError.message);
    },
  );
});

