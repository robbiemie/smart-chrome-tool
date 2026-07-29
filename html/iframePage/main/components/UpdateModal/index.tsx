import { Modal, Progress, Button, Alert } from 'antd';
import { useState } from 'react';
import {
  downloadWithProgress,
  unzip,
  writeFilesToDir,
  getStoredDirHandle,
  pickExtensionDir,
  ensureDirPermission,
  verifyExtensionDir,
  isFsAccessSupported,
} from '../../utils/selfUpdate';

export interface UpdateModalProps {
  open: boolean;
  downloadUrl: string;
  remoteVersion: string;
  onClose: () => void;
}

type Phase =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'extracting'
  | 'writing'
  | 'reloading'
  | 'done'
  | 'error';

export default function UpdateModal({
  open,
  downloadUrl,
  remoteVersion,
  onClose,
}: UpdateModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setPhase('idle');
    setProgress(0);
    setStatusText('');
    setError('');
  };

  const handleClose = () => {
    if (isBusy(phase)) return;
    reset();
    onClose();
  };

  const run = async () => {
    setError('');
    setProgress(0);
    try {
      // 1. Resolve and verify the extension folder. First run prompts the
      // user to pick it; the handle is cached for later updates.
      setPhase('preparing');
      setStatusText('Resolving extension folder...');
      let dir = await getStoredDirHandle();
      if (!dir) {
        setStatusText('Pick the smart-chrome-tool extension folder...');
        dir = await pickExtensionDir();
        if (!dir) {
          // User cancelled the picker — return to idle without error.
          setPhase('idle');
          setStatusText('');
          return;
        }
      }
      const permitted = await ensureDirPermission(dir);
      if (!permitted) {
        throw new Error('Write permission for the extension folder was denied.');
      }
      const valid = await verifyExtensionDir(dir);
      if (!valid) {
        // Forget the wrong handle so the next attempt re-prompts.
        dir = await pickExtensionDir();
        if (!dir) {
          setPhase('idle');
          setStatusText('');
          return;
        }
        const revalidated = await verifyExtensionDir(dir);
        if (!revalidated) {
          throw new Error('The picked folder is not the smart-chrome-tool extension. Please pick the folder that contains manifest.json for this extension.');
        }
      }

      // 2. Download the release zip with a live progress bar.
      setPhase('downloading');
      setStatusText(`Downloading v${remoteVersion}...`);
      const buffer = await downloadWithProgress(downloadUrl, (received, total) => {
        if (total > 0) {
          setProgress(Math.min(100, Math.round((received / total) * 100)));
        } else {
          // Unknown length — show bytes received as a sanity indicator.
          setProgress(Math.min(99, Math.max(5, Math.round(received / 1024))));
        }
      });

      // 3. Unzip the archive in memory.
      setPhase('extracting');
      setProgress(100);
      setStatusText('Extracting package...');
      const files = await unzip(buffer);

      // 4. Overwrite the extension folder with the new files.
      setPhase('writing');
      setStatusText(`Writing 0 / ${files.length} files...`);
      await writeFilesToDir(dir, files, (_name, index, total) => {
        setProgress(Math.round((index / total) * 100));
        setStatusText(`Writing ${index} / ${total} files...`);
      });

      // 5. Ask the service worker to reload the extension so the new code
      // takes effect immediately. The iframe is torn down during reload.
      setPhase('reloading');
      setProgress(100);
      setStatusText('Reloading extension...');
      try {
        chrome.runtime?.sendMessage({ type: 'RELOAD_EXTENSION' }, () => {
          // reload() will tear down this iframe; any callback may never fire.
        });
      } catch (e) {
        // Non-fatal: the reload message is best-effort.
      }
      setPhase('done');
    } catch (e: any) {
      setPhase('error');
      setError(e?.message || 'Update failed.');
    }
  };

  const busy = isBusy(phase);
  const showDownloadProgress = phase === 'downloading';
  const showWriteProgress = phase === 'writing';

  return (
    <Modal
      open={open}
      title={`Update to v${remoteVersion}`}
      centered
      width={460}
      footer={[
        <Button key="close" onClick={handleClose} disabled={busy}>
          Close
        </Button>,
        <Button
          key="run"
          type="primary"
          loading={busy}
          disabled={phase === 'done' || !downloadUrl}
          onClick={run}
        >
          {phase === 'done' ? 'Done' : busy ? 'Working...' : 'Install'}
        </Button>,
      ]}
      onCancel={handleClose}
      closable={!busy}
      maskClosable={!busy}
      destroyOnClose
    >
      {phase === 'error' && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 12 }}
        />
      )}
      {phase === 'done' && (
        <Alert
          type="success"
          message="Update applied. The extension is reloading — reopen the panel if it doesn't reappear."
          showIcon
        />
      )}
      {(showDownloadProgress || showWriteProgress) && (
        <>
          <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>
            {statusText}
          </div>
          <Progress percent={progress} status="active" size="small" />
        </>
      )}
      {(phase === 'preparing' || phase === 'extracting' || phase === 'reloading') && (
        <div style={{ fontSize: 12, color: '#666' }}>{statusText}</div>
      )}
      {phase === 'idle' && (
        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.7 }}>
          Downloads the new package, unzips it over your extension folder, and reloads the extension.
          {!isFsAccessSupported()
            ? '\n\nThis browser lacks the File System Access API — use a recent Chrome.'
            : '\nThe first run asks you to pick the smart-chrome-tool folder once; later updates are one click.'}
        </div>
      )}
    </Modal>
  );
}

function isBusy(phase: Phase): boolean {
  return (
    phase === 'preparing' ||
    phase === 'downloading' ||
    phase === 'extracting' ||
    phase === 'writing' ||
    phase === 'reloading'
  );
}
