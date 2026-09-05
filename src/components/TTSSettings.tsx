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
import { cleanText } from '@/lib/utils';

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
          className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-[#00B894] transition-colors"
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
            <Volume2 className="size-4 text-[#00B894]" />
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
                    未检测到可用声音
                    <br />
                    <span className="opacity-60">将自动使用在线语音引擎朗读（需联网）</span>
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
            className="w-full rounded-xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
          >
            <Play className="size-3.5 mr-2" />
            测试声音
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
