import { memo, useCallback, useMemo } from 'react';
import { Alert, Button, Grid, Table, Tag, Tooltip } from 'antd';
import { CopyOutlined, FileTextOutlined, TableOutlined, InfoCircleOutlined } from '@ant-design/icons';
import CardHeader from './CardHeader';
import { copyTableAsText, copyToClipboard } from '../utils/clipboard';
import { formatMoney } from '../utils/format';

const rateFormatter = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const TYPE_TAG = {
  借款: 'processing',
  还款: 'success',
};

// 汇总区的一项：标题 + 金额，detail 说明金额怎么来的（没有还款时不需要）。
// detail 为短语数组，窄屏只在短语之间换行，不会把「已还」拆开
function SumPart({ label, value, detail, hero }) {
  return (
    <div className={`sum-part${hero ? ' sum-part--hero' : ''}`}>
      <div className="sum-label">{label}</div>
      <div className="sum-value num">¥{formatMoney(value)}</div>
      {detail && (
        <div className="sum-detail num">
          {detail.map((text) => <span key={text}>{text}</span>)}
        </div>
      )}
    </div>
  );
}

function Period({ start, end }) {
  if (!end) return <span className="num">{start}</span>;
  return (
    <span className="period num">
      <span>{start}</span>
      <span className="period-arrow">→</span>
      <span>{end}</span>
    </span>
  );
}

function RateCell({ row }) {
  if (row.rate === '' || row.rate == null) return null;
  const detail = row.multiplierLabel === '固定' ? '固定利率' : `LPR ${row.lprBase}% ${row.multiplierLabel}`;
  return (
    <div className="rate-cell">
      <span className="num">{rateFormatter.format(Number(row.rate))}%</span>
      <span className="rate-detail num">{detail}</span>
    </div>
  );
}

const money = (v) => <span className="num">{formatMoney(v)}</span>;

// 没有还款时「冲息」「还本」整列为 0，没有备注时「备注」整列为空，屏幕上不展示（复制到 Excel 仍保留全部列）
function useColumns(compact, { hasRepay, hasNote }) {
  return useMemo(() => [
    { title: '#', key: 'index', align: 'center', width: compact ? 36 : 40, fixed: 'left', render: (_, __, i) => <span className="cell-muted num">{i + 1}</span> },
    {
      title: compact ? '日期' : '日期 / 计息区间',
      key: 'period',
      width: compact ? 104 : 180,
      fixed: 'left',
      className: compact ? 'col-period col-period--stack' : 'col-period',
      render: (_, r) => <Period start={r.dateStart} end={r.dateEnd} />,
    },
    {
      title: '类型', dataIndex: 'type', key: 'type', align: 'center', width: 60,
      render: (v) => (TYPE_TAG[v] ? <Tag color={TYPE_TAG[v]} variant="filled">{v}</Tag> : <span className="cell-muted">{v}</span>),
    },
    { title: '发生金额', dataIndex: 'amount', key: 'amount', align: 'right', width: 104, render: money },
    { title: '年利率', key: 'rate', align: 'right', width: 120, render: (_, r) => <RateCell row={r} /> },
    { title: '天数', dataIndex: 'days', key: 'days', align: 'right', width: 56, render: (v) => <span className="num">{v}</span> },
    { title: '本期利息', dataIndex: 'interest', key: 'interest', align: 'right', width: 100, render: money },
    { title: '冲息', dataIndex: 'interestOffset', key: 'interestOffset', align: 'right', width: 96, render: money },
    { title: '利息结余', dataIndex: 'interestBalance', key: 'interestBalance', align: 'right', width: 104, render: money },
    { title: '还本', dataIndex: 'principalOffset', key: 'principalOffset', align: 'right', width: 100, render: money },
    { title: '剩余本金', dataIndex: 'principal', key: 'principal', align: 'right', width: 120, render: (v) => <strong className="num">{formatMoney(v)}</strong> },
    { title: '备注', dataIndex: 'note', key: 'note', ellipsis: { showTitle: true }, render: (v) => <span className="cell-muted">{v}</span> },
  ].filter((c) => {
    if (c.key === 'interestOffset' || c.key === 'principalOffset') return hasRepay;
    if (c.key === 'note') return hasNote;
    return true;
  }), [compact, hasRepay, hasNote]);
}

function ResultBody({ result, compact }) {
  const {
    rows, totalLoan, totalInterest, totalInterestPaid, totalPrincipalPaid,
    remainPrincipal, remainInterest, warnings,
  } = result;
  const hasRepay = rows.some((r) => r.type === '还款');
  const hasNote = rows.some((r) => r.note);
  const columns = useColumns(compact, { hasRepay, hasNote });

  // 合计行按列 key 取值，列被隐藏时位置自动对齐
  const totals = {
    interest: totalInterest,
    interestOffset: totalInterestPaid,
    interestBalance: remainInterest,
    principalOffset: totalPrincipalPaid,
    principal: remainPrincipal,
  };

  return (
    <>
      <div className="result-summary">
        <SumPart hero label="本息合计（未还）" value={remainPrincipal + remainInterest} />
        <span className="sum-op sum-op--eq" aria-hidden="true">=</span>
        <SumPart
          label="剩余本金"
          value={remainPrincipal}
          detail={totalPrincipalPaid > 0 && [`借款 ¥${formatMoney(totalLoan)}`, `− 已还 ¥${formatMoney(totalPrincipalPaid)}`]}
        />
        <span className="sum-op" aria-hidden="true">+</span>
        <SumPart
          label="未还利息"
          value={remainInterest}
          detail={totalInterestPaid > 0 && [`共计 ¥${formatMoney(totalInterest)}`, `− 已还 ¥${formatMoney(totalInterestPaid)}`]}
        />
      </div>

      {warnings?.length > 0 && (
        <Alert
          type="warning"
          showIcon
          className="result-alert"
          title={`有 ${warnings.length} 条需要留意`}
          description={
            <ul className="warning-list">
              {warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          }
        />
      )}

      <Table
        dataSource={rows}
        columns={columns}
        rowKey={(r) => `${r.type}-${r.dateStart}-${r.dateEnd}-${r.amount}-${r.principal}`}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
        className="result-table"
        rowClassName={(r) => (r.type === '借款' ? 'row-loan' : r.type === '还款' ? 'row-repay' : '')}
        summary={() => (
          <Table.Summary>
            <Table.Summary.Row className="result-total-row">
              <Table.Summary.Cell index={0} colSpan={2}>合计</Table.Summary.Cell>
              {columns.slice(2).map((c, i) => (
                <Table.Summary.Cell key={c.key} index={i + 2} align="right">
                  {c.key in totals && money(totals[c.key])}
                </Table.Summary.Cell>
              ))}
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </>
  );
}

// calc: { status: 'empty' } | { status: 'error', message } | { status: 'ok', result }
const ResultTable = memo(function ResultTable({ calc, showToast }) {
  const screens = Grid.useBreakpoint();
  const compact = !screens.md;
  const result = calc.status === 'ok' ? calc.result : null;

  const handleCopyTab = useCallback(async () => {
    await copyToClipboard(copyTableAsText(result, '\t'));
    showToast('已复制，可直接粘贴到 Excel');
  }, [result, showToast]);

  const handleCopyCSV = useCallback(async () => {
    await copyToClipboard(copyTableAsText(result, ','));
    showToast('已复制为 CSV 文本');
  }, [result, showToast]);

  return (
    <section className="card result-card" id="result-section">
      <CardHeader
        icon={<TableOutlined />}
        title="计算结果"
        meta={result && <span className="num">{result.rows.length} 行明细</span>}
        extra={result && (
          <>
            <Tooltip title="制表符分隔，粘贴到 Excel 自动分列">
              <Button size="small" type="primary" icon={<CopyOutlined />} onClick={handleCopyTab}>复制到 Excel</Button>
            </Tooltip>
            <Button size="small" icon={<FileTextOutlined />} onClick={handleCopyCSV}>复制 CSV</Button>
          </>
        )}
      />

      {calc.status === 'empty' && (
        <div className="result-empty">
          <InfoCircleOutlined />
          <span>填写至少一笔借款的日期和金额后，这里会自动显示利息明细。</span>
        </div>
      )}
      {calc.status === 'error' && (
        <Alert type="error" showIcon title="暂时无法计算" description={calc.message} />
      )}
      {result && <ResultBody result={result} compact={compact} />}
    </section>
  );
});

export default ResultTable;
