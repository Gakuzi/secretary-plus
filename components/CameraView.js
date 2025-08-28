// This file is a placeholder for camera functionality.
// A full implementation would require more complex DOM manipulation
// for video streams, canvas, and user permissions.

export function createCameraView(onCapture, onClose) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-50 p-4';

    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.className = 'max-w-full max-h-full rounded-lg';

    const controls = document.createElement('div');
    controls.className = 'absolute bottom-5 flex space-x-4';
    
    const captureButton = document.createElement('button');
    captureButton.className = 'w-16 h-16 rounded-full bg-white border-4 border-gray-400 hover:opacity-80 transition-opacity';
    
    const closeButton = document.createElement('button');
    closeButton.className = 'absolute top-5 right-5 text-white text-3xl p-2 rounded-full hover:bg-white/10 transition-colors';
    closeButton.innerHTML = '&times;';
    
    let stream = null;
    const stopStream = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    };

    closeButton.addEventListener('click', () => {
        stopStream();
        onClose();
    });
    
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        .then(s => {
            stream = s;
            video.srcObject = stream;
        })
        .catch(err => {
            console.error("Camera access error:", err);
            const errorMsg = "Не удалось получить доступ к камере. Проверьте разрешения в настройках браузера и перезагрузите страницу.";
            
            overlay.innerHTML = ''; // Clear everything
            const errorContainer = document.createElement('div');
            errorContainer.className = 'text-white text-center p-8 bg-gray-900 rounded-lg';
            errorContainer.innerHTML = `
                <p class="font-bold text-lg text-red-400">Ошибка доступа</p>
                <p class="mt-2">${errorMsg}</p>
                <button id="camera-error-close" class="mt-4 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md">Закрыть</button>
            `;
            overlay.appendChild(errorContainer);
            overlay.querySelector('#camera-error-close').addEventListener('click', onClose);
        });

    captureButton.addEventListener('click', () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        const base64 = dataUrl.split(',')[1];
        onCapture({ mimeType: 'image/jpeg', base64 });
        stopStream();
        onClose();
    });

    controls.appendChild(captureButton);
    overlay.appendChild(video);
    overlay.appendChild(controls);
    overlay.appendChild(closeButton);

    return overlay;
}