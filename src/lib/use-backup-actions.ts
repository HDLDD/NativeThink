import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { exportBackup, importBackup, type IBackupFile } from './backup';
import { emitSyncDown } from './sync-down';
import { safeStorage } from './safe-storage';
import { formatDate } from './utils';

/** 设置页「上次备份」的时间戳；导出成功后写，恢复时随备份文件一起回来 */
export const LAST_BACKUP_KEY = '__nativethink_last_backup_at';

export function readLastBackupAt(): string | null {
  try {
    return safeStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

/**
 * 导出/恢复学习数据的唯一实现。
 *
 * ProgressPage 顶部按钮与 SettingsPage 的「学习数据」区都走这里 ——
 * 两页各自再写一份导出/恢复，迟早会出现一套会刷页面、一套不会，
 * 或者一边重置了报告另一边的失败提示被吞掉。
 */
export function useBackupActions() {
  const [backupBusy, setBackupBusy] = useState(false);
  const backupBusyRef = useRef(false);
  const [backupReport, setBackupReport] = useState('');
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => readLastBackupAt());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportLearningData = useCallback(async () => {
    if (backupBusyRef.current) return;
    backupBusyRef.current = true;
    setBackupBusy(true);
    setBackupReport('');
    try {
      const { file, localStorageCount, idbCount, importedBookCount, idbSkipped } = await exportBackup();
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nativethink-backup-${formatDate(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const summary = `已导出 ${localStorageCount} 项数据、${importedBookCount} 本导入书、${idbCount} 份翻译缓存`;
      const completedAt = new Date().toISOString();
      try { safeStorage.setItem(LAST_BACKUP_KEY, completedAt); } catch { /* 时间戳写失败不影响已导出的文件 */ }
      setLastBackupAt(completedAt);
      setBackupReport(`${summary}${idbSkipped ? '；部分翻译缓存过大或读取失败，已省略，可重新翻译' : ''}`);
      if (idbSkipped) toast.warning('备份已导出，但部分翻译缓存未包含，请查看下方说明');
      else toast.success(summary);
    } catch {
      const message = '导出失败：未能完整读取本地数据，请重试；不要卸载应用';
      setBackupReport(message);
      toast.error(message);
    } finally {
      backupBusyRef.current = false;
      setBackupBusy(false);
    }
  }, []);

  const handleImportFile = useCallback(async (file: File) => {
    if (backupBusyRef.current) return;
    backupBusyRef.current = true;
    setBackupBusy(true);
    setBackupReport('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as IBackupFile;
      const { restored, restoredIdb, restoredBooks, failed, failedIdb, failedBooks } = await importBackup(parsed);
      // 部分恢复不刷新，也必须重读已落盘数据，避免陈旧 hook 下一次写回覆盖它。
      emitSyncDown();
      const summary = `已恢复 ${restored} 项数据、${restoredBooks} 本导入书、${restoredIdb} 份翻译缓存`;
      if (failed + failedIdb + failedBooks > 0) {
        setBackupReport(`${summary}；未恢复 ${failed} 项数据、${failedBooks} 本导入书、${failedIdb} 份翻译缓存。请检查可用存储空间后重新选择备份重试；已恢复的数据不会回滚。`);
        toast.error('部分数据未恢复，请查看下方结果并重试');
        return;
      }
      setBackupReport(summary);
      toast.success(`${summary}，页面即将刷新`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      const message = e instanceof Error && e.message.includes('格式') ? e.message : '恢复失败：文件无法解析或备份组件无法加载';
      setBackupReport(message);
      toast.error(message);
    } finally {
      backupBusyRef.current = false;
      setBackupBusy(false);
    }
  }, []);

  const openImportPicker = useCallback(() => {
    try { fileInputRef.current?.click(); } catch { /* ignore */ }
  }, []);

  return {
    backupBusy,
    backupReport,
    lastBackupAt,
    fileInputRef,
    exportLearningData,
    handleImportFile,
    openImportPicker,
  };
}