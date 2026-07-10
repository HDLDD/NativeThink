// Plugin instance IDs for AI-powered features
export const PLUGIN_IDS = {
  /** 中式英语检测分析器 */
  CHINGLISH_DETECTION: 'chinglish_detection_trainer_1',
  /** 英语思维转译反馈 */
  THOUGHT_TRANSLATION: 'english_thought_translation_feedback_1',
  /** 反翻译反馈 */
  BACK_TRANSLATION: 'back_translation_feedback_1',
  /** AI角色扮演英文对话伙伴 */
  AI_CONVERSATION: 'ai_role_play_english_conversation_1',
  /** 对话地道度分析 */
  NATURALNESS_ANALYSIS: 'dialogue_naturalness_analysis_1',
} as const;

export type PluginId = (typeof PLUGIN_IDS)[keyof typeof PLUGIN_IDS];
