export default function MetricCard({ icon: Icon, label, value, sub, color = 'primary', trend }) {
  return (
    <div className={`metric-card glass-card accent-${color}`}>
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <div className={`metric-icon-wrap color-${color}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
      {trend !== undefined && (
        <div className={`metric-trend ${trend >= 0 ? 'up' : 'down'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs ayer
        </div>
      )}
    </div>
  )
}
