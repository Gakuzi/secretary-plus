


import React, { useState, useContext } from 'react';
import Chat from './components/Chat';
import SettingsModal from './components/SettingsModal';
import { AppContext } from './contexts/AppContext';
import { GoogleIcon, SettingsIcon } from './components/icons/Icons';

const App: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { settings, isUnsupportedDomain, isAuthenticated, userProfile, connect } = useContext(AppContext);

  const isConfigured = !!settings.googleClientId;
  // Show chat if configured OR if in a sandbox environment (for basic chat functionality).
  const showChat = isConfigured || isUnsupportedDomain;

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      <header className="grid grid-cols-3 items-center p-4 bg-gray-800 border-b border-gray-700 shadow-md">
        <div className="flex justify-start">
           {isAuthenticated && userProfile ? (
               <img src={userProfile.imageUrl} alt={userProfile.name} className="w-8 h-8 rounded-full" title={userProfile.name} />
           ) : (
                !isUnsupportedDomain && isConfigured && (
                    <button onClick={connect} className="flex items-center text-sm bg-gray-700 hover:bg-gray-600 text-white font-bold py-1.5 px-3 rounded-lg transition-colors">
                        <GoogleIcon className="mr-2" />
                        Войти
                    </button>
                )
           )}
        </div>
        <div className="flex justify-center">
            <h1 className="text-xl font-bold text-center">Секретарь+</h1>
        </div>
        <div className="flex justify-end">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-full hover:bg-gray-700 transition-colors"
              aria-label="Открыть настройки"
            >
              <SettingsIcon />
            </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {showChat ? (
           <Chat />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <h2 className="text-2xl font-semibold mb-4">Добро пожаловать в Секретарь+</h2>
            {/* FIX: Updated helper text to remove mention of Gemini API Key. */}
            <p className="max-w-md mb-6 text-gray-400">
              Чтобы начать, пожалуйста, настройте приложение. Нажмите на иконку шестеренки в правом верхнем углу, чтобы ввести ваш Google Client ID.
            </p>
            <button
                onClick={() => setIsSettingsOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg flex items-center transition-colors"
            >
                <SettingsIcon className="mr-2" />
                Перейти к настройкам
            </button>
          </div>
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};

export default App;