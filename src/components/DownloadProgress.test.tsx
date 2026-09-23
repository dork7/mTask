import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DownloadProgress } from './DownloadProgress';

describe('DownloadProgress', () => {
  it('renders nothing when there is no progress', () => {
    const { container } = render(<DownloadProgress progress={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows which file of the bundle is downloading', () => {
    render(
      <DownloadProgress progress={{ file: 'laya.onnx.data', index: 2, total: 5, loaded: 0, size: 1685258240, source: 'network' }} />,
    );
    expect(screen.getByText(/laya\.onnx\.data/)).toBeInTheDocument();
    expect(screen.getByText(/2 of 5 files/)).toBeInTheDocument();
  });

  it('shows bytes received against the file size, with a percent', () => {
    render(
      <DownloadProgress
        progress={{ file: 'laya.onnx.data', index: 2, total: 5, loaded: 842629120, size: 1685258240, source: 'network' }}
      />,
    );
    expect(screen.getByText(/842\.6 MB of 1\.69 GB \(50%\)/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '842629120');
  });

  it('shows only bytes received when the file size is unknown', () => {
    render(<DownloadProgress progress={{ file: 'laya.onnx', index: 1, total: 5, loaded: 1500000, size: null, source: 'network' }} />);
    expect(screen.getByText(/1\.5 MB received/)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('says the model is being read from the cache rather than downloaded', () => {
    render(
      <DownloadProgress
        progress={{ file: 'laya.onnx.data', index: 2, total: 5, loaded: 1685258240, size: 1685258240, source: 'cache' }}
      />,
    );
    expect(screen.getByText(/from cache/i)).toBeInTheDocument();
    expect(screen.queryByText(/downloading/i)).not.toBeInTheDocument();
  });

  it('says the model is downloading when it comes from the network', () => {
    render(
      <DownloadProgress progress={{ file: 'laya.onnx', index: 1, total: 5, loaded: 10, size: 100, source: 'network' }} />,
    );
    expect(screen.getByText(/downloading/i)).toBeInTheDocument();
  });
});
