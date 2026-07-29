
import React, { useEffect, useState } from 'react';
import './index.css';

type UpdateInfo = {
  hasUpdate?: boolean;
  remoteVersion?: string;
  downloadUrl?: string;
  releaseUrl?: string;
  localVersion?: string;
  error?: string;
} | null;

function Footer() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>(null);
  const [checking, setChecking] = useState(false);

  // Hydrate from the cached result the service writer stores, then keep in
  // sync when the background script writes a fresh check.
  useEffect(() => {
    if (!chrome.storage?.local) return;
    chrome.storage.local.get(['ajaxToolsUpdateAvailable'], (result) => {
      setUpdateInfo(result?.ajaxToolsUpdateAvailable || null);
    });
    const handler = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.ajaxToolsUpdateAvailable) {
        setUpdateInfo(changes.ajaxToolsUpdateAvailable.newValue || null);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  const hasUpdate = Boolean(updateInfo?.hasUpdate);

  const handleCheck = () => {
    if (checking) return;
    setChecking(true);
    chrome.runtime?.sendMessage({ type: 'CHECK_UPDATE', force: true }, (response) => {
      setChecking(false);
      if (chrome.runtime.lastError || !response) return;
      // The storage listener will update updateInfo; this is a belt-and-suspenders.
      setUpdateInfo(response);
    });
  };

  const handleInstall = () => {
    if (!updateInfo?.downloadUrl) return;
    window.parent?.postMessage(
      {
        type: 'AJAX_TOOLS_APPLY_UPDATE',
        downloadUrl: updateInfo.downloadUrl,
        remoteVersion: updateInfo.remoteVersion,
      },
      '*'
    );
  };

  return (
    <footer className="ajax-tools-iframe-footer">
      <a
        className="ajax-tools-iframe-footer__link"
        href="https://github.com/robbiemie/smart-chrome-tool/releases"
        target="_blank"
        rel="noreferrer"
      >
        Releases
      </a>
      <span className="ajax-tools-iframe-footer__divider">·</span>
      {hasUpdate ? (
        <button
          type="button"
          className="ajax-tools-iframe-footer__update ajax-tools-iframe-footer__update--available"
          onClick={handleInstall}
          title={`New version ${updateInfo?.remoteVersion} available. Click to install.`}
        >
          <span className="ajax-tools-iframe-footer__dot" />
          Update
        </button>
      ) : (
        <button
          type="button"
          className="ajax-tools-iframe-footer__update"
          onClick={handleCheck}
          disabled={checking}
          title={
            updateInfo?.error
              ? `Check failed: ${updateInfo.error}`
              : updateInfo?.localVersion
                ? `You're on v${updateInfo.localVersion}. Click to check for updates.`
                : 'Check for updates'
          }
        >
          {checking ? 'Checking...' : 'Check Update'}
        </button>
      )}
    </footer>
  );
}

export default Footer;
