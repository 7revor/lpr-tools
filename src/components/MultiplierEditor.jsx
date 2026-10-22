import { memo, useCallback } from 'react';
import { Button, InputNumber } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import SmartDatePicker from './SmartDatePicker';

// LPR 倍率/加点分段：每段从起始日期开始生效，第一段起始日期留空表示从最早开始
const MultiplierEditor = memo(function MultiplierEditor({ multipliers, setMultipliers, lprMode }) {
  const isMultiplier = lprMode === 'multiplier';

  const updateMultiplier = useCallback((idx, field, value) => {
    setMultipliers((prev) =>
      prev.map((m, i) =>
        // 清空时保留 null，由计算前校验提示，而不是静默变成 0
        i === idx ? { ...m, [field]: value } : m
      )
    );
  }, [setMultipliers]);

  const removeMultiplier = useCallback((idx) => {
    setMultipliers((prev) => prev.filter((_, i) => i !== idx));
  }, [setMultipliers]);

  const addMultiplier = useCallback(() => {
    setMultipliers((prev) => [...prev, { startDate: '', value: isMultiplier ? 1.0 : 0 }]);
  }, [setMultipliers, isMultiplier]);

  return (
    <div className="segment-list">
      <div className="segment-row segment-head" aria-hidden="true">
        <span>起始日期</span>
        <span>{isMultiplier ? 'LPR 倍率' : '加点（1BP = 0.01%）'}</span>
        <span />
      </div>
      {multipliers.map((m, i) => (
        <div className="segment-row" key={i}>
          <SmartDatePicker
            value={m.startDate}
            onChange={(dateStr) => updateMultiplier(i, 'startDate', dateStr)}
            style={{ width: '100%' }}
            placeholder={i === 0 ? '留空 = 最早' : '起始日期'}
            aria-label={`第 ${i + 1} 段起始日期`}
          />
          <InputNumber
            value={m.value}
            step={isMultiplier ? 0.1 : 5}
            precision={isMultiplier ? 2 : 0}
            prefix={isMultiplier ? '×' : '+'}
            suffix={isMultiplier ? undefined : 'BP'}
            style={{ width: '100%' }}
            aria-label={`第 ${i + 1} 段${isMultiplier ? '倍率' : '加点'}`}
            onChange={(v) => updateMultiplier(i, 'value', v)}
          />
          <Button
            type="text"
            icon={<DeleteOutlined />}
            aria-label={`删除第 ${i + 1} 段`}
            disabled={multipliers.length <= 1}
            onClick={() => removeMultiplier(i)}
          />
        </div>
      ))}
      <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addMultiplier} className="segment-add">
        添加分段
      </Button>
    </div>
  );
});

export default MultiplierEditor;
