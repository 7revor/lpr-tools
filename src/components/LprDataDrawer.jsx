import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { Button, Drawer, InputNumber, Input, Table, Space, Grid } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, ExportOutlined } from '@ant-design/icons';
import SmartDatePicker from './SmartDatePicker';
import { parseLprText } from '../utils/lprText';
import { today } from '../utils/date';
import { BOC_LPR_URL } from '../utils/bocLpr';
import { baselineLpr } from '../utils/lprSync';

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
      suffix="%"
      controls={false}
      style={{ width: '100%' }}
      onChange={setVal}
      onBlur={() => { if (val != null) onCommit(rowIdx, field, val); }}
    />
  );
});

// LPR 表格日期单元格：本地 state，仅 blur 时提交
const EditableDateCell = memo(function EditableDateCell({ initialValue, rowIdx, onCommit }) {
  const [val, setVal] = useState(initialValue || '');
  const [prevInitial, setPrevInitial] = useState(initialValue);
  // ref 始终持有最新值，避免 blur 时读到过期闭包
  const valRef = useRef(val);

  // 外部数据变更（导入/重置）时在渲染期同步本地值，避免 effect 内 setState 引起二次渲染
  if (initialValue !== prevInitial) {
    setPrevInitial(initialValue);
    setVal(initialValue || '');
  }
  useEffect(() => { valRef.current = val; }, [val]);

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

const LprDataDrawer = memo(function LprDataDrawer({ open, onClose, lprData, setLprData, showToast }) {
  const [pasteText, setPasteText] = useState('');
  const screens = Grid.useBreakpoint();

  // 使用 useMemo，仅 lprData 变化时重新排序
  const sorted = useMemo(
    () => [...lprData].sort((a, b) => b.date.localeCompare(a.date)),
    [lprData]
  );

  // 函数式更新 + useCallback，deps 为空，引用永远稳定
  const updateLpr = useCallback((idx, field, value) => {
    setLprData((prev) => {
      const s = [...prev].sort((a, b) => b.date.localeCompare(a.date));
      s[idx] = { ...s[idx], [field]: field === 'date' ? value : (value ?? 0) };
      return s;
    });
  }, [setLprData]);

  const removeLpr = useCallback((idx) => {
    setLprData((prev) => {
      const s = [...prev].sort((a, b) => b.date.localeCompare(a.date));
      return s.filter((_, i) => i !== idx);
    });
  }, [setLprData]);

  const addLpr = useCallback(() => {
    setLprData((prev) => [...prev, { date: today(), lpr1y: 3.10, lpr5y: 3.60 }]);
  }, [setLprData]);

  const handlePasteImport = useCallback(() => {
    const data = parseLprText(pasteText);
    if (data.length > 0) {
      setLprData(data);
      setPasteText('');
      showToast(`LPR数据导入成功，共 ${data.length} 条`);
    } else {
      showToast('未识别到有效的LPR数据，请检查格式', 'warning');
    }
  }, [pasteText, setLprData, showToast]);

  const resetToDefault = useCallback(() => {
    setLprData(baselineLpr());
    showToast('已恢复内置LPR数据');
  }, [setLprData, showToast]);

  // lprColumns 只在 updateLpr/removeLpr 变化时重建（两者均为稳定引用）
  const lprColumns = useMemo(() => [
    {
      title: '生效日期',
      dataIndex: 'date',
      width: 150,
      render: (val, _, idx) => (
        <EditableDateCell initialValue={val} rowIdx={idx} onCommit={updateLpr} />
      ),
    },
    {
      title: '1 年期',
      dataIndex: 'lpr1y',
      render: (val, _, idx) => (
        <EditableNumberCell initialValue={val} rowIdx={idx} field="lpr1y" onCommit={updateLpr} />
      ),
    },
    {
      title: '5 年期',
      dataIndex: 'lpr5y',
      render: (val, _, idx) => (
        <EditableNumberCell initialValue={val} rowIdx={idx} field="lpr5y" onCommit={updateLpr} />
      ),
    },
    {
      title: '',
      width: 40,
      align: 'center',
      render: (_, __, idx) => (
        <Button type="text" size="small" aria-label="删除该条 LPR" icon={<DeleteOutlined />} onClick={() => removeLpr(idx)} />
      ),
    },
  ], [updateLpr, removeLpr]);

  return (
    <Drawer
      title="LPR 利率数据"
      open={open}
      onClose={onClose}
      size={screens.sm ? 560 : '100%'}
      extra={
        <Space size={4}>
          <Button size="small" icon={<ReloadOutlined />} onClick={resetToDefault}>恢复内置</Button>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={addLpr}>添加</Button>
        </Space>
      }
    >
      <div className="paste-area">
        <div className="paste-area-head">
          <span className="paste-area-title">从官网粘贴更新</span>
          <a href={BOC_LPR_URL} target="_blank" rel="noopener noreferrer">
            打开中国银行 LPR 页面 <ExportOutlined />
          </a>
        </div>
        <p className="hint-text">
          每月 20 日发布的新一期会在打开页面时自动追加，一般无需手动更新。
        </p>
        <p className="hint-text">
          每行一条：<code>日期 1年期 5年期</code>，Tab、逗号或分号分隔，百分号可有可无。导入会替换下方全部数据。
        </p>
        <Input.TextArea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={'2026-02-24\t3.00%\t3.50%\n2026-01-20\t3.00%\t3.50%'}
          autoSize={{ minRows: 3, maxRows: 8 }}
          className="mono"
        />
        <Space style={{ marginTop: 8 }}>
          <Button type="primary" size="small" onClick={handlePasteImport} disabled={!pasteText.trim()}>
            导入并替换
          </Button>
          <Button size="small" type="text" onClick={() => setPasteText('')} disabled={!pasteText.trim()}>
            清空
          </Button>
        </Space>
      </div>

      <Table
        dataSource={sorted}
        columns={lprColumns}
        rowKey={(r) => r.date + r.lpr1y}
        pagination={false}
        size="small"
        className="lpr-table"
      />
    </Drawer>
  );
});

export default LprDataDrawer;
