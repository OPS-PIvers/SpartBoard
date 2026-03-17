import re

with open("config/widgetGradeLevels.ts", "r") as f:
    content = f.read()

content = content.replace("  'hotspot-image': ALL_GRADE_LEVELS,", "  'hotspot-image': ALL_GRADE_LEVELS,\n  'starter-pack': ALL_GRADE_LEVELS,")

with open("config/widgetGradeLevels.ts", "w") as f:
    f.write(content)
