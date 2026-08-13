import React from 'react';
import { Button, Input, Modal, Radio, Space, Switch } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { HeaderMatchMode, HeaderPairItem } from '../../hooks/usePageHeaders';

interface PageHeadersModalProps {
  visible: boolean;
  enabled: boolean;
  matchMode: HeaderMatchMode;
  pageOrigin: string;
  headerPairs: HeaderPairItem[];
  setVisible: (v: boolean) => void;
  setEnabled: (v: boolean) => void;
  setMatchMode: (v: HeaderMatchMode) => void;
  addHeaderPair: () => void;
  removeHeaderPair: (id: string) => void;
  updateHeaderPair: (id: string, field: 'keyText' | 'valueText', value: string) => void;
  onSave: (nextPairs: HeaderPairItem[], nextEnabled: boolean, nextMatchMode: HeaderMatchMode) => Promise<boolean>;
}

const PageHeadersModal = (props: PageHeadersModalProps) => {
  const {
    visible,
    enabled,
    matchMode,
    pageOrigin,
    headerPairs,
    setVisible,
    setEnabled,
    setMatchMode,
    addHeaderPair,
    removeHeaderPair,
    updateHeaderPair,
    onSave,
  } = props;
  return (
    <Modal
      centered
      width={880}
      open={visible}
      title={`Current Page Headers${pageOrigin ? ` (${pageOrigin})` : ''}`}
      okText="Save"
      cancelText="Cancel"
      onCancel={() => setVisible(false)}
      onOk={async () => {
        await onSave(headerPairs, enabled, matchMode);
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <Switch
          checked={enabled}
          checkedChildren="Enabled"
          unCheckedChildren="Disabled"
          onChange={(v) => setEnabled(v)}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <Radio.Group
          value={matchMode}
          onChange={(e) => setMatchMode(e.target.value as HeaderMatchMode)}
          optionType="button"
          buttonStyle="solid"
          size="small"
        >
          <Radio.Button value="all">All requests</Radio.Button>
          <Radio.Button value="sameOrigin">Same-origin only</Radio.Button>
        </Radio.Group>
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          All requests: add headers to every request initiated by this page (cross-origin included). Same-origin only: only requests targeting this page&apos;s host.
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
        Add key/value pairs below. Empty keys are ignored when saving.
      </div>
      <div style={{ maxHeight: 'calc(100vh - 400px)', overflowY: 'auto', paddingRight: 4 }}>
        {headerPairs.map((item) => (
          <Space key={item.id} style={{ display: 'flex', marginBottom: 8 }} align="start">
            <Input
              placeholder="Header Key"
              value={item.keyText}
              onChange={(e) => updateHeaderPair(item.id, 'keyText', e.target.value)}
              style={{ width: 260 }}
            />
            <Input
              placeholder="Header Value"
              value={item.valueText}
              onChange={(e) => updateHeaderPair(item.id, 'valueText', e.target.value)}
              onPressEnter={addHeaderPair}
              style={{ width: 460 }}
            />
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeHeaderPair(item.id)}
            />
          </Space>
        ))}
      </div>
      <Space>
        <Button type="dashed" icon={<PlusOutlined />} onClick={addHeaderPair}>
          Add Header
        </Button>
        <Button onClick={() => addHeaderPair()}>
          Enter to Add Next
        </Button>
      </Space>
    </Modal>
  );
};

export default PageHeadersModal;
