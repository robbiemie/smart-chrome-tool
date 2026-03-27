import React from 'react';
import { Button, Input, Modal, Space, Switch } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { HeaderPairItem } from '../../hooks/usePageHeaders';

interface PageHeadersModalProps {
  visible: boolean;
  enabled: boolean;
  pageOrigin: string;
  headerPairs: HeaderPairItem[];
  setVisible: (v: boolean) => void;
  setEnabled: (v: boolean) => void;
  addHeaderPair: () => void;
  removeHeaderPair: (id: string) => void;
  updateHeaderPair: (id: string, field: 'keyText' | 'valueText', value: string) => void;
  onSave: (nextPairs: HeaderPairItem[], nextEnabled: boolean) => Promise<boolean>;
}

const PageHeadersModal = (props: PageHeadersModalProps) => {
  const { visible, enabled, pageOrigin, headerPairs, setVisible, setEnabled, addHeaderPair, removeHeaderPair, updateHeaderPair, onSave } = props;
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
        await onSave(headerPairs, enabled);
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
      <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
        Add key/value pairs below. Empty keys are ignored when saving.
      </div>
      <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', paddingRight: 4 }}>
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
