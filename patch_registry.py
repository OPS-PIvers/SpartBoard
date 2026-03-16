import re

with open("components/widgets/WidgetRegistry.ts", "r") as f:
    content = f.read()

content = content.replace(
    "  'graphic-organizer': {\n    baseWidth: 600,\n    baseHeight: 400,\n    canSpread: true,\n  },\n};",
    "  'graphic-organizer': {\n    baseWidth: 600,\n    baseHeight: 400,\n    canSpread: true,\n    skipScaling: true,\n    padding: 0,\n  },\n};"
)

with open("components/widgets/WidgetRegistry.ts", "w") as f:
    f.write(content)
