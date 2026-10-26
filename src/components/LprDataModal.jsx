import { memo, useMemo } from 'react';
import { Modal, Table } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { BOC_LPR_URL } from '../utils/bocLpr';

const rate = (v) => `${v.toFixed(2)}%`;

const columns = [
  { title: '报价日期', dataIndex: 'date' },
  { title: '1 年期', dataIndex: 'lpr1y', align: 'right', render: rate },
  { title: '5 年期以上', dataIndex: 'lpr5y', align: 'right', render: rate },
];

// LPR 数据只读查看：数据来自内置历史与每月自动更新，不支持手动修改
const LprDataModal = memo(function LprDataModal({ open, onClose, lprData }) {
  const sorted = useMemo(() => [...lprData].sort((a, b) => b.date.localeCompare(a.date)), [lprData]);

  return (
    <Modal title="LPR 利率数据" open={open} onCancel={onClose} footer={null} width={480}>
      <p className="hint-text lpr-modal-note">
        共 {sorted.length} 期，每月 20 日发布后自动更新。数据来源：
        <a href={BOC_LPR_URL} target="_blank" rel="noopener noreferrer">
          中国银行 <ExportOutlined />
        </a>
      </p>
      <Table
        dataSource={sorted}
        columns={columns}
        rowKey="date"
        pagination={false}
        size="small"
        scroll={{ y: 420 }}
      />
    </Modal>
  );
});

export default LprDataModal;
