import type { Task } from '../storage/types';

interface PriorityHeatmapProps {
  tasks: Task[];
}

export function PriorityHeatmap({ tasks }: PriorityHeatmapProps) {
  if (tasks.length === 0) {
    return null;
  }

  // Group tasks by priority label (or 'Unknown' if no priority)
  const groups: Record<string, number> = {};
  tasks.forEach((task) => {
    const label = task.priority?.label || 'Unknown';
    groups[label] = (groups[label] || 0) + 1;
  });

  const total = tasks.length;
  const sortedLabels = Object.keys(groups).sort((a, b) => groups[b] - groups[a]);

  return (
    <div className="card heatmap">
      <h3>Priority Heatmap</h3>
      <div className="heatmap-rows">
        {sortedLabels.map((label) => {
          const count = groups[label];
          const share = count / total;
          return (
            <div key={label} className="heatmap-row">
              <span className="heatmap-label">{label}</span>
              <div className="heatmap-track">
                {/* Bigger share = more opaque bar. */}
                <div className="heatmap-bar" style={{ width: `${share * 100}%`, opacity: 0.35 + share * 0.65 }} />
              </div>
              <span className="heatmap-count">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
