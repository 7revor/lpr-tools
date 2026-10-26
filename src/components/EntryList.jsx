import { memo, useCallback } from 'react';
import { Button, InputNumber, Input, Select } from 'antd';
import { DeleteOutlined, PlusOutlined, SortAscendingOutlined } from '@ant-design/icons';
import SmartDatePicker from './SmartDatePicker';

// 单行组件独立 memo，只有自身 entry 变化才重渲染
const EntryRow = memo(function EntryRow({ entry, index, type, onUpdate, onRemove }) {
  return (
    <div className="entry-row">
      <div className="form-group" style={{ width: 54, flex: 'none' }}>
        <label>序号</label>
        <Input value={index + 1} disabled style={{ width: 54, textAlign: 'center' }} />
      </div>
      <div className="form-group">
        <label>{type === 'loan' ? '借款' : '还款'}日期</label>
        <SmartDatePicker
          value={entry.date}
          onChange={(dateStr) => onUpdate(index, 'date', dateStr)}
          style={{ width: '100%' }}
        />
      </div>
      <div className="form-group">
        <label>{type === 'loan' ? '借款' : '还款'}金额 (元)</label>
        <InputNumber
          value={entry.amount || undefined}
          step={0.01}
          min={0}
          precision={2}
          style={{ width: '100%' }}
          placeholder="请输入金额"
          onChange={(v) => onUpdate(index, 'amount', v ?? 0)}
        />
      </div>
      {type === 'repay' && (
        <div className="form-group" style={{ minWidth: 110, flex: 'none' }}>
          <label>还款方式</label>
          <Select
            value={entry.mode || '先息后本'}
            onChange={(v) => onUpdate(index, 'mode', v)}
            style={{ width: '100%' }}
            options={[
              { value: '先息后本', label: '先息后本' },
              { value: '先本后息', label: '先本后息' },
            ]}
          />
        </div>
      )}
      <div className="form-group" style={{ minWidth: 90 }}>
        <label>备注</label>
        <Input
          value={entry.note}
          onChange={(e) => onUpdate(index, 'note', e.target.value)}
          placeholder="选填"
        />
      </div>
      <Button
        danger
        size="small"
        icon={<DeleteOutlined />}
        onClick={() => onRemove(index)}
        style={{ alignSelf: 'flex-end', flexShrink: 0 }}
      />
    </div>
  );
});

const EntryList = memo(function EntryList({ title, icon, entries, setEntries, type }) {
  // useCallback + 函数式更新：setEntries 本身引用稳定，deps 为空或 [type]
  const add = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    setEntries((prev) => {
      const entry = { date: today, amount: 0, note: '' };
      if (type === 'repay') entry.mode = '先息后本';
      return [...prev, entry];
    });
  }, [setEntries, type]);

  const remove = useCallback((idx) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  }, [setEntries]);

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

  return (
    <div className="card">
      <div className="card-title">
        <span className="icon">{icon}</span> {title}
      </div>

      {entries.length === 0 ? (
        <div className="empty-hint">
          暂无{type === 'loan' ? '借款' : '还款'}记录，点击下方按钮添加
        </div>
      ) : (
        entries.map((entry, i) => (
          <EntryRow
            key={i}
            entry={entry}
            index={i}
            type={type}
            onUpdate={update}
            onRemove={remove}
          />
        ))
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={add}
        >
          添加{type === 'loan' ? '借款' : '还款'}
        </Button>
        {entries.length > 1 && (
          <Button
            size="small"
            icon={<SortAscendingOutlined />}
            onClick={sortByDate}
          >
            日期排序
          </Button>
        )}
      </div>
    </div>
  );
});

export default EntryList;
