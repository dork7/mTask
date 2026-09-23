import type { ProgressInfo } from '../lib/laya-browser/modelBundle';

export interface DownloadProgressProps {
  progress: ProgressInfo | null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

export function DownloadProgress({ progress }: DownloadProgressProps) {
  if (!progress) return null;
  const { file, index, total, loaded, size, source } = progress;
  const action = source === 'cache' ? 'Loading priority model from cache' : 'Downloading priority model';
  const bytes =
    size !== null
      ? `${formatBytes(loaded)} of ${formatBytes(size)} (${Math.round((loaded / size) * 100)}%)`
      : `${formatBytes(loaded)} received`;
  return (
    <div className="download" role="status" aria-label={action}>
      <p>
        {action} — {file}, {index} of {total} files
      </p>
      <p>{bytes}</p>
      {size !== null ? <progress value={loaded} max={size} /> : <progress />}
    </div>
  );
}
