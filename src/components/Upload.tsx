import { useCallback, useState } from 'react';
import { Upload as UploadIcon, FileJson } from 'lucide-react';
import type { PokerNowExport } from '../lib/types';

interface Props {
  onUpload: (data: PokerNowExport) => void;
}

export default function Upload({ onUpload }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as PokerNowExport;
        if (!data.hands || !Array.isArray(data.hands)) {
          throw new Error('Invalid format: missing "hands" array');
        }
        onUpload(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse JSON');
      }
    };
    reader.readAsText(file);
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="mb-12 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-text-primary mb-3">
          <span className="text-accent">Poker</span>Scope
        </h1>
        <p className="text-text-secondary text-lg">Poker Now hand history analyzer</p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`
          w-full max-w-lg border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
          transition-all duration-200
          ${dragOver
            ? 'border-accent bg-accent/10 scale-[1.02]'
            : 'border-border-light hover:border-accent/50 hover:bg-bg-card'}
        `}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json';
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) handleFile(file);
          };
          input.click();
        }}
      >
        <div className="flex flex-col items-center gap-4">
          {dragOver ? (
            <FileJson className="w-12 h-12 text-accent" />
          ) : (
            <UploadIcon className="w-12 h-12 text-text-muted" />
          )}
          <div>
            <p className="text-text-primary font-medium mb-1">
              Drop your Poker Now JSON file here
            </p>
            <p className="text-text-muted text-sm">or click to browse</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 px-4 py-2 bg-stat-red/10 border border-stat-red/30 rounded-lg text-stat-red text-sm">
          {error}
        </div>
      )}

      <p className="mt-8 text-text-muted text-xs">
        All analysis runs locally — no data leaves your browser
      </p>
    </div>
  );
}
