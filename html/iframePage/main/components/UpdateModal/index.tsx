import { Modal, Progress, Button, Alert, Steps } from 'antd';
import { useEffect, useRef, useState } from 'react';
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
  /** When true, automatically starts the install flow on mount. Used by the
   *  top-level update tab so the user doesn't need to click Install. */
  autoStart?: boolean;
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

// Each step owns a non-overlapping segment of the global 0-100% progress bar.
const STEP_RANGES: Record<Phase, [number, number]> = {
  idle: [0, 0],
  preparing: [0, 20],
  downloading: [20, 50],
  extracting: [50, 65],
  writing: [65, 95],
  reloading: [95, 100],
  done: [100, 100],
  error: [0, 0],
};

const STEP_LABELS: { key: Phase; title: string }[] = [
  { key: 'preparing', title: 'Preparing' },
  { key: 'downloading', title: 'Downloading' },
  { key: 'extracting', title: 'Extracting' },
  { key: 'writing', title: 'Writing' },
  { key: 'reloading', title: 'Reloading' },
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UpdateModal({
  open,
  downloadUrl,
  remoteVersion,
  onClose,
  autoStart,
}: UpdateModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  // Which step index failed — used to offer a targeted retry instead of
  // restarting the whole flow.
  const [failedStepIndex, setFailedStepIndex] = useState(-1);
  const [retrying, setRetrying] = useState(false);

  // Intermediate artifacts shared between steps. Kept in refs so a retry can
  // resume from the failed step without recomputing earlier work.
  const dirRef = useRef<any>(null);
  const bufferRef = useRef<ArrayBuffer | null>(null);
  const filesRef = useRef<any[]>([]);

  const reset = () => {
    setPhase('idle');
    setProgress(0);
    setStatusText('');
    setError('');
    setFailedStepIndex(-1);
    dirRef.current = null;
    bufferRef.current = null;
    filesRef.current = [];
  };

  const handleClose = () => {
    if (isBusy(phase) || retrying) return;
    reset();
    onClose();
  };

  const setStepProgress = (currentPhase: Phase, subRatio: number) => {
    const [start, end] = STEP_RANGES[currentPhase] || [0, 0];
    const clamped = Math.max(0, Math.min(1, subRatio));
    setProgress(Math.round(start + (end - start) * clamped));
  };

  // Step 1: Resolve and verify the extension folder.
  const runPreparing = async () => {
    setPhase('preparing');
    setStatusText('Resolving extension folder...');
    setStepProgress('preparing', 0.3);
    let dir = dirRef.current || (await getStoredDirHandle());
    if (!dir) {
      setStatusText('Pick the MockKit extension folder...');
      setStepProgress('preparing', 0.5);
      dir = await pickExtensionDir();
      if (!dir) {
        setPhase('idle');
        setStatusText('');
        return false;
      }
    }
    setStepProgress('preparing', 0.6);
    const permitted = await ensureDirPermission(dir);
    if (!permitted) {
      throw new Error('Write permission for the extension folder was denied.');
    }
    setStepProgress('preparing', 0.8);
    const valid = await verifyExtensionDir(dir);
    if (!valid) {
      dir = await pickExtensionDir();
      if (!dir) {
        setPhase('idle');
        setStatusText('');
        return false;
      }
      const revalidated = await verifyExtensionDir(dir);
      if (!revalidated) {
        throw new Error('The picked folder is not the MockKit extension. Please pick the folder that contains manifest.json for this extension.');
      }
    }
    dirRef.current = dir;
    setStepProgress('preparing', 1);
    return true;
  };

  // Step 2: Download the release zip.
  const runDownloading = async () => {
    setPhase('downloading');
    setStatusText(`Downloading v${remoteVersion}...`);
    setStepProgress('downloading', 0);
    const buffer = await downloadWithProgress(downloadUrl, (received, total) => {
      if (total > 0) {
        setStepProgress('downloading', received / total);
        setStatusText(`Downloading · ${formatBytes(received)} / ${formatBytes(total)}`);
      } else {
        setStepProgress('downloading', Math.min(0.99, Math.max(0.05, received / (1024 * 1024 * 5))));
        setStatusText(`Downloading · ${formatBytes(received)}`);
      }
    });
    bufferRef.current = buffer;
    return true;
  };

  // Step 3: Unzip in memory.
  const runExtracting = async () => {
    setPhase('extracting');
    setStatusText('Extracting package...');
    setStepProgress('extracting', 0);
    const files = await unzip(bufferRef.current!);
    filesRef.current = files;
    setStepProgress('extracting', 1);
    return true;
  };

  // Step 4: Write files into the extension folder.
  const runWriting = async () => {
    setPhase('writing');
    const files = filesRef.current;
    setStatusText(`Writing 0 / ${files.length} files...`);
    setStepProgress('writing', 0);
    await writeFilesToDir(dirRef.current, files, (_name, index, total) => {
      setStepProgress('writing', index / total);
      setStatusText(`Writing ${index} / ${total} files...`);
    });
    return true;
  };

  // Step 5: Reload the extension.
  const runReloading = async () => {
    setPhase('reloading');
    setStatusText('Reloading extension...');
    setStepProgress('reloading', 0.5);
    try {
      chrome.runtime?.sendMessage({ type: 'RELOAD_EXTENSION' }, () => {
        // reload() tears down the iframe; callback may never fire.
      });
    } catch (e) {
      // Non-fatal.
    }
    setStepProgress('reloading', 1);
    return true;
  };

  const STEP_RUNNERS = [runPreparing, runDownloading, runExtracting, runWriting, runReloading];

  // Run the full flow, optionally starting from a specific step (used by
  // retry). Steps before `startStep` are assumed to have completed and their
  // artifacts are already in the refs.
  const run = async (startStep = 0) => {
    console.log('[MockKit Update] run() called', { startStep, downloadUrl, remoteVersion });
    setError('');
    setFailedStepIndex(-1);
    if (startStep === 0) {
      setProgress(0);
      dirRef.current = null;
      bufferRef.current = null;
      filesRef.current = [];
    }

    for (let i = startStep; i < STEP_RUNNERS.length; i += 1) {
      console.log('[MockKit Update] running step', i, STEP_LABELS[i].title);
      try {
        const cont = await STEP_RUNNERS[i]();
        console.log('[MockKit Update] step', i, 'result', cont);
        if (cont === false) {
          console.log('[MockKit Update] step cancelled by user');
          return;
        }
      } catch (e: any) {
        console.error('[MockKit Update] step', i, 'failed', e);
        setPhase('error');
        setFailedStepIndex(i);
        setError(e?.message || `${STEP_LABELS[i].title} failed.`);
        return;
      }
    }
    console.log('[MockKit Update] all steps done');
    setPhase('done');
  };

  const handleRetry = () => {
    if (failedStepIndex < 0) return;
    setRetrying(true);
    // Clear the error but keep refs intact so we resume from failedStepIndex.
    setError('');
    setPhase(STEP_LABELS[failedStepIndex].key);
    run(failedStepIndex).finally(() => setRetrying(false));
  };

  // Note: we intentionally do NOT auto-start via useEffect. The File System
  // Access API requires a user gesture, so the user must click Install.

  const busy = isBusy(phase) || retrying;
  const showProgress = phase !== 'idle' && phase !== 'error';
  const currentStepIndex = STEP_LABELS.findIndex((s) => s.key === phase);
  const failedStepLabel = failedStepIndex >= 0 ? STEP_LABELS[failedStepIndex].title : '';

  return (
    <Modal
      open={open}
      title={`Update to ${remoteVersion}`}
      centered
      width={560}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      footer={[
        <Button key="close" onClick={handleClose} disabled={busy}>
          Close
        </Button>,
        phase === 'error' && failedStepIndex >= 0 ? (
          <Button key="retry" type="primary" loading={retrying} onClick={handleRetry}>
            Retry {failedStepLabel}
          </Button>
        ) : (
          <Button
            key="run"
            type="primary"
            loading={busy}
            disabled={phase === 'done' || !downloadUrl}
            onClick={() => run(0)}
          >
            {phase === 'done' ? 'Done' : busy ? 'Working...' : 'Install'}
          </Button>
        ),
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
          action={
            <Button size="small" type="primary" ghost loading={retrying} onClick={handleRetry}>
              Retry
            </Button>
          }
        />
      )}
      {phase === 'done' && (
        <Alert
          type="success"
          message="Update applied. The extension is reloading — reopen the panel if it doesn't reappear."
          showIcon
        />
      )}
      {showProgress && (
        <>
          <Steps
            direction="vertical"
            size="default"
            current={currentStepIndex}
            style={{ marginBottom: 16 }}
            items={STEP_LABELS.map((s, i) => ({
              title: s.title,
              description: `Step ${i + 1} of ${STEP_LABELS.length}`,
              status:
                phase === 'done' || i < currentStepIndex
                  ? 'finish'
                  : i === currentStepIndex
                    ? 'process'
                    : 'wait',
            }))}
          />
          <div style={{ marginBottom: 8, fontSize: 13, color: '#333' }}>
            {currentStepIndex >= 0 && (
              <strong>Step {currentStepIndex + 1}/{STEP_LABELS.length} · {STEP_LABELS[currentStepIndex].title}</strong>
            )}
            {statusText && <div style={{ marginTop: 4, fontSize: 12, color: '#666' }}>{statusText}</div>}
          </div>
          <Progress percent={progress} status={phase === 'error' ? 'exception' : 'active'} />
        </>
      )}
      {phase === 'idle' && (
        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.7 }}>
          Downloads the new package, unzips it over your extension folder, and reloads the extension.
          {!isFsAccessSupported()
            ? '\n\nThis browser lacks the File System Access API — use a recent Chrome.'
            : '\nThe first run asks you to pick the MockKit folder once; later updates are one click.'}
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
