import { useState, useCallback, useMemo, memo } from 'react';
import { Button, InputNumber, Radio, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import SmartDatePicker from './SmartDatePicker';
import LprDataModal from './LprDataModal';

// LPR 每月 20 日左右发布；最新一期超过这个天数仍未更新，说明自动更新可能失败，提示用户留意
const LPR_STALE_DAYS = 40;

const LprConfig = memo(function LprConfig({
  lprData, multipliers, setMultipliers, lprMode, setLprMode, lprTerm, setLprTerm,
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const latestLpr = useMemo(
    () => lprData.reduce((acc, r) => (!acc || r.date > acc.date ? r : acc), null),
    [lprData]
  );
  const lprStale = latestLpr && dayjs().diff(dayjs(latestLpr.date), 'day') > LPR_STALE_DAYS;

  const updateMultiplier = useCallback((idx, field, value) => {
    setMultipliers((prev) =>
      prev.map((m, i) =>
        i === idx ? { ...m, [field]: field === 'startDate' ? value : (value ?? 0) } : m
      )
    );
  }, [setMultipliers]);

  const removeMultiplier = useCallback((idx) => {
    setMultipliers((prev) => prev.filter((_, i) => i !== idx));
  }, [setMultipliers]);

  const addMultiplier = useCallback(() => {
    setMultipliers((prev) => [...prev, { startDate: '', value: lprMode === 'multiplier' ? 1.0 : 0 }]);
  }, [setMultipliers, lprMode]);

  return (
    <div className="card">
      <div className="card-title">
        <span className="icon">📊</span> LPR 利率数据
      </div>

      <button type="button" className="lpr-source" onClick={() => setModalOpen(true)}>
        <span>
          数据更新至 <b>{latestLpr?.date ?? '—'}</b>
          {latestLpr && (
            <span className="lpr-source-rates">
              （1 年期 {latestLpr.lpr1y.toFixed(2)}% / 5 年期以上 {latestLpr.lpr5y.toFixed(2)}%）
            </span>
          )}
          ，共 {lprData.length} 期
        </span>
        {lprStale && <Tag color="warning">可能未更新</Tag>}
        <span className="lpr-source-link">查看详情 <RightOutlined /></span>
      </button>
      <p className="hint-text">每月 20 日发布的新一期会在打开页面时自动更新，无需手动维护。</p>

      <LprDataModal open={modalOpen} onClose={() => setModalOpen(false)} lprData={lprData} />

      <div className="card-title" style={{ marginTop: 24 }}>
        <span className="icon">📐</span> LPR 倍率/加点 分段设置
      </div>
      <p className="hint-text">
        设置不同时间段内 LPR 的倍率或加点值。例如倍率 1.5 表示按 LPR×1.5 计息；加点 50 表示 LPR+0.5%。
      </p>

      <div style={{ marginBottom: 10 }}>
        <span style={{ marginRight: 8, fontSize: 13, color: 'var(--text-secondary)' }}>LPR 期限：</span>
        <Radio.Group value={lprTerm} onChange={(e) => setLprTerm(e.target.value)}>
          <Radio value="1y">1 年期 LPR</Radio>
          <Radio value="5y">5 年期 LPR</Radio>
        </Radio.Group>
      </div>

      <Radio.Group value={lprMode} onChange={(e) => setLprMode(e.target.value)} style={{ marginBottom: 12 }}>
        <Radio value="multiplier">倍率模式</Radio>
        <Radio value="basis">加点模式 (BP)</Radio>
      </Radio.Group>

      {multipliers.map((m, i) => (
        <div className="multiplier-row" key={i}>
          <div className="form-group">
            <label>起始日期{i === 0 ? '（留空=最早）' : ''}</label>
            <SmartDatePicker
              value={m.startDate}
              onChange={(dateStr) => updateMultiplier(i, 'startDate', dateStr)}
              style={{ width: '100%' }}
              placeholder="留空=最早"
            />
          </div>
          <div className="form-group">
            <label>{lprMode === 'multiplier' ? 'LPR倍率' : '加点值 (BP, 1BP=0.01%)'}</label>
            <InputNumber
              value={m.value}
              step={lprMode === 'multiplier' ? 0.01 : 1}
              precision={lprMode === 'multiplier' ? 2 : 0}
              style={{ width: '100%' }}
              onChange={(v) => updateMultiplier(i, 'value', v)}
            />
          </div>
          {multipliers.length > 1 && (
            <Button danger size="small" icon={<DeleteOutlined />} onClick={() => removeMultiplier(i)} style={{ alignSelf: 'flex-end' }}>
              删除
            </Button>
          )}
        </div>
      ))}

      <Button size="small" icon={<PlusOutlined />} onClick={addMultiplier} style={{ marginTop: 8 }}>
        添加分段
      </Button>
    </div>
  );
});

export default LprConfig;
