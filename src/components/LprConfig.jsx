import { useRef, useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Button, InputNumber, Radio, Input, Table, Space } from 'antd';
import SmartDatePicker from './SmartDatePicker';
import {
  PlusOutlined, UploadOutlined, ReloadOutlined,
  SnippetsOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { DEFAULT_LPR } from '../data/lpr';

function parseLprText(text) {
  const lines = text.trim().split('\n').filter((l) => l.trim());
  const data = [];
  for (const line of lines) {
    const parts = line.split(/[\t,;]+/).map((s) => s.trim());
    if (parts.length >= 3) {
      const date = parts[0];
      const lpr1y = parseFloat(parts[1].replace('%', ''));
      const lpr5y = parseFloat(parts[2].replace('%', ''));
      if (date && !isNaN(lpr1y) && !isNaN(lpr5y)) {
        data.push({ date, lpr1y, lpr5y });
      }
    }
  }
  return data;
}

// LPR 表格数字单元格：本地 state，仅 blur 时提交父级，避免每次击键都触发整表重渲染
const EditableNumberCell = memo(function EditableNumberCell({ initialValue, rowIdx, field, onCommit }) {
  const [val, setVal] = useState(initialValue);

  // 外部数据变更（导入/重置）时同步本地值
  useEffect(() => { setVal(initialValue); }, [initialValue]);

  return (
    <InputNumber
      value={val}
      step={0.01}
      min={0}
      precision={2}
      size="small"
      style={{ width: '100%' }}
      onChange={setVal}
      onBlur={() => { if (val != null) onCommit(rowIdx, field, val); }}
    />
  );
});

// LPR 表格日期单元格：本地 state，仅 blur 时提交
const EditableDateCell = memo(function EditableDateCell({ initialValue, rowIdx, onCommit }) {
  const [val, setVal] = useState(initialValue || '');
  // ref 始终持有最新值，避免 blur 时读到过期闭包
  const valRef = useRef(val);

  useEffect(() => {
    setVal(initialValue || '');
    valRef.current = initialValue || '';
  }, [initialValue]);

  const handleChange = useCallback((dateStr) => {
    setVal(dateStr);
    valRef.current = dateStr;
  }, []);

  const handleBlur = useCallback(() => {
    if (valRef.current) onCommit(rowIdx, 'date', valRef.current);
  }, [rowIdx, onCommit]);

  return (
    <SmartDatePicker
      value={val}
      onChange={handleChange}
      onBlur={handleBlur}
      size="small"
      style={{ width: '100%' }}
    />
  );
});

const LprConfig = memo(function LprConfig({
  lprData, setLprData, multipliers, setMultipliers, lprMode, setLprMode, showToast,
}) {
  const fileRef = useRef(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // 使用 useMemo，仅 lprData 变化时重新排序
  const sorted = useMemo(
    () => [...lprData].sort((a, b) => a.date.localeCompare(b.date)),
    [lprData]
  );

  // 函数式更新 + useCallback，deps 为空，引用永远稳定
  const updateLpr = useCallback((idx, field, value) => {
    setLprData((prev) => {
      const s = [...prev].sort((a, b) => a.date.localeCompare(b.date));
      s[idx] = { ...s[idx], [field]: field === 'date' ? value : (value ?? 0) };
      return s;
    });
  }, [setLprData]);

  const removeLpr = useCallback((idx) => {
    setLprData((prev) => {
      const s = [...prev].sort((a, b) => a.date.localeCompare(b.date));
      return s.filter((_, i) => i !== idx);
    });
  }, [setLprData]);

  const addLpr = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    setLprData((prev) => [...prev, { date: today, lpr1y: 3.10, lpr5y: 3.60 }]);
  }, [setLprData]);

  const importLpr = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const content = ev.target.result;
        if (file.name.endsWith('.json')) {
          const data = JSON.parse(content);
          if (Array.isArray(data)) {
            setLprData(data.map((r) => ({
              date: r.date,
              lpr1y: +(r.lpr1y ?? r['1y'] ?? 0),
              lpr5y: +(r.lpr5y ?? r['5y'] ?? 0),
            })));
            showToast('LPR数据导入成功');
          }
        } else {
          const data = parseLprText(content);
          if (data.length > 0) {
            setLprData(data);
            showToast(`LPR数据导入成功，共 ${data.length} 条`);
          } else {
            showToast('未识别到有效的LPR数据', 'warning');
          }
        }
      } catch (err) {
        showToast('导入失败: ' + err.message, 'error');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }, [setLprData, showToast]);

  const handlePasteImport = useCallback(() => {
    const data = parseLprText(pasteText);
    if (data.length > 0) {
      setLprData(data);
      setPasteText('');
      setShowPaste(false);
      showToast(`LPR数据导入成功，共 ${data.length} 条`);
    } else {
      showToast('未识别到有效的LPR数据，请检查格式', 'warning');
    }
  }, [pasteText, setLprData, showToast]);

  const resetToDefault = useCallback(() => {
    setLprData(JSON.parse(JSON.stringify(DEFAULT_LPR)));
    showToast('已恢复默认LPR数据');
  }, [setLprData, showToast]);

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

  // lprColumns 只在 updateLpr/removeLpr 变化时重建（两者均为稳定引用）
  const lprColumns = useMemo(() => [
    {
      title: '生效日期',
      dataIndex: 'date',
      width: 160,
      render: (val, _, idx) => (
        <EditableDateCell initialValue={val} rowIdx={idx} onCommit={updateLpr} />
      ),
    },
    {
      title: '1年期LPR (%)',
      dataIndex: 'lpr1y',
      width: 130,
      render: (val, _, idx) => (
        <EditableNumberCell initialValue={val} rowIdx={idx} field="lpr1y" onCommit={updateLpr} />
      ),
    },
    {
      title: '5年期LPR (%)',
      dataIndex: 'lpr5y',
      width: 130,
      render: (val, _, idx) => (
        <EditableNumberCell initialValue={val} rowIdx={idx} field="lpr5y" onCommit={updateLpr} />
      ),
    },
    {
      title: '操作',
      width: 60,
      align: 'center',
      render: (_, __, idx) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeLpr(idx)} />
      ),
    },
  ], [updateLpr, removeLpr]);

  return (
    <div className="card">
      <div className="card-title">
        <span className="icon">📊</span> LPR 利率数据 <span className="badge">1年期</span>
      </div>

      <Space wrap style={{ marginBottom: 12 }}>
        <Button size="small" icon={<PlusOutlined />} onClick={addLpr}>添加LPR记录</Button>
        <Button size="small" icon={<UploadOutlined />} onClick={() => fileRef.current?.click()}>文件导入</Button>
        <input ref={fileRef} type="file" accept=".json,.csv,.txt" style={{ display: 'none' }} onChange={importLpr} />
        <Button size="small" icon={<SnippetsOutlined />} onClick={() => setShowPaste((v) => !v)}>
          {showPaste ? '收起粘贴' : '粘贴导入'}
        </Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={resetToDefault}>恢复默认</Button>
      </Space>

      {showPaste && (
        <div className="paste-area">
          <p className="hint-text">
            支持 Tab/逗号/分号 分隔，百分号可有可无。每行格式：<code>日期 1年期LPR 5年期LPR</code>
          </p>
          <Input.TextArea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'2026-02-24\t3.00%\t3.50%\n2026-01-20\t3.00%\t3.50%'}
            rows={5}
            style={{ fontFamily: 'monospace', fontSize: 13 }}
          />
          <Space style={{ marginTop: 8 }}>
            <Button type="primary" size="small" onClick={handlePasteImport} disabled={!pasteText.trim()}>
              确认导入
            </Button>
            <Button size="small" onClick={() => { setPasteText(''); setShowPaste(false); }}>取消</Button>
          </Space>
        </div>
      )}

      <Table
        dataSource={sorted}
        columns={lprColumns}
        rowKey={(r) => r.date + r.lpr1y}
        pagination={false}
        size="small"
        scroll={{ y: 280 }}
        style={{ marginTop: 4 }}
      />

      <div className="card-title" style={{ marginTop: 24 }}>
        <span className="icon">📐</span> LPR 倍率/加点 分段设置
      </div>
      <p className="hint-text">
        设置不同时间段内 LPR 的倍率或加点值。例如倍率 1.5 表示按 LPR×1.5 计息；加点 50 表示 LPR+0.5%。
      </p>

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
