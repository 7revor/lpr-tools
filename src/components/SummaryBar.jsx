import { useEffect, useState } from 'react';
import { Button } from 'antd';
import { ArrowDownOutlined, ExclamationCircleFilled, WarningFilled } from '@ant-design/icons';
import { formatMoney } from '../utils/format';

// 结果区不在视口内时，在底部常驻显示关键数字：录入时即可看到结果随输入实时变化，不必来回滚动
export default function SummaryBar({ calc, targetId }) {
  const [targetVisible, setTargetVisible] = useState(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setTargetVisible(entry.isIntersecting),
      { rootMargin: '0px 0px -80px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [targetId]);

  if (calc.status === 'empty' || targetVisible) return null;

  const jump = () => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (calc.status === 'error') {
    return (
      <div className="summary-bar summary-bar--error" role="status">
        <ExclamationCircleFilled className="summary-bar-icon" />
        <span className="summary-bar-error">{calc.message}</span>
        <Button size="small" onClick={jump}>查看</Button>
      </div>
    );
  }

  const { remainPrincipal, remainInterest, totalInterest, warnings } = calc.result;
  return (
    <div className="summary-bar" role="status">
      <div className="summary-bar-main">
        <span className="summary-bar-label">本息合计（未还）</span>
        <span className="summary-bar-value num">¥{formatMoney(remainPrincipal + remainInterest)}</span>
      </div>
      <div className="summary-bar-sub num">利息合计 ¥{formatMoney(totalInterest)}</div>
      {warnings?.length > 0 && (
        <span className="summary-bar-warn">
          <WarningFilled /> {warnings.length} 条提示
        </span>
      )}
      <Button size="small" type="primary" icon={<ArrowDownOutlined />} onClick={jump}>
        明细
      </Button>
    </div>
  );
}
