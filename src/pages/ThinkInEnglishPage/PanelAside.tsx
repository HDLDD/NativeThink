import { thinkTabTint, thinkTabTone } from './thinkTabTones';

type PanelAsideCopy = { tips: { title: string; body: string }[]; footer: string };

/**
 * 单个功能页右侧（窄屏时降到下方）的「怎么练」栏。
 *
 * 为什么要有它：这几页的本体只有一张卡片，卡片到头就是大片空白，
 * 页面看起来像被截断了。旁边的说明既补上了那块空白，也给出了一条
 * 这页到底在练什么的判据——比留白有用。
 *
 * 颜色只取自该功能自己的主色，面积很小（细边框、淡底、小圆点），
 * 不去抢卡片里那张正在练的题。文案按功能分开放下面这张表里。
 */
export const PANEL_ASIDE_COPY: Record<string, PanelAsideCopy> = {
  detector: {
    tips: [
      { title: '先看它替你改的那句', body: '地道说法通常只动两三个词，不是整句重写。' },
      { title: '再看它指出来的差异', body: '中式表达多半是语序和搭配直搬，不是语法错。' },
      { title: '抄一遍胜过读三遍', body: '把改后的句子亲手打一遍，手感比眼熟记得住。' },
    ],
    footer: '让一句英文被母语者一次听懂。',
  },
  translation: {
    tips: [
      { title: '先看见画面，再找词', body: '心里先有那个场景，再从画面直接说英语。' },
      { title: '别逐字对照', body: '一旦一词换一词，就退回翻译了，那是另一页的练习。' },
      { title: '绕过去也算过', body: '卡住就换个更简单的说法说下去，不必停在原句里。' },
    ],
    footer: '想的时候不用先过一遍中文。',
  },
  backTranslation: {
    tips: [
      { title: '先读英文，不查词', body: '靠上下文猜，猜错也比查词典更接近母语状态。' },
      { title: '写完才看原中文', body: '早看就等于抄答案，还原那一步就没了。' },
      { title: '差异就是收获', body: '你还原的与原文差在哪，那里就是你现在的习惯。' },
    ],
    footer: '读英文时，脑子里在说哪一种语言。',
  },
  nativeTranslate: {
    tips: [
      { title: '改腔，不改词库', body: '目标是像本国人说的，不是换成更难的词。' },
      { title: '先出声再落笔', body: '嘴里顺一遍，比直接打字更容易听出别扭。' },
      { title: '一句一改', body: '长句拆开改，别一次重写整段。' },
    ],
    footer: '改完说得出为什么这么改。',
  },
};

export function PanelAside({ tab }: { tab: string }) {
  const copy = PANEL_ASIDE_COPY[tab];
  if (!copy) return null;
  const tone = thinkTabTone(tab);
  return (
    <aside
      className="rounded-3xl border p-5"
      style={{ borderColor: thinkTabTint(tab, '33'), backgroundColor: thinkTabTint(tab, '08') }}
    >
      <div className="mb-4 flex items-center gap-2">
        <span aria-hidden className="size-[5px] rounded-full" style={{ backgroundColor: tone }} />
        <h3 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
          怎么练
        </h3>
      </div>
      <ol className="space-y-4">
        {copy.tips.map((tip, i) => (
          <li key={tip.title} className="flex gap-2.5">
            <span
              className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black tabular-nums"
              style={{ backgroundColor: thinkTabTint(tab, '24'), color: tone }}
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] leading-snug font-bold text-foreground">{tip.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{tip.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p
        className="mt-5 border-t pt-3 text-[11px] leading-relaxed font-medium text-muted-foreground"
        style={{ borderColor: thinkTabTint(tab, '26') }}
      >
        <span className="font-black" style={{ color: tone }}>
          练的是 ·{' '}
        </span>
        {copy.footer}
      </p>
    </aside>
  );
}
