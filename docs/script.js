let mediaRecorder;
let recordedChunks = [];
let screenStream;
let micStream;
let audioContext;
let audioDestination;
let mixedStream;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const livePreview = document.getElementById('livePreview');
const recordedPlayback = document.getElementById('recordedPlayback');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const placeholderText = document.getElementById('placeholderText');
const micToggle = document.getElementById('micToggle');
const camToggle = document.getElementById('camToggle');
const cameraBubble = document.getElementById('cameraBubble');
const cameraFeed = document.getElementById('cameraFeed');
const pipBtn = document.getElementById('pipBtn');
let cameraStream;

// --- Camera Bubble Logic ---
camToggle.addEventListener('change', async () => {
  if (camToggle.checked) {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      cameraFeed.srcObject = cameraStream;
      cameraBubble.classList.remove('hidden');
    } catch (e) {
      console.warn("Camera access denied:", e);
      camToggle.checked = false;
      alert("Camera access is required for this feature.");
    }
  } else {
    stopCamera();
  }
});

// PiP Logic
pipBtn.addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled) {
      await cameraFeed.requestPictureInPicture();
    } else {
      alert("Picture-in-Picture is not supported in this browser.");
    }
  } catch (err) {
    console.error("PiP Error:", err);
  }
});

function stopCamera() {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(console.error);
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  cameraFeed.srcObject = null;
  cameraBubble.classList.add('hidden');
}

// Draggable Logic
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;

cameraBubble.addEventListener("mousedown", dragStart);
document.addEventListener("mouseup", dragEnd);
document.addEventListener("mousemove", drag);

function dragStart(e) {
  initialX = e.clientX - xOffset;
  initialY = e.clientY - yOffset;

  if (e.target === cameraBubble || e.target === cameraFeed) {
    isDragging = true;
  }
}

function dragEnd(e) {
  initialX = currentX;
  initialY = currentY;
  isDragging = false;
}

function drag(e) {
  if (isDragging) {
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;

    xOffset = currentX;
    yOffset = currentY;

    setTranslate(currentX, currentY, cameraBubble);
  }
}

function setTranslate(xPos, yPos, el) {
  el.style.transform = "translate3d(" + xPos + "px, " + yPos + "px, 0)";
}

const audioVisualizer = document.getElementById('audioVisualizer');
let visualizerContext = audioVisualizer.getContext('2d');
let visualizerAnimationId;
let visualizerAnalyser;

// --- Audio Visualizer Logic ---
function startVisualizer(stream) {
  audioVisualizer.classList.remove('hidden'); // Show when recording starts
  
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  
  // We need to create a new source for the visualizer to avoid interfering with the recorder's graph
  // if they are sharing the same AudioContext, but here we might need to be careful.
  // Actually, we can just hook into the existing micStream.
  
  const source = audioContext.createMediaStreamSource(stream);
  visualizerAnalyser = audioContext.createAnalyser();
  visualizerAnalyser.fftSize = 64; 
  source.connect(visualizerAnalyser);
  
  const bufferLength = visualizerAnalyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  function draw() {
    visualizerAnimationId = requestAnimationFrame(draw);
    visualizerAnalyser.getByteFrequencyData(dataArray);
    
    visualizerContext.clearRect(0, 0, audioVisualizer.width, audioVisualizer.height);
    
    // Create gradient
    const gradient = visualizerContext.createLinearGradient(0, 0, audioVisualizer.width, 0);
    gradient.addColorStop(0, '#8b5cf6'); // Violet
    gradient.addColorStop(1, '#06b6d4'); // Cyan
    visualizerContext.fillStyle = gradient;

    // Draw symmetrical waveform
    const barWidth = (audioVisualizer.width / bufferLength); 
    let x = 0;
    
    for(let i = 0; i < bufferLength; i++) {
      let barHeight = (dataArray[i] / 255) * audioVisualizer.height;
      
      // Center the bars vertically
      let y = (audioVisualizer.height - barHeight) / 2;
      
      // Rounded caps logic (simulated by simple rect for performance, but centered looks nicer)
      if (barHeight > 0) {
          visualizerContext.fillRect(x, y, barWidth - 1, barHeight);
      }
      
      x += barWidth;
    }
  }
  draw();
}

function stopVisualizer() {
  if (visualizerAnimationId) {
    cancelAnimationFrame(visualizerAnimationId);
  }
  visualizerContext.clearRect(0, 0, audioVisualizer.width, audioVisualizer.height);
  audioVisualizer.classList.add('hidden'); // Hide when stopped
}

// Check for mobile device
function checkMobile() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
  if (isMobile) {
    document.getElementById('mobileOverlay').classList.remove('hidden');
    document.getElementById('mobileOverlay').classList.add('active');
  }
}

// Initialize
checkMobile();

startBtn.addEventListener('click', async () => {
  try {
    const includeMic = micToggle.checked;

    // 1. Get Screen Stream (System Audio + Video)
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
      }
    });

    // 2. Get Mic Stream (if requested)
    if (includeMic) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        });
        
        // Start visualizer with the new stream
        startVisualizer(micStream);
        
      } catch (e) {
        console.warn("Microphone access denied or error:", e);
        alert("Microphone access failed. Recording will proceed without mic audio.");
      }
    }

    // 3. Mix Audio Streams
    mixedStream = new MediaStream();
    screenStream.getVideoTracks().forEach(track => mixedStream.addTrack(track));

    const hasSystemAudio = screenStream.getAudioTracks().length > 0;
    const hasMicAudio = micStream && micStream.getAudioTracks().length > 0;

    if (hasSystemAudio && hasMicAudio) {
      audioContext = new AudioContext();
      audioDestination = audioContext.createMediaStreamDestination();

      const systemSource = audioContext.createMediaStreamSource(screenStream);
      const micSource = audioContext.createMediaStreamSource(micStream);

      systemSource.connect(audioDestination);
      micSource.connect(audioDestination);

      audioDestination.stream.getAudioTracks().forEach(track => mixedStream.addTrack(track));
    } else if (hasSystemAudio) {
      screenStream.getAudioTracks().forEach(track => mixedStream.addTrack(track));
    } else if (hasMicAudio) {
      micStream.getAudioTracks().forEach(track => mixedStream.addTrack(track));
    }

    // 4. Setup Preview
    livePreview.srcObject = mixedStream;
    livePreview.muted = true;
    livePreview.classList.remove('hidden');
    recordedPlayback.classList.add('hidden');
    placeholderText.classList.add('hidden');
    
    // 5. Setup Recorder
    const options = { mimeType: 'video/webm; codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      console.warn(`${options.mimeType} is not supported, trying default.`);
      delete options.mimeType;
    }

    mediaRecorder = new MediaRecorder(mixedStream, options);

    recordedChunks = [];
    mediaRecorder.ondataavailable = handleDataAvailable;
    mediaRecorder.onstop = handleStop;

    // 6. Handle "Stop Sharing" native browser bar
    screenStream.getVideoTracks()[0].onended = () => {
      stopRecording();
    };

    // 7. Start
    mediaRecorder.start();
    updateUIState('recording');

  } catch (err) {
    console.error("Error: " + err);
    statusText.innerText = "Error: " + err.message;
  }
});

stopBtn.addEventListener('click', () => {
  stopRecording();
});

downloadBtn.addEventListener('click', () => {
  const blob = new Blob(recordedChunks, {
    type: 'video/webm'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  document.body.appendChild(a);
  a.style = 'display: none';
  a.href = url;
  a.download = `recording-${new Date().toISOString()}.webm`;
  a.click();
  window.URL.revokeObjectURL(url);
});

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  
  stopVisualizer(); // Stop the visualizer
  
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
  }
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
  }
  if (mixedStream) {
    mixedStream.getTracks().forEach(track => track.stop());
  }
  if (audioContext) {
    audioContext.close();
  }

  updateUIState('stopped');
}

function handleDataAvailable(event) {
  if (event.data.size > 0) {
    recordedChunks.push(event.data);
  }
}

function handleStop() {
  const blob = new Blob(recordedChunks, {
    type: 'video/webm'
  });
  recordedPlayback.src = URL.createObjectURL(blob);
  
  // Switch preview to playback
  livePreview.srcObject = null;
  livePreview.classList.add('hidden');
  recordedPlayback.classList.remove('hidden');
  placeholderText.classList.add('hidden');
  
  updateUIState('finished');
}

function updateUIState(state) {
  if (state === 'recording') {
    statusText.innerText = "Recording Live";
    if (statusBadge) statusBadge.classList.add('recording');
    
    startBtn.classList.add('hidden');
    micToggle.parentElement.classList.add('hidden');
    
    stopBtn.classList.remove('hidden');
    downloadBtn.classList.add('hidden');
  
  } else if (state === 'stopped') {
    // Transition
  } else if (state === 'finished') {
    statusText.innerText = "Recording Finished";
    if (statusBadge) statusBadge.classList.remove('recording');
    
    startBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;">
         <circle cx="12" cy="12" r="10"></circle>
         <polygon points="10 8 16 12 10 16 10 8"></polygon>
      </svg> New Recording`;
    
    startBtn.classList.remove('hidden');
    micToggle.parentElement.classList.remove('hidden');
    
    stopBtn.classList.add('hidden');
    downloadBtn.classList.remove('hidden');
  }
}

// --- Donation Widget Logic ---
function switchTab(tabId) {
  // Update buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent.toLowerCase().includes(tabId)) {
      btn.classList.add('active');
    }
  });

  // Update content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`tab-${tabId}`).classList.add('active');
}

function copyUPI() {
  const upiId = document.getElementById('upi-id-text').innerText;
  navigator.clipboard.writeText(upiId).then(() => {
    const originalText = document.getElementById('upi-id-text').innerText;
    document.getElementById('upi-id-text').innerText = 'Copied!';
    setTimeout(() => {
      document.getElementById('upi-id-text').innerText = originalText;
    }, 2000);
  });
}

// Global scope for HTML onclick access
window.switchTab = switchTab;
window.copyUPI = copyUPI;
