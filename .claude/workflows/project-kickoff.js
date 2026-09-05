export const meta = {
  name: 'project-kickoff',
  description: '多 agent 并行分析项目：结构、代码质量、TODO、安全、文档、测试',
  phases: [
    { title: 'Scan', detail: '6 个 agent 并行扫描项目' },
    { title: 'Report', detail: '汇总所有发现，生成报告' }
  ]
}

const projectDir = args?.dir || '.'

const [structure, codeReview, todos, security, docs, tests] = await parallel([
  () => agent(
    `分析项目 ${projectDir} 的结构。检查：
    1. 目录结构和组织方式
    2. 使用的技术栈和框架
    3. 入口文件和主要模块
    4. 配置文件（package.json, tsconfig.json 等）
    5. 项目规模（文件数、代码行数估计）
    输出简洁的项目概览。`,
    { label: '🏗️ 结构分析', phase: 'Scan' }
  ),

  () => agent(
    `审查项目 ${projectDir} 的代码质量。重点关注：
    1. 找到主要的源代码文件（排除 node_modules, .git, dist 等）
    2. 检查代码风格一致性
    3. 检查是否有明显的代码异味（过长函数、重复代码、深层嵌套）
    4. 检查错误处理是否完善
    5. 检查是否有调试代码残留（console.log, print 等）
    输出发现的问题列表，按严重程度排序。`,
    { label: '🔍 代码审查', phase: 'Scan' }
  ),

  () => agent(
    `搜索项目 ${projectDir} 中所有的 TODO、FIXME、HACK、XXX、WORKAROUND 标记。
    对每个发现：
    1. 记录文件路径和行号
    2. 分类（bug修复/功能添加/重构/临时方案）
    3. 评估优先级（高/中/低）
    输出结构化的待办清单。`,
    { label: '📋 TODO 追踪', phase: 'Scan' }
  ),

  () => agent(
    `检查项目 ${projectDir} 的安全隐患：
    1. 硬编码的密钥、密码、token（排除 .env.example 等模板文件）
    2. 依赖项是否有已知漏洞（检查 lock 文件中的版本）
    3. SQL 注入风险（如果有数据库操作）
    4. XSS 风险（如果有前端代码）
    5. 不安全的文件操作或路径遍历
    6. 敏感信息是否在 .gitignore 中
    输出安全报告，按风险等级分类。`,
    { label: '🔒 安全检查', phase: 'Scan' }
  ),

  () => agent(
    `检查项目 ${projectDir} 的文档覆盖情况：
    1. 是否有 README.md，内容是否完整（安装/使用/贡献指南）
    2. 是否有 API 文档或接口说明
    3. 关键函数和模块是否有注释
    4. 是否有 CHANGELOG 或版本记录
    5. 是否有 LICENSE 文件
    6. 配置文件是否有说明注释
    输出文档缺失清单和改进建议。`,
    { label: '📝 文档检查', phase: 'Scan' }
  ),

  () => agent(
    `检查项目 ${projectDir} 的测试情况：
    1. 是否有测试目录或测试文件
    2. 测试框架是什么（jest, pytest, mocha 等）
    3. 测试文件与源代码的比例
    4. 是否有 CI/CD 配置（GitHub Actions, GitLab CI 等）
    5. 是否有测试覆盖率配置
    6. 关键模块是否有对应测试
    输出测试状况报告和改进建议。`,
    { label: '🧪 测试检查', phase: 'Scan' }
  )
])

log('所有 agent 扫描完成，正在生成汇总报告...')

return `
# 📊 项目健康报告

## 🏗️ 项目结构
${structure}

## 🔍 代码质量
${codeReview}

## 📋 待办事项 (TODO/FIXME)
${todos}

## 🔒 安全检查
${security}

## 📝 文档状况
${docs}

## 🧪 测试覆盖
${tests}

---
*报告由 Project Kickoff 多 Agent 工作流自动生成*
`
