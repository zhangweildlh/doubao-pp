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
  },
};
