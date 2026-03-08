import { memo, useCallback } from 'react';
import { Button, Table, Space } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { copyTableAsText, copyToClipboard } from '../utils/clipboard';

const ResultTable = memo(function ResultTable({ result, showToast }) {
  if (!result) return null;

  const { rows, totalLoan, totalRepay, totalInterest, totalInterestPaid, totalPrincipalPaid, remainPrincipal, remainInterest } = result;

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

  // 叶子列顺序（共 14 列）：
  // 0序号 1日期 2类型 3发生金额 4LPR 5倍率 6年利率 7天数
  // [利息组] 8本期利息 9冲息 10利息结余
  // [本金组] 11还本 12剩余本金
  // 13备注
  const numFmt = (v) => (v === '-' ? '-' : Number(v).toFixed(2));
  const columns = [
    { title: '序号', key: 'index', align: 'center', width: 50, render: (_, __, i) => i + 1 },
    { title: '日期/期间', dataIndex: 'date', key: 'date', width: 210 },
    { title: '类型', dataIndex: 'type', key: 'type', align: 'center', width: 75 },
    { title: '发生金额', dataIndex: 'amount', key: 'amount', align: 'right', width: 95, render: numFmt },
    { title: 'LPR(%)', dataIndex: 'lprBase', key: 'lprBase', align: 'right', width: 72 },
    { title: '倍率/加点', dataIndex: 'multiplierLabel', key: 'multiplierLabel', align: 'center', width: 82, render: (v) => v ?? '-' },
    { title: '年利率(%)', dataIndex: 'rate', key: 'rate', align: 'right', width: 85 },
    { title: '计息天数', dataIndex: 'days', key: 'days', align: 'center', width: 72 },
    { title: '本期利息', dataIndex: 'interest', key: 'interest', align: 'right', width: 95, render: numFmt },
    { title: '冲息', dataIndex: 'interestOffset', key: 'interestOffset', align: 'right', width: 90, render: numFmt },
    { title: '利息结余', dataIndex: 'interestBalance', key: 'interestBalance', align: 'right', width: 90, render: (v) => Number(v).toFixed(2) },
    { title: '还本', dataIndex: 'principalOffset', key: 'principalOffset', align: 'right', width: 90, render: numFmt },
    { title: '剩余本金', dataIndex: 'principal', key: 'principal', align: 'right', width: 95, render: (v) => Number(v).toFixed(2) },
    { title: '备注', dataIndex: 'note', key: 'note', render: (v) => v || '' },
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
        rowClassName={(r) => r.type === '还款' ? 'row-repay' : ''}
        style={{ marginTop: 12 }}
        summary={() => (
          <Table.Summary fixed="bottom">
            {/* 单行汇总：各合计值直接落在对应叶子列 */}
            <Table.Summary.Row style={{ background: '#f0f4ff', fontWeight: 700 }}>
              {/* 0-7：空白+合计标签 */}
              <Table.Summary.Cell index={0} colSpan={7} />
              <Table.Summary.Cell index={7} align="right" style={{ background: '#f0f4ff', color: '#666', fontSize: 12 }}>合计</Table.Summary.Cell>
              {/* 8 本期利息合计 */}
              <Table.Summary.Cell index={8} align="right" style={{ background: '#d4edda', fontWeight: 700 }}>{totalInterest.toFixed(2)}</Table.Summary.Cell>
              {/* 9 冲息合计（已还利息） */}
              <Table.Summary.Cell index={9} align="right" style={{ background: '#fff3cd', fontWeight: 700 }}>{totalInterestPaid.toFixed(2)}</Table.Summary.Cell>
              {/* 10 利息结余（未还利息） */}
              <Table.Summary.Cell index={10} align="right" style={{ background: '#d4edda', fontWeight: 700 }}>{remainInterest.toFixed(2)}</Table.Summary.Cell>
              {/* 11 还本合计 */}
              <Table.Summary.Cell index={11} align="right" style={{ background: '#fff3cd', fontWeight: 700 }}>{totalPrincipalPaid.toFixed(2)}</Table.Summary.Cell>
              {/* 12 剩余本金 */}
              <Table.Summary.Cell index={12} align="right" style={{ background: '#d4edda', fontWeight: 700 }}>{remainPrincipal.toFixed(2)}</Table.Summary.Cell>
              {/* 13 备注 */}
              <Table.Summary.Cell index={13} style={{ background: '#f0f4ff' }} />
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </div>
  );
});

export default ResultTable;
