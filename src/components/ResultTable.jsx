import { memo, useCallback } from 'react';
import { Button, Table, Space } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { copyTableAsText, copyToClipboard } from '../utils/clipboard';

const ResultTable = memo(function ResultTable({ result, showToast }) {
  if (!result) return null;

  const { rows, totalLoan, totalRepay, totalInterest, totalInterestPaid, remainPrincipal, remainInterest } = result;

  const handleCopyTab = useCallback(async () => {
    const text = copyTableAsText(result, '\t');
    await copyToClipboard(text);
    showToast('已复制到剪贴板，可直接粘贴到Excel');
  }, [result, showToast]);

  const handleCopyCSV = useCallback(async () => {
    const text = copyTableAsText(result, ',');
    await copyToClipboard(text);
    showToast('CSV格式已复制到剪贴板');
  }, [result, showToast]);

  const columns = [
    {
      title: '序号',
      key: 'index',
      align: 'center',
      width: 55,
      render: (_, __, i) => i + 1,
    },
    {
      title: '日期/期间',
      dataIndex: 'date',
      key: 'date',
      width: 210,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      align: 'center',
      width: 90,
    },
    {
      title: '发生金额',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      width: 100,
      render: (v) => v === '-' ? '-' : Number(v).toFixed(2),
    },
    {
      title: '剩余本金',
      dataIndex: 'principal',
      key: 'principal',
      align: 'right',
      width: 110,
      render: (v) => Number(v).toFixed(2),
    },
    {
      title: 'LPR(%)',
      dataIndex: 'lprBase',
      key: 'lprBase',
      align: 'right',
      width: 80,
    },
    {
      title: '倍率/加点',
      dataIndex: 'multiplierLabel',
      key: 'multiplierLabel',
      align: 'center',
      width: 85,
      render: (v) => v ?? '-',
    },
    {
      title: '年利率(%)',
      dataIndex: 'rate',
      key: 'rate',
      align: 'right',
      width: 90,
    },
    {
      title: '计息天数',
      dataIndex: 'days',
      key: 'days',
      align: 'center',
      width: 80,
    },
    {
      title: '利息',
      dataIndex: 'interest',
      key: 'interest',
      align: 'right',
      width: 110,
      render: (v) => {
        if (v === '-') return '-';
        const n = Number(v);
        return (
          <span style={n < 0 ? { color: '#e74c5f', fontWeight: 600 } : {}}>
            {n.toFixed(2)}
          </span>
        );
      },
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      render: (v) => v || '',
    },
  ];

  return (
    <div className="card">
      <div className="card-title">
        <span className="icon">📋</span> 计算结果
      </div>

      <Space wrap style={{ marginBottom: 12 }}>
        <Button type="primary" size="small" icon={<CopyOutlined />} onClick={handleCopyTab}>
          复制结果（可粘贴到Excel）
        </Button>
        <Button size="small" icon={<CopyOutlined />} onClick={handleCopyCSV}>
          复制为CSV
        </Button>
      </Space>

      <div className="summary-box">
        <div className="summary-item">
          <div className="label">借款总额</div>
          <div className="value">¥{totalLoan.toFixed(2)}</div>
        </div>
        <div className="summary-item">
          <div className="label">还款总额</div>
          <div className="value">¥{totalRepay.toFixed(2)}</div>
        </div>
        <div className="summary-item">
          <div className="label">剩余本金</div>
          <div className="value">¥{remainPrincipal.toFixed(2)}</div>
        </div>
        <div className="summary-item">
          <div className="label">利息合计</div>
          <div className="value danger">¥{totalInterest.toFixed(2)}</div>
        </div>
        <div className="summary-item">
          <div className="label">已还利息</div>
          <div className="value success">¥{totalInterestPaid.toFixed(2)}</div>
        </div>
        <div className="summary-item">
          <div className="label">未还利息</div>
          <div className="value danger">¥{remainInterest.toFixed(2)}</div>
        </div>
        <div className="summary-item">
          <div className="label">本息合计(未还)</div>
          <div className="value">¥{(remainPrincipal + remainInterest).toFixed(2)}</div>
        </div>
      </div>

      <Table
        dataSource={rows}
        columns={columns}
        rowKey={(_, i) => i}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
        rowClassName={(r) =>
          r.interest !== '-' && Number(r.interest) < 0 ? 'row-offset' : ''
        }
        style={{ marginTop: 12 }}
        summary={() => (
          <Table.Summary fixed="bottom">
            <Table.Summary.Row>
              <Table.Summary.Cell
                index={0} colSpan={9} align="right"
                style={{ background: '#d4edda', fontWeight: 700 }}
              >
                利息合计（产生）
              </Table.Summary.Cell>
              <Table.Summary.Cell
                index={9} align="right"
                style={{ background: '#d4edda', fontWeight: 700 }}
              >
                {totalInterest.toFixed(2)}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={10} style={{ background: '#d4edda' }} />
            </Table.Summary.Row>
            <Table.Summary.Row>
              <Table.Summary.Cell
                index={0} colSpan={9} align="right"
                style={{ background: '#fff3cd', fontWeight: 600 }}
              >
                已还利息
              </Table.Summary.Cell>
              <Table.Summary.Cell
                index={9} align="right"
                style={{ background: '#fff3cd', fontWeight: 600, color: '#e74c5f' }}
              >
                -{totalInterestPaid.toFixed(2)}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={10} style={{ background: '#fff3cd' }} />
            </Table.Summary.Row>
            <Table.Summary.Row>
              <Table.Summary.Cell
                index={0} colSpan={9} align="right"
                style={{ background: '#d4edda', fontWeight: 700 }}
              >
                未还利息
              </Table.Summary.Cell>
              <Table.Summary.Cell
                index={9} align="right"
                style={{ background: '#d4edda', fontWeight: 700 }}
              >
                {remainInterest.toFixed(2)}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={10} style={{ background: '#d4edda' }} />
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </div>
  );
});

export default ResultTable;
