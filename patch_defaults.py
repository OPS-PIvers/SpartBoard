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
