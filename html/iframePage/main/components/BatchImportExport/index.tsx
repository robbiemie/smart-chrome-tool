import React, { useMemo, useState } from 'react';
import { Modal, Upload, Button, Tag, notification, Divider, UploadProps } from 'antd';
import {
  DownloadOutlined,
  InboxOutlined,
  FileOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { exportJSON } from '../../utils/exportJson';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import { AjaxGroup } from '../../types/registry';
import { defaultAjaxDataList } from '../../../common/value';
import './index.css';

interface BatchImportExportProps {
  visible: boolean;
  onClose: () => void;
  ajaxDataList: AjaxGroup[];
  selectedGroup: AjaxGroup | null;
  onBatchImport: (groups: AjaxGroup[], replace?: boolean) => void;
}

interface ParsedImportFile {
  fileName: string;
  groups: AjaxGroup[];
  status: 'ok' | 'error';
  message: string;
}

const readFileAsText = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(file);
  });

// Normalize arbitrary parsed JSON into a list of rule groups. Accepts either
// an array of groups or a single group object; anything that does not look
// like a valid rule group is rejected so bad files surface in the preview
// instead of silently corrupting the workspace.
const normalizeToGroups = (raw: any): AjaxGroup[] => {
  if (Array.isArray(raw)) {
    return raw.filter(
      (item) => item && typeof item === 'object' && Array.isArray(item.interfaceList)
    );
  }
  if (raw && typeof raw === 'object' && Array.isArray(raw.interfaceList)) {
    return [raw];
  }
  return [];
};

const BatchImportExport = ({
  visible,
  onClose,
  ajaxDataList,
  selectedGroup,
  onBatchImport,
}: BatchImportExportProps) => {
  const [parsedFiles, setParsedFiles] = useState<ParsedImportFile[]>([]);

  const totalRules = useMemo(
    () => ajaxDataList.reduce((sum, group) => sum + (group.interfaceList?.length || 0), 0),
    [ajaxDataList]
  );

  // Flatten every successfully parsed file into the import payload so the
  // primary action button can report an accurate group count up front.
  const readyGroups = parsedFiles
    .filter((entry) => entry.status === 'ok')
    .reduce<AjaxGroup[]>((acc, entry) => acc.concat(entry.groups), []);
  const readyGroupCount = readyGroups.length;
  const hasReadyGroups = readyGroupCount > 0;
  const hasErrorFiles = parsedFiles.some((entry) => entry.status === 'error');

  const reset = () => setParsedFiles([]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleExportAll = () => {
    if (ajaxDataList.length === 0) {
      notification.warning({
        message: 'Nothing to export',
        description: 'There are no rule groups yet.',
      });
      return;
    }
    exportJSON('AjaxInterceptorRules-all', ajaxDataList);
  };

  const handleExportCurrentGroup = () => {
    if (!selectedGroup) {
      notification.warning({
        message: 'No group selected',
        description: 'Select a group in the workbench first.',
      });
      return;
    }
    // Sanitize the group name for a filesystem-safe export filename.
    const groupName = (selectedGroup.summaryText || 'group').replace(/[^a-zA-Z0-9-_]+/g, '_');
    exportJSON(`AjaxInterceptorRules-${groupName}`, [selectedGroup]);
  };

  const handleDownloadTemplate = () => {
    exportJSON('AjaxInterceptorTemplate', defaultAjaxDataList);
  };

  const handleFiles = async (files: File[]) => {
    const results: ParsedImportFile[] = [];
    for (const file of files) {
      try {
        const text = await readFileAsText(file);
        const parsed = JSON.parse(text);
        const groups = normalizeToGroups(parsed);
        if (groups.length === 0) {
          results.push({
            fileName: file.name,
            groups: [],
            status: 'error',
            message: 'No valid rule groups found',
          });
        } else {
          results.push({
            fileName: file.name,
            groups,
            status: 'ok',
            message: `${groups.length} group(s) ready`,
          });
        }
      } catch (error) {
        results.push({
          fileName: file.name,
          groups: [],
          status: 'error',
          message: error instanceof Error ? error.message : 'Invalid JSON',
        });
      }
    }
    setParsedFiles((prev) => [...prev, ...results]);
  };

  const uploadProps: UploadProps = {
    multiple: true,
    showUploadList: false,
    accept: '.json,application/json',
    beforeUpload: (file) => {
      const isJson = file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
      if (!isJson) {
        notification.error({ message: `"${file.name}" is not a JSON file` });
        return false;
      }
      // Returning false stops antd's own upload pipeline; we read the File
      // ourselves so we can validate and preview before committing.
      handleFiles([file as unknown as File]);
      return false;
    },
  };

  // Bulk imports (more than one group) fully REPLACE the workspace, while a
  // single-group import is appended so it never wipes existing rules. The
  // replace path is gated by a confirmation prompt so the destructive action
  // is never triggered by accident.
  const isBulkImport = readyGroupCount > 1;
  const hasExistingGroups = ajaxDataList.length > 0;

  const commitImport = (replace: boolean) => {
    onBatchImport(readyGroups, replace);
    notification.success({
      message: 'Import complete',
      description: replace
        ? `${readyGroupCount} group(s) replaced the workspace.`
        : `${readyGroupCount} group(s) appended to the workbench.`,
    });
    reset();
    onClose();
  };

  const handleImport = () => {
    if (!hasReadyGroups) return;
    // Only bulk imports that would overwrite existing content need a prompt.
    if (isBulkImport && hasExistingGroups) {
      Modal.confirm({
        title: 'Replace all groups?',
        content: `This will discard all ${ajaxDataList.length} existing group(s) and load ${readyGroupCount} imported group(s) instead. This cannot be undone.`,
        okText: 'Replace',
        okType: 'danger',
        cancelText: 'Cancel',
        onOk: () => commitImport(true),
      });
      return;
    }
    commitImport(isBulkImport);
  };

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      width={560}
      footer={null}
      title="Import / Export Rules"
      destroyOnClose
    >
      <div className="batch-io">
        <section className="batch-io__section">
          <div className="batch-io__section-head">
            <strong>Export</strong>
            <span className="batch-io__hint">
              {ajaxDataList.length} groups · {totalRules} rules in workspace
            </span>
          </div>
          <div className="batch-io__row">
            <Button icon={<DownloadOutlined />} onClick={handleExportAll} block>
              Export all rules
            </Button>
            <Button
              icon={<ExportOutlined />}
              onClick={handleExportCurrentGroup}
              block
              disabled={!selectedGroup}
            >
              Export current group
            </Button>
          </div>
          <Button
            type="link"
            size="small"
            onClick={handleDownloadTemplate}
            className="batch-io__template-link"
          >
            Download a JSON template
          </Button>
        </section>

        <Divider />

        <section className="batch-io__section">
          <div className="batch-io__section-head">
            <strong>Import</strong>
            <span className="batch-io__hint">
              Single-group files are appended. Multiple groups replace the workspace.
            </span>
          </div>
          <Upload.Dragger {...uploadProps} className="batch-io__dragger">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Click or drag JSON files here</p>
            <p className="ant-upload-hint">Supports selecting multiple files at once</p>
          </Upload.Dragger>

          {parsedFiles.length > 0 && (
            <ul className="batch-io__file-list">
              {parsedFiles.map((entry, index) => (
                <li key={`${entry.fileName}-${index}`} className="batch-io__file-item">
                  <span className="batch-io__file-name">
                    <FileOutlined />
                    {entry.fileName}
                  </span>
                  <Tag
                    color={entry.status === 'ok' ? 'green' : 'red'}
                    icon={entry.status === 'ok' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                  >
                    {entry.message}
                  </Tag>
                </li>
              ))}
            </ul>
          )}

          {hasErrorFiles && (
            <div className="batch-io__warn">
              Some files were skipped. Fix them and re-add, or clear the list before importing.
            </div>
          )}

          <div className="batch-io__actions">
            <Button onClick={reset} disabled={parsedFiles.length === 0}>
              Clear
            </Button>
            <Button type="primary" onClick={handleImport} disabled={!hasReadyGroups} danger={isBulkImport && hasExistingGroups}>
              {hasReadyGroups
                ? isBulkImport && hasExistingGroups
                  ? `Replace all with ${readyGroupCount} group(s)`
                  : `Import ${readyGroupCount} group(s)`
                : 'Import'}
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
};

export default withErrorBoundary(BatchImportExport);
