/**
 * 「母语思维训练」一个功能一个颜色。
 *
 * 这七个色是**一套**，不是七个亮片：同样压低饱和度、同样压暗明度、同样偏一点灰。
 * 单独看是「深青 / 赭 / 蓝灰 / 紫灰 / 陈玫 / 墨绿 / 陶土」，并排不会互相抢。
 * 颜色只出现在很小的面积上（小圆点、细线、返回条），大面积留白给纸色。
 */
export const THINK_TAB_TONES: Record<string, string> = {
  patterns: '#2F6F6A', // 深青
  detector: '#8A6430', // 赭
  translation: '#34557A', // 蓝灰
  backTranslation: '#5A4A78', // 紫灰
  nativeTranslate: '#8C4553', // 陈玫
  extras: '#3D6A4E', // 墨绿
  longTask: '#96593A', // 陶土
};
/** 同色的淡底 / 描边：alpha 是两位十六进制（'0F' 很淡，'26' 中等） */
export function thinkTabTint(tab: string, alpha: string = '0F'): string {
  const tone = THINK_TAB_TONES[tab];
  return tone ? `${tone}${alpha}` : 'var(--brand)';
}

/** 该功能的主色；查不到（比如首页）退回品牌色 */
export function thinkTabTone(tab: string): string {
  return THINK_TAB_TONES[tab] ?? 'var(--brand)';
}


/** 功能的中文名，返回条与首页卡片共用，避免两处写法漂移 */
export const THINK_TAB_LABELS: Record<string, string> = {
  patterns: '模式训练',
  detector: '检测',
  translation: '转译',
  backTranslation: '反翻译',
  nativeTranslate: '还原',
  extras: '加练',
  longTask: '长文 · 对话',
};

export function thinkTabLabel(tab: string): string {
  return THINK_TAB_LABELS[tab] ?? '全部功能';
}
