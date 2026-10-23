import { memo, useMemo } from 'react';
import { Drawer, Table, Grid } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { BOC_LPR_URL } from '../utils/bocLpr';

const rate = (v) => <span className="num">{v.toFixed(2)}%</span>;

const columns = [
  { title: '报价日期', dataIndex: 'date', render: (v) => <span className="num">{v}</span> },
  { title: '1 年期', dataIndex: 'lpr1y', align: 'right', render: rate },
  { title: '5 年期以上', dataIndex: 'lpr5y', align: 'right', render: rate },
];

// LPR 数据只读查看：数据来自内置历史与每月自动更新，不支持手动修改
const LprDataDrawer = memo(function LprDataDrawer({ open, onClose, lprData }) {
  const screens = Grid.useBreakpoint();
  const sorted = useMemo(() => [...lprData].sort((a, b) => b.date.localeCompare(a.date)), [lprData]);

  return (
    <Drawer title="LPR 利率数据" open={open} onClose={onClose} size={screens.sm ? 420 : '100%'}>
      <p className="lpr-drawer-note">
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
        sticky
        className="lpr-table"
      />
    </Drawer>
  );
});

export default LprDataDrawer;
