import { useCallback, useRef, useState } from 'react';
import { X, Upload, FileJson } from 'lucide-react';

interface Props {
  onFileSelected: (file: File) => void;
  onClose: () => void;
}

export default function NewGameModal({ onFileSelected, onClose }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    onFileSelected(file);
  }, [onFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-text-primary font-semibold text-lg">New Game</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Instructions */}
        <div className="space-y-2">
          <p className="text-text-secondary text-sm font-medium">How to export your hand history:</p>
          <ol className="text-text-muted text-sm space-y-1.5 list-decimal list-inside">
            <li>Open your game in the <span className="text-text-primary font-medium">PokerNow replayer</span></li>
            <li>Scroll down to the yellow notice: <span className="text-yellow-400/90 font-medium">"Hands are deleted after 5 days!"</span></li>
            <li>Click the <span className="text-text-primary font-medium underline">"clicking here"</span> link to download the JSON</li>
          </ol>
        </div>

        {/* Upload zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200
            ${dragOver
              ? 'border-accent bg-accent/10 scale-[1.01]'
              : 'border-border hover:border-accent/50 hover:bg-bg-secondary'}
          `}
        >
          <div className="flex flex-col items-center gap-3">
            {dragOver ? (
              <FileJson className="w-10 h-10 text-accent" />
            ) : (
              <Upload className="w-10 h-10 text-text-muted" />
            )}
            <div>
              <p className="text-text-primary text-sm font-medium">
                Drop your JSON file here
              </p>
              <p className="text-text-muted text-xs mt-1">or click to browse</p>
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
