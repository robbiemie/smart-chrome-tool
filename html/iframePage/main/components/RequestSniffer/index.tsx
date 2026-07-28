import React, { useMemo, useState } from 'react';
import { Input, Button, Empty, Tag, Tooltip } from 'antd';
import { SearchOutlined, ThunderboltOutlined, DeleteOutlined } from '@ant-design/icons';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import { CapturedRequest } from '../../hooks/useRequestSniffer';
import './index.css';

interface RequestSnifferProps {
  requests: CapturedRequest[];
  onClear: () => void;
  onMockRequest: (capture: CapturedRequest) => void;
  disabled?: boolean;
}

const RequestSniffer = ({
  requests,
  onClear,
  onMockRequest,
  disabled,
}: RequestSnifferProps) => {
  const [keyword, setKeyword] = useState('');

  const filteredRequests = useMemo(() => {
    const trimmed = keyword.trim().toLowerCase();
    if (!trimmed) return requests;
    return requests.filter(
      (item) =>
        item.url.toLowerCase().includes(trimmed) ||
        (item.method || '').toLowerCase().includes(trimmed)
    );
  }, [keyword, requests]);

  const handleMock = (capture: CapturedRequest) => {
    onMockRequest(capture);
  };

  return (
    <div className="request-sniffer">
      <div className="request-sniffer__toolbar">
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined />}
          placeholder="Search path or method..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="request-sniffer__search"
        />
        <Button
          size="small"
          icon={<DeleteOutlined />}
          onClick={onClear}
          disabled={requests.length === 0}
          title="Clear captured requests"
        />
      </div>

      <div className="request-sniffer__list">
        {filteredRequests.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              requests.length === 0
                ? 'No XHR captured yet'
                : 'No matches'
            }
            className="request-sniffer__empty"
          />
        ) : (
          filteredRequests.map((item) => {
            const statusColor =
              item.status >= 200 && item.status < 300
                ? 'green'
                : item.status >= 400
                  ? 'red'
                  : 'default';
            return (
              <div key={item.id} className="request-sniffer__item">
                <div className="request-sniffer__item-main">
                  <div className="request-sniffer__item-meta">
                    <Tag
                      color={item.source === 'fetch' ? 'blue' : 'geekblue'}
                      className="request-sniffer__source-tag"
                    >
                      {item.source}
                    </Tag>
                    {item.method ? (
                      <Tag color="volcano" className="request-sniffer__method-tag">
                        {item.method}
                      </Tag>
                    ) : null}
                    <Tag
                      color={statusColor}
                      className="request-sniffer__status-tag"
                    >
                      {item.status || '—'}
                    </Tag>
                  </div>
                  <Tooltip title={item.url} placement="topLeft">
                    <span className="request-sniffer__url">{item.url}</span>
                  </Tooltip>
                </div>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<ThunderboltOutlined />}
                  onClick={() => handleMock(item)}
                  disabled={disabled}
                  title="Add this request/response as a mock rule to the current group"
                >
                Mock
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default withErrorBoundary(RequestSniffer);
