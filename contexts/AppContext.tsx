

import React, { createContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { AppSettings, UserProfile } from '../types';
import useLocalStorage from '../hooks/useLocalStorage';
import { ServiceProvider } from '../services/ServiceProvider';
import { GoogleServiceProvider } from '../services/google/GoogleServiceProvider';

const isUnsupportedHost = (): boolean => {
    const hostname = window.location.hostname;
    // Google OAuth fails on temporary or sandboxed domains.
    // We check for known patterns like *.usercontent.goog or hostnames without a TLD (except localhost).
    return hostname.endsWith('usercontent.goog') || (!hostname.includes('.') && hostname !== 'localhost');
};

interface AppContextType {
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  serviceProvider: ServiceProvider | null;
  isAuthenticated: boolean;
  userProfile: UserProfile | null;
  isUnsupportedDomain: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export const AppContext = createContext<AppContextType>({} as AppContextType);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // FIX: Removed geminiApiKey from settings, as it's handled by environment variables.
  const [settings, setSettings] = useLocalStorage<AppSettings>('app-settings', {
    googleClientId: '',
  });

  const [serviceProvider, setServiceProvider] = useState<ServiceProvider | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isUnsupportedDomain] = useState<boolean>(isUnsupportedHost());

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