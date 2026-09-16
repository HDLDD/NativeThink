/**
 * TTS Settings popover — voice selection and playback rate.
 * Shown as an icon button in the Header toolbar.
 */

import { useState, useEffect, useCallback } from 'react';
import { Volume2, Gauge, Play, Activity, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTTSSettings, getEnglishVoices } from '@/lib/tts-settings';
import { previewTtsVoice, probeTtsEngines, getLastTtsReport, type ITtsEngineProbe, type ITtsPlaybackReport } from '@/lib/use-tts';
import { getSherpaStatus, warmSherpa, type ISherpaStatus } from '@/lib/sherpa-tts';
import { isSfxEnabled, setSfxEnabled, sfxTick } from '@/lib/sfx';
import { toast } from 'sonner';
import { EDGE_VOICE_CATALOG } from '@/lib/tts-voice-catalog';
import {
  isAndroidNative,
  listNativeEnglishVoices,
  openNativeTtsInstall,
  pickPreferredEnglishVoice,
  nativeVoiceLabel,
  previewNativeVoice,
  type INativeVoice,
} from '@/lib/native-tts';
import { cleanText, cn } from '@/lib/utils';

/** Unified voice option: browser SpeechSynthesis voice OR local-server voice */
interface VoiceOption {
  uri: string;
  name: string;
  lang: string;
  source: 'system' | 'server';
}

/** Merge voice lists by uri, keeping first occurrence; English first */
function mergeVoices(prev: VoiceOption[], next: VoiceOption[]): VoiceOption[] {
  const seen = new Set<string>();
  const out: VoiceOption[] = [];
  for (const v of [...next, ...prev]) {
    if (seen.has(v.uri)) continue;
    seen.add(v.uri);
    out.push(v);
  }
  const rank = (v: VoiceOption) =>
    (v.source === 'server' ? 0 : 1) * 10 +
    (v.lang.startsWith('en') ? 0 : v.lang.startsWith('zh') ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}

export default function TTSSettings() {
  const { settings, updateSettings } = useTTSSettings();
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [open, setOpen] = useState(false);
  // 提示音效开关（答对/答错/拼写完成等反馈音）
  const [sfxOn, setSfxOn] = useState(isSfxEnabled);
  // 系统原生语音（Android）：WebView 的 speechSynthesis 列表为空，只能从原生插件取
  const [nativeVoices, setNativeVoices] = useState<INativeVoice[]>([]);
  /** 未手动选语音时，朗读实际会自动使用的本地音色（用于设置页如实回显） */
  const [autoVoice, setAutoVoice] = useState<INativeVoice | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeResults, setProbeResults] = useState<ITtsEngineProbe[] | null>(null);
  const [loadingNative, setLoadingNative] = useState(false);
  /** 上次朗读实测（引擎 + 起播耗时）—— 判断慢在离线引擎还是联网合成 */
  const [lastReport, setLastReport] = useState<ITtsPlaybackReport | null>(null);
  /** 内置离线引擎状态 */
  const [sherpa, setSherpa] = useState<ISherpaStatus | null>(null);
  const isNative = isAndroidNative();

  useEffect(() => {
    if (!open) return;
    setLastReport(getLastTtsReport());
    const t = setInterval(() => setLastReport(getLastTtsReport()), 1000);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (!open || !isNative) return;
    let cancelled = false;
    const tick = () => { getSherpaStatus().then((s) => { if (!cancelled) setSherpa(s); }); };
    tick();
    const t = setInterval(tick, 1500);
    return () => { cancelled = true; clearInterval(t); };
  }, [open, isNative]);

  useEffect(() => {
    if (!open || !isNative) return;
    let cancelled = false;
    setLoadingNative(true);
    listNativeEnglishVoices()
      .then((list) => { if (!cancelled) setNativeVoices(list); })
      .finally(() => { if (!cancelled) setLoadingNative(false); });
    pickPreferredEnglishVoice()
      .then((v) => { if (!cancelled) setAutoVoice(v); });
    return () => { cancelled = true; };
  }, [open, isNative]);

  const fromSystemVoices = (list: SpeechSynthesisVoice[]): VoiceOption[] =>
    list.map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang, source: 'system' as const }));

  // Load voices on mount + listen for changes.
  // Electron/Chrome populate voices asynchronously and voiceschanged may never
  // fire — poll a few times, then fall back to ALL voices if no English ones.
  useEffect(() => {
    const loadAll = () => {
      try {
        const all = window.speechSynthesis?.getVoices?.() || [];
        if (all.length > 0) setVoices((prev) => mergeVoices(prev, fromSystemVoices(all)));
      } catch { /* ignore */ }
    };
    const load = () => {
      const en = getEnglishVoices();
      if (en.length > 0) setVoices((prev) => mergeVoices(prev, fromSystemVoices(en)));
    };
    // Desktop build only: enumerate the local server's voices (Edge neural + SAPI)
    fetch('/api/tts-voices').then((r) => r.ok ? r.json() : null).then((data) => {
      const serverVoices: VoiceOption[] = (data?.voices || []).map((v: { id: string; name: string; lang: string }) => ({
        uri: v.id, name: v.name, lang: v.lang, source: 'server' as const,
      }));
      if (serverVoices.length > 0) setVoices((prev) => mergeVoices(prev, serverVoices));
    }).catch(() => { /* web version — no local server */ });
    load();
    const p1 = setTimeout(load, 400);
    const p2 = setTimeout(load, 1200);
    const p3 = setTimeout(() => { load(); if (getEnglishVoices().length === 0) loadAll(); }, 2400);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', load);
      return () => {
        [p1, p2, p3].forEach(clearTimeout);
        window.speechSynthesis.removeEventListener('voiceschanged', load);
      };
    }
    return () => [p1, p2, p3].forEach(clearTimeout);
  }, []);

  // Reload voices when popover opens (mobile WebViews often need a user-gesture
  // context to populate the voice list, and voiceschanged may not fire reliably)
  useEffect(() => {
    if (open && voices.length === 0) {
      const tryLoad = () => {
        const available = getEnglishVoices();
        if (available.length > 0) setVoices((prev) => mergeVoices(prev, fromSystemVoices(available)));
      };
      tryLoad();
      // Retry after a short delay for slow-loading mobile browsers
      const t1 = setTimeout(tryLoad, 300);
      const t2 = setTimeout(tryLoad, 800);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [open, voices.length]);

  const testVoice = useCallback(() => {
    const selected = voices.find((v) => v.uri === settings.selectedVoiceURI);
    // Server-sourced voice → play synthesized audio from the local server
    if (selected?.source === 'server' || settings.selectedVoiceURI?.startsWith('srv:')) {
      const a = new Audio(`/api/tts?text=${encodeURIComponent('Hello, this is a quick voice test.')}&rate=${settings.rate}&voice=${encodeURIComponent(settings.selectedVoiceURI || '')}`);
      a.play().catch(() => { /* autoplay blocked */ });
      return;
    }
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(cleanText('Hello, this is a quick voice test.'));
    u.lang = 'en-US';
    u.rate = settings.rate;

    // Apply selected voice
    if (selected && selected.source === 'system') {
      const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === selected.uri);
      if (voice) u.voice = voice;
    } else {
      // Auto-select best voice for test
      const best = voices.find((v) => v.source === 'system');
      if (best) {
        const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === best.uri);
        if (voice) u.voice = voice;
      }
    }

    window.speechSynthesis.speak(u);
  }, [settings.rate, settings.selectedVoiceURI, voices]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="TTS 朗读设置"
          className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-ink-teal transition-colors"
        >
          <Volume2 className="size-4.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={12}
        className="w-72 rounded-[24px] border-border shadow-lg p-0 overflow-hidden"
      >
        <div className="p-5 border-b border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10">
          <h4 className="text-sm font-black text-foreground flex items-center gap-2">
            <Volume2 className="size-4 text-ink-teal" />
            TTS 朗读设置
          </h4>
        </div>

        <div className="p-5 space-y-5">
          {/* Voice selector —— 手机（Android WebView）没有浏览器语音，隐藏以免误导 */}
          <div className={cn('space-y-2', isNative && 'hidden')}>
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              朗读声音
            </label>
            <Select
              value={settings.selectedVoiceURI ?? '__auto__'}
              onValueChange={(v) =>
                updateSettings({ selectedVoiceURI: v === '__auto__' ? null : v })
              }
            >
              <SelectTrigger className="w-full rounded-xl text-xs font-bold h-10 border-border bg-muted/50">
                <SelectValue placeholder="自动选择最佳声音" />
              </SelectTrigger>
              <SelectContent className="rounded-xl max-h-64 [&_[data-slot=select-viewport]]:h-auto [&_[data-slot=select-viewport]]:max-h-60">
                <SelectItem value="__auto__" className="text-xs font-bold">
                  自动选择 (推荐)
                </SelectItem>
                {voices.length === 0 && (
                  <div className="px-2 py-3 text-[10px] text-muted-foreground text-center leading-relaxed">
                    未检测到浏览器语音
                    <br />
                    <span className="opacity-60">
                      {isNative ? '手机请用上方「系统语音引擎」选择声音' : '将自动使用在线语音引擎朗读（需联网）'}
                    </span>
                  </div>
                )}
                {voices.filter((v) => v.source === 'server').length > 0 && (
                  <div className="px-2 pt-2 pb-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                    在线神经语音
                  </div>
                )}
                {voices.filter((v) => v.source === 'server').map((v) => (
                  <SelectItem key={v.uri} value={v.uri} className="text-xs font-medium">
                    {v.name} ({v.lang})
                  </SelectItem>
                ))}
                {voices.filter((v) => v.source === 'system').length > 0 && (
                  <div className="px-2 pt-2 pb-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                    系统语音
                  </div>
                )}
                {voices.filter((v) => v.source === 'system').map((v) => (
                  <SelectItem key={v.uri} value={v.uri} className="text-xs font-medium">
                    {v.name} ({v.lang})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 内置在线神经语音 — 不依赖系统语音，所有平台都能选（需联网） */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              朗读声音 · 内置在线语音 <span className="text-muted-foreground/60 normal-case font-bold">推荐 · 音质好 · 需联网</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
              {EDGE_VOICE_CATALOG.map((v) => {
                const active = settings.selectedVoiceURI === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={async () => {
                      updateSettings({ selectedVoiceURI: v.id });
                      setPreviewing(v.id);
                      const mode = await previewTtsVoice(v.id, settings.rate, settings.volume);
                      setPreviewing(null);
                      if (mode === 'accent') {
                        toast.info('当前网络下该音色不可用，已按口音朗读（男女声需 Edge 通道）', { duration: 3000 });
                      } else if (mode === 'failed') {
                        toast.error('试听失败，请检查网络');
                      }
                    }}
                    className={cn(
                      'px-2 py-1.5 rounded-xl text-[10px] font-bold text-left transition-all border',
                      active
                        ? 'border-[#00B894] text-ink-teal bg-[#00B894]/5'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/30',
                    )}
                  >
                    <span className="block truncate">{v.name}</span>
                    <span className="block text-[8px] font-bold opacity-60">
                      {previewing === v.id ? '试听中…' : `${v.accent} · ${v.gender === 'female' ? '女声' : '男声'}${active ? ' · 已选' : ''}`}
                    </span>
                  </button>
                );
              })}
            </div>
            {settings.selectedVoiceURI && EDGE_VOICE_CATALOG.some((v) => v.id === settings.selectedVoiceURI) && (
              <>
                {/* 在线音色每次朗读都要联网把文本发去合成 —— 网速差时等待会明显变长，
                    而系统本地音色是设备内合成、起播几十毫秒、与网速无关。 */}
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-1.5">
                  <p className="text-[9px] font-bold text-amber-700 dark:text-amber-300 leading-relaxed">
                    当前用的是<b>在线音色</b>，每次朗读都要联网合成音频 —— 网速慢时等待会明显拉长
                    （已读过的句子会缓存，首次朗读最慢）。
                  </p>
                  {isNative && autoVoice && (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => {
                        updateSettings({
                          selectedVoiceURI: null,
                          nativeVoiceIndex: autoVoice.index,
                          nativeVoiceName: autoVoice.name,
                        });
                        toast.success(`已改用本地音色「${autoVoice.name}」· 离线、起播几十毫秒`);
                      }}
                      className="w-full rounded-xl text-[10px] font-black"
                    >
                      改用本地音色「{autoVoice.name}」· 不受网速影响
                    </Button>
                  )}
                </div>
                <button
                  onClick={() => updateSettings({ selectedVoiceURI: null })}
                  className="text-[9px] font-bold text-muted-foreground hover:text-ink-teal transition-colors"
                >
                  取消选择，改回自动
                </button>
              </>
            )}
          </div>

          {/* 内置离线朗读引擎（安卓）—— 设备内合成、不联网；装没装好一眼可见 */}
          {isNative && (
            <div className="p-2.5 rounded-xl bg-muted/50 border border-border space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">内置离线引擎</span>
                <span className={cn(
                  'text-[9px] font-black px-2 py-0.5 rounded-full',
                  sherpa?.status === 'ready' ? 'bg-[#00B894]/10 text-[#00B894]'
                    : sherpa?.status === 'error' ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'
                      : 'bg-muted text-muted-foreground',
                )}>
                  {sherpa?.status === 'ready' ? '已就绪' : sherpa?.status === 'loading' ? '加载中…' : sherpa?.status === 'error' ? '加载失败' : '未加载'}
                </span>
              </div>
              <p className="text-[9px] font-bold text-muted-foreground leading-snug">
                {sherpa?.status === 'ready'
                  ? `设备内合成，不走网络 · 采样率 ${sherpa.sampleRate}Hz · 已缓存 ${sherpa.cached} 段`
                  : sherpa?.status === 'error'
                    ? `失败原因：${sherpa.error || '未知'}`
                    : '未选择在线音色时，朗读会用这个引擎（首次加载约 1~2 秒）'}
              </p>
              {sherpa?.status !== 'ready' && (
                <Button
                  size="sm" variant="outline"
                  onClick={() => { void warmSherpa(); toast.info('正在加载内置朗读引擎…'); }}
                  className="w-full rounded-xl text-[10px] font-black"
                >
                  立即加载内置引擎
                </Button>
              )}
            </div>
          )}

          {/* 系统语音（Android）— WebView 无语音列表，这里枚举系统 TTS 引擎的英语语音 */}
          {isNative && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>系统语音引擎</span>
                {loadingNative && <span className="text-[9px] font-bold text-muted-foreground/60">读取中…</span>}
              </label>
              {nativeVoices.length > 0 ? (
                <>
                <Select
                  value={settings.nativeVoiceIndex === null ? '__default__' : String(settings.nativeVoiceIndex)}
                  onValueChange={(v) => {
                    const idx = v === '__default__' ? null : Number(v);
                    const name = idx === null ? null : (nativeVoices.find((nv) => nv.index === idx)?.name ?? null);
                    updateSettings({ nativeVoiceIndex: idx, nativeVoiceName: name });
                    previewNativeVoice(idx, settings.rate, settings.volume);
                  }}
                >
                  <SelectTrigger className="w-full rounded-xl text-xs font-bold h-10 border-border bg-muted/50">
                    <SelectValue placeholder="系统默认语音" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-64 [&_[data-slot=select-viewport]]:h-auto [&_[data-slot=select-viewport]]:max-h-60">
                    <SelectItem value="__default__" className="text-xs font-bold">系统默认语音</SelectItem>
                    {nativeVoices.map((nv) => (
                      <SelectItem key={nv.index} value={String(nv.index)} className="text-xs font-medium">
                        {nativeVoiceLabel(nv)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* 未手动选语音时，朗读会自动改用本地音色 —— 网络音色每次合成都要联网（约 2 秒） */}
                {settings.nativeVoiceIndex === null && autoVoice && (
                  <p className="text-[9px] font-bold text-[#00B894] leading-snug">
                    未手动选择 · 朗读时自动使用本地音色「{autoVoice.name}」(离线 · 低延迟)
                  </p>
                )}
                {settings.nativeVoiceIndex === null && !autoVoice && (
                  <p className="text-[9px] font-bold text-amber-600 dark:text-amber-400 leading-snug">
                    未找到本地英语音色 —— 当前只能走网络音色，每次朗读需联网（约 2 秒）。
                    装上英语语音包后可离线朗读、起播几十毫秒。
                  </p>
                )}
                <label className="flex items-center justify-between gap-2 pt-1 cursor-pointer">
                  <span className="text-[10px] font-bold text-muted-foreground leading-snug">
                    只用系统引擎<span className="block text-[9px] opacity-70">离线、几十毫秒；不走网络</span>
                  </span>
                  <button
                    role="switch"
                    aria-checked={settings.preferNative}
                    onClick={() => updateSettings({ preferNative: !settings.preferNative })}
                    className={cn(
                      'relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0',
                      settings.preferNative ? 'bg-[#00B894]' : 'bg-muted-foreground/30',
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform duration-200',
                      settings.preferNative ? 'translate-x-[18px]' : 'translate-x-0.5',
                    )} />
                  </button>
                </label>
                </>
              ) : !loadingNative ? (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 space-y-2">
                  <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-relaxed">
                    手机未检测到英语语音引擎 — 朗读会改用在线语音（需联网）。
                    安装系统语音包后可离线朗读、音质更好。
                  </p>
                  <Button
                    size="sm" variant="outline"
                    onClick={async () => { const ok = await openNativeTtsInstall(); if (!ok) toast.info('请到 系统设置 → 更多设置 → 文字转语音 安装英语语音'); }}
                    className="w-full rounded-xl text-[10px] font-black"
                  >
                    打开系统语音设置
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          {/* 上次朗读实测 —— 手机上没法开控制台，这条回显就是判断"慢在哪一段"的现场证据 */}
          <div className="p-2.5 rounded-xl bg-muted/50 border border-border space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">上次朗读实测</p>
            {lastReport ? (
              <p className="text-[10px] font-bold text-foreground leading-relaxed">
                {lastReport.engine === 'piper' ? (
                  <>
                    内置离线引擎（<span className="text-[#00B894]">设备内合成，与网速无关</span>）· 起播 {lastReport.firstAudioMs}ms
                    {lastReport.firstAudioMs > 400 && ' — 首次朗读含模型加载，之后会更快'}
                  </>
                ) : lastReport.engine === 'native' ? (
                  <>
                    系统引擎（<span className="text-[#00B894]">离线，与网速无关</span>）· 起播 {lastReport.firstAudioMs}ms
                    {lastReport.firstAudioMs > 600 && ' — 偏慢，多半是所选音色为网络音色'}
                  </>
                ) : (
                  <>
                    <span className="text-amber-600 dark:text-amber-400">
                      {lastReport.engine === 'cf' ? '云端' : lastReport.engine === 'edge' ? 'Edge 直连' : 'Google 直连'}
                      （需联网）
                    </span>
                    · 起播 {lastReport.firstAudioMs}ms
                    {lastReport.firstAudioMs > 800 && ' — 慢在联网合成，与网速相关'}
                  </>
                )}
                {lastReport.fellBack && '（上一档引擎失败后降级到此）'}
              </p>
            ) : (
              <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">
                还没有记录 —— 点一次「试听」或朗读一句，这里就会显示实际走的是离线引擎还是联网合成。
              </p>
            )}
            <p className="text-[9px] font-bold text-muted-foreground/70 leading-snug">
              刚读过的句子会命中缓存、起播极快（几毫秒），所以要看真实速度请<b>读一句没读过的</b>：
              起播几十毫秒＝离线引擎（与网速无关）；几百毫秒以上＝联网合成（会随网速波动）。
            </p>
          </div>

          {/* Rate slider */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Gauge className="size-3.5" />
              播放速度
            </label>
            <div className="flex items-center gap-3">
              <Slider
                value={[settings.rate]}
                onValueChange={(v) => updateSettings({ rate: v[0] })}
                min={0.5}
                max={1.5}
                step={0.1}
                className="flex-1"
              />
              <span className="text-xs font-black text-foreground tabular-nums w-10 text-right">
                {settings.rate.toFixed(1)}x
              </span>
            </div>
            <div className="flex gap-1.5">
              {[0.75, 0.9, 1.0, 1.25].map((r) => (
                <button
                  key={r}
                  onClick={() => updateSettings({ rate: r })}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                    settings.rate === r
                      ? 'bg-[#00B894] text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>

          {/* Test button */}
          <Button
            variant="outline"
            size="sm"
            onClick={testVoice}
            className="w-full rounded-xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-ink-teal"
          >
            <Play className="size-3.5 mr-2" />
            测试声音
          </Button>

          {/* 朗读自检：手机"点了不朗读"时用来定位是哪条通道的问题 */}
          <Button
            variant="outline"
            size="sm"
            disabled={probing}
            onClick={async () => {
              setProbing(true);
              setProbeResults(null);
              try { setProbeResults(await probeTtsEngines(settings.rate)); }
              finally { setProbing(false); }
            }}
            className="w-full rounded-xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-ink-teal"
          >
            {probing ? <Loader2 className="size-3.5 mr-2 animate-spin" /> : <Activity className="size-3.5 mr-2" />}
            {probing ? '自检中…' : '朗读自检'}
          </Button>
          {probeResults && (
            <div className="rounded-xl border border-border bg-muted/30 p-2.5 space-y-1">
              {probeResults.map((r) => (
                <div key={r.engine} className="flex items-center justify-between gap-2 text-[10px] font-bold">
                  <span className="flex items-center gap-1.5">
                    <span className={r.ok ? 'text-emerald-500' : 'text-rose-500'}>{r.ok ? '✓' : '✗'}</span>
                    <span className="text-foreground">
                      {{ native: '系统语音引擎', cloud: '云端语音', edge: 'Edge 直连', google: 'Google 直连', webspeech: '浏览器语音' }[r.engine]}
                    </span>
                  </span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {r.ms}ms{r.note ? ` · ${r.note}` : ''}
                  </span>
                </div>
              ))}
              <p className="text-[9px] text-muted-foreground/70 pt-1 leading-relaxed">
                只要有任一项 ✓ 即可朗读；全 ✗ 说明当前网络与设备都不具备条件
              </p>
            </div>
          )}

          {/* 提示音效开关（答题正误 / 拼写完成等） */}
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">提示音效</p>
              <p className="text-[9px] text-muted-foreground/60 mt-0.5">答题正误、拼写完成等反馈音</p>
            </div>
            <button
              role="switch"
              aria-checked={sfxOn}
              onClick={() => { const v = !sfxOn; setSfxOn(v); setSfxEnabled(v); if (v) sfxTick(); }}
              className={cn(
                'relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0',
                sfxOn ? 'bg-[#00B894]' : 'bg-muted-foreground/30',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform duration-200',
                  sfxOn ? 'translate-x-[18px]' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
