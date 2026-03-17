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
