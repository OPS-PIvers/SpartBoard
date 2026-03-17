import re

with open("components/widgets/WidgetRegistry.ts", "r") as f:
    content = f.read()

# Fix syntax errors resulting from bad sed replacement
content = re.sub(r"'hotspot-image': lazyNamed\([^)]+\),\n\s+'hotspot-image'", "'hotspot-image'", content)
# Just clean it up by replacing the mess with the correct string
content = re.sub(r"'hotspot-image'\.: lazyNamed\([^)]+\),\n\s+'StarterPackWidget'\n\s+\),", "'starter-pack': lazyNamed(() => import('./StarterPack/Widget'), 'StarterPackWidget'),", content)

with open("components/widgets/WidgetRegistry.ts", "w") as f:
    f.write(content)
