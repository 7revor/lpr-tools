// 卡片统一的标题栏：左侧图标 + 标题 + 附加信息，右侧操作按钮
export default function CardHeader({ icon, title, meta, extra }) {
  return (
    <div className="card-header">
      <div className="card-heading">
        {icon && <span className="card-icon">{icon}</span>}
        <h2>{title}</h2>
        {meta && <span className="card-meta">{meta}</span>}
      </div>
      {extra && <div className="card-extra">{extra}</div>}
    </div>
  );
}
