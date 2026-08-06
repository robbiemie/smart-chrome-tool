import { Modal, Tabs, Input, Card, Space, Select, Button, Tooltip } from 'antd';
import React, { ForwardedRef, useImperativeHandle, useRef, useState } from 'react';
import MonacoEditor from '../../../common/MonacoEditor';
import { HEADERS_EXAMPLES, REQUEST_PAYLOAD_EXAMPLES, RESPONSE_EXAMPLES, HTTP_METHOD_MAP, DELAY_PRESETS } from '../../../common/value';
import { logger } from '../../utils/logger';

import './index.css';

export interface ModifyDataModalOnSaveProps {
  groupIndex: number,
  interfaceIndex: number,
  replacementMethod: string,
  replacementUrl: string,
  replacementStatusCode: string,
  delay: string,
  headersEditorValue: string,
  requestPayloadEditorValue: string,
  responseEditorValue:string,
  language: string
}
interface ModifyDataModalProps {
  onSave: (
    { groupIndex, interfaceIndex, replacementMethod, replacementUrl, delay, headersEditorValue,
      requestPayloadEditorValue, responseEditorValue, language } : ModifyDataModalOnSaveProps
  ) => void;
}
export interface OpenModalProps {
  groupIndex: number,
  interfaceIndex: number,
  activeTab: string;
  request: string;
  replacementMethod: string;
  replacementUrl: string;
  replacementStatusCode: string;
  delay: string;
  headersText: string;
  requestPayloadText: string;
  responseLanguage: string;
  responseText: string;
}

const Wrapper = React.memo((props: { children: any }) => {
  return <div style={{ height: 'calc(100vh - 260px)', overflow: 'auto' }}>
    {props.children}
  </div>;
});

const ModifyDataModal = (
  props: ModifyDataModalProps,
  ref: ForwardedRef<{ openModal: (props: OpenModalProps)=>void }>
) => {
  const monacoEditorHeadersRef = useRef<any>({});
  const monacoEditorRequestPayloadRef = useRef<any>({});
  const monacoEditorResponseRef = useRef<any>({});

  const { onSave = () => {} } = props;
  const [visible, setVisible] = useState(false);
  const [groupIndex, setGroupIndex] = useState(0);
  const [interfaceIndex, setInterfaceIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('Response');
  const [request, setRequest] = useState(''); // matched url
  const [replacementMethod, setReplacementMethod] = useState('');
  const [replacementUrl, setReplacementUrl] = useState('');
  const [replacementStatusCode, setReplacementStatusCode] = useState('200');
  const [delay, setDelay] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [requestPayloadText, setRequestPayloadText] = useState('');
  const [responseLanguage, setResponseLanguage] = useState('json');
  const [responseText, setResponseText] = useState('');

  useImperativeHandle(ref, () => ({
    openModal
  }));

  const openModal = (
    { groupIndex, interfaceIndex, activeTab, request, replacementMethod, replacementUrl, replacementStatusCode, delay,
      headersText, requestPayloadText, responseLanguage, responseText } : OpenModalProps
  ) => {
    setGroupIndex(groupIndex);
    setInterfaceIndex(interfaceIndex);
    setActiveTab(activeTab);
    setRequest(request);
    // modify ⬇️
    setReplacementMethod(replacementMethod);
    setReplacementUrl(replacementUrl);
    setReplacementStatusCode(replacementStatusCode);
    setDelay(delay ?? '');
    setHeadersText(headersText);
    setRequestPayloadText(requestPayloadText);
    setResponseLanguage(responseLanguage);
    setResponseText(responseText);
    setVisible(true);
  };

  const handleOk = () => {
    // Read each Monaco editor's current value defensively. When the tab/window
    // has been in the background for a while the editor instance can end up in
    // a half-disposed state where getValue() throws; without this guard the
    // thrown error is swallowed by antd's Modal onOk path, so onSave never
    // runs and the modal appears stuck (Save "does nothing"). Returning
    // undefined here lets onInterfaceListSave skip that field (it guards on
    // !== undefined) instead of clobbering it, while still allowing the modal
    // to close and the other fields to persist.
    const safeGetValue = (refObj: any): string | undefined => {
      try {
        const inst = refObj?.editorInstance;
        if (inst && typeof inst.getValue === 'function') {
          return inst.getValue();
        }
      } catch (e) {
        logger.warn('[ModifyDataModal] editor read failed, skipping field', e);
      }
      return undefined;
    };
    const safeGetLanguage = (refObj: any): string | undefined => {
      try {
        const inst = refObj?.editorInstance;
        const model = inst?.getModel?.();
        return model?.getLanguageId();
      } catch (e) {
        logger.warn('[ModifyDataModal] editor language read failed', e);
      }
      return undefined;
    };

    const headersEditorValue = safeGetValue(monacoEditorHeadersRef.current);
    const requestPayloadEditorValue = safeGetValue(monacoEditorRequestPayloadRef.current);
    const responseEditorValue = safeGetValue(monacoEditorResponseRef.current);
    const language = safeGetLanguage(monacoEditorResponseRef.current);
    onSave({ groupIndex, interfaceIndex, replacementMethod, replacementUrl, replacementStatusCode, delay,
      headersEditorValue, requestPayloadEditorValue, responseEditorValue, language });
    setVisible(false);
  };

  return <>
    <Modal
      centered
      title={<span style={{ fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>Matched URL：{request}</span>}
      width={'98%'}
      open={visible}
      onOk={handleOk}
      onCancel={() => setVisible(false)}
      okText="Save"
      cancelText="Cancel"
      bodyStyle={{
        padding: 12
      }}
    >
      <Tabs
        defaultActiveKey={activeTab}
        activeKey={activeTab}
        size="small"
        onChange={(v) => setActiveTab(v)}
        items={[
          {
            label: `Response`,
            key: 'Response',
            children: <Wrapper>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
                  <div style={{ width: 100 }}>Status Code</div>
                  <Input
                    value={replacementStatusCode}
                    maxLength={3}
                    placeholder="e.g. 200"
                    onChange={(e) => setReplacementStatusCode(e.target.value.replace(/\D/g, ''))}
                    style={{ width: 90 }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', flex: '1 1 auto' }}>
                  <div style={{ width: 60 }}>Delay</div>
                  <Tooltip title='Response latency in ms. Supports a fixed value (e.g. "500") or a random range (e.g. "100-500"). Leave empty for no delay.'>
                    <Input
                      value={delay}
                      placeholder='e.g. 500 or 100-500'
                      onChange={(e) => setDelay(e.target.value)}
                      style={{ width: 160 }}
                    />
                  </Tooltip>
                  <Space size={4} style={{ marginLeft: 8 }}>
                    {DELAY_PRESETS.map((preset) => (
                      <Button
                        key={preset.value}
                        size="small"
                        type={delay === preset.value ? 'primary' : 'default'}
                        onClick={() => setDelay(preset.value)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                    {delay ? (
                      <Button size="small" type="text" onClick={() => setDelay('')}>clear</Button>
                    ) : null}
                  </Space>
                </div>
              </div>
              <MonacoEditor
                ref={monacoEditorResponseRef}
                language={responseLanguage}
                text={responseText}
                examples={RESPONSE_EXAMPLES}
              />
            </Wrapper>,
          },
          {
            label: `Request`,
            key: 'Request',
            children: <Wrapper>
              <Space direction="vertical" size="small" style={{ display: 'flex' }}>
                <Card title="Replacement Request URL" type="inner" size="small">
                  <Space.Compact style={{ width: '100%' }}>
                    <Select
                      dropdownMatchSelectWidth={false}
                      value={replacementMethod}
                      onChange={(value) => setReplacementMethod(value)}
                    >
                      <Select.Option value="">*(same)</Select.Option>
                      { HTTP_METHOD_MAP.map((method) => <Select.Option key={method} value={method}>{method}</Select.Option>) }
                    </Select>
                    <Input
                      value={replacementUrl}
                      placeholder="Please enter the URL you want to replace with."
                      onChange={(e) => setReplacementUrl(e.target.value)}
                    />
                  </Space.Compact>
                </Card>
                <Card title="Replacement Request Headers" type="inner" size="small">
                  <MonacoEditor
                    ref={monacoEditorHeadersRef}
                    language={'json'}
                    languageSelectOptions={['json']}
                    text={headersText}
                    editorHeight={'calc(100vh - 300px - 168px)'}
                    examples={HEADERS_EXAMPLES}
                  />
                </Card>
              </Space>
            </Wrapper>,
          },
          {
            label: `Request Payload`,
            key: 'RequestPayload',
            children: <MonacoEditor
              ref={monacoEditorRequestPayloadRef}
              language={'javascript'}
              languageSelectOptions={['javascript']}
              text={requestPayloadText}
              examples={REQUEST_PAYLOAD_EXAMPLES}
            />,
          },
        ]}
      />
    </Modal>
  </>;
};

export default React.memo(React.forwardRef(ModifyDataModal));
