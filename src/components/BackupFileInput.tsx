import type { RefObject } from 'react';

/** 隐藏的备份文件选择器：ProgressPage 与 SettingsPage 共用，避免两页各写一份 onChange */
export function BackupFileInput({
  inputRef,
  onFile,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void | Promise<void>;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="application/json,.json"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void onFile(file);
        event.target.value = '';
      }}
    />
  );
}