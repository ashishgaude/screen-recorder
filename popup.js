document.getElementById('startBtn').addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('recorder.html')
  });
  window.close(); // Close the popup
});
