
import React, { useRef, useEffect, useState } from 'react';

interface CameraViewProps {
    onCapture: (imageDataUrl: string) => void;
    onClose: () => void;
}

const CameraView: React.FC<CameraViewProps> = ({ onCapture, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let stream: MediaStream | null = null;
        
        const startCamera = async () => {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error("Камера не поддерживается в этом браузере.");
                }
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error("Ошибка доступа к камере:", err);
                if (err instanceof Error) {
                     setError(`Не удалось получить доступ к камере. Убедитесь, что вы предоставили разрешение. Ошибка: ${err.name}`);
                } else {
                     setError("Произошла неизвестная ошибка при доступе к камере.");
                }
            }
        };

        startCamera();

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            if (context) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                const imageDataUrl = canvas.toDataURL('image/jpeg');
                onCapture(imageDataUrl);
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex flex-col justify-center items-center z-50">
            <div className="relative w-full max-w-3xl p-4">
                 {error ? (
                    <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-center">
                        <h3 className="font-bold">Ошибка камеры</h3>
                        <p>{error}</p>
                    </div>
                ) : (
                    <video ref={videoRef} autoPlay playsInline className="w-full h-auto rounded-lg" />
                )}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
            <div className="flex space-x-4 mt-4">
                <button
                    onClick={handleCapture}
                    disabled={!!error}
                    className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors"
                >
                    Сделать снимок
                </button>
                <button
                    onClick={onClose}
                    className="px-6 py-3 bg-gray-700 text-gray-200 font-semibold rounded-lg hover:bg-gray-600 transition-colors"
                >
                    Закрыть
                </button>
            </div>
        </div>
    );
};

export default CameraView;
