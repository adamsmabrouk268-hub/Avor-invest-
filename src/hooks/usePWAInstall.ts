import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined' && (window as any).__avorDeferredPWAEvent) {
      return (window as any).__avorDeferredPWAEvent as BeforeInstallPromptEvent;
    }
    return null;
  });
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    // Detect standalone mode (already installed as a standalone PWA)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    // Detect if running inside an iframe preview
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    if ((window as any).__avorDeferredPWAEvent) {
      setDeferredPrompt((window as any).__avorDeferredPWAEvent);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).__avorDeferredPWAEvent = e;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleGlobalInstallable = () => {
      if ((window as any).__avorDeferredPWAEvent) {
        setDeferredPrompt((window as any).__avorDeferredPWAEvent);
      }
    };

    const handleAppInstalled = () => {
      (window as any).__avorDeferredPWAEvent = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('avor-pwa-installable', handleGlobalInstallable);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('avor-pwa-installed', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('avor-pwa-installable', handleGlobalInstallable);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('avor-pwa-installed', handleAppInstalled);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    const promptEvent = deferredPrompt || (window as any).__avorDeferredPWAEvent;
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      (window as any).__avorDeferredPWAEvent = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!(deferredPrompt || (typeof window !== 'undefined' && (window as any).__avorDeferredPWAEvent)),
    isInstalled,
    isIOS,
    isInIframe,
    install,
  };
}
