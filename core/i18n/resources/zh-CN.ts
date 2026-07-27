// Doubao-pp 中文本地化字典（P3 同构上游 core/i18n/resources/zh-CN.ts）
//
// 覆盖 UI 组件用到的 key（memory/skill/preset/common 等）。开放 LocaleMessages 结构，按需扩展。
// 后续搬运更多上游组件时，仅在此字典补充对应 key 即可，无需改动类型（§8 可搬运）。

export interface LocaleMessages {
  [key: string]: string | readonly string[] | LocaleMessages;
}

export const zhCN: LocaleMessages = {
  common: {
    edit: '编辑',
    delete: '删除',
    cancel: '取消',
    save: '保存',
    update: '更新',
    saveChanges: '保存修改',
    enable: '启用',
    deactivate: '停用',
    saving: '保存中…',
  },
  sidepanel: {
    memory: {
      types: {
        user: '用户',
        feedback: '反馈',
        topic: '话题',
        reference: '参考',
      },
      actions: {
        pin: '置顶',
        unpin: '取消置顶',
      },
      age: {
        justNow: '刚刚',
        minutesAgo: '{count} 分钟前',
        hoursAgo: '{count} 小时前',
        daysAgo: '{count} 天前',
      },
      form: {
        namePlaceholder: '记忆名称',
        contentPlaceholder: '记忆内容',
        tagsPlaceholder: '标签，用逗号分隔',
      },
      pageTitle: '记忆管理',
      newMemory: '新建记忆',
      filterAria: '按类型筛选记忆',
      filters: {
        all: '全部',
      },
      emptyTitle: '还没有记忆',
      emptyDescription: '点击「新建记忆」添加你的第一条用户笔记型记忆。',
    },
    skill: {
      sources: {
        builtin: '内置',
        official: '官方',
        thirdParty: '第三方',
        custom: '自定义',
        remote: '远程',
        local: '本地',
      },
      disabledBadge: '已停用',
      actions: {
        disableSkill: '停用 {name}',
        enableSkill: '启用 {name}',
        editSkill: '编辑 {name}',
        deleteSkill: '删除 {name}',
        updateSkill: '更新',
      },
      memoryEnabledBadge: '记忆注入',
      form: {
        namePlaceholder: '技能名称（触发命令 /name）',
        descriptionPlaceholder: '一句话说明',
        instructionsLabel: '指令内容',
        instructionsPlaceholder: '技能的具体指令 / 提示词',
        memoryInjectionLabel: '启用记忆注入',
        triggerCommand: '触发命令',
      },
      pageTitle: '技能管理',
      newSkill: '新建技能',
      emptyTitle: '还没有技能',
      emptyDescription: '点击「新建技能」添加你的第一个可注入模型的技能。',
    },
    preset: {
      activeBadge: '已激活',
      form: {
        namePlaceholder: '预设名称',
        contentLabel: '上下文内容',
        contentPlaceholder: '该预设要注入模型的上下文块',
      },
      pageTitle: '预设管理',
      newPreset: '新建预设',
      emptyTitle: '还没有预设',
      emptyDescription: '点击「新建预设」保存你的第一个参数组合 / 上下文预设。',
    },
    libraryPage: {
      tabs: {
        memory: '记忆',
        saved: '收藏',
      },
      navLabel: '资料库',
    },
    capabilitiesPage: {
      tabs: {
        skill: '技能',
        mcp: 'MCP',
        tools: '工具',
        browser: '浏览器控制',
        preset: '预设',
        automation: '自动化',
      },
      navLabel: '能力中心',
    },
    settings: {
      title: '设置',
      reset: '恢复默认设置',
      autoInject: '自动注入',
      autoInjectDescription: '在对话中自动注入相关记忆与预设上下文',
      injectionLimit: '注入上限',
      syncStrategy: '同步策略',
      syncLocal: '仅本地',
      syncSync: '云端同步',
      theme: '主题',
      themeLight: '浅色',
      themeDark: '深色',
      themeSystem: '跟随系统',
      saved: '设置已保存',
      resetDone: '已恢复默认设置',
      saveFailed: '保存失败，请重试',
    },
    mcp: {
      title: 'MCP 工具',
      addTool: '添加工具',
      namePlaceholder: '工具名称',
      descriptionPlaceholder: '工具描述',
      cancel: '取消',
      create: '创建',
      created: '工具已创建',
      saveFailed: '保存失败，请重试',
      deleteConfirm: '确定删除工具「{name}」吗？',
      empty: '还没有 MCP 工具',
      emptyHint: '点击「添加工具」注册你的第一个 MCP 工具条目。',
      enabled: '已启用',
      disabled: '已停用',
    },
    projects: {
      title: '项目上下文',
      createProject: '新建项目',
      namePlaceholder: '项目名称',
      descriptionPlaceholder: '项目描述',
      contextPlaceholder: '项目上下文（注入模型的背景信息）',
      save: '保存',
      saved: '项目已保存',
      created: '项目已创建',
      deleteConfirm: '确定删除项目「{name}」吗？',
      empty: '还没有项目上下文',
      emptyHelp: '点击「新建项目」保存你的第一个项目背景上下文。',
    },
  },
};
