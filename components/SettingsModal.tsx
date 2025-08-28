


import React, { useState, useContext, useEffect, useCallback } from 'react';
import { AppContext } from '../contexts/AppContext';
import { GoogleIcon, CopyIcon, CheckIcon, UserIcon, AppleIcon, MicrosoftIcon, SupabaseIcon } from './icons/Icons';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { settings, setSettings, isAuthenticated, userProfile, connect, disconnect, isUnsupportedDomain } = useContext(AppContext);
    const [localSettings, setLocalSettings] = useState(settings);
    const [originUri, setOriginUri] = useState('');
    const [redirectUri, setRedirectUri] = useState('');
    const [isOriginCopied, setIsOriginCopied] = useState(false);
    const [isRedirectCopied, setIsRedirectCopied] = useState(false);
    
    useEffect(() => {
        setLocalSettings(settings);
    }, [settings, isOpen]);
    
    useEffect(() => {
        if(isOpen && !isUnsupportedDomain) {
            const currentUrl = new URL(window.location.href);
            setOriginUri(currentUrl.origin);

            // Create a cleaner redirect URI to avoid potential issues with hashes or query params
            currentUrl.search = '';
            currentUrl.hash = '';
            let cleanRedirectUri = currentUrl.toString();
            // Google often requires a trailing slash for web apps
            if (!cleanRedirectUri.endsWith('/')) {
                cleanRedirectUri += '/';
            }
            // For GitHub pages, remove index.html if it exists
            cleanRedirectUri = cleanRedirectUri.replace(/index\.html\/?$/, '');
            setRedirectUri(cleanRedirectUri);
        }
    }, [isOpen, isUnsupportedDomain]);

    const handleSave = () => {
        setSettings(localSettings);
        onClose();
    };

    const handleCopy = useCallback((textToCopy: string, type: 'origin' | 'redirect') => {
        navigator.clipboard.writeText(textToCopy).then(() => {
            if (type === 'origin') {
                setIsOriginCopied(true);
                setTimeout(() => setIsOriginCopied(false), 2000);
            } else {
                setIsRedirectCopied(true);
                setTimeout(() => setIsRedirectCopied(false), 2000);
            }
        });
    }, []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50" onClick={onClose}>
            <div className="bg-gray-800 text-white rounded-lg shadow-xl w-full max-w-2xl p-6 m-4" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-6">Настройки</h2>

                {isUnsupportedDomain ? (
                     <div className="space-y-4">
                        <div className="bg-blue-900 bg-opacity-40 border border-blue-700 text-blue-200 px-4 py-3 rounded-lg" role="alert">
                           <h3 className="font-bold text-lg mb-2">Интеграция с Google отключена</h3>
                           <p className="text-sm">
                               Вы запускаете приложение в среде для предпросмотра, где авторизация Google невозможна из-за политик безопасности.
                           </p>
                           <div className="mt-3 text-sm">
                               <p className="font-semibold">Что это значит:</p>
                               <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                                   <li>Вы можете общаться с ассистентом в чате.</li>
                                   <li>Функции, требующие доступа к вашим данным (создание событий, работа с контактами), отключены.</li>
                               </ul>
                           </div>
                           <p className="mt-3 text-sm">
                               Чтобы использовать все возможности «Секретарь+», пожалуйста, запустите проект локально или опубликуйте его на GitHub Pages.
                           </p>
                       </div>
                       <div className="flex justify-end">
                            <button onClick={onClose} className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors">Понятно</button>
                       </div>
                   </div>
                ) : (
                    <>
                        {/* API Keys Section */}
                        <div className="space-y-4 mb-8">
                            <div>
                                <label htmlFor="googleClientId" className="block text-sm font-medium text-gray-300 mb-1">Google Client ID</label>
                                <input
                                    type="password"
                                    id="googleClientId"
                                    value={localSettings.googleClientId}
                                    onChange={(e) => setLocalSettings({ ...localSettings, googleClientId: e.target.value })}
                                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        {/* Provider Section */}
                        <div className="mb-8">
                            <h3 className="text-lg font-semibold mb-4 border-b border-gray-700 pb-2">Интеграции</h3>
                            <div className="space-y-3">
                                <div className="bg-gray-700 p-4 rounded-lg flex items-center justify-between">
                                    <div className="flex items-center">
                                        <GoogleIcon />
                                        <span className="ml-3 font-semibold">Google</span>
                                    </div>
                                    {isAuthenticated && userProfile ? (
                                        <div className="flex items-center">
                                            {userProfile.imageUrl ? <img src={userProfile.imageUrl} alt={userProfile.name} className="w-8 h-8 rounded-full mr-3"/> : <UserIcon className="w-8 h-8 rounded-full mr-3 p-1 bg-gray-600"/> }
                                            <div className="text-sm">
                                                <p className="font-semibold">{userProfile.name}</p>
                                                <p className="text-gray-400">{userProfile.email}</p>
                                            </div>
                                            <button onClick={disconnect} className="ml-4 bg-red-600 hover:bg-red-700 text-white text-sm py-1 px-3 rounded-md transition-colors">Отключить</button>
                                        </div>
                                    ) : (
                                        <button onClick={connect} disabled={!settings.googleClientId} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-1 px-3 rounded-md transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed">Подключить</button>
                                    )}
                                </div>
                                 <div className="bg-gray-700 p-4 rounded-lg flex items-center justify-between opacity-50">
                                    <div className="flex items-center">
                                        <AppleIcon />
                                        <span className="ml-3 font-semibold">Apple</span>
                                    </div>
                                    <button disabled className="bg-gray-600 text-white text-sm py-1 px-3 rounded-md cursor-not-allowed">Скоро</button>
                                </div>
                                <div className="bg-gray-700 p-4 rounded-lg flex items-center justify-between opacity-50">
                                    <div className="flex items-center">
                                        <MicrosoftIcon />
                                        <span className="ml-3 font-semibold">Microsoft</span>
                                    </div>
                                    <button disabled className="bg-gray-600 text-white text-sm py-1 px-3 rounded-md cursor-not-allowed">Скоро</button>
                                </div>
                                <div className="bg-gray-700 p-4 rounded-lg flex items-center justify-between opacity-50">
                                    <div className="flex items-center">
                                        <SupabaseIcon />
                                        <span className="ml-3 font-semibold">Supabase</span>
                                    </div>
                                    <button disabled className="bg-gray-600 text-white text-sm py-1 px-3 rounded-md cursor-not-allowed">Скоро</button>
                                </div>
                            </div>
                        </div>

                        {/* Auth Instruction Section */}
                        <div className="mb-8">
                            <h3 className="text-lg font-semibold mb-2">Инструкция по авторизации Google</h3>
                            <p className="text-sm text-gray-400 mb-4">Вам нужно добавить два URL в настройки вашего OAuth 2.0 клиента в <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Google Cloud Console</a>. Скопируйте их точно, как указано ниже.</p>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">1. Авторизованные источники JavaScript</label>
                                    <div className="flex items-center bg-gray-900 p-2 rounded-md">
                                        <input type="text" readOnly value={originUri} className="flex-grow bg-transparent text-gray-300 font-mono text-sm focus:outline-none" />
                                        <button onClick={() => handleCopy(originUri, 'origin')} className="p-2 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition-colors">
                                            {isOriginCopied ? <CheckIcon /> : <CopyIcon />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">2. Авторизованные URI перенаправления</label>
                                    <div className="flex items-center bg-gray-900 p-2 rounded-md">
                                        <input type="text" readOnly value={redirectUri} className="flex-grow bg-transparent text-gray-300 font-mono text-sm focus:outline-none" />
                                        <button onClick={() => handleCopy(redirectUri, 'redirect')} className="p-2 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition-colors">
                                            {isRedirectCopied ? <CheckIcon /> : <CopyIcon />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Actions */}
                        <div className="flex justify-end space-x-4">
                            <button onClick={onClose} className="py-2 px-4 bg-gray-600 hover:bg-gray-500 rounded-md transition-colors">Отмена</button>
                            <button onClick={handleSave} className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors">Сохранить</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SettingsModal;