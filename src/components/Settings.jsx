import { memo, useCallback, useMemo, useState } from 'react';
import { App as AntdApp, Button, InputNumber, Segmented, Switch, Tag, Tooltip } from 'antd';
import { SettingOutlined, DatabaseOutlined, QuestionCircleOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import SmartDatePicker from './SmartDatePicker';
import MultiplierEditor from './MultiplierEditor';
import LprDataDrawer from './LprDataDrawer';
import CardHeader from './CardHeader';

// LPR 每月 20 日左右发布；最新一条超过这个天数仍未更新，提示用户核对
const LPR_STALE_DAYS = 40;

function Field({ label, hint, children }) {
  return (
    <div className="field">
      <div className="field-label">
        {label}
        {hint && (
          <Tooltip title={hint}>
            <QuestionCircleOutlined className="field-hint-icon" />
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  );
}

const Settings = memo(function Settings({
  rateType, setRateType, fixedRate, setFixedRate, dayBase, setDayBase, endDate, setEndDate,
  mergeLpr, setMergeLpr, lprMode, setLprMode, lprTerm, setLprTerm,
  multipliers, setMultipliers, lprData, setLprData, showToast,
}) {
  const { modal } = AntdApp.useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isLpr = rateType === 'lpr';

  const latestLpr = useMemo(
    () => lprData.reduce((acc, r) => (!acc || r.date > acc.date ? r : acc), null),
    [lprData]
  );
  const lprStale = latestLpr && dayjs().diff(dayjs(latestLpr.date), 'day') > LPR_STALE_DAYS;

  // 倍率与加点的数值含义不同（×1.0 与 +1BP），切换模式时重置为对应模式的默认值；
  // 已填过非默认值时先确认，避免误触清掉录入
  const changeLprMode = useCallback((mode) => {
    if (mode === lprMode) return;
    const defaultValue = lprMode === 'multiplier' ? 1.0 : 0;
    const apply = () => {
      setLprMode(mode);
      setMultipliers((prev) => prev.map((m) => ({ ...m, value: mode === 'multiplier' ? 1.0 : 0 })));
    };
    if (multipliers.every((m) => m.value === defaultValue)) {
      apply();
      return;
    }
    modal.confirm({
      title: `切换为${mode === 'multiplier' ? '倍率' : '加点'}模式？`,
      content: '倍率与加点含义不同，切换后各分段的数值将重置为默认值，起始日期保留。',
      okText: '切换并重置',
      cancelText: '取消',
      onOk: apply,
    });
  }, [lprMode, multipliers, modal, setLprMode, setMultipliers]);

  return (
    <section className="card">
      <CardHeader icon={<SettingOutlined />} title="计息设置" />

      <div className="field-grid">
        <Field label="利率类型">
          <Segmented
            block
            value={rateType}
            onChange={setRateType}
            options={[
              { value: 'lpr', label: 'LPR 浮动' },
              { value: 'fixed', label: '固定利率' },
            ]}
          />
        </Field>

        {isLpr ? (
          <Field label="LPR 期限">
            <Segmented
              block
              value={lprTerm}
              onChange={setLprTerm}
              options={[
                { value: '1y', label: '1 年期' },
                { value: '5y', label: '5 年期以上' },
              ]}
            />
          </Field>
        ) : (
          <Field label="固定年利率">
            <InputNumber
              value={fixedRate}
              step={0.01}
              min={0}
              precision={2}
              suffix="%"
              style={{ width: '100%' }}
              onChange={(v) => setFixedRate(v ?? 0)}
            />
          </Field>
        )}

        <Field label="年计息天数" hint="日利率 = 年利率 ÷ 该天数">
          <Segmented
            block
            value={dayBase}
            onChange={setDayBase}
            options={[
              { value: 365, label: '365 天' },
              { value: 360, label: '360 天' },
            ]}
          />
        </Field>

        <Field label="计息截止日">
          <SmartDatePicker value={endDate} onChange={setEndDate} style={{ width: '100%' }} />
        </Field>
      </div>

      {isLpr && (
        <div className="subsection">
          <div className="subsection-head">
            <div>
              <h3>LPR 浮动方式</h3>
              <p className="hint-text">倍率 1.5 即按 LPR × 1.5 计息；加点 50BP 即按 LPR + 0.50% 计息。可按日期分段设置。</p>
            </div>
            <Segmented
              value={lprMode}
              onChange={changeLprMode}
              options={[
                { value: 'multiplier', label: '倍率' },
                { value: 'basis', label: '加点' },
              ]}
            />
          </div>

          <MultiplierEditor multipliers={multipliers} setMultipliers={setMultipliers} lprMode={lprMode} />

          <div className="lpr-footer">
            <label className="inline-switch">
              <Switch size="small" checked={mergeLpr} onChange={setMergeLpr} />
              <span>相同 LPR 合并计息</span>
              <Tooltip title={mergeLpr ? '开启：相邻月份 LPR 未变时合并为一段，明细更简洁' : '关闭：每次 LPR 报价日都单独成段'}>
                <QuestionCircleOutlined className="field-hint-icon" />
              </Tooltip>
            </label>

            <button type="button" className="lpr-source" onClick={() => setDrawerOpen(true)}>
              <DatabaseOutlined />
              <span>
                LPR 数据 {lprData.length} 条
                {latestLpr && (
                  <>
                    ，最新 <b>{latestLpr.date}</b>
                    <span className="lpr-source-rates">（{latestLpr.lpr1y.toFixed(2)}% / {latestLpr.lpr5y.toFixed(2)}%）</span>
                  </>
                )}
              </span>
              {lprStale && <Tag color="warning" variant="filled">可能需要更新</Tag>}
              <RightOutlined className="lpr-source-arrow" />
            </button>
          </div>
        </div>
      )}

      <LprDataDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        lprData={lprData}
        setLprData={setLprData}
        showToast={showToast}
      />
    </section>
  );
});

export default Settings;
