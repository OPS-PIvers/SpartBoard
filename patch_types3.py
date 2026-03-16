import re

with open("types.ts", "r") as f:
    content = f.read()

new_interfaces = """
export interface OrganizerNode {
  id: string;
  text: string;
}

export interface GraphicOrganizerConfig {
  templateType: 'frayer' | 't-chart' | 'venn' | 'kwl' | 'cause-effect';
  nodes: Record<string, OrganizerNode>;
  fontFamily?: GlobalFontFamily;
}
"""
content = re.sub(
    r"(export interface MusicConfig {[\s\S]*?})",
    r"\1\n" + new_interfaces,
    content
)

# Add to WidgetType
if "  | 'graphic-organizer';" not in content:
    content = re.sub(
        r"(\s*\| 'specialist-schedule');",
        r"\1\n  | 'graphic-organizer';",
        content
    )

# Add to WidgetConfig union
if "  | GraphicOrganizerConfig;" not in content:
    content = re.sub(
        r"(\s*\| SpecialistScheduleConfig);",
        r"\1\n  | GraphicOrganizerConfig;",
        content
    )

# Add to ConfigForWidget
if "  : T extends 'graphic-organizer'" not in content:
    content = re.sub(
        r"(\s*\? SpecialistScheduleConfig\n\s*: never;)",
        r"\n                                                                                    : T extends 'graphic-organizer'\n                                                                                      ? GraphicOrganizerConfig\1",
        content
    )

with open("types.ts", "w") as f:
    f.write(content)
