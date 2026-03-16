import re

with open("types.ts", "r") as f:
    content = f.read()

content = content.replace(
    "export interface OrganizerNode {\n  id: string;\n  text: string;\n  bgColor?: string;\n}",
    "export interface OrganizerNode {\n  id: string;\n  text: string;\n}"
)

with open("types.ts", "w") as f:
    f.write(content)
