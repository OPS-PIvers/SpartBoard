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
