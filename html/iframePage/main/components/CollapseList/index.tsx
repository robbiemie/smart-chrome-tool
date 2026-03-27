import React from 'react';
import { Button, Collapse, Input, Select, Space } from 'antd';
import { PlusOutlined, FormOutlined } from '@ant-design/icons';
import { AjaxDataListObject, DefaultInterfaceObject, HTTP_METHOD_MAP } from '../../../common/value';
import PanelExtra from '../PanelExtra';
import TextArea from 'antd/lib/input/TextArea';

import './index.css';

const { Panel } = Collapse;

interface ICollapseListProps {
  fold: boolean;
  index: number;
  ajaxDataList: AjaxDataListObject[];
  interfaceList: DefaultInterfaceObject[];
  modifyDataModalRef: any;
  collapseActiveKeys: string | number | (string | number)[]
  onInterfaceMove: (groupIndex: number, interfaceIndex: number, placement: string) => void
  onCollapseChange: (index: number, keys: string | string[]) => void
  onInterfaceListAdd: (groupIndex: number) => void;
  onInterfaceListDelete: (groupIndex: number, key: string) => void
  onInterfaceListChange:(groupIndex: number, interfaceIndex: number, key: string, value: string | boolean) => void
}

export const CollapseList = ({ fold, index, ajaxDataList, interfaceList, modifyDataModalRef, collapseActiveKeys, onInterfaceMove, onInterfaceListAdd, onCollapseChange, onInterfaceListDelete, onInterfaceListChange }:ICollapseListProps) => {
  if(fold) return null;
  return (

    (<>
      <Collapse
        className="ajax-tools-iframe-collapse"
        defaultActiveKey={['1']}
        activeKey={collapseActiveKeys}
        onChange={(keys) => onCollapseChange(index, keys)}
        style={{ borderRadius: 0 }}
      >
        {
          interfaceList.map((v:any, i:number) => {
            return <Panel
              key={v.key}
              header={
                <div onClick={e => e.stopPropagation()}>
                  <div style={{
                    display: 'inline-grid',
                    width: 'calc(100vw - 160px)'
                  }}>
                    <Input
                      value={v.request}
                      onChange={(e) => onInterfaceListChange(index, i, 'request', e.target.value)}
                      placeholder="Please enter the matching interface"
                      size="small"
                      addonBefore={
                        <Space.Compact>
                          <Select
                            value={v.matchType}
                            onChange={(value) => onInterfaceListChange(index, i, 'matchType', value)}
                          >
                            <Select.Option value="normal">Normal</Select.Option>
                            <Select.Option value="regex">Regex</Select.Option>
                          </Select>
                          <Select
                            dropdownMatchSelectWidth={false}
                            value={v.matchMethod}
                            onChange={(value) => onInterfaceListChange(index, i, 'matchMethod', value)}
                          >
                            <Select.Option value="">*(any)</Select.Option>
                            { HTTP_METHOD_MAP.map((method) => <Select.Option key={method} value={method}>{method}</Select.Option>) }
                          </Select>
                        </Space.Compact>
                      }
                    />
                    <Input
                      value={v.requestDes}
                      onChange={(e) => onInterfaceListChange(index, i, 'requestDes', e.target.value)}
                      placeholder="Remark（Editable）"
                      size="small"
                      className="ajax-tools-iframe-request-des-input"
                    />
                  </div>
                </div>
              }
              extra={<PanelExtra
                groupIndex={index}
                interfaceIndex={i}
                ajaxDataList={ajaxDataList}
                modifyDataModalRef={modifyDataModalRef}
                onInterfaceMove={onInterfaceMove}
                onInterfaceListChange={onInterfaceListChange}
                onInterfaceListDelete={onInterfaceListDelete}
                v={v}/>}
            >
              <div style={{ position: 'relative' }}>
                <TextArea
                  rows={4}
                  value={v.responseText}
                  onChange={(e) => onInterfaceListChange(index, i, 'responseText', e.target.value)}
                  placeholder='Response  e.g. { "status": 200, "response": "OK" }'
                />
                <FormOutlined
                  title="Edit"
                  className="ajax-tools-textarea-edit"
                  onClick={() => modifyDataModalRef.current.openModal({
                    groupIndex: index,
                    interfaceIndex: i,
                    activeTab: 'Response',
                    request: v.request,
                    replacementMethod: v.replacementMethod,
                    replacementUrl: v.replacementUrl,
                    replacementStatusCode: v.replacementStatusCode,
                    headersText: v.headers,
                    requestPayloadText: v.requestPayloadText,
                    responseLanguage: v.language,
                    responseText: v.responseText
                  })}
                />
              </div>
            </Panel>;
          })
        }
      </Collapse>
      <div className="ajax-tools-iframe-body-footer">
        <Button
          size="small"
          type="primary"
          shape="circle"
          icon={<PlusOutlined/>}
          title="Add Interface"
          onClick={() => onInterfaceListAdd(index)}
        />
      </div>
    </>)
  );
};