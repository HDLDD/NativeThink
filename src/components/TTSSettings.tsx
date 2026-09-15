/**
 * TTS Settings popover — voice selection and playback rate.
 * Shown as an icon button in the Header toolbar.
 */

import { useState, useEffect, useCallback } from 'react';
import { Volume2, Gauge, Play } from 'lucide-react';
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
import { isSfxEnabled, setSfxEnabled, sfxTick } from '@/lib/sfx';
import { toast } from 'sonner';
import { EDGE_VOICE_CATALOG } from '@/lib/tts-voice-catalog';
import {
  isAndroidNative,
  listNativeEnglishVoices,
  openNativeTtsInstall,
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
  const [loadingNative, setLoadingNative] = useState(false);
  const isNative = isAndroidNative();

  useEffect(() => {
    if (!open || !isNative) return;
    let cancelled = false;
    setLoadingNative(true);
    listNativeEnglishVoices()
      .then((list) => { if (!cancelled) setNativeVoices(list); })
      .finally(() => { if (!cancelled) setLoadingNative(false); });
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
          {/* Voice selector */}
          <div className="space-y-2">
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
              内置在线语音 <span className="text-muted-foreground/60 normal-case font-bold">推荐 · 音质好 · 需联网</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
              {EDGE_VOICE_CATALOG.map((v) => {
                const active = settings.selectedVoiceURI === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => {
                      updateSettings({ selectedVoiceURI: v.id });
                      // 立即用所选声音试听（走 Edge 通道）
                      try {
                        const base = (window as any).__API_BASE__ || '';
                        const a = new Audio(`${base}/api/tts?text=${encodeURIComponent('Hello, this is a quick voice test.')}&rate=${settings.rate.toFixed(2)}&voice=${encodeURIComponent(v.id)}`);
                        a.volume = settings.volume;
                        a.play().catch(() => toast.info('已选择该声音，点「测试声音」可试听'));
                      } catch { /* ignore */ }
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
                      {v.accent} · {v.gender === 'female' ? '女声' : '男声'}{active ? ' · 已选' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            {settings.selectedVoiceURI && EDGE_VOICE_CATALOG.some((v) => v.id === settings.selectedVoiceURI) && (
              <button
                onClick={() => updateSettings({ selectedVoiceURI: null })}
                className="text-[9px] font-bold text-muted-foreground hover:text-ink-teal transition-colors"
              >
                取消选择，改回自动
              </button>
            )}
          </div>

          {/* 系统语音（Android）— WebView 无语音列表，这里枚举系统 TTS 引擎的英语语音 */}
          {isNative && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>系统语音引擎</span>
                {loadingNative && <span className="text-[9px] font-bold text-muted-foreground/60">读取中…</span>}
              </label>
              {nativeVoices.length > 0 ? (
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
                        {nv.name} ({nv.lang}){nv.isDefault ? ' · 默认' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
