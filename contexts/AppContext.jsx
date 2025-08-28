import React, { createContext, useState, useEffect, useMemo } from 'react';
import useLocalStorage from '../hooks/useLocalStorage.js';
import { GoogleServiceProvider } from '../services/google/GoogleServiceProvider.js';

const isUnsupportedHost = () => {
    const hostname = window.location.hostname;
    // Google OAuth fails on temporary or sandboxed domains.
    // We check for known patterns like *.usercontent.goog or hostnames without a TLD (except localhost).
    return hostname.endsWith('usercontent.goog') || (!hostname.includes('.') && hostname !== 'localhost');
};

export const AppContext = createContext({});

export const AppProvider = ({ children }) => {
  // FIX: Removed geminiApiKey from settings, as it's handled by environment variables.
  const [settings, setSettings] = useLocalStorage('app-settings', {
    googleClientId: '',
  });

  const [serviceProvider, setServiceProvider] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [isUnsupportedDomain] = useState(isUnsupportedHost());

  useEffect(() => {
    // Do not initialize Google provider if the domain is unsupported or no client ID is set.
    if (settings.googleClientId && !isUnsupportedDomain) {
      const googleProvider = new GoogleServiceProvider(settings.googleClientId);
      setServiceProvider(googleProvider);
      
      const checkAuth = async () => {
        try {
          const authStatus = await googleProvider.isAuthenticated();
          setIsAuthenticated(authStatus);
          if (authStatus) {
            const profile = await googleProvider.getUserProfile();
            setUserProfile(profile);
          }
        } catch (error) {
          console.error("Ошибка при проверке аутентификации:", error);
          setIsAuthenticated(false);
          setUserProfile(null);
        }
      };
      
      checkAuth();
    } else {
        setServiceProvider(null);
        setIsAuthenticated(false);
        setUserProfile(null);
    }
  }, [settings.googleClientId, isUnsupportedDomain]);
  

  const connect = async () => {
    if (serviceProvider) {
      try {
        await serviceProvider.authenticate();
        const authStatus = await serviceProvider.isAuthenticated();
        setIsAuthenticated(authStatus);
        if (authStatus) {
            const profile = await serviceProvider.getUserProfile();
            setUserProfile(profile);
        }
      } catch (error) {
        console.error("Ошибка подключения:", error);
        alert("Не удалось подключиться. Проверьте настройки и всплывающие окна.");
      }
    }
  };

  const disconnect = async () => {
    if (serviceProvider) {
      await serviceProvider.disconnect();
      setIsAuthenticated(false);
      setUserProfile(null);
    }
  };

  const contextValue = useMemo(() => ({
    settings,
    setSettings,
    serviceProvider,
    isAuthenticated,
    userProfile,
    isUnsupportedDomain,
    connect,
    disconnect,
  }), [settings, setSettings, serviceProvider, isAuthenticated, userProfile, isUnsupportedDomain, connect, disconnect]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};