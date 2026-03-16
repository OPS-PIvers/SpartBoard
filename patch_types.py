import re

with open("types.ts", "r") as f:
    content = f.read()

content = content.replace("  bgColor?: string;\n", "")

with open("types.ts", "w") as f:
    f.write(content)
