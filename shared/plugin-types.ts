// ---- plugin:chinglish_detection_trainer_1 ----
// ============================================================
// 插件 chinglish_detection_trainer_1 (中式英语检测分析器) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface ChinglishDetectionTrainerOneInput {
  /** 待检测的英文句子 */
  english_sentence: string;
}

/**
 * capabilityClient.load('chinglish_detection_trainer_1').call<ChinglishDetectionTrainerOneOutput>('textGenerate', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { content, response } = result;
 */
export interface ChinglishDetectionTrainerOneOutput {
  /** [object Object] */
  content: string;
  /** [object Object] */
  response?: string;
}
// ---- end:chinglish_detection_trainer_1 ----

// ---- plugin:back_translation_feedback_1 ----
// ============================================================
// 插件 back_translation_feedback_1 (反翻译反馈插件) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface BackTranslationFeedbackOneInput {
  /** 用户输入的英文句子 */
  original_sentence: string;
  /** 句子期望表达的中文含义 */
  target_meaning: string;
}

/**
 * capabilityClient.load('back_translation_feedback_1').call<BackTranslationFeedbackOneOutput>('textGenerate', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { content, response } = result;
 */
export interface BackTranslationFeedbackOneOutput {
  /** [object Object] */
  content: string;
  /** [object Object] */
  response?: string;
}
// ---- end:back_translation_feedback_1 ----

// ---- plugin:english_thought_translation_feedback_1 ----
// ============================================================
// 插件 english_thought_translation_feedback_1 (英语思维转译反馈插件) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface EnglishThoughtTranslationFeedbackOneInput {
  /** 用户输入的英语描述内容 */
  user_english_expression: string;
  /** 对应的母语者标准表达内容 */
  native_expression: string;
}

/**
 * capabilityClient.load('english_thought_translation_feedback_1').call<EnglishThoughtTranslationFeedbackOneOutput>('textGenerate', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { content, response } = result;
 */
export interface EnglishThoughtTranslationFeedbackOneOutput {
  /** [object Object] */
  content: string;
  /** [object Object] */
  response?: string;
}
// ---- end:english_thought_translation_feedback_1 ----

// ---- plugin:ai_role_play_english_conversation_1 ----
// ============================================================
// 插件 ai_role_play_english_conversation_1 (AI角色扮演英文对话伙伴) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface AiRolePlayEnglishConversationOneInput {
  /** 对话角色设定（如：咖啡馆服务员、机场海关人员、商务谈判伙伴等） */
  role_setting: string;
  /** 对话场景描述（如：在星巴克点咖啡、入境检查、商务合作洽谈等） */
  scene_description: string;
  /** 用户输入的上一轮对话内容 */
  user_message: string;
  /** 之前的对话历史记录，用于保持对话上下文连贯性 */
  conversation_history?: string;
  /** 对话难度等级（如：初级、中级、高级） */
  difficulty_level: string;
}

/**
 * capabilityClient.load('ai_role_play_english_conversation_1').call<AiRolePlayEnglishConversationOneOutput>('textGenerate', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { content, response } = result;
 */
export interface AiRolePlayEnglishConversationOneOutput {
  /** [object Object] */
  content: string;
  /** [object Object] */
  response?: string;
}
// ---- end:ai_role_play_english_conversation_1 ----