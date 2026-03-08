import { memo } from 'react';
import { Select, InputNumber } from 'antd';
import SmartDatePicker from './SmartDatePicker';

const Settings = memo(function Settings({ rateType, setRateType, fixedRate, setFixedRate, dayBase, setDayBase, endDate, setEndDate }) {
  return (
    <div className="card">
      <div className="card-title">
        <span className="icon">⚙️</span> 基本设置
      </div>
      <div className="settings-grid">
        <div className="form-group">
          <label>利率类型</label>
          <Select
            value={rateType}
            onChange={setRateType}
            style={{ width: '100%' }}
            options={[
              { value: 'lpr', label: 'LPR浮动利率（分段计息）' },
              { value: 'fixed', label: '固定年利率' },
            ]}
          />
        </div>

        {rateType === 'fixed' && (
          <div className="form-group">
            <label>固定年利率 (%)</label>
            <InputNumber
              value={fixedRate}
              step={0.01}
              min={0}
              precision={2}
              style={{ width: '100%' }}
              onChange={(v) => setFixedRate(v ?? 0)}
            />
          </div>
        )}

        <div className="form-group">
          <label>日利率基数（年天数）</label>
          <Select
            value={dayBase}
            onChange={setDayBase}
            style={{ width: '100%' }}
            options={[
              { value: 365, label: '365天' },
              { value: 360, label: '360天' },
            ]}
          />
        </div>

        <div className="form-group">
          <label>计息截止日期</label>
          <SmartDatePicker
            value={endDate}
            onChange={setEndDate}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </div>
  );
});

export default Settings;
