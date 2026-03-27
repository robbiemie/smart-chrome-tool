import React from 'react';
import { Button, Dropdown, Input, Switch } from 'antd';
import { MoreOutlined, RightOutlined, DeleteOutlined, ToTopOutlined } from '@ant-design/icons';

import './index.css';
import { AjaxDataListObject, DefaultInterfaceObject } from '../../../common/value';

interface ICollapseHeaderProps {
  fold: boolean
  index: number
  groupOpen: boolean
  summaryText: string
  ajaxDataList: AjaxDataListObject[]
  headerClass: string;
  interfaceList: DefaultInterfaceObject[]

  onGroupDelete: (groupIndex: number) => void
  onGroupMove: (groupIndex: number, placement: string) => void
  onCollapseChange: (groupIndex: number, keys: string | string[]) => void;
  onGroupOpenChange: (groupIndex: number, open: boolean) => void
  onGroupSummaryTextChange: (e: React.ChangeEvent<HTMLInputElement>, groupIndex: number) => void

}

export const CollapseHeader = (props: ICollapseHeaderProps) => {

  const { fold, index, groupOpen, headerClass, ajaxDataList, summaryText, interfaceList, onGroupDelete, onGroupMove, onCollapseChange, onGroupOpenChange, onGroupSummaryTextChange } = props;

  return (

    <div className={`ajax-tools-iframe-body-header ${headerClass}`}>
      <Button
        type="text"
        shape="circle"
        size="small"
        title="Collapse All"
        icon={
          <RightOutlined
            style={{ transform: fold ? undefined : 'rotateZ(90deg)', transition: '.3s' }}
          />
        }
        onClick={() => {
          if (fold) {
            // 当前折叠要展开
            const allKeys = interfaceList.map((v) => v.key);
            onCollapseChange(index, allKeys);
          } else {
            onCollapseChange(index, []);
          }
        }}
      />
      <Input
        value={summaryText}
        className={`ajax-tools-iframe-body-header-input ${headerClass}`}
        onChange={(e) => onGroupSummaryTextChange(e, index)}
      />
      <Switch
        title={groupOpen ? 'Disable group' : 'Enable group'}
        checked={groupOpen}
        onChange={(open) => onGroupOpenChange(index, open)}
        size="small"
      />

      <Button
        danger
        type="primary"
        size="small"
        shape="circle"
        style={{ minWidth: 16, width: 16, height: 16, margin: '0 10px 0 4px' }}
        onClick={() => onGroupDelete(index)}
        icon={<DeleteOutlined style={{ color: '#fff', fontSize: '12px' }} />}
      />
      <Dropdown
        menu={{
          items: [
            {
              key: '0',
              label: 'Move to top',
              icon: <ToTopOutlined style={{ fontSize: 14 }} />,
              onClick: () => onGroupMove(index, 'top'),
              disabled: index === 0
            },
            {
              key: '1',
              label: 'Move to bottom',
              icon: (
                <ToTopOutlined style={{ transform: 'rotateZ(180deg)', fontSize: 14 }} />
              ),
              onClick: () => onGroupMove(index, 'bottom'),
              disabled: index === ajaxDataList.length - 1
            }
          ]
        }}
        trigger={['click']}
      >
        <Button
          type="text"
          shape="circle"
          size="small"
          title="More"
          icon={<MoreOutlined style={{ fontSize: 22 }} />}
        />
      </Dropdown>
    </div>
  );
};