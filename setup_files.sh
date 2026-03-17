# Types
cat << 'TYPES_EOF' > patch_types.py
import re

with open("types.ts", "r") as f:
    content = f.read()

starter_pack_types = """
export interface StarterPack {
  id: string;
  name: string;
  description?: string;
  icon: string; // Lucide icon key
  color: string; // Tailwind color class
  gradeLevels: string[]; // e.g., ["K", "1", "2"]
  isLocked: boolean; // Teachers cannot edit/delete
  widgets: Omit<WidgetData, 'id'>[]; // The snapshot of widget states
}

export type BuildingStarterPack = StarterPack;
export type UserStarterPack = StarterPack;

export type StarterPackConfig = Record<string, never>;
"""

content = content.replace("export interface OnboardingConfig {", starter_pack_types + "\nexport interface OnboardingConfig {")
content = content.replace("  | 'hotspot-image';", "  | 'hotspot-image'\n  | 'starter-pack';")
content = content.replace("  | HotspotImageConfig;", "  | HotspotImageConfig\n  | StarterPackConfig;")
content = content.replace("                                                                                                ? HotspotImageConfig", "                                                                                                ? HotspotImageConfig\n                                                                                                : T extends 'starter-pack'\n                                                                                                  ? StarterPackConfig")

with open("types.ts", "w") as f:
    f.write(content)
TYPES_EOF
python3 patch_types.py

# Registry
sed -i 's|hotspot-image.: lazyNamed(|hotspot-image.: lazyNamed(\n    () => import('"'"'./HotspotImage'"'"'),\n    '"'"'HotspotImageWidget'"'"'\n  ),\n  '"'"'starter-pack'"'"': lazyNamed(\n    () => import('"'"'./StarterPack/Widget'"'"'),\n    '"'"'StarterPackWidget'"'"'\n  ),|g' components/widgets/WidgetRegistry.ts

sed -i 's|hotspot-image.: lazyNamed(|hotspot-image.: lazyNamed(\n    () => import('"'"'./HotspotImage'"'"'),\n    '"'"'HotspotImageSettings'"'"'\n  ),\n  '"'"'starter-pack'"'"': lazyNamed(\n    () => import('"'"'./StarterPack/Settings'"'"'),\n    '"'"'StarterPackSettings'"'"'\n  ),|g' components/widgets/WidgetRegistry.ts

cat << 'REG_EOF' > patch_reg.py
import re

with open("components/widgets/WidgetRegistry.ts", "r") as f:
    content = f.read()

content = content.replace("""  'hotspot-image': {
    baseWidth: 500,
    baseHeight: 400,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
};""", """  'hotspot-image': {
    baseWidth: 500,
    baseHeight: 400,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'starter-pack': {
    baseWidth: 600,
    baseHeight: 500,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
};""")

with open("components/widgets/WidgetRegistry.ts", "w") as f:
    f.write(content)
REG_EOF
python3 patch_reg.py

# Defaults
cat << 'DEFAULTS_EOF' > patch_defaults.py
import re

with open("config/widgetDefaults.ts", "r") as f:
    content = f.read()

content = content.replace("""  'hotspot-image': {
    w: 6,
    h: 5,
    config: {
      baseImageUrl: '',
      hotspots: [],
      popoverTheme: 'light',
    },
  },
};""", """  'hotspot-image': {
    w: 6,
    h: 5,
    config: {
      baseImageUrl: '',
      hotspots: [],
      popoverTheme: 'light',
    },
  },
  'starter-pack': {
    w: 600,
    h: 500,
    config: {},
  },
};""")

with open("config/widgetDefaults.ts", "w") as f:
    f.write(content)
DEFAULTS_EOF
python3 patch_defaults.py

# Tools
cat << 'TOOLS_EOF' > patch_tools.py
import re

with open("config/tools.ts", "r") as f:
    content = f.read()

content = content.replace("""  {
    type: 'hotspot-image',
    icon: MapPin,
    label: 'Hotspot Image',
    color: 'bg-emerald-500',
  },
];""", """  {
    type: 'hotspot-image',
    icon: MapPin,
    label: 'Hotspot Image',
    color: 'bg-emerald-500',
  },
  {
    type: 'starter-pack',
    icon: Wand2,
    label: 'Starter Packs',
    color: 'bg-indigo-600',
  },
];""")

with open("config/tools.ts", "w") as f:
    f.write(content)
TOOLS_EOF
python3 patch_tools.py

# Widget Helpers
cat << 'HELPERS_EOF' > patch_helpers.py
import re

with open("utils/widgetHelpers.ts", "r") as f:
    content = f.read()

content = content.replace("""  if (widget.type === 'quiz') {
    const cfg = widget.config as QuizConfig;
    return cfg.selectedQuizTitle ? `Quiz: ${cfg.selectedQuizTitle}` : 'Quiz';
  }
  return widget.type.charAt(0).toUpperCase() + widget.type.slice(1);""", """  if (widget.type === 'quiz') {
    const cfg = widget.config as QuizConfig;
    return cfg.selectedQuizTitle ? `Quiz: ${cfg.selectedQuizTitle}` : 'Quiz';
  }
  if (widget.type === 'starter-pack') return 'Starter Pack';
  return widget.type.charAt(0).toUpperCase() + widget.type.slice(1);""")

content = content.replace("""export const getDefaultWidgetConfig = (type: WidgetType): WidgetConfig => {
  const config = WIDGET_DEFAULTS[type].config ?? {};
  return structuredClone(config);
};""", """export const getDefaultWidgetConfig = (type: WidgetType): WidgetConfig => {
  const config = WIDGET_DEFAULTS[type].config ?? {};
  return structuredClone(config);
};

export const createBoardSnapshot = (widgets: WidgetData[]): Omit<WidgetData, 'id'>[] => {
  return widgets.map((w) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...rest } = w;
    return {
      ...rest,
      config: structuredClone(rest.config),
    };
  });
};""")

with open("utils/widgetHelpers.ts", "w") as f:
    f.write(content)
HELPERS_EOF
python3 patch_helpers.py

# Rules
cat << 'RULES_EOF' > patch_rules.py
import re

with open("firestore.rules", "r") as f:
    content = f.read()

content = content.replace("""    // Admin-only collections
    match /admin_settings/{document=**} {""", """    // Starter Packs
    match /artifacts/{appId}/public/data/starterPacks/{packId} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
    match /artifacts/{appId}/users/{userId}/starterPacks/{packId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Admin-only collections
    match /admin_settings/{document=**} {""")

with open("firestore.rules", "w") as f:
    f.write(content)
RULES_EOF
python3 patch_rules.py
