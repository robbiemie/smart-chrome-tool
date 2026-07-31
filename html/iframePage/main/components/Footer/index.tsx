
import React, { useEffect, useState } from 'react';
import './index.css';
import { logger } from '../../utils/logger';

type UpdateInfo = {
  hasUpdate?: boolean;
  remoteVersion?: string;
  downloadUrl?: string;
  releaseUrl?: string;
  localVersion?: string;
  error?: string;
} | null;

// Detect whether we're running inside the Chrome extension context. When
// debugging via `npm start` (localhost), chrome.runtime is absent and the
// service worker can't be reached — we fall back to a mock so the full UI
// flow (check → red dot → modal → progress) can be exercised in the browser.
const isExtensionContext = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

function Footer() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!isExtensionContext || !chrome.storage?.local) return;
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
    logger.log('[MockKit Update] Footer handleCheck — sending CHECK_UPDATE');

    if (!isExtensionContext) {
      // Dev mode: simulate a successful check that finds a newer version.
      // The downloadUrl points to a real GitHub release zip so the download
      // step can also be tested end-to-end.
      const mockResult: UpdateInfo = {
        hasUpdate: true,
        remoteVersion: 'v0.0.22',
        localVersion: '0.0.1',
        downloadUrl: 'https://github.com/robbiemie/smart-chrome-tool/releases/download/v0.0.22/smart-chrome-tool-v0.0.22.zip',
        releaseUrl: 'https://github.com/robbiemie/smart-chrome-tool/releases/tag/v0.0.22',
      };
      setTimeout(() => {
        logger.log('[MockKit Update] (dev) CHECK_UPDATE mock response', mockResult);
        setUpdateInfo(mockResult);
        setChecking(false);
      }, 800);
      return;
    }

    chrome.runtime?.sendMessage({ type: 'CHECK_UPDATE', force: true }, (response) => {
      setChecking(false);
      logger.log('[MockKit Update] CHECK_UPDATE response', response, chrome.runtime.lastError);
      if (chrome.runtime.lastError || !response) return;
      setUpdateInfo(response);
    });
  };

  const handleInstall = () => {
    logger.log('[MockKit Update] Footer handleInstall called', { updateInfo, hasDownloadUrl: Boolean(updateInfo?.downloadUrl) });
    if (!updateInfo?.downloadUrl) {
      logger.warn('[MockKit Update] no downloadUrl, abort');
      return;
    }

    if (!isExtensionContext) {
      // Dev mode (localhost): first-party context, File System Access API
      // and cross-origin fetch work directly in the iframe. Just post to
      // App.tsx to open the UpdateModal inline.
      window.postMessage(
        {
          type: 'AJAX_TOOLS_APPLY_UPDATE',
          downloadUrl: updateInfo.downloadUrl,
          remoteVersion: updateInfo.remoteVersion,
        },
        '*'
      );
      logger.log('[MockKit Update] (dev) APPLY_UPDATE posted to window');
      return;
    }

    // Extension: open a top-level extension tab for the update flow. The
    // File System Access API (showDirectoryPicker) and cross-origin fetch
    // to GitHub are both blocked in third-party iframes, so we must run
    // the download/unzip/write steps in a first-party extension page.
    const pageUrl = chrome.runtime.getURL('html/iframePage/dist/index.html');
    const hash = `#update=1&downloadUrl=${encodeURIComponent(updateInfo.downloadUrl)}&remoteVersion=${encodeURIComponent(updateInfo.remoteVersion || '')}`;
    window.open(`${pageUrl}${hash}`, '_blank');
    logger.log('[MockKit Update] opened update tab', `${pageUrl}${hash}`);
  };

  const currentVersion = isExtensionContext
    ? chrome.runtime.getManifest()?.version
    : '0.0.1 (dev)';

  return (
    <footer className="ajax-tools-iframe-footer">
      <span className="ajax-tools-iframe-footer__version">v{currentVersion}</span>
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
      {!isExtensionContext && (
        <span style={{ fontSize: 10, color: '#999', marginLeft: 4 }}>(dev)</span>
      )}
    </footer>
  );
}

export default Footer;
