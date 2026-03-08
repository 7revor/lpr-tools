import { useState, useCallback, useRef } from 'react';
import { ConfigProvider, App as AntdApp, Button, Space } from 'antd';
import { ExportOutlined, ImportOutlined, DeleteOutlined, GithubOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { DEFAULT_LPR } from './data/lpr';
import { calculate } from './utils/calculate';
import Settings from './components/Settings';
import LprConfig from './components/LprConfig';
import EntryList from './components/EntryList';
import ResultTable from './components/ResultTable';
import './App.css';

const STORAGE_KEY = 'lpr-calc-state';
const today = () => new Date().toISOString().slice(0, 10);

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function LprCalc() {
  const { message, modal } = AntdApp.useApp();

  const showToast = useCallback((msg, type = 'success') => {
    message[type]?.(msg) ?? message.success(msg);
  }, [message]);

  // 从 localStorage 读取暂存数据作为初始值
  const [rateType, setRateType] = useState(() => loadFromStorage()?.rateType || 'lpr');
  const [fixedRate, setFixedRate] = useState(() => loadFromStorage()?.fixedRate ?? 4.35);
  const [dayBase, setDayBase] = useState(() => loadFromStorage()?.dayBase || 365);
  const [endDate, setEndDate] = useState(() => loadFromStorage()?.endDate || today());
  const [lprMode, setLprMode] = useState(() => loadFromStorage()?.lprMode || 'multiplier');
  const [lprData, setLprData] = useState(() => loadFromStorage()?.lprData || JSON.parse(JSON.stringify(DEFAULT_LPR)));
  const [loans, setLoans] = useState(() => loadFromStorage()?.loans || [{ date: today(), amount: 0, note: '' }]);
  const [repays, setRepays] = useState(() => loadFromStorage()?.repays || [{ date: today(), amount: 0, note: '', mode: '先息后本' }]);
  const [multipliers, setMultipliers] = useState(() => loadFromStorage()?.multipliers || [{ startDate: '', value: 1.0 }]);
  const [result, setResult] = useState(null);

  const importRef = useRef(null);

  const collectState = () => ({
    version: 1,
    rateType, fixedRate, dayBase, endDate, lprMode,
    lprData, loans, repays, multipliers,
  });

  const handleCalculate = () => {
    try {
      const res = calculate({ rateType, fixedRate, dayBase, endDate, lprData, multipliers, lprMode, loans, repays });
      setResult(res);
      // 计算完成后自动暂存
      saveToStorage(collectState());
      setTimeout(() => {
        document.getElementById('result-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      message.error(err.message);
    }
  };

  const handleExport = () => {
    const data = collectState();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LPR计算数据_${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出');
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.rateType) setRateType(data.rateType);
        if (data.fixedRate !== undefined) setFixedRate(data.fixedRate);
        if (data.dayBase) setDayBase(data.dayBase);
        if (data.endDate) setEndDate(data.endDate);
        if (data.lprMode) setLprMode(data.lprMode);
        if (data.lprData) setLprData(data.lprData);
        if (data.loans) setLoans(data.loans);
        if (data.repays) setRepays(data.repays);
        if (data.multipliers) setMultipliers(data.multipliers);
        setResult(null);
        showToast('数据导入成功');
      } catch (err) {
        showToast('导入失败: ' + err.message, 'error');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleClear = () => {
    modal.confirm({
      title: '确认清空',
      content: '确定清空所有已输入的数据？',
      okType: 'danger',
      okText: '清空',
      cancelText: '取消',
      onOk: () => {
        setRateType('lpr');
        setFixedRate(4.35);
        setDayBase(365);
        setEndDate(today());
        setLprMode('multiplier');
        setLprData(JSON.parse(JSON.stringify(DEFAULT_LPR)));
        setLoans([]);
        setRepays([]);
        setMultipliers([{ startDate: '', value: 1.0 }]);
        setResult(null);
        localStorage.removeItem(STORAGE_KEY);
        showToast('已清空所有数据');
      },
    });
  };

  return (
    <div className="container">
      <header>
        <h1>LPR 借贷利息计算系统</h1>
        <p>支持多笔借款/还款、LPR分段倍率与固定利率、结果一键复制到Excel</p>
        <a
          className="github-link"
          href="https://github.com/7revor/lpr-tools"
          target="_blank"
          rel="noopener noreferrer"
          title="在 GitHub 上查看源码"
        >
          <GithubOutlined />
          <span>GitHub</span>
        </a>
      </header>

      <div className="toolbar">
        <Space wrap>
          <Button icon={<ExportOutlined />} onClick={handleExport}>导出数据 (JSON)</Button>
          <Button icon={<ImportOutlined />} onClick={() => importRef.current?.click()}>导入数据 (JSON)</Button>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          <Button danger icon={<DeleteOutlined />} onClick={handleClear}>清空所有</Button>
        </Space>
      </div>

      <Settings
        rateType={rateType} setRateType={setRateType}
        fixedRate={fixedRate} setFixedRate={setFixedRate}
        dayBase={dayBase} setDayBase={setDayBase}
        endDate={endDate} setEndDate={setEndDate}
      />

      {rateType === 'lpr' && (
        <LprConfig
          lprData={lprData} setLprData={setLprData}
          multipliers={multipliers} setMultipliers={setMultipliers}
          lprMode={lprMode} setLprMode={setLprMode}
          showToast={showToast}
        />
      )}

      <EntryList title="借款录入" icon="💰" type="loan" entries={loans} setEntries={setLoans} />
      <EntryList title="还款录入" icon="💸" type="repay" entries={repays} setEntries={setRepays} />

      <div className="calc-action">
        <Button
          type="primary"
          size="large"
          onClick={handleCalculate}
          style={{ padding: '0 56px', height: 48, fontSize: 16, borderRadius: 12 }}
        >
          🧮 开始计算
        </Button>
      </div>

      <div id="result-section">
        {result && <ResultTable result={result} showToast={showToast} />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#4f6ef7',
          borderRadius: 6,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
      }}
    >
      <AntdApp>
        <LprCalc />
      </AntdApp>
    </ConfigProvider>
  );
}
