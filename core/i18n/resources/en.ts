// Doubao-pp 英文本地化字典（P3 同构上游 core/i18n/resources/en.ts）
//
// 与 zh-CN 同构结构，提供英文回退。Doubao 当前以中文为主，英文作为 locale 切换的备用。

export interface LocaleMessages {
  [key: string]: string | readonly string[] | LocaleMessages;
}

export const en: LocaleMessages = {
  common: {
    edit: 'Edit',
    delete: 'Delete',
    cancel: 'Cancel',
    save: 'Save',
    update: 'Update',
    saveChanges: 'Save changes',
    enable: 'Enable',
    deactivate: 'Deactivate',
  },
  sidepanel: {
    memory: {
      types: {
        user: 'User',
        feedback: 'Feedback',
        topic: 'Topic',
        reference: 'Reference',
      },
      actions: {
        pin: 'Pin',
        unpin: 'Unpin',
      },
      age: {
        justNow: 'Just now',
        minutesAgo: '{count} minutes ago',
        hoursAgo: '{count} hours ago',
        daysAgo: '{count} days ago',
      },
      form: {
        namePlaceholder: 'Memory name',
        contentPlaceholder: 'Memory content',
        tagsPlaceholder: 'Tags, comma separated',
      },
    },
    skill: {
      sources: {
        builtin: 'Builtin',
        official: 'Official',
        thirdParty: 'Third-party',
        custom: 'Custom',
        remote: 'Remote',
        local: 'Local',
      },
      disabledBadge: 'Disabled',
      actions: {
        disableSkill: 'Disable {name}',
        enableSkill: 'Enable {name}',
        editSkill: 'Edit {name}',
        deleteSkill: 'Delete {name}',
        updateSkill: 'Update',
      },
      memoryEnabledBadge: 'Memory injection',
      form: {
        namePlaceholder: 'Skill name (trigger /name)',
        descriptionPlaceholder: 'One-line description',
        instructionsLabel: 'Instructions',
        instructionsPlaceholder: 'Skill instructions / prompt',
        memoryInjectionLabel: 'Enable memory injection',
        triggerCommand: 'Trigger command',
      },
    },
    preset: {
      activeBadge: 'Active',
      form: {
        namePlaceholder: 'Preset name',
        contentLabel: 'Context content',
        contentPlaceholder: 'Context block injected into the model',
      },
    },
  },
};
