/* ==========================================
   AURA Cam Minimalist Mirror - app.js
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const video = document.getElementById('webcam');
  const canvas = document.getElementById('canvas-mirror');
  const ctx = canvas.getContext('2d');
  
  const gestureBadge = document.getElementById('gesture-badge');
  const badgeText = gestureBadge.querySelector('.badge-text');
  const helpBadge = document.getElementById('help-badge');
  
  const controlToggleBtn = document.getElementById('control-toggle-btn');
  const sliderPanel = document.getElementById('slider-panel');
  const blurSlider = document.getElementById('blur-slider');
  const blurVal = document.getElementById('blur-val');
  const landmarkToggle = document.getElementById('landmark-toggle');

  // Application State
  let currentStream = null;
  let handsModel = null;
  let latestResults = null;
  let isPeaceDetected = false;
  let hasHandBeenDetected = false; // Untuk menyembunyikan instruksi setelah penggunaan pertama
  
  // Interpolation parameters for 0.3s transition
  let targetBlur = 0;
  let currentBlur = 0;
  let blurAmountSetting = parseInt(blurSlider.value);
  let lastFrameTime = performance.now();

  // Hand joint connections mapping
  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4],       // Jempol
    [0, 5], [5, 6], [6, 7], [7, 8],       // Telunjuk
    [5, 9], [9, 10], [10, 11], [11, 12],  // Tengah
    [9, 13], [13, 14], [14, 15], [15, 16], // Manis
    [13, 17], [17, 18], [18, 19], [19, 20],// Kelingking
    [0, 17]                               // Telapak Bawah
  ];

  // Inisialisasi ikon Lucide
  lucide.createIcons();

  /* ==========================================
     1. Kamera Setup & Stream
     ========================================== */
  async function startCamera() {
    const constraints = {
      video: {
        facingMode: 'user', // Kamera depan (mirror)
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    try {
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = currentStream;
      video.play();
    } catch (err) {
      console.error("Gagal mengakses kamera:", err);
      badgeText.textContent = "Akses Kamera Ditolak";
      gestureBadge.classList.add('status-searching');
    }
  }

  const viewport = document.getElementById('mirror-viewport');

  // Atur dimensi canvas dan aspect-ratio container agar pas dengan feed kamera (Tanpa Zoom / Crop)
  function adjustViewportLayout() {
    if (video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      viewport.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    }
  }
  
  window.addEventListener('resize', adjustViewportLayout);
  video.addEventListener('loadedmetadata', adjustViewportLayout);
  video.addEventListener('play', adjustViewportLayout);

  /* ==========================================
     2. MediaPipe Hands & Deteksi Gesture
     ========================================== */
  function checkPeaceGesture(landmarks) {
    // Telunjuk terangkat: y ujung (8) < y sendi tengah (6) < y pangkal (5)
    const isIndexExtended = landmarks[8].y < landmarks[6].y && landmarks[6].y < landmarks[5].y;
    
    // Jari Tengah terangkat: y ujung (12) < y sendi tengah (10) < y pangkal (9)
    const isMiddleExtended = landmarks[12].y < landmarks[10].y && landmarks[10].y < landmarks[9].y;
    
    // Jari Manis menekuk: y ujung (16) > y sendi tengah (14)
    const isRingFolded = landmarks[16].y > landmarks[14].y;
    
    // Jari Kelingking menekuk: y ujung (20) > y sendi tengah (18)
    const isPinkyFolded = landmarks[20].y > landmarks[18].y;

    return isIndexExtended && isMiddleExtended && isRingFolded && isPinkyFolded;
  }

  function initMediaPipe() {
    handsModel = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsModel.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55
    });

    handsModel.onResults((results) => {
      latestResults = results;
      
      let peaceFound = false;
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Hilangkan petunjuk instruksi saat tangan pertama kali terdeteksi
        if (!hasHandBeenDetected) {
          hasHandBeenDetected = true;
          helpBadge.classList.add('hide');
        }

        for (const handLandmarks of results.multiHandLandmarks) {
          if (checkPeaceGesture(handLandmarks)) {
            peaceFound = true;
            break;
          }
        }
      }
      
      isPeaceDetected = peaceFound;

      // Update badge status di kiri atas
      if (isPeaceDetected) {
        if (!gestureBadge.classList.contains('status-detected')) {
          gestureBadge.className = "gesture-badge status-detected";
          badgeText.textContent = "Cermin Blur (✌️)";
          viewport.classList.add('active-blur');
        }
      } else {
        if (!gestureBadge.classList.contains('status-searching')) {
          gestureBadge.className = "gesture-badge status-searching";
          badgeText.textContent = "Mencari ✌️";
          viewport.classList.remove('active-blur');
        }
      }
    });

    sendFramesToModel();
  }

  let processing = false;
  async function sendFramesToModel() {
    if (video.readyState >= 2 && !processing && handsModel) {
      processing = true;
      try {
        await handsModel.send({ image: video });
      } catch (err) {
        console.error("MediaPipe Error:", err);
      }
      processing = false;
    }
    requestAnimationFrame(sendFramesToModel);
  }

  /* ==========================================
     3. Custom Rendering (Mirror)
     ========================================== */
  function drawNeonHand(landmarks) {
    const isPeace = checkPeaceGesture(landmarks);
    const colorLine = isPeace ? '#10b981' : '#06b6d4';
    const colorJoint = '#6366f1';
    const colorTipActive = '#10b981';

    // 1. Gambar hubungan antar jari
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = colorLine;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 10;
    ctx.shadowColor = colorLine;

    for (const [start, end] of connections) {
      const ptStart = landmarks[start];
      const ptEnd = landmarks[end];
      
      ctx.beginPath();
      ctx.moveTo(ptStart.x * canvas.width, ptStart.y * canvas.height);
      ctx.lineTo(ptEnd.x * canvas.width, ptEnd.y * canvas.height);
      ctx.stroke();
    }

    // 2. Gambar sendi-sendi (joints)
    ctx.shadowBlur = 6;
    for (let i = 0; i < landmarks.length; i++) {
      const pt = landmarks[i];
      ctx.beginPath();
      
      let radius = 4.5;
      
      if (isPeace && (i === 8 || i === 12)) {
        ctx.fillStyle = colorTipActive;
        ctx.shadowColor = colorTipActive;
        radius = 7;
      } else {
        ctx.fillStyle = colorJoint;
        ctx.shadowColor = colorJoint;
      }
      
      ctx.arc(pt.x * canvas.width, pt.y * canvas.height, radius, 0, 2 * Math.PI);
      ctx.fill();
    }
    
    // Reset shadow
    ctx.shadowBlur = 0;
  }

  function renderLoop(timestamp) {
    const dt = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    // Bersihkan canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Hitung interpolasi transisi blur 0.3s
    targetBlur = isPeaceDetected ? blurAmountSetting : 0;
    const speed = blurAmountSetting / 0.3; // Kecepatan transisi blur per detik

    if (currentBlur < targetBlur) {
      currentBlur = Math.min(targetBlur, currentBlur + speed * dt);
    } else if (currentBlur > targetBlur) {
      currentBlur = Math.max(targetBlur, currentBlur - speed * dt);
    }

    // Jika video sudah siap, render
    if (video.readyState >= 2) {
      // Pastikan dimensi disesuaikan jika berubah
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        adjustViewportLayout();
      }

      const cWidth = canvas.width;
      const cHeight = canvas.height;

      // 1. Gambar Feed Video (dengan Mirroring)
      ctx.save();
      
      // Translasi dan scaling untuk efek cermin (mirror)
      ctx.translate(cWidth, 0);
      ctx.scale(-1, 1);
      
      if (currentBlur > 0.5) {
        ctx.filter = `blur(${currentBlur}px)`;
      } else {
        ctx.filter = 'none';
      }
      
      ctx.drawImage(video, 0, 0, cWidth, cHeight);
      ctx.restore();

      // 2. Gambar Kerangka Tangan (jika aktif)
      if (landmarkToggle.checked && latestResults && latestResults.multiHandLandmarks) {
        ctx.save();
        // Lakukan transformasi cermin koordinat agar titik tangan sejajar dengan wajah cermin
        ctx.translate(cWidth, 0);
        ctx.scale(-1, 1);
        
        for (const handLandmarks of latestResults.multiHandLandmarks) {
          drawNeonHand(handLandmarks);
        }
        ctx.restore();
      }
    }

    requestAnimationFrame(renderLoop);
  }

  // Mulai render loop
  requestAnimationFrame(renderLoop);

  /* ==========================================
     4. Antarmuka Panel Kontrol
     ========================================== */
  // Toggle slider panel
  controlToggleBtn.addEventListener('click', () => {
    controlToggleBtn.classList.toggle('active');
    sliderPanel.classList.toggle('show');
  });

  // Slider pengubah intensitas blur
  blurSlider.addEventListener('input', (e) => {
    blurAmountSetting = parseInt(e.target.value);
    blurVal.textContent = `${blurAmountSetting}px`;
  });

  /* ==========================================
     Jalankan Aplikasi
     ========================================== */
  startCamera();
  initMediaPipe();
});
