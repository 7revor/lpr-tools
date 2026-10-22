import { memo, useCallback, useMemo } from 'react';
import { App as AntdApp, Button, InputNumber, Input, Select } from 'antd';
import { DeleteOutlined, PlusOutlined, SortAscendingOutlined, WalletOutlined, RollbackOutlined } from '@ant-design/icons';
import SmartDatePicker from './SmartDatePicker';
import CardHeader from './CardHeader';
import { today } from '../utils/date';
import { formatMoney, thousandsFormatter, thousandsParser } from '../utils/format';

const LABELS = {
  loan: { noun: '借款', icon: <WalletOutlined />, tone: 'primary' },
  repay: { noun: '还款', icon: <RollbackOutlined />, tone: 'success' },
};

// 单行组件独立 memo，只有自身 entry 变化才重渲染
const EntryRow = memo(function EntryRow({ entry, index, type, onUpdate, onRemove }) {
  const { noun } = LABELS[type];
  return (
    <div className="entry-row">
      <div className="entry-index">
        <span className="num">{index + 1}</span>
        <span className="entry-index-label">第 {index + 1} 笔</span>
      </div>
      <div className="entry-cell entry-date">
        <span className="cell-label">{noun}日期</span>
        <SmartDatePicker
          value={entry.date}
          onChange={(dateStr) => onUpdate(index, 'date', dateStr)}
          style={{ width: '100%' }}
          aria-label={`第 ${index + 1} 笔${noun}日期`}
        />
      </div>
      <div className="entry-cell entry-amount">
        <span className="cell-label">金额（元）</span>
        <InputNumber
          value={entry.amount || undefined}
          min={0}
          precision={2}
          controls={false}
          formatter={thousandsFormatter}
          parser={thousandsParser}
          className="num"
          style={{ width: '100%' }}
          placeholder="0.00"
          aria-label={`第 ${index + 1} 笔${noun}金额`}
          onChange={(v) => onUpdate(index, 'amount', v ?? 0)}
        />
      </div>
      {type === 'repay' && (
        <div className="entry-cell entry-mode">
          <span className="cell-label">还款方式</span>
          <Select
            value={entry.mode || '先息后本'}
            onChange={(v) => onUpdate(index, 'mode', v)}
            style={{ width: '100%' }}
            aria-label={`第 ${index + 1} 笔还款方式`}
            options={[
              { value: '先息后本', label: '先息后本' },
              { value: '先本后息', label: '先本后息' },
            ]}
          />
        </div>
      )}
      <div className="entry-cell entry-note">
        <span className="cell-label">备注</span>
        <Input
          value={entry.note}
          onChange={(e) => onUpdate(index, 'note', e.target.value)}
          placeholder="选填"
          aria-label={`第 ${index + 1} 笔${noun}备注`}
        />
      </div>
      <Button
        type="text"
        icon={<DeleteOutlined />}
        className="entry-remove"
        aria-label={`删除第 ${index + 1} 笔${noun}`}
        onClick={() => onRemove(index, entry)}
      />
    </div>
  );
});

const EntryList = memo(function EntryList({ entries, setEntries, type }) {
  const { message } = AntdApp.useApp();
  const { noun, icon, tone } = LABELS[type];

  // useCallback + 函数式更新：setEntries 本身引用稳定，deps 为空或 [type]
  const add = useCallback(() => {
    setEntries((prev) => {
      const entry = { date: today(), amount: 0, note: '' };
      if (type === 'repay') entry.mode = '先息后本';
      return [...prev, entry];
    });
  }, [setEntries, type]);

  // 删除不弹确认，改为提供几秒内可撤销，减少打断
  const remove = useCallback((idx, removed) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
    const key = `remove-${type}-${Date.now()}`;
    const undo = () => {
      setEntries((prev) => [...prev.slice(0, idx), removed, ...prev.slice(idx)]);
      message.destroy(key);
    };
    message.open({
      key,
      type: 'info',
      duration: 5,
      content: (
        <span>
          已删除第 {idx + 1} 笔{noun}
          <Button type="link" size="small" onClick={undo}>撤销</Button>
        </span>
      ),
    });
  }, [setEntries, type, noun, message]);

  // 函数式更新 + useCallback：deps 只有 setEntries，真正稳定
  const update = useCallback((idx, field, value) => {
    setEntries((prev) =>
      prev.map((e, i) =>
        i === idx ? { ...e, [field]: field === 'amount' ? (value ?? 0) : value } : e
      )
    );
  }, [setEntries]);

  const sortByDate = useCallback(() => {
    setEntries((prev) => [...prev].sort((a, b) => (a.date || '').localeCompare(b.date || '')));
  }, [setEntries]);

  const summary = useMemo(() => {
    const valid = entries.filter((e) => e.amount > 0);
    if (valid.length === 0) return null;
    const total = valid.reduce((s, e) => s + Number(e.amount), 0);
    return `${valid.length} 笔 · 合计 ¥${formatMoney(total)}`;
  }, [entries]);

  return (
    <section className={`card entry-card entry-card--${type}`}>
      <CardHeader
        icon={icon}
        title={`${noun}记录`}
        meta={summary && <span className="num">{summary}</span>}
        extra={entries.length > 1 && (
          <Button size="small" type="text" icon={<SortAscendingOutlined />} onClick={sortByDate}>
            按日期排序
          </Button>
        )}
      />

      {entries.length === 0 ? (
        <div className="empty-hint">还没有{noun}记录</div>
      ) : (
        <div className={`entry-table entry-table--${type}`} data-tone={tone}>
          <div className="entry-row entry-head" aria-hidden="true">
            <span>#</span>
            <span>{noun}日期</span>
            <span>金额（元）</span>
            {type === 'repay' && <span>还款方式</span>}
            <span>备注</span>
            <span />
          </div>
          {entries.map((entry, i) => (
            <EntryRow
              key={i}
              entry={entry}
              index={i}
              type={type}
              onUpdate={update}
              onRemove={remove}
            />
          ))}
        </div>
      )}

      <Button type="dashed" block icon={<PlusOutlined />} onClick={add} className="entry-add">
        添加{noun}
      </Button>
    </section>
  );
});

export default EntryList;
