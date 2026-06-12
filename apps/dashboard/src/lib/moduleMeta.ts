const MODULE_META = {
  codepolice: {
    icon: 'policy',
    headerToneClasses: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
  },
  moderation: {
    icon: 'policy',
    headerToneClasses: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
  },
  dailyalgo: {
    icon: 'terminal',
    headerToneClasses: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
  },
  traduction: {
    icon: 'translate',
    headerToneClasses: 'bg-sky-500/10 text-sky-600 border-sky-500/20'
  },
  personnalise: {
    icon: 'extension',
    headerToneClasses: 'bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/20'
  },
  fun: {
    icon: 'smile',
    headerToneClasses: 'bg-amber-500/10 text-amber-600 border-amber-500/20'
  }
};

const DEFAULT_META = {
  icon: 'extension',
  headerToneClasses: 'bg-primary/10 text-primary border-primary/20'
};

export function getModuleMeta(moduleId) {
  return MODULE_META[moduleId] || DEFAULT_META;
}

export function getModuleIcon(moduleId) {
  return getModuleMeta(moduleId).icon;
}
